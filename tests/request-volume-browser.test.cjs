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
  const layers = [], fits = [];
  function layer(kind = 'layer', points = null, options = {}) {
    handlers.set(this, {}); this.options = options;
    this._fixtureKind = kind; this._fixturePoints = points;
    this._fixtureChildren = new Set(); this._fixtureParent = null;
    layers.push(this);
  }
  // Observe only the rendering platform's inputs, never editor state or helpers.
  // A line counts as displayed only while attached to an actual map through its
  // layer group. Retain the real application's clear/add order between renders.
  function attached(item) { return item._fixtureKind === 'map' || !!(item._fixtureParent && attached(item._fixtureParent)); }
  window.__trafficLeaflet = {
    snapshot() {
      return JSON.parse(JSON.stringify({
        lines: layers.filter(item => item._fixtureKind === 'polyline' && attached(item) && Number(item.options.opacity) > 0)
          .map(item => ({ points: item._fixturePoints, options: item.options })),
        fits,
      }));
    },
  };
  for (const name of ['setView','flyTo','fitBounds','panTo','invalidateSize','setLatLng','setLatLngs','setStyle','setIcon','bindPopup','openPopup','setContent','setOpacity','redraw','bringToFront','bringToBack','remove','clearLayers','addLayer','removeLayer','closePopup','setZoom','zoomIn','zoomOut','setZIndex']) layer.prototype[name] = function(){ return this; };
  layer.prototype.fitBounds = function(points, options){ fits.push({ points, options }); return this; };
  layer.prototype.clearLayers = function(){ for(const child of this._fixtureChildren)child._fixtureParent=null; this._fixtureChildren.clear(); return this; };
  layer.prototype.addLayer = function(child){ if(child._fixtureParent)child._fixtureParent.removeLayer(child); this._fixtureChildren.add(child); child._fixtureParent=this; return this; };
  layer.prototype.removeLayer = function(child){ this._fixtureChildren.delete(child); if(child._fixtureParent===this)child._fixtureParent=null; return this; };
  layer.prototype.remove = function(){ if(this._fixtureParent)this._fixtureParent.removeLayer(this); return this; };
  layer.prototype.setStyle = function(options){ Object.assign(this.options,options); return this; };
  layer.prototype.on = function(name,fn){ handlers.get(this)[name]=fn; return this; };
  layer.prototype.off = function(){return this;};
  layer.prototype.whenReady = function(fn){fn.call(this);return this;};
  layer.prototype.addControl = function(control){control.addTo(this);return this;};
  layer.prototype.removeControl = function(){return this;};
  layer.prototype.getMaxZoom = function(){return 20;};
  layer.prototype.getMinZoom = function(){return 0;};
  layer.prototype.addTo = function(target){if(target&&target._fixtureChildren)target.addLayer(this);if(this.onAdd){const el=this.onAdd(target);if(el instanceof HTMLElement){el.classList.add('leaflet-control');this._container=el;document.body.appendChild(el);}}return this;};
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
  window.L={map:()=>new layer('map'),layerGroup:make,tileLayer:make,polyline:(points,options)=>new layer('polyline',points,options),marker:make,circleMarker:make,circle:make,popup:make,Polyline:layer,CircleMarker:layer,Control:layer,TileLayer:layer,divIcon:x=>x,point:(x,y)=>({x,y}),latLng:(lat,lng)=>({lat,lng,distanceTo:()=>0}),control:{scale:make},DomUtil:{create(tag,cls,parent){const el=document.createElement(tag);el.className=cls||'';if(parent)parent.appendChild(el);return el;}},DomEvent:{disableClickPropagation(){},disableScrollPropagation(){},stopPropagation(ev){ev?.stopPropagation?.();},preventDefault(ev){ev?.preventDefault?.();},on(el,event,fn){el.addEventListener(event,fn);}}};
}

test.before(async () => {
  const config = fs.readFileSync(process.env.MANCARDO_DELETE_TEST_ENTRY ? path.join(path.dirname(process.env.MANCARDO_DELETE_TEST_ENTRY), 'wrangler.toml') : path.join(ROOT, 'wrangler.dev.toml'), 'utf8');
  const entry = config.match(/^main\s*=\s*"([^"]+)"\s*$/m)?.[1];
  assert.equal(entry, 'worker-delete-durable-fix.js');
  const worker = (await import(pathToFileURL(process.env.MANCARDO_DELETE_TEST_ENTRY || path.join(ROOT, entry)).href)).default;
  const response = await worker.fetch(new Request(ORIGIN + '/'), {
    ASSETS: { fetch: async () => new Response(fs.readFileSync(process.env.MANCARDO_DELETE_TEST_ENTRY ? path.join(path.dirname(process.env.MANCARDO_DELETE_TEST_ENTRY), 'assets/index.html') : path.join(ROOT, 'index.html'), 'utf8'), { headers: { 'content-type': 'text/html' } }) },
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
  const context = await browser.newContext({ viewport: options.viewport || { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const track = trackFixture(), shared = sharedFixture();
  if (Object.prototype.hasOwnProperty.call(options, 'visible')) {
    if (options.visible === undefined) delete track.visible;
    else track.visible = options.visible;
  }
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
    // Read real browser persistence in one readonly transaction. No storage,
    // hashing, synchronization, rendering or application helper is replaced.
    async durableState() {
      return page.evaluate(async ({ LIB, PENDING, ACCOUNT, id }) => {
        const db = await new Promise((resolve, reject) => {
          const opening = indexedDB.open('mancardo_private_sync_v2', 1);
          opening.onsuccess = () => resolve(opening.result);
          opening.onerror = () => reject(opening.error);
        });
        try {
          return await new Promise((resolve, reject) => {
            const result = { library: localStorage.getItem(LIB), pending: localStorage.getItem(PENDING) };
            const tx = db.transaction(['sync', 'outbox'], 'readonly');
            const sync = tx.objectStore('sync').get(ACCOUNT + '|' + id);
            const outbox = tx.objectStore('outbox').getAll();
            sync.onsuccess = () => { result.sync = sync.result; };
            outbox.onsuccess = () => { result.outbox = outbox.result; };
            tx.oncomplete = () => resolve(result);
            tx.onerror = tx.onabort = () => reject(tx.error);
          });
        } finally { db.close(); }
      }, { LIB, PENDING, ACCOUNT, id: track.id });
    },
    async rendering() { return page.evaluate(() => window.__trafficLeaflet.snapshot()); },
    async identify(target = 'name') {
      const selector = '[data-track-id="' + track.id + '"]' + (target === 'name' ? ' .ti-name' : ' .track-row');
      await page.locator(selector).evaluate(element => element.click());
    },
    async visibilityControl(control, activation = 'pointer') {
      const selector = control === 'Show all' ? '#selectAllTracks' : '[data-track-id="' + track.id + '"] .track-show';
      if (activation === 'keyboard') return page.locator(selector).press('Space');
      await page.locator(selector).evaluate(element => {
        element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        element.click();
      });
    },
    async reloadAndSettle() {
      await page.reload();
      await page.clock.runFor(2000);
      await this.startSync();
      assert.equal(await this.finishSync(), true, 'Reload must finish a real complete private synchronization');
    },
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
  // followed by the real 1s status writer. No timer is mocked out.
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
  test('full editor: stable shared note stays quiet with event-driven Save state while ' + (visible ? 'visible' : 'hidden'), { timeout: 30000 }, async t => {
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
    assert.equal(f.requests('shared').length, requestsBefore, 'Irrelevant DOM mutations and the real status timer must add zero shared requests');
    assert.equal(f.model.requests.length, allRequestsBefore, 'Irrelevant DOM churn must not initiate any other API request either');
    const dom = await f.page.evaluate(() => window.__trafficDom);
    assert.equal(dom.saveWrites, 0, 'An unchanged editor must not rewrite Save state periodically');
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
  assert.equal(await f.page.evaluate(() => window.__trafficDom.saveWrites), 0);
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


// Identification regression: all actions below enter through actual emitted DOM
// listeners and the installed private-sync onclick. There are no injected state
// accessors, extracted/redefined application helpers or storage/hash shims.
async function assertTrackRendered(f, expected, message) {
  const rendering = await f.rendering();
  const points = f.track.segments[0].map(point => [point.lat, point.lon]);
  const lines = rendering.lines.filter(line => JSON.stringify(line.points) === JSON.stringify(points));
  assert.equal(lines.length, expected ? 1 : 0, message);
  if (expected) assert.equal(lines[0].options.weight, 5, 'The selected route must retain its current-track rendering');
}

async function assertIdentificationUnchanged(f, baseline, server, expectedSavedVisibility) {
  assert.deepEqual(await f.durableState(), baseline, 'Identification must not change saved track bytes, sync metadata/hash, pending deletion or the outbox');
  assert.deepEqual(f.model.row, server, 'Identification must not change any cloud content, hash or revision');
  assert.deepEqual(f.writes(), [], 'Identification must not PUT the target or issue any other write');
  assert.equal(await f.page.locator('[data-track-id="' + f.track.id + '"] .track-show').isChecked(), expectedSavedVisibility, 'Show always represents the saved choice, never the flash override');
  assert.equal(await f.page.locator('#selectAllTracks').isChecked(), expectedSavedVisibility, 'Show-all must continue representing saved visibility');
}

for (const savedVisibility of [false, true, null, undefined]) {
  for (const target of ['row', 'name']) {
    const savedLabel = savedVisibility === undefined ? 'absent' : String(savedVisibility);
    test('full editor: ' + target + ' identification with saved visibility ' + savedLabel + ' survives overlapping sync, repeat, timers and reload without writes', { timeout: 30000 }, async t => {
      const f = await fixture(t, { visible: savedVisibility });
      const shown = savedVisibility !== false;
      const baseline = await f.durableState(), server = clone(f.model.row);
      const requestsBefore = f.model.requests.length;
      const fitCount = (await f.rendering()).fits.length;
      assert.deepEqual(baseline.outbox, []);
      assert.equal(baseline.sync.revision, 4);
      assert.equal(baseline.sync.sha256, hash(f.track));
      assert.equal(baseline.library, JSON.stringify([f.track]));

      await f.identify(target);
      assert.equal(await f.page.locator('#trackList .track-item.active').getAttribute('data-track-id'), f.track.id, 'A row/name press must still select the route');
      const rendering = await f.rendering();
      assert.equal(rendering.fits.length, fitCount + 1, 'A row/name press must still focus the map exactly once');
      assert.deepEqual(rendering.fits.at(-1), { points: [[1, 2], [1.001, 2.001]], options: { padding: [30, 30] } });
      await f.page.clock.runFor(29);
      await assertTrackRendered(f, shown, 'Identification must retain the existing 30 ms post-selection delay');
      await f.page.clock.runFor(1);
      await assertTrackRendered(f, !shown, 'The track must visibly identify itself, not merely avoid persistence');
      assert.equal(f.model.requests.length, requestsBefore, 'Selection itself must not initiate a sync or shared refresh');
      await assertIdentificationUnchanged(f, baseline, server, shown);
      assert.equal(await f.page.locator('#saveBtn').evaluate(button => button.classList.contains('save-state-clean') && !button.classList.contains('save-state-dirty')), true, 'A rendering-only flash must not make the selected editor copy dirty');

      // Freeze time inside the real 750 ms flash while the actual full
      // health/hash/queue/upload/pull/merge pipeline runs asynchronously.
      await f.startSync();
      assert.equal(await f.finishSync(), true);
      await assertIdentificationUnchanged(f, baseline, server, shown);
      await assertTrackRendered(f, !shown, 'A complete sync must not suppress an in-progress identification');

      await f.page.clock.runFor(300);
      await f.identify(target); // Repeat an already-selected track, as in normal browsing.
      await f.page.clock.runFor(30);
      assert.equal((await f.rendering()).fits.length, fitCount + 2, 'Repeated presses must preserve normal selection/focus behavior');
      await f.startSync();
      assert.equal(await f.finishSync(), true);
      await assertIdentificationUnchanged(f, baseline, server, shown);
      await f.page.clock.runFor(420); // The first flash's original expiry, now superseded.
      await assertTrackRendered(f, !shown, 'An obsolete timeout must not end the replacement flash');
      await f.page.clock.runFor(329);
      await assertTrackRendered(f, !shown, 'The replacement flash must remain active through its 749th ms');
      await f.page.clock.runFor(1);
      await assertTrackRendered(f, shown, 'At 750 ms the track must return to the saved visibility');
      await f.page.clock.runFor(1500); // Include delayed scans and real Save/status timers.
      await f.startSync();
      assert.equal(await f.finishSync(), true);
      await assertIdentificationUnchanged(f, baseline, server, shown);

      // Reload before another flash can restore itself, so a passing result
      // cannot be explained by a compensating upload or timeout repair.
      await f.identify(target);
      await f.page.clock.runFor(30);
      await assertTrackRendered(f, !shown, 'The third press must still identify the track');
      await f.reloadAndSettle();
      await assertIdentificationUnchanged(f, baseline, server, shown);
      assert.deepEqual(await f.tracks(), [f.track], 'Reload must preserve even a null or absent visibility property exactly');
      f.assertSafe();
    });
  }
}

test('full editor: the actual 60-second background sync overlaps identification without making visibility durable', { timeout: 30000 }, async t => {
  const f = await fixture(t, { visible: false });
  const baseline = await f.durableState(), server = clone(f.model.row);
  await f.advanceTo(59950);
  const start = { health: f.requests('health').length, pull: f.requests('pull').length };
  const held = f.hold('health');
  await f.identify('name');
  await f.page.clock.runFor(30); // Flash starts at 59,980 ms.
  await assertTrackRendered(f, true, 'The hidden route must briefly appear');
  await f.advanceTo(60000); // Let the actual installed periodic timer initiate sync.
  await held.entered;
  await f.startSync(); // Join, rather than substitute for, the timer-started cycle.
  await f.overlapSync();
  await f.page.evaluate(() => {
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await f.page.clock.runFor(400); // Real online/visibility retry timers join it too.
  assert.equal(f.requests('health').length - start.health, 1);
  f.release('health');
  assert.equal(await f.finishSync(), true);
  assert.equal(f.requests('pull').length - start.pull, 1);
  await assertIdentificationUnchanged(f, baseline, server, false);
  await assertTrackRendered(f, true, 'The flash must survive the complete background sync');
  await f.advanceTo(60729);
  await assertTrackRendered(f, true, 'The 750 ms flash must not end early');
  await f.advanceTo(60730);
  await assertTrackRendered(f, false, 'The hidden route must disappear again at expiry');
  await f.advanceTo(120000); // Observe the next real periodic cycle after restoration.
  await f.startSync();
  assert.equal(await f.finishSync(), true);
  await assertIdentificationUnchanged(f, baseline, server, false);
  f.assertSafe();
});

for (const visible of [false, true]) {
  for (const control of ['Show', 'Show all']) {
    for (const phase of ['pending', 'active']) {
      const activation = phase === 'pending' ? 'keyboard' : 'pointer';
      test('full editor: deliberate ' + control + ' from ' + (visible ? 'shown' : 'hidden') + ' via ' + activation + ' during ' + phase + ' identification persists and uploads exactly once', { timeout: 30000 }, async t => {
        const f = await fixture(t, { visible });
        const baseline = await f.durableState();
        const expected = { ...clone(f.track), visible: !visible };
        await f.identify('name');
        await f.page.clock.runFor(phase === 'pending' ? 10 : 30);
        const held = f.hold('put');
        await f.visibilityControl(control, activation);
        assert.deepEqual(await f.tracks(), [expected], 'A deliberate Show change must save immediately');
        await assertTrackRendered(f, !visible, 'A deliberate control must cancel pending/active identification before rendering the new choice');
        await f.page.clock.runFor(800); // Both the pending start and old restoration are now due.
        await assertTrackRendered(f, !visible, 'No stale identification callback may undo the explicit choice');
        assert.deepEqual(await f.tracks(), [expected]);
        await f.page.clock.runFor(400); // Fire the actual 1200 ms persistence queue scan.
        const request = await held.entered;
        assert.equal(request.body.base_revision, 4);
        assert.equal(request.headers['x-mancardo-private-account'], ACCOUNT);
        assert.deepEqual(request.body.track, expected, 'Only the intended saved visibility may be uploaded');
        const queued = await f.durableState();
        assert.deepEqual(queued.sync, baseline.sync, 'An unresolved upload must retain its previous revision/hash');
        assert.equal(queued.outbox.length, 1, 'Positive control must exercise the actual durable upload queue');
        assert.equal(queued.outbox[0].id, f.track.id);
        assert.equal(queued.outbox[0].op, 'put');
        assert.equal(queued.outbox[0].baseRevision, 4);
        assert.equal(queued.outbox[0].localHash, hash(expected));
        assert.deepEqual(queued.outbox[0].track, expected);
        f.release('put');
        await observed(() => f.model.row.revision === 5 && f.page.evaluate(() => document.getElementById('mancardoPrivateSyncChip').dataset.state === 'synced'));
        await f.startSync();
        assert.equal(await f.finishSync(), true);
        await f.page.clock.runFor(2000);
        assert.equal(f.requests('put').length, 1, 'The intended visibility change must not create duplicate or compensating uploads');
        assert.deepEqual(f.writes().map(request => request.method), ['PUT']);
        assert.deepEqual(f.model.row.track, expected);
        assert.equal(f.model.row.sha256, hash(expected));
        assert.equal(f.model.row.revision, 5);
        const saved = await f.durableState();
        assert.equal(saved.library, JSON.stringify([expected]));
        assert.equal(saved.sync.revision, 5);
        assert.equal(saved.sync.sha256, hash(expected));
        assert.deepEqual(saved.outbox, []);
        await f.reloadAndSettle();
        assert.deepEqual(await f.tracks(), [expected], 'An intentional Show choice must survive reload');
        assert.deepEqual(await f.durableState(), saved);
        assert.equal(await f.page.locator('[data-track-id="' + f.track.id + '"] .track-show').isChecked(), !visible);
        assert.equal(f.requests('put').length, 1, 'Reload must not upload an already acknowledged choice again');
        f.assertSafe();
      });
    }
  }
}


// Toolbar regressions use the complete emitted page, native Chromium viewport
// changes and the real DOM handlers. The observation handle below retains DOM
// identities and counts delivered resize events only; no application function,
// matchMedia, state, storage, hash or synchronization implementation is replaced.
const TOOLBAR_CONTROL_IDS = [
  'splitAfterBtn', 'joinNextBtn', 'joinToPointBtn', 'movePointBtn',
  'extendTrackBtn', 'completeChangeBtn', 'cancelChangeBtn', 'deletePointBtn', 'deleteSegBtn',
  'reverseBtn', 'undoBtn', 'redoBtn', 'exportBtn', 'deleteTrackBtn',
];
const TOOLBAR_SELECTORS = [
  '.toolbar', '.dock', '.stats-row', '#desktopToolbarHost',
  '#mancardoMobileToolbarNav', '#mancardoMobileToolbarViewport', '#pointsToggle',
  ...TOOLBAR_CONTROL_IDS.map(id => '#' + id),
];

async function observeToolbarNodes(page) {
  return page.evaluateHandle(selectors => {
    const observation = {
      nodes: selectors.map(selector => [selector, document.querySelector(selector)]),
      resizeEvents: 0,
    };
    window.addEventListener('resize', () => { observation.resizeEvents++; });
    return observation;
  }, TOOLBAR_SELECTORS);
}

async function assertToolbarLayout(f, viewport, observation) {
  const narrow = viewport.width < 768;
  const actual = await f.page.evaluate(({ selectors, controls }) => {
    const toolbar = document.querySelector('.toolbar');
    const dock = document.querySelector('.dock');
    const nav = document.getElementById('mancardoMobileToolbarNav');
    const ribbon = document.getElementById('mancardoMobileToolbarViewport');
    const points = document.getElementById('pointsToggle');
    return {
      viewport: { width: innerWidth, height: innerHeight },
      narrow: matchMedia('(max-width:767px)').matches,
      counts: selectors.map(selector => [selector, document.querySelectorAll(selector).length]),
      toolbarParent: toolbar?.parentElement?.id,
      navInDock: !!nav && nav.parentElement === dock,
      viewportInNav: !!ribbon && ribbon.parentElement === nav,
      pointsParent: points?.parentElement === dock ? 'dock' : points?.parentElement?.className,
      controlsInToolbar: controls.map(id => [id, document.getElementById(id)?.closest('.toolbar') === toolbar]),
      toolbarControls: Array.from(toolbar?.querySelectorAll('button[id]') || [], button => button.id).sort(),
    };
  }, { selectors: TOOLBAR_SELECTORS, controls: TOOLBAR_CONTROL_IDS });
  assert.deepEqual(actual.viewport, viewport, 'The real browser viewport must match the requested size');
  assert.equal(actual.narrow, narrow, 'The actual media query must use the 767/768 boundary');
  assert.deepEqual(actual.counts, TOOLBAR_SELECTORS.map(selector => [selector, 1]), 'Toolbar, ribbon, hosts and every control must remain singletons');
  assert.equal(actual.toolbarParent, narrow ? 'mancardoMobileToolbarViewport' : 'desktopToolbarHost', 'Only the intended responsive host may own the editing toolbar');
  assert.equal(actual.navInDock, true, 'The mobile navigation must stay in the dock even after desktop startup');
  assert.equal(actual.viewportInNav, true);
  assert.equal(actual.pointsParent, narrow ? 'stats-row' : 'dock', 'The point-list control must follow its independent mobile/desktop placement');
  assert.deepEqual(actual.controlsInToolbar, TOOLBAR_CONTROL_IDS.map(id => [id, true]));
  assert.deepEqual(actual.toolbarControls, [...TOOLBAR_CONTROL_IDS].sort());
  assert.equal(await f.page.locator('.toolbar').isVisible(), true, 'The toolbar must not be stranded inside a hidden host');
  assert.equal(await f.page.locator('#mancardoMobileToolbarNav').isVisible(), narrow);
  assert.equal(await f.page.locator('#pointsToggle').isVisible(), true);
  if (observation) {
    const identities = await observation.evaluate(value => value.nodes.map(([selector, node]) => [selector, !!node && node.isConnected && document.querySelector(selector) === node]));
    assert.deepEqual(identities, TOOLBAR_SELECTORS.map(selector => [selector, true]), 'Resizing must move the original nodes, not replace controls or duplicate listeners');
  }
  f.assertSafe();
}

async function resizeToolbar(f, viewport, observation) {
  const before = await observation.evaluate(value => value.resizeEvents);
  await f.page.setViewportSize(viewport);
  // Run the application's real resize-related timers and animation frames.
  // A delivered native resize event is required, not just an overridden query.
  await f.page.clock.runFor(250);
  await observed(async () => (await observation.evaluate(value => value.resizeEvents)) > before, 'Chromium must deliver the requested native resize event');
  await assertToolbarLayout(f, viewport, observation);
}

async function exerciseToolbarControls(f, duringEditing) {
  const points = f.page.locator('#pointsToggle');
  const pointsHidden = () => f.page.locator('#pointsWrap').evaluate(element => element.classList.contains('hidden'));
  const modeHidden = () => f.page.locator('#modeBanner').evaluate(element => element.classList.contains('hidden'));
  assert.equal(await pointsHidden(), true);
  await points.press('Enter');
  assert.equal(await pointsHidden(), false, 'The relocated point-list button must still open the real point table');
  assert.equal(await points.textContent(), 'Hide point list');
  assert.equal(await f.page.locator('#pointsBody tr').count(), 2);
  // Point rows are not keyboard controls. Click the actual emitted row listener.
  await f.page.locator('#pointsBody tr').first().evaluate(row => row.click());
  assert.equal(await f.page.locator('#pointsBody tr').first().evaluate(row => row.classList.contains('sel')), true);
  assert.equal(await f.page.locator('#movePointBtn').isEnabled(), true);
  assert.equal(await f.page.locator('#extendTrackBtn').isEnabled(), true);

  await f.page.locator('#movePointBtn').press('Enter');
  assert.equal(await modeHidden(), false);
  assert.match(await f.page.locator('#modeBanner span').textContent(), /^Move point:/);
  assert.equal(await f.page.locator('#completeChangeBtn').isEnabled(), true);
  assert.equal(await f.page.locator('#cancelChangeBtn').isVisible(), true);
  assert.equal(await f.page.locator('#movePointBtn').isEnabled(), false);
  await f.page.locator('#cancelChangeBtn').press('Enter');
  assert.equal(await modeHidden(), true, 'Cancel must leave editing without a track mutation');

  await f.page.locator('#extendTrackBtn').press('Enter');
  assert.equal(await modeHidden(), false);
  assert.match(await f.page.locator('#modeBanner span').textContent(), /^Extend Track:/);
  assert.equal(await f.page.locator('#completeChangeBtn').isVisible(), true);
  if (duringEditing) {
    await duringEditing();
    assert.equal(await modeHidden(), false, 'A responsive host change must not cancel the active editing mode');
    assert.match(await f.page.locator('#modeBanner span').textContent(), /^Extend Track:/);
    assert.equal(await pointsHidden(), false, 'The open point list must survive resizing');
    assert.equal(await f.page.locator('#pointsBody tr').count(), 2);
    assert.equal(await f.page.locator('#pointsBody tr').first().evaluate(row => row.classList.contains('sel')), true);
  }
  // Complete without placing a map point: prove the moved editing handler works
  // while keeping this layout regression strictly free of track edits.
  await f.page.locator('#completeChangeBtn').press('Enter');
  assert.equal(await modeHidden(), true);
  assert.equal(await f.page.locator('#completeChangeBtn').isDisabled(), true);
  assert.equal(await f.page.locator('#movePointBtn').isEnabled(), true);
  assert.equal(await f.page.locator('#extendTrackBtn').isEnabled(), true);
  await points.press('Enter');
  assert.equal(await pointsHidden(), true, 'The point-list button must still close the real table after reparenting');
  assert.equal(await points.textContent(), 'Show point list');
  f.assertSafe();
}

async function assertToolbarDataUnchanged(f, baseline, server) {
  assert.deepEqual(await f.durableState(), baseline, 'Layout and edit-mode transitions must not change canonical library bytes, sync hash/revision, pending deletion or outbox');
  assert.deepEqual(await f.tracks(), [f.track], 'The saved visibility and complete canonical track must remain unchanged');
  assert.deepEqual(f.model.row, server, 'Layout must not change synthetic server content, hash or revision');
  assert.equal(f.requests('put').length, 0, 'Responsive layout must issue zero PUTs, including delayed or compensating uploads');
  assert.deepEqual(f.writes(), [], 'Responsive layout must not write, publish or delete anything');
  const shown = f.track.visible !== false;
  assert.equal(await f.page.locator('[data-track-id="' + f.track.id + '"] .track-show').isChecked(), shown);
  assert.equal(await f.page.locator('#selectAllTracks').isChecked(), shown);
  f.assertSafe();
}

for (const scenario of [
  {
    name: 'cold mobile and repeated narrow width/height-only resizing',
    visible: false,
    viewport: { width: 390, height: 844 },
    resizes: [
      { width: 390, height: 640 }, { width: 390, height: 844 },
      { width: 375, height: 844 }, { width: 767, height: 844 },
      { width: 767, height: 640 }, { width: 390, height: 844 },
    ],
  },
  {
    name: 'cold desktop and repeated 767/768 crossings in both directions',
    visible: true,
    viewport: { width: 1440, height: 900 },
    resizes: [
      { width: 767, height: 900 }, { width: 768, height: 900 },
      { width: 767, height: 640 }, { width: 768, height: 640 },
      { width: 1024, height: 700 }, { width: 390, height: 844 },
      { width: 768, height: 900 },
    ],
  },
]) {
  test('full editor: toolbar ' + scenario.name + ' preserves functional controls and canonical data through sync/reload', { timeout: 60000 }, async t => {
    const f = await fixture(t, { viewport: scenario.viewport, visible: scenario.visible });
    const baseline = await f.durableState(), server = clone(f.model.row);
    assert.equal(baseline.library, JSON.stringify([f.track]));
    assert.equal(baseline.sync.sha256, hash(f.track));
    assert.equal(baseline.sync.revision, 4);
    assert.deepEqual(baseline.outbox, []);
    assert.equal(server.sha256, hash(f.track));
    assert.equal(server.revision, 4);
    await assertToolbarLayout(f, scenario.viewport);
    const observation = await observeToolbarNodes(f.page);
    await f.identify('name');
    await f.page.clock.runFor(1000); // Let the real identification flash finish.
    assert.equal(await f.page.locator('#statName').textContent(), f.track.name);
    await exerciseToolbarControls(f);
    await assertToolbarDataUnchanged(f, baseline, server);

    for (const viewport of scenario.resizes) {
      await exerciseToolbarControls(f, async () => {
        await resizeToolbar(f, viewport, observation);
        await assertToolbarDataUnchanged(f, baseline, server);
      });
      await assertToolbarLayout(f, viewport, observation);
      await assertToolbarDataUnchanged(f, baseline, server);
    }
    await f.page.clock.runFor(2000); // Include real delayed persistence scans.
    await f.startSync();
    assert.equal(await f.finishSync(), true, 'A complete private sync must succeed after repeated responsive changes');
    await assertToolbarDataUnchanged(f, baseline, server);
    await assertToolbarLayout(f, scenario.resizes.at(-1), observation);
    await observation.dispose();

    await f.reloadAndSettle();
    await assertToolbarLayout(f, scenario.resizes.at(-1));
    await assertToolbarDataUnchanged(f, baseline, server);
    await f.identify('name');
    await f.page.clock.runFor(1000);
    await exerciseToolbarControls(f);
    await f.page.clock.runFor(2000);
    await f.startSync();
    assert.equal(await f.finishSync(), true);
    await assertToolbarDataUnchanged(f, baseline, server);
  });
}

// Cancel uses only the editor copy, even while an earlier durable Save awaits
// acknowledgement. These cases execute the real IndexedDB outbox and API path.
for (const origin of ['explicit Save', 'earlier rename', 'Save ACK during confirmation']) {
  test('full editor: Cancel preserves a held ' + origin + ' upload without compensating writes', { timeout: 30000 }, async t => {
    const f=await fixture(t);await f.identify();const held=f.hold('put');
    if(origin!=='earlier rename'){
      await f.page.locator('#reverseBtn').evaluate(b=>b.click());
      await f.page.locator('#saveBtn').evaluate(b=>b.click());
      await f.page.clock.runFor(40);
    }else await f.rename('Saved before cancellable edit');
    const first=await held.entered;
    let durable=await f.durableState();
    await f.page.locator('#reverseBtn').evaluate(b=>b.click());
    await f.page.locator('#cancelChangeBtn').evaluate(b=>b.click());
    if(origin==='Save ACK during confirmation'){f.release('put');await observed(()=>f.requests('put')[0].settled);await f.page.clock.runFor(6000);durable=await f.durableState();}
    await f.page.locator('#discardEditConfirm').click();
    assert.deepEqual(await f.durableState(),durable,'Cancel must not touch library, outbox, sync revision or pending deletes');
    if(origin!=='Save ACK during confirmation')f.release('put');await observed(()=>f.requests('put')[0].settled);
    await f.page.clock.runFor(6000);await f.startSync();assert.equal(await f.finishSync(),true);
    assert.equal(f.requests('put').length,1);assert.deepEqual(f.model.row.track,first.body.track);
    assert.deepEqual(f.writes().map(r=>r.method),['PUT']);f.assertSafe();
  });
}
test('full editor: blocked note editing during Cancel session never publishes Shared GPX', { timeout:30000 },async t=>{
 const f=await fixture(t,{linkedShared:true});await f.identify();await f.note('Prior saved note');await f.page.clock.runFor(3000);await f.startSync();await f.finishSync();
 const writes=f.writes().length,publishes=f.requests('publish').length;
 await f.page.locator('#reverseBtn').evaluate(b=>b.click());
 f.page.once('dialog',d=>d.accept());await f.page.locator('.track-note textarea').evaluate(el=>{el.value='Blocked edit';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await f.page.locator('#cancelChangeBtn').evaluate(b=>b.click());await f.page.locator('#discardEditConfirm').click();
 await f.page.clock.runFor(6000);await f.startSync();await f.finishSync();assert.equal(f.requests('publish').length,publishes);assert.equal(f.writes().length,writes);assert.equal((await f.tracks())[0].note,'Prior saved note');f.assertSafe();
});
test('full editor: publication begun before editing cannot replace the active working copy', {timeout:30000},async t=>{
 const f=await fixture(t,{linkedShared:true});await f.identify();const held=f.hold('publish');
 await f.page.locator('[data-track-id="'+f.track.id+'"] .track-more').evaluate(b=>b.click());
 await f.page.locator('.track-menu').getByRole('button',{name:/^(Share|Publish to Shared)$/}).evaluate(b=>b.click());
 await held.entered;
 await f.page.locator('#reverseBtn').evaluate(b=>b.click());
 const points=await f.page.locator('#pointsToggle').evaluate(b=>{b.click();return document.getElementById('pointsBody').textContent;});
 await f.page.locator('#cancelChangeBtn').evaluate(b=>b.click());
 assert.equal(await f.page.locator('#discardEditDialog').isVisible(),true);
 f.page.once('dialog',d=>d.accept());f.release('publish');await observed(()=>f.requests('publish')[0].settled);
 await f.page.clock.runFor(1500);
 assert.equal(await f.page.locator('#pointsBody').textContent(),points,'Publication ACK must not replace in-progress geometry');
 const before=await f.durableState();f.page.once('dialog',d=>d.accept());await f.page.locator('#discardEditConfirm').click();
 assert.equal(await f.page.locator('#pointsBody').textContent(),points,'Conflict leaves editor intact');assert.deepEqual(await f.durableState(),before,'Conflict must not roll back publication identity');assert.equal(f.requests('publish').length,1);f.assertSafe();
});
test('full editor: an edit cannot begin during confirmed deletion authorization', {timeout:30000},async t=>{
 const f=await fixture(t);await f.identify();f.page.once('dialog',d=>d.accept());
 const r=await f.page.evaluate(id=>{window.__cancelDelete=window.mancardoAuthorizedDelete([id]);const pending=window.mancardoEditDeletionPending();document.getElementById('reverseBtn').click();return {pending,cancelVisible:!document.getElementById('cancelChangeBtn').classList.contains('hidden')};},f.track.id);
 assert.deepEqual(r,{pending:true,cancelVisible:false});assert.equal(await f.page.evaluate(()=>window.__cancelDelete),true);assert.deepEqual(f.writes().map(r=>r.method),['DELETE']);f.assertSafe();
});
