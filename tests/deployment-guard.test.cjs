// Execute the exact inline preflight with fake read-only APIs. No credentials,
// network calls, deployments, or real database writes occur in this test suite.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const path=require('node:path');
const root=path.join(__dirname,'..');
const workflow=fs.readFileSync(path.join(root,'.github/workflows/cloudflare-dev.yml'),'utf8');
const code=workflow.match(/\/\/ BEGIN PINNED DEVELOPMENT GUARD\n([\s\S]*?)\s*\/\/ END PINNED DEVELOPMENT GUARD/)[1];
const id='11111111-2222-3333-4444-555555555555';
const ownerA='a'.repeat(24),ownerB='b'.repeat(24);
const production='6ada726b-aae6-441b-a698-69dc0789c7b7';
async function execute(options={}){
  const calls=[],writes=[],errors=[],logs=[];
  const files=Object.fromEntries(['.assetsignore','wrangler.dev.toml','worker-delete-durable-fix.js','worker-request-cadence.js','worker-owner-qualification.js','worker-private-library-sync.js','worker-shared-library-cloud.js','worker-waypoint-zoom.js'].map(file=>[file,fs.readFileSync(path.join(root,file))]));
  // The real manual workflow checks out immutable 583badd5, not PR HEAD.
  // These fixtures preserve exact reviewed bytes even if later PR source changes.
  files['worker-delete-durable-fix.js']=fs.readFileSync(path.join(__dirname,'fixtures/reviewed-live-reconciliation-ecc77699.txt'));
  assert.equal(crypto.createHash('sha256').update(files['worker-delete-durable-fix.js']).digest('hex'),'f4f308b02da20ecad956b6d8e588f21fdf2aa128af25e9a978b2eb6570bd42bd');
  files['worker-request-cadence.js']=fs.readFileSync(path.join(__dirname,'fixtures/reviewed-cadence-helper-fde3864c.txt'));
  assert.equal(crypto.createHash('sha256').update(files['worker-request-cadence.js']).digest('hex'),'66679a8340c33f53b85dfc27823c461cb720e900c5c5c2c08ac453346438f53e');
  files['worker-owner-qualification.js']=fs.readFileSync(path.join(__dirname,'fixtures/reviewed-owner-entry-fe10024e.txt'));
  assert.equal(crypto.createHash('sha256').update(files['worker-owner-qualification.js']).digest('hex'),'8c1f2f39458a71cc155b96c5a2ace2abf0b638e2c0b2ece5613d43410d89ebd5');
  files['worker-private-library-sync.js']=fs.readFileSync(path.join(__dirname,'fixtures/reviewed-private-ack-ecc77699.txt'));
  assert.equal(crypto.createHash('sha256').update(files['worker-private-library-sync.js']).digest('hex'),'e56eba2c67972294678442f8822d7818e5d907d67668b47c92a3c9f4cec95191');
  files['worker-shared-library-cloud.js']=fs.readFileSync(path.join(__dirname,'fixtures/reviewed-shared-ack-ecc77699.txt'));
  assert.equal(crypto.createHash('sha256').update(files['worker-shared-library-cloud.js']).digest('hex'),'8239c8d8b9bff0298c7195747c1fc4aaedf8a60996ab8ac7023c971e4d6ee449');
  files['worker-waypoint-zoom.js']=fs.readFileSync(path.join(__dirname,'fixtures/reviewed-selection-highlight-583badd5.txt'));
  assert.equal(crypto.createHash('sha256').update(files['worker-waypoint-zoom.js']).digest('hex'),'5edbb603b7454d521a55b26a55b5bf39e6c78a9111625d93b80fa9dd4805d40d');
  if(options.deployedNoteRuntime)files['worker-delete-durable-fix.js']=fs.readFileSync(path.join(__dirname,'fixtures/reviewed-note-runtime-bffa68b7.txt'));
  if(options.deployedAccountRuntime)files['worker-delete-durable-fix.js']=fs.readFileSync(path.join(__dirname,'fixtures/reviewed-account-runtime-91af34b.txt'));
  if(options.previousRuntime)files['worker-delete-durable-fix.js']=fs.readFileSync(path.join(__dirname,'fixtures/reviewed-delete-runtime-3d7a43b.txt'));
  if(options.oldRuntime)files['worker-delete-durable-fix.js']=fs.readFileSync(path.join(__dirname,'fixtures/deployed-delete-runtime-63dc68e.txt'));
  if(options.deployedCadenceRuntime)files['worker-delete-durable-fix.js']=fs.readFileSync(path.join(__dirname,'fixtures/reviewed-cadence-runtime-fde3864c.txt'));
  if(options.changedFile)files[options.changedFile]=Buffer.concat([files[options.changedFile],Buffer.from('\nchanged')]);
  if(options.missingFile)delete files[options.missingFile];
  const process={env:{CF_TOKEN:'fixture-token-not-a-credential',CF_ACCOUNT:'a'.repeat(32),DEV_DB:id,QUAL_OWNER_A:ownerA,QUAL_OWNER_B:ownerB,...options.env},exitCode:0};
  const sandbox={process,AbortSignal,console:{log(message){logs.push(message);},error(message){errors.push(message);}},require(module){
    if(module==='node:crypto')return crypto;
    assert.equal(module,'node:fs');return {readFileSync(file,encoding){assert.ok(Object.hasOwn(files,file));return encoding?files[file].toString(encoding):files[file];},writeFileSync(file,text){writes.push({file,text});}};
  },async fetch(url,init){
    calls.push({url,init});assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Bearer fixture-token-not-a-credential');
    if(options.rejectNetwork)throw new Error('do-not-log-fixture-secret');
    const database=url.includes('/d1/database/');
    const result=database?(options.database||{uuid:id,name:'mancardo-private-library-dev'}):(options.settings||{bindings:[{type:'d1',name:'PRIVATE_LIBRARY_DB',database_id:id}]});
    return {ok:!options.httpFailure,status:options.httpFailure||200,async json(){if(options.invalidJson)throw new SyntaxError('Fixture invalid JSON');return {success:options.apiFailure?false:true,result};}};
  }};
  await vm.runInNewContext(code,sandbox);
  return {calls,writes,errors,logs,exitCode:process.exitCode};
}

test('manual candidate route is exact-branch/event gated with fixed checkout and Development-only deploy',()=>{
  const manual=workflow.slice(workflow.indexOf('  deploy-reviewed-candidate:'));
  assert.match(manual,/if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/chatgpt\/mancardo-delete-qualification'/);
  assert.match(manual,/ref: '583badd5be6c760c8824b4ebec1a92f515a35742'/);
  assert.match(manual,/test "\$\(git rev-parse HEAD\)" = '583badd5be6c760c8824b4ebec1a92f515a35742'/);
  const sourceCommand=manual.match(/node --test ([^\n]+)/)[1];
  assert.equal(sourceCommand,'tests/release-safety.test.cjs tests/generated-html.test.cjs tests/delete-client.test.cjs tests/deployment-guard.test.cjs tests/delete-cross-client-node.test.cjs tests/remote-tombstone-review.test.cjs tests/server-owner-isolation.test.cjs tests/note-account-boundary.test.cjs tests/request-volume-client.test.cjs tests/owner-qualification-server.test.cjs tests/owner-qualification-client.test.cjs tests/d1-mutation-ack.test.cjs tests/live-pull-review.test.cjs tests/shared-mutation-ack.test.cjs tests/workflow-boundaries.test.cjs');
  assert.match(manual,/environment: development/);assert.match(manual,/persist-credentials: false/);
  assert.match(manual,/spawnSync\('npx',\['--yes','wrangler@4\.151\.1','deploy','--config','wrangler\.dev\.toml','--name','mancardo-dev-test'\]/);
  assert.equal((manual.match(/QUAL_OWNER_A: \$\{\{ secrets\.MANCARDO_QUALIFICATION_ACCOUNT_A \}\}/g)||[]).length,2);
  assert.equal((manual.match(/QUAL_OWNER_B: \$\{\{ secrets\.MANCARDO_QUALIFICATION_ACCOUNT_B \}\}/g)||[]).length,2);
  assert.doesNotMatch(manual,/upload-artifact|--var|secrets put|secrets bulk|set -x/);
  assert.doesNotMatch(manual,/continue-on-error|d1 execute|migrations apply|workflow_run|pull_request_target/);
  assert.match(workflow,/branches: \[mancardo-dev, 'release\/accelerated-stability-20261016'\]/);
});

test('approved existing database UUID/name and existing Worker binding permit only local config injection',async()=>{
  const r=await execute();assert.equal(r.exitCode,0);assert.equal(r.errors.length,0);assert.equal(r.calls.length,2);assert.equal(r.writes.length,1);
  assert.equal(r.calls[0].url,'https://api.cloudflare.com/client/v4/accounts/'+'a'.repeat(32)+'/d1/database/'+id);
  assert.equal(r.calls[1].url,'https://api.cloudflare.com/client/v4/accounts/'+'a'.repeat(32)+'/workers/scripts/mancardo-dev-test/settings');
  assert.equal(r.writes[0].file,'wrangler.dev.toml');assert.ok(r.writes[0].text.includes('database_id = "'+id+'"'));
  assert.ok(!r.writes[0].text.includes(production));
  const original=fs.readFileSync(path.join(root,'wrangler.dev.toml'),'utf8');
  const expected=original.replace('DEV_DATABASE_ID_REQUIRED',id)
    .replace('main = "worker-delete-durable-fix.js"','main = "worker-owner-qualification.js"')
    .replace('[vars]','[vars]\nMANCARDO_QUALIFICATION_RUN = "owner-isolation-20261018-1032"\nMANCARDO_QUALIFICATION_ACCOUNT_A = "'+ownerA+'"\nMANCARDO_QUALIFICATION_ACCOUNT_B = "'+ownerB+'"');
  assert.equal(r.writes[0].text,expected,'no other config setting or binding may change');
  for(const value of [ownerA,ownerB,id,'fixture-token-not-a-credential'])assert.ok(![...r.logs,...r.errors].join('\n').includes(value));
});

test('missing credentials, invalid IDs and Production UUID in either case stop before API access',async()=>{
  for(const env of [{CF_TOKEN:''},{CF_ACCOUNT:'bad'},{DEV_DB:''},{DEV_DB:'not-a-uuid'},{DEV_DB:production},{DEV_DB:production.toUpperCase()}]){
    const r=await execute({env});assert.equal(r.exitCode,1);assert.equal(r.calls.length,0);assert.equal(r.writes.length,0);
  }
});

test('changed pinned configuration, wrapper or helper stops before API access',async()=>{
  for(const changedFile of ['.assetsignore','wrangler.dev.toml','worker-delete-durable-fix.js','worker-request-cadence.js','worker-owner-qualification.js','worker-private-library-sync.js','worker-shared-library-cloud.js','worker-waypoint-zoom.js']){const r=await execute({changedFile});assert.equal(r.exitCode,1);assert.equal(r.calls.length,0);assert.equal(r.writes.length,0);}
});

test('wrong or missing API database UUID/name fails closed without changing config',async()=>{
  for(const database of [{uuid:id,name:'mancardo-private-library'},{uuid:production,name:'mancardo-private-library-dev'},{name:'mancardo-private-library-dev'},{uuid:id}]){
    const r=await execute({database});assert.equal(r.exitCode,1);assert.equal(r.calls.length,1);assert.equal(r.writes.length,0);
  }
});

test('network, HTTP, API and malformed JSON errors fail closed without changing config',async()=>{
  for(const options of [{rejectNetwork:true},{httpFailure:403},{apiFailure:true},{invalidJson:true}]){const r=await execute(options);assert.equal(r.exitCode,1);assert.equal(r.writes.length,0);assert.ok(r.errors.every(message=>!message.includes('do-not-log-fixture-secret')&&!message.includes('fixture-token-not-a-credential')));}
});

test('missing, duplicate, Production or mismatched current Worker bindings fail closed',async()=>{
  const binding={type:'d1',name:'PRIVATE_LIBRARY_DB',database_id:id};
  for(const bindings of [undefined,[],[binding,binding],[{...binding,database_id:production}],[{...binding,name:'OTHER'}],[{...binding,id:production}]]){
    const r=await execute({settings:{bindings}});assert.equal(r.exitCode,1);assert.equal(r.calls.length,2);assert.equal(r.writes.length,0);
  }
});

test('legacy binding id is accepted only when it identifies the same verified Development database',async()=>{
  const r=await execute({settings:{bindings:[{type:'d1',name:'PRIVATE_LIBRARY_DB',id}]}});assert.equal(r.exitCode,0);assert.equal(r.writes.length,1);
});

test('old deployed runtime is rejected by the newly approved reviewed-runtime guard',async()=>{
  const r=await execute({oldRuntime:true});assert.equal(r.exitCode,1);assert.equal(r.calls.length,0);assert.equal(r.writes.length,0);
});

test('previous note-unbound deployed runtime cannot pass the new immutable guard',async()=>{
  const r=await execute({previousRuntime:true});assert.equal(r.exitCode,1);assert.equal(r.calls.length,0);assert.equal(r.writes.length,0);
});


test('missing pinned helper or other source stops before API access and config writes',async()=>{
  for(const missingFile of ['.assetsignore','worker-request-cadence.js','worker-delete-durable-fix.js','worker-owner-qualification.js','worker-private-library-sync.js','worker-shared-library-cloud.js','worker-waypoint-zoom.js','wrangler.dev.toml']){
    const r=await execute({missingFile});assert.equal(r.exitCode,1);assert.equal(r.calls.length,0);assert.equal(r.writes.length,0);assert.equal(r.errors.length,1);
  }
});

test('previous account-bound runtime cannot pass the reviewed note-preservation guard',async()=>{
  const r=await execute({deployedAccountRuntime:true});assert.equal(r.exitCode,1);assert.equal(r.calls.length,0);assert.equal(r.writes.length,0);
});

test('deployed note-lossy cadence runtime cannot pass the new reviewed note-preservation guard',async()=>{
  const r=await execute({deployedCadenceRuntime:true});assert.equal(r.exitCode,1);assert.equal(r.calls.length,0);assert.equal(r.writes.length,0);
});


test('currently deployed fe100 wrapper cannot pass the reviewed late-edit guard',async()=>{
  const r=await execute({deployedNoteRuntime:true});assert.equal(r.exitCode,1);assert.equal(r.calls.length,0);assert.equal(r.writes.length,0);
});

test('private owner bindings must be present, exact lowercase 24-hex, and distinct before any API access',async()=>{
  for(const env of [{QUAL_OWNER_A:''},{QUAL_OWNER_B:''},{QUAL_OWNER_A:'a'.repeat(23)},{QUAL_OWNER_B:'b'.repeat(25)},{QUAL_OWNER_A:ownerA.toUpperCase()},{QUAL_OWNER_B:'not-an-account-binding'},{QUAL_OWNER_B:ownerA},{QUAL_OWNER_A:'private-invalid-value\n[vars]'}]){
    const r=await execute({env});assert.equal(r.exitCode,1);assert.equal(r.calls.length,0);assert.equal(r.writes.length,0);assert.equal(r.errors.length,1);
    for(const value of Object.values(env).filter(Boolean))assert.ok(![...r.logs,...r.errors].join('\n').includes(value));
  }
});

const deployCode=workflow.match(/\/\/ BEGIN PRIVATE DEPLOY OUTPUT GUARD\n([\s\S]*?)\s*\/\/ END PRIVATE DEPLOY OUTPUT GUARD/)[1];
function executeDeploy(options={}){
  const calls=[],logs=[];
  const process={env:{QUAL_OWNER_A:ownerA,QUAL_OWNER_B:ownerB,CLOUDFLARE_API_TOKEN:'fixture-token-not-a-credential',CLOUDFLARE_ACCOUNT_ID:'c'.repeat(32),DEV_DB:id,...options.env},exitCode:0,
    stdout:{write(value){logs.push(value);}},stderr:{write(value){logs.push(value);}}};
  vm.runInNewContext(deployCode,{process,console:{error(message){logs.push(message);}},require(name){
    assert.equal(name,'node:child_process');return {spawnSync(command,args,settings){
      calls.push({command,args:Array.from(args),settings});
      if(options.throwError)throw new Error('secret '+ownerA+' fixture-token-not-a-credential');
      return options.result||{status:0,stdout:'Deployed fixture version',stderr:''};
    }};
  }});
  return {calls,logs,exitCode:process.exitCode};
}

test('private deployment output wrapper executes only the exact pinned command with piped output and no shell',()=>{
  const r=executeDeploy();assert.equal(r.exitCode,0);assert.equal(r.calls.length,1);
  assert.equal(r.calls[0].command,'npx');assert.deepEqual(r.calls[0].args,['--yes','wrangler@4.151.1','deploy','--config','wrangler.dev.toml','--name','mancardo-dev-test']);
  assert.deepEqual(Array.from(r.calls[0].settings.stdio),['ignore','pipe','pipe']);
  assert.equal(r.calls[0].settings.encoding,'utf8');assert.equal(r.calls[0].settings.shell,undefined);assert.equal(r.calls[0].settings.maxBuffer,8*1024*1024);
  assert.ok(r.logs.join('').includes('Deployed fixture version'));
});

test('buffered deployment stdout and stderr redact private values even when subprocess chunks split them',()=>{
  const token='fixture-token-not-a-credential',account='c'.repeat(32);
  // spawnSync returns the concatenated stream after encoding; chunk boundaries
  // do not reach the sanitizer and cannot expose a partial streaming secret.
  const chunks=['Owners: '+ownerA.slice(0,7),ownerA.slice(7)+' / '+ownerB+'; token '+token.slice(0,8),token.slice(8)+' account '+account+' database '+id];
  const r=executeDeploy({result:{status:0,stdout:chunks.join(''),stderr:chunks.join('')}});
  const output=r.logs.join('');for(const value of [ownerA,ownerB,token,account,id])assert.ok(!output.includes(value));
  assert.ok(output.includes('[REDACTED]'));assert.equal(r.exitCode,0);
});

test('deployment failure status is preserved and uncertain subprocess failures never leak raw error text',()=>{
  const r=executeDeploy({result:{status:17,stdout:ownerA,stderr:ownerB}});assert.equal(r.exitCode,17);assert.ok(r.logs.every(log=>!log.includes(ownerA)&&!log.includes(ownerB)));
  for(const options of [{throwError:true},{result:{status:null,error:new Error(ownerA),stdout:ownerB.slice(0,13),stderr:'fixture-token-not-'}},{result:{status:null,signal:'SIGTERM',stdout:'',stderr:''}}]){
    const x=executeDeploy(options);assert.equal(x.exitCode,1);const text=x.logs.join('');assert.match(text,/completion is uncertain/);for(const value of [ownerA,ownerB,ownerB.slice(0,13),'fixture-token-not-'])assert.ok(!text.includes(value));
  }
});

test('deployment output wrapper rejects absent or invalid private bindings without spawning any command',()=>{
  for(const env of [{QUAL_OWNER_A:''},{QUAL_OWNER_B:''},{QUAL_OWNER_A:'invalid-private-identifier'},{QUAL_OWNER_B:ownerA}]){
    const r=executeDeploy({env});assert.equal(r.exitCode,1);assert.equal(r.calls.length,0);assert.match(r.logs.join(''),/No deployment was attempted/);
    for(const value of Object.values(env).filter(Boolean))assert.ok(!r.logs.join('').includes(value));
  }
});


test('selection rendering dependency is explicitly attested and fails closed before identity reads or config writes',async()=>{
  assert.match(code,/'worker-waypoint-zoom\.js':'5edbb603b7454d521a55b26a55b5bf39e6c78a9111625d93b80fa9dd4805d40d'/);
  for(const options of [{changedFile:'worker-waypoint-zoom.js'},{missingFile:'worker-waypoint-zoom.js'}]){
    const r=await execute(options);assert.equal(r.exitCode,1);assert.equal(r.calls.length,0);assert.equal(r.writes.length,0);assert.equal(r.errors.length,1);
  }
});
