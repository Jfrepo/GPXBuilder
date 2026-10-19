// Exact emitted live-row helper with platform adapters exposing final-await
// boundaries. Full-client/browser qualification is separate, not inferred here.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {pathToFileURL}=require('node:url');
const {createHash,webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..'),clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
let helper,hashHelper;
test.before(async()=>{
 const worker=(await import(pathToFileURL(path.join(root,'worker-delete-durable-fix.js')).href)).default;
 const html=await (await worker.fetch(new Request('https://fixture.test/'),{ASSETS:{fetch:async()=>new Response(fs.readFileSync(path.join(root,'index.html'),'utf8'),{headers:{'content-type':'text/html'}})}},{})).text();
 const start=html.indexOf('var liveReconciliationDeferred=false;'),end=html.indexOf('function mergeCloud(items)',start);assert.ok(start>=0&&end>start);helper=html.slice(start,end);
 const hs=html.indexOf('function revisionHashes(snapshot){'),he=html.indexOf('function authorisedDelete(',hs);assert.ok(hs>=0&&he>hs);hashHelper=html.slice(hs,he);
});
function fixture(options={}){
 const original={id:'one',name:'Original',note:'Keep original note',visible:true,segments:[[{lat:0,lon:0},{lat:.001,lon:.001}]]};
 const remote={...clone(original),name:'New cloud name'};
 const state={library:options.absent?[]:[clone(original)],currentId:null,current:null};
 let meta={id:'one',accountKey:'A',revision:1,sha256:sha(original),deleted:false},reads=0,blocked=false;
 const copies=[],replacements=[],writes=[];
 const context={state,ready:true,accountKey:'A',crypto:webcrypto,TextEncoder,Uint8Array,window:{},
  localById:id=>state.library.find(t=>t.id===id)||null,
  getSyncMeta:async()=>{reads++;await options.onRead?.(reads,api);return clone(meta);},
  async hashTrack(value){return Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))).toString('hex');},
  async putSyncMeta(id,value){writes.push(clone(value));meta={...clone(value),id,accountKey:context.accountKey};},
  preserveConflictCopy(value){copies.push(clone(value));},
  replaceLocal(id,value){replacements.push(clone(value));state.library=[clone(value)];if(state.currentId===id)state.current=clone(value);},
  applyCloudTombstone(){throw new Error('Unexpected tombstone path');},
 };
 vm.createContext(context);vm.runInContext(hashHelper+'\n'+helper,context);
 context.window.mancardoReconciledRevisionHashes=context.revisionHashes;
 context.window.mancardoDeleteBlocksCloudItem=()=>blocked;
 const api={state,context,original,remote,copies,replacements,writes,get reads(){return reads;},get meta(){return meta;},set meta(v){meta=clone(v);},block(){blocked=true;},run:item=>context.applyCloudItem(item||{track_id:'one',revision:2,deleted:false,sha256:sha(remote),track:clone(remote)})};return api;
}
function untouched(f){assert.deepEqual(f.copies,[]);assert.deepEqual(f.replacements,[]);assert.deepEqual(f.writes,[]);}

test('unchanged live replica receives the exact newer row without a recovery duplicate',async()=>{const f=fixture();await f.run();assert.deepEqual(f.state.library,[f.remote]);assert.deepEqual(f.copies,[]);assert.equal(f.meta.revision,2);});
test('substantive unsynced content is copied verbatim before applying a newer live row',async()=>{const f=fixture();f.state.library[0].note='Unsynced note';await f.run();assert.equal(f.copies[0].note,'Unsynced note');assert.deepEqual(f.copies[0].segments,f.original.segments);assert.deepEqual(f.state.library,[f.remote]);});
test('last-awaited metadata boundary reconsiders a newly replaced local object',async()=>{const f=fixture({onRead(n,a){if(n===2)a.state.library=[{...clone(a.original),note:'Final-await note'}];}});await f.run();assert.equal(f.copies[0].note,'Final-await note');assert.equal(f.reads,4);});
test('a locally added row after an absent-row snapshot is preserved, not overwritten',async()=>{const f=fixture({absent:true,onRead(n,a){if(n===2)a.state.library=[{...clone(a.original),note:'Appeared during absent pull'}];}});await f.run();assert.equal(f.copies[0].note,'Appeared during absent pull');});
test('newer live or equal tombstone metadata prevents stale live replacement',async()=>{for(const change of [m=>({...m,revision:3}),m=>({...m,revision:2,deleted:true})]){const f=fixture({onRead(n,a){if(n===2)a.meta=change(a.meta);}});assert.equal(await f.run(),false);untouched(f);assert.deepEqual(f.state.library,[f.original]);}});
test('owner mismatch or paused readiness after either await prevents every mutation',async()=>{for(const boundary of [1,2])for(const change of [a=>a.context.accountKey='B',a=>a.context.ready=false]){const f=fixture({onRead(n,a){if(n===boundary)change(a);}});await assert.rejects(async()=>f.run(),/account changed/);untouched(f);assert.deepEqual(f.state.library,[f.original]);}});
test('foreign metadata cannot authorize replacing the current owner workspace',async()=>{const f=fixture();f.meta={...f.meta,accountKey:'B'};await assert.rejects(f.run(),/another account/);untouched(f);});
test('an editor-only content edit is retained, including one arriving at the final await',async()=>{for(const boundary of [0,2]){const f=fixture({onRead(n,a){if(n===boundary){a.state.currentId='one';a.state.current={...clone(a.original),note:'Editor note'};}}});if(boundary===0){f.state.currentId='one';f.state.current={...clone(f.original),note:'Editor note'};}assert.equal(await f.run(),false);assert.equal(f.context.liveReconciliationDeferred,true);assert.equal(f.state.current.note,'Editor note');untouched(f);}});
test('presentation-only editor differences do not permanently prevent a valid cloud pull',async()=>{const f=fixture();f.state.currentId='one';f.state.current={...clone(f.original),visible:false};await f.run();assert.deepEqual(f.state.library,[f.remote]);assert.deepEqual(f.copies,[]);});
test('a delete intent appearing after hashing blocks live replacement and metadata acknowledgment',async()=>{const f=fixture({onRead(n,a){if(n===2)a.block();}});assert.equal(await f.run(),false);untouched(f);});
test('continuously changing state defers after three inspections rather than retrying indefinitely',async()=>{const f=fixture({onRead(n,a){if(n%2===0)a.state.library[0].note='Changing '+n;}});assert.equal(await f.run(),false);assert.equal(f.reads,6);assert.equal(f.state.library[0].note,'Changing 6');untouched(f);});
test('unknown metadata preserves substantive local content rather than treating it as clean',async()=>{const f=fixture();f.meta=null;await f.run();assert.deepEqual(f.copies,[f.original]);assert.deepEqual(f.state.library,[f.remote]);});
test('malformed live revision or track identity fails before metadata access',async()=>{for(const fields of [{revision:0},{revision:1.5},{deleted:'false'},{track:{id:'other'}}]){const f=fixture();await assert.rejects(async()=>f.run({track_id:'one',revision:2,deleted:false,sha256:sha(f.remote),track:f.remote,...fields}),/Invalid/);assert.equal(f.reads,0);untouched(f);}});

test('actual live reconciliation transform rejects missing or duplicate function boundaries',async()=>{
 const base=(await import(pathToFileURL(path.join(root,'worker-autosave-stability.js')).href)).default;
 const html=await (await base.fetch(new Request('https://fixture.test/'),{ASSETS:{fetch:async()=>new Response(fs.readFileSync(path.join(root,'index.html'),'utf8'),{headers:{'content-type':'text/html'}})}},{})).text();
 const {repairRequestCadence}=await import(pathToFileURL(path.join(root,'worker-request-cadence.js')).href);
 const source=fs.readFileSync(path.join(root,'worker-delete-durable-fix.js'),'utf8').replace(/^import[^\n]+\n/gm,'').split('export default {')[0];
 const context=vm.createContext({repairRequestCadence});vm.runInContext(source,context);
 const transformed=context.injectDurableDeletion(html);assert.match(transformed,/Private account changed during live reconciliation/);
 for(const anchor of ['function applyCloudItem(item){','\n\n  function mergeCloud(items)','function resolvePutConflict(op,conflict){','\n  function resolveDeleteConflict(op,conflict){',"if(ready&&!syncing)setStatus('synced','Synced','My Library is saved locally and synced to your private cloud account.');return true;"]){
  assert.equal(html.split(anchor).length,2);
  assert.throws(()=>context.injectDurableDeletion(html.replace(anchor,'altered-boundary')),/anchor|boundary/i);
  assert.throws(()=>context.injectDurableDeletion(html.replace(anchor,anchor+anchor)),/anchor|boundary/i);
 }
});
