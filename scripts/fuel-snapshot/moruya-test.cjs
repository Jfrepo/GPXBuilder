// One explicit public-source test. No app/account access, fallback or retry.
const fs=require('node:fs'),path=require('node:path');
const ENDPOINT='https://overpass-api.de/api/interpreter';
const CENTER={lat:-35.91250,lon:150.08144},RADIUS_METRES=100000;
const CENTER_SOURCE='https://www.geonames.org/2156834';
const QUERY='[out:json][timeout:8];nwr["amenity"="fuel"](around:100000,-35.91250,150.08144);out center tags;';
const USER_AGENT='MancardoFuelAreaTest/1.0 (+https://github.com/Jfrepo/GPXBuilder)';
function distanceMetres(lat,lon){
 const rad=Math.PI/180,a=(lat-CENTER.lat)*rad,b=(lon-CENTER.lon)*rad;
 const h=Math.sin(a/2)**2+Math.cos(CENTER.lat*rad)*Math.cos(lat*rad)*Math.sin(b/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));
}
function normalize(data,now=Date.now()){
 if(!data||data.remark||!Array.isArray(data.elements)||data.elements.length>500)throw Error('INCOMPLETE_OR_OVERSIZED');
 const timestamp=data.osm3s?.timestamp_osm_base,t=Date.parse(timestamp);
 if(typeof timestamp!=='string'||!Number.isFinite(t)||t>now+60000||now-t>7*86400000)throw Error('INVALID_SOURCE_TIMESTAMP');
 const stations=[],seen=new Set();let outsideRadius=0,excluded=0;
 for(const e of data.elements){
  if(!e||!['node','way','relation'].includes(e.type)||!Number.isSafeInteger(e.id)||e.id<=0||!e.tags||typeof e.tags!=='object'||Array.isArray(e.tags)||e.tags.amenity!=='fuel')throw Error('INVALID_RECORD');
  const lat=e.lat??e.center?.lat,lon=e.lon??e.center?.lon;
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat< -90||lat>90||lon< -180||lon>180)throw Error('INVALID_COORDINATES');
  const tags=e.tags,bad=v=>/^(yes|true|1)$/i.test(String(v||''));
  if(['disused','abandoned','demolished','closed','construction'].some(k=>bad(tags[k]))||['disused:amenity','abandoned:amenity','demolished:amenity','construction:amenity'].some(k=>tags[k])||/^(no|private)$/i.test(String(tags.access||''))){excluded++;continue;}
  const distance=distanceMetres(lat,lon);if(distance>RADIUS_METRES){outsideRadius++;continue;}
  const id=e.type+'/'+e.id;if(seen.has(id))continue;seen.add(id);
  const safe={};for(const key of ['name','brand','operator','addr:street','addr:suburb','opening_hours'])if(typeof tags[key]==='string')safe[key]=tags[key].slice(0,500);
  stations.push({id,lat,lon,distanceMetres:distance,tags:safe});
 }
 if(JSON.stringify(stations).length*2>500000)throw Error('OUTPUT_LIMIT');
 return {stations,sourceTimestamp:timestamp,rawCount:data.elements.length,outsideRadius,excluded};
}
async function acquire(request=fetch){
 const started=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 const report={acquired:false,provider:new URL(ENDPOINT).hostname,center:CENTER,centerSource:CENTER_SOURCE,radiusMetres:RADIUS_METRES,distanceModel:'great-circle, Earth radius 6371000m; node position or supplied way/relation centre',query:QUERY,status:null,phase:'request',bytes:0,elapsedMs:null,outcome:'pending'};
 try{
  const r=await request(ENDPOINT+'?data='+encodeURIComponent(QUERY),{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',headers:{'User-Agent':USER_AGENT,Accept:'application/json'},signal:controller.signal});report.status=r.status;
  if(!r.ok){r.body?.cancel().catch(()=>{});throw Error(r.status===429?'RATE_LIMITED':'HTTP_ERROR');}
  report.phase='body';const reader=r.body.getReader(),chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;report.bytes+=value.length;if(report.bytes>1000000)throw Error('BODY_LIMIT');chunks.push(Buffer.from(value));}}finally{reader.cancel().catch(()=>{});}
  report.phase='validation';let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('INVALID_JSON');}
  const result=normalize(data);Object.assign(report,{acquired:true,outcome:'validated',phase:'complete',count:result.stations.length,rawCount:result.rawCount,outsideRadius:result.outsideRadius,excluded:result.excluded,sourceTimestamp:result.sourceTimestamp,retrievedAt:new Date().toISOString()});
  return {report,stations:result.stations};
 }catch(e){const known=['RATE_LIMITED','HTTP_ERROR','BODY_LIMIT','INVALID_JSON','INCOMPLETE_OR_OVERSIZED','INVALID_SOURCE_TIMESTAMP','INVALID_RECORD','INVALID_COORDINATES','OUTPUT_LIMIT'];report.outcome=controller.signal.aborted?'TIMEOUT':known.includes(e.message)?e.message:'NETWORK_ERROR';return {report,stations:null};}
 finally{report.elapsedMs=Date.now()-started;clearTimeout(timer);controller.abort();}
}
async function main(){
 const out=path.resolve('fuel-moruya-test');fs.mkdirSync(out,{recursive:true});
 const {report,stations}=await acquire();
 if(stations)fs.writeFileSync(path.join(out,'stations.json'),JSON.stringify({coverage:report,source:{dataset:'OpenStreetMap',license:'ODbL-1.0',attribution:'© OpenStreetMap contributors',attributionUrl:'https://www.openstreetmap.org/copyright'},stations},null,2)+'\n');
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2)+'\n');
 if(!report.acquired)process.exitCode=1;
}
module.exports={ENDPOINT,CENTER,RADIUS_METRES,QUERY,USER_AGENT,distanceMetres,normalize,acquire};
if(require.main===module)main().catch(()=>{console.error('Moruya test failed; no validated result.');process.exitCode=1;});
