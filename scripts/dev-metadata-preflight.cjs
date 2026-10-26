// Read-only Development identity receipt. No shell, deploy, account-data or settings writes.
const fs=require('node:fs');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const errors=new Set(['CONFIGURATION_INVALID','HTTP_FAILED','RESPONSE_TOO_LARGE','INVALID_RESPONSE','AMBIGUOUS_DEPLOYMENT','IDENTITY_CHANGED','BINDING_MISMATCH']);
function deployment(result){const d=result?.deployments?.[0];if(!UUID.test(d?.id||'')||d.versions?.length!==1||d.versions[0].percentage!==100||!UUID.test(d.versions[0].version_id||''))throw Error('AMBIGUOUS_DEPLOYMENT');return {deploymentId:d.id,versionId:d.versions[0].version_id};}
function annotations(v){const message=v?.annotations?.['workers/message'],tag=v?.annotations?.['workers/tag'];const match=typeof message==='string'&&message.match(/^([a-f0-9]{40}) ([a-f0-9]{64})$/);return {source:match?match[1]:null,manifest:match?match[2]:null,tag:typeof tag==='string'&&/^(?:insert-waypoints|waypoint-export|export-waypoints|minimal-cancel-delete)-[a-f0-9]{12}$/.test(tag)?tag:null,annotationsResolved:!!match};}
async function inspect(env=process.env,request=fetch){
 const report={readOnly:true,worker:'mancardo-dev-test',identityStable:false,bindingMatches:false};
 try{
  if(!env.CF_TOKEN||!/^[a-f0-9]{32}$/i.test(env.CF_ACCOUNT||'')||!UUID.test(env.DEV_DB||'')||env.DEV_DB.toLowerCase()==='6ada726b-aae6-441b-a698-69dc0789c7b7')throw Error('CONFIGURATION_INVALID');
  const base='https://api.cloudflare.com/client/v4/accounts/'+env.CF_ACCOUNT+'/workers/scripts/mancardo-dev-test';
  async function get(suffix){const r=await request(base+suffix,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.CF_TOKEN,Accept:'application/json'}});if(r.status!==200)throw Error('HTTP_FAILED');const reader=r.body?.getReader();if(!reader)throw Error('INVALID_RESPONSE');let bytes=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1048576){await reader.cancel();throw Error('RESPONSE_TOO_LARGE');}chunks.push(Buffer.from(value));}let d;try{d=JSON.parse(Buffer.concat(chunks).toString());}catch{throw Error('INVALID_RESPONSE');}if(d.success!==true||!d.result)throw Error('INVALID_RESPONSE');return d.result;}
  const before=deployment(await get('/deployments'));Object.assign(report,before);
  const version=await get('/versions/'+before.versionId);if(version.id!==before.versionId)throw Error('IDENTITY_CHANGED');Object.assign(report,annotations(version));
  const settings=await get('/settings'),bindings=Array.isArray(settings.bindings)?settings.bindings.filter(b=>b.type==='d1'):[];
  const b=bindings[0];if(bindings.length!==1||b.name!=='PRIVATE_LIBRARY_DB'||String(b.id||b.database_id||'').toLowerCase()!==env.DEV_DB.toLowerCase()||(b.id&&b.database_id&&String(b.id).toLowerCase()!==String(b.database_id).toLowerCase()))throw Error('BINDING_MISMATCH');report.bindingMatches=true;
  const after=deployment(await get('/deployments')),end=await get('/versions/'+before.versionId);
  if(JSON.stringify(before)!==JSON.stringify(after)||end.id!==before.versionId||JSON.stringify(version.annotations||{})!==JSON.stringify(end.annotations||{}))throw Error('IDENTITY_CHANGED');
  report.identityStable=true;
 }catch(e){report.error=errors.has(e.message)?e.message:'READ_FAILED';}
 return report;
}
module.exports={inspect,deployment,annotations};
if(require.main===module)inspect().then(report=>{fs.writeFileSync(process.env.EVIDENCE_PATH||'dev-metadata-preflight.json',JSON.stringify(report,null,2)+'\n');if(!report.identityStable)process.exitCode=1;}).catch(()=>{console.error('Development metadata preflight failed; no mutation attempted.');process.exitCode=1;});
