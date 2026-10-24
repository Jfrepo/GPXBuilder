// Exact-candidate Development release controller. No migrations or data endpoints.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const crypto=require('node:crypto');
const PIN='6ac8fb56f3b74b1a2c96b187cc19d64442944e66';
const MANIFEST='ee19c52be5768caaba1e63d35d40faba38096b5652c0b932efa54d2e1997dde4';
const STAGE_PIN='637af20b858659d8942cfcc1fc51050070cccb8f';
const STAGE_MANIFEST='92791139a357b74f373b948e8a50b8bd7cc3d9640bb17c2a15a0217db3260446';
const STAGE_TAG='fuel-cancel-delete-637af20b8586',STAGE_MESSAGE=STAGE_PIN+' '+STAGE_MANIFEST;
const WORKER='mancardo-dev-test', DB_NAME='mancardo-private-library-dev';
const PRODUCTION='6ada726b-aae6-441b-a698-69dc0789c7b7';
const URL='https://mancardo-dev-test.jayfenno.workers.dev/';
const TAG='fuel-cancel-6ac8fb56f3b7', MESSAGE=PIN+' '+MANIFEST;
const EXPECTED_PREVIOUS_MESSAGE=PIN+' '+MANIFEST;
const VERIFIED_VERSION='7e6aed39-3549-4d1a-947d-8bd6caf9730a',VERIFIED_DEPLOYMENT='b29387d1-19d2-4240-ac4e-2d201d3774b0';
function validateExistingVersion(deployment,version){
  if(deployment.id!==VERIFIED_DEPLOYMENT||activeVersion(deployment)!==VERIFIED_VERSION||version.annotations?.['workers/tag']!==TAG||version.annotations?.['workers/message']!==MESSAGE)throw Error('Verify-only requires the exact existing reviewed Development version; no deployment allowed.');
}
function validatePreviousVersion(version){
  const message=version.annotations?.['workers/message'],tag=version.annotations?.['workers/tag'];
  if(!((message===EXPECTED_PREVIOUS_MESSAGE&&tag===TAG)||(message===STAGE_MESSAGE&&tag===STAGE_TAG)))throw Error('Development no longer matches the reviewed Fuel/Cancel preview; recompose and coordinate before staging.');
}
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
function candidateFor(verifyOnly){return verifyOnly?{pin:PIN,manifest:MANIFEST,tag:TAG,message:MESSAGE}:{pin:STAGE_PIN,manifest:STAGE_MANIFEST,tag:STAGE_TAG,message:STAGE_MESSAGE};}
async function release(){
  const env=process.env;requiredEnv(env);
  if(env.VERIFY_ONLY!==undefined&&!['true','false'].includes(env.VERIFY_ONLY))throw Error('Invalid verify-only mode.');
  const verifyOnly=env.VERIFY_ONLY==='true';
  const {pin:PIN,manifest:MANIFEST,tag:TAG,message:MESSAGE}=candidateFor(verifyOnly);
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
  const evidence={verifyOnly,candidate:PIN,manifestSha256:MANIFEST,url:URL,isolationVerified:false,authenticationPreserved:false,deployAttempted:false,deploymentVerified:false,deliveredCancelVerified:false,cancelAcceptancePassed:false,deliveredDeleteVerified:false,deleteAcceptancePassed:false,acceptancePassed:false};
  const evidencePath=path.resolve(env.EVIDENCE_PATH||'performance-development-result.json');
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
    validatePreviousVersion(version);
    if(version.annotations?.['workers/message']===EXPECTED_PREVIOUS_MESSAGE)validateExistingVersion(before,version);
    if(verifyOnly)validateExistingVersion(before,version);
    evidence.previousDeploymentId=before.id;evidence.previousVersionId=prior;save();
    let expectedVersion=prior;
    if(version.annotations?.['workers/tag']===TAG&&version.annotations?.['workers/message']===MESSAGE){
      evidence.alreadyDeployed=true;
    }else{
      if(verifyOnly)throw Error('Verify-only cannot deploy.');
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
    if(verifyOnly)validateExistingVersion(after,deployed);
    if(deployed.annotations?.['workers/tag']!==TAG||deployed.annotations?.['workers/message']!==MESSAGE)throw Error('Active version candidate annotations mismatch.');
    await verifyIdentity();
    evidence.deploymentVerified=true;evidence.deploymentId=after.id;evidence.versionId=expectedVersion;evidence.outcome='verified';save();
    console.log('Verified Development deployment/version: '+after.id+' / '+expectedVersion);
    const html=await readShell();
    const source=fs.readFileSync(path.join(root,'worker-waypoint-save.js'),'utf8');
    const feature=source.match(/const WAYPOINT_FEATURE = String.raw`([\s\S]*?)`;/)[1];
    if(!html.includes(feature))throw Error('Delivered waypoint runtime does not match pinned tested feature.');
    validateCancelHtml(html,fs.readFileSync(path.join(root,'index.html'),'utf8'));
    evidence.deliveredCancelVerified=true;
    validateFuelHtml(html,fs.readFileSync(path.join(root,'index.html'),'utf8'),fs.readFileSync(path.join(root,'worker-3d-overlays.js'),'utf8'));
    evidence.deliveredFuelVerified=true;save();
    if(!verifyOnly){validateDeleteHtml(html,fs.readFileSync(path.join(root,'index.html'),'utf8'),fs.readFileSync(path.join(root,'worker-delete-durable-fix.js'),'utf8'));evidence.deliveredDeleteVerified=true;save();}
    // The pinned entrypoint does not import the optional shared-waypoint client.
    // Exact feature equality covers every category and saved-waypoint surface it serves.
    // Browser fixtures remain local and intercept every request; no account data is loaded.
    const acceptance=spawnSync(process.execPath,['--test','--test-concurrency=1','tests/waypoint-display.test.cjs','tests/map-performance.test.cjs','tests/cancel-edit.test.cjs','tests/fuel-cache.test.cjs'],{cwd:root,env:{...env,WAYPOINT_ARTIFACT_DIR:'',MANCARDO_PERF_ROOT:root},encoding:'utf8',timeout:300000,maxBuffer:4*1024*1024});
    if(acceptance.error||acceptance.signal||acceptance.status!==0)throw Error('Post-deploy synthetic waypoint, map, Cancel or Fuel acceptance failed.');
    evidence.cancelAcceptancePassed=true;evidence.fuelAcceptancePassed=true;save();
    if(!verifyOnly){
      const deletion=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-name-pattern=library delete dialog|dialog confirmation reads final','tests/request-volume-browser.test.cjs','tests/delete-behavior.test.cjs'],{cwd:root,env:{...env,DELETE_SCREENSHOT_DIR:''},encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
      if(deletion.error||deletion.signal||deletion.status!==0)throw Error('Post-deploy synthetic Delete dialog acceptance failed.');
      evidence.deleteAcceptancePassed=true;save();
    }
    const livePath=path.join(path.dirname(evidencePath),'performance-development-browser.json');
    const live=spawnSync(process.execPath,['scripts/check-map-performance-development.cjs'],{cwd:root,env:{...env,PERFORMANCE_LIVE_EVIDENCE:livePath},encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});
    if(fs.existsSync(livePath))evidence.realGoogle=JSON.parse(fs.readFileSync(livePath,'utf8'));
    if(live.error||live.signal||live.status!==0){save();throw Error('Real Google desktop acceptance failed; inspect sanitized evidence. Development version is deployed; no automatic retry or rollback.');}
    validateBrowserEvidence(evidence.realGoogle);
    if(verifyOnly){await verifyIdentity();validateExistingVersion(latest(await read(prefix+'/deployments')),await read(prefix+'/versions/'+VERIFIED_VERSION));}
    evidence.acceptancePassed=true;evidence.acceptance=(verifyOnly?'Existing exact candidate verified without deployment; ':'Exact candidate staged; ')+'local Fuel/Cancel/save/alignment regression tests and actual Google desktop synthetic checks passed. Physical touch and actual 3D remain outstanding.';save();
    console.log('PASS: exact Development candidate, Fuel/Cancel/save/alignment regressions, real Google desktop with synthetic state only.');
  }catch(e){evidence.error=e.message;save();throw e;}finally{if(!verifyOnly)fs.writeFileSync(configFile,config);}
}
function validateCancelHtml(html,source){
  const spans=[
    ['// ---------- cancellable editor sessions ----------','// ---------- history ----------'],
    ['<div class="mode-banner hidden" id="modeBanner">','<div class="layer-toggle">'],
    ['<dialog id="discardEditDialog"','</dialog>'],
    ['.mode-banner{','.layer-toggle{'],
    ['// Follow actual map-layer row height','function fitToTrack(){'],
    ['#discardEditDialog{','.dialog h3{'],
    ['/* Completion is distinct from Save:','@media (prefers-color-scheme:dark)'],
    ['els.completeChangeBtn.onclick = function(){','els.deleteTrackBtn.onclick'],
    ['els.cancelChangeBtn.onclick = cancelTrackEdit;','els.reverseBtn.onclick']
  ];
  for(const [from,to] of spans){
    const start=source.indexOf(from),end=source.indexOf(to,start);
    if(start<0||end<=start||!html.includes(source.slice(start,end)))throw Error('Delivered Cancel runtime/UI does not match pinned tested feature.');
  }
  for(const id of ['completeChangeBtn','cancelChangeBtn']){
    const button=source.match(new RegExp('<button[^>]*id="'+id+'"[\\s\\S]*?</button>'));
    if(!button||!html.includes(button[0]))throw Error('Delivered Cancel controls do not match pinned tested feature.');
  }
  if(html.includes('id="finishDrawBtn"'))throw Error('Obsolete duplicate completion control delivered.');
}
function validateDeleteHtml(html,source,bridgeSource){
  const bridge=bridgeSource.match(/const DURABLE_DELETE_BRIDGE = String.raw`([\s\S]*?)`;/)?.[1];
  if(!bridge||!html.includes(bridge))throw Error('Delivered Delete authorization/dialog runtime does not match pinned feature.');
  for(const [from,to] of [['<dialog id="libraryDeleteDialog"','</dialog>'],['#libraryDeleteDialog{','.dialog h3{']]){
    const start=source.indexOf(from),end=source.indexOf(to,start);
    if(start<0||end<=start||!html.includes(source.slice(start,end)+to))throw Error('Delivered Delete dialog UI does not match pinned feature.');
  }
}
function validateFuelHtml(html,source,overlaySource){
  const from='// Fuel data belongs to OSM',to='\n\n\nels.layerStreetsBtn.onclick';
  const start=source.indexOf(from),end=source.indexOf(to,start);
  if(start<0||end<=start||source.indexOf(from,start+1)!==-1||!html.includes(source.slice(start,end)))throw Error('Delivered Fuel cache/2D controls do not match pinned feature.');
  const feature=overlaySource.match(/const MAP_3D_OVERLAY_FEATURE = String.raw`([\s\S]*?)`;/)?.[1];
  if(!feature||!html.includes(feature))throw Error('Delivered 3D Fuel does not match pinned feature.');
}
function validateBrowserEvidence(data){
  if(!data||data.provider!=='real Google Maps'||data.syntheticOnly!==true||!Array.isArray(data.errors)||data.errors.length||data.commandTargetMs!==100||data.commandTargetMet!==true||!Number.isFinite(data.commandP95)||data.commandP95<0||data.commandP95>100)
    throw Error('Real Google performance acceptance target unmet or evidence invalid; inspect sanitized evidence. Development version remains deployed; no automatic retry or rollback.');
}
module.exports={candidateFor,STAGE_PIN,STAGE_MANIFEST,STAGE_TAG,STAGE_MESSAGE,validateDeleteHtml,validateExistingVersion,VERIFIED_VERSION,VERIFIED_DEPLOYMENT,validateFuelHtml,validatePreviousVersion,EXPECTED_PREVIOUS_MESSAGE,validateCancelHtml,validateBrowserEvidence,requiredEnv,identity,latest,activeVersion,PIN,MANIFEST};
if(require.main===module)release().catch(e=>{console.error(e.message);process.exitCode=1;});
