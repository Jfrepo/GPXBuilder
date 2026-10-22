const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {identity,inspectTarget,verify,template}=require('../scripts/development-release.cjs');
const {digest}=require('../scripts/build-production.cjs');
const root=path.resolve(__dirname,'..');
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const env={GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/proposal/editor-integrity-20261022',GITHUB_SHA:sha,RELEASE_SHA:sha,RELEASE_MANIFEST:'b'.repeat(64),DEV_MANIFEST:'c'.repeat(64)};
test('Development route requires manual exact proposal source and both package identities',()=>{
 identity(env);
 for(const [k,v]of [['GITHUB_EVENT_NAME','push'],['GITHUB_REF','refs/heads/main'],['RELEASE_SHA','a'.repeat(40)],['GITHUB_SHA','a'.repeat(40)],['RELEASE_MANIFEST',''],['DEV_MANIFEST','']])assert.throws(()=>identity({...env,[k]:v}));
});
const dev='11111111-2222-3333-aaaa-555555555555';
const targetEnv={CLOUDFLARE_API_TOKEN:'synthetic-token',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),DEV_DB:dev};
function bindings(){return [{type:'d1',name:'PRIVATE_LIBRARY_DB',id:dev},{type:'assets',name:'ASSETS'},...['CF_ACCESS_TEAM_DOMAIN','CF_ACCESS_AUD'].map(name=>({type:'plain_text',name,text:template().match(new RegExp('^'+name+' = "([^"\\n]+)"$','m'))[1]}))];}
function fetchMock(modify=()=>{}){return async(url,options)=>{assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.match(url,/\/(d1\/database\/[a-f0-9-]+|workers\/scripts\/mancardo-dev-test\/settings)$/);let result=url.includes('/d1/')?{uuid:dev,name:'mancardo-private-library-dev'}:{bindings:bindings()};modify(result);return {ok:true,json:async()=>({success:true,result})};};}
test('read-only target guard verifies existing isolated database, Worker, assets and unchanged authentication',async()=>{assert.equal(await inspectTarget(targetEnv,fetchMock()),dev);});
test('target guard refuses Production, mismatched database/bindings and authentication without writes',async()=>{
 for(const id of ['6ada726b-aae6-441b-a698-69dc0789c7b7','6ADA726B-AAE6-441B-A698-69DC0789C7B7','bad'])await assert.rejects(inspectTarget({...targetEnv,DEV_DB:id},()=>assert.fail('must fail before network')));
 for(const mutate of [r=>{if(r.uuid)r.name='other';},r=>{if(r.bindings)r.bindings[0].id='other';},r=>{if(r.bindings)r.bindings.push(r.bindings[0]);},r=>{if(r.bindings)r.bindings[2].text='other';},r=>{if(r.bindings)r.bindings=r.bindings.filter(b=>b.type!=='assets');}])await assert.rejects(inspectTarget(targetEnv,fetchMock(mutate)));
 await assert.rejects(inspectTarget(targetEnv,async()=>{throw Error('secret');}),/Read-only Development identity request failed/);
});
test('Development artifact rejects source tampering, extra assets and target drift',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mancardo-dev-guard-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));fs.mkdirSync(path.join(directory,'assets'));
 const contents={'worker-delete-durable-fix.js':'export default {};','assets/index.html':'<p>synthetic</p>','wrangler.toml':template()};
 const prod=Object.fromEntries(Object.entries({...contents,'wrangler.toml':'synthetic Production config'}).map(([f,c])=>[f,digest(c)]));
 contents['production-manifest.json']=JSON.stringify(prod);
 function reset(){for(const [f,c]of Object.entries(contents))fs.writeFileSync(path.join(directory,f),c);const manifest=JSON.stringify(Object.fromEntries(Object.entries(contents).map(([f,c])=>[f,digest(c)])));fs.writeFileSync(path.join(directory,'manifest.json'),manifest);return digest(manifest);}
 const runtime=digest(contents['production-manifest.json']),approved=reset();verify(approved,runtime,directory);
 fs.appendFileSync(path.join(directory,'assets/index.html'),'tamper');assert.throws(()=>verify(approved,runtime,directory));reset();
 fs.writeFileSync(path.join(directory,'assets/test-harness.html'),'extra');assert.throws(()=>verify(approved,runtime,directory));fs.unlinkSync(path.join(directory,'assets/test-harness.html'));
 fs.appendFileSync(path.join(directory,'wrangler.toml'),'changed');assert.throws(()=>verify(approved,runtime,directory));reset();
 assert.throws(()=>verify(approved,'d'.repeat(64),directory));
});
test('recovery workflow qualifies every suite without secrets and deploys only downloaded tested artifact',()=>{
 const workflow=fs.readFileSync(path.join(root,'.github/workflows/cloudflare-dev.yml'),'utf8');
 const qualify=workflow.split('\n  qualify-recovery:')[1].split('\n  deploy-recovery:')[0],deploy=workflow.split('\n  deploy-recovery:')[1];
 for(const job of [qualify,deploy]){assert.match(job,/if: github.event_name == 'workflow_dispatch' && github.ref == 'refs\/heads\/proposal\/editor-integrity-20261022'/);assert.match(job,/runs-on: ubuntu-24.04/);assert.match(job,/ref: \$\{\{ github.sha \}\}/);assert.match(job,/persist-credentials: false/);}
 assert.doesNotMatch(qualify,/secrets\.|environment:/);
 for(const suite of ['source','packaged-server','browser'])assert.ok(qualify.includes('node scripts/check-production.cjs '+suite));
 assert.match(qualify,/playwright install --with-deps chromium/);assert.match(qualify,/development-release.cjs prepare/);assert.match(qualify,/actions\/upload-artifact@v4/);
 assert.match(deploy,/needs: qualify-recovery/);assert.match(deploy,/environment: development/);assert.match(deploy,/actions\/download-artifact@v4/);assert.doesNotMatch(deploy,/build-production|check-production|prepare/);
 assert.match(deploy,/development-release.cjs deploy/);
 const checks=fs.readFileSync(path.join(root,'scripts/check-production.cjs'),'utf8');for(const name of ['overnight-integrity','editor-recovery','development-release'])assert.ok(checks.includes("'"+name+"'"));
 assert.match(workflow,/permissions:\n  contents: read/);assert.match(workflow,/group: mancardo-dev\n  cancel-in-progress: false/);
});
