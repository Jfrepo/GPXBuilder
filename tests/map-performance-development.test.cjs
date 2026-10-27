const test=require('node:test'),assert=require('node:assert/strict');
const {requiredEnv,identity,latest,activeVersion}=require('../scripts/release-map-performance-development.cjs');
const id='11111111-2222-4333-8444-555555555555';
const env={CF_TOKEN:'synthetic',CF_ACCOUNT:'a'.repeat(32),DEV_DB:id,CF_ACCESS_CLIENT_ID:'synthetic',CF_ACCESS_CLIENT_SECRET:'synthetic'};
const config='CF_ACCESS_TEAM_DOMAIN = "synthetic.example"\nCF_ACCESS_AUD = "synthetic-audience"\n';
const db=()=>({uuid:id,name:'mancardo-private-library-dev'});
const settings=()=>({bindings:[{type:'d1',name:'PRIVATE_LIBRARY_DB',id},{type:'plain_text',name:'CF_ACCESS_TEAM_DOMAIN',text:'synthetic.example'},{type:'plain_text',name:'CF_ACCESS_AUD',text:'synthetic-audience'}]});
test('accepts isolated existing identity and unchanged auth',()=>{requiredEnv(env);identity(db(),settings(),env,config);});
test('fails closed for missing credentials, bad ID, and case-insensitive Production ID',()=>{for(const patch of [{CF_TOKEN:''},{CF_ACCOUNT:''},{DEV_DB:'bad'},{DEV_DB:'6ADA726B-AAE6-441B-A698-69DC0789C7B7'},{CF_ACCESS_CLIENT_ID:''},{CF_ACCESS_CLIENT_SECRET:''}])assert.throws(()=>requiredEnv({...env,...patch}));});
test('rejects wrong database, binding name, UUID, and extra D1',()=>{assert.throws(()=>identity({...db(),name:'wrong'},settings(),env,config));assert.throws(()=>identity({...db(),uuid:'wrong'},settings(),env,config));for(const alter of [s=>s.bindings[0].name='wrong',s=>s.bindings[0].id='wrong',s=>s.bindings[0].database_id='wrong',s=>s.bindings.push({type:'d1',name:'OTHER',id})]){const s=settings();alter(s);assert.throws(()=>identity(db(),s,env,config));}});
test('fails closed on changed or unverifiable authentication',()=>{for(const alter of [s=>s.bindings.pop(),s=>s.bindings[1].text='changed',s=>s.bindings[2].type='secret_text',s=>s.bindings.push({...s.bindings[1]})]){const s=settings();alter(s);assert.throws(()=>identity(db(),s,env,config));}});
test('accepts only verifiable single-version traffic',()=>{assert.throws(()=>latest({}));assert.equal(activeVersion({versions:[{version_id:'v',percentage:100}]}),'v');assert.equal(activeVersion({versions:[{version_id:'v',percentage:50}]}),null);assert.equal(activeVersion({versions:[{version_id:'v',percentage:50},{version_id:'w',percentage:50}]}),null);});

const fs=require('node:fs'),path=require('node:path');
test('manual staging pins only the exact combined Fuel/Cancel candidate and never deploys preparation via push',()=>{
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/cloudflare-dev.yml'),'utf8');
 assert.ok(workflow.includes("'dd8b591e1f688559335d28ebedaf196ddac7fe6f' }}"));
 assert.ok(workflow.includes("if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/mancardo-dev'"));
 for(const file of ['scripts/release-map-performance-development.cjs','tests/map-performance-development.test.cjs'])assert.ok(workflow.includes("      - '"+file+"'"));
 assert.ok(workflow.includes('node controller/tests/map-performance-development.test.cjs')===false);
 assert.ok(workflow.includes('node --test controller/tests/map-performance-development.test.cjs'));
});

const {validateBrowserEvidence}=require('../scripts/release-map-performance-development.cjs');
test('real Google acceptance enforces the measured command latency target',()=>{
 const valid={provider:'real Google Maps',syntheticOnly:true,errors:[],commandTargetMs:100,commandTargetMet:true,commandP95:99};
 assert.doesNotThrow(()=>validateBrowserEvidence(valid));
 for(const patch of [{commandP95:101},{commandP95:NaN},{commandP95:null},{commandP95:-1},{commandTargetMet:false},{commandTargetMs:200},{syntheticOnly:false},{provider:'mock'},{errors:['failure']},{errors:null}])assert.throws(()=>validateBrowserEvidence({...valid,...patch}));
 assert.throws(()=>validateBrowserEvidence(undefined));
});

test('diagnostic operation has no deployment credentials or commands, and staging is explicit',()=>{
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/cloudflare-dev.yml'),'utf8');
 const diagnostic=workflow.split('  diagnose-performance:')[1].split('  diagnose-fuel-delivery:')[0];
 assert.ok(diagnostic.includes("inputs.operation == 'diagnose'"));
 assert.ok(workflow.includes("inputs.operation == 'stage'"));
 assert.ok(workflow.includes('default: diagnose'));
 assert.ok(workflow.includes("      - 'scripts/trace-map-performance-development.cjs'"));
 for(const prohibited of ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','DEV_DB','wrangler','release-map-performance-development.cjs'])assert.ok(!diagnostic.includes(prohibited));
 assert.ok(diagnostic.includes('CF_ACCESS_CLIENT_SECRET'));
});
test('diagnostic instrumentation retains checker isolation and acceptance checks',()=>{
 const {instrument}=require('../scripts/trace-map-performance-development.cjs');
 const source="isolate();\n  const modes=[];\nawait page.mouse.wheel(0,-60);\nfor(const z of [15,13]){}\n  const latencies=[]; const result={commandP95,};\n({...__wheelEvidence,start:undefined,geometryUnchanged:unchanged});\nvalidate();";
 const result=instrument(source);
 assert.ok(result.includes('isolate();'));assert.ok(result.endsWith('validate();'));
 for(const event of ['setCenter','setZoom','zoom_changed','zoomanim','longtasks'])assert.ok(result.includes(event));
 assert.throws(()=>instrument('unexpected source'));
});

test('CPU profiles strip URLs, query credentials and unrelated frame metadata',()=>{
 const {sanitizeProfile}=require('../scripts/trace-map-performance-development.cjs');
 const result=sanitizeProfile({startTime:1,endTime:2,samples:[1],timeDeltas:[1],nodes:[{id:1,children:[],callFrame:{functionName:'knownSyntheticWork',url:'https://maps.googleapis.com/maps/api/js?key=DO_NOT_KEEP',lineNumber:2,columnNumber:3,unexpected:'DO_NOT_KEEP'}}]});
 assert.equal(result.nodes[0].callFrame.source,'google-provider:js');
 assert.ok(!JSON.stringify(result).includes('DO_NOT_KEEP'));assert.ok(!JSON.stringify(result).includes('https://'));
 assert.deepEqual(result.samples,[1]);
});

test('repeatability removes profiler waits and preserves original wheel invocation and acceptance count',()=>{
 const {instrument}=require('../scripts/trace-map-performance-development.cjs');
 const source="isolate();\n  const modes=[];\nawait page.mouse.wheel(0,-60);\nfor(const z of [15,13]){}\n  const latencies=[]; const result={commandP95,};\n({...__wheelEvidence,start:undefined,geometryUnchanged:unchanged});\nlatencies.length===8;validate();";
 const result=instrument(source,{profile:false});
 for(const excluded of ['cdp.send','newCDPSession','clockBefore','Profiler.start'])assert.ok(!result.includes(excluded));
 assert.ok(result.includes('await page.mouse.wheel(0,-60);'));
 assert.ok(result.includes('latencies.length===8'));
 assert.ok(result.includes('samples.splice(2)'));
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/cloudflare-dev.yml'),'utf8');assert.ok(workflow.includes('default: repeatability'));
});
test('repeatability completes three contexts and retains an earlier failure',async()=>{
 const vm=require('node:vm'),os=require('node:os');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'performance-repeat-'));
 const output=path.join(dir,'result.json'),env={CANDIDATE_ROOT:'/synthetic',PERFORMANCE_DIAGNOSTIC_MODE:'repeatability',PERFORMANCE_LIVE_EVIDENCE:output};
 let calls=0;
 const checker="  const modes=[];\nawait page.mouse.wheel(0,-60);\nfor(const z of [15,13]){}\n  const latencies=[]; const result={commandP95,};\n({...__wheelEvidence,start:undefined,geometryUnchanged:unchanged});";
 class FakeModule{constructor(){this.exports={check:async()=>{calls++;fs.writeFileSync(env.PERFORMANCE_LIVE_EVIDENCE,JSON.stringify({provider:'real Google Maps',syntheticOnly:true,errors:[],commandTargetMs:100,commandTargetMet:calls!==1,commandP95:calls===1?300:50,modes:[],diagnosticWarmControls:[]}));}}}_compile(){}static _nodeModulePaths(){return []}}
 const source=fs.readFileSync(path.join(__dirname,'../scripts/trace-map-performance-development.cjs'),'utf8');
 const guards=require('../scripts/release-map-performance-development.cjs');
 const loader=name=>name==='node:module'?FakeModule:name==='node:child_process'?{execFileSync:()=>guards.PIN}:name==='node:fs'?{...fs,readFileSync:(file,...args)=>String(file).startsWith('/synthetic/')?checker:fs.readFileSync(file,...args)}:name==='./release-map-performance-development.cjs'?guards:require(name);
 try{const result=vm.runInNewContext(source+'\nrun();',{require:loader,module:{exports:{}},process:{env},console,URL});await assert.rejects(result);const report=JSON.parse(fs.readFileSync(output));assert.equal(calls,3);assert.equal(report.completedContexts,3);assert.equal(report.acceptancePassed,false);assert.deepEqual(report.runs.map(r=>r.acceptancePassed),[false,true,true]);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('causal sampling starts before navigation and adds no profiler calls or waits inside input loops',()=>{
 const {instrument}=require('../scripts/trace-map-performance-development.cjs');
 const source="  await page.goto(URL,{waitUntil:'domcontentloaded'});\n  const modes=[];\nfor(const z of [15,13]){\nawait page.mouse.wheel(0,-60);\n({...__wheelEvidence,start:undefined,geometryUnchanged:unchanged});}\n  const latencies=[]; const result={commandP95,};";
 const result=instrument(source,{early:true});
 assert.ok(result.indexOf("send('Profiler.start')")<result.indexOf('await page.goto'));
 const loop=result.slice(result.indexOf('for(const z'),result.indexOf('const navigationProfile='));
 assert.ok(!loop.includes('cdp'));assert.ok(!loop.includes('Cdp'));assert.ok(!loop.includes('Profiler'));assert.ok(!loop.includes('clock'));
 assert.equal((loop.match(/await /g)||[]).length,1);
 assert.ok(result.includes("m.name==='NavigationStart'"));
});

const {validateCancelHtml,PIN,MANIFEST}=require('../scripts/release-map-performance-development.cjs');
test('Combined preparation pins the qualified runtime and manifest in both stage and diagnose checkouts',()=>{
 assert.equal(PIN,'6ac8fb56f3b74b1a2c96b187cc19d64442944e66');
 assert.equal(MANIFEST,'ee19c52be5768caaba1e63d35d40faba38096b5652c0b932efa54d2e1997dde4');
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/cloudflare-dev.yml'),'utf8');
 assert.equal(workflow.split('ref: '+PIN).length-1,2);
 assert.ok(workflow.includes("inputs.operation == 'verify' && '"+PIN+"'"));
});
test('delivered Cancel check verifies session, sole tick, modal UI and handlers',()=>{
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
 const source=spans.map(([a,b],i)=>a+'tested fragment '+i+b).join('\n')+'<button id="completeChangeBtn">tick</button><button id="cancelChangeBtn">cross</button>';
 assert.doesNotThrow(()=>validateCancelHtml(source,source));
 for(let i=0;i<spans.length;i++)assert.throws(()=>validateCancelHtml(source.replace('tested fragment '+i,'changed'),source));
 for(const id of ['completeChangeBtn','cancelChangeBtn'])assert.throws(()=>validateCancelHtml(source.replace('id="'+id+'"','id="missing"'),source));
 assert.throws(()=>validateCancelHtml(source+'<button id="finishDrawBtn">old</button>',source));
 assert.throws(()=>validateCancelHtml(source,'unrecognized source'));
});
test('Cancel acceptance augments existing synthetic and real Google checks without resetting success on late failure',()=>{
 const controller=fs.readFileSync(path.join(__dirname,'../scripts/release-map-performance-development.cjs'),'utf8');
 assert.ok(controller.includes("'tests/waypoint-display.test.cjs','tests/map-performance.test.cjs','tests/cancel-edit.test.cjs',verifyOnly?'tests/fuel-cache.test.cjs':'tests/fuel-disabled.test.cjs'"));
 assert.ok(controller.includes("WAYPOINT_ARTIFACT_DIR:'',MANCARDO_PERF_ROOT:root"));
 assert.ok(controller.includes("['scripts/check-map-performance-development.cjs']"));
 assert.ok(controller.indexOf('evidence.deploymentVerified=true')<controller.indexOf('validateCancelHtml(html,'));
 assert.ok(controller.indexOf('evidence.cancelAcceptancePassed=true')<controller.indexOf('validateBrowserEvidence(evidence.realGoogle)'));
 assert.ok(controller.indexOf('validateBrowserEvidence(evidence.realGoogle)')<controller.indexOf('evidence.acceptancePassed=true'));
 assert.ok(controller.includes('Development version is deployed; no automatic retry or rollback.'));
});
const {validateFuelHtml,validatePreviousVersion,EXPECTED_PREVIOUS_MESSAGE}=require('../scripts/release-map-performance-development.cjs');
test('newer Development previews cannot be silently overwritten by this composition',()=>{
 assert.doesNotThrow(()=>validatePreviousVersion({annotations:{'workers/message':EXPECTED_PREVIOUS_MESSAGE,'workers/tag':'fuel-cancel-6ac8fb56f3b7'}}));
 assert.doesNotThrow(()=>validatePreviousVersion({annotations:{'workers/message':require('../scripts/release-map-performance-development.cjs').CURRENT_MESSAGE,'workers/tag':'waypoint-export-60994306d017'}}));
 assert.throws(()=>validatePreviousVersion({annotations:{'workers/message':'newer-delete-dialog-preview'}}));
 assert.throws(()=>validatePreviousVersion({}));
 assert.throws(()=>validatePreviousVersion({annotations:{'workers/message':EXPECTED_PREVIOUS_MESSAGE,'workers/tag':'wrong'}}));
});
test('delivered Fuel verification rejects either old cache or old 3D implementation',()=>{
 const source='// Fuel data belongs to OSM\nreviewed cache and controls\n\n\nels.layerStreetsBtn.onclick';
 const overlay='const MAP_3D_OVERLAY_FEATURE = String.raw`reviewed 3D fuel`;';
 const html=source+'reviewed 3D fuel';
 assert.doesNotThrow(()=>validateFuelHtml(html,source,overlay));
 assert.throws(()=>validateFuelHtml(html.replace('reviewed cache','old cache'),source,overlay));
 assert.throws(()=>validateFuelHtml(html.replace('reviewed 3D fuel','old 3D fuel'),source,overlay));
 assert.throws(()=>validateFuelHtml(html,'unrecognized',overlay));
 assert.throws(()=>validateFuelHtml(html,source,'unrecognized'));
});
test('Fuel acceptance augments all existing isolation, Cancel and latency gates',()=>{
 const controller=fs.readFileSync(path.join(__dirname,'../scripts/release-map-performance-development.cjs'),'utf8');
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/cloudflare-dev.yml'),'utf8');
 assert.ok(controller.indexOf('validatePreviousVersion(version)')<controller.indexOf('evidence.deployAttempted=true'));
 assert.ok(controller.indexOf('(verifyOnly?validateFuelHtml:validateFuelDisabledHtml)(html,')<controller.indexOf('evidence.fuelAcceptancePassed=true'));
 assert.ok(controller.indexOf('evidence.fuelAcceptancePassed=true')<controller.indexOf('validateBrowserEvidence(evidence.realGoogle)'));
 for(const command of ['npm run test:source','npm run test:packaged-server','npm run test:browser','npm run test:waypoints','npm run test:map-performance','npm run test:cancel','tests/fuel-disabled.test.cjs'])assert.ok(workflow.includes(command));
 assert.ok(controller.includes('data.commandTargetMs!==100'));
 assert.ok(controller.includes('data.commandP95>100'));
});
test('verify-only requires exact unchanged deployment, version and candidate annotations',()=>{
 const {validateExistingVersion,VERIFIED_VERSION,VERIFIED_DEPLOYMENT}=require('../scripts/release-map-performance-development.cjs');
 const deployment={id:VERIFIED_DEPLOYMENT,versions:[{version_id:VERIFIED_VERSION,percentage:100}]};
 const version={annotations:{'workers/tag':'fuel-cancel-6ac8fb56f3b7','workers/message':PIN+' '+MANIFEST}};
 assert.doesNotThrow(()=>validateExistingVersion(deployment,version));
 for(const bad of [{...deployment,id:'other'},{...deployment,versions:[]},{...deployment,versions:[{version_id:'other',percentage:100}]},{...deployment,versions:[{version_id:VERIFIED_VERSION,percentage:99}]}])assert.throws(()=>validateExistingVersion(bad,version));
 for(const bad of [{},{annotations:{...version.annotations,'workers/tag':'other'}},{annotations:{...version.annotations,'workers/message':'other'}}])assert.throws(()=>validateExistingVersion(deployment,bad));
});
test('verify-only is explicit and fails before any deploy; same delivery and acceptance gates remain',()=>{
 const controller=fs.readFileSync(path.join(__dirname,'../scripts/release-map-performance-development.cjs'),'utf8');
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/cloudflare-dev.yml'),'utf8');
 assert.ok(workflow.includes("VERIFY_ONLY: ${{ inputs.operation == 'verify' }}"));
 assert.ok(workflow.includes("(inputs.operation == 'stage' || inputs.operation == 'verify')"));
 assert.ok(controller.indexOf('if(verifyOnly)validateExistingVersion(before,version)')<controller.indexOf('evidence.deployAttempted=true'));
 assert.ok(controller.indexOf("if(verifyOnly)throw Error('Verify-only cannot deploy.')")<controller.indexOf('evidence.deployAttempted=true'));
 assert.ok(controller.includes('if(verifyOnly)validateExistingVersion(after,deployed)'));
 assert.ok(controller.indexOf('if(verifyOnly){await verifyIdentity();')<controller.indexOf('evidence.acceptancePassed=true'));
 for(const check of ['validateCancelHtml(html,','(verifyOnly?validateFuelHtml:validateFuelDisabledHtml)(html,','validateBrowserEvidence(evidence.realGoogle)'])assert.ok(controller.includes(check));
});

const {candidateFor,STAGE_PIN,STAGE_MANIFEST,STAGE_MESSAGE,validateDeleteHtml}=require('../scripts/release-map-performance-development.cjs');
test('stage pins combined Delete while verification and diagnostics retain exact existing Fuel',()=>{
 assert.equal(STAGE_PIN,'dd8b591e1f688559335d28ebedaf196ddac7fe6f');assert.equal(STAGE_MANIFEST,'161f2078e476aa1f86ad8f3d206f194408251b56212d99ec1ae32fcc77218cb2');
 assert.equal(candidateFor(false).pin,STAGE_PIN);assert.equal(candidateFor(false).message,STAGE_MESSAGE);
 assert.equal(candidateFor(true).pin,PIN);assert.equal(candidateFor(true).manifest,MANIFEST);
 assert.throws(()=>validatePreviousVersion({annotations:{'workers/message':'227ec8853ef96f5de7b615f24b6748e9c96d912d bf8407a3acc2b7779b6bdefa3ab544078f3b4f28c404305e5e419b384ebb249f'}}));
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/cloudflare-dev.yml'),'utf8');
 assert.ok(workflow.includes("ref: ${{ inputs.operation == 'verify' && '"+PIN+"' || '"+STAGE_PIN+"' }}"));
});
test('Delete delivered-code check rejects altered UI or authorization',()=>{
 const source='<dialog id="libraryDeleteDialog">safe dialog</dialog>\n#libraryDeleteDialog{safe style}.dialog h3{';
 const bridge='const DURABLE_DELETE_BRIDGE = String.raw`safe authorization`;';const html=source+'safe authorization';
 assert.doesNotThrow(()=>validateDeleteHtml(html,source,bridge));
 for(const text of ['safe dialog','safe style','safe authorization'])assert.throws(()=>validateDeleteHtml(html.replace(text,'old'),source,bridge));
 assert.throws(()=>validateDeleteHtml(html,'unknown',bridge));assert.throws(()=>validateDeleteHtml(html,source,'unknown'));
});
test('Delete acceptance is bounded, stage-only and cannot reset an overall latency failure',()=>{
 const c=fs.readFileSync(path.join(__dirname,'../scripts/release-map-performance-development.cjs'),'utf8');
 assert.ok(c.includes('if(!verifyOnly){validateDeleteHtml('));
 assert.ok(c.includes('--test-name-pattern=library delete dialog|dialog confirmation reads final'));
 assert.ok(c.includes('timeout:60000'));assert.ok(c.includes('timeout:300000'));assert.ok(c.includes('timeout:180000'));
 assert.ok(c.indexOf('evidence.deleteAcceptancePassed=true')<c.indexOf('validateBrowserEvidence(evidence.realGoogle)'));
 assert.ok(c.indexOf('validateBrowserEvidence(evidence.realGoogle)')<c.indexOf('evidence.acceptancePassed=true'));
});

const {validateFuelDisabledHtml,validateStagePreviousVersion,CURRENT_VERSION,CURRENT_MESSAGE,CURRENT_TAG}=require('../scripts/release-map-performance-development.cjs');
test('minimal staging requires exact existing version and rejects newer traffic before write',()=>{
 const deployment={id:require('../scripts/release-map-performance-development.cjs').CURRENT_DEPLOYMENT,versions:[{version_id:CURRENT_VERSION,percentage:100}]},version={annotations:{'workers/message':CURRENT_MESSAGE,'workers/tag':CURRENT_TAG}};
 assert.doesNotThrow(()=>validateStagePreviousVersion(deployment,version));
 for(const d of [{versions:[]},{versions:[{version_id:'newer',percentage:100}]},{versions:[{version_id:CURRENT_VERSION,percentage:50}]}])assert.throws(()=>validateStagePreviousVersion(d,version));
 for(const v of [{},{annotations:{...version.annotations,'workers/tag':'other'}},{annotations:{...version.annotations,'workers/message':STAGE_MESSAGE}}])assert.throws(()=>validateStagePreviousVersion(deployment,v));
 const c=fs.readFileSync(path.join(__dirname,'../scripts/release-map-performance-development.cjs'),'utf8');assert.ok(c.indexOf('if(!verifyOnly)validateStagePreviousVersion(before,version)')<c.indexOf('evidence.deployAttempted=true'));assert.ok(c.includes('Development changed during acceptance; no overall pass.'));
});
test('disabled Fuel delivery requires full exact 2D/3D spans with false flag',()=>{
 const source='// Retain the original overlay for restoration;\nconst fuelOverlayEnabled=false;\nreviewed disabled controls\n\n\nels.layerStreetsBtn.onclick';
 const overlay='const MAP_3D_OVERLAY_FEATURE = String.raw`if(!fuelOverlayEnabled){safe3D}`;',html=source+'if(!fuelOverlayEnabled){safe3D}';
 assert.doesNotThrow(()=>validateFuelDisabledHtml(html,source,overlay));
 for(const fragment of ['const fuelOverlayEnabled=false;','reviewed disabled controls','safe3D'])assert.throws(()=>validateFuelDisabledHtml(html.replace(fragment,'changed'),source,overlay));
 assert.throws(()=>validateFuelDisabledHtml(html,source.replace('false','true'),overlay));assert.throws(()=>validateFuelDisabledHtml(html,'unknown',overlay));assert.throws(()=>validateFuelDisabledHtml(html,source,'unknown'));
});
test('stage uses Fuel-off acceptance while historical verify retains cache checks and live latency remains required',()=>{
 const c=fs.readFileSync(path.join(__dirname,'../scripts/release-map-performance-development.cjs'),'utf8'),w=fs.readFileSync(path.join(__dirname,'../.github/workflows/cloudflare-dev.yml'),'utf8');
 assert.ok(c.includes("verifyOnly?'tests/fuel-cache.test.cjs':'tests/fuel-disabled.test.cjs'"));assert.ok(w.includes('node --test tests/fuel-disabled.test.cjs tests/insert-track-point.test.cjs tests/waypoint-development-release.test.cjs'));
 assert.ok(c.includes('evidence.fuelOverlayDisabledVerified=!verifyOnly'));assert.ok(c.indexOf('validateBrowserEvidence(evidence.realGoogle)')<c.indexOf('evidence.acceptancePassed=true'));
});

test('Insert and waypoint acceptance run before overall pass; qualification cannot deploy',()=>{
 const c=fs.readFileSync(path.join(__dirname,'../scripts/release-map-performance-development.cjs'),'utf8'),w=fs.readFileSync(path.join(__dirname,'../.github/workflows/insert-qualification.yml'),'utf8');
 assert.ok(c.includes("...(!verifyOnly?['tests/insert-track-point.test.cjs','tests/waypoint-export.test.cjs']:[])"));
 for(const flag of ['deliveredInsertVerified','deliveredWaypointSelectionVerified','insertAcceptancePassed','waypointSelectionAcceptancePassed'])assert.ok(c.indexOf('evidence.'+flag+'=')<c.indexOf('evidence.acceptancePassed=true'));
 // Qualification may precede fresh live identity acquisition; it cannot change stage pins.
 assert.ok(w.includes('ref: dd8b591e1f688559335d28ebedaf196ddac7fe6f'));
 assert.ok(w.includes("branches: ['staging/unified-export-qualification']"));
 assert.ok(w.includes('161f2078e476aa1f86ad8f3d206f194408251b56212d99ec1ae32fcc77218cb2  dist/waypoint-development/manifest.json'));
 for(const command of ['npm run test:source','npm run test:packaged-server','npm run test:browser','npm run test:waypoint-export','npm run test:waypoint-export-bundled','node --test tests/insert-track-point.test.cjs','node --test tests/fuel-disabled.test.cjs'])assert.ok(w.includes(command));
 assert.ok(!/secrets\.|environment:|wrangler deploy|workflow_dispatch/.test(w));
});
