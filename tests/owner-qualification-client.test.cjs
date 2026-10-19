// Local-only tests of the exact standalone HTML/client emitted by the candidate
// Worker. Standard Node modules only: actual JWT verification + SQLite are used
// to render it; DOM/network adapters below test the client without a browser.
// No live account, service, credentials, storage, or deployment is accessed.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { fixture: serverFixture } = require('./helpers/server-owner-harness.cjs');

const ROOT = path.resolve(__dirname, '..');
const IDS = { a: 'qual_owner_20261018_1032_a_7c9f2d', b: 'qual_owner_20261018_1032_b_f62e81' };
const RUN = 'owner-isolation-20261018-1032';
const ACTIONS = ['read', 'create-own', 'foreign-put', 'foreign-delete'];
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function expectedTrack(role, overwrite = false) {
  return { id: IDS[role], name: 'DOT-OWNER-QUAL-20261018-' + role.toUpperCase(), type: 'track',
    segments: [[{ lat: 0, lon: 0 }, { lat: 0.001, lon: 0.001 }, { lat: 0.002, lon: 0.0015 }]],
    note: overwrite ? 'Rejected foreign overwrite probe' : 'Disposable owner ' + role.toUpperCase() + ' baseline', visible: false };
}
function row(config) {
  return { track_id: config.baseline.id, revision: 1, deleted: false, track: clone(config.baseline), sha256: hash(config.baseline) };
}
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

async function emitted(t, role = 'a', label) {
  const server = await serverFixture(t);
  const candidate = await import(pathToFileURL(path.join(ROOT, 'worker-owner-qualification.js')).href);
  const env = { ...server.env, MANCARDO_QUALIFICATION_RUN: candidate.QUALIFICATION_RUN,
    MANCARDO_QUALIFICATION_ACCOUNT_A: server.accountKeys.a, MANCARDO_QUALIFICATION_ACCOUNT_B: server.accountKeys.b };
  const token = label === undefined ? server.tokens[role] : server.token(role, { email: label });
  const response = await candidate.default.fetch(new Request(candidate.QUALIFICATION_ORIGIN + candidate.QUALIFICATION_PATH,
    { headers: { 'Cf-Access-Jwt-Assertion': token } }), env, { waitUntil() { assert.fail('No rendering background work'); } });
  assert.equal(response.status, 200);
  const html = await response.text();
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 2, 'Only inert configuration and the standalone client may be emitted');
  const configScript = scripts.find(parts => /id="configuration"/.test(parts[1]));
  const executable = scripts.filter(parts => !/type="application\/json"/.test(parts[1]));
  assert.equal(executable.length, 1);
  return { html, configText: configScript[2], config: JSON.parse(configScript[2]), script: executable[0][2], headers: response.headers, server };
}

function client(emission, options = {}) {
  const calls = [], confirmations = [], forbidden = [];
  const nodes = new Map();
  function node(text = '') {
    let content = text;
    return { disabled: false, dataset: {}, listeners: {},
      get textContent() { return content; }, set textContent(value) { content = String(value); },
      set innerHTML(_) { forbidden.push('innerHTML'); throw new Error('Unsafe HTML write'); },
      addEventListener(type, fn) { this.listeners[type] = fn; } };
  }
  for (const match of emission.html.matchAll(/\bid="([^"]+)"/g)) nodes.set(match[1], node());
  nodes.get('configuration').textContent = emission.configText;
  const buttons = [...emission.html.matchAll(/<button\b[^>]*data-action="([^"]+)"[^>]*>/g)].map(match => {
    const button = node(); button.dataset.action = match[1]; return button;
  });
  assert.deepEqual(buttons.map(button => button.dataset.action), ACTIONS);
  const config = emission.config;
  const context = {
    document: { getElementById: id => nodes.get(id), querySelectorAll: selector => {
      assert.equal(selector, 'button[data-action]'); return buttons;
    } },
    confirm(message) { confirmations.push(message); return options.confirm !== false; },
    async fetch(url, init) {
      const call = { url, ...clone(init), body: init.body === undefined ? undefined : JSON.parse(init.body) };
      calls.push(call);
      if (options.respond) return options.respond(call, calls.length);
      const action = init.headers['x-mancardo-qualification-action'];
      if (action === 'read-own') return json(row(config));
      if (action === 'read-foreign') return json({ code: 'not_found' }, 404);
      if (action === 'create-own') return json(row(config), 201);
      return json({ code: 'revision_conflict', current: null }, 409);
    },
  };
  context.window = context;
  for (const name of ['localStorage', 'sessionStorage', 'indexedDB', 'caches', 'navigator', 'location', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker']) {
    Object.defineProperty(context, name, { get() { forbidden.push(name); throw new Error('Forbidden access: ' + name); } });
  }
  for (const name of ['setTimeout', 'setInterval', 'requestAnimationFrame']) context[name] = () => {
    forbidden.push(name); throw new Error('No scheduling: ' + name);
  };
  vm.createContext(context);
  new vm.Script(emission.script, { filename: 'emitted-owner-qualification-client.js' }).runInContext(context);
  return {
    calls, confirmations, forbidden, options, nodes, buttons, context,
    click(action) { return buttons.find(button => button.dataset.action === action).listeners.click(); },
    button(action) { return buttons.find(button => button.dataset.action === action); },
    status() { return nodes.get('status').textContent; },
    receipts() { return nodes.get('results').textContent ? JSON.parse(nodes.get('results').textContent).receipts : []; },
    assertNoPass() { assert.doesNotMatch(nodes.get('status').textContent, /\bPASS(?:ED)?\b/i); },
    assertStopped() {
      assert.match(this.status(), /^STOP\./);
      for (const action of ACTIONS.filter(action => action !== 'read')) assert.equal(this.button(action).disabled, true);
      assert.equal(this.button('read').disabled, false);
      this.assertNoPass();
    },
  };
}

test('standalone qualification client (synthetic DOM and I/O)', { concurrency: false }, async t => {
  await t.test('signed identity is rendered as text; loading has no I/O, storage, scheduling or editor boot', async t => {
    const label = 'Synthetic </script><img src=x onerror="window.pwned=true">\u2028\u2029 participant';
    const e = await emitted(t, 'a', label), f = client(e);
    await tick();
    assert.equal(e.config.accountLabel, label);
    assert.equal(e.config.accountKey, e.server.accountKeys.a);
    assert.equal(e.config.role, 'a');
    assert.equal(f.nodes.get('identity').textContent, label + ' | fixed role A');
    assert.equal(f.context.pwned, undefined);
    assert.ok(!e.configText.includes('<') && !e.configText.includes('\u2028') && !e.configText.includes('\u2029'));
    assert.doesNotMatch(e.html, /installMancardo|mapDiv|<iframe|<form|<input|<script[^>]*src=/i);
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.confirmations, []);
    assert.deepEqual(f.forbidden, []);
    assert.equal(e.headers.get('cache-control'), 'no-store');
    assert.equal(e.headers.get('referrer-policy'), 'no-referrer');
    assert.match(e.headers.get('content-security-policy'), /default-src 'none'; script-src 'nonce-[a-f0-9]+'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'/);
    f.assertNoPass();
  });

  for (const role of ['a', 'b']) await t.test(role.toUpperCase() + ' sends only exact synthetic create/read/foreign-write paths, bodies and owner headers', async t => {
    const e = await emitted(t, role), f = client(e), foreign = role === 'a' ? 'b' : 'a';
    assert.equal(e.config.run, RUN);
    assert.deepEqual(e.config.baseline, expectedTrack(role));
    assert.equal(e.config.baselineHash, hash(expectedTrack(role)));
    assert.equal(e.config.foreignId, IDS[foreign]);
    for (const action of ['create-own', 'read', 'foreign-put', 'foreign-delete', 'read']) await f.click(action);
    assert.deepEqual(f.calls.map(call => call.headers['x-mancardo-qualification-action']),
      ['create-own', 'read-own', 'read-foreign', 'foreign-put', 'foreign-delete', 'read-own', 'read-foreign']);
    for (const call of f.calls) {
      const action = call.headers['x-mancardo-qualification-action'];
      const targetRole = ['create-own', 'read-own'].includes(action) ? role : foreign;
      const method = action.startsWith('read-') ? 'GET' : action === 'foreign-delete' ? 'DELETE' : 'PUT';
      const ownerHeader = method === 'DELETE' ? 'x-mancardo-delete-account' : 'x-mancardo-private-account';
      assert.equal(call.url, '/api/private-library/tracks/' + IDS[targetRole]);
      assert.equal(call.method, method);
      assert.equal(call.credentials, 'same-origin');
      assert.equal(call.redirect, 'error');
      assert.equal(call.cache, 'no-store');
      assert.deepEqual(call.headers, { accept: 'application/json', 'x-mancardo-qualification-run': RUN,
        'x-mancardo-qualification-action': action, 'x-mancardo-qualification-owner': e.server.accountKeys[role],
        [ownerHeader]: e.server.accountKeys[role], ...(method === 'GET' ? {} : { 'content-type': 'application/json' }) });
      const device_id = 'disposable-' + RUN;
      const expected = action === 'create-own' ? { base_revision: 0, track: expectedTrack(role), device_id }
        : action === 'foreign-put' ? { base_revision: 1, track: expectedTrack(foreign, true), device_id }
        : action === 'foreign-delete' ? { base_revision: 1, device_id, authorized_user_delete: true, delete_intent: 'explicit-ui-delete' } : undefined;
      assert.deepEqual(call.body, expected);
    }
    assert.equal(f.confirmations.length, 3);
    assert.match(f.confirmations[2], /irreversible deletion.*protection defect could permanently delete/s);
    assert.equal(f.receipts().length, 7);
    assert.deepEqual(f.receipts().find(receipt => receipt.action === 'read-own').result.track, expectedTrack(role),
      'The configured exact synthetic positive-control payload remains available for comparison');
    assert.ok(!f.nodes.get('results').textContent.includes(e.config.accountKey), 'Exported receipts must not include the participant account key');
    assert.ok(!f.nodes.get('results').textContent.includes(e.config.accountLabel), 'Exported receipts must not include the participant label');
    f.assertNoPass();
    assert.deepEqual(f.forbidden, []);
  });

  await t.test('cancelling each mutation sends nothing and does not consume its one permitted attempt', async t => {
    const e = await emitted(t), f = client(e, { confirm: false });
    for (const action of ACTIONS.slice(1)) {
      await f.click(action);
      assert.equal(f.button(action).disabled, false);
    }
    assert.equal(f.calls.length, 0);
    assert.equal(f.receipts().length, 0);
    f.options.confirm = true;
    for (const action of ACTIONS.slice(1)) await f.click(action);
    assert.equal(f.calls.length, 3);
  });

  await t.test('in-flight operations block all overlap; completed mutation controls stay single-use even under direct event dispatch', async t => {
    const e = await emitted(t), held = deferred();
    const f = client(e, { respond: async () => { await held.promise; return json(row(e.config), 201); } });
    const first = f.click('create-own');
    for (let i = 0; i < 10; i++) for (const action of ACTIONS) await f.click(action);
    assert.equal(f.calls.length, 1);
    assert.equal(f.confirmations.length, 1);
    assert.ok(f.buttons.every(button => button.disabled));
    await tick();
    assert.equal(f.calls.length, 1, 'An unresolved fetch is not permission for a retry');
    assert.equal(f.receipts().length, 0, 'No success/receipt exists until a response is known');
    assert.doesNotMatch(f.status(), /returned the expected result|captured|\bPASS(?:ED)?\b/i);
    held.resolve(); await first;
    for (let i = 0; i < 10; i++) await f.click('create-own');
    assert.equal(f.calls.length, 1);
    assert.equal(f.button('create-own').disabled, true);
    assert.equal(f.button('read').disabled, false);
    assert.equal(f.button('foreign-put').disabled, false);
    assert.equal(f.button('foreign-delete').disabled, false);
  });

  const failures = [
    ['network outcome unknown', () => { throw new Error('synthetic transport failure'); }],
    ['non-JSON response', () => new Response('<html>synthetic sign-in</html>', { status: 200, headers: { 'content-type': 'text/html' } })],
    ['invalid JSON response', () => new Response('{', { status: 409, headers: { 'content-type': 'application/json' } })],
    ['unrelated 409 code', () => json({ code: 'qualification_account_changed', current: null }, 409)],
    ['missing positive control', () => json({ code: 'qualification_positive_control' }, 409)],
    ['conflict exposing a row', () => json({ code: 'revision_conflict', current: { revision: 1 } }, 409)],
    ['missing current:null', () => json({ code: 'revision_conflict' }, 409)],
    ['unexpected accepted write', () => json({ track_id: IDS.b, revision: 2 }, 200)],
    ['unexpected not found', () => json({ code: 'not_found' }, 404)],
    ['server failure', () => json({ code: 'qualification_unavailable' }, 503)],
  ];
  for (const [name, respond] of failures) await t.test(name + ' stops all mutations without retry and leaves only exact reads', async t => {
    const e = await emitted(t);
    let failWrite = true;
    const f = client(e, { respond(call) {
      if (call.method !== 'GET' && failWrite) return respond();
      return call.headers['x-mancardo-qualification-action'] === 'read-own' ? json(row(e.config)) : json({ code: 'not_found' }, 404);
    } });
    await f.click('foreign-put');
    f.assertStopped();
    for (let i = 0; i < 5; i++) for (const action of ACTIONS.slice(1)) await f.click(action);
    await tick();
    assert.equal(f.calls.length, 1, 'No repeat, alternate write, repair, cleanup, or background retry');
    assert.equal(f.confirmations.length, 1);
    failWrite = false;
    await f.click('read');
    assert.deepEqual(f.calls.map(call => call.method), ['PUT', 'GET', 'GET']);
    assert.deepEqual(f.calls.slice(1).map(call => call.url), [IDS.a, IDS.b].map(id => '/api/private-library/tracks/' + id));
    for (const action of ACTIONS.slice(1)) assert.equal(f.button(action).disabled, true);
    f.assertNoPass();
    assert.deepEqual(f.forbidden, []);
  });

  await t.test('missing own baseline is a receipt, never a positive-control PASS', async t => {
    const e = await emitted(t), f = client(e, { respond: () => json({ code: 'not_found' }, 404) });
    await f.click('read');
    assert.equal(f.calls.length, 2);
    assert.match(f.status(), /not a complete test result/i);
    f.assertNoPass();
  });

  for (const first of ['read', 'create-own']) await t.test('a positive control disappearing after ' + first + ' is STOP, not an uncreated record', async t => {
    const e = await emitted(t);
    let missing = false;
    const f = client(e, { respond(call) {
      const action = call.headers['x-mancardo-qualification-action'];
      if (action === 'create-own') return json(row(e.config), 201);
      if (action === 'read-own' && !missing) return json(row(e.config));
      return json({ code: 'not_found' }, 404);
    } });
    await f.click(first);
    assert.equal(f.button('create-own').disabled, true, 'An observed or created baseline must never be recreated');
    const before = f.calls.length;
    await f.click('create-own');
    assert.equal(f.calls.length, before);
    missing = true;
    await f.click('read');
    assert.equal(f.calls.length, before + 1, 'Stop at the disappeared positive control, before foreign read');
    f.assertStopped();
  });

  await t.test('arbitrary error HTML and unknown private fields are omitted from exported receipts entirely', async t => {
    const e = await emitted(t), sentinel = 'SYNTHETIC-PRIVATE-RECEIPT-SENTINEL';
    const payload = '</pre><script>window.pwned=true</script><img src=x onerror="window.pwned=true">' + sentinel;
    const f = client(e, { respond: () => json({ code: 'revision_conflict', current: null, error: payload,
      owner_id: sentinel, email: sentinel, accountKey: sentinel, device_id: sentinel, unknown: { track: { note: sentinel } } }, 409) });
    await f.click('foreign-put');
    assert.deepEqual(f.receipts()[0].result, { unexpected_fields_omitted: true, code: 'revision_conflict', current: null });
    assert.ok(!f.nodes.get('results').textContent.includes(sentinel));
    assert.ok(!f.nodes.get('results').textContent.includes(payload));
    assert.equal(f.context.pwned, undefined);
    assert.deepEqual(f.forbidden, []);
    f.assertNoPass();
  });

  await t.test('an unexpectedly disclosed foreign row is not copied into receipts and still causes STOP', async t => {
    const e = await emitted(t), sentinel = 'SYNTHETIC-FOREIGN-PRIVATE-CONTENT';
    const foreign = { ...expectedTrack('b'), name: sentinel, note: sentinel };
    const f = client(e, { respond(call) {
      return call.headers['x-mancardo-qualification-action'] === 'read-own' ? json(row(e.config))
        : json({ track_id: IDS.b, revision: 7, deleted: false, track: foreign, sha256: hash(foreign), owner_id: sentinel, email: sentinel });
    } });
    await f.click('read');
    assert.equal(f.calls.length, 2);
    assert.deepEqual(f.receipts()[1].result, { unexpected_fields_omitted: true, track_id: IDS.b, revision: 7,
      deleted: false, sha256: hash(foreign) });
    assert.ok(!f.nodes.get('results').textContent.includes(sentinel));
    assert.equal(f.receipts()[1].result.track, undefined);
    f.assertStopped();
  });

  await t.test('a leaked current conflict object is replaced by an omission marker, not exported', async t => {
    const e = await emitted(t), sentinel = 'SYNTHETIC-PRIVATE-CURRENT-CONTENT';
    const f = client(e, { respond: () => json({ code: 'revision_conflict', current: {
      track_id: sentinel, revision: 42, owner_id: sentinel, email: sentinel, content_sha256: sentinel,
      track: { name: sentinel, note: sentinel, coordinates: [sentinel] },
    }, error: sentinel }, 409) });
    await f.click('foreign-delete');
    assert.deepEqual(f.receipts()[0].result, { unexpected_fields_omitted: true, code: 'revision_conflict', current: 'unexpected object omitted' });
    assert.ok(!f.nodes.get('results').textContent.includes(sentinel));
    f.assertStopped();
  });

  await t.test('changed own content is omitted while the exact configured synthetic baseline remains exportable', async t => {
    const e = await emitted(t), sentinel = 'SYNTHETIC-CHANGED-OWN-PRIVATE-CONTENT';
    let changed = false;
    const f = client(e, { respond(call) {
      if (call.headers['x-mancardo-qualification-action'] === 'read-foreign') return json({ code: 'not_found' }, 404);
      const value = row(e.config);
      if (changed) value.track.note = sentinel;
      value.error = sentinel; value.private_extra = sentinel;
      return json(value);
    } });
    await f.click('read');
    assert.deepEqual(f.receipts()[0].result.track, expectedTrack('a'));
    changed = true;
    await f.click('read');
    assert.equal(f.receipts()[2].result.track, undefined);
    assert.ok(!f.nodes.get('results').textContent.includes(sentinel));
    f.assertStopped();
  });

  const malformedBodies = [
    ['null', null], ['array', [{ private_note: 'SYNTHETIC-MALFORMED-PRIVATE' }]],
    ['string', 'SYNTHETIC-MALFORMED-PRIVATE'], ['boolean', false], ['number', 42],
    ['wrong field types', { code: 'SYNTHETIC-MALFORMED-PRIVATE', track_id: 'SYNTHETIC-MALFORMED-PRIVATE',
      revision: 'SYNTHETIC-MALFORMED-PRIVATE', deleted: 'SYNTHETIC-MALFORMED-PRIVATE', sha256: 'SYNTHETIC-MALFORMED-PRIVATE',
      track: { note: 'SYNTHETIC-MALFORMED-PRIVATE' }, private_extra: 'SYNTHETIC-MALFORMED-PRIVATE' }],
  ];
  for (const [name, body] of malformedBodies) await t.test('malformed ' + name + ' response is sanitized before STOP', async t => {
    const e = await emitted(t), f = client(e, { respond: () => json(body, 409) });
    await f.click('foreign-put');
    assert.deepEqual(f.receipts()[0].result, { unexpected_fields_omitted: true });
    assert.ok(!f.nodes.get('results').textContent.includes('SYNTHETIC-MALFORMED-PRIVATE'));
    assert.equal(f.calls.length, 1);
    f.assertStopped();
  });

  for (const revision of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) await t.test('unsafe revision ' + revision + ' is not exported', async t => {
    const e = await emitted(t), f = client(e, { respond: () => json({ revision, deleted: false, track_id: IDS.b,
      sha256: 'not-a-hash', code: 'unknown-private-code' }, 409) });
    await f.click('foreign-put');
    assert.deepEqual(f.receipts()[0].result, { unexpected_fields_omitted: true, track_id: IDS.b, deleted: false });
    f.assertStopped();
  });

  await t.test('metadata for an unrecognized ID is omitted even when individual fields look valid', async t => {
    const e = await emitted(t), sentinel = 'SYNTHETIC-UNKNOWN-PRIVATE-ID';
    const f = client(e, { respond: () => json({ track_id: sentinel, revision: 7, deleted: false,
      sha256: 'a'.repeat(64), created_at: 1700000000, updated_at: 1700000001, device_id: sentinel }, 200) });
    await f.click('foreign-put');
    assert.deepEqual(f.receipts()[0].result, { unexpected_fields_omitted: true });
    assert.ok(!f.nodes.get('results').textContent.includes(sentinel));
    f.assertStopped();
  });

  await t.test('exact synthetic own metadata remains useful while arbitrary device identifiers and invalid timestamps are omitted', async t => {
    const e = await emitted(t), sentinel = 'SYNTHETIC-PRIVATE-DEVICE';
    let safe = true;
    const f = client(e, { respond(call) {
      if (call.headers['x-mancardo-qualification-action'] === 'read-foreign') return json({ code: 'not_found' }, 404);
      return json({ ...row(e.config), created_at: safe ? 1700000000 : -1,
        updated_at: safe ? 1700000001 : 'SYNTHETIC-PRIVATE-TIMESTAMP',
        device_id: safe ? 'disposable-' + RUN : sentinel });
    } });
    await f.click('read');
    const first = f.receipts()[0].result;
    assert.equal(first.created_at, 1700000000);
    assert.equal(first.updated_at, 1700000001);
    assert.equal(first.device_id, 'disposable-' + RUN);
    assert.deepEqual(first.track, expectedTrack('a'));
    safe = false;
    await f.click('read');
    const second = f.receipts()[2].result;
    assert.equal(second.created_at, undefined);
    assert.equal(second.updated_at, undefined);
    assert.equal(second.device_id, undefined);
    assert.ok(!f.nodes.get('results').textContent.includes(sentinel));
    assert.ok(!f.nodes.get('results').textContent.includes('SYNTHETIC-PRIVATE-TIMESTAMP'));
    f.assertNoPass();
  });

  for (const change of ['hash', 'content', 'revision', 'deleted', 'id']) await t.test('changed own ' + change + ' stops before the foreign read', async t => {
    const e = await emitted(t), value = row(e.config);
    if (change === 'hash') value.sha256 = '0'.repeat(64);
    if (change === 'content') value.track.note = 'Synthetic changed note';
    if (change === 'revision') value.revision = 2;
    if (change === 'deleted') value.deleted = true;
    if (change === 'id') value.track_id = IDS.b;
    const f = client(e, { respond: () => json(value) });
    await f.click('read');
    assert.equal(f.calls.length, 1);
    f.assertStopped();
  });
});
