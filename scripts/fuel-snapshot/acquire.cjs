// One manually dispatched public-OSM acquisition. No application/account access.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ENDPOINTS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
const QUERY='[out:json][timeout:8];nwr["amenity"="fuel"](-34,151,-33.5,151.5);out center tags;';
const BOUNDS={south:-34,west:151,north:-33.5,east:151.5};
function normalize(data,endpoint,retrievedAt=Date.now()){
 if(!ENDPOINTS.includes(endpoint)||!data||data.remark||!Array.isArray(data.elements)||!data.elements.length||data.elements.length>500)throw Error('INCOMPLETE_OR_OVERSIZED');
 const timestamp=data.osm3s?.timestamp_osm_base;
 if(typeof timestamp!=='string'||!Number.isFinite(Date.parse(timestamp))||Date.parse(timestamp)>retrievedAt+60000||retrievedAt-Date.parse(timestamp)>7*86400000)throw Error('INVALID_SOURCE_TIMESTAMP');
 const stations=[],seen=new Set();
 for(const e of data.elements){
  if(!e||!['node','way','relation'].includes(e.type)||!Number.isSafeInteger(e.id)||e.id<=0||!e.tags||typeof e.tags!=='object')throw Error('INVALID_RECORD');
  const lat=e.lat??e.center?.lat,lon=e.lon??e.center?.lon;
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat< -44||lat> -9||lon<112||lon>154)throw Error('INVALID_COORDINATES');
  const t=e.tags,bad=v=>/^(yes|true|1)$/i.test(String(v||''));
  if(t.amenity!=='fuel'||['disused','abandoned','demolished','closed','construction'].some(k=>bad(t[k]))||['disused:amenity','abandoned:amenity','demolished:amenity','construction:amenity'].some(k=>t[k])||/^(no|private)$/i.test(String(t.access||'')))continue;
  const id=e.type+'/'+e.id;if(seen.has(id))continue;seen.add(id);
  const tags={};for(const key of ['amenity','name','brand','operator','addr:housenumber','addr:street','addr:suburb','addr:city','addr:postcode','opening_hours','phone','contact:phone'])if(typeof t[key]==='string')tags[key]=t[key].slice(0,500);
  stations.push({id,lat,lon,tags});
 }
 if(!stations.some(s=>s.lat>=BOUNDS.south&&s.lat<=BOUNDS.north&&s.lon>=BOUNDS.west&&s.lon<=BOUNDS.east)||JSON.stringify(stations).length*2>500000)throw Error('EMPTY_OR_OVERSIZED_SNAPSHOT');
 return {schemaVersion:1,coverage:{cellKey:'-68:302',bounds:BOUNDS,semantics:'OSM bounding-box feature selection; way/relation centres may lie outside the box'},retrievedAt:new Date(retrievedAt).toISOString(),source:{dataset:'OpenStreetMap',endpoint,query:QUERY,osmBaseTimestamp:timestamp,license:'ODbL-1.0',licenseUrl:'https://opendatacommons.org/licenses/odbl/1-0/',attribution:'© OpenStreetMap contributors',attributionUrl:'https://www.openstreetmap.org/copyright'},stations};
}
async function acquire(request=fetch){
 const attempts=[];
 for(const endpoint of ENDPOINTS){
  const start=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000),attempt={provider:new URL(endpoint).hostname,status:null,elapsedMs:null,outcome:'pending'};attempts.push(attempt);
  try{
   const r=await request(endpoint+'?data='+encodeURIComponent(QUERY),{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal});attempt.status=r.status;
   if(!r.ok)r.body?.cancel().catch(()=>{});
   if(r.status===429){attempt.outcome='rate-limited';break;}
   if(!r.ok)throw Error('HTTP_ERROR');
   const reader=r.body.getReader(),chunks=[];let bytes=0;
   while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1000000){reader.cancel().catch(()=>{});throw Error('BODY_LIMIT');}chunks.push(Buffer.from(value));}
   let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('INVALID_JSON');}
   const snapshot=normalize(data,endpoint);attempt.outcome='validated';return {snapshot,attempts};
  }catch(e){const codes=['HTTP_ERROR','BODY_LIMIT','INVALID_JSON','INCOMPLETE_OR_OVERSIZED','INVALID_SOURCE_TIMESTAMP','INVALID_RECORD','INVALID_COORDINATES','EMPTY_OR_OVERSIZED_SNAPSHOT'];attempt.outcome=controller.signal.aborted?'timeout':codes.includes(e.message)?e.message:'network-error';}
  finally{attempt.elapsedMs=Date.now()-start;controller.abort();clearTimeout(timer);}
  if(endpoint!==ENDPOINTS.at(-1))await new Promise(resolve=>setTimeout(resolve,500));
 }
 return {snapshot:null,attempts};
}
async function main(){
 const out=path.resolve(process.env.SNAPSHOT_OUT||'fuel-snapshot-acquisition');fs.mkdirSync(out,{recursive:true});
 const {snapshot,attempts}=await acquire();const report={coverage:BOUNDS,attempts,acquired:!!snapshot};
 if(snapshot){const bytes=JSON.stringify(snapshot,null,2)+'\n';fs.writeFileSync(path.join(out,'sydney-v1.json'),bytes);report.sha256=crypto.createHash('sha256').update(bytes).digest('hex');report.stations=snapshot.stations.length;}
 else process.exitCode=1;
 fs.writeFileSync(path.join(out,'acquisition-result.json'),JSON.stringify(report,null,2)+'\n');
}
module.exports={acquire,normalize,QUERY,ENDPOINTS,BOUNDS};
if(require.main===module)main().catch(()=>{console.error('Acquisition failed; no unvalidated data published.');process.exitCode=1;});
