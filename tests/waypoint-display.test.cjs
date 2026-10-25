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
const selectionCode=html.slice(html.indexOf('function updateSelectAll(){'),html.indexOf('function setLibraryView(view)'));
const key='mancardo_saved_waypoints_v1';
const names=['Parking <img src=x onerror="window.injected=1"> & "ridge"','Second summit'];
const rows=names.map((name,i)=>({id:'synthetic-'+i,name,icon:i?'trail':'parking',lat:1,lon:2+i/1000,visible:true,updatedAt:'2026-01-01T00:00:00Z'}));
let browser;
test.before(async()=>{browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']});});
test.after(async()=>{await browser?.close();});
async function fixture(t,mobile=false,animated=false){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1100,height:800},hasTouch:mobile,isMobile:mobile});t.after(()=>context.close());
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  if(route.request().url()==='http://waypoint.test/')return route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css}<style>${leafletCss}</style><style>body{font:15px sans-serif;margin:20px;background:#f7f6f1}h1{font-size:21px}.hidden{display:none!important}#mapWrap{height:300px;position:relative;margin:16px 0}#googleBaseMap{position:absolute;inset:0;z-index:0;background:#e2e9dd}#mapDiv{height:300px;position:relative;z-index:1;background:transparent!important;border:1px solid #9ba894}#map>button{position:absolute;top:150px;background:none;border:0;padding:0}.fixture-info{position:absolute;top:25px;left:24px;max-width:280px;padding:16px;background:white;box-shadow:0 2px 8px #999;border-radius:8px;z-index:2}.fixture-info button{float:right}.track-item,.shared-item{padding:12px;background:white;border-bottom:1px solid #ddd}.track-row{display:flex;align-items:center;gap:8px}.ti-name{flex:1;overflow-wrap:anywhere}.ti-meta,.shared-item-meta{font-size:12px;color:#666;margin-top:5px}.overlay{position:fixed;inset:0;background:#fff9;z-index:5;padding:30px}.dialog{background:white;max-width:400px;padding:20px}.mancardo-waypoint-icon-choice{background:white}input[type=text]{width:90%;padding:8px;margin:8px 0}</style><h1>Saved waypoint interaction fixture</h1><p>Synthetic coordinates · real Leaflet over decorative basemap · no live data</p><div id="mapWrap"><div id="googleBaseMap" aria-hidden="true"></div><div id="mapDiv"></div></div><h2>My Library</h2><div id="trackList"></div><h2>Shared Library</h2><div id="sharedTrackList"></div>`});
  if(route.request().url().includes('/api/shared-waypoints'))return route.fulfill({json:{waypoints:rows}});
  return route.abort();
 });
 await page.goto('http://waypoint.test/');
 await page.evaluate(({rows,key})=>localStorage.setItem(key,JSON.stringify(rows)),{rows,key});
 async function install(){
 await page.addScriptTag({content:leafletJs});
 await page.evaluate((animated)=>{
  window.markers=[];window.syntheticTrack={id:'synthetic-track',name:'Geometry fixture',type:'track',segments:[[{lat:1,lon:2,ele:30,time:'2026-01-01T00:00:00Z'},{lat:1.01,lon:2,ele:31},{lat:1.01,lon:2.01,ele:32}]],color:'#123456'};window.state={mode:'view',library:[syntheticTrack],sharedPreview:false};window.els={trackList:document.getElementById('trackList')};
  window.renderLibrary=()=>{if(window.updateSelectAll)updateSelectAll();};window.setLibraryView=()=>{};window.render=()=>{};
  window.persistLibrary=()=>{localStorage.setItem('synthetic-tracks',JSON.stringify(state.library));};
  const select=document.createElement('label');select.id='selectAllWrap';select.innerHTML='<input type="checkbox" id="selectAllTracks"><span>Select / Deselect all tracks</span>';document.body.appendChild(select);els.selectAllTracks=select.querySelector('input');const panel=document.createElement('section');panel.id='myLibraryPanel';els.trackList.before(panel);panel.appendChild(select);panel.appendChild(els.trackList);
  window.map=L.map('mapDiv',{zoomControl:false,attributionControl:false,zoomAnimation:animated,fadeAnimation:false,markerZoomAnimation:animated}).setView([1,2.0005],17);

 },animated);
 await page.addScriptTag({content:selectionCode});
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

// Exercise the real Google/Leaflet synchronization client against an independently
// animated renderer. The adapter models Google's delayed rendering; it makes no
// network calls and is not a substitute for a live Google Maps acceptance check.
const googleFeature=fs.readFileSync(path.join(root,'worker-google-preview.js'),'utf8').match(/const GOOGLE_PREVIEW_FEATURE = String.raw`([\s\S]*?)`;/)[1].replace('var googleTrackData=new google.maps.Data({map:googleMap});','window.__mancardoGoogleMap=googleMap;var googleTrackData=new google.maps.Data({map:googleMap});');
async function installBasemapAdapter(p){
 await p.evaluate(()=>{
  document.getElementById('googleBaseMap').remove();
  const toggle=document.createElement('div');document.body.appendChild(toggle);
  for(const key of ['layerStreetsBtn','layerTerrainBtn']){els[key]=document.createElement('button');toggle.appendChild(els[key]);}
  window.streetsLayer=L.layerGroup();window.terrainLayer=L.layerGroup();window.render=()=>{};
  window.trackLayerGroup=L.layerGroup([L.polyline([[1,2],[1,2.001]],{opacity:1})]).addTo(map);
  class LatLng{constructor(lat,lng){this.a=lat;this.b=lng;}lat(){return this.a;}lng(){return this.b;}}
  class Basemap{
   constructor(div,o){this.div=div;this.center=o.center;this.zoom=o.zoom;this.visualCenter=o.center;this.visualZoom=o.zoom;this.overlays=[];this.points=[];window.basemap=this;}
   getCenter(){return new LatLng(this.center.lat,this.center.lng);}getZoom(){return this.zoom;}
   setCenter(c){this.center=c;this.animate();}setZoom(z){this.zoom=z;this.animate();}
   setMapTypeId(t){this.type=t;this.draw();}
   project(ll){const point=L.CRS.EPSG3857.latLngToPoint(L.latLng(ll.lat(),ll.lng()),this.visualZoom);const c=L.CRS.EPSG3857.latLngToPoint(this.visualCenter,this.visualZoom);return {x:point.x-c.x+this.div.clientWidth/2,y:point.y-c.y+this.div.clientHeight/2};}
   animate(){clearTimeout(this.timer);cancelAnimationFrame(this.frame);const from=this.visualZoom,c=this.visualCenter;this.timer=setTimeout(()=>{const start=performance.now();const tick=now=>{const t=Math.min(1,(now-start)/180);this.visualZoom=from+(this.zoom-from)*t;this.visualCenter={lat:c.lat+(this.center.lat-c.lat)*t,lng:c.lng+(this.center.lng-c.lng)*t};this.draw();if(t<1)this.frame=requestAnimationFrame(tick);};this.frame=requestAnimationFrame(tick);},100);}
   draw(){for(const {el,ll}of this.points){const p=this.project(ll);el.style.transform='translate('+p.x+'px,'+p.y+'px)';}for(const o of this.overlays)o.draw();}
  }
  class Data{
   constructor(o){this.map=o.map;this.features=[];}setStyle(){}forEach(fn){this.features.forEach(fn);}remove(f){this.features=this.features.filter(x=>x!==f);}
   add(f){this.features.push(f);if(f.geometry.points){const el=document.createElement('div');el.className='synthetic-track-anchor';el.style.cssText='position:absolute;width:0;height:0;left:0;top:0;box-shadow:0 0 0 3px #1262a3';this.map.div.appendChild(el);this.map.points.push({el,ll:f.geometry.points[0]});this.map.draw();}return f;}
  }
  Data.Feature=class{constructor(o){Object.assign(this,o);}getProperty(k){return this.properties[k];}};
  Data.LineString=class{constructor(p){this.points=p;}};Data.Point=class{};
  class OverlayView{setMap(m){this.map=m;if(m){m.overlays.push(this);this.onAdd();this.draw();}else this.onRemove();}getProjection(){return {fromLatLngToContainerPixel:ll=>this.map.project(ll)};}}
  window.google={maps:{Map:Basemap,Data,LatLng,OverlayView,SymbolPath:{CIRCLE:0},event:{trigger(){}}}};
 });
 await p.addScriptTag({content:googleFeature});
 await p.waitForTimeout(400);
}
for(const mobile of [false,true])test(`${mobile?'mobile':'desktop'} waypoint tips stay aligned with the basemap track anchor through delayed animated zoom, pan and layer changes`,async t=>{
 const f=await fixture(t,mobile,true),p=f.page;await installBasemapAdapter(p);
 const result=await p.evaluate(async()=>{
  const original=localStorage.getItem('mancardo_saved_waypoints_v1'),samples=[];
  function sample(){const marker=document.querySelector('.mancardo-saved-waypoint-marker').getBoundingClientRect(),anchor=document.querySelector('.synthetic-track-anchor').getBoundingClientRect();samples.push(Math.hypot(marker.x+marker.width/2-anchor.x,marker.bottom-anchor.y));}
  async function frames(ms){const end=performance.now()+ms;do{await new Promise(requestAnimationFrame);sample();}while(performance.now()<end);}
  for(const zoom of [16,18,17]){map.setZoom(zoom,{animate:true});await frames(650);}
  map.panBy([70,-35],{animate:true,duration:.2});await frames(650);
  for(const text of ['Terrain','Satellite','Hybrid','Roads']){[...document.querySelectorAll('button')].find(b=>b.textContent===text).click();await frames(80);}
  sample();return {maxError:Math.max(...samples),settledError:samples.at(-1),unchanged:localStorage.getItem('mancardo_saved_waypoints_v1')===original};
 });
 assert.ok(result.maxError<2,'waypoint diverged from Google-rendered track anchor by '+result.maxError+'px');
 assert.ok(result.settledError<2);assert.equal(result.unchanged,true);
 console.log(JSON.stringify({alignment:mobile?'mobile':'desktop',...result}));
 const marker=p.locator('.mancardo-saved-waypoint-marker').first();
 assert.equal(await marker.evaluate(el=>!!el.closest('[aria-hidden="true"]')),false);
 assert.equal(await marker.evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;}),true);
 await marker[mobile?'tap':'click']();
 const popupError=await p.evaluate(async()=>{let max=0;const end=performance.now()+650;do{await new Promise(requestAnimationFrame);const m=document.querySelector('.mancardo-saved-waypoint-marker').getBoundingClientRect(),tip=document.querySelector('.leaflet-popup-tip-container').getBoundingClientRect();max=Math.max(max,Math.abs(m.x+m.width/2-tip.x-tip.width/2));}while(performance.now()<end);return max;});
 assert.ok(popupError<2,'name popup detached from waypoint by '+popupError+'px');
 // A neighbouring waypoint must not intercept the popup close control.
 const popupOnTop=await p.evaluate(()=>{
  const close=document.querySelector('.leaflet-popup-close-button').getBoundingClientRect(),bounds=map.getContainer().getBoundingClientRect();
  const other=Object.values(map._layers).filter(m=>m instanceof L.Marker)[1],original=other.getLatLng();
  other.setLatLng(map.containerPointToLatLng([close.x+close.width/2-bounds.x,close.y+close.height/2-bounds.y+21]));
  const top=document.elementFromPoint(close.x+close.width/2,close.y+close.height/2);
  const ok=!!top.closest('.mancardo-waypoint-popup');other.setLatLng(original);return ok;
 });assert.equal(popupOnTop,true);

 assert.equal(await p.locator('.mancardo-waypoint-name').textContent(),names[0]);
 await p.keyboard.press('Escape');assert.equal(await marker.evaluate(el=>document.activeElement===el),true);
 if(!mobile){await p.locator('h1').hover();await marker.hover();assert.equal(await p.locator('.mancardo-waypoint-name').textContent(),names[0]);}
 if(process.env.WAYPOINT_ARTIFACT_DIR)await p.screenshot({path:path.join(process.env.WAYPOINT_ARTIFACT_DIR,mobile?'aligned-mobile.png':'aligned-desktop.png'),fullPage:true});
 // Leaflet schedules animated zoomstart on requestAnimationFrame. Assert
 // dismissal at that event, rather than racing the frame after setZoom returns.
 await p.evaluate(()=>{window.waypointDismissZoomStarted=false;map.once('zoomstart',()=>{window.waypointDismissZoomStarted=true;});map.setZoom(16,{animate:true});});
 await p.waitForFunction(()=>window.waypointDismissZoomStarted);
 assert.equal(await p.locator('.mancardo-waypoint-name').count(),0);
 assert.equal(await p.evaluate(()=>JSON.stringify(state.library)===geometryBefore&&buildGpx(syntheticTrack)===gpxBefore),true);
 assert.deepEqual(f.errors,[]);
});


test('Select/Deselect includes mixed and waypoint-only libraries without expanding export or deletion',async t=>{
 const f=await fixture(t),p=f.page,all=p.locator('#selectAllTracks');
 await p.evaluate(()=>{state.library.push({...syntheticTrack,id:'hidden-track',visible:false});state.current={...state.library[0]};state.sharedLibrary=[{id:'shared-filtered-out',visible:false}];renderLibrary();});
 assert.equal(await all.evaluate(e=>e.indeterminate),true);
 await all.check();await all.uncheck();
 assert.equal(await p.locator('.mancardo-saved-waypoint-marker').count(),0);
 assert.deepEqual(await p.evaluate(key=>JSON.parse(localStorage.getItem(key)).map(w=>w.visible),key),[false,false]);
 assert.equal(await p.evaluate(()=>state.library.every(t=>t.visible===false)&&state.current.visible===false),true);
 await all.check();assert.equal(await p.locator('.mancardo-saved-waypoint-marker').count(),2);
 assert.equal(await p.evaluate(()=>state.library.every(t=>t.visible===true)&&state.current.visible===true),true);
 assert.equal(await p.evaluate(()=>state.sharedLibrary[0].visible),false);
 await p.locator('.mancardo-waypoint-item .track-show').first().uncheck();
 assert.equal(await all.evaluate(e=>e.indeterminate&&!e.checked),true);
 await p.evaluate(()=>renderLibrary());assert.equal(await all.evaluate(e=>e.indeterminate),true);
 await all.check();
 // Exercise the actual track export selector and durable-delete capture handler,
 // replacing only their file-download/deletion sinks with ID collectors.
 await p.evaluate(()=>{window.exports=[];window.deletes=[];window.exportTrackItem=t=>exports.push(t.id);window.authorisedDelete=ids=>deletes.push(...ids);});
 await p.addScriptTag({content:html.slice(html.indexOf('function exportSelectedTracks(){'),html.indexOf('function deleteSelectedTracks(){'))});
 const durable=fs.readFileSync(path.join(root,'worker-delete-durable-fix.js'),'utf8');
 const start=durable.indexOf("  document.addEventListener('click',function(ev){");
 await p.addScriptTag({content:durable.slice(start,durable.indexOf('  },true);',start)+11)});
 await p.evaluate(()=>{const b=document.createElement('button');b.id='deleteSelectedBtn';document.body.appendChild(b);exportSelectedTracks();});
 await p.waitForTimeout(400);assert.deepEqual(await p.evaluate(()=>exports),['synthetic-track','hidden-track']);
 p.once('dialog',d=>{assert.match(d.message(),/2 selected track/);return d.dismiss();});await p.locator('#deleteSelectedBtn').click();assert.deepEqual(await p.evaluate(()=>deletes),[]);
 p.once('dialog',d=>d.accept());await p.locator('#deleteSelectedBtn').click();assert.deepEqual(await p.evaluate(()=>deletes),['synthetic-track','hidden-track']);
 assert.equal(await p.evaluate(key=>JSON.parse(localStorage.getItem(key)).length,key),2);
 await p.evaluate(()=>{state.library=[];state.current=null;renderLibrary();});
 assert.equal(await all.isEnabled(),true);assert.equal(await all.isChecked(),true);
 await all.uncheck();assert.equal(await p.locator('.mancardo-saved-waypoint-marker').count(),0);
 await f.reload();assert.equal(await p.locator('.mancardo-saved-waypoint-marker').count(),0);assert.equal(await all.evaluate(e=>e.indeterminate),true);
 await all.check();
 const persisted=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
 assert.deepEqual(persisted.map(({visible,updatedAt,...rest})=>rest),rows.map(({visible,updatedAt,...rest})=>rest));
 assert.deepEqual(f.errors,[]);
});

test('bulk selection keeps global scope through real search/filter/sort and preserves fresh share metadata',async t=>{
 const f=await fixture(t),p=f.page,all=p.locator('#selectAllTracks');
 const ui=fs.readFileSync(path.join(root,'worker-ui-optimizations.js'),'utf8');
 await p.addScriptTag({content:"var FILTER_KEY='mancardo_library_filter_v1',filterModes={all:1,visible:1,hidden:1};"+ui.slice(ui.indexOf('  function savedFilter(){'),ui.indexOf('  function enhanceTrackCards(){'))+"ensureLibrarySearch();var originalFilteredRender=renderLibrary;renderLibrary=function(){originalFilteredRender();applyLibrarySearchAndFilter();};"});
 const sort=fs.readFileSync(path.join(root,'worker-library-sort.js'),'utf8').match(/const LIBRARY_SORT_FEATURE = String.raw`([\s\S]*?)`;/)[1];await p.addScriptTag({content:sort});
 await p.locator('#mancardoLibrarySearch').fill('Second summit');
 assert.equal(await p.locator('.mancardo-waypoint-item:visible').count(),1);
 await all.uncheck();assert.deepEqual(await p.evaluate(key=>JSON.parse(localStorage.getItem(key)).map(w=>w.visible),key),[false,false]);
 await p.locator('#mancardoLibraryFilter').selectOption('visible');assert.equal(await p.locator('.mancardo-waypoint-item:visible').count(),0);
 await all.check();assert.equal(await p.locator('.mancardo-waypoint-item:visible').count(),1);
 await p.locator('#mancardoLibraryFilter').selectOption('hidden');assert.equal(await p.locator('.mancardo-waypoint-item:visible').count(),0);
 await p.locator('#mancardoLibrarySort').selectOption('name-desc');assert.equal(await all.isChecked(),true);
 await p.evaluate(key=>{const items=JSON.parse(localStorage.getItem(key));items[0].sharedId='synthetic-new-share';items[0].sharedBaseVersion=7;delete items[1].visible;localStorage.setItem(key,JSON.stringify(items));},key);
 await all.uncheck();await all.check();
 const persisted=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
 assert.equal(persisted[0].sharedId,'synthetic-new-share');assert.equal(persisted[0].sharedBaseVersion,7);assert.equal(persisted[1].visible,true);
 assert.deepEqual(persisted.map(w=>[w.id,w.name,w.icon,w.lat,w.lon]),rows.map(w=>[w.id,w.name,w.icon,w.lat,w.lon]));
 // With no tracks or waypoints, bulk selection is disabled and not checked.
 await p.evaluate(key=>localStorage.removeItem(key),key);await f.reload();await p.evaluate(()=>{state.library=[];state.current=null;renderLibrary();});
 assert.equal(await all.isDisabled(),true);assert.equal(await all.isChecked(),false);assert.equal(await all.evaluate(e=>e.indeterminate),false);
 assert.deepEqual(f.errors,[]);
});

for(const mobile of [false,true])test(`${mobile?'touch':'desktop'} bulk visibility repeats correctly with tracks only, then an empty library`,async t=>{
 const f=await fixture(t,mobile),p=f.page,all=p.locator('#selectAllTracks');
 await p.evaluate(key=>localStorage.removeItem(key),key);await f.reload();
 assert.equal(await all.isEnabled(),true);assert.equal(await all.isChecked(),true);
 for(let i=0;i<3;i++){
  await all[mobile?'tap':'click']();
  assert.equal(await all.isChecked(),false);
  assert.equal(await p.evaluate(()=>state.library.every(t=>t.visible===false)),true);
  await all[mobile?'tap':'click']();
  assert.equal(await all.isChecked(),true);
  assert.equal(await p.evaluate(()=>state.library.every(t=>t.visible===true)),true);
 }
 assert.equal(await p.locator('.mancardo-saved-waypoint-marker').count(),0);
 assert.equal(await p.evaluate(key=>localStorage.getItem(key),key),null);
 await p.evaluate(()=>{state.library=[];state.current=null;renderLibrary();});
 assert.equal(await all.isDisabled(),true);assert.equal(await all.isChecked(),false);
 assert.deepEqual(f.errors,[]);
});

test('touch bulk visibility toggles mixed tracks and waypoints repeatedly without metadata changes',async t=>{
 const f=await fixture(t,true),p=f.page,all=p.locator('#selectAllTracks');
 for(let i=0;i<3;i++){
  await all.tap();assert.equal(await p.locator('.mancardo-saved-waypoint-marker').count(),0);
  assert.equal(await p.evaluate(()=>state.library.every(t=>t.visible===false)),true);
  await all.tap();assert.equal(await p.locator('.mancardo-saved-waypoint-marker').count(),2);
  assert.equal(await p.evaluate(()=>state.library.every(t=>t.visible===true)),true);
 }
 assert.deepEqual(await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),rows);
 assert.deepEqual(f.errors,[]);
});

test('complete current editor bulk visibility changes both map surfaces and preserves GPX',async t=>{
 const full=await require('./helpers/map-performance-fixture.cjs').fixture(browser,t);
 const p=full.page,writes=[];p.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.method()+' '+r.url());});
 const result=await p.evaluate(()=>{
  const before=buildGpx(state.current),key='mancardo_saved_waypoints_v1',waypoints=localStorage.getItem(key);
  const lines=()=>dataLayers.reduce((n,d)=>n+[...d.fs].filter(f=>f.getProperty('kind')==='line').length,0);
  const initial={markers:document.querySelectorAll('.mancardo-saved-waypoint-marker').length,lines:lines()};
  els.selectAllTracks.click();
  const hidden={markers:document.querySelectorAll('.mancardo-saved-waypoint-marker').length,lines:lines(),checked:els.selectAllTracks.checked};
  els.selectAllTracks.click();
  return {initial,hidden,restored:{markers:document.querySelectorAll('.mancardo-saved-waypoint-marker').length,lines:lines(),checked:els.selectAllTracks.checked},gpxSame:before===buildGpx(state.current),waypointsSame:waypoints===localStorage.getItem(key)};
 });
 assert.equal(result.initial.markers,2);assert.ok(result.initial.lines>0);
 assert.deepEqual(result.hidden,{markers:0,lines:0,checked:false});
 assert.deepEqual(result.restored,{...result.initial,checked:true});
 assert.equal(result.gpxSame,true);assert.equal(result.waypointsSame,true);
 assert.deepEqual(full.errors,[]);assert.deepEqual(writes,[]);
});
