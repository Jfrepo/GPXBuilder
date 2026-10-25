const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright'),{fixture}=require('./helpers/map-performance-fixture.cjs');let browser;
test.before(async()=>{browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']});});test.after(()=>browser?.close());
for(const mobile of [false,true])test('original Fuel disabled without changing tracks or saved fuel waypoints '+(mobile?'mobile':'desktop'),async t=>{
 const {page,errors}=await fixture(browser,t,{mobile,extraExpose:'window.fuelOffTest={forceOn:function(){fuelOn=true;refreshFuelStations()},fetch:fetchFuelOverpass};'});
 const requests=[];page.on('request',r=>{if(r.url().includes('/api/interpreter'))requests.push(r.url());});
 const before=await page.evaluate(()=>{const points=JSON.parse(localStorage.getItem('mancardo_saved_waypoints_v1'));points[0].name='Verified fuel stop';points[0].icon='fuel';localStorage.setItem('mancardo_saved_waypoints_v1',JSON.stringify(points));return {points:JSON.stringify(points),track:JSON.stringify(state.current),library:JSON.stringify(state.library)};});
 assert.equal(await page.locator('.fuel-control-btn').isVisible(),false);assert.equal(await page.locator('.fuel-control-btn').isDisabled(),true);
 await page.evaluate(async()=>{fuelOffTest.forceOn();await fuelOffTest.fetch('unused',0).then(()=>{throw Error('fetch unexpectedly enabled')},()=>{});document.querySelector('.fuel-control-btn').dispatchEvent(new Event('click'));map.setView([-35.9125,150.08144],12,{animate:false});const m=document.createElement('mock-map-3d');m.id='mancardo3dMap';m.center={lat:-35.9125,lng:150.08144};m.range=2000;map.getContainer().parentElement.appendChild(m);m.classList.add('on');document.getElementById('mancardo3dFuelBtn').onclick();m.dispatchEvent(new Event('gmp-centerchange'));});
 await page.waitForTimeout(800);assert.equal(await page.locator('#mancardo3dFuelBtn').isVisible(),false);assert.equal(await page.locator('#mancardo3dFuelBtn').isDisabled(),true);assert.equal(await page.locator('#mancardo3dMap mock-marker-3d').count(),0);
 assert.deepEqual(await page.evaluate(()=>({points:localStorage.getItem('mancardo_saved_waypoints_v1'),track:JSON.stringify(state.current),library:JSON.stringify(state.library)})),before);
 await page.reload();await page.waitForTimeout(800);assert.equal(await page.locator('.fuel-control-btn').isVisible(),false);assert.equal(requests.length,0);assert.deepEqual(errors,[]);
});
