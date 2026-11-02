const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright');
const {fixture} = require('./helpers/map-performance-fixture.cjs');
let browser;
test.before(async () => {
  browser = await chromium.launch({headless:true, ...(fs.existsSync('/usr/bin/chromium') ? {executablePath:'/usr/bin/chromium'} : {}), args:['--no-sandbox']});
});
test.after(() => browser?.close());
async function setup(t, mobile, overlap=false) {
  const f = await fixture(browser, t, {mobile, waypoints:0, extraExpose:'window.fitToTrack=fitToTrack;'});
  t.after(() => assert.deepEqual(f.errors, []));
  await f.page.evaluate(overlap => {
    window.alerts=[];window.alert=message=>alerts.push(message);
    const track = {id:'target', name:'Target', type:'track', visible:true, note:'keep', color:'#7c3aed', segments:[[{lat:1,lon:1.9,ele:10},{lat:1,lon:2,ele:20},{lat:1,lon:2.1,ele:30}]]};
    state.library.push(track);
    if(overlap) state.library.push({...deepClone(track), id:'overlap', name:'Overlap'});
    state.current.segments=[[{lat:1.1,lon:1.9},{lat:1.1,lon:2.1}]];
    state.library[0]=deepClone(state.current);
    localStorage.setItem('switchback_local_tracks_v1', JSON.stringify(state.library));
    window.savedLibrary=localStorage.getItem('switchback_local_tracks_v1');
    map.setView([1,2.0005], 16, {animate:false});
    render();
    window.beforeView={center:map.getCenter(),zoom:map.getZoom()};
  }, overlap);
  return f.page;
}
async function tap(page, lon, mobile) {
  const p = await page.evaluate(lon => {
    const p=map.latLngToContainerPoint([1,lon]), r=map.getContainer().getBoundingClientRect();
    return {x:r.left+p.x,y:r.top+p.y};
  }, lon);
  if(mobile) await page.touchscreen.tap(p.x,p.y);
  else await page.mouse.click(p.x,p.y);
}
async function assertPreserved(page, point) {
  await page.waitForTimeout(400);
  assert.deepEqual(await page.evaluate(() => ({center:map.getCenter(),zoom:map.getZoom()})), await page.evaluate(() => beforeView));
  assert.deepEqual(await page.evaluate(() => ({id:state.currentId,selection:state.selection,unchanged:JSON.stringify(state.current)===JSON.stringify(state.library.find(t=>t.id==='target')),stored:localStorage.getItem('switchback_local_tracks_v1')===savedLibrary})), {id:'target',selection:point?{seg:0,pt:1}:null,unchanged:true,stored:true});
}
for(const mobile of [false,true]) {
  test(`select track section preserves zoom and center (${mobile?'touch':'mouse'})`, async t => {
    const page=await setup(t,mobile);
    await tap(page,2.001,mobile);
    await assertPreserved(page,false);
    // Re-selecting the current track must also preserve the viewport.
    await tap(page,2.001,mobile);
    await assertPreserved(page,false);
  });
  test(`select another track's point preserves view and enables editing (${mobile?'touch':'mouse'})`, async t => {
    const page=await setup(t,mobile);
    await tap(page,2,mobile);
    await assertPreserved(page,true);
    assert.equal(await page.locator('#movePointBtn').isDisabled(),false);
    await page.locator('#movePointBtn').click();
    assert.equal(await page.evaluate(() => state.mode),'move');
  });
  test(`overlap choice preserves view (${mobile?'touch':'mouse'})`, async t => {
    const page=await setup(t,mobile,true);
    await tap(page,2.001,mobile);
    await page.getByRole('button',{name:'Target',exact:true}).click();
    await assertPreserved(page,false);
  });
}
test('library navigation and explicit fit still show the full track', async t => {
  const page=await setup(t,false);
  await page.evaluate(() => loadItem('target'));
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => map.getZoom()<beforeView.zoom),true);
  await page.evaluate(() => {map.setView([1,2],16,{animate:false});fitToTrack();});
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => map.getZoom()<16),true);
});
test('map selection cannot interrupt a pending edit', async t => {
  const page=await setup(t,false);
  await page.evaluate(() => {selectPoint(0,0);});
  await page.locator('#movePointBtn').click();
  await tap(page,2.001,false);
  assert.equal(await page.evaluate(() => state.currentId),'synthetic-track');
  assert.deepEqual(await page.evaluate(() => ({center:map.getCenter(),zoom:map.getZoom()})),await page.evaluate(() => beforeView));
});
