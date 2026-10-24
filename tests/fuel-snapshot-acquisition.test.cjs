const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {acquire,normalize,QUERY,ENDPOINTS}=require('../scripts/fuel-snapshot/acquire.cjs');
const fixture=()=>({osm3s:{timestamp_osm_base:new Date().toISOString()},elements:[{type:'node',id:1,lat:-33.86,lon:151.2,tags:{amenity:'fuel',name:'Synthetic fixture'}}]});
test('validated artifact includes real-source provenance, bounded coverage and ODbL metadata',()=>{const r=normalize(fixture(),ENDPOINTS[0]);assert.equal(r.coverage.cellKey,'-68:302');assert.equal(r.schemaVersion,1);assert.equal(r.source.query,QUERY);assert.equal(r.source.license,'ODbL-1.0');assert.equal(r.stations.length,1);assert.ok(r.source.attribution.includes('OpenStreetMap'));});
test('incomplete, empty, excessive and invalid data cannot produce an artifact',()=>{
 const inputs=[{...fixture(),remark:'timeout'}, {...fixture(),elements:[]},{...fixture(),elements:Array(501).fill(fixture().elements[0])},{...fixture(),osm3s:{}},{...fixture(),osm3s:{timestamp_osm_base:'2020-01-01T00:00:00Z'}}];
 for(const e of [{type:'node',id:1,tags:{amenity:'fuel'}},{...fixture().elements[0],lat:NaN},{...fixture().elements[0],id:1.5},{...fixture().elements[0],tags:{amenity:'fuel',access:'private'}}])inputs.push({...fixture(),elements:[e]});
 for(const d of inputs)assert.throws(()=>normalize(d,ENDPOINTS[0]));assert.throws(()=>normalize(fixture(),'https://unapproved.test'));
});
test('mixed node way relation coordinates normalized with metadata stripped',()=>{const d=fixture();d.elements.push({type:'way',id:2,center:{lat:-33.86,lon:151.2},tags:{amenity:'fuel'},user:'excluded'}, {type:'relation',id:3,center:{lat:-33.85,lon:151.2},tags:{amenity:'fuel'}});const s=normalize(d,ENDPOINTS[0]);assert.equal(s.stations.length,3);assert.ok(!JSON.stringify(s).includes('excluded'));});
test('one exact request on success, no credentials, redirects or query expansion',async()=>{
 let calls=0;const r=await acquire(async(url,options)=>{calls++;assert.equal(url,ENDPOINTS[0]+'?data='+encodeURIComponent(QUERY));assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.ok(options.signal);return Response.json(fixture());});assert.equal(calls,1);assert.ok(r.snapshot);assert.equal(r.attempts[0].outcome,'validated');
});
test('failure permits only one fallback; rate limiting stops further requests',async()=>{
 let calls=0;const failed=await acquire(async()=>{calls++;throw Error('PRIVATE_ERROR_MESSAGE')});assert.equal(calls,2);assert.equal(failed.snapshot,null);assert.ok(!JSON.stringify(failed).includes('PRIVATE'));
 calls=0;const limited=await acquire(async()=>{calls++;return new Response('busy',{status:429})});assert.equal(calls,1);assert.equal(limited.snapshot,null);assert.equal(limited.attempts[0].outcome,'rate-limited');
});
test('invalid JSON and oversized body cannot become snapshot',async()=>{for(const response of [()=>new Response('{bad'),()=>new Response('x'.repeat(1000001))]){const r=await acquire(async()=>response());assert.equal(r.snapshot,null);assert.equal(r.attempts.length,2);}});
test('acquisition workflow is explicit, read-only, without deployment or credentials',()=>{
 const w=fs.readFileSync(path.join(__dirname,'../.github/workflows/cloudflare-dev.yml'),'utf8'),job=w.split('  acquire-fuel-snapshot:')[1];assert.ok(job);assert.ok(job.includes("inputs.operation == 'fuel-snapshot-acquire'"));assert.ok(job.includes("github.ref == 'refs/heads/mancardo-dev'"));assert.doesNotMatch(job,/secrets\.|wrangler|deploy |CF_TOKEN|CF_ACCESS|PRIVATE_LIBRARY_DB/);assert.ok(w.includes("- 'scripts/fuel-snapshot/**'"));assert.ok(w.includes("- 'tests/fuel-snapshot-acquisition.test.cjs'"));
 const code=fs.readFileSync(path.join(__dirname,'../scripts/fuel-snapshot/acquire.cjs'),'utf8');assert.ok(code.includes('setTimeout(()=>controller.abort(),10000)'));assert.ok(code.includes('[timeout:8]'));assert.doesNotMatch(code,/process.env.*TOKEN|method:'(?:POST|PUT|DELETE)'/);
});

test('streaming HTTP errors are cancelled and every attempt closes its abort lifetime',async()=>{
 for(const status of [429,503]){let cancelled=0;const signals=[];const r=await acquire(async(url,options)=>{signals.push(options.signal);return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1]));},cancel(){cancelled++;}}),{status});});assert.equal(cancelled,status===429?1:2);assert.ok(signals.every(s=>s.aborted));assert.equal(r.snapshot,null);}
});
