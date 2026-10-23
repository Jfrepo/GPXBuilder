const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');const {fixture,station,bounds,record}=require('./helpers/fuel-fixture.cjs');let browser;
test.before(async()=>{browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']});});test.after(()=>browser?.close());
for(const mobile of [false,true])test('fresh cache persists across reload; hide/show retains marker identity '+(mobile?'mobile':'desktop'),async t=>{
 const f=await fixture(browser,t,{mobile});await f.click();await f.ready();assert.equal(f.requests.length,1);
 const same=await f.page.evaluate(async()=>{const marker=[...fuelTest.markers.values()][0],button=document.querySelector('.fuel-control-btn');button.click();const hidden=!fuelTest.map.hasLayer(fuelTest.layer);button.click();await new Promise(requestAnimationFrame);return hidden&&fuelTest.map.hasLayer(fuelTest.layer)&&marker===[...fuelTest.markers.values()][0]});assert.ok(same);assert.equal(f.requests.length,1);
 await f.page.waitForTimeout(400);await f.page.reload();await f.position();await f.click();await f.ready();assert.equal(f.requests.length,1);assert.deepEqual(f.errors,[]);
});
test('stale cached stations render immediately offline, preserve last update, back off failures',async t=>{
 const f=await fixture(browser,t,{seed:[record(8)],provider:r=>r.abort()});await f.click();await f.page.waitForFunction(()=>fuelTest.markers.size===1);await f.page.waitForFunction(()=>document.querySelector('.fuel-status').textContent.includes('unavailable'));assert.equal(f.requests.length,2);
 await f.click();await f.click();await f.page.waitForTimeout(400);assert.equal(f.requests.length,2);assert.match(await f.page.locator('.fuel-status').textContent(),/updated/);assert.deepEqual(f.errors,[]);
});
test('stale refresh reconciles same identity, and valid empty result replaces cache across reload',async t=>{
 let release;const f=await fixture(browser,t,{seed:[record(8)],provider:r=>new Promise(resolve=>{release=async()=>{await r.fulfill({json:{elements:[]}});resolve()}})});await f.click();await f.page.waitForFunction(()=>fuelTest.markers.size===1);await release();await f.page.waitForFunction(()=>fuelTest.markers.size===0&&!document.querySelector('.fuel-control-btn').classList.contains('loading'));await f.page.waitForTimeout(400);await f.page.reload();await f.position();await f.click();await f.page.waitForTimeout(400);assert.equal(f.requests.length,1);assert.match(await f.page.locator('.fuel-status').textContent(),/0 mapped stations/);
});
test('expired records and invalid or partial responses never become successful empty coverage',async t=>{
 const f=await fixture(browser,t,{seed:[record(31)],provider:r=>r.fulfill({json:{remark:'runtime timeout',elements:[]}})});await f.click();await f.page.waitForFunction(()=>document.querySelector('.fuel-status').textContent.includes('unavailable'));assert.equal(await f.page.evaluate(()=>fuelTest.markers.size),0);assert.equal(f.requests.length,2);assert.match(await f.page.locator('.fuel-status').textContent(),/partial coverage/);
});
test('IndexedDB quota failure preserves hot cache and reports session-only persistence',async t=>{
 const f=await fixture(browser,t,{init:()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='cache')throw new DOMException('Synthetic quota','QuotaExceededError');return put.apply(this,args)}}});await f.click();await f.ready();await f.page.waitForFunction(()=>document.querySelector('.fuel-status').textContent.includes('session cache only'));await f.click();await f.click();await f.ready();assert.equal(f.requests.length,1);assert.deepEqual(f.errors,[]);
});
test('OFF and pan outside coverage invalidate delayed results before debounce',async t=>{
 let release;const f=await fixture(browser,t,{provider:r=>new Promise(resolve=>{release=async()=>{await r.fulfill({json:{elements:[station]}});resolve()}})});await f.click();await f.page.waitForFunction(()=>document.querySelector('.fuel-control-btn').classList.contains('loading'));await f.click();await release();await f.page.waitForTimeout(50);assert.equal(await f.page.evaluate(()=>fuelTest.map.hasLayer(fuelTest.layer)),false);
 await f.page.evaluate(()=>fuelTest.map.setView([0,0],14,{animate:false}));await f.click();await f.page.waitForTimeout(400);assert.equal(await f.page.evaluate(()=>fuelTest.markers.size),0);assert.match(await f.page.locator('.fuel-status').textContent(),/Australian/);assert.deepEqual(f.errors,[]);
});
test('429 retains stale cache without hammering fallback; wide view issues no requests',async t=>{
 const f=await fixture(browser,t,{seed:[record(8)],provider:r=>r.fulfill({status:429,body:'busy'})});await f.click();await f.page.waitForFunction(()=>document.querySelector('.fuel-status').textContent.includes('unavailable'));assert.equal(f.requests.length,1);assert.equal(await f.page.evaluate(()=>fuelTest.markers.size),1);await f.page.evaluate(()=>fuelTest.map.setZoom(3,{animate:false}));await f.page.waitForTimeout(400);assert.equal(f.requests.length,1);assert.match(await f.page.locator('.fuel-status').textContent(),/zoom closer/);
});
test('3D and 2D share single flight; 3D camera events cannot discard response or skip retry',async t=>{
 let release;const f=await fixture(browser,t,{provider:r=>new Promise(resolve=>{release=async()=>{await r.fulfill({json:{elements:[station]}});resolve()}})});await f.click();await f.page.waitForFunction(()=>document.querySelector('.fuel-control-btn').classList.contains('loading'));await f.threeD();await f.page.evaluate(()=>document.getElementById('mancardo3dMap').dispatchEvent(new Event('gmp-headingchange')));await f.page.waitForTimeout(650);assert.equal(f.requests.length,1);await release();await f.ready();await f.page.waitForFunction(()=>document.querySelectorAll('#mancardo3dMap mock-marker-3d').length===1);assert.deepEqual(f.errors,[]);
});
test('3D library await cannot append markers after OFF',async t=>{
 const f=await fixture(browser,t,{seed:[record()]});await f.page.evaluate(()=>{google.maps.importLibrary=()=>new Promise(resolve=>window.releaseFuelLib=()=>resolve({Marker3DElement:customElements.get('mock-marker-3d')}))});await f.threeD();await f.page.waitForFunction(()=>window.releaseFuelLib);await f.page.locator('#mancardo3dFuelBtn').click();await f.page.evaluate(()=>releaseFuelLib());await f.page.waitForTimeout(100);assert.equal(await f.page.locator('#mancardo3dMap mock-marker-3d').count(),0);assert.deepEqual(f.errors,[]);
});
test('timeout advances to bounded fallback without discarding stale markers',async t=>{
 const f=await fixture(browser,t,{seed:[record(8)],provider:(r,n)=>n===1?undefined:r.fulfill({json:{elements:[station]}})});await f.page.clock.install();await f.click();await f.page.waitForFunction(()=>fuelTest.markers.size===1);await f.page.clock.fastForward(10500);await f.page.waitForTimeout(50);await f.page.clock.fastForward(600);await f.ready();assert.equal(f.requests.length,2);assert.deepEqual(f.errors,[]);
});
test('newest view is eventually loaded after bounded queue saturation',async t=>{
 const routes=[];const f=await fixture(browser,t,{provider:r=>{routes.push(r)}});
 await f.page.evaluate(()=>{const a=fuelTest.data.watch({south:-40,north:-38,west:120,east:122},()=>{});window.queueFirst=a});await f.page.waitForTimeout(30);
 await f.page.evaluate(()=>{queueFirst();window.queueSecond=fuelTest.data.watch({south:-36,north:-34,west:124,east:126},()=>{})});await f.page.waitForTimeout(30);
 await f.page.evaluate(()=>{queueSecond();window.queueThird=fuelTest.data.watch({south:-32,north:-30,west:128,east:130},r=>window.queueResult=r)});
 let completed=0;for(let i=0;i<100&&completed<48;i++){const batch=routes.splice(0);for(const r of batch){await r.fulfill({json:{elements:[]}});completed++;}await f.page.waitForTimeout(20);}
 assert.equal(completed,48);await f.page.waitForFunction(()=>queueResult.updatedAt&&!queueResult.loading&&!queueResult.message.includes('partial'));assert.deepEqual(f.errors,[]);
});
test('successful refresh preserves OSM marker identity while updating popup and coordinates',async t=>{
 let release;const f=await fixture(browser,t,{seed:[record(8)],provider:r=>{release=()=>r.fulfill({json:{elements:[{...station,lon:150.251,tags:{amenity:'fuel',name:'Updated synthetic'}}]}})}});await f.click();await f.page.waitForFunction(()=>fuelTest.markers.size===1);await f.page.evaluate(()=>window.savedFuelMarker=[...fuelTest.markers.values()][0]);await release();await f.ready();const result=await f.page.evaluate(()=>({same:savedFuelMarker===[...fuelTest.markers.values()][0],lng:savedFuelMarker.getLatLng().lng,popup:savedFuelMarker.getPopup().getContent()}));assert.ok(result.same);assert.equal(result.lng,150.251);assert.match(result.popup,/Updated synthetic/);
});
test('oversized normalized record fails with backoff instead of self-eviction/refetch loop',async t=>{
 const tags={amenity:'fuel'};for(const key of ['name','brand','operator','addr:housenumber','addr:street','addr:suburb','addr:city','addr:postcode','opening_hours','phone','contact:phone'])tags[key]='x'.repeat(500);
 const elements=Array.from({length:80},(_,i)=>({...station,id:i+1,tags}));
 const f=await fixture(browser,t,{seed:[record(8)],provider:r=>r.fulfill({json:{elements}})});await f.click();await f.page.waitForFunction(()=>document.querySelector('.fuel-status').textContent.includes('unavailable'));assert.equal(f.requests.length,2);assert.equal(await f.page.evaluate(()=>fuelTest.markers.size),1);await f.page.waitForTimeout(300);assert.equal(f.requests.length,2);
});
test('device storage denial leaves usable session data',async t=>{
 const f=await fixture(browser,t,{init:()=>{indexedDB.open=()=>{throw new DOMException('Synthetic denied','SecurityError')}}});await f.click();await f.ready();assert.match(await f.page.locator('.fuel-status').textContent(),/session cache only/);await f.click();await f.click();await f.ready();assert.equal(f.requests.length,1);assert.deepEqual(f.errors,[]);
});
test('byte-budget eviction retains visible results without repeated provider requests',async t=>{
 const tags={amenity:'fuel'};for(const key of ['name','brand','operator','addr:housenumber','addr:street','addr:suburb','addr:city','addr:postcode','opening_hours','phone','contact:phone'])tags[key]='x'.repeat(490);
 const f=await fixture(browser,t,{provider:r=>{const q=new URL(r.request().url()).searchParams.get('data'),match=q.match(/fuel"\]\(([^)]+)\)/),b=match[1].split(',').map(Number),id=Math.abs(b[0]*10000+b[1]*100);return r.fulfill({json:{elements:Array.from({length:40},(_,i)=>({...station,id:id+i,lat:(b[0]+b[2])/2,lon:(b[1]+b[3])/2,tags}))}})}});
 await f.page.evaluate(()=>{window.evictionStop=fuelTest.data.watch({south:-34,north:-33,west:150,east:151},r=>window.evictionResult=r)});await f.page.waitForFunction(()=>evictionResult.stations.length===160&&!evictionResult.loading);await f.page.waitForTimeout(700);assert.equal(f.requests.length,4);
 const persisted=await f.page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('mancardo-fuel-cache-v1',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('cache').objectStore('cache').get('visited');q.onsuccess=()=>{resolve({cells:q.result.length,bytes:JSON.stringify(q.result).length*2});db.close()}}}));assert.ok(persisted.cells<4);assert.ok(persisted.bytes<=1500000);assert.deepEqual(f.errors,[]);
});
test('persistent cell-count limit evicts oldest visited areas',async t=>{
 const seed=Array.from({length:96},(_,i)=>({...record(1,[]),key:'-80:'+(224+i%80),usedAt:Date.now()-100000+i}));
 // Unique in-range cells, with the current test viewport deliberately absent.
 seed.forEach((r,i)=>r.key=(-80+Math.floor(i/80))+':'+(224+i%80));
 const f=await fixture(browser,t,{seed});await f.click();await f.ready();await f.page.waitForTimeout(400);
 const rows=await f.page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('mancardo-fuel-cache-v1',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('cache').objectStore('cache').get('visited');q.onsuccess=()=>{resolve(q.result);db.close()}}}));assert.equal(rows.length,96);assert.ok(rows.some(r=>r.key==='-68:300'));assert.ok(!rows.some(r=>r.key===seed[0].key));
});
test('obsolete 3D library rejection cannot overwrite a newer successful render',async t=>{
 const f=await fixture(browser,t,{seed:[record()]});await f.page.evaluate(()=>{window.fuelLibJobs=[];google.maps.importLibrary=()=>new Promise((resolve,reject)=>fuelLibJobs.push({resolve,reject}))});await f.threeD();await f.page.waitForFunction(()=>fuelLibJobs.length===1);
 await f.page.evaluate(()=>{fuelTest.data.watch({south:-34.8,north:-34.7,west:151.2,east:151.3},()=>{})});await f.page.waitForFunction(()=>fuelLibJobs.length>=2);
 await f.page.evaluate(()=>{fuelLibJobs.at(-1).resolve({Marker3DElement:customElements.get('mock-marker-3d')})});await f.page.waitForFunction(()=>document.querySelectorAll('#mancardo3dMap mock-marker-3d').length===1);await f.page.evaluate(()=>fuelLibJobs[0].reject(Error('Obsolete synthetic library failure')));await f.page.waitForTimeout(50);assert.doesNotMatch(await f.page.locator('#mancardo3dOverlayStatus').textContent(),/unavailable/);assert.deepEqual(f.errors,[]);
});
