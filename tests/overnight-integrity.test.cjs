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

test('current editor Reverse downloads exact latest geometry and imports under separate ID while library/cloud are older', async t => {
  const f = await fixture(t); await f.identify();
  const old = structuredClone(f.model.row), expected = [f.track.segments[0].slice().reverse()];
  await f.page.locator('#reverseBtn').click();
  const file = await download(f);
  assert.deepEqual(await points(f,file.xml),expected);
  assert.deepEqual((await f.tracks())[0].segments,old.track.segments);
  assert.deepEqual(f.model.row,old);
  await f.page.locator('#fileInput').setInputFiles({name:file.name,mimeType:'application/gpx+xml',buffer:Buffer.from(file.xml)});
  await f.page.locator('#importConfirmBtn').click();
  const all=await f.tracks(),copy=all.find(x=>x.id!==f.track.id);
  assert.equal(all.length,2); assert.deepEqual(copy.segments,expected);
  assert.deepEqual(f.model.row,old); f.assertSafe();
});

test('track codec retains 2810 ordered coordinates, elevation/time and two nonempty segments exactly', async t => {
  const f=await fixture(t);
  const pts=Array.from({length:2810},(_,i)=>({lat:-32+i/100000,lon:147+(i%17)/10000,ele:i%139-12.5,time:new Date(Date.UTC(2026,0,1,0,0,i)).toISOString()}));
  const item={id:'synthetic-large',type:'track',name:'Synthetic & <geometry>',segments:[pts.slice(0,1400),pts.slice(1400)],note:'Synthetic note',color:'#2563a8',visible:false,draft:true};
  const out=await runCodec(f,item);
  assert.equal(out.imported.length,1);assert.deepEqual(out.imported[0].segments,item.segments);assert.equal(out.imported[0].name,item.name);
  assert.notEqual(out.imported[0].id,item.id);
  assert.match(out.xml,/<mancardoNote>Synthetic note<\/mancardoNote>/);
  assert.match(out.xml,/mancardo:color/);
  assert.equal(out.imported[0].note,undefined);assert.equal(out.imported[0].color,undefined);
  assert.equal(out.imported[0].visible,undefined);assert.equal(out.imported[0].draft,undefined);
});

test('route codec limitation: flattens segments, drops consecutive duplicate coordinates and timestamps', async t => {
  const f=await fixture(t);
  const a={lat:1,lon:2,ele:3,time:'2026-01-01T00:00:00Z'},b={lat:1.1,lon:2.2,ele:4,time:'2026-01-01T01:00:00Z'},c={lat:3,lon:4,ele:6,time:'2026-01-01T02:00:00Z'};
  const result=await runCodec(f,{type:'route',name:'Synthetic route',segments:[[a,b],[{...b,ele:99},c]]});
  assert.deepEqual(result.imported[0].segments,[[{lat:1,lon:2,ele:3},{lat:1.1,lon:2.2,ele:4},{lat:3,lon:4,ele:6}]]);
});

test('track codec limitation: emitted corner waypoints and arbitrary point extensions are not restored', async t => {
  const f=await fixture(t);
  const item={type:'track',name:'Corners',segments:[[{lat:1,lon:2},{lat:1.1,lon:2.2,name:'Point label',extensions:{sensor:77}},{lat:1.2,lon:2.1}]]};
  const result=await runCodec(f,item);
  assert.equal((result.xml.match(/<wpt /g)||[]).length,1);
  assert.equal(result.imported.length,1);
  assert.equal(result.imported[0].segments[0][1].name,undefined);
  assert.equal(result.imported[0].segments[0][1].extensions,undefined);
});

test('explicit Save then successful sync preserves reversed geometry across reload', async t => {
  const f=await fixture(t); await f.identify();
  const expected=[f.track.segments[0].slice().reverse()];
  await f.page.locator('#reverseBtn').click();await f.page.locator('#saveBtn').click();
  assert.deepEqual((await f.tracks())[0].segments,expected);
  await f.page.evaluate(()=>document.getElementById('mancardoPrivateSyncNow').onclick());
  assert.deepEqual(f.model.row.track.segments,expected);
  await f.page.reload();await f.identify();
  assert.deepEqual(await points(f,(await download(f)).xml),expected);f.assertSafe();
});

test('recovery: geometry edit survives wait plus reload through explicit recovery without cloud Save', async t => {
  const f=await fixture(t);await f.identify();
  const expected=[f.track.segments[0].slice().reverse()];
  await f.page.locator('#reverseBtn').click();
  await f.page.clock.runFor(80000);
  console.log('unsaved-edit evidence',JSON.stringify({library:(await f.tracks())[0].segments,cloud:f.model.row.track.segments,chip:await f.page.locator('#mancardoPrivateSyncChip').textContent(),save:await f.page.locator('#saveBtn').textContent()}));
  await f.reloadAndSettle();
  await f.page.locator('#mancardoRecoveryOpen').click();
  await f.page.getByRole('button',{name:'Recover as new unsaved copy'}).first().click();
  await observed(async()=>!(await f.page.locator('#mancardoRecoveryDialog').evaluate(e=>e.open)));
  assert.deepEqual(await points(f,(await download(f)).xml),expected,'Unsaved Reverse geometry lost after explicit recovery');
});

test('recovery: new unnamed drawing persists an account-scoped recovery snapshot', async t => {
  const f=await fixture(t);
  await f.page.locator('#newRouteBtn').click();
  await f.page.evaluate(()=>{window.__trafficLeaflet.fireMap(1,2);window.__trafficLeaflet.fireMap(1.1,2.2);window.__trafficLeaflet.fireMap(1.2,2.1);});
  const xml=(await download(f)).xml;
  assert.equal((xml.match(/<rtept /g)||[]).length,3,'Map adapter must actually create the intended route');
  await f.page.clock.runFor(10000);
  const drafts=await f.page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('mancardo_editor_recovery_v1:')).map(k=>JSON.parse(localStorage.getItem(k))));
  assert.equal(drafts.length,1,'No unnamed draft was persisted after actual map edits');
  assert.deepEqual(JSON.parse(drafts[0].payload).segments,[[{lat:1,lon:2},{lat:1.1,lon:2.2},{lat:1.2,lon:2.1}]]);
});

test('REGRESSION: selecting the current row should not discard its unsaved editor geometry', async t => {
  const f=await fixture(t);await f.identify();
  const expected=[f.track.segments[0].slice().reverse()];
  await f.page.locator('#reverseBtn').click();
  assert.deepEqual(await points(f,(await download(f)).xml),expected);
  await f.identify();
  assert.deepEqual(await points(f,(await download(f)).xml),expected,'Same-row selection replaced the unsaved editor with its older library copy');
});

test('remote tombstone defers reconciliation and keeps unsaved editor geometry exportable', async t => {
  const f=await fixture(t);await f.identify();
  const expected=[f.track.segments[0].slice().reverse()];
  await f.page.locator('#reverseBtn').click();
  const beforeWrites=f.writes().length;
  Object.assign(f.model.row,{revision:5,deleted:true,track:null,updated_at:2});
  const result=await f.page.evaluate(()=>document.getElementById('mancardoPrivateSyncNow').onclick());
  console.log('tombstone return/status evidence',JSON.stringify({result,chip:await f.page.locator('#mancardoPrivateSyncChip').textContent(),message:await f.page.locator('#mancardoPrivateSyncMessage').textContent()}));
  assert.deepEqual(await points(f,(await download(f)).xml),expected);
  assert.equal(f.writes().length,beforeWrites,'Tombstone reconciliation must not upload a resurrection');
  assert.equal((await f.tracks()).length,1);f.assertSafe();
});

test('REGRESSION: deferred remote tombstone must not report the workspace as Synced', async t => {
  const f=await fixture(t);await f.identify();await f.page.locator('#reverseBtn').click();
  Object.assign(f.model.row,{revision:5,deleted:true,track:null,updated_at:2});
  await f.page.evaluate(()=>document.getElementById('mancardoPrivateSyncNow').onclick());
  assert.notEqual(await f.page.locator('#mancardoPrivateSyncChip').getAttribute('data-state'),'synced','Remote deletion was deferred for an unsaved editor but status says Synced');
});

test('proposal: blocked same-row selection retains dirty Save state and produces no cloud writes', async t => {
  const f=await fixture(t);await f.identify();await f.page.locator('#reverseBtn').click();
  const before=structuredClone(f.model.row),local=await f.tracks(),writes=f.writes().length;
  await f.identify();
  assert.equal(await f.page.locator('#saveBtn').textContent(),'Save changes');
  assert.match(await f.page.locator('#mancardoPrivateSyncMessage').textContent(),/editor has unsaved geometry/i);
  assert.deepEqual(await f.tracks(),local);assert.deepEqual(f.model.row,before);assert.equal(f.writes().length,writes);
  f.assertSafe();
});

test('proposal: new-route navigation refuses to overwrite a dirty editor and remains available after explicit Save', async t => {
  const f=await fixture(t);await f.identify();await f.page.locator('#reverseBtn').click();
  const expected=[f.track.segments[0].slice().reverse()];let warnings=0;
  f.page.on('dialog',async dialog=>{warnings++;assert.match(dialog.message(),/unsaved geometry/);await dialog.accept();});
  await f.page.locator('#newRouteBtn').click();
  assert.equal(warnings,1);assert.deepEqual(await points(f,(await download(f)).xml),expected);
  assert.equal(await f.page.locator('#saveBtn').textContent(),'Save changes');
  await f.page.locator('#saveBtn').click();
  await f.page.locator('#newRouteBtn').click();assert.equal(warnings,1);
  assert.match(await f.page.locator('#modeBanner span').textContent(),/Drawing mode/);
  f.assertSafe();
});

test('proposal: paused account status is not overwritten by an unsaved editor notification', async t => {
  const f=await fixture(t);await f.identify();
  await f.page.route('**/api/private-library/health',route=>route.fulfill({json:{authenticated:true,authConfigured:true,storageReady:true,accountKey:'synthetic-other-owner',accountLabel:'Other synthetic owner'}}));
  await f.page.evaluate(()=>document.getElementById('mancardoPrivateSyncNow').onclick());
  const before=await f.page.locator('#mancardoPrivateSyncChip').getAttribute('data-state');
  assert.equal(before,'paused');
  const writes=f.writes().length;await f.page.locator('#reverseBtn').click();
  assert.equal(await f.page.locator('#mancardoPrivateSyncChip').getAttribute('data-state'),'paused');
  assert.equal(f.writes().length,writes);
});

test('proposal: delayed shared preview cannot overwrite geometry edited while its response was pending', async t => {
  const f=await fixture(t);await f.identify();
  let held,resolveRequest;const requested=new Promise(resolve=>resolveRequest=resolve);
  await f.page.route('**/api/tracks/synthetic-shared-traffic-route/gpx',route=>{held=route;resolveRequest();});
  await f.page.locator('#sharedLibraryTab').click();
  await f.page.locator('.shared-item').first().click();await requested;
  await f.page.locator('#reverseBtn').click();
  const warning=f.page.waitForEvent('dialog');
  await held.fulfill({contentType:'application/gpx+xml',body:'<gpx version="1.1"><trk><trkseg><trkpt lat="9" lon="10"/><trkpt lat="11" lon="12"/></trkseg></trk></gpx>'});
  const dialog=await warning;assert.match(dialog.message(),/unsaved geometry/);await dialog.accept();
  assert.deepEqual(await points(f,(await download(f)).xml),[f.track.segments[0].slice().reverse()]);
  assert.equal(await f.page.locator('#saveBtn').textContent(),'Save changes');f.assertSafe();
});

async function publish(f) {
  if(await f.page.getByRole('button',{name:'Share',exact:true}).count())await f.page.locator('[data-track-id="'+f.track.id+'"] .track-more').evaluate(button=>button.click());
  await f.page.locator('[data-track-id="'+f.track.id+'"] .track-more').evaluate(button=>button.click());
  await f.page.getByRole('button',{name:'Share',exact:true}).evaluate(button=>button.click());
}
for (const late of [false,true]) test('publication: '+(late?'edit while awaiting response':'dirty before publish')+' preserves complete editor GPX', {timeout:20000}, async t => {
  const f=await fixture(t,{linkedShared:true});await f.identify();
  const library=await f.tracks();
  let held;if(late){held=f.hold('publish');await publish(f);await held.entered;}
  await f.page.locator('#reverseBtn').click();
  const expected=await download(f);
  const dialogPromise=f.page.waitForEvent('dialog',{timeout:5000});
  let action;if(late)f.release('publish');else action=publish(f);
  const dialog=await dialogPromise;await dialog.accept();await action;
  const actual=await download(f);
  assert.equal(actual.xml,expected.xml,'Publication must not replace any exported editor geometry or metadata');
  assert.equal(await f.page.locator('#saveBtn').textContent(),'Save changes');
  if(!late){assert.equal(f.requests('publish').length,0);assert.deepEqual(await f.tracks(),library);}
  else {
    assert.equal(f.requests('publish').length,1);
    assert.deepEqual((await f.tracks())[0].segments,library[0].segments,'Publication must not implicitly save new editor geometry');
    assert.equal((await f.tracks())[0].sharedBaseVersion,2);
    await f.page.locator('#saveBtn').click();
    const saved=(await f.tracks())[0];assert.equal(saved.sharedBaseVersion,2);
    assert.deepEqual(saved.segments,[library[0].segments[0].slice().reverse()]);
    for(const key of ['name','color','note','visible','createdAt'])assert.deepEqual(saved[key],library[0][key]);
  }
  f.assertSafe();
});

for(const action of ['save','delete'])test('publication: completion after explicit '+action+' cannot restore its captured library snapshot', {timeout:15000},async t=>{
  const f=await fixture(t,{linkedShared:true});await f.identify();
  const held=f.hold('publish');await publish(f);await held.entered;
  let before,xml;
  if(action==='save'){
    await f.page.locator('#reverseBtn').click();await f.page.locator('#saveBtn').click();
    before=await f.tracks();xml=(await download(f)).xml;
  }else{await f.page.locator('[data-track-id="'+f.track.id+'"] .track-more').evaluate(button=>button.click());await f.remove();await observed(async()=>(await f.tracks()).length===0,'Explicit delete must complete before releasing publication');before=await f.tracks();assert.equal(before.length,0);}
  const pending=f.page.waitForEvent('dialog',{timeout:5000});f.release('publish');
  const dialog=await pending;assert.match(dialog.message(),/newer state was left untouched/);await dialog.accept();
  assert.deepEqual(await f.tracks(),before,'Late acknowledgment must not rewrite saved or deleted library data');
  if(action==='save')assert.equal((await download(f)).xml,xml);
  else assert.equal(await f.page.locator('#exportBtn').isDisabled(),true);
  f.assertSafe();
});

test('publication: clean explicit Share publishes exact saved GPX without changing exported content',async t=>{
  const f=await fixture(t,{linkedShared:true});await f.identify();
  const before=(await download(f)).xml,library=await f.tracks();
  const pending=f.page.waitForEvent('dialog',{timeout:5000});const action=publish(f);
  const dialog=await pending;assert.match(dialog.message(),/Published to Shared Library as v2/);await dialog.accept();await action;
  assert.equal(f.requests('publish').length,1);assert.equal(f.requests('publish')[0].body.gpx,before);
  assert.equal((await download(f)).xml,before);
  assert.deepEqual((await f.tracks())[0].segments,library[0].segments);
  assert.equal((await f.tracks())[0].sharedBaseVersion,2);f.assertSafe();
});

test('publication: rejected Shared POST retains late edits and full saved library payload',async t=>{
  const f=await fixture(t,{linkedShared:true});await f.identify();
  let held,resolve;const entered=new Promise(r=>resolve=r);
  await f.page.route('**/api/tracks/synthetic-shared-traffic-route/publish',route=>{held=route;resolve();});
  const before=await f.tracks();await publish(f);await entered;
  await f.page.locator('#reverseBtn').click();const expected=(await download(f)).xml;
  const pending=f.page.waitForEvent('dialog',{timeout:5000});
  await held.fulfill({status:409,json:{currentVersion:3,error:'Synthetic conflict'}});
  const dialog=await pending;assert.match(dialog.message(),/newer Shared version exists/);await dialog.accept();
  assert.equal((await download(f)).xml,expected);assert.deepEqual(await f.tracks(),before);f.assertSafe();
});

test('publication: older acknowledgement cannot regress a newer Shared version', {timeout:15000},async t=>{
  const f=await fixture(t,{linkedShared:true});await f.identify();
  const routes=[];let entered;let wait=new Promise(r=>entered=r);
  await f.page.route('**/api/tracks/synthetic-shared-traffic-route/publish',route=>{routes.push(route);entered();});
  await publish(f);await wait;wait=new Promise(r=>entered=r);await publish(f);await wait;
  const reply=async(index,version)=>{
    const pending=f.page.waitForEvent('dialog',{timeout:5000});
    await routes[index].fulfill({json:{id:'synthetic-shared-traffic-route',version,modifiedAt:'2026-01-03T00:00:00.000Z',modifiedBy:'Synthetic author'}});
    const dialog=await pending;await dialog.accept();return dialog.message();
  };
  await reply(1,3);const before=await f.tracks(),xml=(await download(f)).xml;
  assert.equal(before[0].sharedBaseVersion,3);
  assert.match(await reply(0,2),/newer Shared version is already recorded/);
  assert.deepEqual(await f.tracks(),before);assert.equal((await download(f)).xml,xml);f.assertSafe();
});
