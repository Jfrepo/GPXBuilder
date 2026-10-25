// Metadata only: no deployment, D1 queries, retries or credential output.
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const {identity} = require('./verify-production.cjs');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const EXPECTED={version:'c2d200e3-4b9e-4556-b38b-0c15af9180a5',source:'89d361b97ad9b521ad3671286e4e1fbba705b4c9',manifest:'3566a9c165f9493fbec8b771648d06e92e3b8db6761542744545ffb3a935702f'};
function fail(code){const e=new Error(code);e.code=code;throw e;}
function active(result){const d=result?.deployments?.[0];if(!UUID.test(d?.id)||d.versions?.length!==1||d.versions[0].percentage!==100||!UUID.test(d.versions[0].version_id))fail('AMBIGUOUS_DEPLOYMENT');return {deployment:d.id,version:d.versions[0].version_id};}
function metadata(v,id){if(v?.id!==id)fail('VERSION_MISMATCH');const message=v.annotations?.['workers/message']||'';const m=/^([a-f0-9]{40}) ([a-f0-9]{64})$/.exec(message);return {version:id,source:m?.[1]||null,manifest:m?.[2]||null};}
function binding(s){const d=s?.bindings?.filter(x=>x.type==='d1');if(d?.length!==1||d[0].name!=='PRIVATE_LIBRARY_DB'||(d[0].database_id||d[0].id)!=='6ada726b-aae6-441b-a698-69dc0789c7b7'||(d[0].database_id&&d[0].id&&d[0].database_id!==d[0].id))fail('BINDING_MISMATCH');return true;}
async function preflight(env,fetcher=fetch){
 if(!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID||'')||!env.CLOUDFLARE_API_TOKEN)fail('CREDENTIALS_UNAVAILABLE');
 const prefix='https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/workers/scripts/mancardo';
 async function read(suffix){let response;try{response=await fetcher(prefix+suffix,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,Accept:'application/json'}});}catch{fail('NETWORK_ERROR');}
 if(!response.ok)fail('HTTP_'+response.status);
 let bytes;const chunks=[];let size=0;const reader=response.body?.getReader();if(!reader)fail('BODY_READ_FAILED');try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1048576){await reader.cancel();fail('RESPONSE_TOO_LARGE');}chunks.push(Buffer.from(value));}bytes=Buffer.concat(chunks).toString('utf8');}catch(e){if(e.code==='RESPONSE_TOO_LARGE')throw e;fail('BODY_READ_FAILED');}
 let json;try{json=JSON.parse(bytes);}catch{fail('INVALID_JSON');}if(json.success!==true||!json.result)fail('API_FAILED');return json.result;}
 const before=active(await read('/deployments'));
 const current=metadata(await read('/versions/'+before.version),before.version);
 binding(await read('/settings'));
 const rollback=before.version===EXPECTED.version?current:metadata(await read('/versions/'+EXPECTED.version),EXPECTED.version);
 const after=active(await read('/deployments'));
 binding(await read('/settings'));
 const currentAfter=metadata(await read('/versions/'+after.version),after.version);
 if(JSON.stringify(before)!==JSON.stringify(after)||JSON.stringify(current)!==JSON.stringify(currentAfter))fail('BASELINE_CHANGED');
 const rollbackVerified=rollback.source===EXPECTED.source&&rollback.manifest===EXPECTED.manifest;
 return {ok:rollbackVerified&&!!current.source,worker:'mancardo',deployment:before.deployment,current,bindingMatches:true,rollback,rollbackVerified,reason:!current.source?'CURRENT_ANNOTATIONS_UNRESOLVED':!rollbackVerified?'ROLLBACK_ANNOTATIONS_UNRESOLVED':null};
}
module.exports={preflight,active,metadata,binding,EXPECTED};
if(require.main===module){(async()=>{let result;try{identity(process.env,execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim());result=await preflight(process.env);}catch(e){result={ok:false,reason:/^(HTTP_\d{3}|[A-Z_]+)$/.test(e.code||'')?e.code:'PREFLIGHT_FAILED'};}fs.writeFileSync('production-preflight-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;})();}
