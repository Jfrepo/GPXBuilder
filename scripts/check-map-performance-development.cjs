// Live Google provider, synthetic browser state only. Fetch the authenticated
// shell once; never forward Access credentials to Google or browser requests.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const URL='https://mancardo-dev-test.jayfenno.workers.dev/';
async function check(){
 const id=process.env.CF_ACCESS_CLIENT_ID,secret=process.env.CF_ACCESS_CLIENT_SECRET;
 if(!id||!secret)throw Error('Development Access credentials are required.');
 const response=await fetch(URL,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{'CF-Access-Client-Id':id,'CF-Access-Client-Secret':secret}});
 if(!response.ok)throw Error('Authenticated Development shell unavailable.');
 let html=await response.text();if(!html.includes('googleTrackPoints.forEach')||!html.includes("map.on('zoomanim',function(ev){sync(ev.center,ev.zoom);})"))throw Error('Development performance candidate is absent.');
 html=html.replace('// ---------- boot ----------',`window.__performanceAcceptance={get map(){return map},get state(){return state},loadItem:function(id){loadItem(id)},exportCurrent:function(){return buildGpx(state.current)}};\n// ---------- boot ----------`);
 const browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();const errors=[];let blockedDataRequests=0;
  page.on('pageerror',()=>errors.push('Browser exception (details withheld to avoid emitting URLs/keys).'));
  await page.addInitScript(()=>localStorage.setItem('mancardo_saved_waypoints_v1',JSON.stringify([{id:'synthetic-performance-waypoint',name:'Synthetic performance waypoint',icon:'trail',lat:-33.86,lon:151.2,visible:true}])));
  await page.route('**/*',route=>{const u=new globalThis.URL(route.request().url());
   if(u.href===URL)return route.fulfill({contentType:'text/html',body:html});
   if((u.origin===new globalThis.URL(URL).origin&&u.pathname.startsWith('/api/'))||u.hostname==='api.mancardo.com'){blockedDataRequests++;return route.fulfill({json:{authenticated:false,tracks:[],waypoints:[],notes:[]}});}
   if(u.origin===new globalThis.URL(URL).origin)return route.abort();
   // Only the provider and public static dependencies can leave this fixture.
   if(/(^|\.)(googleapis\.com|gstatic\.com|google\.com|googleusercontent\.com|cloudflare\.com)$/.test(u.hostname))return route.continue();
   return route.abort();
  });
  await page.goto(URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__mancardoGoogleMap?.getProjection()&&window.__mancardoGoogleMap?.getBounds(),null,{timeout:30000});
  await page.evaluate(()=>{const p=__performanceAcceptance;const item={id:'synthetic-performance-track',name:'Synthetic only',type:'track',visible:true,segments:[Array.from({length:10000},(_,i)=>({lat:-33.86+i*.000001,lon:151.2+i*.000001,ele:100}))]};p.state.library=[item];p.loadItem(item.id);p.map.setView([-33.86,151.2],13,{animate:false});window.__originalGPX=p.exportCurrent();window.__alignmentProbe=new google.maps.OverlayView();__alignmentProbe.onAdd=function(){};__alignmentProbe.draw=function(){};__alignmentProbe.onRemove=function(){};__alignmentProbe.setMap(__mancardoGoogleMap);});
  await page.waitForFunction(()=>__alignmentProbe.getProjection());await page.waitForTimeout(1500);
  const modes=[];
  for(const mode of ['Roads','Terrain','Satellite','Hybrid']){
   await page.getByRole('button',{name:mode,exact:true}).click();await page.waitForTimeout(1000);
   const box=await page.locator('#mapDiv').boundingBox();await page.mouse.move(box.x+box.width*.55,box.y+box.height*.5);
   const samples=[];
   for(const z of [15,13]){
    await page.evaluate(z=>__performanceAcceptance.map.setZoom(z,{animate:false}),z);await page.waitForTimeout(700);
    await page.evaluate(()=>{window.__wheelEvidence={start:0,commandMs:null,maxAlignmentError:0,frames:0};const map=__performanceAcceptance.map;
     if(!window.__wheelBound){map.getContainer().addEventListener('wheel',()=>{__wheelEvidence.start=performance.now()},{capture:true,passive:true});__mancardoGoogleMap.addListener('zoom_changed',()=>{if(__wheelEvidence.start&&__wheelEvidence.commandMs===null)__wheelEvidence.commandMs=performance.now()-__wheelEvidence.start});window.__wheelBound=true;}
     const end=performance.now()+1100;function sample(){const marker=document.querySelector('.mancardo-saved-waypoint-marker');if(marker){const r=marker.getBoundingClientRect(),b=map.getContainer().getBoundingClientRect(),p=__alignmentProbe.getProjection().fromLatLngToContainerPixel(new google.maps.LatLng(-33.86,151.2));__wheelEvidence.maxAlignmentError=Math.max(__wheelEvidence.maxAlignmentError,Math.hypot(r.x+r.width/2-b.x-p.x,r.bottom-b.y-p.y));__wheelEvidence.frames++;}if(performance.now()<end)requestAnimationFrame(sample);}requestAnimationFrame(sample);
    });
    await page.mouse.wheel(0,-60);await page.waitForTimeout(1200);samples.push(await page.evaluate(()=>({...__wheelEvidence,start:undefined,geometryUnchanged:__performanceAcceptance.exportCurrent()===__originalGPX})));
   }
   modes.push({mode,samples});
  }
  const latencies=modes.flatMap(m=>m.samples.map(s=>s.commandMs)).filter(x=>Number.isFinite(x)).sort((a,b)=>a-b);
  const commandP95=latencies[Math.ceil(latencies.length*.95)-1];
  const result={commandP95,commandTargetMs:100,commandTargetMet:latencies.length===8&&commandP95<=100,provider:'real Google Maps',syntheticOnly:true,blockedDataRequests,errors,modes,physicalTouchTested:false,actual3DTested:false};
  fs.writeFileSync(path.resolve(process.env.PERFORMANCE_LIVE_EVIDENCE||'performance-development-browser.json'),JSON.stringify(result,null,2)+'\n');
  if(errors.length||modes.some(m=>m.samples.some(s=>s.commandMs===null||!s.frames||s.maxAlignmentError>=2||!s.geometryUnchanged)))throw Error('Real-provider synthetic acceptance failed; inspect sanitized evidence.');
  console.log('Real Google desktop: four modes, threshold/non-threshold wheel, <2px waypoint alignment and unchanged GPX passed. No user-data requests reached the service.');
 }finally{await browser.close()}
}
if(require.main===module)check().catch(()=>{console.error('Development real-provider check failed. Inspect sanitized evidence; no production or user data was changed.');process.exitCode=1;});
module.exports={check};
