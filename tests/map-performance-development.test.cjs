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
test('manual staging pins only the exact performance candidate and never deploys preparation via push',()=>{
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/cloudflare-dev.yml'),'utf8');
 assert.ok(workflow.includes("ref: df14bd9da7f90a4f18e4e015269ff794985af61b"));
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
