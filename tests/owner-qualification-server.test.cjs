// Local-only: exact new entrypoint + unchanged runtime, real signed synthetic
// Access identities and real in-memory SQLite/schema/history. No live services.
const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { fixture, track } = require('./helpers/server-owner-harness.cjs');
const source = import(pathToFileURL(path.resolve(__dirname, '../worker-owner-qualification.js')).href);
const RUN_HEADER = 'x-mancardo-qualification-run';
const ACTION_HEADER = 'x-mancardo-qualification-action';
const OWNER_HEADER = 'x-mancardo-qualification-owner';

async function setup(t) {
  const f = await fixture(t), module = await source;
  const env = { ...f.env, MANCARDO_QUALIFICATION_RUN: module.QUALIFICATION_RUN,
    MANCARDO_QUALIFICATION_ACCOUNT_A: f.accountKeys.a, MANCARDO_QUALIFICATION_ACCOUNT_B: f.accountKeys.b };
  const calls = [];
  const ctx = { waitUntil() { throw new Error('No background work is permitted'); } };
  async function request(owner, target, options = {}) {
    const headers = new Headers(options.headers);
    const token = Object.hasOwn(options, 'token') ? options.token : f.tokens[owner];
    if (token != null) headers.set('Cf-Access-Jwt-Assertion', token);
    if (options.body !== undefined) headers.set('content-type', 'application/json');
    const init = { method: options.method || 'GET', headers };
    if (options.body !== undefined) init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    const url = (options.origin || module.QUALIFICATION_ORIGIN) + target;
    calls.push({ url, method: init.method });
    const response = await module.default.fetch(new Request(url, init), options.env || env, ctx);
    const text = await response.text();
    return { status: response.status, headers: response.headers, text,
      body: (response.headers.get('content-type') || '').includes('application/json') ? JSON.parse(text) : null };
  }
  function plan(owner, action) {
    const target = action === 'read-own' || action === 'create-own' ? owner : owner === 'a' ? 'b' : 'a';
    const method = action.startsWith('read-') ? 'GET' : action === 'foreign-delete' ? 'DELETE' : 'PUT';
    return { target: '/api/private-library/tracks/' + module.qualificationTrack(target).id, options: {
      method, headers: { [RUN_HEADER]: module.QUALIFICATION_RUN, [ACTION_HEADER]: action,
        [OWNER_HEADER]: f.accountKeys[owner], [method === 'DELETE' ? 'x-mancardo-delete-account' : 'x-mancardo-private-account']: f.accountKeys[owner],
        ...(method === 'GET' ? {} : { origin: module.QUALIFICATION_ORIGIN }) },
      ...(method === 'GET' ? {} : { body: module.qualificationBody(owner, action) }),
    } };
  }
  async function action(owner, action) { const p = plan(owner, action); return request(owner, p.target, p.options); }
  return { f, module, env, request, plan, action, calls };
}
function expect(result, status, code) {
  assert.equal(result.status, status, result.text);
  if (code) assert.equal(result.body.code, code);
  return result.body;
}
async function seedBoth(s) {
  for (const owner of ['a', 'b']) {
    const created = expect(await s.action(owner, 'create-own'), 201);
    assert.equal(created.revision, 1);
    const own = expect(await s.action(owner, 'read-own'), 200);
    assert.deepEqual(own.track, s.module.qualificationTrack(owner));
    assert.equal(own.sha256, created.sha256);
  }
}

test('new dormant outer ownership entrypoint (actual signed-JWT/SQLite execution)', { concurrency: false }, async t => {
  await t.test('the exact page bypasses every editor/asset transform and uses strict no-store CSP', async t => {
    const s = await setup(t), before = s.f.snapshot();
    const page = await s.request('a', s.module.QUALIFICATION_PATH);
    expect(page, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.match(page.headers.get('content-security-policy'), /connect-src 'self'/);
    assert.equal((page.text.match(/<script\b/g) || []).length, 2, 'Exactly inert config plus reviewed client, no legacy injections');
    assert.doesNotMatch(page.text, /mancardo-stable-note-ui|mancardo-explicit-delete|leaflet|localStorage|indexedDB|setInterval|setTimeout|serviceWorker|document\.cookie/);
    const config = JSON.parse(page.text.match(/id="configuration"[^>]*>(.*?)<\/script>/s)[1]);
    assert.equal(config.role, 'a');
    assert.equal(config.accountKey, s.f.accountKeys.a);
    assert.ok(!page.text.includes(s.f.accountKeys.b), 'Do not emit another owner key');
    for (const entry of Object.values(config.actions)) assert.match(entry.path, /^\/api\/private-library\/tracks\/qual_owner_/);
    assert.deepEqual(s.f.snapshot(), before);
  });

  await t.test('identity label is JSON-escaped rather than injected into HTML', async t => {
    const s = await setup(t);
    const label = '</script><img src=x onerror=alert(1)>\u2028';
    const page = await s.request('a', s.module.QUALIFICATION_PATH, { token: s.f.token('a', { email: label }) });
    expect(page, 200);
    assert.ok(!page.text.includes(label));
    const config = JSON.parse(page.text.match(/id="configuration"[^>]*>(.*?)<\/script>/s)[1]);
    assert.equal(config.accountLabel, label);
    assert.equal((page.text.match(/<script\b/g) || []).length, 2);
  });

  await t.test('missing, malformed, same-owner, or wrong-run configuration is dormant with no rows/history changed', async t => {
    const s = await setup(t), before = s.f.snapshot();
    const variants = [
      { MANCARDO_QUALIFICATION_RUN: undefined }, { MANCARDO_QUALIFICATION_RUN: 'other-run' },
      { MANCARDO_QUALIFICATION_ACCOUNT_A: undefined }, { MANCARDO_QUALIFICATION_ACCOUNT_A: 'A'.repeat(24) },
      { MANCARDO_QUALIFICATION_ACCOUNT_B: s.f.accountKeys.a }, { MANCARDO_QUALIFICATION_ACCOUNT_B: ' '+s.f.accountKeys.b },
    ];
    for (const delta of variants) {
      const env = { ...s.env, ...delta };
      expect(await s.request('a', s.module.QUALIFICATION_PATH, { env }), 404, 'qualification_unavailable');
      const p = s.plan('a', 'create-own');
      expect(await s.request('a', p.target, { ...p.options, env }), 404, 'qualification_unavailable');
    }
    assert.deepEqual(s.f.snapshot(), before);
  });

  await t.test('wrong origin/query/page method never serves or mutates through the diagnostic route', async t => {
    const s = await setup(t), before = s.f.snapshot();
    for (const origin of ['https://production.fixture.invalid', 'http://mancardo-dev-test.jayfenno.workers.dev', s.module.QUALIFICATION_ORIGIN+':8443'])
      expect(await s.request('a', s.module.QUALIFICATION_PATH, { origin }), 404, 'qualification_unavailable');
    expect(await s.request('a', s.module.QUALIFICATION_PATH+'?anything=1'), 404, 'qualification_unavailable');
    expect(await s.request('a', s.module.QUALIFICATION_PATH, { method: 'POST' }), 405, 'qualification_method');
    assert.deepEqual(s.f.snapshot(), before);
  });

  await t.test('missing, invalid, expired and signed-but-unapproved identities cannot enter the page or mutate', async t => {
    const s = await setup(t), before = s.f.snapshot();
    for (const token of [null, 'not-a-jwt', s.f.token('a', { exp: 1 }), s.f.token('a', { sub: 'unapproved-synthetic-owner' })]) {
      expect(await s.request('a', s.module.QUALIFICATION_PATH, { token }), 403, 'qualification_identity');
      const p = s.plan('a', 'create-own');
      expect(await s.request('a', p.target, { ...p.options, token }), 403, 'qualification_identity');
    }
    assert.deepEqual(s.f.snapshot(), before);
  });

  await t.test('partial/unknown marker headers do not fall through to ordinary API writes', async t => {
    const s = await setup(t), before = s.f.snapshot(), p = s.plan('a', 'create-own');
    for (const headers of [
      { [RUN_HEADER]: 'unknown-run' }, { [RUN_HEADER]: '' }, { [ACTION_HEADER]: 'create-own' },
      { [OWNER_HEADER]: s.f.accountKeys.a }, { ...p.options.headers, [ACTION_HEADER]: 'arbitrary-action' },
    ]) {
      const result = await s.request('a', p.target, { ...p.options, headers });
      assert.ok([400, 409].includes(result.status), result.text);
    }
    assert.deepEqual(s.f.snapshot(), before);
  });

  await t.test('both explicit rightful-owner creates and exact reads use the unchanged actual handler', async t => {
    const s = await setup(t);
    await seedBoth(s);
    assert.equal(s.f.snapshot().rows.length, 2);
    assert.equal(s.f.snapshot().history.length, 2);
    for (const owner of ['a', 'b']) expect(await s.action(owner, 'read-foreign'), 404, 'not_found');
  });

  await t.test('four foreign mutations reject with current:null and no changes to either owner/history', async t => {
    const s = await setup(t); await seedBoth(s); const before = s.f.snapshot();
    for (const owner of ['a', 'b']) for (const action of ['foreign-put', 'foreign-delete']) {
      const result = expect(await s.action(owner, action), 409, 'revision_conflict');
      assert.equal(result.current, null);
      assert.deepEqual(s.f.snapshot(), before);
      const own = expect(await s.action(owner, 'read-own'), 200);
      assert.equal(own.revision, 1); assert.equal(own.deleted, false);
      assert.deepEqual(own.track, s.module.qualificationTrack(owner));
      expect(await s.action(owner, 'read-foreign'), 404, 'not_found');
    }
  });

  await t.test('arbitrary IDs, query parameters, methods, revisions, bodies and extra properties reject before mutation', async t => {
    const s = await setup(t); await seedBoth(s); const before = s.f.snapshot();
    const p = s.plan('a', 'foreign-put');
    const variants = [
      { target: '/api/private-library/tracks/unrelated-track' }, { target: p.target+'?since=0' },
      { target: '/api/private-library/tracks' }, { options: { method: 'POST' } },
      { options: { body: { ...p.options.body, base_revision: 0 } } },
      { options: { body: { ...p.options.body, base_revision: '1' } } },
      { options: { body: { ...p.options.body, extra: 'forbidden' } } },
      { options: { body: { ...p.options.body, track: track('unrelated', 'Never allowed') } } },
      { options: { body: '{' } }, { options: { body: 'x'.repeat(5000) } },
    ];
    for (const v of variants) {
      const result = await s.request('a', v.target || p.target, { ...p.options, ...v.options });
      assert.ok([400, 404, 503].includes(result.status), result.text);
      assert.deepEqual(s.f.snapshot(), before);
    }
  });

  await t.test('wrong/missing Origin or owner binding stops every marked mutation', async t => {
    const s = await setup(t); await seedBoth(s); const before = s.f.snapshot();
    for (const action of ['foreign-put', 'foreign-delete']) {
      const p = s.plan('a', action), ownerHeader = action === 'foreign-delete' ? 'x-mancardo-delete-account' : 'x-mancardo-private-account';
      for (const [key, value] of [['origin', null], ['origin', 'https://foreign.fixture.invalid'], [OWNER_HEADER, s.f.accountKeys.b], [ownerHeader, s.f.accountKeys.b], [ownerHeader, null]]) {
        const headers = { ...p.options.headers }; if (value === null) delete headers[key]; else headers[key] = value;
        const result = await s.request('a', p.target, { ...p.options, headers });
        assert.ok([403, 409].includes(result.status), result.text);
        assert.deepEqual(s.f.snapshot(), before);
      }
    }
  });

  await t.test('A-initialized page cannot change role when the signed session changes to B', async t => {
    const s = await setup(t); await seedBoth(s); const before = s.f.snapshot();
    for (const action of ['foreign-put', 'foreign-delete']) {
      const p = s.plan('a', action);
      expect(await s.request('b', p.target, p.options), 409, 'qualification_account_changed');
      assert.deepEqual(s.f.snapshot(), before);
    }
  });

  await t.test('missing or changed rightful-owner baseline prevents probes; creation never overwrites a collision', async t => {
    const s = await setup(t);
    expect(await s.action('a', 'foreign-put'), 409, 'qualification_positive_control');
    assert.equal(s.f.snapshot().rows.length, 0);
    await seedBoth(s);
    const before = s.f.snapshot();
    expect(await s.action('a', 'create-own'), 409, 'qualification_existing_record');
    assert.deepEqual(s.f.snapshot(), before);
    const changed = { ...s.module.qualificationTrack('a'), note: 'Unexpected change' };
    expect(await s.f.put('a', changed, 1), 200);
    const afterChange = s.f.snapshot();
    expect(await s.action('a', 'foreign-delete'), 409, 'qualification_positive_control');
    assert.deepEqual(s.f.snapshot(), afterChange);
  });

  await t.test('an own-scope collision under the other fixed ID prevents all foreign mutations', async t => {
    const s = await setup(t); await seedBoth(s);
    expect(await s.f.put('a', s.module.qualificationTrack('b'), 0), 201);
    const before = s.f.snapshot();
    for (const action of ['foreign-put', 'foreign-delete']) expect(await s.action('a', action), 409, 'qualification_foreign_collision');
    assert.deepEqual(s.f.snapshot(), before);
  });

  await t.test('unmarked ordinary API calls retain the current runtime behavior, not a two-ID sandbox', async t => {
    const s = await setup(t), value = track('ordinary-synthetic-id', 'Ordinary API positive control');
    expect(await s.request('a', '/api/private-library/tracks/'+value.id, {
      method: 'PUT', headers: { 'x-mancardo-private-account': s.f.accountKeys.a },
      body: { base_revision: 0, track: value, device_id: 'synthetic-ordinary-control' },
    }), 201);
    assert.deepEqual(expect(await s.request('a', '/api/private-library/tracks/'+value.id), 200).track, value);
    expect(await s.request('b', '/api/private-library/tracks/'+value.id), 404, 'not_found');
  });
});
