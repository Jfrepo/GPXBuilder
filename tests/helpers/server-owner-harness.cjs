// Local-only integration fixture: actual Worker modules + real SQLite SQL,
// schema constraints and history triggers. Only the D1 transport shape and the
// Access JWKS network response are adapted. No ownership/auth logic is mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash, generateKeyPairSync, randomUUID, sign } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '../..');
const endpoint = 'https://mancardo-owner-fixture.invalid/api/private-library';
const schema = fs.readFileSync(path.join(root, 'migrations/0001_private_library.sql'), 'utf8');
// These ephemeral keys and identities exist only in this test process. They are
// not Cloudflare credentials and cannot authenticate to any live deployment.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const kid = 'local-owner-isolation-test-key';
const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
const identities = {
  a: { sub: 'local-test-owner-a', email: 'owner-a@fixture.invalid' },
  b: { sub: 'local-test-owner-b', email: 'owner-b@fixture.invalid' },
};
const jsonClone = value => JSON.parse(JSON.stringify(value));
const contentHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function track(id, name) {
  return { id, name, type: 'track', segments: [[{ lat: 51.5, lon: -0.12 }, { lat: 51.501, lon: -0.121 }]] };
}

// This adapter executes the unmodified SQL and bound arguments. It does not
// parse SQL, filter rows by owner, implement revisions, or synthesize results.
function d1Binding(sqlite) {
  return {
    prepare(sql) {
      function statement(values) {
        return {
          bind(...args) { return statement(args); },
          async first(column) {
            const row = sqlite.prepare(sql).get(...values);
            return row ? (column === undefined ? jsonClone(row) : row[column]) : null;
          },
          async all() {
            return { success: true, results: jsonClone(sqlite.prepare(sql).all(...values)) };
          },
          async run() {
            const result = sqlite.prepare(sql).run(...values);
            return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
          },
        };
      }
      return statement([]);
    },
  };
}

async function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(schema);
  // A distinct issuer prevents the real Worker's JWKS cache carrying a key
  // response between fixtures or hiding whether each fixture supplied its key.
  const issuer = 'https://access-' + randomUUID() + '.fixture.invalid';
  const audience = 'local-owner-isolation-audience';
  const externalRequests = [];
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = options.method || (input instanceof Request ? input.method : 'GET');
    externalRequests.push({ url, method });
    // Never fall back to the real fetch, even on unexpected requests.
    assert.equal(url, issuer + '/cdn-cgi/access/certs', 'Only the local JWKS fixture may be fetched');
    assert.equal(method, 'GET');
    return Response.json({ keys: [jwk] });
  });
  t.after(() => {
    assert.ok(externalRequests.length > 0, 'The actual verifier must request the local JWKS');
    assert.ok(externalRequests.every(request => request.url === issuer + '/cdn-cgi/access/certs' && request.method === 'GET'),
      'All network requests must remain inside the synthetic JWKS fixture');
  });
  const worker = (await import(pathToFileURL(process.env.MANCARDO_DELETE_TEST_ENTRY || path.join(root, 'worker-delete-durable-fix.js')).href)).default;
  const env = {
    PRIVATE_LIBRARY_DB: d1Binding(sqlite),
    CF_ACCESS_TEAM_DOMAIN: issuer,
    CF_ACCESS_AUD: audience,
    ASSETS: { async fetch() { throw new Error('API ownership tests must not reach ASSETS'); } },
  };
  const ctx = { waitUntil() { throw new Error('API ownership tests must not start background work'); } };
  function token(owner, claims = {}, header = {}) {
    const now = Math.floor(Date.now() / 1000);
    const parts = [
      { alg: 'RS256', kid, typ: 'JWT', ...header },
      { iss: issuer, aud: [audience], exp: now + 3600, nbf: now - 60, ...identities[owner], ...claims },
    ].map(part => Buffer.from(JSON.stringify(part)).toString('base64url'));
    return parts.join('.') + '.' + sign('RSA-SHA256', Buffer.from(parts.join('.')), privateKey).toString('base64url');
  }
  const tokens = { a: token('a'), b: token('b') };
  async function request(owner, route, options = {}) {
    const headers = new Headers(options.headers || {});
    const jwt = Object.hasOwn(options, 'token') ? options.token : tokens[owner];
    if (jwt != null) headers.set('Cf-Access-Jwt-Assertion', jwt);
    if (options.body !== undefined) headers.set('content-type', 'application/json');
    const response = await worker.fetch(new Request(endpoint + route, {
      method: options.method || 'GET', headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    }), options.env || env, ctx);
    assert.match(response.headers.get('content-type') || '', /application\/json/);
    return { status: response.status, body: await response.json() };
  }
  const accountKeys = {};
  // Positive controls: derive private-account/delete headers through the signed
  // health path, then verify its expected identity binding independently.
  for (const owner of ['a', 'b']) {
    const health = await request(owner, '/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.authenticated, true);
    assert.equal(health.body.storageReady, true);
    assert.equal(health.body.schemaReady, true);
    assert.equal(health.body.accountKey, createHash('sha256').update(identities[owner].sub).digest('hex').slice(0, 24));
    accountKeys[owner] = health.body.accountKey;
  }
  assert.notEqual(accountKeys.a, accountKeys.b);
  return {
    env, request, token, tokens, accountKeys,
    put(owner, value, revision = 0, extras = {}) {
      return request(owner, '/tracks/' + encodeURIComponent(value.id), {
        method: 'PUT', headers: { 'x-mancardo-private-account': accountKeys[owner] },
        body: { base_revision: revision, track: value, device_id: 'local-device-' + owner, ...extras },
      });
    },
    remove(owner, id, revision) {
      return request(owner, '/tracks/' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: { 'x-mancardo-delete-account': accountKeys[owner] },
        body: { base_revision: revision, device_id: 'local-device-' + owner, authorized_user_delete: true, delete_intent: 'explicit-ui-delete' },
      });
    },
    snapshot(owner) {
      const where = owner ? ' WHERE owner_id = ?' : '';
      const args = owner ? [identities[owner].sub] : [];
      return jsonClone({
        rows: sqlite.prepare('SELECT * FROM private_library_tracks' + where + ' ORDER BY owner_id, track_id').all(...args),
        history: sqlite.prepare('SELECT * FROM private_library_revisions' + where + ' ORDER BY owner_id, track_id, revision').all(...args),
      });
    },
  };
}

module.exports = { fixture, track, contentHash };
