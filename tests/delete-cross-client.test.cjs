// Full emitted-editor regression fixture. Uses real Chromium DOM, localStorage,
// IndexedDB, WebCrypto, editor boot, and the complete generated sync client.
// Only map rendering/CDN assets and the authenticated remote API are replaced.
// All tracks are synthetic; no network, account, D1, or deployment is contacted.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const LIB = 'switchback_local_tracks_v1';
const PENDING = 'mancardo_authorized_delete_pending_v4';
const ORIGIN = 'http://127.0.0.1:43672';
const clone = x => JSON.parse(JSON.stringify(x));
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fixtureTrack = () => ({id:'fixture-one',type:'track',name:'Synthetic cross-device route',segments:[[{lat:1,lon:2},{lat:1.001,lon:2.001}]],visible:true,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'});
let browser, html;

// This adapter does not contain any editor, storage, synchronization, conflict,
// or deletion logic. It supplies only Leaflet's rendering/event surface.
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

test.before(async()=>{
  const worker=(await import(pathToFileURL(process.env.MANCARDO_DELETE_TEST_ENTRY||path.join(root,'worker-delete-durable-fix.js')).href)).default;
  const response=await worker.fetch(new Request(ORIGIN+'/'),{ASSETS:{fetch:async()=>new Response(fs.readFileSync(path.join(root,'index.html'),'utf8'),{headers:{'content-type':'text/html'}})},PRIVATE_LIBRARY_DB:{prepare(){throw new Error('No database access is allowed in this fixture');}}},{});
  html=await response.text();
  assert.ok(html.includes('installMancardoPrivateCloudSync'));
  assert.ok(html.includes('mancardoAuthorizedDelete'));
  browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']});
});
test.after(async()=>{await browser?.close();});

async function eventually(predicate){const until=Date.now()+5000;while(Date.now()<until){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('Fixture condition did not settle');}

async function fixture(t) {
  const track=fixtureTrack();
  const model={rows:new Map([[track.id,{track_id:track.id,revision:1,sha256:hash(track),deleted:false,track:clone(track),device_id:'fixture-origin',updated_at:1}]]),requests:[],pullGate:null,putGate:null};
  const clients=[];
  async function client(device, options={}) {
    const context=await browser.newContext({viewport:{width:1440,height:900}});t.after(()=>context.close());
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url()),method=request.method();
      if(url.origin!==ORIGIN){
        if(/leaflet.*\.js/.test(url.pathname))return route.fulfill({contentType:'text/javascript',body:'('+leafletFixture.toString()+')();'});
        return route.fulfill({contentType:/\.css/.test(url.pathname)?'text/css':'text/javascript',body:''});
      }
      if(url.pathname==='/fixture-setup')return route.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'});
      if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
      if(url.pathname==='/api/private-library/health')return route.fulfill({json:{authenticated:true,authConfigured:true,storageReady:true,accountKey:'fixture-account',accountLabel:'Synthetic test account'}});
      if(url.pathname==='/api/private-library/tracks'){
        const rows=clone([...model.rows.values()]);
        model.requests.push({device,method,path:url.pathname});
        if(model.pullGate?.device===device){const gate=model.pullGate;model.pullGate=null;gate.entered();await gate.release;}
        return route.fulfill({json:{items:rows,has_more:false}});
      }
      if(url.pathname.startsWith('/api/private-library/tracks/')){
        const id=decodeURIComponent(url.pathname.split('/').pop()),row=model.rows.get(id);
        const data=method==='GET'?null:request.postDataJSON();model.requests.push({device,method,id,data:clone(data)});
        if(method==='GET')return route.fulfill({status:row?200:404,json:row||{error:'missing'}});
        if(method==='PUT'&&model.putGate?.device===device&&model.putGate.id===id){const gate=model.putGate;model.putGate=null;gate.entered({id,data:clone(data)});await gate.release;}
        if(method==='DELETE'&&request.headers()['x-mancardo-delete-account']!=='fixture-account')throw new Error('Delete account binding missing');
        if(data.base_revision!==(row?.revision||0))return route.fulfill({status:409,json:{code:'revision_conflict',current:row?{revision:row.revision,deleted:row.deleted,content_sha256:row.sha256,updated_at:row.updated_at}:null}});
        const next={track_id:id,revision:(row?.revision||0)+1,sha256:method==='PUT'?hash(data.track):(row?.sha256||''),deleted:method==='DELETE',track:method==='PUT'?clone(data.track):null,device_id:data.device_id,updated_at:Date.now()};
        model.rows.set(id,next);return route.fulfill({json:next});
      }
      if(url.pathname.startsWith('/api/'))return route.fulfill({json:{items:[],tracks:[],waypoints:[],storageReady:true,authenticated:true,authConfigured:true}});
      return route.fulfill({status:404,body:''});
    });
    await page.goto(ORIGIN+'/fixture-setup');
    await page.evaluate(async ({track,device,options,LIB,PENDING})=>{
      localStorage.setItem(LIB,JSON.stringify([track]));localStorage.setItem('mancardo_private_device_id_v1',device);localStorage.setItem(PENDING,'[]');
      const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('mancardo_private_sync_v2',1);req.onupgradeneeded=()=>{for(const store of ['meta','sync','outbox'])req.result.createObjectStore(store,{keyPath:'key'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
      const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(track))))).map(b=>b.toString(16).padStart(2,'0')).join('');
      await new Promise((resolve,reject)=>{const tx=db.transaction(['meta','sync'],'readwrite');tx.objectStore('meta').put({key:'boundAccountKey',value:'fixture-account'});tx.objectStore('sync').put({key:'fixture-account|'+track.id,id:track.id,accountKey:'fixture-account',revision:1,sha256,deleted:false});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
    },{track,device,options,LIB,PENDING});
    await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
    await page.clock.pauseAt(new Date('2026-01-01T00:00:00Z'));
    await page.goto(ORIGIN+'/');
    await page.clock.runFor(500);
    assert.deepEqual(errors,[],'Full emitted editor must boot without exceptions');
    await page.waitForFunction(()=>typeof window.mancardoAuthorizedDelete==='function');
    await page.locator('[data-track-id="fixture-one"]').waitFor();
    const result={page,context,errors,device,
      // Await the installed cloud handler directly; the separate capture-layer
      // Sync-now reload shim is not the subject of these tombstone tests.
      async sync(){return page.evaluate(()=>document.getElementById('mancardoPrivateSyncNow').onclick());},
      async tracks(){return page.evaluate(LIB=>JSON.parse(localStorage.getItem(LIB)||'[]'),LIB);},
      async remove(){await page.locator('[data-track-id="fixture-one"] .track-more').evaluate(button=>button.click());page.once('dialog',dialog=>dialog.accept());await page.locator('[data-track-id="fixture-one"] .mancardo-menu-delete').evaluate(button=>button.click());await eventually(()=>page.evaluate(PENDING=>JSON.parse(localStorage.getItem(PENDING)||'[]')[0]?.confirmedRevision===2,PENDING));},
      async rename(name){await page.locator('[data-track-id="fixture-one"] .track-more').evaluate(button=>button.click());page.once('dialog',dialog=>dialog.accept(name));await page.locator('[data-track-id="fixture-one"] .track-menu').getByRole('button',{name:'Rename',exact:true}).evaluate(button=>button.click());},
      async waitForOfflineRenameQueued(name){
        assert.equal(await page.evaluate(()=>navigator.onLine),false,'Keep the receiver offline until its rename event finishes queuing');
        // The DOM rename handler returns before its async queueScan completes.
        // A readonly transaction completes only after the earlier outbox write
        // commits, so the event-driven flush has already observed offline=true.
        // Do not reconnect early and race that flush with the explicit sync.
        await eventually(()=>page.evaluate(expected=>new Promise((resolve,reject)=>{
          const opening=indexedDB.open('mancardo_private_sync_v2',1);
          opening.onerror=()=>reject(opening.error);
          opening.onsuccess=()=>{
            const db=opening.result,tx=db.transaction('outbox','readonly');
            const request=tx.objectStore('outbox').get('fixture-account|fixture-one');let operation;
            request.onsuccess=()=>{operation=request.result;};
            tx.oncomplete=()=>{db.close();resolve(operation?.op==='put'&&operation.track?.name===expected);};
            tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||new Error('Cannot inspect queued rename'));};
          };
        }),name));
      },
      async reload(){await page.reload();await page.clock.runFor(500);assert.deepEqual(errors,[]);}
    };clients.push(result);return result;
  }
  return {track,model,clients,client};
}

test('remote tombstone removes a clean second-device replica without uploading a conflict copy',{timeout:30000},async t=>{
  const f=await fixture(t),a=await f.client('fixture-device-a'),b=await f.client('fixture-device-b');
  await a.sync();await b.sync();assert.equal(f.model.requests.filter(r=>r.method==='PUT').length,0);
  await a.remove();assert.equal(f.model.rows.get(f.track.id).deleted,true);
  assert.deepEqual(await b.page.evaluate(PENDING=>JSON.parse(localStorage.getItem(PENDING)),PENDING),[],'Receiving device has no local deletion intent');
  await b.sync();
  const copies=[...f.model.rows.values()].filter(row=>!row.deleted);
  assert.deepEqual(copies,[],'An unchanged receiver must not create and upload Recovery snapshot before cloud delete');
  assert.deepEqual(await b.tracks(),[]);
  await a.sync();assert.deepEqual(await a.tracks(),[],'The deleting device must not download a newly invented conflict copy');
  await b.reload();await b.sync();assert.deepEqual(await b.tracks(),[]);
});

test('full-editor receiver retains a real unsynced rename as a conflict copy',{timeout:30000},async t=>{
  const f=await fixture(t),a=await f.client('fixture-device-a'),b=await f.client('fixture-device-b');
  await a.sync();await b.sync();await a.remove();
  await b.context.setOffline(true);await b.rename('Synthetic unsynced rename');
  await b.waitForOfflineRenameQueued('Synthetic unsynced rename');
  await b.context.setOffline(false);assert.equal(await b.sync(),true,'The explicit sync must complete, not return early behind another upload');
  const live=[...f.model.rows.values()].filter(row=>!row.deleted);
  assert.equal(live.length,1);assert.notEqual(live[0].track_id,f.track.id);assert.match(live[0].track.name,/Synthetic unsynced rename/);
  assert.deepEqual(live[0].track.segments,f.track.segments);assert.equal(f.model.rows.get(f.track.id).deleted,true);assert.deepEqual(b.errors,[]);
});

test('full-editor visibility checkbox is not a substantive conflict after another device deletes',{timeout:30000},async t=>{
  const f=await fixture(t),a=await f.client('fixture-device-a'),b=await f.client('fixture-device-b');
  await a.sync();await b.sync();await a.remove();
  await b.page.locator('[data-track-id="fixture-one"] .track-show').evaluate(checkbox=>checkbox.click());
  await b.sync();
  assert.deepEqual([...f.model.rows.values()].filter(row=>!row.deleted),[]);assert.deepEqual(await b.tracks(),[]);assert.deepEqual(b.errors,[]);
});

test('full-editor rename during a pending tombstone hash is never discarded',{timeout:30000},async t=>{
  const f=await fixture(t),a=await f.client('fixture-device-a'),b=await f.client('fixture-device-b');
  await a.sync();await b.sync();await a.remove();
  let entered,release;const pulled=new Promise(resolve=>entered=resolve),released=new Promise(resolve=>release=resolve);
  f.model.pullGate={device:b.device,entered,release:released};
  const syncing=b.sync();await pulled;
  await b.page.evaluate(()=>{
    const digest=crypto.subtle.digest.bind(crypto.subtle);window.__fixtureHashEntered=false;
    crypto.subtle.digest=async function(...args){crypto.subtle.digest=digest;const value=await digest(...args);window.__fixtureHashEntered=true;await new Promise(resolve=>window.__fixtureReleaseHash=resolve);return value;};
  });
  release();await eventually(()=>b.page.evaluate(()=>window.__fixtureHashEntered));
  await b.context.setOffline(true);await b.rename('Synthetic edit during hash');
  await b.waitForOfflineRenameQueued('Synthetic edit during hash');
  await b.page.evaluate(()=>window.__fixtureReleaseHash());await syncing;
  // The edit can be preserved locally while offline; reconnect and complete
  // the actual generated queue/flush path before inspecting server records.
  await b.context.setOffline(false);assert.equal(await b.sync(),true,'The explicit sync must complete, not return early behind another upload');
  const live=[...f.model.rows.values()].filter(row=>!row.deleted);
  assert.equal(live.length,1);assert.match(live[0].track.name,/Synthetic edit during hash/);assert.equal(f.model.rows.get(f.track.id).deleted,true);assert.deepEqual(b.errors,[]);
});

test('event-driven rename flush makes overlapping sync return early until its held conflict response settles',{timeout:30000},async t=>{
  const f=await fixture(t),a=await f.client('fixture-device-a'),b=await f.client('fixture-device-b');
  await a.sync();await b.sync();await a.remove();
  let entered,release;
  const uploading=new Promise(resolve=>entered=resolve),released=new Promise(resolve=>release=resolve);
  f.model.putGate={device:b.device,id:f.track.id,entered,release:released};
  // Stay online so the real rename event starts queueScan().then(flushOutbox).
  // Hold that PUT's 409 response at the fixture API, not an arbitrary timeout.
  await b.rename('Synthetic overlap rename');
  const attempted=await uploading;
  assert.equal(attempted.id,f.track.id);assert.equal(attempted.data.base_revision,1);
  assert.equal(attempted.data.track.name,'Synthetic overlap rename');
  assert.equal(await b.page.locator('#mancardoPrivateSyncChip').getAttribute('data-state'),'syncing');
  assert.equal(await b.sync(),undefined,'Sync-now must expose its actual early return while the rename upload is in flight');
  assert.deepEqual([...f.model.rows.values()].filter(row=>!row.deleted),[],'The held upload has not yet preserved or uploaded a recovery copy');
  release();
  // The event-only flush preserves the dirty local copy, but it does not run
  // another queue scan to upload that new ID. Wait for its exact local outcome
  // and terminal status before starting one explicit, complete synchronization.
  await eventually(()=>b.page.evaluate(LIB=>{
    const tracks=JSON.parse(localStorage.getItem(LIB)||'[]');
    return tracks.length===1&&tracks[0].id!=='fixture-one'&&tracks[0].name==='Synthetic overlap rename (conflict copy)'&&document.getElementById('mancardoPrivateSyncChip').dataset.state==='synced';
  },LIB));
  assert.deepEqual([...f.model.rows.values()].filter(row=>!row.deleted),[],'Event-only conflict recovery remains local until the next scan');
  assert.equal(await b.sync(),true,'The explicit sync must now run to completion');
  const live=[...f.model.rows.values()].filter(row=>!row.deleted);
  assert.equal(live.length,1);assert.notEqual(live[0].track_id,f.track.id);
  assert.equal(live[0].track.name,'Synthetic overlap rename (conflict copy)');
  assert.deepEqual(live[0].track.segments,f.track.segments);assert.equal(f.model.rows.get(f.track.id).deleted,true);
  assert.deepEqual(f.model.requests.filter(request=>request.device===b.device&&request.method==='PUT').map(request=>[request.id,request.data.base_revision]),[[f.track.id,1],[live[0].track_id,0]]);
  assert.deepEqual(b.errors,[]);
});
