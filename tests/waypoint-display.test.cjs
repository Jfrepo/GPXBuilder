// Real Chromium interaction tests of the production waypoint clients, with a
// real Leaflet 1.9.4 over the decorative Google layer. No external requests, accounts, or database.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'worker-waypoint-save.js'),'utf8');
const feature=source.match(/const WAYPOINT_FEATURE = String.raw`([\s\S]*?)`;/)[1];
const leafletJs=fs.readFileSync(require.resolve('leaflet/dist/leaflet.js'),'utf8');
const leafletCss=fs.readFileSync(require.resolve('leaflet/dist/leaflet.css'),'utf8');
const css=source.match(/const WAYPOINT_CSS = String.raw`([\s\S]*?)`;/)[1];
const shared=fs.readFileSync(path.join(root,'worker-shared-waypoint-cloud.js'),'utf8').match(/const CLIENT=String.raw`([\s\S]*?)`;/)[1].replace(/<\/?script[^>]*>/g,'');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const exportCode=html.slice(html.indexOf('function esc(s)'),html.indexOf('function fmtDate(iso)'))+html.slice(html.indexOf('function buildGpx(item)'),html.indexOf('// ---------- Leaflet map ----------'));
const key='mancardo_saved_waypoints_v1';
const names=['Parking <img src=x onerror="window.injected=1"> & "ridge"','Second summit'];
const rows=names.map((name,i)=>({id:'synthetic-'+i,name,icon:i?'trail':'parking',lat:1,lon:2+i/1000,visible:true,updatedAt:'2026-01-01T00:00:00Z'}));
let browser;
test.before(async()=>{browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});});
test.after(async()=>{await browser?.close();});
async function fixture(t,mobile=false){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1100,height:800},hasTouch:mobile,isMobile:mobile});t.after(()=>context.close());
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  if(route.request().url()==='http://waypoint.test/')return route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css}<style>${leafletCss}</style><style>body{font:15px sans-serif;margin:20px;background:#f7f6f1}h1{font-size:21px}.hidden{display:none!important}#mapWrap{height:300px;position:relative;margin:16px 0}#googleBaseMap{position:absolute;inset:0;z-index:0;background:#e2e9dd}#mapDiv{height:300px;position:relative;z-index:1;background:transparent!important;border:1px solid #9ba894}#map>button{position:absolute;top:150px;background:none;border:0;padding:0}.fixture-info{position:absolute;top:25px;left:24px;max-width:280px;padding:16px;background:white;box-shadow:0 2px 8px #999;border-radius:8px;z-index:2}.fixture-info button{float:right}.track-item,.shared-item{padding:12px;background:white;border-bottom:1px solid #ddd}.track-row{display:flex;align-items:center;gap:8px}.ti-name{flex:1;overflow-wrap:anywhere}.ti-meta,.shared-item-meta{font-size:12px;color:#666;margin-top:5px}.overlay{position:fixed;inset:0;background:#fff9;z-index:5;padding:30px}.dialog{background:white;max-width:400px;padding:20px}.mancardo-waypoint-icon-choice{background:white}input[type=text]{width:90%;padding:8px;margin:8px 0}</style><h1>Saved waypoint interaction fixture</h1><p>Synthetic coordinates · real Leaflet over decorative basemap · no live data</p><div id="mapWrap"><div id="googleBaseMap" aria-hidden="true"></div><div id="mapDiv"></div></div><h2>My Library</h2><div id="library"></div><h2>Shared Library</h2><div id="sharedTrackList"></div>`});
  if(route.request().url().includes('/api/shared-waypoints'))return route.fulfill({json:{waypoints:rows}});
  return route.abort();
 });
 await page.goto('http://waypoint.test/');
 await page.evaluate(({rows,key})=>localStorage.setItem(key,JSON.stringify(rows)),{rows,key});
 async function install(){
 await page.addScriptTag({content:leafletJs});
 await page.evaluate(()=>{
  window.markers=[];window.syntheticTrack={id:'synthetic-track',name:'Geometry fixture',type:'track',segments:[[{lat:1,lon:2,ele:30,time:'2026-01-01T00:00:00Z'},{lat:1.01,lon:2,ele:31},{lat:1.01,lon:2.01,ele:32}]],color:'#123456'};window.state={mode:'view',library:[syntheticTrack],sharedPreview:false};window.els={trackList:document.getElementById('library')};
  window.renderLibrary=()=>{};window.setLibraryView=()=>{};
  window.map=L.map('mapDiv',{zoomControl:false,attributionControl:false,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView([1,2.0005],17);

 });
 await page.addScriptTag({content:exportCode});
 await page.evaluate(()=>{window.geometryBefore=JSON.stringify(state.library);window.gpxBefore=buildGpx(syntheticTrack);});
 await page.addScriptTag({content:feature});await page.addScriptTag({content:shared});
 }
 await install();
 return {page,errors,async reload(){await page.reload();await install();}};
}
for(const mobile of [false,true])test(`${mobile?'mobile tap':'desktop hover/click'} names, dismissal, safe text, persistence and editor actions`,async t=>{
 const f=await fixture(t,mobile),p=f.page;
 const marker=i=>p.locator('.mancardo-saved-waypoint-marker').nth(i),popup=p.locator('.mancardo-waypoint-name');
 assert.equal(await marker(0).evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;}),true);
 assert.equal(await marker(0).evaluate(el=>!!el.closest('[aria-hidden="true"]')),false);
 assert.equal(await p.getByRole('button',{name:names[0]+' · Lookout',exact:true}).count(),1);
 if(!mobile){await marker(0).hover();assert.equal(await popup.textContent(),names[0]);if(process.env.WAYPOINT_ARTIFACT_DIR){fs.mkdirSync(process.env.WAYPOINT_ARTIFACT_DIR,{recursive:true});await p.screenshot({path:path.join(process.env.WAYPOINT_ARTIFACT_DIR,'desktop-hover-safe-name.png'),fullPage:true});}await popup.hover();await p.waitForTimeout(250);assert.equal(await popup.count(),1);await p.locator('h1').hover();await p.waitForTimeout(250);assert.equal(await popup.count(),0);}
 await marker(0)[mobile?'tap':'click']();assert.equal(await popup.textContent(),names[0]);
 assert.equal(await popup.evaluate(el=>!!el.closest('[aria-hidden="true"]')),false);
 assert.equal(await popup.locator('img').count(),0);assert.equal(await p.evaluate(()=>window.injected),undefined);
 if(!mobile){await marker(1).hover();assert.equal(await popup.textContent(),names[0]);}
 await marker(1)[mobile?'tap':'click']();assert.equal(await popup.textContent(),names[1]);assert.equal(await popup.count(),1);
 await p.getByRole('button',{name:'Close popup',exact:true})[mobile?'tap':'click']();assert.equal(await popup.count(),0);
 for(let i=0;i<3;i++){await marker(0)[mobile?'tap':'click']();await p.keyboard.press('Escape');assert.equal(await popup.count(),0);}
 assert.equal(await p.evaluate(()=>map.getZoom()),17);
 await marker(0)[mobile?'tap':'click']();await p.locator('#mapDiv')[mobile?'tap':'click']({position:{x:320,y:270}});assert.equal(await popup.count(),0);
 await marker(0)[mobile?'tap':'click']();
 const mapBox=await p.locator('#mapDiv').boundingBox();await p.mouse.move(mapBox.x+300,mapBox.y+260);await p.mouse.down();await p.mouse.move(mapBox.x+240,mapBox.y+260,{steps:6});await p.mouse.up();assert.equal(await popup.count(),0);await p.evaluate(()=>map.stop());
 if(!mobile){await marker(0).focus();await p.keyboard.press('Enter');assert.equal(await popup.textContent(),names[0]);await p.keyboard.press('Escape');assert.equal(await popup.count(),0);assert.equal(await marker(0).evaluate(el=>document.activeElement===el),true);await p.keyboard.press('Space');assert.equal(await popup.textContent(),names[0]);await p.keyboard.press('Escape');assert.equal(await popup.count(),0);}
 await p.evaluate(()=>map.setView([1,2.0005],17,{animate:false}));
 const box=await marker(0).boundingBox();await p.mouse.move(box.x+10,box.y+10);await p.mouse.down();await p.waitForTimeout(750);await p.mouse.move(box.x+50,box.y+50);await p.mouse.up();
 assert.equal(await p.locator('#mancardoWaypointOverlay').isVisible(),false);
 assert.equal(await p.evaluate(()=>Object.values(map._layers).filter(m=>m instanceof L.Marker).every(m=>m.options.draggable===false)),true);
 assert.deepEqual(await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),rows);
 await f.reload();assert.equal(await marker(0).getAttribute('alt'),names[0]+' · Lookout');
 await p.locator('.track-more').first().click();await p.getByRole('button',{name:'Icon',exact:true}).click();
 assert.equal(await p.getByRole('button',{name:'Lookout',exact:true}).count(),1);
 assert.equal(await p.locator('.mancardo-waypoint-icon-menu button[aria-label="Lookout"] svg').count(),1);
 assert.equal(await p.locator('.mancardo-waypoint-icon-menu button[aria-label="Trail"] svg').count(),1);
 if(process.env.WAYPOINT_ARTIFACT_DIR)await p.screenshot({path:path.join(process.env.WAYPOINT_ARTIFACT_DIR,mobile?'mobile-icon-menu.png':'desktop-icon-menu.png'),fullPage:true});
 await p.getByRole('button',{name:'Lookout',exact:true}).click();
 let stored=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);assert.equal(stored[0].icon,'parking');assert.equal(stored[0].name,names[0]);assert.equal(stored[0].lat,rows[0].lat);
 // Rename still works and updates displayed text, without changing coordinates.
 p.once('dialog',d=>d.accept('Renamed ridge'));await p.locator('.track-more').first().click();await p.getByRole('button',{name:'Rename',exact:true}).click();
 await marker(0)[mobile?'tap':'click']();assert.equal(await popup.textContent(),'Renamed ridge');
 await p.waitForSelector('.mancardo-shared-waypoint-item');
 assert.match(await p.locator('.shared-item-meta').first().textContent(),/^Lookout waypoint/);
 assert.equal(await p.locator('.shared-item-name').first().textContent(),' '+names[0]);
 assert.equal(await p.locator('.shared-item-name').first().locator('svg').count(),1);
 assert.match(await p.locator('.shared-item-meta').nth(1).textContent(),/^Trail waypoint/);
 assert.equal(await p.locator('.shared-item-name').nth(1).locator('svg').count(),1);
 assert.equal(await p.locator('.mancardo-waypoint-dot').nth(1).locator('svg').count(),1);
 assert.equal(await marker(1).getAttribute('alt'),names[1]+' · Trail');
 // All Trail surfaces share the same tread geometry, including the white marker.
 const tread=await p.locator('.mancardo-waypoint-dot').nth(1).locator('path').getAttribute('d');
 assert.equal(await p.locator('.shared-item-name').nth(1).locator('path').getAttribute('d'),tread);
 assert.equal(await p.locator('[data-waypoint-icon="trail"] path').getAttribute('d'),tread);
 const markerSvg=decodeURIComponent((await marker(1).getAttribute('src')).split(',')[1]);
 assert.ok(markerSvg.includes(tread));

 const artifacts=process.env.WAYPOINT_ARTIFACT_DIR;if(artifacts){fs.mkdirSync(artifacts,{recursive:true});await p.screenshot({path:path.join(artifacts,mobile?'mobile-tap.png':'desktop-click.png'),fullPage:true});}
 await p.locator('.track-show').first().uncheck();assert.equal(await popup.count(),0);assert.equal(await p.locator('.mancardo-saved-waypoint-marker').count(),1);
 await p.locator('.track-show').first().check();assert.equal(await p.locator('.mancardo-saved-waypoint-marker').count(),2);
 p.once('dialog',d=>d.accept());await p.locator('.track-more').first().click();await p.getByRole('button',{name:'Delete',exact:true}).first().click();assert.equal(await p.locator('.mancardo-saved-waypoint-marker').count(),1);
 // Existing press-and-hold save action and its category picker remain usable.
 await p.locator('#mapDiv').dispatchEvent('pointerdown',{pointerType:'touch',pointerId:7,clientX:300,clientY:300});await p.waitForTimeout(700);
 assert.equal(await p.locator('#mancardoWaypointOverlay').isVisible(),true);
 if(process.env.WAYPOINT_ARTIFACT_DIR)await p.screenshot({path:path.join(process.env.WAYPOINT_ARTIFACT_DIR,mobile?'mobile-picker.png':'desktop-picker.png'),fullPage:true});
 await p.locator('#mancardoWaypointName').fill('New Lookout');await p.locator('[data-waypoint-icon="parking"]').click();await p.locator('#mancardoWaypointSave').click();
 stored=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);assert.equal(stored[0].icon,'parking');assert.equal(stored[0].name,'New Lookout');assert.equal(stored[1].id,rows[1].id);assert.equal(stored[1].icon,'trail');
 // Choosing Trail persists its existing key and displays the same SVG as imported Trail entries.
 await p.locator('.track-more').first().click();await p.getByRole('button',{name:'Icon',exact:true}).click();await p.getByRole('button',{name:'Trail',exact:true}).click();
 stored=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);assert.equal(stored[0].icon,'trail');assert.equal(stored[0].name,'New Lookout');
 assert.equal(await p.evaluate(()=>JSON.stringify(state.library)===geometryBefore),true);
 assert.equal(await p.evaluate(()=>buildGpx(syntheticTrack)===gpxBefore),true);
 assert.match(await p.evaluate(()=>buildGpx(syntheticTrack)),/<trkpt lat="1.01" lon="2.01">/);
 assert.equal(await p.evaluate(()=>state.mode),'view');
 await f.reload();assert.equal(await p.locator('.mancardo-waypoint-dot svg').count(),2);
 assert.deepEqual(f.errors,[]);
});
