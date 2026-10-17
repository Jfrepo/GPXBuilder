// Executes the real Worker transformation chain against an in-memory ASSETS
// binding, then compiles the HTML scripts actually returned. No browser, D1,
// Cloudflare deployment, or external network is used by these tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash, webcrypto } = require('node:crypto');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const sourceHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const durableEntry = 'worker-delete-durable-fix.js';
const productionEntry = 'worker-autosave-stability.js';

function configuredEntry(config) {
  const text = fs.readFileSync(path.join(root, config), 'utf8');
  const match = text.match(/^main\s*=\s*"([^"]+)"\s*$/m);
  assert.ok(match, config + ' must specify a Worker entrypoint');
  return match[1];
}

async function render(entry, options = {}) {
  const worker = (await import(pathToFileURL(path.join(root, entry)).href)).default;
  const response = await worker.fetch(new Request('https://mancardo.test/'), {
    ASSETS: {
      async fetch() {
        return new Response(options.body ?? sourceHtml, {
          status: options.status ?? 200,
          headers: {
            'content-type': options.type ?? 'text/html; charset=utf-8',
            'x-test-sentinel': 'preserved',
            ...options.headers,
          },
        });
      },
    },
    PRIVATE_LIBRARY_DB: {
      prepare() { throw new Error('HTML qualification must not read or write D1'); },
    },
  }, {
    waitUntil() { throw new Error('HTML qualification must not start background work'); },
  });
  return response;
}

function compileInlineScripts(html, label) {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  assert.ok(scripts.length > 0, label + ': no script elements were emitted');
  let compiled = 0;
  for (const [index, match] of scripts.entries()) {
    const [, attrs, source] = match;
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = attrs.match(/\btype\s*=\s*["']([^"']*)["']/i)?.[1] || '';
    if (/^(?:application\/ld\+json|application\/json|importmap)$/i.test(type)) continue;
    assert.notEqual(type, 'module', label + ': add a module parser before adding module scripts');
    assert.ok(!/<script\b/i.test(source),
      label + ': nested script tag in inline script ' + index);
    assert.doesNotThrow(() => new vm.Script(source, {
      filename: label + ':inline-script-' + index,
    }), label + ': emitted inline script ' + index + ' must compile');
    compiled++;
  }
  assert.ok(compiled > 0, label + ': no executable inline scripts compiled');
  return scripts.filter(([, attrs]) => !/\bsrc\s*=/i.test(attrs)).map(([, , source]) => source);
}

for (const config of ['wrangler.dev.toml', 'wrangler.toml']) {
  test(config + ' emits syntactically valid inline JavaScript through its real entrypoint', async () => {
    const entry = configuredEntry(config);
    const response = await render(entry);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /id=["']mapDiv["']/);
    compileInlineScripts(html, config + ' -> ' + entry);
  });
}

test('Development selects the repaired wrapper without changing the Production entrypoint', () => {
  assert.equal(configuredEntry('wrangler.dev.toml'), durableEntry);
  assert.equal(configuredEntry('wrangler.toml'), productionEntry);
});

test('durable deletion client is plain JavaScript inside the editor script before boot', async () => {
  const response = await render(durableEntry);
  const html = await response.text();
  const scripts = compileInlineScripts(html, durableEntry);
  const containing = scripts.filter(source => source.includes('window.mancardoAuthorizedDelete'));
  assert.equal(containing.length, 1, 'exactly one delivered script must install durable deletion');
  const editor = containing[0];
  assert.match(editor, /\bvar state\s*=\s*\{/,
    'the deletion client must share the real editor script containing state');
  const install = editor.indexOf('window.mancardoAuthorizedDelete');
  const boot = editor.indexOf('// ---------- boot ----------');
  assert.ok(install > 0 && boot > install, 'install durable deletion before the editor boot sequence');
  assert.doesNotMatch(html, /<script\b[^>]*id=["']mancardo-explicit-delete-bridge["']/i,
    'remove the superseded out-of-scope body-script bridge');
  assert.doesNotMatch(html, /function syncRemoved\(before\)/,
    'the old non-durable delete bridge must not coexist with the replacement');
  assert.doesNotMatch(html, /<script\b[^>]*id=["']mancardo-private-(?:delete-tombstone-fix|waypoint-sync)["']/i,
    'do not reintroduce legacy reload polling clients');
});

test('missing editor boot marker leaves a readable, unchanged base response', async () => {
  const body = '<!doctype html><html><body><p>Maintenance fixture without an editor.</p></body></html>';
  const expected = await render(productionEntry, { body });
  const actual = await render(durableEntry, { body });
  assert.equal(actual.bodyUsed, false, 'fallback response body must not already be consumed');
  assert.equal(await actual.text(), await expected.text(), 'unsupported markup must retain base output');
  assert.equal(actual.headers.get('x-test-sentinel'), 'preserved');
});

test('emitted cloud mutation functions recheck pending deletion after asynchronous work', async () => {
  const html = await (await render(durableEntry)).text();
  // Execute the exact functions emitted by the Worker, not copies of their
  // implementation. The sandbox isolates the final mutation step reached after
  // an IndexedDB/hash await; real browser scheduling is tested separately.
  function emittedFunction(name) {
    const line = html.split('\n').find(value => value.trimStart().startsWith('function ' + name + '('));
    assert.ok(line, 'expected emitted cloud function: ' + name);
    return line;
  }
  let pending = true;
  const state = { library: [], currentId: null };
  const context = vm.createContext({
    state,
    accountKey: 'account-a',
    window: {
      mancardoHasPendingDelete(account, id) {
        return pending && account === 'account-a' && id === 'deleted-id';
      },
    },
    clone: value => JSON.parse(JSON.stringify(value)),
    uid: () => 'conflict-fixture-id',
    stripSharedLink() {},
    conflictCount: 0,
  });
  vm.runInContext(emittedFunction('replaceLocal') + '\n' + emittedFunction('preserveConflictCopy'), context);
  const staleTrack = { id: 'deleted-id', name: 'Stale cloud copy' };
  context.replaceLocal('deleted-id', staleTrack);
  assert.equal(state.library.length, 0, 'late cloud result must not reinsert a pending-deleted track');
  assert.equal(context.preserveConflictCopy(staleTrack, 'late result'), null);
  assert.equal(state.library.length, 0, 'late cloud result must not create an unintended conflict copy');
  pending = false;
  context.replaceLocal('deleted-id', staleTrack);
  assert.equal(state.library.length, 1, 'a cancelled intent must allow the cloud copy to reconcile');
  pending = true;
  context.replaceLocal('deleted-id', null);
  assert.equal(state.library.length, 0, 'a pending intent must not prevent applying a cloud tombstone');
});

async function emittedRevisionHashes() {
  const html = await (await render(durableEntry)).text();
  const start = html.indexOf('function revisionHashes(snapshot){');
  const end = html.indexOf('function authorisedDelete(', start);
  assert.ok(start >= 0 && end > start, 'expected the real emitted revision-hash helper');
  const context = vm.createContext({ crypto: webcrypto, TextEncoder, Uint8Array });
  vm.runInContext(html.slice(start, end), context);
  return context.revisionHashes;
}

function serializedHash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

test('emitted revision matching permits only visibility serialization variants without reordering other fields', async () => {
  const hashes = await emittedRevisionHashes();
  const entries = [['id', 'one'], ['name', 'Caf\u00e9 "route"'], ['segments', [[{ lat: -33.1, lon: 151.2, ele: null }]]], ['note', 'Line one\nLine two']];
  for (const position of [0, 2, entries.length]) {
    for (const prior of [true, false, null]) {
      const ordered = entries.slice(); ordered.splice(position, 0, ['visible', prior]);
      const synced = Object.fromEntries(ordered);
      for (const current of [true, false, null]) {
        const local = JSON.parse(JSON.stringify(synced)); local.visible = current;
        assert.ok((await hashes(JSON.stringify(local))).includes(serializedHash(synced)),
          'Boolean/null visibility changes must preserve property position ' + position);
      }
    }
  }
  const absent = Object.fromEntries(entries);
  for (const current of [true, false, null]) {
    const local = JSON.parse(JSON.stringify(absent)); local.visible = current;
    assert.ok((await hashes(JSON.stringify(local))).includes(serializedHash(absent)),
      'rendering an originally absent visible field must not require another sync');
  }
  assert.ok((await hashes(JSON.stringify(absent))).includes(serializedHash(absent)));
});

test('visibility variants never ignore substantive fields, nested fields, or special JSON property names', async () => {
  const hashes = await emittedRevisionHashes();
  const synced = { id: 'one', visible: true, name: 'Route', note: 'Original', color: '#123456', segments: [[{ lat: 1, lon: 2, visible: true }]], updatedAt: '2026-10-17T00:00:00Z' };
  const mutations = [
    track => { track.name = 'Changed'; },
    track => { track.note = 'Changed'; },
    track => { track.color = '#abcdef'; },
    track => { track.segments[0][0].lat = 9; },
    track => { track.segments[0][0].visible = false; },
    track => { track.updatedAt = '2026-10-17T00:00:01Z'; },
    track => { track.extraPayload = { newlyAdded: true }; },
    track => { Object.defineProperty(track, '__proto__', { value: { newlyAdded: true }, enumerable: true }); },
  ];
  for (const mutate of mutations) {
    const local = JSON.parse(JSON.stringify(synced)); local.visible = false; mutate(local);
    assert.ok(!(await hashes(JSON.stringify(local))).includes(serializedHash(synced)),
      'only top-level visibility may differ, including with own __proto__ properties');
  }
});

test('non-Boolean/non-null visibility values receive exact matching only, without coercion', async () => {
  const hashes = await emittedRevisionHashes();
  const synced = { id: 'one', name: 'Route', visible: true, segments: [] };
  for (const value of ['false', 'true', 0, 1, [], {}, { hidden: true }]) {
    const local = JSON.parse(JSON.stringify(synced)); local.visible = value;
    const actual = await hashes(JSON.stringify(local));
    assert.ok(actual.includes(serializedHash(local)), 'unchanged serialized input must retain exact matching');
    assert.ok(!actual.includes(serializedHash(synced)), 'unknown visibility types must not acquire relaxed matching');
    assert.equal(actual.length, 1, 'unknown visibility type should produce only its exact hash');
  }
});

test('non-HTML response is returned without consuming or changing its body', async () => {
  const response = await render(durableEntry, {
    body: '{"fixture":true}',
    type: 'application/json',
    status: 202,
  });
  assert.equal(response.status, 202);
  assert.equal(response.bodyUsed, false);
  assert.equal(response.headers.get('content-type'), 'application/json');
  assert.equal(response.headers.get('x-test-sentinel'), 'preserved');
  assert.equal(await response.text(), '{"fixture":true}');
});

test('transformed HTML retains status/custom headers but removes stale entity metadata', async () => {
  const response = await render(durableEntry, {
    status: 201,
    headers: { etag: '"original-asset"', 'content-length': String(sourceHtml.length) },
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('x-test-sentinel'), 'preserved');
  assert.equal(response.headers.get('etag'), null);
  assert.equal(response.headers.get('content-length'), null);
  assert.match(response.headers.get('cache-control'), /no-store/);
  compileInlineScripts(await response.text(), 'header-preserving durable response');
});
