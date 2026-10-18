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
const production='6ada726b-aae6-441b-a698-69dc0789c7b7';
async function execute(options={}){
  const calls=[],writes=[],errors=[];
  const files=Object.fromEntries(['wrangler.dev.toml','worker-delete-durable-fix.js'].map(file=>[file,fs.readFileSync(path.join(root,file))]));
  // The real manual workflow checks out immutable 3d7a43b, not PR HEAD.
  files['worker-delete-durable-fix.js']=fs.readFileSync(path.join(__dirname,'fixtures/reviewed-delete-runtime-3d7a43b.txt'));
  assert.equal(crypto.createHash('sha256').update(files['worker-delete-durable-fix.js']).digest('hex'),'3ea53546d9222af9a61d152d6c7a1827917b9d1938f8da3afeaecd07a41499f8');
  if(options.currentRuntime)files['worker-delete-durable-fix.js']=fs.readFileSync(path.join(root,'worker-delete-durable-fix.js'));
  if(options.oldRuntime)files['worker-delete-durable-fix.js']=fs.readFileSync(path.join(__dirname,'fixtures/deployed-delete-runtime-63dc68e.txt'));
  if(options.changedFile)files[options.changedFile]=Buffer.concat([files[options.changedFile],Buffer.from('\nchanged')]);
  const process={env:{CF_TOKEN:'fixture-token-not-a-credential',CF_ACCOUNT:'a'.repeat(32),DEV_DB:id,...options.env},exitCode:0};
  const sandbox={process,AbortSignal,console:{log(){},error(message){errors.push(message);}},require(module){
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
  return {calls,writes,errors,exitCode:process.exitCode};
}

test('manual candidate route is exact-branch/event gated with fixed checkout and Development-only deploy',()=>{
  const manual=workflow.slice(workflow.indexOf('  deploy-reviewed-candidate:'));
  assert.match(manual,/if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/chatgpt\/mancardo-delete-qualification'/);
  assert.match(manual,/ref: '3d7a43b23b6ddc12a96074425c0e87c2c4c76685'/);
  assert.match(manual,/test "\$\(git rev-parse HEAD\)" = '3d7a43b23b6ddc12a96074425c0e87c2c4c76685'/);
  assert.match(manual,/environment: development/);assert.match(manual,/persist-credentials: false/);
  assert.match(manual,/npx --yes wrangler@4\.151\.1 deploy --config wrangler\.dev\.toml --name mancardo-dev-test/);
  assert.doesNotMatch(manual,/continue-on-error|d1 execute|migrations apply|workflow_run|pull_request_target/);
  assert.match(workflow,/branches: \[mancardo-dev, 'release\/accelerated-stability-20261016'\]/);
});

test('approved existing database UUID/name and existing Worker binding permit only local config injection',async()=>{
  const r=await execute();assert.equal(r.exitCode,0);assert.equal(r.errors.length,0);assert.equal(r.calls.length,2);assert.equal(r.writes.length,1);
  assert.equal(r.calls[0].url,'https://api.cloudflare.com/client/v4/accounts/'+'a'.repeat(32)+'/d1/database/'+id);
  assert.equal(r.calls[1].url,'https://api.cloudflare.com/client/v4/accounts/'+'a'.repeat(32)+'/workers/scripts/mancardo-dev-test/settings');
  assert.equal(r.writes[0].file,'wrangler.dev.toml');assert.ok(r.writes[0].text.includes('database_id = "'+id+'"'));
  assert.ok(!r.writes[0].text.includes(production));
});

test('missing credentials, invalid IDs and Production UUID in either case stop before API access',async()=>{
  for(const env of [{CF_TOKEN:''},{CF_ACCOUNT:'bad'},{DEV_DB:''},{DEV_DB:'not-a-uuid'},{DEV_DB:production},{DEV_DB:production.toUpperCase()}]){
    const r=await execute({env});assert.equal(r.exitCode,1);assert.equal(r.calls.length,0);assert.equal(r.writes.length,0);
  }
});

test('changed pinned configuration or runtime stops before API access',async()=>{
  for(const changedFile of ['wrangler.dev.toml','worker-delete-durable-fix.js']){const r=await execute({changedFile});assert.equal(r.exitCode,1);assert.equal(r.calls.length,0);assert.equal(r.writes.length,0);}
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

test('current unapproved account-boundary runtime cannot pass the immutable deployment guard',async()=>{
  const r=await execute({currentRuntime:true});assert.equal(r.exitCode,1);assert.equal(r.calls.length,0);assert.equal(r.writes.length,0);
});
