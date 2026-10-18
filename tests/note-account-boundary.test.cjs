// Execute the stable-note script emitted by the complete Development Worker
// chain. All accounts, notes, storage, DOM nodes, timers and responses below are
// synthetic. This is a client-workspace test, not a replacement for JWT/SQL
// owner-isolation tests or the full-editor note autosave browser test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const LIBRARY_KEY = 'switchback_local_tracks_v1';
const PRIMARY = 'synthetic-primary-owner';
const OTHER = 'synthetic-other-owner';
const clone = value => JSON.parse(JSON.stringify(value));
const primaryTrack = {
  id: 'synthetic-same-id', type: 'track', name: 'Primary synthetic route',
  note: 'Primary synthetic note',
  segments: [[{ lat: 1, lon: 2 }, { lat: 1.001, lon: 2.001 }]],
};
const otherTrack = {
  ...clone(primaryTrack), name: 'Other synthetic route', note: 'Other synthetic note',
  segments: [[{ lat: 8, lon: 9 }, { lat: 8.001, lon: 9.001 }]],
};

let emittedScript;
async function stableNoteScript() {
  if (!emittedScript) emittedScript = (async () => {
    const config = fs.readFileSync(path.join(ROOT, 'wrangler.dev.toml'), 'utf8');
    const entry = config.match(/^main\s*=\s*"([^"]+)"\s*$/m)?.[1];
    assert.equal(entry, 'worker-delete-durable-fix.js');
    const worker = (await import(pathToFileURL(process.env.MANCARDO_DELETE_TEST_ENTRY || path.join(ROOT, entry)).href)).default;
    const response = await worker.fetch(new Request('https://mancardo.test/'), {
      ASSETS: { async fetch() {
        return new Response(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      } },
      PRIVATE_LIBRARY_DB: { prepare() { throw new Error('Rendering must not access D1'); } },
    }, { waitUntil() { throw new Error('Rendering must not start background work'); } });
    assert.equal(response.status, 200);
    const scripts = [...(await response.text()).matchAll(/<script\b[^>]*id=["']mancardo-stable-note-ui["'][^>]*>([\s\S]*?)<\/script>/gi)];
    assert.equal(scripts.length, 1, 'the real emitted note UI must remain installed exactly once');
    return scripts[0][1];
  })();
  return emittedScript;
}

function element(className = '', text = '') {
  const node = {
    nodeType: 1, className, textContent: text, children: [], parentNode: null,
    get firstChild() { return this.children[0] || null; },
    get nextSibling() {
      if (!this.parentNode) return null;
      const siblings = this.parentNode.children;
      return siblings[siblings.indexOf(this) + 1] || null;
    },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    insertBefore(child, next) { child.parentNode = this; this.children.splice(this.children.indexOf(next), 0, child); },
    insertAdjacentElement(position, child) {
      assert.equal(position, 'afterend');
      if (this.nextSibling) this.parentNode.insertBefore(child, this.nextSibling);
      else this.parentNode.appendChild(child);
    },
    remove() { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; },
    querySelector(selector) {
      assert.match(selector, /^\.[\w-]+$/);
      const cls = selector.slice(1);
      for (const child of this.children) {
        if ((child.className || '').split(/\s+/).includes(cls)) return child;
        const nested = child.querySelector?.(selector);
        if (nested) return nested;
      }
      return null;
    },
  };
  return node;
}

async function fixture({ account = OTHER, otherPresent = true } = {}) {
  const storage = new Map([[LIBRARY_KEY, JSON.stringify([primaryTrack])]]);
  const workspaceMeta = new Map([['boundAccountKey', { key: 'boundAccountKey', value: PRIMARY }]]);
  const rowsByOwner = new Map([
    [PRIMARY, new Map([[primaryTrack.id, { track_id: primaryTrack.id, revision: 3, deleted: false, track: clone(primaryTrack) }]])],
    [OTHER, new Map(otherPresent ? [[otherTrack.id, { track_id: otherTrack.id, revision: 7, deleted: false, track: clone(otherTrack) }]] : [])],
  ]);
  const calls = [], writes = [], windowEvents = {}, documentEvents = {}, observers = [];
  const timers = new Map(); let timerId = 0, now = 0;
  const sharedTracks = [{ name: 'Shared synthetic route', note: 'Shared synthetic note' }];
  const localCard = element('track-item');
  localCard.getAttribute = name => name === 'data-track-id' ? primaryTrack.id : null;
  localCard.appendChild(element('ti-name', primaryTrack.name));
  const sharedCard = element('shared-item');
  const sharedName = sharedCard.appendChild(element('shared-item-name', sharedTracks[0].name));
  sharedName.appendChild({ nodeType: 3, nodeValue: sharedTracks[0].name });
  sharedCard.appendChild(element('shared-item-meta', 'Synthetic shared metadata'));
  const chip = { dataset: { state: account === PRIMARY ? 'synced' : 'paused' } };
  const add = (events, type, handler) => (events[type] ||= []).push(handler);
  const emit = (events, type, event = {}) => { for (const handler of events[type] || []) handler(event); };
  const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
  const context = {
    console, navigator: { onLine: true },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem(key, value) { writes.push({ key, value: String(value) }); storage.set(key, String(value)); },
    },
    // The stable UI is isolated from the primary editor, whose real bindAccount
    // behavior is covered in Chromium. Expose that editor's unchanged durable
    // binding here so a note helper cannot assume the current login owns it.
    indexedDB: { open(name) {
      assert.equal(name, 'mancardo_private_sync_v2');
      const request = {};
      queueMicrotask(() => {
        request.result = { close() {}, transaction() {
          const transaction = { objectStore(store) {
            assert.equal(store, 'meta');
            return { get(key) { const result = {}; queueMicrotask(() => {
              result.result = workspaceMeta.has(key) ? clone(workspaceMeta.get(key)) : undefined; result.onsuccess?.();
              queueMicrotask(() => transaction.oncomplete?.());
            }); return result; } };
          } };
          return transaction;
        } };
        request.onsuccess?.();
      });
      return request;
    } },
    document: {
      visibilityState: 'visible', documentElement: {},
      addEventListener(type, handler) { add(documentEvents, type, handler); },
      getElementById(id) { return id === 'mancardoPrivateSyncChip' ? chip : null; },
      createElement() { return element(); },
      querySelectorAll(selector) {
        if (selector.startsWith('#trackList ')) return [localCard];
        if (selector.startsWith('#sharedTrackList ')) return [sharedCard];
        throw new Error('Unexpected DOM query: ' + selector);
      },
    },
    MutationObserver: class { constructor(handler) { observers.push(handler); } observe() {} },
    addEventListener(type, handler) { add(windowEvents, type, handler); },
    setTimeout(handler, delay = 0) { const id = ++timerId; timers.set(id, { handler, due: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(handler, delay) { const id = ++timerId; timers.set(id, { handler, due: now + delay, interval: delay }); return id; },
    clearInterval(id) { timers.delete(id); },
    async fetch(url, options = {}) {
      const parsed = new URL(url, 'https://mancardo.test');
      const method = options.method || 'GET';
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ path: parsed.pathname, method, account, body });
      if (parsed.pathname === '/api/tracks') return Response.json({ tracks: clone(sharedTracks) });
      if (parsed.pathname === '/api/private-library/health') return Response.json({ authenticated: true, authConfigured: true, storageReady: true, accountKey: account });
      // Deliberately return ONLY the authenticated account's rows. Any local
      // contamination therefore comes from the client, not server owner leakage.
      const rows = rowsByOwner.get(account);
      if (parsed.pathname === '/api/private-library/tracks') return Response.json({ items: [...rows.values()].map(clone) });
      assert.ok(parsed.pathname.startsWith('/api/private-library/tracks/'));
      const id = decodeURIComponent(parsed.pathname.slice('/api/private-library/tracks/'.length));
      const row = rows.get(id);
      if (method === 'GET') return row ? Response.json(clone(row)) : Response.json({ code: 'not_found' }, { status: 404 });
      assert.equal(method, 'PUT');
      if (body.base_revision !== (row?.revision || 0)) return Response.json({ code: 'revision_conflict' }, { status: 409 });
      const next = { track_id: id, revision: (row?.revision || 0) + 1, deleted: false, track: clone(body.track) };
      rows.set(id, next);
      return Response.json({ revision: next.revision });
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(await stableNoteScript(), context, { filename: 'emitted-mancardo-stable-note-ui.js' });
  async function runFor(ms) {
    const end = now + ms;
    for (;;) {
      const next = [...timers.entries()].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      const [id, timer] = next; now = timer.due; timers.delete(id);
      if (timer.interval) timers.set(id, { ...timer, due: now + timer.interval });
      timer.handler(); await settle();
    }
    now = end; await settle();
  }
  return { storage, workspaceMeta, rowsByOwner, calls, writes, chip, localCard, sharedCard, sharedTracks,
    privateCalls: () => calls.filter(call => call.path.startsWith('/api/private-library/tracks')),
    runFor,
    async wake() {
      emit(windowEvents, 'focus'); await settle();
      emit(windowEvents, 'online'); await settle();
      emit(documentEvents, 'visibilitychange'); await settle();
    },
    input(value) {
      emit(documentEvents, 'input', { target: { tagName: 'TEXTAREA', value, closest(selector) {
        if (selector === '.track-note') return {};
        if (selector === '.track-item[data-track-id]') return localCard;
        return null;
      } } });
    },
    mutate() { for (const observer of observers) observer([]); },
  };
}

test('emitted stable-note wakes cannot pull another owner into an unchanged primary workspace', async t => {
  const f = await fixture();
  const before = f.storage.get(LIBRARY_KEY);
  await f.runFor(1000); await f.wake(); await f.runFor(60000);
  t.diagnostic(JSON.stringify({ privateCalls: f.privateCalls().map(({ method, path, account }) => ({ method, path, account })), localWorkspaceChanged: f.storage.get(LIBRARY_KEY) !== before }));
  assert.equal(f.storage.get(LIBRARY_KEY), before, 'same-ID other-owner note must not overwrite primary localStorage');
  assert.deepEqual(f.privateCalls(), [], 'decoration must not independently bypass paused owner binding');
  assert.equal(f.workspaceMeta.get('boundAccountKey').value, PRIMARY);
  assert.equal(f.chip.dataset.state, 'paused');
  assert.deepEqual(f.writes, []);
});

for (const otherPresent of [true, false]) {
  test('emitted stable-note input cannot PUT primary content into ' + (otherPresent ? 'an existing other-owner row' : 'a missing other-owner row'), async t => {
    const f = await fixture({ otherPresent });
    const beforeLocal = f.storage.get(LIBRARY_KEY);
    const beforeOther = clone([...f.rowsByOwner.get(OTHER)]);
    f.input('Synthetic primary edit'); await f.runFor(700);
    t.diagnostic(JSON.stringify({ privateCalls: f.privateCalls().map(({ method, path, account }) => ({ method, path, account })), otherOwnerChanged: JSON.stringify([...f.rowsByOwner.get(OTHER)]) !== JSON.stringify(beforeOther) }));
    assert.deepEqual(f.privateCalls(), [], 'stable-note input must leave private uploads to the account-bound editor');
    assert.deepEqual([...f.rowsByOwner.get(OTHER)], beforeOther, 'another owner must not receive primary note, name or geometry');
    assert.equal(f.storage.get(LIBRARY_KEY), beforeLocal, 'the decoration script must not separately persist the editor note');
    assert.equal(f.workspaceMeta.get('boundAccountKey').value, PRIMARY);
  });
}

test('emitted stable-note UI retains local icons and shared notes without a parallel private sync path', async () => {
  const f = await fixture({ account: PRIMARY });
  await f.runFor(1000);
  assert.equal(f.localCard.querySelector('.mancardo-note-icon')?.title, 'Note: ' + primaryTrack.note);
  assert.equal(f.sharedCard.querySelector('.mancardo-note-icon')?.title, 'Note: Shared synthetic note');
  assert.equal(f.sharedCard.querySelector('.shared-item-note')?.textContent, 'Shared synthetic note');
  assert.ok(f.calls.some(call => call.path === '/api/tracks'), 'shared-library decoration must keep its shared endpoint');
  assert.deepEqual(f.privateCalls(), [], 'healthy note uploads must use the real editor persistence path, not this decoration helper');
  const local = JSON.parse(f.storage.get(LIBRARY_KEY)); local[0].note = '';
  f.storage.set(LIBRARY_KEY, JSON.stringify(local)); f.sharedTracks[0].note = '';
  f.mutate(); await f.runFor(120);
  assert.equal(f.localCard.querySelector('.mancardo-note-icon'), null);
  assert.equal(f.sharedCard.querySelector('.mancardo-note-icon'), null);
  assert.equal(f.sharedCard.querySelector('.shared-item-note'), null);
});
