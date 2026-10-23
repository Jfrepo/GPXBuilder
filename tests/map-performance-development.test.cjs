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
