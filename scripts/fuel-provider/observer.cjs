// Inject only into a new isolated context. It observes native fetch without
// changing its URL, options, AbortSignal, returned promise or Response.
function installFuelObserver(){
 const allowed=new Set(['overpass-api.de','overpass.kumi.systems']);
 const nativeFetch=window.fetch,records=[];let pending=0;
 Object.defineProperty(window,'__fuelProviderObservation',{value:{records,get pending(){return pending}}});
 window.fetch=function(input,options){
  let host;try{const u=new URL(typeof input==='string'?input:input.url,location.href);if(u.protocol!=='https:'||u.pathname!=='/api/interpreter'||!allowed.has(u.hostname))return nativeFetch.apply(this,arguments);host=u.hostname;}catch{return nativeFetch.apply(this,arguments);}
  if(records.length>=2)return nativeFetch.apply(this,arguments); // Network routing separately enforces the budget.
  const start=performance.now(),record={provider:host,status:null,outcome:'pending',elapsedMs:null,responseBytes:0,bodyComplete:false,remarkPresent:null,elements:null,validCoordinates:null,invalidCoordinates:null};
  records.push(record);pending++;
  let promise;
  try{promise=nativeFetch.apply(this,arguments);}catch(e){record.outcome=e?.name==='AbortError'?'abort':'fetch-error';record.elapsedMs=Math.round(performance.now()-start);pending--;throw e;}
  promise.then(async response=>{
   record.status=response.status;record.outcome='response';let reader;
   try{
    reader=response.clone().body?.getReader();let chunks=[],size=0;
    if(reader){while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;record.responseBytes=size;if(size>1000000){record.outcome='body-limit';reader.cancel().catch(()=>{});return;}chunks.push(value);}}
    record.bodyComplete=true;
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{record.outcome='non-json';return;}
    record.remarkPresent=!!data?.remark;
    if(!Array.isArray(data?.elements)){record.outcome='missing-elements';return;}
    record.elements=data.elements.length;let valid=0;
    for(const e of data.elements){const lat=e?.lat??e?.center?.lat,lon=e?.lon??e?.center?.lon;if(Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=-44&&lat<=-9&&lon>=112&&lon<=154)valid++;}
    record.validCoordinates=valid;record.invalidCoordinates=data.elements.length-valid;
   }catch(e){record.outcome=e?.name==='AbortError'?'abort':'body-error';}
   finally{record.elapsedMs=Math.round(performance.now()-start);pending--;}
  },e=>{record.outcome=e?.name==='AbortError'?'abort':'fetch-error';record.elapsedMs=Math.round(performance.now()-start);pending--;});
  return promise;
 };
}
const HOSTS=['overpass-api.de','overpass.kumi.systems'];
const QUERY='[out:json][timeout:8];nwr["amenity"="fuel"](-34,151,-33.5,151.5);out center tags;';
function permitProvider(request,seen){
 let u;try{u=new URL(request.url());}catch{return false;}
 if(request.method()!=='GET'||u.protocol!=='https:'||u.port||u.username||u.password||!HOSTS.includes(u.hostname)||u.pathname!=='/api/interpreter'||u.searchParams.size!==1||u.searchParams.get('data')!==QUERY||seen.has(u.hostname)||seen.size>=2)return false;
 seen.add(u.hostname);return true;
}
// Never serialize page-controlled objects directly: copy only bounded numbers/enums.
function sanitizeRecords(records){
 if(!Array.isArray(records))return [];
 const outcomes=['pending','response','abort','fetch-error','body-limit','non-json','missing-elements','body-error','redirect-blocked'];
 const number=(v,max)=>Number.isInteger(v)&&v>=0&&v<=max?v:null;
 return records.slice(0,2).map(r=>({provider:HOSTS.includes(r?.provider)?r.provider:'withheld',status:number(r?.status,599),outcome:outcomes.includes(r?.outcome)?r.outcome:'withheld',elapsedMs:number(r?.elapsedMs,60000),responseBytes:number(r?.responseBytes,2000000),bodyComplete:r?.bodyComplete===true,remarkPresent:typeof r?.remarkPresent==='boolean'?r.remarkPresent:null,elements:number(r?.elements,1000000),validCoordinates:number(r?.validCoordinates,1000000),invalidCoordinates:number(r?.invalidCoordinates,1000000)}));
}
module.exports={installFuelObserver,permitProvider,sanitizeRecords,QUERY};
// Pause all responses before Chromium follows a redirect. No replacement
// request is made; a blocked redirect is reported as such, not provider failure.
async function installRedirectGuard(page,patterns=[{urlPattern:'*',requestStage:'Response'}]){
 const session=await page.context().newCDPSession(page),redirects=[];
 session.on('Fetch.requestPaused',async event=>{
  try{
   if(event.responseStatusCode>=300&&event.responseStatusCode<400){
    const host=new URL(event.request.url).hostname;
    if(HOSTS.includes(host))redirects.push({provider:host,status:event.responseStatusCode});
    await session.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'});
   }else await session.send('Fetch.continueRequest',{requestId:event.requestId});
  }catch{await page.close().catch(()=>{});}
 });
 await session.send('Fetch.enable',{patterns});return redirects;
}
module.exports.installRedirectGuard=installRedirectGuard;
