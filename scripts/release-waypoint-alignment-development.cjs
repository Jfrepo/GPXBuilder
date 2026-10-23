// Exact-candidate Development release controller. No migrations or data endpoints.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const crypto=require('node:crypto');
const PIN='2ba26f250b512118f0936f82ccc94a806f224549';
const MANIFEST='ad7ea18ddfd65f19a56a296faa296b9d34882593838efa6660cb99616fcac42d';
const WORKER='mancardo-dev-test', DB_NAME='mancardo-private-library-dev';
const PRODUCTION='6ada726b-aae6-441b-a698-69dc0789c7b7';
const URL='https://mancardo-dev-test.jayfenno.workers.dev/';
const TAG='wa-2ba26f250b51', MESSAGE=PIN+' '+MANIFEST;
function requiredEnv(env){
  if(!env.CF_TOKEN||!/^[a-f0-9]{32}$/i.test(env.CF_ACCOUNT||''))throw Error('Existing Development API token/account configuration is missing or invalid.');
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(env.DEV_DB||'')||env.DEV_DB.toLowerCase()===PRODUCTION)throw Error('Development database ID is missing, invalid or Production.');
  if(!env.CF_ACCESS_CLIENT_ID||!env.CF_ACCESS_CLIENT_SECRET)throw Error('Existing Development Access service credentials are missing; no deploy attempted.');
}
function identity(db,settings,env,config){
  if(String(db.uuid||'').toLowerCase()!==env.DEV_DB.toLowerCase()||db.name!==DB_NAME)throw Error('Development database UUID/name mismatch.');
  const bindings=Array.isArray(settings.bindings)?settings.bindings:[];
  const d1=bindings.filter(b=>b.type==='d1');
  if(d1.length!==1||d1[0].name!=='PRIVATE_LIBRARY_DB')throw Error('Unexpected Development D1 bindings.');
  const b=d1[0],bound=String(b.database_id||b.id||'').toLowerCase();
  if(bound!==env.DEV_DB.toLowerCase()||(b.database_id&&b.id&&String(b.database_id).toLowerCase()!==String(b.id).toLowerCase()))throw Error('Development Worker/database binding mismatch.');
  for(const name of ['CF_ACCESS_TEAM_DOMAIN','CF_ACCESS_AUD']){
    const expected=config.match(new RegExp('^'+name+' = "([^"\\n]+)"$','m'))?.[1];
    const vars=bindings.filter(x=>x.name===name);
    if(!expected||vars.length!==1||vars[0].type!=='plain_text'||vars[0].text!==expected)throw Error('Existing Development authentication configuration does not match pinned candidate.');
  }
}
function latest(result){const d=result.deployments?.[0];if(!d||!Array.isArray(d.versions))throw Error('Cannot verify active Development deployment.');return d;}
function activeVersion(d){return d.versions.length===1&&d.versions[0].percentage===100?d.versions[0].version_id:null;}
async function release(){
  const env=process.env;requiredEnv(env);
  const root=path.resolve(env.CANDIDATE_ROOT||'.');
  if(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()!==PIN)throw Error('Wrong candidate checkout.');
  const out=path.join(root,'dist/waypoint-development');
  const manifestBytes=fs.readFileSync(path.join(out,'manifest.json'));
  if(crypto.createHash('sha256').update(manifestBytes).digest('hex')!==MANIFEST)throw Error('Wrong candidate manifest.');
  const manifest=JSON.parse(manifestBytes);
  for(const [file,hash]of Object.entries(manifest)){
    if(file.includes('..')||path.isAbsolute(file)||crypto.createHash('sha256').update(fs.readFileSync(path.join(out,file))).digest('hex')!==hash)throw Error('Candidate file digest mismatch.');
  }
  const configFile=path.join(out,'wrangler.toml'),config=fs.readFileSync(configFile,'utf8');
  if(!/^name = "mancardo-dev-test"$/m.test(config)||!/^database_name = "mancardo-private-library-dev"$/m.test(config)||(config.match(/DEV_DATABASE_ID_REQUIRED/g)||[]).length!==1||config.toLowerCase().includes(PRODUCTION))throw Error('Unsafe Development target config.');
  const evidence={candidate:PIN,manifestSha256:MANIFEST,url:URL,isolationVerified:false,authenticationPreserved:false,deployAttempted:false,deploymentVerified:false,acceptancePassed:false};
  const evidencePath=path.resolve(env.EVIDENCE_PATH||'waypoint-development-result.json');
  const save=()=>fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
  save();
  async function read(suffix){
    const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+env.CF_ACCOUNT+suffix,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.CF_TOKEN,Accept:'application/json'}});
    if(!r.ok)throw Error('Read-only Development verification failed, HTTP '+r.status+'. No retry.');
    const d=await r.json();if(d.success!==true||!d.result)throw Error('Invalid Development verification response.');return d.result;
  }
  const prefix='/workers/scripts/'+WORKER;
  async function readShell(){
    const r=await fetch(URL,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'CF-Access-Client-Id':env.CF_ACCESS_CLIENT_ID,'CF-Access-Client-Secret':env.CF_ACCESS_CLIENT_SECRET}});
    if(!r.ok||!String(r.headers.get('content-type')).includes('text/html'))throw Error('Authenticated Development shell check failed.');
    const html=await r.text();if(!html.includes('id="mapDiv"'))throw Error('Development shell is not the expected application.');return html;
  }
  async function verifyIdentity(){
    identity(await read('/d1/database/'+env.DEV_DB),await read(prefix+'/settings'),env,config);
    const accountSubdomain=await read('/workers/subdomain');
    const subdomain=await read(prefix+'/subdomain');
    if(accountSubdomain.subdomain!=='jayfenno'||subdomain.enabled!==true||subdomain.previews_enabled!==true)throw Error('Existing Development URL/preview configuration differs; no access or URL setting changes authorized.');
  }
  try{
    await verifyIdentity();
    await readShell();
    evidence.isolationVerified=true;evidence.authenticationPreserved=true;save();
    console.log('PASS: exact candidate, dedicated Development Worker/D1 binding and unchanged authentication/URL configuration. No data queried.');
    const before=latest(await read(prefix+'/deployments'));
    const prior=activeVersion(before);
    if(!prior)throw Error('Development is not a single-version deployment; stop before changing traffic.');
    const version=await read(prefix+'/versions/'+encodeURIComponent(prior));
    evidence.previousDeploymentId=before.id;evidence.previousVersionId=prior;save();
    let expectedVersion=prior;
    if(version.annotations?.['workers/tag']===TAG&&version.annotations?.['workers/message']===MESSAGE){
      evidence.alreadyDeployed=true;
    }else{
      // Repeat the read-only identity check immediately before the one allowed write.
      await verifyIdentity();
      if(latest(await read(prefix+'/deployments')).id!==before.id)throw Error('Development deployment changed during preflight; no deployment attempted.');
      fs.writeFileSync(configFile,config.replace('DEV_DATABASE_ID_REQUIRED',env.DEV_DB));
      evidence.deployAttempted=true;evidence.outcome='uncertain until verified';save();
      const result=spawnSync(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),'deploy','--config',configFile,'--name',WORKER,'--keep-vars','--tag',TAG,'--message',MESSAGE,'--experimental-auto-create=false'],{cwd:root,env:{...env,CLOUDFLARE_API_TOKEN:env.CF_TOKEN,CLOUDFLARE_ACCOUNT_ID:env.CF_ACCOUNT,WRANGLER_SEND_METRICS:'false'},encoding:'utf8',maxBuffer:8*1024*1024,timeout:180000});
      // Never expose CLI streams: they can contain configuration or credential values.
      if(result.error||result.signal||result.status!==0)throw Error('Development deploy did not return verified success; outcome uncertain. Inspect current version before any retry.');
      expectedVersion=String(result.stdout||'').match(/Current Version ID:\s*([a-f0-9-]{36})/i)?.[1];
      if(!expectedVersion)throw Error('Deployment command returned without a verifiable version ID; outcome uncertain. Do not retry.');
    }
    const after=latest(await read(prefix+'/deployments'));
    if(activeVersion(after)!==expectedVersion)throw Error('Active Development version does not match deployment result; outcome uncertain.');
    const deployed=await read(prefix+'/versions/'+encodeURIComponent(expectedVersion));
    if(deployed.annotations?.['workers/tag']!==TAG||deployed.annotations?.['workers/message']!==MESSAGE)throw Error('Active version candidate annotations mismatch.');
    await verifyIdentity();
    evidence.deploymentVerified=true;evidence.deploymentId=after.id;evidence.versionId=expectedVersion;evidence.outcome='verified';save();
    console.log('Verified Development deployment/version: '+after.id+' / '+expectedVersion);
    const html=await readShell();
    const source=fs.readFileSync(path.join(root,'worker-waypoint-save.js'),'utf8');
    const feature=source.match(/const WAYPOINT_FEATURE = String.raw`([\s\S]*?)`;/)[1];
    if(!html.includes(feature))throw Error('Delivered waypoint runtime does not match pinned tested feature.');
    // The pinned entrypoint does not import the optional shared-waypoint client.
    // Exact feature equality covers every category and saved-waypoint surface it serves.
    // Browser fixtures remain local and intercept every request; no account data is loaded.
    const acceptance=spawnSync(process.execPath,['--test','tests/waypoint-display.test.cjs'],{cwd:root,env:{...env,WAYPOINT_ARTIFACT_DIR:''},encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024});
    if(acceptance.error||acceptance.signal||acceptance.status!==0)throw Error('Post-deploy synthetic waypoint acceptance failed.');
    evidence.acceptancePassed=true;evidence.acceptance='Authenticated HTML carries exact tested waypoint feature; real-Leaflet desktop/touch synthetic scenarios passed. No user-data APIs called. Live Google synchronization and physical-device testing remain outstanding.';save();
    console.log('PASS: authenticated Development shell matches exact waypoint runtime; bounded synthetic desktop/touch acceptance passed.');
  }catch(e){evidence.error=e.message;save();throw e;}finally{fs.writeFileSync(configFile,config);}
}
module.exports={requiredEnv,identity,latest,activeVersion,PIN,MANIFEST};
if(require.main===module)release().catch(e=>{console.error(e.message);process.exitCode=1;});
