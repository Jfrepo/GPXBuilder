const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {checksum,download,NAME,URL,EXPECTED_BYTES,MAX_BYTES}=require('../scripts/fuel-snapshot/geofabrik.cjs');
test('dated official source and strict checksum filename and size bounds',()=>{assert.equal(NAME,'new-south-wales-261023.osm.pbf');assert.ok(URL.startsWith('https://download.geofabrik.de/'));assert.equal(EXPECTED_BYTES,269807440);assert.equal(MAX_BYTES,300000000);assert.equal(checksum('a'.repeat(32)+'  '+NAME),'a'.repeat(32));for(const bad of ['bad','a'.repeat(32)+'  other.pbf'])assert.throws(()=>checksum(bad));});
test('checksum rejection stops before extract and cancels error body',async t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gf-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let calls=0,cancelled=0;await assert.rejects(download(dir,async(url,o)=>{calls++;assert.equal(url,URL+'.md5');assert.equal(o.redirect,'error');assert.equal(o.method,'GET');return new Response(new ReadableStream({cancel(){cancelled++}}),{status:403});}),/CHECKSUM_HTTP_ERROR/);assert.equal(calls,1);assert.equal(cancelled,1);assert.deepEqual(fs.readdirSync(dir),[]);});
test('checksum body and declared extract bytes are bounded before writing',async t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gf-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));await assert.rejects(download(dir,async()=>new Response('x'.repeat(1025))),/CHECKSUM_SIZE/);let calls=0;await assert.rejects(download(dir,async()=>++calls===1?new Response('a'.repeat(32)+'  '+NAME):new Response('x',{headers:{'content-length':'300000001'}})),/EXTRACT_SIZE/);assert.equal(calls,2);assert.deepEqual(fs.readdirSync(dir),[]);});
test('Geofabrik operation has no Overpass, account, secret or deployment access',()=>{const w=fs.readFileSync(path.join(__dirname,'../.github/workflows/cloudflare-dev.yml'),'utf8'),job=w.split('  acquire-fuel-geofabrik:')[1];assert.ok(job);assert.ok(job.includes("inputs.operation == 'fuel-geofabrik-acquire'"));assert.doesNotMatch(job,/secrets\.|wrangler|CF_ACCESS|scripts\/fuel-snapshot\/acquire.cjs/);assert.ok(w.includes("- 'tests/fuel-geofabrik-*'"));const code=fs.readFileSync(path.join(__dirname,'../scripts/fuel-snapshot/geofabrik.cjs'),'utf8');assert.doesNotMatch(code,/overpass-api|overpass.kumi|method:'(?:POST|PUT|DELETE)'/);});
test('subprocess diagnostics distinguish deadline, resource signal and validation exit without raw output',()=>{
 const {processingResult}=require('../scripts/fuel-snapshot/geofabrik.cjs');
 assert.deepEqual(processingResult({error:{code:'ETIMEDOUT',message:'secret'},signal:'SIGTERM',status:null,stderr:'private'},300003),{elapsedMs:300003,exitStatus:null,signal:'SIGTERM',errorCode:'ETIMEDOUT'});
 assert.equal(processingResult({signal:'SIGKILL',status:null},25).signal,'SIGKILL');
 assert.deepEqual(processingResult({status:1,stderr:'arbitrary station payload'},15),{elapsedMs:15,exitStatus:1,signal:null,errorCode:null});
 assert.equal(processingResult({error:{code:'sensitive'}},1).errorCode,'PROCESS_SPAWN_ERROR');
});
test('actual Python child deadline and failure are retained without stderr',t=>{
 const {runProcessor}=require('../scripts/fuel-snapshot/geofabrik.cjs'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'gf-child-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const script=path.join(dir,'child.py');
 fs.writeFileSync(script,'import time\ntime.sleep(2)\n');assert.throws(()=>runProcessor('unused','unused',dir,{script,timeout:100}),/PROCESSING_FAILED/);
 let result=JSON.parse(fs.readFileSync(path.join(dir,'processing-result.json')));assert.equal(result.errorCode,'ETIMEDOUT');assert.equal(result.signal,'SIGTERM');
 fs.writeFileSync(script,'import sys\nprint("untrusted secret", file=sys.stderr)\nsys.exit(1)\n');assert.throws(()=>runProcessor('unused','unused',dir,{script}),/PROCESSING_FAILED/);
 result=JSON.parse(fs.readFileSync(path.join(dir,'processing-result.json')));assert.equal(result.exitStatus,1);assert.equal(result.errorCode,null);assert.doesNotMatch(JSON.stringify(result),/untrusted|secret/);
});
