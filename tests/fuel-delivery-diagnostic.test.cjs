const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {compare,classify}=require('../scripts/diagnose-fuel-delivery.cjs');
const source='// Fuel data belongs to OSM\nconst cache="pinned";\n\n\nels.layerStreetsBtn.onclick';
test('exact, changed, whitespace, missing and duplicate spans remain distinguishable',()=>{
 assert.equal(compare(source,source).exact,true);
 const changed=compare(source.replace('pinned','different'),source);assert.equal(changed.exact,false);assert.equal(changed.whitespaceOnlyDifference,false);assert.ok(changed.firstDifferingByte>0);
 assert.equal(compare(source.replace('const cache','const  cache'),source).whitespaceOnlyDifference,true);
 assert.equal(compare('old application',source).startMarkers,0);
 assert.equal(compare(source+source,source).startMarkers,2);
});
test('unknown body bytes and injected secrets are not emitted, including at mismatch',()=>{
 for(const secret of ['private-user@example.test','AIza-SECRET-KEY','token=private-token','<script>private-data</script>']){
  const result=compare(source.replace('pinned',secret),source);assert.ok(!JSON.stringify(result).includes(secret));assert.ok(result.actualExcerpt.includes('withheld'));
 }
 const unicode=compare(source.replace('pinned','⛽'),source);assert.equal(unicode.exact,false);assert.ok(unicode.actualBytes>0);
});
test('redirect, login, challenge and nonapplication are not compared as source',()=>{
 assert.equal(classify(302,'text/html',source),'redirect');
 assert.equal(classify(200,'text/html','<title>Cloudflare Access</title>'),'challenge-or-login');
 assert.equal(classify(200,'text/html','<script src="/cdn-cgi/challenge-platform/x"></script>'),'challenge-or-login');
 assert.equal(classify(200,'application/json','{}'),'non-html');
 assert.equal(classify(200,'text/html','login'),'unexpected-html');
 assert.equal(classify(200,'text/html','<div id="mapDiv">'),'application');
});
test('workflow keeps diagnostic isolated from all deployment and browser jobs',()=>{
 const w=fs.readFileSync(path.join(__dirname,'../.github/workflows/cloudflare-dev.yml'),'utf8');
 assert.ok(w.includes("if: github.event_name == 'push' && (github.ref"));
 for(const operation of ['stage','diagnose','fuel-delivery'])assert.ok(w.includes("inputs.operation == '"+operation+"'"));
 const job=w.split('  diagnose-fuel-delivery:')[1];assert.ok(job);assert.doesNotMatch(job,/wrangler|npm |playwright|DEV_DB|release-map-performance-development.cjs/);
 assert.ok(w.includes("- 'scripts/diagnose-fuel-delivery.cjs'"));assert.ok(w.includes("- 'tests/fuel-delivery-diagnostic.test.cjs'"));
 const code=fs.readFileSync(path.join(__dirname,'../scripts/diagnose-fuel-delivery.cjs'),'utf8');
 assert.doesNotMatch(code,/method:\s*'(POST|PUT|PATCH|DELETE)'|spawnSync|console\./);assert.ok(code.includes("method:'GET',redirect:'manual'"));assert.ok(code.includes("verify(await api('/deployments'))"));
});
test('mocked network uses only four bounded GETs; changed version and redirect fail safely',async t=>{
 const os=require('node:os'),cp=require('node:child_process');
 const {diagnose,VERSION,DEPLOYMENT}=require('../scripts/diagnose-fuel-delivery.cjs');
 const {PIN,MANIFEST}=require('../scripts/release-map-performance-development.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fuel-diagnostic-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 t.mock.method(cp,'execFileSync',()=>PIN);fs.writeFileSync(path.join(dir,'index.html'),source);
 const env={CF_TOKEN:'secret-token',CF_ACCOUNT:'a'.repeat(32),CF_ACCESS_CLIENT_ID:'secret-id',CF_ACCESS_CLIENT_SECRET:'secret-access',CANDIDATE_ROOT:dir,EVIDENCE_PATH:path.join(dir,'out.json')};
 for(const mode of ['success','redirect','changed-before','changed-after','network-error','oversized']){
  const requests=[];let reads=0;process.exitCode=0;
  const result=await diagnose(env,async(url,options)=>{
   requests.push(url);assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');assert.ok(options.signal);
   if(url.endsWith('/deployments')){reads++;return Response.json({success:true,result:{deployments:[{id:(mode==='changed-before'||mode==='changed-after'&&reads===2)?'different':DEPLOYMENT,versions:[{version_id:VERSION,percentage:100}]}]}});}
   if(url.includes('/versions/'))return Response.json({success:true,result:{annotations:{'workers/message':PIN+' '+MANIFEST,'workers/tag':'fuel-cancel-6ac8fb56f3b7'}}});
   assert.equal(url,'https://mancardo-dev-test.jayfenno.workers.dev/');
   if(mode==='network-error')throw Error('secret-token secret-access');
   if(mode==='redirect')return new Response('secret-account',{status:302,headers:{location:'https://login.example/private'}});
   return new Response(mode==='oversized'?'x'.repeat(2000001):'<div id="mapDiv">'+source,{headers:{'content-type':'text/html'}});
  });
  const output=fs.readFileSync(env.EVIDENCE_PATH,'utf8');for(const secret of ['secret-token','secret-id','secret-access','secret-account','login.example'])assert.ok(!output.includes(secret));
  if(mode==='success'){assert.equal(requests.length,4);assert.equal(result.fuel.exact,true);assert.equal(result.versionUnchanged,true);}
  if(mode==='redirect'){assert.equal(result.responseKind,'redirect');assert.equal(result.fuel,undefined);assert.equal(requests.length,4);}
  if(mode.startsWith('changed')){assert.equal(result.error,'DEPLOYMENT_CHANGED');assert.equal(result.versionUnchanged,undefined);if(mode==='changed-before')assert.equal(requests.length,1);}
  if(mode==='network-error')assert.equal(result.error,'DIAGNOSTIC_FAILED');
  if(mode==='oversized')assert.equal(result.error,'RESPONSE_TOO_LARGE');
 }
 process.exitCode=0;
});
