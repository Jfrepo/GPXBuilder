// One-off dated public extract acquisition. No Overpass/app/account requests.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const NAME='new-south-wales-261023.osm.pbf';
const URL='https://download.geofabrik.de/australia-oceania/australia/'+NAME;
const EXPECTED_BYTES=269807440,MAX_BYTES=300000000;
function checksum(text){const m=text.trim().match(/^([a-f0-9]{32})\s+\*?new-south-wales-261023\.osm\.pbf$/i);if(!m)throw Error('INVALID_CHECKSUM');return m[1].toLowerCase();}
async function download(out,request=fetch){
 const checksumResponse=await request(URL+'.md5',{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000)});
 if(checksumResponse.status!==200){checksumResponse.body?.cancel().catch(()=>{});throw Error('CHECKSUM_HTTP_ERROR');}
 const reader=checksumResponse.body.getReader();let chunks=[],total=0;
 while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>1024){reader.cancel().catch(()=>{});throw Error('CHECKSUM_SIZE');}chunks.push(Buffer.from(value));}
 const md5=checksum(Buffer.concat(chunks).toString('utf8'));
 const response=await request(URL,{method:'GET',redirect:'error',signal:AbortSignal.timeout(180000)});
 if(response.status!==200){response.body?.cancel().catch(()=>{});throw Error('EXTRACT_HTTP_ERROR');}
 const declared=response.headers.get('content-length');if(declared&&Number(declared)!==EXPECTED_BYTES){response.body.cancel().catch(()=>{});throw Error('EXTRACT_SIZE');}
 const file=path.join(out,NAME),fd=fs.openSync(file,'wx'),hash=crypto.createHash('md5'),sha=crypto.createHash('sha256'),stream=response.body.getReader();let bytes=0;
 try{while(true){const {done,value}=await stream.read();if(done)break;bytes+=value.length;if(bytes>MAX_BYTES||bytes>EXPECTED_BYTES)throw Error('EXTRACT_SIZE');fs.writeFileSync(fd,value);hash.update(value);sha.update(value);}if(bytes!==EXPECTED_BYTES||hash.digest('hex')!==md5)throw Error('CHECKSUM_MISMATCH');}
 catch(e){stream.cancel().catch(()=>{});throw e;}finally{fs.closeSync(fd);}
 return {url:URL,filename:NAME,bytes,md5,sha256:sha.digest('hex'),retrievedAt:new Date().toISOString()};
}
async function main(){
 const out=path.resolve(process.env.SNAPSHOT_OUT||'fuel-geofabrik-acquisition');fs.mkdirSync(out,{recursive:true});const tmp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'fuel-extract-'));
 try{const receipt=await download(tmp);fs.writeFileSync(path.join(tmp,'source.json'),JSON.stringify(receipt));
  const r=spawnSync('python3',[path.join(__dirname,'process-geofabrik.py'),path.join(tmp,NAME),path.join(tmp,'source.json'),out],{encoding:'utf8',timeout:300000,maxBuffer:1000000});
  if(r.error||r.status!==0)throw Error('PROCESSING_FAILED');
  const snapshot=fs.readFileSync(path.join(out,'sydney-v1.json'));fs.writeFileSync(path.join(out,'acquisition-result.json'),JSON.stringify({acquired:true,source:receipt,snapshotSha256:crypto.createHash('sha256').update(snapshot).digest('hex')},null,2)+'\n');
 }catch(e){const codes=['INVALID_CHECKSUM','CHECKSUM_HTTP_ERROR','CHECKSUM_SIZE','EXTRACT_HTTP_ERROR','EXTRACT_SIZE','CHECKSUM_MISMATCH','PROCESSING_FAILED'];fs.writeFileSync(path.join(out,'acquisition-result.json'),JSON.stringify({acquired:false,error:codes.includes(e.message)?e.message:'ACQUISITION_FAILED'},null,2)+'\n');process.exitCode=1;}
 finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
module.exports={checksum,download,NAME,URL,EXPECTED_BYTES,MAX_BYTES};
if(require.main===module)main().catch(()=>{console.error('Extract acquisition failed; no validated snapshot.');process.exitCode=1;});
