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
test('manual staging pins only the exact Cancel candidate and never deploys preparation via push',()=>{
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/cloudflare-dev.yml'),'utf8');
 assert.ok(workflow.includes("ref: 351c826a62304049cf52577dd7aa6a3f51533fb2"));
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
 const diagnostic=workflow.split('  diagnose-performance:')[1];
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
test('Cancel preparation pins the qualified runtime and manifest in both stage and diagnose checkouts',()=>{
 assert.equal(PIN,'351c826a62304049cf52577dd7aa6a3f51533fb2');
 assert.equal(MANIFEST,'b18fd5afdd78caa779e8d559ba05b6cb7a670878b7b5648f4853707ddce1a8f5');
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/cloudflare-dev.yml'),'utf8');
 assert.equal(workflow.split('ref: '+PIN).length-1,2);
});
test('delivered Cancel check rejects missing, changed or unbounded source and missing control',()=>{
 const core='// ---------- cancellable editor sessions ----------\nfunction cancelTrackEdit(){return true;}\n';
 const source=core+'// ---------- history ----------';
 const html='<button id="cancelChangeBtn">Cancel</button>'+core;
 assert.doesNotThrow(()=>validateCancelHtml(html,source));
 for(const pair of [[html.replace('return true','return false'),source],[core,source],[html,'unrecognized source'],[html,core]])assert.throws(()=>validateCancelHtml(...pair));
});
test('Cancel acceptance augments existing synthetic and real Google checks without resetting success on late failure',()=>{
 const controller=fs.readFileSync(path.join(__dirname,'../scripts/release-map-performance-development.cjs'),'utf8');
 assert.ok(controller.includes("'tests/waypoint-display.test.cjs','tests/map-performance.test.cjs','tests/cancel-edit.test.cjs'"));
 assert.ok(controller.includes("WAYPOINT_ARTIFACT_DIR:'',MANCARDO_PERF_ROOT:root"));
 assert.ok(controller.includes("['scripts/check-map-performance-development.cjs']"));
 assert.ok(controller.indexOf('evidence.deploymentVerified=true')<controller.indexOf('validateCancelHtml(html,'));
 assert.ok(controller.indexOf('evidence.cancelAcceptancePassed=true')<controller.indexOf('validateBrowserEvidence(evidence.realGoogle)'));
 assert.ok(controller.indexOf('validateBrowserEvidence(evidence.realGoogle)')<controller.indexOf('evidence.acceptancePassed=true'));
 assert.ok(controller.includes('Development version is deployed; no automatic retry or rollback.'));
});
