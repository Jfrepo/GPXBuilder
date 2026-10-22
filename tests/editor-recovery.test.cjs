// Local audit only. Reuses the deployed full-editor fixture; all requests are
// intercepted. No source changes, real accounts, live APIs or database access.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const ROOT = path.resolve(__dirname, '..');
process.env.MANCARDO_DELETE_TEST_ENTRY ||= path.join(ROOT, 'dist/production/worker-delete-durable-fix.js');
let setup, teardown, fixture, emitted, observed;
test.before(async () => {
  const hooks = {before: fn => setup = fn, after: fn => teardown = fn};
  const source = fs.readFileSync(path.join(__dirname, 'request-volume-browser.test.cjs'), 'utf8');
  const boundary = '\nfor (const visible of [false, true])';
  assert.ok(source.indexOf(boundary) > 0);
  let helpers = source.split(boundary)[0].replace("const test = require('node:test');", 'const test = hooks;');
  // Extend only the existing Leaflet platform adapter to deliver synthetic map
  // clicks through the application's original handler. No editor logic replaced.
  helpers = helpers.replace('window.__trafficLeaflet = {', `window.__trafficLeaflet = {
    fireMap(lat, lng) { const map = layers.find(x => x._fixtureKind === 'map');
      const handler = handlers.get(map).click;
      if (!handler) throw Error('No map click listener');
      handler({latlng: {lat, lng}, originalEvent: {}});
    },`);
  helpers=helpers.replace('const track = trackFixture(), shared = sharedFixture();','const track = trackFixture(), shared = sharedFixture(); if(options.syntheticTrack)Object.assign(track, options.syntheticTrack);');
  ({fixture, observed} = new Function('require', '__dirname', 'hooks', helpers + '\nreturn {fixture, observed};')(require, __dirname, hooks));
  await setup();
  const worker = (await import(pathToFileURL(process.env.MANCARDO_DELETE_TEST_ENTRY).href)).default;
  emitted = await (await worker.fetch(new Request('https://synthetic.invalid/'), {
    ASSETS: {fetch: async () => new Response(fs.readFileSync(path.join(path.dirname(process.env.MANCARDO_DELETE_TEST_ENTRY), 'assets/index.html'), 'utf8'), {headers: {'content-type':'text/html'}})},
    PRIVATE_LIBRARY_DB: {prepare() {throw Error('No database access allowed');}},
  }, {})).text();
});
test.after(async () => teardown?.());

async function download(f) {
  const pending = f.page.waitForEvent('download');
  await f.page.locator('#exportBtn').click();
  const item = await pending;
  assert.equal(await item.failure(), null);
  const chunks = [];
  for await (const chunk of await item.createReadStream()) chunks.push(chunk);
  return {xml: Buffer.concat(chunks).toString('utf8'), name: item.suggestedFilename()};
}
async function points(f, xml) {
  return f.page.evaluate(xml => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw Error('Invalid XML export');
    return [...doc.querySelectorAll('trkseg')].map(s => [...s.querySelectorAll('trkpt')].map(p => ({lat:Number(p.getAttribute('lat')),lon:Number(p.getAttribute('lon'))})));
  }, xml);
}
async function runCodec(f, item) {
  const core = emitted.slice(emitted.indexOf('function parseGpxFile('), emitted.indexOf('// ---------- Leaflet map ----------'));
  const helpers = emitted.slice(emitted.indexOf('function uid('), emitted.indexOf('function fmtDate('));
  assert.ok(core.startsWith('function parseGpxFile('));
  return f.page.evaluate(({core, helpers, item}) => {
    const codec = new Function(helpers + '\n' + core + '\nreturn {buildGpx,parseGpxFile};')();
    const xml = codec.buildGpx(item);
    return {xml, imported:codec.parseGpxFile(xml,'synthetic.gpx')};
  }, {core, helpers, item});
}

const PREFIX='mancardo_editor_recovery_v1:';
async function copies(page){return page.evaluate(prefix=>Object.keys(localStorage).filter(k=>k.startsWith(prefix)).map(k=>({key:k,raw:localStorage.getItem(k),...JSON.parse(localStorage.getItem(k))})),PREFIX);}
async function saved(f,count=1){await observed(async()=>(await copies(f.page)).length===count);assert.match(await f.page.locator('#mancardoRecoveryStatus').textContent(),/saved on this device/);}
async function open(f){await f.page.locator('#mancardoRecoveryOpen').click();await observed(async()=>await f.page.getByRole('button',{name:'Recover as new unsaved copy',exact:true}).count()>0);}
async function restore(f){await open(f);await f.page.getByRole('button',{name:'Recover as new unsaved copy',exact:true}).first().click();await observed(async()=>!(await f.page.locator('#mancardoRecoveryDialog').evaluate(e=>e.open)));}

test('recovery: Reverse survives reload by explicit new-copy choice with exact GPX and payload',async t=>{
 const f=await fixture(t,{linkedShared:true});await f.identify();const library=await f.tracks(),beforeWrites=f.writes().length;
 await f.page.locator('#reverseBtn').click();await saved(f);const file=await download(f),record=(await copies(f.page))[0],payload=JSON.parse(record.payload);
 assert.deepEqual(payload.segments,[library[0].segments[0].slice().reverse()]);assert.equal(f.writes().length,beforeWrites);assert.deepEqual(await f.tracks(),library);
 await f.reloadAndSettle();await restore(f);assert.equal((await download(f)).xml,file.xml);assert.deepEqual(await f.tracks(),library);
 // Full editable payload captured exactly; only new identity and active Shared linkage change upon recovery.
 await f.page.locator('#saveBtn').click();await f.page.locator('#nameInput').fill(payload.name);await f.page.locator('#nameSaveBtn').click();
 const copy=(await f.tracks()).find(x=>x.id!==f.track.id);assert.ok(copy);const expected={...payload,id:copy.id,updatedAt:copy.updatedAt,stats:copy.stats,name:copy.name};
 for(const k of ['sharedId','sharedBaseVersion','sharedBaseModifiedAt','sharedBaseModifiedBy'])delete expected[k];
 assert.deepEqual(copy,expected);f.assertSafe();
});
test('recovery: unnamed three-point route survives reload without library or cloud Save',async t=>{
 const f=await fixture(t);await f.page.locator('#newRouteBtn').click();await f.page.evaluate(()=>{window.__trafficLeaflet.fireMap(1,2);window.__trafficLeaflet.fireMap(1.1,2.2);window.__trafficLeaflet.fireMap(1.2,2.1);});await saved(f);
 const file=await download(f),old=await f.tracks();await f.reloadAndSettle();await restore(f);assert.equal((await download(f)).xml,file.xml);assert.deepEqual(await f.tracks(),old);assert.equal(f.writes().length,0);f.assertSafe();
});
test('recovery: selection and redraw create no record; undo/redo update post-edit snapshots',async t=>{
 const f=await fixture(t);await f.identify();await f.identify();await f.page.setViewportSize({width:1200,height:800});assert.equal((await copies(f.page)).length,0);
 await f.page.locator('#reverseBtn').click();await saved(f);await f.page.locator('#undoBtn').click();await f.page.locator('#redoBtn').click();
 await observed(async()=>(await copies(f.page))[0]?.sequence>=2);assert.deepEqual(JSON.parse((await copies(f.page))[0].payload).segments,[f.track.segments[0].slice().reverse()]);f.assertSafe();
});
test('recovery: quota failure retains previous good copy and current GPX',async t=>{
 const f=await fixture(t);await f.identify();await f.page.locator('#reverseBtn').click();await saved(f);const before=await copies(f.page);
 await f.page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('mancardo_editor_recovery_v1:'))throw new DOMException('Synthetic quota denial','QuotaExceededError');return original.call(this,k,v);};});
 // Reverse back, then make a distinct dirty edit through actual draw/extend UI adapter.
 await f.page.locator('#reverseBtn').click();await f.page.locator('#reverseBtn').click();const file=await download(f);
 await observed(async()=>/not saved/.test(await f.page.locator('#mancardoRecoveryStatus').textContent()));assert.deepEqual(await copies(f.page),before);assert.equal((await download(f)).xml,file.xml);f.assertSafe();
});
test('recovery: account mismatch hides copies and prevents restore',async t=>{
 const f=await fixture(t);await f.identify();await f.page.locator('#reverseBtn').click();await saved(f);
 await f.page.route('**/api/private-library/health',route=>route.fulfill({json:{authenticated:true,authConfigured:true,storageReady:true,accountKey:'other-synthetic-owner'}}));await f.page.evaluate(()=>document.getElementById('mancardoPrivateSyncNow').onclick());
 await f.page.locator('#mancardoRecoveryOpen').click();assert.equal(await f.page.getByRole('button',{name:'Recover as new unsaved copy'}).count(),0);assert.match(await f.page.locator('#mancardoRecoveryList').textContent(),/Verify the account/);f.assertSafe();
});
test('recovery: remote tombstone fences dirty snapshot and allows export only',async t=>{
 const f=await fixture(t);await f.identify();await f.page.locator('#reverseBtn').click();await saved(f);const file=await download(f);
 Object.assign(f.model.row,{revision:5,deleted:true,track:null,updated_at:2});await f.page.evaluate(()=>document.getElementById('mancardoPrivateSyncNow').onclick());await open(f);
 await f.page.getByRole('button',{name:'Recover as new unsaved copy'}).click();await observed(async()=>/Deleted or expired/.test(await f.page.locator('#mancardoRecoveryStatus').textContent()));
 const pending=f.page.waitForEvent('download');await f.page.getByRole('button',{name:'Download GPX',exact:true}).click();const d=await pending,chunks=[];for await(const c of await d.createReadStream())chunks.push(c);assert.equal(Buffer.concat(chunks).toString(),file.xml);assert.equal(f.writes().length,0);f.assertSafe();
});
async function holdNextHash(page){await page.evaluate(()=>{const original=crypto.subtle.digest.bind(crypto.subtle);let once=true;crypto.subtle.digest=function(...args){if(!once)return original(...args);once=false;window.__recoveryHashHeld=true;return new Promise(resolve=>window.__releaseRecoveryHash=()=>resolve(original(...args)));};});}
async function releaseHash(page){await page.evaluate(()=>window.__releaseRecoveryHash());}

test('recovery: account switch during capture await prevents writing or relabelling',async t=>{
 const f=await fixture(t);await f.identify();await holdNextHash(f.page);await f.page.locator('#reverseBtn').click();await observed(()=>f.page.evaluate(()=>!!window.__recoveryHashHeld));
 await f.page.route('**/api/private-library/health',r=>r.fulfill({json:{authenticated:true,authConfigured:true,storageReady:true,accountKey:'other-synthetic-owner'}}));await f.page.evaluate(()=>document.getElementById('mancardoPrivateSyncNow').onclick());await releaseHash(f.page);
 await observed(async()=>/not saved/.test(await f.page.locator('#mancardoRecoveryStatus').textContent()));assert.deepEqual(await copies(f.page),[]);f.assertSafe();
});
test('recovery: tombstone during capture await prevents a late recovery record',async t=>{
 const f=await fixture(t);await f.identify();await holdNextHash(f.page);await f.page.locator('#reverseBtn').click();await observed(()=>f.page.evaluate(()=>!!window.__recoveryHashHeld));
 Object.assign(f.model.row,{revision:5,deleted:true,track:null,updated_at:2});await f.page.evaluate(()=>document.getElementById('mancardoPrivateSyncNow').onclick());await releaseHash(f.page);
 await observed(async()=>/blocked by deletion/.test(await f.page.locator('#mancardoRecoveryStatus').textContent()));assert.deepEqual(await copies(f.page),[]);assert.equal(f.writes().length,0);f.assertSafe();
});
test('recovery: explicit delete keeps permanent fence after queue and metadata changes',async t=>{
 const f=await fixture(t);await f.identify();await f.page.locator('#reverseBtn').click();await saved(f);await f.page.locator('#undoBtn').click();await f.remove();await observed(async()=>(await f.tracks()).length===0);
 // Simulate a later generation after normal pending bookkeeping clears; fence must still dominate old draft.
 await f.page.evaluate(async()=>{localStorage.setItem('mancardo_authorized_delete_pending_v4','[]');const db=await new Promise(r=>{const q=indexedDB.open('mancardo_private_sync_v2');q.onsuccess=()=>r(q.result);});await new Promise(r=>{const tx=db.transaction('sync','readwrite');tx.objectStore('sync').clear();tx.oncomplete=r;});db.close();});
 await open(f);await f.page.getByRole('button',{name:'Recover as new unsaved copy'}).click();await observed(async()=>/Deleted or expired/.test(await f.page.locator('#mancardoRecoveryStatus').textContent()));assert.deepEqual(await f.tracks(),[]);f.assertSafe();
});
async function secondTab(f,t){const page=await f.page.context().newPage();t.after(()=>page.close());await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});await page.clock.pauseAt(new Date('2026-01-01T00:00:00Z'));await page.goto(f.page.url());await page.clock.runFor(2000);await page.evaluate(()=>document.getElementById('mancardoPrivateSyncNow').onclick());await page.locator('[data-track-id="'+f.track.id+'"] .ti-name').evaluate(e=>e.click());return page;}
test('recovery: competing tabs retain independent snapshots and discard only one exact copy',async t=>{
 const f=await fixture(t);await f.identify();const other=await secondTab(f,t);
 await Promise.all([f.page.locator('#reverseBtn').click(),other.locator('#reverseBtn').click()]);await observed(async()=>(await copies(f.page)).length===2);const before=await copies(f.page);assert.notEqual(before[0].tab,before[1].tab);
 await open(f);f.page.once('dialog',d=>d.accept());await f.page.getByRole('button',{name:'Discard this copy',exact:true}).first().click();await observed(async()=>(await copies(f.page)).length===1);
 const remaining=(await copies(f.page))[0];assert.equal(remaining.raw,before.find(x=>x.key===remaining.key).raw);assert.equal(f.writes().length,0);f.assertSafe();
});
test('recovery: concurrent capacity admission keeps ten-record cap with no eviction',async t=>{
 const f=await fixture(t);await f.identify();await f.page.locator('#reverseBtn').click();await saved(f);const template=(await copies(f.page))[0];
 await f.page.evaluate(({prefix,template})=>{for(const k of Object.keys(localStorage))if(k.startsWith(prefix))localStorage.removeItem(k);for(let i=0;i<9;i++)localStorage.setItem(prefix+'synthetic-seed-'+i,template.raw);},{prefix:PREFIX,template});
 await f.page.locator('#undoBtn').click();const other=await secondTab(f,t);
 await Promise.all([f.page.locator('#reverseBtn').click(),other.locator('#reverseBtn').click()]);await observed(async()=>/capacity reached/.test((await f.page.locator('#mancardoRecoveryStatus').textContent())+(await other.locator('#mancardoRecoveryStatus').textContent())));
 assert.equal((await copies(f.page)).length,10);for(const r of (await copies(f.page)).filter(x=>x.key.includes('synthetic-seed-')))assert.equal(r.raw,template.raw);f.assertSafe();
});
test('recovery: checksum corruption and seven-day expiry refuse recovery without deleting evidence',async t=>{
 const f=await fixture(t);await f.identify();await f.page.locator('#reverseBtn').click();await saved(f);await f.page.locator('#undoBtn').click();const record=(await copies(f.page))[0];
 await f.page.evaluate(r=>{const obj=JSON.parse(r.raw);obj.sha256='0'.repeat(64);localStorage.setItem(r.key,JSON.stringify(obj));},record);
 await open(f);await f.page.getByRole('button',{name:'Recover as new unsaved copy'}).click();await observed(async()=>/checksum failed/.test(await f.page.locator('#mancardoRecoveryStatus').textContent()));await f.page.getByRole('button',{name:'Keep for later'}).click();
 await f.page.evaluate(r=>{const obj=JSON.parse(r.raw);obj.at-=8*24*3600*1000;localStorage.setItem(r.key,JSON.stringify(obj));},record);
 await open(f);await f.page.getByRole('button',{name:'Recover as new unsaved copy'}).click();await observed(async()=>/Deleted or expired/.test(await f.page.locator('#mancardoRecoveryStatus').textContent()));assert.equal((await copies(f.page)).length,1);f.assertSafe();
});
test('recovery: account changes during recovery verification cannot replace editor',async t=>{
 const f=await fixture(t);await f.identify();await f.page.locator('#reverseBtn').click();await saved(f);await f.page.locator('#undoBtn').click();const before=(await download(f)).xml;await open(f);await holdNextHash(f.page);
 await f.page.getByRole('button',{name:'Recover as new unsaved copy'}).click();await observed(()=>f.page.evaluate(()=>!!window.__recoveryHashHeld));
 await f.page.route('**/api/private-library/health',r=>r.fulfill({json:{authenticated:true,authConfigured:true,storageReady:true,accountKey:'other-synthetic-owner'}}));await f.page.evaluate(()=>document.getElementById('mancardoPrivateSyncNow').onclick());await releaseHash(f.page);
 await observed(async()=>/not saved/.test(await f.page.locator('#mancardoRecoveryStatus').textContent()));assert.match(await f.page.locator('#mancardoRecoveryList').textContent(),/Account verification/);await f.page.getByRole('button',{name:'Keep for later'}).click();assert.equal((await download(f)).xml,before);f.assertSafe();
});
test('recovery: deletion fence storage failure retains intent and disables recovery',async t=>{
 const f=await fixture(t);await f.identify();await f.page.locator('#reverseBtn').click();await saved(f);await f.page.locator('#undoBtn').click();
 await f.page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('mancardo_editor_recovery_deleted_v1:'))throw new DOMException('Synthetic fence quota','QuotaExceededError');return original.call(this,k,v);};});
 await f.remove();await observed(async()=>/deletion fence could not be saved/.test(await f.page.locator('#mancardoRecoveryStatus').textContent()));assert.equal((await f.pending()).length,1);assert.equal((await copies(f.page)).length,1);assert.match(await f.page.locator('#mancardoPrivateSyncMessage').textContent(),/deletion intent is saved and will retry/);
 await f.page.locator('#mancardoRecoveryOpen').click();assert.equal(await f.page.getByRole('button',{name:'Recover as new unsaved copy'}).count(),0);
 await f.page.getByRole('button',{name:'Keep for later'}).click();await f.advanceTo(15000);await observed(()=>f.requests('delete').some(r=>r.settled));assert.equal(f.model.row.deleted,true);assert.equal((await f.pending()).length,1);f.assertSafe();
});
test('recovery: no-op redo does not update a dirty snapshot',async t=>{
 const f=await fixture(t);await f.identify();await f.page.locator('#reverseBtn').click();await saved(f);const before=await copies(f.page);
 await f.page.locator('#redoBtn').evaluate(e=>e.onclick());await f.page.clock.runFor(1000);assert.deepEqual(await copies(f.page),before);f.assertSafe();
});
test('recovery: malformed own record can be discarded without deleting other copies',async t=>{
 const f=await fixture(t);await f.identify();await f.page.locator('#reverseBtn').click();await saved(f);const before=await copies(f.page);
 await f.page.evaluate(key=>localStorage.setItem(key+'broken','{'),before[0].key);await open(f);f.page.once('dialog',d=>d.accept());await f.page.getByRole('button',{name:'Discard unreadable copy'}).click();await observed(async()=>await f.page.getByRole('button',{name:'Discard unreadable copy'}).count()===0);assert.deepEqual(await copies(f.page),before);f.assertSafe();
});
test('recovery: large rich synthetic payload survives exactly except intentional new identity and Shared linkage',async t=>{
 const all=Array.from({length:2810},(_,i)=>({lat:1+i/100000,lon:2+i/100000,ele:i/10,time:new Date(1700000000000+i*1000).toISOString(),extensions:{syntheticSensor:i%7}}));
 const rich={name:'Synthetic café 山',color:'#123456',note:'Synthetic note',draft:true,segments:[all.slice(0,1400),all.slice(1400)],customMetadata:{source:'synthetic',labels:['α','β']}};
 const f=await fixture(t,{syntheticTrack:rich,linkedShared:true});await f.identify();await f.page.locator('#reverseBtn').click();await saved(f);const record=(await copies(f.page))[0],expected=JSON.parse(record.payload),xml=(await download(f)).xml;
 await f.reloadAndSettle();await restore(f);assert.equal((await download(f)).xml,xml);await f.page.locator('#saveBtn').click();await f.page.locator('#nameInput').fill(expected.name);await f.page.locator('#nameSaveBtn').click();
 const copy=(await f.tracks()).find(x=>x.id!==f.track.id);Object.assign(expected,{id:copy.id,updatedAt:copy.updatedAt,stats:copy.stats});for(const key of ['sharedId','sharedBaseVersion','sharedBaseModifiedAt','sharedBaseModifiedBy'])delete expected[key];assert.deepEqual(copy,expected);f.assertSafe();
});
test('recovery: over-limit single payload fails honestly and retains live editor',async t=>{
 const f=await fixture(t,{syntheticTrack:{customMetadata:{syntheticPadding:'x'.repeat(550000)}}});await f.identify();await f.page.locator('#reverseBtn').click();
 await observed(async()=>/capacity reached/.test(await f.page.locator('#mancardoRecoveryStatus').textContent()));assert.deepEqual(await copies(f.page),[]);assert.deepEqual(await points(f,(await download(f)).xml),[f.track.segments[0].slice().reverse()]);f.assertSafe();
});
test('recovery: checksum-corrupt copy can be explicitly discarded without recovery',async t=>{
 const f=await fixture(t);await f.identify();await f.page.locator('#reverseBtn').click();await saved(f);const row=(await copies(f.page))[0];
 await f.page.evaluate(row=>{const record=JSON.parse(row.raw);record.sha256='0'.repeat(64);localStorage.setItem(row.key,JSON.stringify(record));},row);
 await open(f);f.page.once('dialog',d=>d.accept());await f.page.getByRole('button',{name:'Discard this copy',exact:true}).click();await observed(async()=>(await copies(f.page)).length===0);assert.deepEqual((await f.tracks())[0].segments,f.track.segments);f.assertSafe();
});
