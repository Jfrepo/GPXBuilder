// Real Chromium runs the exact standalone HTML emitted by the candidate Worker.
// Every browser request is fulfilled/aborted locally; none is continued to the
// network. API responses normally execute the actual Worker/JWT/SQLite fixture.
// Synthetic response faults test uncertain outcomes. No live account, Access,
// D1 service, browser profile, deployment, or production data is accessed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { fixture: serverFixture } = require('./helpers/server-owner-harness.cjs');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }

const ROOT = path.resolve(__dirname, '..');
const IDS = { a: 'qual_owner_20261018_1032_a_7c9f2d', b: 'qual_owner_20261018_1032_b_f62e81' };
const RUN = 'owner-isolation-20261018-1032';
const ACTIONS = ['read', 'create-own', 'foreign-put', 'foreign-delete'];
const STORAGE_KEY = 'synthetic-owner-qualification-preserve';
const STORAGE_VALUE = '{"library":["invented-local-track"],"outbox":["invented-pending-edit"]}';
const IDB_NAME = 'synthetic-owner-qualification-preserve';
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
let browser;

// Poll observations only, never retry application actions or advance app clocks.
async function observed(predicate, message = 'Synthetic browser operation did not settle') {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(message);
}

async function fixture(t, options = {}) {
  const server = await serverFixture(t), role = options.role || 'a', foreign = role === 'a' ? 'b' : 'a';
  const candidate = await import(pathToFileURL(path.join(ROOT, 'worker-owner-qualification.js')).href);
  const env = { ...server.env, MANCARDO_QUALIFICATION_RUN: candidate.QUALIFICATION_RUN,
    MANCARDO_QUALIFICATION_ACCOUNT_A: server.accountKeys.a, MANCARDO_QUALIFICATION_ACCOUNT_B: server.accountKeys.b };
  const ctx = { waitUntil() { assert.fail('Qualification must not schedule Worker background work'); } };
  const token = options.label === undefined ? server.tokens[role] : server.token(role, { email: options.label });
  const pageResponse = await candidate.default.fetch(new Request(candidate.QUALIFICATION_ORIGIN + candidate.QUALIFICATION_PATH,
    { headers: { 'Cf-Access-Jwt-Assertion': token } }), env, ctx);
  assert.equal(pageResponse.status, 200);
  const html = await pageResponse.text();
  const config = JSON.parse(html.match(/<script\b[^>]*id="configuration"[^>]*>([\s\S]*?)<\/script>/)[1]);
  if (options.seed) for (const owner of ['a', 'b']) {
    assert.equal((await server.put(owner, candidate.qualificationTrack(owner))).status, 201);
  }
  const baseline = server.snapshot();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  context.setDefaultTimeout(5000);
  context.setDefaultNavigationTimeout(5000);
  const page = await context.newPage();
  const model = { calls: [], unexpected: [], errors: [], dialogs: [] };
  page.on('pageerror', error => model.errors.push(error.message));
  t.after(async () => { options.held?.resolve(); await context.close(); });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    // An absolute deny-by-default boundary. Never route.continue/fetch/fallback.
    if (url.origin !== candidate.QUALIFICATION_ORIGIN || url.search) {
      model.unexpected.push(request.url()); return route.abort('blockedbyclient');
    }
    if (url.pathname === '/synthetic-qualification-storage-setup') {
      return route.fulfill({ contentType: 'text/html', headers: { 'content-security-policy': "default-src 'none'" },
        body: '<!doctype html><body>Synthetic fixture setup</body>' });
    }
    if (url.pathname === candidate.QUALIFICATION_PATH && request.method() === 'GET') {
      return route.fulfill({ status: 200, headers: Object.fromEntries(pageResponse.headers), body: html });
    }
    if (!Object.values(IDS).some(id => url.pathname === '/api/private-library/tracks/' + id)) {
      model.unexpected.push(request.url()); return route.abort('blockedbyclient');
    }
    const call = { url: request.url(), path: url.pathname, method: request.method(), headers: request.headers(),
      body: request.postData() === null ? undefined : request.postDataJSON(), settled: false };
    model.calls.push(call);
    try {
      if (options.held) await options.held.promise;
      if (options.abort && call.method !== 'GET') return await route.abort('connectionreset');
      let response = options.respond ? await options.respond(call) : null;
      if (!response) {
        const headers = new Headers(request.headers());
        // Synthetic edge identity injection; the unmodified verifier checks this
        // ephemeral, locally signed JWT against the intercepted local JWKS.
        headers.set('Cf-Access-Jwt-Assertion', token);
        response = await candidate.default.fetch(new Request(request.url(), {
          method: request.method(), headers,
          ...(request.postData() === null ? {} : { body: request.postData() }),
        }), env, ctx);
      }
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
    } finally { call.settled = true; }
  });
  // Seed and later inspect real browser storage, not a storage mock.
  await page.goto(candidate.QUALIFICATION_ORIGIN + '/synthetic-qualification-storage-setup');
  await page.evaluate(async ({ key, value, dbName }) => {
    localStorage.setItem(key, value); sessionStorage.setItem(key, value);
    const db = await new Promise((resolve, reject) => {
      const opening = indexedDB.open(dbName, 1);
      opening.onupgradeneeded = () => opening.result.createObjectStore('sentinels', { keyPath: 'id' });
      opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('sentinels', 'readwrite');
      tx.objectStore('sentinels').put({ id: key, value });
      tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { key: STORAGE_KEY, value: STORAGE_VALUE, dbName: IDB_NAME });
  await page.addInitScript(({ path, key, dbName }) => {
    if (location.pathname !== path) return;
    const local = window.localStorage, session = window.sessionStorage, idb = window.indexedDB;
    const forbidden = [];
    window.__qualificationFixture = {
      forbidden,
      async snapshot() {
        const db = await new Promise((resolve, reject) => {
          const opening = idb.open(dbName, 1);
          opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error);
        });
        const value = await new Promise((resolve, reject) => {
          const request = db.transaction('sentinels').objectStore('sentinels').get(key);
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        db.close();
        return { local: local.getItem(key), session: session.getItem(key), indexed: value };
      },
    };
    for (const name of ['localStorage', 'sessionStorage', 'indexedDB', 'caches']) {
      Object.defineProperty(window, name, { configurable: true, get() {
        forbidden.push(name); throw new Error('Standalone page must not access ' + name);
      } });
    }
    for (const name of ['setTimeout', 'setInterval', 'requestAnimationFrame']) window[name] = () => {
      forbidden.push(name); throw new Error('Standalone page must not schedule ' + name);
    };
  }, { path: candidate.QUALIFICATION_PATH, key: STORAGE_KEY, dbName: IDB_NAME });
  await page.goto(candidate.QUALIFICATION_ORIGIN + candidate.QUALIFICATION_PATH);
  const f = {
    page, model, config, server, candidate, baseline, role, foreign, options,
    button(action) { return page.locator('button[data-action="' + action + '"]'); },
    async settled() {
      await observed(async () => model.calls.every(call => call.settled) && !(await this.button('read').evaluate(button => button.disabled)));
    },
    async action(action, accept = true) {
      const before = model.calls.length;
      if (action !== 'read') page.once('dialog', async dialog => {
        model.dialogs.push(dialog.message()); await (accept ? dialog.accept() : dialog.dismiss());
      });
      await this.button(action).evaluate(button => button.click());
      if (action === 'read' || accept) await observed(() => model.calls.length > before);
      await this.settled();
    },
    async forceActions(actions) {
      await page.evaluate(actions => {
        for (const action of actions) document.querySelector('button[data-action="' + action + '"]').dispatchEvent(new Event('click'));
      }, actions);
    },
    async status() { return page.locator('#status').textContent(); },
    async receipts() { return page.locator('#results').evaluate(node => node.textContent ? JSON.parse(node.textContent).receipts : []); },
    async assertSafe() {
      assert.deepEqual(model.unexpected, [], 'No broad library request, CDN, external navigation, or unrecognized target is allowed');
      assert.deepEqual(model.errors, [], 'Emitted standalone page must have no uncaught errors');
      assert.deepEqual(await page.evaluate(() => window.__qualificationFixture.forbidden), []);
      assert.deepEqual(await page.evaluate(() => window.__qualificationFixture.snapshot()), {
        local: STORAGE_VALUE, session: STORAGE_VALUE, indexed: { id: STORAGE_KEY, value: STORAGE_VALUE },
      });
      assert.doesNotMatch(await this.status(), /\bPASS(?:ED)?\b/i);
      assert.equal(await page.locator('script').count(), 2);
      assert.equal(await page.locator('script[src], iframe, input, form, #mapDiv, .topbar').count(), 0);
    },
    async assertStopped() {
      assert.match(await this.status(), /^STOP\./);
      for (const action of ACTIONS.slice(1)) assert.equal(await this.button(action).isDisabled(), true);
      assert.equal(await this.button('read').isDisabled(), false);
      await this.assertSafe();
    },
  };
  assert.equal(model.calls.length, 0, 'Loading the page must not perform even an automatic health read');
  assert.deepEqual(server.snapshot(), baseline, 'Rendering must not mutate the synthetic database');
  await f.assertSafe();
  return f;
}

const chromiumPath = chromium && (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath());
test('standalone qualification in real Chromium', { concurrency: false, timeout: 60000 }, async t => {
  assert.ok(chromium, 'Browser qualification requires installed Playwright; missing browser work must fail, never skip');
  assert.ok(fs.existsSync(chromiumPath), 'Browser qualification requires an installed Chromium executable; no installation attempted');
  browser = await chromium.launch({ headless: true, executablePath: chromiumPath, args: ['--no-sandbox'] });
  t.after(async () => browser.close());

  await t.test('inert startup and malicious signed identity remain safe real-DOM text with browser storage untouched', async t => {
    const label = 'Synthetic </script><img src=x onerror="window.pwned=true">\u2028\u2029 participant';
    const f = await fixture(t, { label });
    assert.equal(await f.page.locator('#identity').textContent(), label + ' | fixed role A');
    assert.equal(await f.page.locator('#identity > *').count(), 0);
    assert.equal(await f.page.evaluate(() => window.pwned), undefined);
    assert.equal(await f.page.locator('img').count(), 0);
    assert.equal(f.model.dialogs.length, 0);
    assert.equal(f.model.calls.length, 0);
    await f.assertSafe();
  });

  for (const role of ['a', 'b']) await t.test(role.toUpperCase() + ' actual browser requests create one baseline and reject exact foreign PUT/DELETE without changing either record', async t => {
    const f = await fixture(t, { role });
    await f.action('create-own');
    assert.equal((await f.server.put(f.foreign, f.candidate.qualificationTrack(f.foreign))).status, 201);
    const beforeProbes = f.server.snapshot();
    await f.action('read');
    await f.action('foreign-put');
    await f.action('foreign-delete');
    await f.action('read');
    assert.deepEqual(f.server.snapshot(), beforeProbes, 'Actual owner SQL/history must preserve both baselines after foreign probes');
    assert.deepEqual(f.model.calls.map(call => call.headers['x-mancardo-qualification-action']),
      ['create-own', 'read-own', 'read-foreign', 'foreign-put', 'foreign-delete', 'read-own', 'read-foreign']);
    const expectedBodies = {
      'create-own': { base_revision: 0, track: f.candidate.qualificationTrack(role), device_id: 'disposable-' + RUN },
      'foreign-put': { base_revision: 1, track: f.candidate.qualificationTrack(f.foreign, true), device_id: 'disposable-' + RUN },
      'foreign-delete': { base_revision: 1, device_id: 'disposable-' + RUN, authorized_user_delete: true, delete_intent: 'explicit-ui-delete' },
    };
    for (const call of f.model.calls) {
      const action = call.headers['x-mancardo-qualification-action'];
      const target = ['create-own', 'read-own'].includes(action) ? role : f.foreign;
      const method = action.startsWith('read-') ? 'GET' : action === 'foreign-delete' ? 'DELETE' : 'PUT';
      assert.equal(call.path, '/api/private-library/tracks/' + IDS[target]);
      assert.equal(call.method, method);
      assert.equal(call.headers.accept, 'application/json');
      assert.equal(call.headers['x-mancardo-qualification-run'], RUN);
      assert.equal(call.headers['x-mancardo-qualification-owner'], f.server.accountKeys[role]);
      const header = method === 'DELETE' ? 'x-mancardo-delete-account' : 'x-mancardo-private-account';
      assert.equal(call.headers[header], f.server.accountKeys[role]);
      assert.equal(call.headers[method === 'DELETE' ? 'x-mancardo-private-account' : 'x-mancardo-delete-account'], undefined);
      assert.deepEqual(call.body, expectedBodies[action]);
      if (method !== 'GET') {
        assert.equal(call.headers['content-type'], 'application/json');
        assert.equal(call.headers.origin, f.candidate.QUALIFICATION_ORIGIN);
      }
    }
    assert.deepEqual((await f.receipts()).map(receipt => receipt.status), [201, 200, 404, 409, 409, 200, 404]);
    assert.deepEqual((await f.receipts()).find(receipt => receipt.action === 'read-own').result.track, f.candidate.qualificationTrack(role));
    const exported = await f.page.locator('#results').textContent();
    assert.ok(!exported.includes(f.config.accountKey));
    assert.ok(!exported.includes(f.config.accountLabel));
    for (const receipt of (await f.receipts()).filter(receipt => receipt.action.startsWith('foreign-'))) {
      assert.equal(receipt.result.code, 'revision_conflict'); assert.equal(receipt.result.current, null);
    }
    await f.forceActions(ACTIONS.slice(1));
    await f.settled();
    assert.equal(f.model.calls.length, 7, 'Used mutation handlers must ignore even direct synthetic event dispatch');
    assert.equal(f.model.dialogs.length, 3);
    await f.assertSafe();
  });

  await t.test('declining every mutation confirmation makes zero requests', async t => {
    const f = await fixture(t);
    for (const action of ACTIONS.slice(1)) await f.action(action, false);
    assert.equal(f.model.calls.length, 0);
    assert.equal(f.model.dialogs.length, 3);
    assert.deepEqual(f.server.snapshot(), f.baseline);
    for (const action of ACTIONS) assert.equal(await f.button(action).isDisabled(), false);
    await f.action('create-own');
    assert.equal(f.model.calls.length, 1, 'Cancellation must not consume the allowed create attempt');
    await f.assertSafe();
  });

  await t.test('one in-flight browser write blocks double-clicks and all overlapping actions', async t => {
    const held = deferred(), f = await fixture(t, { held });
    f.page.once('dialog', dialog => dialog.accept());
    await f.button('create-own').evaluate(button => button.click());
    await observed(() => f.model.calls.length === 1);
    await f.forceActions(Array.from({ length: 8 }, () => ACTIONS).flat());
    assert.equal(f.model.calls.length, 1);
    for (const action of ACTIONS) assert.equal(await f.button(action).isDisabled(), true);
    assert.equal((await f.receipts()).length, 0, 'An unresolved fetch has no known outcome');
    assert.doesNotMatch(await f.status(), /returned the expected result|captured|\bPASS(?:ED)?\b/i);
    assert.equal(f.model.calls[0].settled, false);
    held.resolve(); await f.settled();
    await f.forceActions(['create-own', 'create-own']);
    assert.equal(f.model.calls.length, 1);
    assert.equal(await f.button('create-own').isDisabled(), true);
    await f.assertSafe();
  });

  const faults = [
    ['unknown network outcome', { abort: true }],
    ['wrong 409', { respond: call => call.method === 'GET' ? null : json({ code: 'qualification_account_changed', current: null }, 409) }],
    ['missing positive control', { respond: call => call.method === 'GET' ? null : json({ code: 'qualification_positive_control' }, 409) }],
    ['unscoped conflict details', { respond: call => call.method === 'GET' ? null : json({ code: 'revision_conflict', current: { revision: 1 } }, 409) }],
    ['non-JSON login response', { respond: call => call.method === 'GET' ? null : new Response('<html>Synthetic login</html>', { headers: { 'content-type': 'text/html' } }) }],
  ];
  for (const [name, options] of faults) await t.test(name + ' locks writes without retry; only two exact reads remain and no PASS is claimed', async t => {
    const f = await fixture(t, { seed: true, ...options });
    await f.action('foreign-put');
    await f.assertStopped();
    await f.forceActions(Array.from({ length: 8 }, () => ACTIONS.slice(1)).flat());
    assert.equal(f.model.calls.length, 1);
    assert.equal(f.model.dialogs.length, 1);
    await f.action('read');
    assert.deepEqual(f.model.calls.map(call => call.method), ['PUT', 'GET', 'GET']);
    assert.deepEqual(f.model.calls.slice(1).map(call => call.path), [IDS.a, IDS.b].map(id => '/api/private-library/tracks/' + id));
    for (const action of ACTIONS.slice(1)) assert.equal(await f.button(action).isDisabled(), true);
    assert.deepEqual(f.server.snapshot(), f.baseline);
    await f.assertSafe();
  });

  await t.test('an absent own baseline cannot turn two 404 receipts into a PASS', async t => {
    const f = await fixture(t);
    await f.action('read');
    assert.deepEqual((await f.receipts()).map(receipt => receipt.status), [404, 404]);
    assert.match(await f.status(), /not a complete test result/i);
    await f.action('foreign-put');
    await f.assertStopped();
    assert.equal((await f.receipts()).find(receipt => receipt.action === 'foreign-put').result.code, 'qualification_positive_control');
    assert.deepEqual(f.server.snapshot(), f.baseline);
  });

  for (const first of ['read', 'create-own']) await t.test('a baseline disappearing after ' + first + ' stops before any foreign read or new write', async t => {
    let missing = false;
    const f = await fixture(t, { seed: first === 'read', respond: call =>
      missing && call.headers['x-mancardo-qualification-action'] === 'read-own' ? json({ code: 'not_found' }, 404) : null });
    await f.action(first);
    assert.equal(await f.button('create-own').isDisabled(), true);
    const before = f.model.calls.length;
    await f.forceActions(['create-own']);
    assert.equal(f.model.calls.length, before);
    missing = true;
    await f.action('read');
    assert.equal(f.model.calls.length, before + 1);
    await f.assertStopped();
  });

  await t.test('arbitrary response HTML and unknown private fields never enter exported receipts or DOM', async t => {
    const sentinel = 'SYNTHETIC-PRIVATE-RECEIPT-SENTINEL';
    const payload = '</pre><script>window.pwned=true</script><img src=x onerror="window.pwned=true">' + sentinel;
    const f = await fixture(t, { seed: true, respond: call => call.method === 'GET' ? null
      : json({ code: 'revision_conflict', current: null, error: payload, email: sentinel, owner_id: sentinel,
        accountKey: sentinel, unknown: { note: sentinel } }, 409) });
    await f.action('foreign-put');
    assert.deepEqual((await f.receipts())[0].result, { unexpected_fields_omitted: true, code: 'revision_conflict', current: null });
    assert.ok(!(await f.page.locator('#results').textContent()).includes(sentinel));
    assert.equal(await f.page.locator('#results > *').count(), 0);
    assert.equal(await f.page.locator('img').count(), 0);
    assert.equal(await f.page.evaluate(() => window.pwned), undefined);
    await f.assertSafe();
  });

  await t.test('unexpected foreign data is omitted before an unsuccessful read is exported', async t => {
    const sentinel = 'SYNTHETIC-FOREIGN-PRIVATE-CONTENT';
    const f = await fixture(t, { seed: true, respond: call => call.headers['x-mancardo-qualification-action'] !== 'read-foreign' ? null
      : json({ track_id: IDS.b, revision: 7, deleted: false, owner_id: sentinel, track: { name: sentinel, note: sentinel } }) });
    await f.action('read');
    assert.deepEqual((await f.receipts())[1].result, { unexpected_fields_omitted: true, track_id: IDS.b, revision: 7, deleted: false });
    assert.ok(!(await f.page.locator('#results').textContent()).includes(sentinel));
    await f.assertStopped();
  });

  await t.test('unexpected current details never become an exported conflict payload', async t => {
    const sentinel = 'SYNTHETIC-PRIVATE-CURRENT-CONTENT';
    const f = await fixture(t, { seed: true, respond: call => call.method === 'GET' ? null
      : json({ code: 'revision_conflict', current: { owner_id: sentinel, track: { note: sentinel } }, error: sentinel }, 409) });
    await f.action('foreign-delete');
    assert.deepEqual((await f.receipts())[0].result, { unexpected_fields_omitted: true, code: 'revision_conflict', current: 'unexpected object omitted' });
    assert.ok(!(await f.page.locator('#results').textContent()).includes(sentinel));
    await f.assertStopped();
  });

  for (const body of [null, [{ note: 'SYNTHETIC-MALFORMED-PRIVATE' }], 'SYNTHETIC-MALFORMED-PRIVATE']) await t.test('malformed response shape cannot leak arbitrary private content', async t => {
    const f = await fixture(t, { seed: true, respond: call => call.method === 'GET' ? null : json(body, 409) });
    await f.action('foreign-put');
    assert.deepEqual((await f.receipts())[0].result, { unexpected_fields_omitted: true });
    assert.ok(!(await f.page.locator('#results').textContent()).includes('SYNTHETIC-MALFORMED-PRIVATE'));
    await f.assertStopped();
  });
});
