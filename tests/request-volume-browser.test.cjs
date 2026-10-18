// Traffic bounds for the complete HTML emitted by the real Worker chain.
// Real Chromium DOM, clock, localStorage, IndexedDB and WebCrypto are retained.
// Only Leaflet rendering and synthetic API/CDN responses are substituted. No
// live service, account, authentication, database, or deployment is contacted.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'http://127.0.0.1:43673';
const LIB = 'switchback_local_tracks_v1';
const PENDING = 'mancardo_authorized_delete_pending_v4';
const ACCOUNT = 'synthetic-traffic-owner';
const DEVICE = 'synthetic-traffic-device';
const EPOCH = Date.parse('2026-01-01T00:00:00.000Z');
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const trackFixture = () => ({
  id: 'synthetic-traffic-route', type: 'track', name: 'Synthetic traffic route',
  segments: [[{ lat: 1, lon: 2 }, { lat: 1.001, lon: 2.001 }]], visible: true,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});
const sharedFixture = () => ({
  id: 'synthetic-shared-traffic-route', name: 'Synthetic shared traffic route',
  version: 1, modifiedBy: 'Synthetic author', modifiedAt: '2026-01-01T00:00:00.000Z',
  note: 'Synthetic initial shared note',
});
let browser, html;

// Rendering/event surface only: no editor, storage or synchronization logic.
function leafletFixture() {
  const handlers = new WeakMap();
  function layer() { handlers.set(this, {}); this.options = {}; }
  for (const name of ['setView','flyTo','fitBounds','panTo','invalidateSize','setLatLng','setLatLngs','setStyle','setIcon','bindPopup','openPopup','setContent','setOpacity','redraw','bringToFront','bringToBack','remove','clearLayers','addLayer','removeLayer','closePopup','setZoom','zoomIn','zoomOut','setZIndex']) layer.prototype[name] = function(){ return this; };
  layer.prototype.on = function(name,fn){ handlers.get(this)[name]=fn; return this; };
  layer.prototype.off = function(){return this;};
  layer.prototype.whenReady = function(fn){fn.call(this);return this;};
  layer.prototype.addControl = function(control){control.addTo(this);return this;};
  layer.prototype.removeControl = function(){return this;};
  layer.prototype.getMaxZoom = function(){return 20;};
  layer.prototype.getMinZoom = function(){return 0;};
  layer.prototype.addTo = function(target){if(this.onAdd){const el=this.onAdd(target);if(el instanceof HTMLElement){el.classList.add('leaflet-control');this._container=el;document.body.appendChild(el);}}return this;};
  layer.prototype.eachLayer = function(){};
  layer.prototype.hasLayer = function(){return false;};
  layer.prototype.getZoom = function(){return 6;};
  layer.prototype.getCenter = function(){return {lat:1,lng:2};};
  layer.prototype.getSize = function(){return {x:1200,y:800};};
  layer.prototype.getContainer = function(){return this._container||document.getElementById('mapDiv');};
  layer.prototype.getPane = function(){return document.getElementById('mapDiv');};
  layer.prototype.createPane = function(name){const el=document.createElement('div');el.id=name;document.getElementById('mapDiv').appendChild(el);return el;};
  layer.prototype.getBounds = function(){return {isValid:()=>false,contains:()=>false,pad(){return this;},getSouth:()=>0,getNorth:()=>2,getWest:()=>1,getEast:()=>3,getSouthWest:()=>({lat:0,lng:1}),getNorthEast:()=>({lat:2,lng:3})};};
  layer.prototype.latLngToContainerPoint = function(){return {x:100,y:100,distanceTo:()=>0};};
  layer.prototype.latLngToLayerPoint = layer.prototype.latLngToContainerPoint;
  layer.prototype.containerPointToLatLng = function(){return {lat:1,lng:2};};
  layer.extend = function(proto){function Sub(){layer.call(this);}Sub.prototype=Object.assign(Object.create(layer.prototype),proto);Sub.extend=layer.extend;return Sub;};
  const make=()=>new layer();
  window.L={map:make,layerGroup:make,tileLayer:make,polyline:make,marker:make,circleMarker:make,circle:make,popup:make,Polyline:layer,CircleMarker:layer,Control:layer,TileLayer:layer,divIcon:x=>x,point:(x,y)=>({x,y}),latLng:(lat,lng)=>({lat,lng,distanceTo:()=>0}),control:{scale:make},DomUtil:{create(tag,cls,parent){const el=document.createElement(tag);el.className=cls||'';if(parent)parent.appendChild(el);return el;}},DomEvent:{disableClickPropagation(){},disableScrollPropagation(){},stopPropagation(ev){ev?.stopPropagation?.();},preventDefault(ev){ev?.preventDefault?.();},on(el,event,fn){el.addEventListener(event,fn);}}};
}

test.before(async () => {
  const config = fs.readFileSync(path.join(ROOT, 'wrangler.dev.toml'), 'utf8');
  const entry = config.match(/^main\s*=\s*"([^"]+)"\s*$/m)?.[1];
  assert.equal(entry, 'worker-delete-durable-fix.js');
  const worker = (await import(pathToFileURL(process.env.MANCARDO_DELETE_TEST_ENTRY || path.join(ROOT, entry)).href)).default;
  const response = await worker.fetch(new Request(ORIGIN + '/'), {
    ASSETS: { fetch: async () => new Response(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), { headers: { 'content-type': 'text/html' } }) },
    PRIVATE_LIBRARY_DB: { prepare() { throw new Error('This fixture must not access a database'); } },
  }, { waitUntil() { throw new Error('Rendering must not schedule background work'); } });
  assert.equal(response.status, 200);
  html = await response.text();
  for (const marker of ['installMancardoPrivateCloudSync', 'installSaveStateIndicator', 'mancardoAuthorizedDelete', 'mancardo-stable-note-ui']) {
    assert.ok(html.includes(marker), 'The complete editor must include ' + marker);
  }
  browser = await chromium.launch({
    headless: true,
    ...(fs.existsSync('/usr/bin/chromium') ? { executablePath: '/usr/bin/chromium' } : {}),
    args: ['--no-sandbox'],
  });
});
test.after(async () => { await browser?.close(); });

// This polls an asynchronous observation only. It never repeats an app action,
// changes the clock, retries a test, or loosens an assertion after a failure.
async function observed(predicate, message = 'Asynchronous fixture observation did not settle') {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(message);
}

function gate() {
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const waiting = new Promise(resolve => { release = resolve; });
  return { entered, waiting, enter, release };
}

async function fixture(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const track = trackFixture(), shared = sharedFixture();
  if (options.linkedShared) Object.assign(track, { sharedId: shared.id, sharedBaseVersion: 1, note: shared.note });
  const intent = { id: track.id, accountKey: ACCOUNT, baseRevision: 4, authorizedUserDelete: true, requestedAt: EPOCH - 1000 };
  const row = { track_id: track.id, revision: 4, sha256: hash(track), deleted: false, track: clone(track), device_id: 'synthetic-origin-device', updated_at: 1 };
  const model = {
    row, shared: [shared], requests: [], unexpected: [], errors: [],
    active: Object.create(null), peak: Object.create(null), gates: Object.create(null),
    sharedStatus: options.sharedStatus || 200, deleteFailure: options.deleteFailure || null,
  };
  page.on('pageerror', error => model.errors.push(error.message));
  t.after(async () => {
    for (const held of Object.values(model.gates)) held.release();
    await context.close();
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    // No request is continued to the network, including arbitrary CDN assets.
    if (url.origin !== ORIGIN) {
      if (/leaflet.*\.js/.test(url.pathname)) return route.fulfill({ contentType: 'text/javascript', body: '(' + leafletFixture.toString() + ')();' });
      return route.fulfill({ contentType: /\.css/.test(url.pathname) ? 'text/css' : 'text/javascript', body: '' });
    }
    if (url.pathname === '/fixture-setup') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' });
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (!url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, body: '' });
    const body = request.postData() ? request.postDataJSON() : null;
    const responseRow = clone(model.row), responseShared = clone(model.shared);
    const record = { url: url.href, path: url.pathname, query: url.search, method, headers: request.headers(), body: clone(body), settled: false };
    model.requests.push(record);
    let kind = 'other';
    if (url.pathname === '/api/tracks' && method === 'GET') kind = 'shared';
    if (url.pathname === '/api/tracks/' + shared.id + '/publish' && method === 'POST' && options.linkedShared) kind = 'publish';
    if (url.pathname === '/api/private-library/health' && method === 'GET') kind = 'health';
    if (url.pathname === '/api/private-library/tracks' && method === 'GET') kind = 'pull';
    if (url.pathname === '/api/private-library/tracks/' + track.id) kind = method === 'PUT' ? 'put' : method === 'DELETE' ? 'delete' : 'get';
    record.kind = kind;
    model.active[kind] = (model.active[kind] || 0) + 1;
    model.peak[kind] = Math.max(model.peak[kind] || 0, model.active[kind]);
    try {
      const held = model.gates[kind];
      if (held) { held.enter(record); await held.waiting; }
      if (kind === 'shared') {
        return await route.fulfill({ status: model.sharedStatus, json: model.sharedStatus === 200 ? { tracks: responseShared } : { error: 'Synthetic shared outage' } });
      }
      if (kind === 'publish') {
        assert.equal(body.basedOnVersion, model.shared[0].version);
        assert.match(body.gpx, /<mancardoNote>/);
        const note = body.gpx.match(/<mancardoNote>([\s\S]*?)<\/mancardoNote>/)[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
        Object.assign(model.shared[0], { note, version: model.shared[0].version + 1, modifiedAt: '2026-01-03T00:00:00.000Z' });
        return await route.fulfill({ json: { id: shared.id, version: model.shared[0].version, modifiedAt: model.shared[0].modifiedAt } });
      }
      if (kind === 'health') return await route.fulfill({ json: { authenticated: true, authConfigured: true, storageReady: true, accountKey: ACCOUNT, accountLabel: 'Synthetic traffic owner' } });
      if (['pull', 'get', 'put'].includes(kind) && record.headers['x-mancardo-private-account'] !== ACCOUNT) {
        model.unexpected.push(record);
        return await route.fulfill({ status: 409, json: { code: 'private_account_mismatch' } });
      }
      if (kind === 'pull') return await route.fulfill({ json: { items: [responseRow], has_more: false } });
      if (kind === 'get') return await route.fulfill({ json: responseRow });
      if (kind === 'delete') {
        if (record.headers['x-mancardo-delete-account'] !== ACCOUNT || body.base_revision !== 4 || body.authorized_user_delete !== true || body.delete_intent !== 'explicit-ui-delete') {
          model.unexpected.push(record);
          return await route.fulfill({ status: 409, json: { code: 'delete_account_mismatch' } });
        }
        if (model.deleteFailure === 'network') return await route.abort('connectionreset');
        if (model.deleteFailure === '503') return await route.fulfill({ status: 503, json: { error: 'Synthetic durable delete outage' } });
      }
      if (kind === 'put' || kind === 'delete') {
        if (body.base_revision !== model.row.revision) return await route.fulfill({ status: 409, json: { code: 'revision_conflict', current: { revision: model.row.revision, deleted: model.row.deleted, content_sha256: model.row.sha256, updated_at: model.row.updated_at } } });
        model.row = {
          track_id: track.id, revision: model.row.revision + 1,
          sha256: kind === 'put' ? hash(body.track) : model.row.sha256,
          deleted: kind === 'delete', track: kind === 'put' ? clone(body.track) : null,
          device_id: body.device_id, updated_at: 2,
        };
        return await route.fulfill({ json: clone(model.row) });
      }
      if (url.pathname === '/api/shared-waypoints' && method === 'GET') return await route.fulfill({ json: { waypoints: [] } });
      model.unexpected.push(record);
      return await route.fulfill({ status: 500, json: { error: 'Unexpected fixture API request' } });
    } finally {
      model.active[kind]--;
      record.settled = true;
    }
  });
  if (options.holdShared) model.gates.shared = gate();
  await page.goto(ORIGIN + '/fixture-setup');
  await page.evaluate(async ({ track, intent, pending, LIB, PENDING, ACCOUNT, DEVICE }) => {
    localStorage.setItem(LIB, JSON.stringify(pending ? [] : [track]));
    localStorage.setItem(PENDING, JSON.stringify(pending ? [intent] : []));
    localStorage.setItem('mancardo_private_device_id_v1', DEVICE);
    const db = await new Promise((resolve, reject) => {
      const opening = indexedDB.open('mancardo_private_sync_v2', 1);
      opening.onupgradeneeded = () => { for (const name of ['meta', 'sync', 'outbox']) opening.result.createObjectStore(name, { keyPath: 'key' }); };
      opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error);
    });
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(track))))).map(byte => byte.toString(16).padStart(2, '0')).join('');
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['meta', 'sync'], 'readwrite');
      tx.objectStore('meta').put({ key: 'boundAccountKey', value: ACCOUNT });
      tx.objectStore('sync').put({ key: ACCOUNT + '|' + track.id, id: track.id, accountKey: ACCOUNT, revision: 4, sha256, deleted: false });
      tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, { track, intent, pending: !!options.pending, LIB, PENDING, ACCOUNT, DEVICE });
  await page.clock.install({ time: new Date(EPOCH) });
  await page.clock.pauseAt(new Date(EPOCH));
  await page.goto(ORIGIN + '/');
  const f = {
    page, model, track, intent,
    requests(kind) { return model.requests.filter(request => request.kind === kind); },
    writes() { return model.requests.filter(request => !['GET', 'HEAD'].includes(request.method)); },
    async tracks() { return page.evaluate(LIB => JSON.parse(localStorage.getItem(LIB) || '[]'), LIB); },
    async pending() { return page.evaluate(PENDING => JSON.parse(localStorage.getItem(PENDING) || '[]'), PENDING); },
    async advanceTo(ms) {
      const now = await page.evaluate(() => Date.now());
      assert.ok(EPOCH + ms >= now, 'Fixture clock cannot move backwards');
      await page.clock.runFor(EPOCH + ms - now);
    },
    hold(kind) { assert.ok(!model.gates[kind]); assert.equal(model.active[kind] || 0, 0); model.peak[kind] = 0; const held = gate(); model.gates[kind] = held; return held; },
    release(kind) { const held = model.gates[kind]; assert.ok(held); delete model.gates[kind]; held.release(); },
    // Call the actual installed cloud handler, not the separate capture-phase
    // sign-in/reload shim. No synchronization function is replaced or redefined.
    async startSync() {
      await page.evaluate(() => { window.__trafficSync = Promise.resolve(document.getElementById('mancardoPrivateSyncNow').onclick()); });
    },
    async finishSync() { return page.evaluate(() => window.__trafficSync); },
    async overlapSync(times = 20) {
      await page.evaluate(times => { for (let i = 0; i < times; i++) document.getElementById('mancardoPrivateSyncNow').onclick(); }, times);
    },
    async refresh(times = 1) {
      await page.locator('#refreshSharedBtn').evaluate((button, times) => { for (let i = 0; i < times; i++) button.click(); }, times);
    },
    async rename(name) {
      await page.locator('[data-track-id="' + track.id + '"] .track-more').evaluate(button => button.click());
      page.once('dialog', dialog => dialog.accept(name));
      await page.locator('[data-track-id="' + track.id + '"] .track-menu').getByRole('button', { name: 'Rename', exact: true }).evaluate(button => button.click());
    },
    async note(value) {
      await page.locator('[data-track-id="' + track.id + '"] .track-more').evaluate(button => button.click());
      await page.locator('[data-track-id="' + track.id + '"] .track-menu').getByRole('button', { name: 'Note', exact: true }).evaluate(button => button.click());
      await page.locator('[data-track-id="' + track.id + '"] .track-note textarea').evaluate((textarea, value) => { textarea.value = value; textarea.dispatchEvent(new Event('input', { bubbles: true })); }, value);
    },
    async remove() {
      await page.locator('[data-track-id="' + track.id + '"] .track-more').evaluate(button => button.click());
      page.once('dialog', dialog => dialog.accept());
      await page.locator('[data-track-id="' + track.id + '"] .mancardo-menu-delete').evaluate(button => button.click());
    },
    assertSafe() { assert.deepEqual(model.unexpected, [], 'All API requests must stay within the synthetic owner and declared endpoints'); assert.deepEqual(model.errors, [], 'The complete emitted page must have no uncaught errors'); },
  };
  // Complete real startup timers, then join the actual installed handler. A
  // 'synced' chip alone is insufficient: an earlier upload phase may set that
  // label before the initial pull/merge has finished.
  await f.advanceTo(2000);
  assert.equal(await page.evaluate(() => document.getElementById('mancardoPrivateSyncNow').onclick()), true, 'Initial complete private synchronization must settle');
  if (options.pending) await observed(() => f.requests('delete').some(request => request.settled), 'Initial durable retry must finish');
  if (!options.holdShared) await observed(() => f.requests('shared').some(request => request.settled), 'Initial shared load must finish');
  f.assertSafe();
  return f;
}

async function observeDomWriters(page) {
  await page.evaluate(() => {
    window.__trafficDom = { saveWrites: 0, noteWrites: 0 };
    new MutationObserver(changes => { window.__trafficDom.saveWrites += changes.length; }).observe(document.getElementById('saveBtn'), { childList: true, subtree: true });
    new MutationObserver(changes => {
      window.__trafficDom.noteWrites += changes.filter(change => change.target.nodeType === 1 && change.target.matches('.shared-item-note') || change.target.parentElement?.matches('.shared-item-note')).length;
    }).observe(document.getElementById('sharedTrackList'), { childList: true, subtree: true, characterData: true });
  });
}

async function noisyTenSeconds(f) {
  // Ten distinct observer deliveries containing 100 irrelevant child changes,
  // followed by the real 250ms Save and 1s status writers. No timer is mocked out.
  for (let round = 0; round < 10; round++) {
    await f.page.evaluate(round => {
      let noise = document.getElementById('synthetic-traffic-noise');
      if (!noise) { noise = document.createElement('aside'); noise.id = 'synthetic-traffic-noise'; document.body.appendChild(noise); }
      for (let i = 0; i < 10; i++) noise.textContent = 'Synthetic irrelevant mutation ' + round + ':' + i;
    }, round);
    await f.page.clock.runFor(100);
  }
  await f.page.clock.runFor(9000);
  // A round trip allows final MutationObserver callbacks/microtasks to run.
  await f.page.evaluate(() => Promise.resolve());
}

async function noteText(f, expected) {
  await observed(() => f.page.locator('#sharedTrackList .shared-item').count().then(count => count === 1), 'The canonical shared list must render its row');
  await f.page.clock.runFor(250);
  await observed(() => f.page.locator('#sharedTrackList .shared-item-note').allTextContents().then(texts => texts.length === 1 && texts[0] === expected), 'The loaded shared note must render: ' + expected);
}

for (const visible of [false, true]) {
  test('full editor: stable shared note stays quiet with real Save timers while ' + (visible ? 'visible' : 'hidden'), { timeout: 30000 }, async t => {
    const f = await fixture(t);
    assert.equal(f.requests('shared').length, 1, 'Boot must use exactly one canonical shared-list request');
    if (visible) {
      await f.page.locator('#sharedLibraryTab').evaluate(button => button.click());
      await observed(() => f.requests('shared').length === 2 && f.requests('shared')[1].settled);
    }
    assert.equal(await f.page.locator('#sharedLibraryPanel').evaluate(panel => !panel.classList.contains('hidden')), visible);
    await noteText(f, 'Synthetic initial shared note');
    const requestsBefore = f.requests('shared').length, allRequestsBefore = f.model.requests.length;
    await observeDomWriters(f.page);
    await noisyTenSeconds(f);
    assert.equal(f.requests('shared').length, requestsBefore, 'Irrelevant DOM mutations and the real Save/status timers must add zero shared requests');
    assert.equal(f.model.requests.length, allRequestsBefore, 'Irrelevant DOM churn must not initiate any other API request either');
    const dom = await f.page.evaluate(() => window.__trafficDom);
    assert.ok(dom.saveWrites >= 36, 'The actual 250ms Save text writer must run throughout the observation window');
    assert.equal(dom.noteWrites, 0, 'An unchanged note must not be rewritten into its own observer');
    assert.equal(f.model.peak.shared, 1);
    assert.deepEqual(f.writes(), [], 'Decoration must never upload, publish or delete anything');
    assert.deepEqual(await f.tracks(), [f.track]);
    f.assertSafe();
  });
}

test('full editor: explicit shared refresh updates and removes notes without decoration requests', { timeout: 30000 }, async t => {
  const f = await fixture(t);
  await f.page.locator('#sharedLibraryTab').evaluate(button => button.click());
  await observed(() => f.requests('shared').length === 2 && f.requests('shared')[1].settled);
  await noteText(f, 'Synthetic initial shared note');
  const icon = f.page.locator('#sharedTrackList .mancardo-note-icon');
  await icon.evaluate(button => button.click());
  assert.equal(await icon.getAttribute('aria-expanded'), 'true');
  assert.equal(await f.page.locator('#sharedTrackList .shared-item-note').evaluate(note => note.classList.contains('mancardo-note-open')), true);

  f.model.shared[0].note = 'Synthetic updated shared note';
  f.model.shared[0].version = 2;
  await f.refresh();
  await observed(() => f.requests('shared').length === 3 && f.requests('shared')[2].settled);
  await noteText(f, 'Synthetic updated shared note');
  await f.page.clock.runFor(1000);
  assert.equal(f.requests('shared').length, 3, 'One explicit refresh must make one GET, not a decoration feedback cycle');

  f.model.shared[0].note = '';
  await f.refresh();
  await observed(() => f.requests('shared').length === 4 && f.requests('shared')[3].settled);
  await observed(() => f.page.locator('#sharedTrackList .shared-item').count().then(count => count === 1));
  await f.page.clock.runFor(250);
  assert.equal(await f.page.locator('#sharedTrackList .shared-item-note').count(), 0);
  assert.equal(await f.page.locator('#sharedTrackList .mancardo-note-icon').count(), 0);
  assert.equal(f.requests('shared').length, 4);
  assert.deepEqual(f.writes(), []);
  f.assertSafe();
});

test('full editor: unresolved shared response stays single-flight through repeated refresh and DOM churn', { timeout: 30000 }, async t => {
  const f = await fixture(t, { holdShared: true });
  await f.model.gates.shared.entered;
  assert.equal(f.requests('shared').length, 1);
  f.model.shared[0].note = 'Synthetic note after invalidation';
  await f.refresh(100);
  await observeDomWriters(f.page);
  await noisyTenSeconds(f);
  assert.equal(f.requests('shared').length, 1, 'All repeated refreshes must join the unresolved canonical shared request');
  assert.equal(f.model.active.shared, 1);
  assert.equal(f.model.peak.shared, 1);
  assert.ok((await f.page.evaluate(() => window.__trafficDom.saveWrites)) >= 36);
  f.release('shared');
  await observed(() => f.requests('shared').length >= 2 && f.requests('shared')[1].settled);
  await noteText(f, 'Synthetic note after invalidation');
  assert.equal(f.requests('shared').length, 2, 'Repeated explicit invalidations during a held GET must coalesce into exactly one fresh follow-up');
  assert.equal(f.model.peak.shared, 1);
  assert.deepEqual(f.writes(), []);
  f.assertSafe();
});

test('full editor: non-OK shared response does not retry from DOM writers and explicit refresh recovers', { timeout: 30000 }, async t => {
  const f = await fixture(t, { sharedStatus: 503 });
  await observed(() => f.page.locator('#sharedTrackList').textContent().then(text => text.includes('unavailable')));
  assert.equal(f.requests('shared').length, 1);
  await observeDomWriters(f.page);
  await noisyTenSeconds(f);
  assert.equal(f.requests('shared').length, 1, 'A settled failure must not turn Save/status mutations into network retries');
  assert.equal(f.model.peak.shared, 1);
  f.model.sharedStatus = 200;
  await f.refresh();
  await observed(() => f.requests('shared').length === 2 && f.requests('shared')[1].settled);
  await noteText(f, 'Synthetic initial shared note');
  assert.equal(f.requests('shared').length, 2, 'A failed load must release its lock for one explicit recovery request');
  assert.deepEqual(f.writes(), []);
  f.assertSafe();
});

for (const failure of ['503', 'network']) {
  test('full editor: persistent DELETE ' + failure + ' keeps intent and retries only on the 15-second cadence', { timeout: 30000 }, async t => {
    // This is a persisted explicit intent from before reload. Observe its one
    // startup attempt, then the existing page-start-aligned 15s timer.
    const f = await fixture(t, { pending: true, deleteFailure: failure });
    assert.equal(f.requests('delete').length, 1);
    assert.deepEqual(await f.pending(), [f.intent]);
    assert.deepEqual(await f.tracks(), []);
    const healthBefore = f.requests('health').length, pullBefore = f.requests('pull').length;
    await f.advanceTo(14999);
    assert.equal(f.requests('delete').length, 1, 'No failure-driven 100ms retry or other retry is allowed before the first 15s tick');
    assert.equal(f.requests('health').length, healthBefore, 'A failed DELETE must not synthesize online events that cause health storms');
    assert.equal(f.requests('pull').length, pullBefore, 'A failed DELETE must not synthesize repeated private pulls');
    await f.advanceTo(15000);
    await observed(() => f.requests('delete').length >= 2 && f.requests('delete')[1].settled);
    assert.equal(f.requests('delete').length, 2);
    await f.advanceTo(29999);
    assert.equal(f.requests('delete').length, 2, 'The second failure must remain queued rather than scheduling itself again');
    await f.advanceTo(30000);
    await observed(() => f.requests('delete').length >= 3 && f.requests('delete')[2].settled);
    assert.equal(f.requests('delete').length, 3);
    assert.equal(f.model.peak.delete, 1);
    assert.deepEqual(await f.pending(), [f.intent], 'The original owner, base revision, request time and unconfirmed intent must survive every failure');
    assert.deepEqual(await f.tracks(), []);
    assert.equal(f.model.row.deleted, false);
    assert.equal(f.model.row.revision, 4);
    assert.deepEqual(f.writes().map(request => [request.method, request.path]), Array.from({ length: 3 }, () => ['DELETE', '/api/private-library/tracks/' + f.track.id]));
    for (const request of f.requests('delete')) {
      assert.equal(request.headers['x-mancardo-delete-account'], ACCOUNT);
      assert.deepEqual(request.body, { base_revision: 4, device_id: DEVICE, authorized_user_delete: true, delete_intent: 'explicit-ui-delete', requested_at: f.intent.requestedAt });
    }
    f.assertSafe();
  });
}

test('full editor: stale delete 409 cancels intent and restores the newer route without retrying or uploading', { timeout: 30000 }, async t => {
  const f = await fixture(t);
  const newer = { ...clone(f.track), name: 'Synthetic newer server route', note: 'Synthetic newer server note' };
  f.model.row = { ...f.model.row, revision: 5, sha256: hash(newer), track: newer, updated_at: 5 };
  await f.remove();
  await observed(() => f.requests('delete').length === 1 && f.requests('delete')[0].settled);
  await f.page.clock.runFor(500);
  await observed(async () => (await f.pending()).length === 0 && (await f.tracks())[0]?.name === newer.name, 'A stale explicit deletion must cancel and reconcile the newer cloud record');
  await f.advanceTo(30000);
  assert.equal(f.requests('delete').length, 1, 'A stale intent must never retry against the newly observed revision');
  assert.deepEqual(await f.pending(), []);
  assert.deepEqual(await f.tracks(), [newer]);
  assert.deepEqual(f.writes().map(request => [request.method, request.body.base_revision]), [['DELETE', 4]]);
  assert.equal(f.model.row.revision, 5);
  assert.equal(f.model.row.deleted, false);
  f.assertSafe();
});

for (const phase of ['health', 'pull']) {
  test('full editor: overlapping sync stays single-flight while ' + phase + ' is unresolved', { timeout: 30000 }, async t => {
    const f = await fixture(t);
    const start = { health: f.requests('health').length, pull: f.requests('pull').length };
    const held = f.hold(phase);
    await f.startSync();
    await held.entered;
    await f.overlapSync();
    // Also exercise the installed online and visibility sync event handlers.
    await f.page.evaluate(() => {
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await f.page.clock.runFor(1000);
    assert.equal(f.requests('health').length - start.health, 1, 'All concurrent sync requests must share one complete health/upload/pull cycle');
    assert.equal(f.requests('pull').length - start.pull, phase === 'pull' ? 1 : 0);
    assert.equal(f.model.active[phase], 1);
    assert.equal(f.model.peak[phase], 1);
    assert.deepEqual(f.writes(), []);
    f.release(phase);
    assert.equal(await f.finishSync(), true, 'The actual complete sync must finish after its held response is released');
    assert.equal(f.requests('health').length - start.health, 1);
    assert.equal(f.requests('pull').length - start.pull, 1);
    assert.deepEqual(await f.tracks(), [f.track]);
    // Positive lock-release control: a genuinely later request must still run.
    await f.startSync();
    assert.equal(await f.finishSync(), true);
    assert.equal(f.requests('health').length - start.health, 2);
    assert.equal(f.requests('pull').length - start.pull, 2);
    assert.deepEqual(f.writes(), []);
    f.assertSafe();
  });
}

test('full editor: actual rename upload suppresses overlapping sync without duplicate PUTs', { timeout: 30000 }, async t => {
  const f = await fixture(t);
  const start = { health: f.requests('health').length, pull: f.requests('pull').length };
  const held = f.hold('put');
  await f.rename('Synthetic traffic rename');
  const request = await held.entered;
  assert.equal(request.body.track.name, 'Synthetic traffic rename');
  assert.equal(request.body.base_revision, 4);
  assert.equal(request.headers['x-mancardo-private-account'], ACCOUNT);
  await f.overlapSync();
  await f.page.clock.runFor(1000);
  assert.equal(f.requests('put').length, 1);
  assert.equal(f.model.peak.put, 1);
  assert.equal(f.requests('health').length, start.health, 'An active event-driven upload must not permit competing sync health checks');
  assert.equal(f.requests('pull').length, start.pull);
  f.release('put');
  await observed(() => f.model.row.revision === 5 && f.page.evaluate(() => document.getElementById('mancardoPrivateSyncChip').dataset.state === 'synced'));
  await f.startSync();
  assert.equal(await f.finishSync(), true);
  await f.page.clock.runFor(2000); // Includes the actual rename's delayed queue scan.
  assert.equal(f.requests('put').length, 1, 'A queued scan or later synchronization must not re-upload an acknowledged unchanged rename');
  assert.equal(f.model.row.track.name, 'Synthetic traffic rename');
  assert.deepEqual(f.writes().map(request => request.method), ['PUT']);
  assert.deepEqual(await f.tracks(), [f.model.row.track]);
  f.assertSafe();
});

test('full editor: same-name shared rows retain their own notes and render markup-like text literally', { timeout: 30000 }, async t => {
  const f = await fixture(t);
  f.model.shared = [
    { ...sharedFixture(), id: 'synthetic-shared-first', name: 'Synthetic duplicate route', note: '<img src=x onerror=alert(1)>', modifiedAt: '2026-01-02T00:00:00.000Z' },
    { ...sharedFixture(), id: 'synthetic-shared-second', name: 'Synthetic duplicate route', note: 'Synthetic distinct second note', modifiedAt: '2026-01-01T00:00:00.000Z' },
  ];
  await f.refresh();
  await observed(() => f.requests('shared').length === 2 && f.requests('shared')[1].settled);
  await observed(() => f.page.locator('#sharedTrackList .shared-item').count().then(count => count === 2));
  await f.page.clock.runFor(250);
  assert.deepEqual(await f.page.locator('#sharedTrackList .shared-item-note').allTextContents(), ['<img src=x onerror=alert(1)>', 'Synthetic distinct second note']);
  assert.equal(await f.page.locator('#sharedTrackList .shared-item-note img').count(), 0, 'Shared note text must not be parsed as HTML');
  await noisyTenSeconds(f);
  assert.equal(f.requests('shared').length, 2);
  assert.deepEqual(f.writes(), []);
  f.assertSafe();
});

test('full editor: rename during an unresolved stale pull waits, then uploads exactly one preserved edit', { timeout: 30000 }, async t => {
  const f = await fixture(t);
  const held = f.hold('pull');
  await f.startSync();
  await held.entered; // The routed response has already captured revision 4.
  await f.rename('Synthetic rename during stale pull');
  await observed(async () => (await f.tracks())[0]?.name === 'Synthetic rename during stale pull');
  await f.page.clock.runFor(1500); // Fires real persist/autosave/rename queue paths.
  assert.equal(f.requests('put').length, 0, 'Standalone edit flushes must wait behind the full sync pull/merge cycle');
  assert.equal(f.model.active.pull, 1);
  f.release('pull');
  assert.equal(await f.finishSync(), true);
  await observed(() => f.requests('put').length === 1 && f.requests('put')[0].settled);
  await f.page.clock.runFor(2000);
  assert.equal(f.requests('put').length, 1, 'Deferred edit handlers must not duplicate the full cycle upload');
  assert.equal(f.requests('put')[0].body.base_revision, 4);
  assert.equal(f.model.row.revision, 5);
  assert.equal(f.model.row.track.name, 'Synthetic rename during stale pull');
  assert.deepEqual(await f.tracks(), [f.model.row.track], 'One local renamed route must survive the older in-flight response');
  assert.deepEqual(f.writes().map(request => request.method), ['PUT']);
  f.assertSafe();
});

test('full editor: a late textarea edit during an upload drains once at the acknowledged revision', { timeout: 30000 }, async t => {
  const f = await fixture(t);
  const held = f.hold('put');
  await f.rename('Synthetic renamed route with late note');
  const first = await held.entered;
  assert.equal(first.body.track.note, undefined);
  await f.note('Synthetic late note during upload');
  await f.page.clock.runFor(1500); // The real note persist scan joins the held upload.
  assert.equal(f.requests('put').length, 1);
  assert.equal(f.model.active.put, 1);
  assert.equal((await f.tracks())[0].note, 'Synthetic late note during upload');
  f.release('put');
  await observed(() => f.requests('put').length >= 2 && f.requests('put')[1].settled, 'A late local note must drain after the earlier upload is acknowledged');
  await f.page.clock.runFor(2000);
  assert.equal(f.requests('put').length, 2, 'Exactly the original snapshot and one changed snapshot should upload');
  assert.equal(f.model.peak.put, 1);
  assert.deepEqual(f.requests('put').map(request => request.body.base_revision), [4, 5]);
  for (const request of f.requests('put')) assert.equal(request.headers['x-mancardo-private-account'], ACCOUNT);
  assert.equal(f.model.row.revision, 6);
  assert.equal(f.model.row.track.name, 'Synthetic renamed route with late note');
  assert.equal(f.model.row.track.note, 'Synthetic late note during upload');
  assert.deepEqual(await f.tracks(), [f.model.row.track]);
  assert.deepEqual(f.writes().map(request => request.method), ['PUT', 'PUT']);
  f.assertSafe();
});

test('full editor: successful shared note publication invalidates an older in-flight shared list once', { timeout: 30000 }, async t => {
  const f = await fixture(t, { linkedShared: true });
  const held = f.hold('shared');
  await f.refresh();
  await held.entered; // This response captured the pre-publication shared note.
  await f.note('Synthetic published note after old GET');
  await f.page.clock.runFor(1000); // Uses the real shared note autosync timer.
  await observed(() => f.requests('publish').length === 1 && f.requests('publish')[0].settled);
  await observed(async () => (await f.tracks())[0]?.sharedBaseVersion === 2, 'The actual publish-success callback must persist its new shared version');
  assert.equal(f.requests('shared').length, 2, 'Publish success must not create a concurrent shared GET');
  assert.equal(f.model.active.shared, 1);
  assert.equal(f.model.shared[0].note, 'Synthetic published note after old GET');
  f.release('shared');
  await observed(() => f.requests('shared').length >= 3 && f.requests('shared')[2].settled);
  await noteText(f, 'Synthetic published note after old GET');
  assert.equal(f.requests('shared').length, 3, 'One success invalidation must produce exactly one fresh GET after the stale response');
  assert.equal(f.model.peak.shared, 1);
  assert.equal(f.requests('publish').length, 1);
  assert.equal(f.requests('publish')[0].body.basedOnVersion, 1);
  assert.ok(f.writes().every(request => request.kind === 'publish' || request.kind === 'put'));
  assert.ok(f.requests('put').length <= 1, 'A linked note edit must not create duplicate private uploads');
  for (const request of f.requests('put')) {
    assert.equal(request.headers['x-mancardo-private-account'], ACCOUNT);
    assert.equal(request.body.track.note, 'Synthetic published note after old GET');
    assert.equal(request.body.base_revision, 4);
  }
  assert.equal((await f.tracks())[0].note, 'Synthetic published note after old GET');
  f.assertSafe();
});
