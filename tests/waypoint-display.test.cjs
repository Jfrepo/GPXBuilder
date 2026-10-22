// Real Chromium interaction tests of the production waypoint clients, with a
// synthetic Google Maps adapter. No external requests, accounts, or database.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'worker-waypoint-save.js'),'utf8');
const feature=source.match(/const WAYPOINT_FEATURE = String.raw`([\s\S]*?)`;/)[1];
const css=source.match(/const WAYPOINT_CSS = String.raw`([\s\S]*?)`;/)[1];
const shared=fs.readFileSync(path.join(root,'worker-shared-waypoint-cloud.js'),'utf8').match(/const CLIENT=String.raw`([\s\S]*?)`;/)[1].replace(/<\/?script[^>]*>/g,'');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const exportCode=html.slice(html.indexOf('function esc(s)'),html.indexOf('function fmtDate(iso)'))+html.slice(html.indexOf('function buildGpx(item)'),html.indexOf('// ---------- Leaflet map ----------'));
const key='mancardo_saved_waypoints_v1';
const names=['Parking <img src=x onerror="window.injected=1"> & "ridge"','Second summit'];
const rows=names.map((name,i)=>({id:'synthetic-'+i,name,icon:i?'trail':'parking',lat:1+i/100,lon:2+i/100,visible:true,updatedAt:'2026-01-01T00:00:00Z'}));
let browser;
test.before(async()=>{browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});});
test.after(async()=>{await browser?.close();});
async function fixture(t,mobile=false){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1100,height:800},hasTouch:mobile,isMobile:mobile});t.after(()=>context.close());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  if(route.request().url()==='http://waypoint.test/')return route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css}<style>body{font:15px sans-serif;margin:20px;background:#f7f6f1}h1{font-size:21px}.hidden{display:none!important}#map{height:300px;position:relative;background:#e2e9dd;border:1px solid #9ba894;margin:16px 0}#map>button{position:absolute;top:150px;background:none;border:0;padding:0}.fixture-info{position:absolute;top:25px;left:24px;max-width:280px;padding:16px;background:white;box-shadow:0 2px 8px #999;border-radius:8px;z-index:2}.fixture-info button{float:right}.track-item,.shared-item{padding:12px;background:white;border-bottom:1px solid #ddd}.track-row{display:flex;align-items:center;gap:8px}.ti-name{flex:1;overflow-wrap:anywhere}.ti-meta,.shared-item-meta{font-size:12px;color:#666;margin-top:5px}.overlay{position:fixed;inset:0;background:#fff9;z-index:5;padding:30px}.dialog{background:white;max-width:400px;padding:20px}.mancardo-waypoint-icon-choice{background:white}input[type=text]{width:90%;padding:8px;margin:8px 0}</style><h1>Saved waypoint interaction fixture</h1><p>Synthetic coordinates · Google Maps adapter · no live data</p><div id="map"></div><h2>My Library</h2><div id="library"></div><h2>Shared Library</h2><div id="sharedTrackList"></div>`});
  if(route.request().url().includes('/api/shared-waypoints'))return route.fulfill({json:{waypoints:rows}});
  return route.abort();
 });
 await page.goto('http://waypoint.test/');
 await page.evaluate(({rows,key})=>localStorage.setItem(key,JSON.stringify(rows)),{rows,key});
 async function install(){
 await page.evaluate(()=>{
  window.markers=[];window.syntheticTrack={id:'synthetic-track',name:'Geometry fixture',type:'track',segments:[[{lat:1,lon:2,ele:30,time:'2026-01-01T00:00:00Z'},{lat:1.01,lon:2,ele:31},{lat:1.01,lon:2.01,ele:32}]],color:'#123456'};window.state={mode:'view',library:[syntheticTrack],sharedPreview:false};window.els={trackList:document.getElementById('library')};
  window.renderLibrary=()=>{};window.setLibraryView=()=>{};
  const node=document.getElementById('map');
  class Events{constructor(){this.events={};}addListener(k,f){(this.events[k]??=[]).push(f);return {remove:()=>{}};}fire(k){for(const f of this.events[k]||[])f();}}
  const gmap=new Events();node.addEventListener('click',e=>{if(e.target===node)gmap.fire('click');});
  window.__mancardoGoogleMap=gmap;
  window.map={getContainer:()=>node,getZoom:()=>14,setView:(p,z)=>{window.focused={p,z};},containerPointToLatLng:()=>({lat:1,lng:2})};window.L={point:(x,y)=>({x,y})};
  class Marker extends Events{constructor(opts){super();this.opts=opts;this.el=document.createElement('button');this.el.setAttribute('aria-label',opts.title);this.el.style.left=(70+markers.filter(m=>m.el.isConnected).length*140)+'px';const img=document.createElement('img');img.src=opts.icon.url;img.alt='';this.el.append(img);node.append(this.el);for(const [dom,event]of [['mouseenter','mouseover'],['mouseleave','mouseout'],['click','click'],['mousedown','mousedown']])this.el.addEventListener(dom,e=>{e.stopPropagation();this.fire(event);});markers.push(this);}setMap(m){if(!m)this.el.remove();}}
  class InfoWindow extends Events{constructor(opts){super();this.opts=opts;this.el=document.createElement('div');this.el.className='fixture-info gm-style-iw';this.el.setAttribute('role','dialog');window.info=this;}setContent(content){this.content=content;}setOptions(opts){Object.assign(this.opts,opts);}open(opts){this.openOptions=opts;this.el.replaceChildren();const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label','Close');close.onclick=e=>{e.stopPropagation();this.close();this.fire('closeclick');};this.el.append(close,this.content);this.el.setAttribute('aria-label',this.opts.ariaLabel);node.append(this.el);}close(){this.el.remove();}}
  window.google={maps:{Marker,InfoWindow,Size:class{},Point:class{},event:{clearInstanceListeners:m=>{m.events={};}}}};
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
 const marker=i=>p.locator('#map > button').nth(i),popup=p.locator('.mancardo-waypoint-name');
 if(!mobile){await marker(0).hover();assert.equal(await popup.textContent(),names[0]);if(process.env.WAYPOINT_ARTIFACT_DIR){fs.mkdirSync(process.env.WAYPOINT_ARTIFACT_DIR,{recursive:true});await p.screenshot({path:path.join(process.env.WAYPOINT_ARTIFACT_DIR,'desktop-hover-safe-name.png'),fullPage:true});}await p.locator('h1').hover();assert.equal(await popup.count(),0);}
 await marker(0)[mobile?'tap':'click']();assert.equal(await popup.textContent(),names[0]);
 assert.equal(await popup.locator('img').count(),0);assert.equal(await p.evaluate(()=>window.injected),undefined);
 if(!mobile){await marker(1).hover();assert.equal(await popup.textContent(),names[0]);}
 await marker(1)[mobile?'tap':'click']();assert.equal(await popup.textContent(),names[1]);assert.equal(await popup.count(),1);
 await p.getByRole('button',{name:'Close',exact:true})[mobile?'tap':'click']();assert.equal(await popup.count(),0);
 for(let i=0;i<3;i++){await marker(0)[mobile?'tap':'click']();await p.keyboard.press('Escape');assert.equal(await popup.count(),0);}
 await marker(0)[mobile?'tap':'click']();await p.locator('#map')[mobile?'tap':'click']({position:{x:320,y:270}});assert.equal(await popup.count(),0);
 await marker(0)[mobile?'tap':'click']();await p.evaluate(()=>__mancardoGoogleMap.fire('dragstart'));assert.equal(await popup.count(),0);
 const box=await marker(0).boundingBox();await p.mouse.move(box.x+10,box.y+10);await p.mouse.down();await p.waitForTimeout(750);await p.mouse.move(box.x+50,box.y+50);await p.mouse.up();
 assert.equal(await p.locator('#mancardoWaypointOverlay').isVisible(),false);
 assert.equal(await p.evaluate(()=>markers.every(m=>m.opts.draggable===false)),true);
 assert.deepEqual(await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),rows);
 await f.reload();assert.equal(await marker(0).getAttribute('aria-label'),names[0]+' · Lookout');
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
 assert.equal(await marker(1).getAttribute('aria-label'),names[1]+' · Trail');
 // All Trail surfaces share the same tread geometry, including the white marker.
 const tread=await p.locator('.mancardo-waypoint-dot').nth(1).locator('path').getAttribute('d');
 assert.equal(await p.locator('.shared-item-name').nth(1).locator('path').getAttribute('d'),tread);
 assert.equal(await p.locator('[data-waypoint-icon="trail"] path').getAttribute('d'),tread);
 const markerSvg=decodeURIComponent((await marker(1).locator('img').getAttribute('src')).split(',')[1]);
 assert.ok(markerSvg.includes(tread));

 const artifacts=process.env.WAYPOINT_ARTIFACT_DIR;if(artifacts){fs.mkdirSync(artifacts,{recursive:true});await p.screenshot({path:path.join(artifacts,mobile?'mobile-tap.png':'desktop-click.png'),fullPage:true});}
 await p.locator('.track-show').first().uncheck();assert.equal(await popup.count(),0);assert.equal(await p.locator('#map > button').count(),1);
 await p.locator('.track-show').first().check();assert.equal(await p.locator('#map > button').count(),2);
 p.once('dialog',d=>d.accept());await p.locator('.track-more').first().click();await p.getByRole('button',{name:'Delete',exact:true}).first().click();assert.equal(await p.locator('#map > button').count(),1);
 // Existing press-and-hold save action and its category picker remain usable.
 await p.locator('#map').dispatchEvent('pointerdown',{pointerType:'touch',pointerId:7,clientX:300,clientY:300});await p.waitForTimeout(700);
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
