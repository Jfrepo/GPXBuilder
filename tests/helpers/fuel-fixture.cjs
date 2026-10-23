const fs=require('node:fs'),path=require('node:path');
const {adapter}=require('./map-performance-fixture.cjs');
const root=path.resolve(__dirname,'../..');
const station={type:'node',id:101,lat:-33.75,lon:150.25,tags:{amenity:'fuel',name:'Synthetic station'}};
const bounds={south:-33.8,north:-33.7,west:150.2,east:150.3};
function record(age=0,stations=[station]){return {version:1,key:'-68:300',fetchedAt:Date.now()-age*86400000,usedAt:Date.now(),stations:stations.map(s=>({id:s.type+'/'+s.id,lat:s.lat,lon:s.lon,tags:s.tags}))};}
async function fixture(browser,t,{seed=[],init,provider,mobile=false}={}){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});t.after(()=>context.close());
 const page=await context.newPage(),errors=[],requests=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 const worker=(await import('../../worker-delete-durable-fix.js')).default;
 const response=await worker.fetch(new Request('http://fuel.test/'),{ASSETS:{fetch:async()=>new Response(fs.readFileSync(path.join(root,'index.html'),'utf8'),{headers:{'content-type':'text/html'}})},PRIVATE_LIBRARY_DB:{prepare(){throw Error('Database forbidden')}}},{waitUntil(){throw Error('Background work forbidden')}});
 const expose='window.fuelTest={data:fuelData,map:map,markers:fuelMarkers,layer:fuelLayer,refresh:refreshFuelStations};';
 const html=(await response.text()).replace('// ---------- boot ----------',expose+'\n// ---------- boot ----------');
 await page.addInitScript(adapter);if(init)await page.addInitScript(init);
 await page.route('**/*',async r=>{
  const url=r.request().url();
  if(url==='http://fuel.test/seed')return r.fulfill({contentType:'text/html',body:'<!doctype html><title>synthetic seed</title>'});
  if(url==='http://fuel.test/')return r.fulfill({contentType:'text/html',body:html});
  if(url.includes('leaflet.min.js'))return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(root,'node_modules/leaflet/dist/leaflet.js'),'utf8')});
  if(url.includes('leaflet.min.css'))return r.fulfill({contentType:'text/css',body:fs.readFileSync(path.join(root,'node_modules/leaflet/dist/leaflet.css'),'utf8')});
  if(url.includes('/api/interpreter')){requests.push({url,time:Date.now()});return provider?provider(r,requests.length):r.fulfill({json:{elements:[station]}});}
  if(url.includes('/api/'))return r.fulfill({json:{authenticated:false,tracks:[],waypoints:[],notes:[]}});
  return r.abort();
 });
 if(seed.length){await page.goto('http://fuel.test/seed');await page.evaluate(rows=>new Promise((resolve,reject)=>{const r=indexedDB.open('mancardo-fuel-cache-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('cache');r.onsuccess=()=>{const db=r.result,tx=db.transaction('cache','readwrite');tx.objectStore('cache').put(rows,'visited');tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)}}),seed);}
 async function position(){await page.waitForFunction(()=>window.fuelTest);await page.waitForTimeout(800);await page.evaluate(()=>fuelTest.map.setView([-33.75,150.25],14,{animate:false}));}
 await page.goto('http://fuel.test/');await position();
 return {page,errors,requests,position,async click(){await page.locator('.fuel-control-btn').click()},async ready(){await page.waitForFunction(()=>fuelTest.markers.size===1&&!document.querySelector('.fuel-control-btn').classList.contains('loading'))},async threeD(){await page.evaluate(()=>{const m=document.createElement('mock-map-3d');m.id='mancardo3dMap';m.center={lat:-33.75,lng:150.25};m.range=2000;fuelTest.map.getContainer().parentElement.appendChild(m);m.classList.add('on')});await page.waitForTimeout(300);await page.locator('#mancardo3dFuelBtn').click()}};
}
module.exports={fixture,station,bounds,record};
