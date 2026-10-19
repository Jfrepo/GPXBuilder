// Request-budget regressions for the exact scripts emitted by the Development
// Worker. Only browser/network/storage/clock adapters are synthetic; no app
// function is replaced. These are deterministic mechanism tests, not browser
// throughput measurements or a substitute for full-editor Chromium/live D1 QA.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const LIB = 'switchback_local_tracks_v1';
const PENDING = 'mancardo_authorized_delete_pending_v4';
const OWNER = 'synthetic-owner-A';
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const tick = () => new Promise(resolve => setImmediate(resolve));
const settle = async () => { for (let i = 0; i < 24; i++) await tick(); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const sampleTrack = () => ({ id: 'fixture-one', type: 'track', name: 'Synthetic route', note: 'Original note', visible: true, segments: [[{ lat: 1, lon: 2 }]] });
const intent = () => ({ id: 'fixture-one', accountKey: OWNER, baseRevision: 4, authorizedUserDelete: true, requestedAt: 0 });
let scripts, cadenceRepair, anchorHtml;

test.before(async () => {
  let html;
  // Allows qualification against a previously captured emitted baseline without
  // editing the working tree or weakening the expected corrected behavior.
  if (process.env.MANCARDO_REQUEST_VOLUME_HTML) html = fs.readFileSync(process.env.MANCARDO_REQUEST_VOLUME_HTML, 'utf8');
  else {
    const config = fs.readFileSync(path.join(ROOT, 'wrangler.dev.toml'), 'utf8');
    const entry = config.match(/^main\s*=\s*"([^"]+)"\s*$/m)?.[1];
    assert.equal(entry, 'worker-delete-durable-fix.js');
    const worker = (await import(pathToFileURL(path.join(ROOT, entry)).href)).default;
    const response = await worker.fetch(new Request('https://fixture.test/'), {
      ASSETS: { async fetch() { return new Response(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), { headers: { 'content-type': 'text/html' } }); } },
      PRIVATE_LIBRARY_DB: { prepare() { throw new Error('No D1 access is permitted'); } },
    }, { waitUntil() { throw new Error('No background Worker work is permitted'); } });
    assert.equal(response.status, 200);
    html = await response.text();
  }
  function iife(marker) {
    const begin = html.indexOf(marker), end = html.indexOf('\n})();', begin);
    assert.ok(begin >= 0 && end > begin, 'Missing emitted IIFE: ' + marker);
    return html.slice(begin, end + '\n})();'.length);
  }
  const notes = [...html.matchAll(/<script\b[^>]*id=["']mancardo-stable-note-ui["'][^>]*>([\s\S]*?)<\/script>/gi)];
  assert.equal(notes.length, 1);
  scripts = {
    notes: notes[0][1],
    save: iife('(function installSaveStateIndicator(){'),
    cloud: iife('(function installMancardoPrivateCloudSync(){'),
    deletion: iife('// ---------- Durable, revision-pinned explicit My Library deletion ----------'),
    sharedLoader: html.slice(html.indexOf('function fmtSharedDate('), html.indexOf('var sharedPreviewPulseLayer')),
    sharedRender: html.slice(html.indexOf('function renderSharedLibrary(){'), html.indexOf('function deleteSharedTrack(')),
    escape: html.split('\n').find(line => line.startsWith('function esc(')),
    sharedNotePublish: html.split('\n').find(line => line.startsWith('function mancardoSyncSharedNote(')),
    buildGpx: html.slice(html.indexOf('function buildGpx(item){'), html.indexOf('// ---------- Leaflet map ----------')),
    cornerWaypoints: html.slice(html.indexOf('function cornerWaypoints(item){'), html.indexOf('function fmtDate(')),
    persistLibrary: html.slice(html.indexOf('function persistLibrary(){'), html.indexOf('// ---------- stats ----------')),
  };
  for (const [name, source] of Object.entries(scripts)) new vm.Script(source, { filename: 'emitted-' + name + '.js' });
  cadenceRepair = (await import(pathToFileURL(path.join(ROOT, 'worker-request-cadence.js')).href)).repairRequestCadence;
  const baseWorker = (await import(pathToFileURL(path.join(ROOT, 'worker-autosave-stability.js')).href)).default;
  anchorHtml = await (await baseWorker.fetch(new Request('https://fixture.test/'), {
    ASSETS: { async fetch() { return new Response(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), { headers: { 'content-type': 'text/html' } }); } },
    PRIVATE_LIBRARY_DB: { prepare() { throw new Error('Anchor qualification must not access D1'); } },
  }, { waitUntil() { throw new Error('No background work is permitted'); } })).text();
});

function clock() {
  let now = 0, sequence = 0;
  const timers = new Map();
  const add = (fn, delay = 0, interval = 0) => { const id = ++sequence; timers.set(id, { fn, due: now + Math.max(0, Number(delay) || 0), interval }); return id; };
  class FakeDate extends Date { constructor(...args) { super(...(args.length ? args : [1700000000000 + now])); } static now() { return 1700000000000 + now; } }
  return {
    get now() { return now; },
    globals: { Date: FakeDate, setTimeout: (fn, ms) => add(fn, ms), clearTimeout: id => timers.delete(id), setInterval: (fn, ms) => add(fn, ms, ms), clearInterval: id => timers.delete(id) },
    async runFor(ms) {
      const end = now + ms; let tasks = 0;
      await settle();
      for (;;) {
        const next = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
        if (!next) break;
        assert.ok(++tasks <= 20000, 'Virtual timer budget exceeded; likely feedback loop');
        const [id, timer] = next; timers.delete(id); now = timer.due;
        if (timer.interval) timers.set(id, { ...timer, due: now + timer.interval });
        timer.fn(); await settle();
      }
      now = end; await settle();
    },
  };
}

function dom() {
  const observers = [], events = {}, fallback = new Map(); let mutations = 0;
  const addEvent = (name, fn) => (events[name] ||= []).push(fn);
  function changed(target, addedNodes = [], removedNodes = []) {
    mutations++;
    for (const observer of observers) {
      if (!observer.targets.some(({ node, options }) => options.childList && (node === target || options.subtree && node.contains(target)))) continue;
      observer.records.push({ type: 'childList', target, addedNodes, removedNodes });
      if (observer.scheduled) continue;
      observer.scheduled = true;
      queueMicrotask(() => { observer.scheduled = false; const records = observer.records.splice(0); if (records.length) observer.fn(records, observer); });
    }
  }
  class Element {
    constructor(tag = 'div', className = '', text = '') {
      this.tagName = tag.toUpperCase(); this.nodeType = 1; this.className = className; this.dataset = {}; this.style = {}; this.childNodes = []; this.parentNode = null; this.attributes = {};
      this.classList = {
        contains: value => this.className.split(/\s+/).includes(value),
        add: (...values) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...values])].join(' '); },
        remove: (...values) => { this.className = this.className.split(/\s+/).filter(value => !values.includes(value)).join(' '); },
      };
      if (text) this.textContent = text;
    }
    get children() { return this.childNodes.filter(node => node.nodeType === 1); }
    get firstChild() { return this.childNodes[0] || null; }
    get nextSibling() { return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this) + 1] || null; }
    get textContent() { return this.childNodes.map(node => node.nodeType === 3 ? node.nodeValue : node.textContent).join(''); }
    set textContent(value) {
      const removed = this.childNodes; removed.forEach(node => { node.parentNode = null; });
      this.childNodes = String(value) ? [{ nodeType: 3, nodeValue: String(value), parentNode: this, nextSibling: null }] : [];
      // DOM replace-all emits childList even for the same nonempty string.
      if (removed.length || this.childNodes.length) changed(this, this.childNodes, removed);
      this.textWrites = (this.textWrites || 0) + 1;
    }
    set innerHTML(value) { this.textContent = value; }
    appendChild(node) { if (node.parentNode) node.remove?.(); node.parentNode = this; this.childNodes.push(node); changed(this, [node]); return node; }
    insertBefore(node, next) { node.parentNode = this; const index = this.childNodes.indexOf(next); this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, node); changed(this, [node]); return node; }
    insertAdjacentElement(position, node) { assert.equal(position, 'afterend'); return this.parentNode.insertBefore(node, this.nextSibling); }
    remove() { const parent = this.parentNode; if (!parent) return; parent.childNodes.splice(parent.childNodes.indexOf(this), 1); this.parentNode = null; changed(parent, [], [this]); }
    contains(node) { return node === this || this.childNodes.some(child => child === node || child.contains?.(node)); }
    getAttribute(name) { return name === 'id' ? this.id || null : this.attributes[name] ?? null; }
    setAttribute(name, value) { if (name === 'id') this.id = String(value); else this.attributes[name] = String(value); }
    matches(selector) {
      if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
      const not = selector.match(/:not\(([^)]+)\)/); if (not && this.matches(not[1])) return false;
      selector = selector.replace(/:not\([^)]+\)/g, '');
      const id = selector.match(/#([\w-]+)/); if (id && this.id !== id[1]) return false;
      if ([...selector.matchAll(/\.([\w-]+)/g)].some(([, value]) => !this.classList.contains(value))) return false;
      if ([...selector.matchAll(/\[([^\]=]+)(?:=["']?([^\]"']+)["']?)?\]/g)].some(([, name, value]) => this.getAttribute(name) === null || value !== undefined && this.getAttribute(name) !== value)) return false;
      const tag = selector.match(/^[\w-]+/); return !tag || this.tagName === tag[0].toUpperCase();
    }
    closest(selector) { for (let node = this; node; node = node.parentNode) if (node.matches?.(selector)) return node; return null; }
    querySelectorAll(selector) {
      if (selector.includes(',')) return [...new Set(selector.split(',').flatMap(part => this.querySelectorAll(part.trim())))];
      const parts = selector.trim().split(/\s+/), last = parts.pop(), found = [];
      function visit(parent) { for (const child of parent.children) { if (child.matches(last) && (!parts.length || child.parentNode?.closest(parts.join(' ')))) found.push(child); visit(child); } }
      visit(this); return found;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    addEventListener() {}
  }
  const root = new Element('html'), body = root.appendChild(new Element('body'));
  const topbar = body.appendChild(new Element('div', 'topbar'));
  const trackList = body.appendChild(new Element()); trackList.id = 'trackList';
  const sharedTrackList = body.appendChild(new Element()); sharedTrackList.id = 'sharedTrackList';
  const save = topbar.appendChild(new Element('button', '', 'Save')); save.id = 'saveBtn';
  const status = topbar.appendChild(new Element('span', 'local-chip', 'Saved'));
  const document = {
    documentElement: root, body, visibilityState: 'visible',
    createElement: tag => new Element(tag), querySelector: selector => root.querySelector(selector), querySelectorAll: selector => root.querySelectorAll(selector),
    getElementById(id) { const actual = root.querySelector('#' + id); if (actual) return actual; if (/^mancardoPrivateSync/.test(id)) { if (!fallback.has(id)) fallback.set(id, new Element()); return fallback.get(id); } return null; },
    addEventListener: addEvent,
  };
  return { document, Element, trackList, sharedTrackList, save, status, observers,
    get mutations() { return mutations; },
    emit(type, event = {}) { for (const fn of events[type] || []) fn(event); },
    MutationObserver: class { constructor(fn) { this.fn = fn; this.targets = []; this.records = []; this.scheduled = false; observers.push(this); } observe(node, options) { assert.ok(node, 'Cannot observe a missing DOM node'); this.targets.push({ node, options }); } disconnect() { this.targets = []; this.records = []; } },
  };
}

function fakeIndexedDB(stores, beforeRead = async () => {}) {
  return { open() {
    const request = {};
    setImmediate(() => {
      request.result = { close() {}, transaction() {
        const tx = { pending: 0, closed: false, abort() { this.closed = true; setImmediate(() => this.onabort?.()); } };
        function complete() { if (!tx.pending && !tx.closed) { tx.closed = true; tx.oncomplete?.(); } }
        tx.objectStore = name => {
          const store = stores[name]; assert.ok(store, 'Unknown object store ' + name);
          function run(action, key, operation) {
            const result = {}; tx.pending++;
            setImmediate(async () => {
              try { if (action === 'get') await beforeRead(name, key); result.result = clone(operation()); result.onsuccess?.(); }
              catch (error) { result.error = error; result.onerror?.(); tx.error = error; tx.onerror?.(); }
              finally { tx.pending--; setImmediate(complete); }
            });
            return result;
          }
          return { get: key => run('get', key, () => store.get(key)), getAll: () => run('getAll', null, () => [...store.values()]), put: value => run('put', value.key, () => { store.set(value.key, clone(value)); return value.key; }), delete: key => run('delete', key, () => store.delete(key)) };
        };
        setImmediate(complete); return tx;
      } };
      request.onsuccess?.();
    });
    return request;
  } };
}

function platform(ui, time, storage) {
  const handlers = {}, events = [];
  const context = {
    ...time.globals, document: ui.document, MutationObserver: ui.MutationObserver, navigator: { onLine: true }, Event, TextEncoder, Uint8Array,
    console: { warn() {} },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    // A deterministic implementation of the platform SHA-256 primitive.
    crypto: { subtle: { async digest(algorithm, bytes) { assert.equal(algorithm, 'SHA-256'); const buffer = createHash('sha256').update(Buffer.from(bytes)).digest(); return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength); } } },
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    dispatchEvent(event) { events.push({ type: event.type, time: time.now }); for (const fn of handlers[event.type] || []) fn(event); return true; },
    // The extracted IIFEs call these surrounding editor hooks. Their relevant
    // side effects are local persistence/rendering, not sync/network behavior.
    deepClone: clone, render() {}, renderLibrary() {}, refreshDock() {}, loadItem() {}, uid: () => 'synthetic-conflict-copy', confirmTimers: {},
  };
  context.window = context;
  return { context, events };
}

async function sharedFixture(options = {}) {
  const ui = dom(), time = clock(), storage = new Map([[LIB, '[]']]);
  const { context, events } = platform(ui, time, storage);
  const remote = [{ id: 'shared-one', name: 'Synthetic shared route', note: 'Unchanged synthetic note' }];
  let card;
  if (options.hasNote !== false) {
    card = ui.sharedTrackList.appendChild(new ui.Element('div', 'shared-item'));
    card.setAttribute('data-mancardo-shared-note', remote[0].note);
    card.appendChild(new ui.Element('span', 'shared-item-name', remote[0].name));
    card.appendChild(new ui.Element('div', 'shared-item-meta', 'v1'));
    card.appendChild(new ui.Element('div', 'shared-item-note', remote[0].note));
  }
  if (options.hidden) ui.sharedTrackList.classList.add('hidden');
  const requests = [], held = deferred(); let active = 0, peak = 0;
  context.state = { current: null, sharedPreview: false, sharedLibrary: [], library: [] }; context.els = { saveBtn: ui.save, sharedTrackList: ui.sharedTrackList };
  context.SHARED_API = ''; context.STORAGE_KEY = LIB; context.els.sharedUserSelect = { value: 'Synthetic publisher' };
  context.fetch = async (url, settings = {}) => {
    requests.push({ url, method: settings.method || 'GET', time: time.now }); active++; peak = Math.max(peak, active);
    const snapshot = clone(remote);
    if (settings.method === 'POST' && url === '/api/tracks/shared-one/publish') {
      try { const payload = JSON.parse(settings.body); assert.match(payload.gpx, /<mancardoNote>/); remote[0].note = payload.gpx.match(/<mancardoNote>([^<]*)<\/mancardoNote>/)[1]; return Response.json({ id: 'shared-one', version: 2 }); } finally { active--; }
    }
    assert.equal(url, '/api/tracks', 'Note decoration must not access private account APIs');
    assert.equal(settings.method || 'GET', 'GET');
    try {
      if (options.pending) await held.promise;
      if (options.rejection) throw new Error('Synthetic shared-list network failure');
      return Response.json({ tracks: snapshot }, { status: options.nonOK ? 503 : 200 });
    } finally { active--; }
  };
  vm.createContext(context);
  vm.runInContext(scripts.escape + '\n' + scripts.sharedLoader + '\n' + scripts.sharedRender + '\n' + scripts.cornerWaypoints + '\n' + scripts.buildGpx + '\n' + scripts.persistLibrary + '\n' + scripts.sharedNotePublish, context, { filename: 'emitted-shared-loader-render.js' });
  vm.runInContext(scripts.notes, context, { filename: 'emitted-stable-note-ui.js' });
  if (options.saveTimer) vm.runInContext(scripts.save, context, { filename: 'emitted-save-state.js' });
  return { ui, time, context, events, requests, remote, card, held, get active() { return active; }, get peak() { return peak; },
    wake() { context.dispatchEvent(new Event('focus')); context.dispatchEvent(new Event('online')); ui.emit('visibilitychange'); },
  };
}

for (const options of [{ hasNote: false }, {}, { hidden: true }, { hasNote: false, saveTimer: true }, { saveTimer: true }]) {
  test('shared decoration has a fixed 10-second GET budget ' + JSON.stringify(options), async () => {
    const f = await sharedFixture(options); await f.time.runFor(10000);
    assert.equal(f.requests.length, 0, 'DOM decoration and real Save-state writes must not initiate any GETs');
    assert.equal(f.peak, 0);
    assert.equal(f.active, 0);
    if (f.card) {
      assert.equal(f.card.querySelector('.shared-item-note').textContent, f.remote[0].note);
      assert.equal(f.card.querySelector('.shared-item-note').textWrites, 1, 'An unchanged note must not replace its text child');
      assert.ok(f.card.querySelector('.mancardo-note-icon'), 'Healthy note decoration still adds its icon');
    }
  });
}

for (const failure of ['pending', 'nonOK', 'rejection']) {
  test('100 unrelated DOM mutations cannot grow shared requests after ' + failure, async () => {
    const f = await sharedFixture({ [failure]: true, saveTimer: true }); f.context.loadSharedLibrary(); await f.time.runFor(1000);
    for (let i = 0; i < 100; i++) { f.ui.status.textContent = 'Status ' + i; await f.time.runFor(10); }
    await f.time.runFor(8000);
    assert.equal(f.requests.length, 1);
    assert.equal(f.peak, 1);
    assert.equal(f.active, failure === 'pending' ? 1 : 0);
    assert.equal(f.ui.sharedTrackList.querySelector('.shared-item-note'), null, 'Failed or pending canonical load must not invent remote notes');
  });
}

test('shared lifecycle wakes are decoration-only, with no acquisition', async () => {
  const f = await sharedFixture(); await f.time.runFor(1000);
  for (let i = 0; i < 25; i++) f.wake(); await f.time.runFor(61000);
  assert.equal(f.requests.length, 0);
  assert.equal(f.card.querySelector('.shared-item-note').textContent, 'Unchanged synthetic note');
});

test('canonical shared refresh coalesces unresolved calls and delivers fresh exact-row notes', async () => {
  const f = await sharedFixture({ pending: true });
  const first = f.context.loadSharedLibrary(); await settle(); let joinedFinished = false;
  const joined = Array.from({ length: 25 }, () => f.context.loadSharedLibrary());
  assert.ok(joined.every(promise => promise && typeof promise.then === 'function'), 'Each caller receives the actual completion promise');
  Promise.all(joined).then(() => { joinedFinished = true; });
  for (let i = 0; i < 25; i++) f.wake(); await f.time.runFor(10000);
  assert.equal(f.requests.length, 1); assert.equal(f.active, 1); assert.equal(joinedFinished, false);
  f.held.resolve(); await first; await Promise.all(joined); await f.time.runFor(500);
  assert.equal(f.requests.length, 2, 'Refreshes arriving after acquisition starts coalesce into one later read');
  assert.equal(f.ui.sharedTrackList.querySelector('.shared-item-note').textContent, f.remote[0].note);
  f.remote[0].note = 'A newer shared note';
  f.remote.push({ id: 'shared-two', name: f.remote[0].name, note: 'Different same-name note' });
  await f.context.loadSharedLibrary(); await f.time.runFor(500);
  assert.equal(f.requests.length, 3); assert.equal(f.peak, 1);
  assert.deepEqual(f.ui.sharedTrackList.querySelectorAll('.shared-item-note').map(node => node.textContent), ['A newer shared note', 'Different same-name note'], 'Same-named tracks must retain their own notes, never name-match another row');
  f.remote[0].note = ''; await f.context.loadSharedLibrary(); await f.time.runFor(500);
  const cards = f.ui.sharedTrackList.querySelectorAll('.shared-item');
  assert.equal(cards[0].querySelector('.shared-item-note'), null); assert.equal(cards[0].querySelector('.mancardo-note-icon'), null);
  assert.equal(cards[1].querySelector('.shared-item-note').textContent, 'Different same-name note');
  assert.equal(f.requests.length, 4);
});

for (const failure of ['nonOK', 'rejection']) {
  test('canonical shared refresh unlocks after settled ' + failure + ' without automatic retry', async () => {
    const options = { [failure]: true }, f = await sharedFixture(options);
    await f.context.loadSharedLibrary(); await f.time.runFor(10000);
    assert.equal(f.requests.length, 1); assert.equal(f.active, 0);
    options[failure] = false; await f.context.loadSharedLibrary(); await f.time.runFor(500);
    assert.equal(f.requests.length, 2); assert.equal(f.ui.sharedTrackList.querySelector('.shared-item-note').textContent, 'Unchanged synthetic note');
  });
}

async function privateFixture(options = {}) {
  const ui = dom(), time = clock(), original = sampleTrack();
  const local = options.tracks !== undefined ? clone(options.tracks) : [clone(original)];
  const extra = options.extraTrack ? { ...sampleTrack(), id: 'fixture-two', name: 'Separate queued route' } : null;
  if (extra) local.push(clone(extra));
  if (options.dirty && local[0]) local[0].name = 'Edited local route';
  const storage = new Map([[LIB, JSON.stringify(local)], [PENDING, JSON.stringify(options.pending || [])], ['mancardo_private_device_id_v1', 'synthetic-device']]);
  const stores = { meta: new Map([['boundAccountKey', { key: 'boundAccountKey', value: OWNER }]]), sync: new Map([[OWNER + '|' + original.id, { key: OWNER + '|' + original.id, accountKey: OWNER, id: original.id, revision: 4, sha256: hash(original), deleted: false }]]), outbox: new Map() };
  if (extra) stores.sync.set(OWNER + '|' + extra.id, { key: OWNER + '|' + extra.id, accountKey: OWNER, id: extra.id, revision: 7, sha256: hash(extra), deleted: false });
  const { context, events } = platform(ui, time, storage);
  const requests = [], held = deferred(), entered = deferred(); let pulled = false, holdUsed = false, nextId = 0;
  let hashGate = null, hashFailure = null;
  const digest = context.crypto.subtle.digest;
  context.crypto.subtle.digest = async (...args) => {
    if (hashFailure) throw hashFailure;
    if (hashGate && hashGate.skip-- === 0) { const gate = hashGate; hashGate = null; gate.entered.resolve(); await gate.release.promise; }
    return digest(...args);
  };
  const model = { account: options.account || OWNER, healthFailure: options.healthFailure, failure: options.failure, deleteResult: options.deleteResult || '503', row: { track_id: original.id, revision: 4, sha256: hash(original), deleted: false, track: clone(original), device_id: 'origin', updated_at: 1 } };
  if (extra) model.extraRow = { track_id: extra.id, revision: 7, sha256: hash(extra), deleted: false, track: clone(extra), device_id: 'origin', updated_at: 1 };
  async function pause(stage) { if (options.hold === stage && !holdUsed) { holdUsed = true; entered.resolve(); await held.promise; } }
  context.state = { library: local, currentId: null, current: null };
  context.els = {}; context.uid = () => 'synthetic-copy-' + ++nextId;
  context.navigator.onLine = options.online !== false;
  context.persistLibrary = () => storage.set(LIB, JSON.stringify(context.state.library));
  context.indexedDB = fakeIndexedDB(stores, async name => { if (pulled && name === 'sync') await pause('merge'); });
  context.fetch = async (url, settings = {}) => {
    const parsed = new URL(url, 'https://fixture.test'), method = settings.method || 'GET', body = settings.body ? JSON.parse(settings.body) : null;
    const record = { path: parsed.pathname, method, time: time.now, body, owner: settings.headers?.['x-mancardo-delete-account'] }; requests.push(record);
    if (parsed.pathname === '/api/private-library/health') {
      await pause('health');
      if (model.failure === 'health') throw new Error('Synthetic health rejection');
      return Response.json({ authenticated: !model.healthFailure, authConfigured: true, storageReady: !model.healthFailure, accountKey: model.account }, { status: model.healthFailure ? 503 : 200 });
    }
    if (parsed.pathname.startsWith('/api/private-library/tracks') && method !== 'DELETE') assert.equal(settings.headers['x-mancardo-private-account'], OWNER, 'Track requests stay pinned to the durable workspace owner');
    if (parsed.pathname === '/api/private-library/tracks') {
      assert.equal(method, 'GET'); const snapshot = clone([model.row, ...(model.extraRow ? [model.extraRow] : [])]); await pause('pull');
      if (model.failure === 'pull') throw new Error('Synthetic pull rejection');
      pulled = true; return Response.json({ items: snapshot, has_more: false });
    }
    const rowKey = extra && parsed.pathname.endsWith('/' + extra.id) ? 'extraRow' : 'row';
    assert.equal(parsed.pathname, '/api/private-library/tracks/' + model[rowKey].track_id);
    if (method === 'DELETE') {
      assert.equal(record.owner, OWNER, 'Retry must retain the original authorized account');
      assert.equal(body.base_revision, 4, 'Retry must never acquire a newer deletion revision');
      assert.equal(body.authorized_user_delete, true);
      if (model.deleteResult === 'never') await new Promise(() => {});
      if (options.deleteDelay) await new Promise(resolve => context.setTimeout(resolve, options.deleteDelay));
      if (model.deleteResult === 'rejection') throw new Error('Synthetic delete rejection');
      if (model.deleteResult === 'success') { model.row = { ...model.row, revision: 5, deleted: true, track: null }; return Response.json({ deleted: true, revision: 5 }); }
      if (model.deleteResult === 'live409') { model.row = { ...model.row, revision: 5, track: { ...original, note: 'Newer cloud note' } }; model.row.sha256 = hash(model.row.track); return Response.json({ code: 'revision_conflict', current: { revision: 5, deleted: false } }, { status: 409 }); }
      if (model.deleteResult === 'tombstone409') { model.row = { ...model.row, revision: 5, deleted: true, track: null }; return Response.json({ code: 'revision_conflict', current: { revision: 5, deleted: true } }, { status: 409 }); }
      return Response.json({ error: 'Synthetic unavailable' }, { status: 503 });
    }
    if (method === 'GET') return Response.json(clone(model[rowKey]));
    assert.equal(method, 'PUT'); await pause('upload');
    if (model.failure === 'upload' || rowKey === 'extraRow' && model.failure === 'extraUpload') throw new Error('Synthetic upload rejection');
    assert.equal(body.base_revision, model[rowKey].revision);
    model[rowKey] = { track_id: model[rowKey].track_id, revision: model[rowKey].revision + 1, sha256: hash(body.track), track: clone(body.track), deleted: false, device_id: body.device_id, updated_at: time.now };
    return Response.json(clone(model[rowKey]));
  };
  vm.createContext(context);
  if (options.cloud !== false) vm.runInContext(scripts.cloud, context, { filename: 'emitted-cloud-sync.js' });
  if (options.deletion) vm.runInContext(scripts.deletion, context, { filename: 'emitted-durable-delete.js' });
  await settle();
  return { ui, time, storage, stores, context, events, requests, model, held, entered,
    sync: () => ui.document.getElementById('mancardoPrivateSyncNow').onclick(),
    count: kind => requests.filter(row => kind === 'health' ? row.path.endsWith('/health') : kind === 'pull' ? row.path === '/api/private-library/tracks' : row.method === kind).length,
    pending: () => JSON.parse(storage.get(PENDING)),
    pauseHashAfter(skip = 0) { const gate = { skip, entered: deferred(), release: deferred() }; hashGate = gate; return gate; },
    setHashFailure(error) { hashFailure = error; },
    holdNext(stage) { options.hold = stage; holdUsed = false; },
  };
}

for (const failure of ['503', 'rejection']) {
  test('settled durable DELETE ' + failure + ' retries only at 15-second cadence', async () => {
    const f = await privateFixture({ cloud: false, deletion: true, tracks: [], pending: [intent()], deleteResult: failure });
    await f.time.runFor(14999); assert.equal(f.count('DELETE'), 1); assert.equal(f.count('health'), 1);
    await f.time.runFor(1); assert.equal(f.count('DELETE'), 2);
    await f.time.runFor(16000); assert.equal(f.count('DELETE'), 3); assert.equal(f.count('health'), 3);
    assert.deepEqual(f.requests.filter(row => row.method === 'DELETE').map(row => row.time), [0, 15000, 30000]);
    assert.deepEqual(f.pending(), [intent()], 'Failed operations must retain the original durable intent');
    assert.deepEqual(f.events, [], 'Failure must not synthesize online or reconciliation notifications');
  });
}

for (const options of [{ pending: [] }, { pending: [{ ...intent(), confirmedRevision: 5 }] }, { online: false }, { healthFailure: true }, { account: 'synthetic-owner-B' }]) {
  test('durable no-delete traffic control ' + JSON.stringify(options), async () => {
    const f = await privateFixture({ cloud: false, deletion: true, tracks: [], pending: [intent()], ...options }); await f.time.runFor(31000);
    assert.equal(f.count('DELETE'), 0);
    assert.equal(f.count('health'), options.healthFailure || options.account ? 3 : 0);
    assert.deepEqual(f.events, []);
    if (options.account) { assert.equal(f.pending()[0].accountKey, OWNER); assert.equal(f.stores.meta.get('boundAccountKey').value, OWNER); }
  });
}

test('a never-settling durable DELETE remains single-flight across retry timers and real online wakes', async () => {
  const f = await privateFixture({ cloud: false, deletion: true, tracks: [], pending: [intent()], deleteResult: 'never' });
  for (let i = 0; i < 20; i++) f.context.dispatchEvent(new Event('online'));
  await f.time.runFor(61000);
  assert.equal(f.count('DELETE'), 1); assert.equal(f.count('health'), 1); assert.deepEqual(f.pending(), [intent()]);
});

test('delayed settled failure does not restart DELETE at completion plus 100ms', async () => {
  const f = await privateFixture({ cloud: false, deletion: true, tracks: [], pending: [intent()], deleteDelay: 500 });
  await f.time.runFor(14999); assert.equal(f.count('DELETE'), 1); assert.deepEqual(f.events, []);
  await f.time.runFor(15001); assert.ok(f.count('DELETE') >= 2 && f.count('DELETE') <= 3);
  const times = f.requests.filter(row => row.method === 'DELETE').map(row => row.time);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 15000);
});

for (const outcome of ['success', 'tombstone409', 'live409']) {
  test('durable ' + outcome + ' performs one finite reconciliation and preserves same-owner semantics', async () => {
    const f = await privateFixture({ deletion: true, tracks: [], pending: [intent()], deleteResult: outcome }); await f.time.runFor(31000);
    assert.equal(f.count('DELETE'), 1); assert.equal(f.count('PUT'), 0);
    assert.equal(f.events.filter(event => event.type === 'online').length, 0, 'Reconciliation must not impersonate network restoration');
    assert.equal(f.events.length, 1, 'Exactly one meaningful dedicated reconciliation notification');
    assert.ok(f.count('pull') >= 1 && f.count('pull') <= 2, 'Dedicated notification must reach the real cloud client without a feedback loop');
    if (outcome === 'live409') {
      assert.deepEqual(f.pending(), []);
      assert.equal(f.context.state.library.length, 1);
      assert.equal(f.context.state.library[0].note, 'Newer cloud note');
      assert.equal(f.stores.sync.get(OWNER + '|fixture-one').revision, 5);
    } else { assert.equal(f.pending()[0].confirmedRevision, 5); assert.equal(f.context.state.library.length, 0); }
  });
}

async function waitFor(predicate, message) {
  for (let i = 0; i < 300; i++) { if (predicate()) return; await tick(); }
  assert.fail(message);
}

for (const phase of ['health', 'upload', 'pull', 'merge']) {
  test('whole-sync single flight covers held ' + phase + ' and all callers await completion', async () => {
    const f = await privateFixture({ hold: phase, dirty: phase === 'upload' });
    let entered = false; f.entered.promise.then(() => { entered = true; });
    const first = f.sync(); await waitFor(() => entered, 'Expected held ' + phase + ' phase');
    let secondDone = false; const second = f.sync().then(value => { secondDone = true; return value; });
    await settle();
    assert.equal(secondDone, false, 'A concurrent caller must wait for actual whole-sync completion');
    assert.equal(f.count('health'), 1, 'Concurrent calls must not repeat health');
    assert.equal(f.count('PUT'), phase === 'upload' ? 1 : 0);
    assert.equal(f.count('pull'), ['pull', 'merge'].includes(phase) ? 1 : 0);
    f.held.resolve(); assert.deepEqual(await Promise.all([first, second]), [true, true]);
    assert.equal(f.count('health'), 1); assert.equal(f.count('pull'), 1);
    assert.equal(f.stores.meta.get('boundAccountKey').value, OWNER);
    assert.ok([...f.stores.sync.keys()].every(key => key.startsWith(OWNER + '|')));
    assert.equal(await f.sync(), true, 'The lock must release after successful completion');
    assert.equal(f.count('health'), 2); assert.equal(f.count('pull'), 2);
  });
}

for (const phase of ['health', 'pull']) {
  test('whole-sync lock releases after settled ' + phase + ' failure', async () => {
    const f = await privateFixture({ failure: phase }); await f.sync();
    assert.equal(f.count('health'), 1); assert.equal(f.count('PUT'), 0);
    f.model.failure = null;
    assert.equal(await f.sync(), true);
    assert.equal(f.count('health'), 2); assert.equal(f.count('pull'), phase === 'pull' ? 2 : 1);
  });
}

for (const phase of ['health', 'pull']) {
  test('never-completing ' + phase + ' remains one whole sync through two minutes of scheduled wakes', async () => {
    const f = await privateFixture({ hold: phase });
    let entered = false, completed = 0; f.entered.promise.then(() => { entered = true; });
    f.sync().then(() => completed++); await waitFor(() => entered, 'Expected held phase');
    for (let i = 0; i < 20; i++) { f.sync().then(() => completed++); f.context.dispatchEvent(new Event('online')); }
    await f.time.runFor(121000);
    assert.equal(f.count('health'), 1); assert.equal(f.count('pull'), phase === 'pull' ? 1 : 0); assert.equal(f.count('PUT'), 0);
    assert.equal(completed, 0, 'Do not report a joined request finished while its underlying request is unresolved');
  });
}


test('a publish completed during a held stale shared GET schedules one fresh canonical refresh', async () => {
  const f = await sharedFixture({ pending: true });
  const initial = f.context.loadSharedLibrary(); await settle();
  const item = { ...sampleTrack(), sharedId: 'shared-one', sharedBaseVersion: 1, note: 'Published while GET was held' };
  f.context.state.library = [item]; f.context.mancardoSyncSharedNote(item, false); await settle();
  assert.equal(f.requests.filter(row => row.method === 'POST').length, 1);
  f.held.resolve(); await initial; await f.time.runFor(500);
  assert.equal(f.requests.filter(row => row.method === 'GET').length, 2, 'The pre-publish GET snapshot must not consume the post-publish refresh');
  assert.equal(f.ui.sharedTrackList.querySelector('.shared-item-note').textContent, item.note);
});

test('a standalone upload drains a later queued edit after its first upload snapshot', async () => {
  const f = await privateFixture({ hold: 'upload' }); assert.equal(await f.sync(), true);
  await f.time.runFor(1000); // Consume the real startup timer before exercising standalone scans.
  f.context.state.library[0].name = 'First queued edit'; f.context.persistLibrary();
  await f.time.runFor(1300); assert.equal(f.count('PUT'), 1);
  f.context.state.library[0].name = 'Later queued edit'; f.context.persistLibrary();
  await f.time.runFor(1300); assert.equal(f.count('PUT'), 1, 'The second edit joins, not overlaps, the held upload');
  f.held.resolve(); await settle();
  assert.equal(f.count('PUT'), 2, 'A joined upload must not leave its newer queued edit stranded until another wake');
  assert.equal(f.model.row.track.name, 'Later queued edit');
  assert.equal(f.model.row.revision, 6); assert.equal(f.stores.outbox.size, 0);
});

test('delete cancellation during a held old private pull queues one fresh reconciliation', async () => {
  const f = await privateFixture({ hold: 'pull', deletion: true, deleteResult: 'live409' });
  const initial = f.sync(); await waitFor(() => f.count('pull') === 1, 'Expected old private pull snapshot');
  assert.equal(await f.context.mancardoAuthorizedDelete(['fixture-one']), true);
  assert.deepEqual(f.pending(), []); assert.equal(f.count('DELETE'), 1); assert.equal(f.count('pull'), 1);
  f.held.resolve(); await initial; await f.time.runFor(500);
  assert.equal(f.count('pull'), 2, 'Cancellation must be reconciled after an already-running stale pull');
  assert.equal(f.count('PUT'), 0); assert.equal(f.count('DELETE'), 1);
  assert.equal(f.context.state.library[0].note, 'Newer cloud note');
  assert.equal(f.stores.sync.get(OWNER + '|fixture-one').revision, 5);
});


for (const options of [{ healthFailure: true }, { account: 'synthetic-owner-B' }]) {
  test('whole sync never uploads or pulls after a disallowed health result ' + JSON.stringify(options), async () => {
    const f = await privateFixture({ ...options, dirty: true }); const local = clone(f.context.state.library);
    assert.equal(await f.sync(), false); assert.equal(f.count('health'), 1); assert.equal(f.count('PUT'), 0); assert.equal(f.count('pull'), 0);
    assert.deepEqual(clone(f.context.state.library), local); assert.equal(f.stores.meta.get('boundAccountKey').value, OWNER);
    assert.ok([...f.stores.sync.keys()].every(key => key.startsWith(OWNER + '|')));
  });
}

test('settled upload failure leaves durable work but does not autonomously spin the drain', async () => {
  const f = await privateFixture({ failure: 'upload', dirty: true });
  assert.equal(await f.sync(), false); assert.ok(f.count('PUT') >= 1 && f.count('PUT') <= 2, 'Only the two existing whole-sync upload phases may attempt the failed operation');
  assert.equal(f.stores.outbox.size, 1); const before = f.count('PUT'); await settle(); assert.equal(f.count('PUT'), before);
  f.model.failure = null; assert.equal(await f.sync(), true); assert.equal(f.model.row.track.name, 'Edited local route'); assert.equal(f.stores.outbox.size, 0);
});


for (const joining of ['explicit sync', 'dedicated reconciliation']) {
  test(joining + ' handles rejected standalone pre-upload hashing and allows a later explicit recovery', async () => {
    const f = await privateFixture(); assert.equal(await f.sync(), true); await f.time.runFor(1000);
    const beforeHealth = f.count('health'), beforePull = f.count('pull');
    f.context.state.library[0].name = 'Durable edit before failed digest'; f.context.persistLibrary();
    // The scheduleScan digest succeeds and saves the outbox operation. The next
    // digest belongs to the actual standalone drain's pre-upload queueScan.
    const gate = f.pauseHashAfter(1); let entered = false; gate.entered.promise.then(() => { entered = true; });
    await f.time.runFor(1300); assert.equal(entered, true); assert.equal(f.stores.outbox.size, 1); assert.equal(f.count('PUT'), 0);
    const localBefore = clone(f.context.state.library), outboxBefore = clone([...f.stores.outbox.values()]);
    let joined;
    if (joining === 'explicit sync') joined = f.sync();
    else {
      f.setHashFailure(new Error('Synthetic persistent digest failure'));
      f.context.dispatchEvent(new Event('mancardo:private-reconcile'));
    }
    gate.release.reject(new Error('Synthetic standalone digest rejection'));
    if (joined) assert.equal(await joined, false, 'A joined prerequisite failure must resolve as a handled failed sync, not reject outside the coordinator');
    await f.time.runFor(10000);
    assert.deepEqual(clone(f.context.state.library), localBefore); assert.deepEqual(JSON.parse(f.storage.get(LIB)), localBefore);
    assert.deepEqual(clone([...f.stores.outbox.values()]), outboxBefore, 'A failed pre-upload digest must not discard or relabel durable queued content');
    assert.equal(f.count('PUT'), 0); assert.equal(f.count('pull'), beforePull);
    assert.ok(f.count('health') <= beforeHealth + (joining === 'explicit sync' ? 0 : 1), 'A failed prerequisite must not create an automatic retry storm');
    assert.ok(['offline', 'signin', 'setup'].includes(f.ui.document.getElementById('mancardoPrivateSyncChip').dataset.state), 'A handled failure must not leave the UI claiming Synced or Syncing');
    assert.equal(f.stores.meta.get('boundAccountKey').value, OWNER);
    f.setHashFailure(null); assert.equal(await f.sync(), true, 'Failed upload/sync/reconciliation locks must release for explicit retry');
    assert.equal(f.model.row.track.name, 'Durable edit before failed digest'); assert.equal(f.model.row.revision, 5);
    assert.equal(f.count('PUT'), 1); assert.equal(f.stores.outbox.size, 0);
  });
}


test('delete cancellation still reconciles after an active sync returns false for another failed PUT', async () => {
  const f = await privateFixture({ extraTrack: true, deletion: true, deleteResult: 'live409' });
  assert.equal(await f.sync(), true); await f.time.runFor(1000);
  const beforePull = f.count('pull');
  const other = f.context.state.library.find(track => track.id === 'fixture-two');
  other.name = 'Unsynced separate edit'; f.context.persistLibrary(); f.model.failure = 'extraUpload'; f.holdNext('pull');
  const initial = f.sync(); await waitFor(() => f.count('pull') === beforePull + 1, 'Expected old private pull after separate failed PUT');
  assert.equal(f.count('PUT'), 1); assert.equal(await f.context.mancardoAuthorizedDelete(['fixture-one']), true);
  assert.deepEqual(f.pending(), []); f.held.resolve(); assert.equal(await initial, false);
  await f.time.runFor(500);
  assert.equal(f.count('pull'), beforePull + 2, 'A still-ready sync with another pending PUT must not suppress the one required cancellation reconciliation');
  assert.equal(f.count('DELETE'), 1); assert.equal(f.count('PUT'), 4, 'Exactly two upload phases in each of the two finite full syncs');
  assert.equal(f.context.state.library.find(track => track.id === 'fixture-one').note, 'Newer cloud note');
  assert.equal(f.context.state.library.find(track => track.id === 'fixture-two').name, 'Unsynced separate edit');
  assert.equal(f.stores.sync.get(OWNER + '|fixture-one').revision, 5);
  assert.equal(f.stores.outbox.size, 1); assert.equal(f.stores.outbox.get(OWNER + '|fixture-two').track.name, 'Unsynced separate edit');
  await f.time.runFor(10000);
  assert.equal(f.count('pull'), beforePull + 2); assert.equal(f.count('DELETE'), 1);
  assert.ok(f.count('PUT') <= 5, 'Only the already-scheduled edit scan may add one bounded attempt; reconciliation must not spin');
  f.model.failure = null; assert.equal(await f.sync(), true); assert.equal(f.model.extraRow.track.name, 'Unsynced separate edit'); assert.equal(f.stores.outbox.size, 0);
});

test('cadence transformation accepts the actual unmodified base Worker output', () => {
  const repaired = cadenceRepair(anchorHtml);
  assert.match(repaired, /data-mancardo-shared-note/); assert.match(repaired, /function runSyncNow/);
});

const anchorCases = [
  ['note script', /<script id="mancardo-stable-note-ui">[\s\S]*?<\/script>/],
  ['shared decorator', /^  function decorateShared\(\)\{[^\n]*\}$/m],
  ['document observer', /^  new MutationObserver\(function\(\)\{setTimeout\(function\(\)\{decorateLocal\(\);decorateShared\(\)[^\n]*$/m],
  ['canonical shared loader', /function loadSharedLibrary\(\)\{[\s\S]*?\n\}\nvar sharedPreviewPulseLayer/],
  ['upload lifecycle', /  function flushOutbox\(\)\{/],
  ['whole-sync lifecycle', /\n\n  function syncNow\(\)\{/],
];
for (const [label, pattern] of anchorCases) {
  for (const mutation of ['missing', 'duplicate']) {
    test('cadence transformation fails closed for ' + mutation + ' ' + label + ' anchor', () => {
      const anchor = anchorHtml.match(pattern)?.[0]; assert.ok(anchor, 'Expected baseline anchor ' + label);
      const altered = anchorHtml.replace(anchor, mutation === 'missing' ? '' : anchor + '\n' + anchor);
      assert.throws(() => cadenceRepair(altered), /anchor|ambiguous|changed/i);
    });
  }
}
