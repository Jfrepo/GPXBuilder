// Executes the exact complete cloud-sync and durable-delete IIFEs emitted by
// the Development Worker. Per-client async IndexedDB/DOM adapters and a shared
// synthetic API replace platform I/O, not application synchronization logic.
// This is not a substitute for delete-cross-client.test.cjs full-editor Chromium.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {pathToFileURL}=require('node:url');
const {webcrypto,createHash}=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const LIB='switchback_local_tracks_v1',PENDING='mancardo_authorized_delete_pending_v4';
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const track=()=>({id:'fixture-one',type:'track',name:'Synthetic cross-client route',visible:true,segments:[[{lat:1,lon:2},{lat:1.001,lon:2.001}]],createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'});
let cloudClient,deleteClient;
test.before(async()=>{
  const worker=(await import(pathToFileURL(process.env.MANCARDO_DELETE_TEST_ENTRY||path.join(ROOT,'worker-delete-durable-fix.js')).href)).default;
  const html=await (await worker.fetch(new Request('https://fixture.test/'),{ASSETS:{fetch:async()=>new Response(fs.readFileSync(path.join(ROOT,'index.html'),'utf8'),{headers:{'content-type':'text/html'}})},PRIVATE_LIBRARY_DB:{prepare(){throw new Error('No actual D1 access');}}},{})).text();
  function emittedIife(marker){const begin=html.indexOf(marker),end=html.indexOf('\n})();',begin)+7;assert.ok(begin>=0&&end>begin,marker);return html.slice(begin,end);}
  cloudClient=emittedIife('(function installMancardoPrivateCloudSync(){');
  deleteClient=emittedIife('// ---------- Durable, revision-pinned explicit My Library deletion ----------');
});
function element(){return {dataset:{},classList:{add(){},remove(){},contains(){return false;}},appendChild(){},insertBefore(){},querySelector(){return null;},addEventListener(){}};}
function fakeIndexedDB(stores,onCommit=()=>{}){return {open(){const req={};setImmediate(()=>{req.result={close(){},transaction(names,mode){const tx={pending:0,closed:false};function complete(){if(tx.pending||tx.closed)return;tx.closed=true;tx.oncomplete?.();if(!tx.error)onCommit(names,mode);}tx.objectStore=name=>{const store=stores[name];if(!store)throw new Error('Unknown object store '+name);const request=operation=>{const result={};tx.pending++;setImmediate(()=>{try{result.result=clone(operation());result.onsuccess?.();}catch(error){result.error=error;result.onerror?.();tx.error=error;tx.onerror?.();}finally{tx.pending--;setImmediate(complete);}});return result;};return {get:key=>request(()=>store.get(key)),getAll:()=>request(()=>[...store.values()]),put:value=>request(()=>{store.set(value.key,clone(value));return value.key;}),delete:key=>request(()=>store.delete(key))};};setImmediate(complete);return tx;}};req.onsuccess?.();});return req;}};}

async function fixture(){
  const initial=track();
  const model={rows:new Map([[initial.id,{track_id:initial.id,revision:1,sha256:hash(initial),deleted:false,track:clone(initial),device_id:'fixture-origin',updated_at:1}]]),requests:[],healthRequests:[],onPull:null};
  async function client(device,options={}){
    const baseline=clone(initial),local=clone(options.local||baseline);
    const stores={meta:new Map([['boundAccountKey',{key:'boundAccountKey',value:'A'}]]),sync:new Map([['A|'+initial.id,{key:'A|'+initial.id,id:initial.id,accountKey:'A',revision:1,sha256:hash(baseline),deleted:false}]]),outbox:new Map()};
    const storage=new Map([[LIB,JSON.stringify([local])],[PENDING,'[]'],['mancardo_private_device_id_v1',device]]);
    const elements=new Map(),handlers={},timers=[],warnings=[],outboxCommitWaiters=[];let nextHashGate=null,id=0,healthAccount='A';
    function committed(names,mode){if(mode!=='readwrite'||![].concat(names).includes('outbox'))return;for(const waiter of [...outboxCommitWaiters]){const value=stores.outbox.get(waiter.key);if(value){outboxCommitWaiters.splice(outboxCommitWaiters.indexOf(waiter),1);waiter.resolve(clone(value));}}}
    const document={visibilityState:'visible',body:element(),createElement:element,querySelector:()=>element(),getElementById(name){if(!elements.has(name))elements.set(name,element());return elements.get(name);},addEventListener(){}};
    const context={state:{library:[local],currentId:null,current:null},els:{},confirmTimers:{},document,navigator:{onLine:true},Event,TextEncoder,Uint8Array,console:{warn(...args){warnings.push(args.map(String).join(' '));}},
      localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))},indexedDB:fakeIndexedDB(stores,committed),
      crypto:{subtle:{async digest(algorithm,data){const gate=nextHashGate;nextHashGate=null;const result=await webcrypto.subtle.digest(algorithm,data);if(gate){gate.entered.resolve();await gate.release.promise;}return result;}}},
      uid:()=>device+'-copy-'+(++id),deepClone:clone,render(){},renderLibrary(){},persistLibrary(){storage.set(LIB,JSON.stringify(context.state.library));},
      setTimeout(fn,delay){timers.push({fn,delay});return timers.length;},clearTimeout(){},setInterval(){},
      addEventListener(name,fn){(handlers[name]??=[]).push(fn);},dispatchEvent(event){for(const fn of handlers[event.type]||[])fn(event);},
      async fetch(url,opts={}){
        await tick();const parsed=new URL(url,'https://fixture.test'),method=opts.method||'GET';
        if(parsed.pathname.endsWith('/health')){model.healthRequests.push({device,account:healthAccount});return Response.json({authenticated:true,authConfigured:true,storageReady:true,accountKey:healthAccount,accountLabel:'Synthetic account'});}
        if(parsed.pathname==='/api/private-library/tracks'){
          const items=clone([...model.rows.values()]);model.requests.push({device,method,path:parsed.pathname});
          if(model.onPull)await model.onPull(device);
          return Response.json({items,has_more:false});
        }
        const recordId=decodeURIComponent(parsed.pathname.split('/').pop()),row=model.rows.get(recordId),body=opts.body?JSON.parse(opts.body):null;
        model.requests.push({device,method,id:recordId,body});
        if(method==='GET'){const responseRow=clone(row);if(model.onGet)await model.onGet(device,recordId);return Response.json(responseRow||{error:'missing'},{status:responseRow?200:404});}
        if(method==='DELETE')assert.equal(opts.headers['x-mancardo-delete-account'],'A');
        if(body.base_revision!==(row?.revision||0))return Response.json({code:'revision_conflict',current:row?{revision:row.revision,...(model.omitConflictDeleted?{}:{deleted:row.deleted}),content_sha256:row.sha256,updated_at:row.updated_at}:null},{status:409});
        const next={track_id:recordId,revision:(row?.revision||0)+1,sha256:method==='PUT'?hash(body.track):(row?.sha256||''),deleted:method==='DELETE',track:method==='PUT'?clone(body.track):null,device_id:body.device_id,updated_at:Date.now()};model.rows.set(recordId,next);return Response.json(next);
      }};
    context.window=context;vm.createContext(context);vm.runInContext(cloudClient,context);vm.runInContext(deleteClient,context);for(let i=0;i<5;i++)await tick();
    return {context,stores,storage,timers,warnings,device,
      recoveryMessage:()=>elements.get('mancardoPrivateSyncConflicts').title,
      message:()=>elements.get('mancardoPrivateSyncMessage').textContent,
      waitForOutboxCommit(key){const done=defer();outboxCommitWaiters.push({key,resolve:done.resolve});return done.promise;},
      setHealthAccount(account){healthAccount=account;},
      sync:()=>elements.get('mancardoPrivateSyncNow').onclick(),remove:()=>context.mancardoAuthorizedDelete([initial.id]),
      tracks:()=>clone(context.state.library),
      pauseNextHash(){const gate={entered:defer(),release:defer()};nextHashGate=gate;return gate;},
      edit(fields){Object.assign(context.state.library.find(t=>t.id===initial.id),fields);context.persistLibrary();},
      async rehydrateLibrary(){context.state.library=JSON.parse(storage.get(LIB));},
    };
  }
  return {initial,model,client,live:()=>clone([...model.rows.values()].filter(row=>!row.deleted))};
}

async function setupPair(){const f=await fixture();f.a=await f.client('device-a');f.b=await f.client('device-b');assert.equal(await f.a.sync(),true);assert.equal(await f.b.sync(),true);assert.equal(f.model.requests.filter(x=>x.method==='PUT').length,0);assert.equal(await f.a.remove(),true);assert.equal(f.model.rows.get(f.initial.id).deleted,true);return f;}

test('complete emitted cloud client applies another device tombstone without inventing a clean conflict copy',{timeout:10000},async()=>{
  const f=await setupPair();assert.deepEqual(JSON.parse(f.b.storage.get(PENDING)),[]);
  assert.equal(await f.b.sync(),true);
  assert.deepEqual(f.live(),[],'Clean receiver must not upload a new Recovery snapshot before cloud delete record');
  assert.deepEqual(f.b.tracks(),[]);await f.a.sync();assert.deepEqual(f.a.tracks(),[]);
  await f.b.rehydrateLibrary();await f.b.sync();assert.deepEqual(f.b.tracks(),[]);
});

test('complete emitted cloud client preserves a substantive unsynced edit against remote deletion',{timeout:10000},async()=>{
  const f=await setupPair();f.b.edit({name:'Unique unsynced rename'});await f.b.sync();
  const live=f.live();assert.equal(live.length,1);assert.notEqual(live[0].track_id,f.initial.id);assert.match(live[0].track.name,/Unique unsynced rename/);assert.deepEqual(live[0].track.segments,f.initial.segments);assert.equal(f.model.rows.get(f.initial.id).deleted,true);
});

async function queueOfflineNote(f,b,note){
  b.context.navigator.onLine=false;b.edit({note});
  const scan=[...b.timers].reverse().find(t=>t.delay===1200);
  assert.ok(scan,'Actual note persistence must schedule the cloud queue scan');
  // Subscribe before scheduling; WebCrypto completion is not bounded by a
  // fixed number of event-loop turns. Observe the actual durable transaction.
  const committed=b.waitForOutboxCommit('A|'+f.initial.id);scan.fn();
  const op=await committed;
  assert.ok(op,'Actual emitted scan must persist the offline edit');
  assert.equal(op.track.note,note);assert.equal(op.baseRevision,1);assert.equal(op.accountKey,'A');
  assert.equal(op.localHash,hash(op.track));assert.notEqual(op.localHash,hash(f.initial));
  assert.equal(f.model.rows.get(f.initial.id).revision,1);
  return op;
}

for(const remote of ['tombstone','newer live revision'])test('queued unsynced note survives '+remote+' in local and uploaded recovery copies',{timeout:10000},async()=>{
  const f=await fixture(),a=await f.client('device-a'),b=await f.client('device-b');
  assert.equal(await a.sync(),true);assert.equal(await b.sync(),true);
  const note='Keep this unsynced private note';
  if(remote==='tombstone'){
    const gate=b.pauseNextHash();let settled=false;const queued=queueOfflineNote(f,b,note).finally(()=>{settled=true;});
    await gate.entered.promise;for(let i=0;i<150;i++)await tick();
    assert.equal(settled,false,'Queue readiness must wait for the real transaction, not expire after 100 turns');
    assert.equal(b.stores.outbox.size,0);gate.release.resolve();await queued;
  }else await queueOfflineNote(f,b,note);
  if(remote==='tombstone')assert.equal(await a.remove(),true);
  else{a.edit({name:'Newer cloud rename'});assert.equal(await a.sync(),true);}
  const authoritative=clone(f.model.rows.get(f.initial.id));assert.equal(authoritative.revision,2);
  b.context.navigator.onLine=true;assert.equal(await b.sync(),true);
  const copies=f.live().filter(r=>r.track_id!==f.initial.id),local=b.tracks().filter(r=>r.id!==f.initial.id);
  assert.equal(copies.length,1);assert.equal(local.length,1);assert.equal(copies[0].track.note,note);assert.equal(local[0].note,note);
  assert.deepEqual(copies[0].track.segments,f.initial.segments);assert.deepEqual(local,[copies[0].track]);
  assert.deepEqual(f.model.rows.get(f.initial.id),authoritative,'Recovery must not rewrite the original cloud record');
  assert.equal(copies[0].track.name,f.initial.name+' (conflict copy)');assert.equal(copies[0].track.draft,true);
  assert.match(b.recoveryMessage(),remote==='tombstone'?/Recovery snapshot before cloud delete/:/Recovered from cross-device conflict/);
  assert.deepEqual(f.model.requests.filter(r=>r.device==='device-b'&&r.method==='PUT').map(r=>[r.id,r.body.base_revision]),[[f.initial.id,1],[copies[0].track_id,0]],'One rejected old-base PUT and one fresh-ID recovery upload only');
  await b.rehydrateLibrary();await b.sync();assert.equal(b.tracks().find(t=>t.id===copies[0].track_id).note,note);
  assert.equal(f.live().filter(r=>r.track_id!==f.initial.id).length,1);
});

test('a note changed during pending tombstone hashing is preserved verbatim',{timeout:10000},async()=>{
  const f=await setupPair();let gate;
  f.model.onPull=async device=>{if(device==='device-b'){f.model.onPull=null;gate=f.b.pauseNextHash();}};
  const syncing=f.b.sync();while(!gate)await tick();await gate.entered.promise;
  const note='Note changed during reconciliation';f.b.edit({note});gate.release.resolve();await syncing;
  const live=f.live();assert.equal(live.length,1);assert.equal(live[0].track.note,note);
  assert.equal(f.b.tracks()[0].note,note);assert.deepEqual(live[0].track.segments,f.initial.segments);
  assert.equal(f.model.rows.get(f.initial.id).deleted,true);
});

test('a replacement local note arriving during live-conflict GET is the version recovered',{timeout:10000},async()=>{
  const f=await fixture(),a=await f.client('device-a'),b=await f.client('device-b');
  await a.sync();await b.sync();await queueOfflineNote(f,b,'First unsynced note');
  a.edit({name:'Newer authoritative rename'});await a.sync();const authoritative=clone(f.model.rows.get(f.initial.id));
  const entered=defer(),release=defer();f.model.onGet=async(device,id)=>{if(device==='device-b'&&id===f.initial.id){f.model.onGet=null;entered.resolve();await release.promise;}};
  b.context.navigator.onLine=true;const syncing=b.sync();await entered.promise;
  const latest='Latest note saved during conflict GET';
  b.context.state.library=b.context.state.library.map(t=>t.id===f.initial.id?{...clone(t),note:latest}:t);b.context.persistLibrary();
  release.resolve();await syncing;
  const copies=f.live().filter(r=>r.track_id!==f.initial.id);assert.equal(copies.length,1);assert.equal(copies[0].track.note,latest);
  assert.equal(b.tracks().find(t=>t.id===copies[0].track_id).note,latest);assert.deepEqual(copies[0].track.segments,f.initial.segments);
  assert.deepEqual(f.model.rows.get(f.initial.id),authoritative);
});

test('visibility-only receiver state must not create a conflict copy through the stale PUT path',{timeout:10000},async()=>{
  const f=await setupPair();f.b.edit({visible:false});await f.b.sync();
  assert.deepEqual(f.live(),[],'Presentation-only state cannot resurrect a deliberately deleted track under a new ID');assert.deepEqual(f.b.tracks(),[]);
});

test('edit while real WebCrypto digest is pending is preserved before applying a tombstone',{timeout:10000},async()=>{
  const f=await setupPair();let gate;
  f.model.onPull=async device=>{if(device==='device-b'){f.model.onPull=null;gate=f.b.pauseNextHash();}};
  const syncing=f.b.sync();while(!gate)await tick();await gate.entered.promise;
  f.b.edit({name:'Edit arrived during tombstone hash'});gate.release.resolve();await syncing;
  const live=f.live();assert.equal(live.length,1);assert.match(live[0].track.name,/Edit arrived during tombstone hash/);assert.equal(f.model.rows.get(f.initial.id).deleted,true);
});

for(const omitDeleted of [false,true])test('same-hash stale PUT against tombstone resolves deletion, not live success (deleted field '+(omitDeleted?'missing':'present')+')',{timeout:10000},async()=>{
  const f=await setupPair();f.model.omitConflictDeleted=omitDeleted;
  f.b.stores.sync.get('A|'+f.initial.id).sha256='unreconciled-fixture-metadata';
  let beforePull;
  f.model.onPull=async device=>{if(device==='device-b')beforePull=clone(f.b.stores.sync.get('A|'+f.initial.id));};
  await f.b.sync();
  assert.equal(beforePull.deleted,true,'A retained tombstone hash is not proof that PUT succeeded');
  assert.equal(beforePull.revision,2);
  assert.equal(f.model.rows.get(f.initial.id).deleted,true);
  assert.ok(f.model.requests.some(r=>r.device==='device-b'&&r.method==='GET'&&r.id===f.initial.id),'Ambiguous/deleted conflict must fetch the authoritative record');
});

for(const revision of [2,3])test('older/equal tombstone never removes known live revision '+revision,{timeout:10000},async()=>{
  const f=await setupPair();f.b.stores.sync.get('A|'+f.initial.id).revision=revision;
  await f.b.sync();assert.equal(f.b.tracks().length,1);assert.equal(f.b.tracks()[0].id,f.initial.id);
  assert.equal(f.b.stores.sync.get('A|'+f.initial.id).deleted,false);
  assert.equal(f.model.requests.filter(r=>r.device==='device-b'&&r.method==='PUT').length,0);
});

test('newer live metadata arriving during tombstone hashing prevents stale local removal',{timeout:10000},async()=>{
  const f=await setupPair();let gate;
  f.model.onPull=async device=>{if(device==='device-b'){f.model.onPull=null;gate=f.b.pauseNextHash();}};
  const syncing=f.b.sync();while(!gate)await tick();await gate.entered.promise;
  f.b.stores.sync.get('A|'+f.initial.id).revision=3;gate.release.resolve();await syncing;
  assert.equal(f.b.tracks()[0].id,f.initial.id);assert.equal(f.b.stores.sync.get('A|'+f.initial.id).revision,3);assert.equal(f.b.stores.sync.get('A|'+f.initial.id).deleted,false);
});

test('editor-only geometry changes are retained when the library replica is unchanged',{timeout:10000},async()=>{
  const f=await setupPair();f.b.context.state.currentId=f.initial.id;f.b.context.state.current=clone(f.initial);
  f.b.context.state.current.segments[0].push({lat:1.002,lon:2.002});
  await f.b.sync();assert.equal(f.b.context.state.current?.segments[0].length,3,'Tombstone must not silently discard unpersisted editor geometry');
  assert.equal(f.model.rows.get(f.initial.id).deleted,true,'Unpersisted editor state must not recreate the original ID');
});

test('a second sync joins held tombstone reconciliation before a later account change can pause the workspace',{timeout:10000},async()=>{
  const f=await setupPair();let gate;
  f.model.onPull=async device=>{if(device==='device-b'){f.model.onPull=null;gate=f.b.pauseNextHash();}};
  const syncing=f.b.sync();while(!gate)await tick();await gate.entered.promise;
  const healthCount=f.model.healthRequests.length;
  f.b.setHealthAccount('B');const joined=f.b.sync();let settled=false;joined.then(()=>{settled=true;});
  for(let i=0;i<8;i++)await tick();
  assert.equal(joined,syncing,'The second caller must join the complete cycle, not run competing health/bind work');
  assert.equal(settled,false);assert.equal(f.model.healthRequests.length,healthCount);
  assert.equal(f.b.tracks()[0].id,f.initial.id,'Held reconciliation has not discarded local content');
  gate.release.resolve();await joined;
  assert.deepEqual(f.b.tracks(),[],'The already-authorized clean A tombstone completes before another health check');
  assert.equal(f.b.stores.sync.get('A|'+f.initial.id).revision,2);
  assert.equal(f.b.stores.sync.get('A|'+f.initial.id).deleted,true);
  const before=clone([...f.b.stores.sync]);
  assert.equal(await f.b.sync(),false,'A subsequent B health must pause the A-bound workspace');
  assert.deepEqual([...f.b.stores.sync],before);
  assert.equal(f.b.stores.meta.get('boundAccountKey').value,'A');
  assert.equal(f.b.stores.sync.has('B|'+f.initial.id),false);
  assert.equal(f.model.requests.filter(r=>r.device==='device-b'&&r.method==='PUT').length,0);
});

test('lost initial PUT acknowledgment reconciles a matching live GET without a duplicate recovery copy',{timeout:10000},async()=>{
  const f=await fixture(),b=await f.client('device-b');
  // The server committed revision 1 but this browser never stored that ACK.
  b.stores.sync.delete('A|'+f.initial.id);f.model.omitConflictDeleted=true;
  await b.sync();
  assert.equal(f.live().length,1,'A verified matching LIVE row is the original successful PUT, not a conflict');
  assert.deepEqual(b.tracks(),[f.initial]);
  assert.equal(b.stores.sync.get('A|'+f.initial.id).revision,1);assert.equal(b.stores.sync.get('A|'+f.initial.id).deleted,false);
  assert.deepEqual(f.model.requests.filter(r=>r.method==='PUT').map(r=>[r.id,r.body.base_revision]),[[f.initial.id,0]],'No fresh-ID recovery upload is warranted');
  assert.ok(f.model.requests.some(r=>r.method==='GET'&&r.id===f.initial.id),'A conflict missing deleted must be verified by GET');
});

test('newer local edit during lost-ACK live GET is uploaded on the original ID without a recovery duplicate',{timeout:10000},async()=>{
  const f=await fixture(),b=await f.client('device-b');
  b.stores.sync.delete('A|'+f.initial.id);f.model.omitConflictDeleted=true;
  const entered=defer(),release=defer();
  f.model.onGet=async(device,id)=>{if(device==='device-b'&&id===f.initial.id){f.model.onGet=null;entered.resolve();await release.promise;}};
  const syncing=b.sync();await entered.promise;
  b.edit({name:'New edit while verifying lost initial ACK'});release.resolve();await syncing;
  const live=f.live();assert.equal(live.length,1,'Late edit must not become an avoidable duplicate');
  assert.equal(live[0].track_id,f.initial.id);assert.equal(live[0].revision,2);assert.equal(live[0].track.name,'New edit while verifying lost initial ACK');
  assert.equal(b.tracks().length,1);assert.equal(b.tracks()[0].name,'New edit while verifying lost initial ACK');
  assert.deepEqual(f.model.requests.filter(r=>r.method==='PUT').map(r=>[r.id,r.body.base_revision]),[[f.initial.id,0],[f.initial.id,1]]);
});

for(const immutable of [false,true])test('a late '+(immutable?'replacement':'in-place')+' note survives an ordinary live pull hash await',{timeout:10000},async()=>{
  const f=await fixture(),a=await f.client('device-a'),b=await f.client('device-b');
  await a.sync();await b.sync();a.edit({name:'New authoritative cloud name'});await a.sync();
  const authoritative=clone(f.model.rows.get(f.initial.id));assert.equal(authoritative.revision,2);
  let gate;const entered=defer();
  f.model.onPull=async device=>{if(device==='device-b'){f.model.onPull=null;gate=b.pauseNextHash();entered.resolve();}};
  const syncing=b.sync();await entered.promise;await gate.entered.promise;
  const note='Latest note during ordinary live pull';
  if(immutable){b.context.state.library=b.context.state.library.map(t=>t.id===f.initial.id?{...clone(t),note}:t);b.context.persistLibrary();}
  else b.edit({note});
  gate.release.resolve();await syncing;
  const copies=f.live().filter(r=>r.track_id!==f.initial.id);assert.equal(copies.length,1);
  assert.equal(copies[0].track.note,note);assert.equal(b.tracks().find(t=>t.id===copies[0].track_id).note,note);
  assert.deepEqual(copies[0].track.segments,f.initial.segments);assert.equal(copies[0].track.name,f.initial.name+' (conflict copy)');
  assert.deepEqual(f.model.rows.get(f.initial.id),authoritative,'Newer original cloud row must not be overwritten');
  assert.deepEqual(f.model.requests.filter(r=>r.device==='device-b'&&r.method==='PUT').map(r=>[r.id,r.body.base_revision]),[[copies[0].track_id,0]],'Only the preserved fresh-ID copy is uploaded');
  await b.rehydrateLibrary();await b.sync();assert.equal(f.live().filter(r=>r.track_id!==f.initial.id).length,1);
  assert.equal(b.tracks().find(t=>t.id===copies[0].track_id).note,note);
});

test('ordinary live pull defers rather than clearing an editor-only late note',{timeout:10000},async()=>{
  const f=await fixture(),a=await f.client('device-a'),b=await f.client('device-b');
  await a.sync();await b.sync();a.edit({name:'New authoritative cloud name'});await a.sync();
  const authoritative=clone(f.model.rows.get(f.initial.id));
  b.context.state.currentId=f.initial.id;b.context.state.current=clone(f.initial);
  let gate;const entered=defer();
  f.model.onPull=async device=>{if(device==='device-b'){f.model.onPull=null;gate=b.pauseNextHash();entered.resolve();}};
  const syncing=b.sync();await entered.promise;await gate.entered.promise;
  b.context.state.current.note='Unsaved editor-only note';
  gate.release.resolve();assert.equal(await syncing,false,'A deferred editor is not a completed sync');
  assert.match(b.message(),/preserved but has not yet been reconciled/);
  assert.equal(b.context.state.current.note,'Unsaved editor-only note');
  assert.deepEqual(b.tracks(),[f.initial],'Library must not be replaced behind an unsaved editor clone');
  assert.deepEqual(f.model.rows.get(f.initial.id),authoritative);assert.equal(f.live().length,1);
  assert.equal(f.model.requests.filter(r=>r.device==='device-b'&&r.method==='PUT').length,0);
  assert.equal(b.stores.sync.get('A|'+f.initial.id).revision,1,'Deferred cloud revision is not falsely acknowledged');
});


for(const when of ['before','during'])test('live PUT-conflict GET preserves an editor-only note arriving '+when+' the await',{timeout:10000},async()=>{
  const f=await fixture(),a=await f.client('device-a'),b=await f.client('device-b');await a.sync();await b.sync();
  a.edit({name:'Authoritative newer name'});await a.sync();const authoritative=clone(f.model.rows.get(f.initial.id));
  b.edit({note:'Persisted library note'});
  const entered=defer(),release=defer();f.model.onGet=async(device,id)=>{if(device==='device-b'&&id===f.initial.id){f.model.onGet=null;entered.resolve();await release.promise;}};
  const note='Newest unsaved editor note';
  function editEditor(){b.context.state.currentId=f.initial.id;b.context.state.current={...clone(b.tracks()[0]),note};}
  if(when==='before')editEditor();const syncing=b.sync();await entered.promise;if(when==='during')editEditor();
  release.resolve();assert.equal(await syncing,false,'Unreconciled editor must not claim completed sync');
  assert.equal(b.context.state.current.note,note);assert.equal(b.tracks()[0].note,'Persisted library note');
  assert.deepEqual(f.model.rows.get(f.initial.id),authoritative);assert.equal(f.live().length,1);
  const pending=b.stores.outbox.get('A|'+f.initial.id);assert.equal(pending.accountKey,'A');assert.equal(pending.baseRevision,1);assert.equal(pending.track.note,'Persisted library note');
  assert.equal(b.stores.sync.get('A|'+f.initial.id).revision,1);
  assert.deepEqual(f.model.requests.filter(r=>r.device==='device-b'&&r.method==='PUT').map(r=>[r.id,r.body.base_revision]),[[f.initial.id,1],[f.initial.id,1]],'Only two rejected old-base attempts occur in the bounded full cycle');
  // Model explicit editor save/reconciliation, not an automatic discard.
  b.edit({note});b.context.state.current=clone(b.tracks()[0]);assert.equal(await b.sync(),true);
  const copy=f.live().find(r=>r.track_id!==f.initial.id);assert.ok(copy);assert.equal(copy.track.note,note);assert.deepEqual(copy.track.segments,f.initial.segments);
  assert.deepEqual(f.model.rows.get(f.initial.id),authoritative);assert.equal(b.stores.outbox.size,0);
  assert.deepEqual(f.model.requests.filter(r=>r.device==='device-b'&&r.method==='PUT').map(r=>[r.id,r.body.base_revision]),[[f.initial.id,1],[f.initial.id,1],[f.initial.id,1],[copy.track_id,0]]);
  await b.rehydrateLibrary();await b.sync();assert.equal(f.live().length,2);assert.equal(b.tracks().find(t=>t.id===copy.track_id).note,note);
});

// Selection/highlight regressions execute emitted application functions verbatim.
// The DOM, Leaflet drawing sink, clock, async IndexedDB and API are synthetic;
// this does not claim full-editor Chromium or live-account qualification.
let selectionSource;
test.before(async()=>{
  const entry=process.env.MANCARDO_DELETE_TEST_ENTRY||path.join(ROOT,'worker-delete-durable-fix.js');
  const worker=(await import(pathToFileURL(entry).href)).default;
  const html=await (await worker.fetch(new Request('https://fixture.test/'),{
    ASSETS:{fetch:async()=>new Response(fs.readFileSync(path.join(ROOT,'index.html'),'utf8'),{headers:{'content-type':'text/html'}})},
    PRIVATE_LIBRARY_DB:{prepare(){throw new Error('No actual D1 access');}}
  },{})).text();
  function named(name,next){const start=html.indexOf('function '+name+'('),end=html.indexOf('\nfunction '+next+'(',start);assert.ok(start>=0&&end>start,'Exact emitted '+name);return html.slice(start,end);}
  const marker='(function installMancardoTrackClickFlash(){',start=html.indexOf(marker),end=html.indexOf('\n})();',start)+7;
  assert.ok(start>=0&&end>start,'Exact emitted row flash');
  const prelude=html.lastIndexOf('// ---------- Render-only track identification ----------',start);
  selectionSource={flash:html.slice(prelude>=0?prelude:start,end),render:named('render','getCss'),library:named('renderLibrary','loadItem'),load:named('loadItem','startNewRoute'),show:named('setTrackVisible','duplicateTrack'),note:named('saveTrackNote','copyTrack')};
});

function selectionElement(tag='div'){
  const e={tagName:tag.toUpperCase(),children:[],attrs:{},events:{},style:{},dataset:{},className:'',
    classList:{add(){},remove(){},toggle(){}},
    appendChild(child){child.parentNode=this;this.children.push(child);return child;},
    setAttribute(name,value){this.attrs[name]=String(value);},getAttribute(name){return this.attrs[name]??null;},
    addEventListener(name,fn){(this.events[name]??=[]).push(fn);},
    closest(selector){
      const classes=String(this.className).split(/\s+/);
      if(selector==='#trackList .track-item'&&classes.includes('track-item'))return this;
      if(selector.split(',').some(s=>s.trim()==='#trackList .track-show'&&classes.includes('track-show')))return this;
      if(selector.split(',').some(s=>s.trim()==='#selectAllTracks'&&this.id==='selectAllTracks'))return this;
      if(selector.split(',').some(s=>{s=s.trim();return s.startsWith('.')?classes.includes(s.slice(1)):s===tag;}))return this;
      return this.parentNode?.closest(selector)||null;
    }};
  Object.defineProperty(e,'innerHTML',{get(){return this._html||'';},set(value){this._html=value;this.children=[];}});
  return e;
}

function installSelectionAdapter(b){
  const c=b.context,events={},timers=[],layers=[],writes=[];
  for(const [name,map] of [['localStorage',b.storage],...Object.entries(b.stores)]){
    const set=map.set.bind(map),del=map.delete.bind(map);
    map.set=(key,value)=>{writes.push({store:name,op:'put',key,value:clone(value)});return set(key,value);};
    map.delete=key=>{writes.push({store:name,op:'delete',key,existed:map.has(key)});return del(key);};
  }
  c.document.createElement=selectionElement;
  c.document.addEventListener=(name,fn)=>{(events[name]??=[]).push(fn);};
  c.els.trackList=selectionElement();
  c.setTimeout=(fn,delay)=>{const timer={fn,delay,cancelled:false,fired:false};timers.push(timer);return timer;};
  c.clearTimeout=timer=>{if(timer&&typeof timer==='object')timer.cancelled=true;};
  c.trackLayerGroup={clearLayers(){layers.length=0;}};
  const layer=(kind,points,opts)=>({kind,points:clone(points),opts:clone(opts),addTo(){layers.push(this);return this;},on(){return this;}});
  c.L={polyline:(p,o)=>layer('line',p,o),circleMarker:(p,o)=>layer('point',p,o),DomEvent:{stopPropagation(){}}};
  // These adapters are presentation-only formatting / viewport / panel sinks.
  // Selection, Show, render predicates and cloud synchronization remain emitted code.
  c.defaultTrackColour=item=>item.id;c.computeStats=()=>({});c.fmtKm=String;c.fmtDate=String;
  c.updateSelectAll=()=>{};c.updateModeBanner=()=>{};c.fitToTrack=()=>{};c.refreshDock=()=>{};
  vm.runInContext([selectionSource.render,selectionSource.library,selectionSource.load,selectionSource.show,selectionSource.note,selectionSource.flash].join('\n'),c);
  function dispatch(name,target){const ev={target,stopPropagation(){this.stopped=true;}};for(const fn of events[name]||[])fn(ev);if(!ev.stopped)for(const fn of target.events?.[name]||[])fn(ev);return ev;}
  function row(id){return c.els.trackList.children.find(e=>e.getAttribute('data-track-id')===id);}
  function fire(timer,evenIfCancelled=false){assert.ok(timer,'Expected scheduled timer');assert.equal(timer.fired,false,'A timer is delivered once');timer.fired=true;if(!timer.cancelled||evenIfCancelled)timer.fn();}
  return {events,timers,layers,writes,dispatch,fire,row,
    draw:id=>layers.some(l=>l.kind==='line'&&l.opts.opacity>0&&l.opts.color===id),
    latest:delay=>timers.filter(t=>t.delay===delay&&!t.fired&&!t.cancelled).at(-1),
    select(id){c.renderLibrary();const card=row(id);assert.ok(card,'Exact emitted Library card');dispatch('click',card);fire(this.latest(30));},
    show(id,visible,{pointer=true}={}){c.renderLibrary();const input=row(id).children[0].children.find(e=>e.className==='track-show');assert.ok(input,'Exact emitted Show checkbox');if(pointer)dispatch('pointerdown',input);input.checked=visible;dispatch('click',input);dispatch('change',input);}
  };
}

async function selectionFixture(visible,withSecond=false){
  const f=await fixture();
  if(visible===undefined)delete f.initial.visible;else f.initial.visible=visible;
  const row=f.model.rows.get(f.initial.id);row.track=clone(f.initial);row.sha256=hash(f.initial);
  const b=await f.client('selection-client');
  if(withSecond){
    const second={...clone(f.initial),id:'fixture-two',name:'Independent synthetic route',visible:true};
    f.model.rows.set(second.id,{track_id:second.id,revision:1,sha256:hash(second),deleted:false,track:clone(second),device_id:'fixture-origin',updated_at:1});
    b.context.state.library.push(clone(second));b.storage.set(LIB,JSON.stringify(b.context.state.library));
    b.stores.sync.set('A|'+second.id,{key:'A|'+second.id,id:second.id,accountKey:'A',revision:1,sha256:hash(second),deleted:false});
  }
  assert.equal(await b.sync(),true);assert.equal(f.model.requests.filter(r=>r.method==='PUT').length,0);
  const ui=installSelectionAdapter(b);
  return {f,b,ui,baseline:{tracks:b.tracks(),storage:clone([...b.storage]),sync:clone([...b.stores.sync]),server:clone([...f.model.rows])}};
}
function assertSelectionUnchanged(s,{editor=true}={}){
  const {f,b,ui,baseline}=s;
  assert.deepEqual(b.tracks(),baseline.tracks,'Row identification cannot mutate any saved track field');
  if(editor)assert.deepEqual(clone(b.context.state.current),baseline.tracks[0],'Editor clone retains exact saved content');
  assert.deepEqual([...b.storage],baseline.storage,'Row identification cannot write localStorage');
  assert.deepEqual([...b.stores.sync],baseline.sync,'Saved sync revision/hash metadata stays unchanged');
  assert.deepEqual([...f.model.rows],baseline.server,'Server content/hash/revision remains unchanged');
  assert.equal(b.stores.outbox.size,0,'No pending edit is invented');
  assert.equal(ui.writes.filter(w=>w.store==='outbox'&&w.op==='put').length,0,'Not even a transient durable outbox entry is created');
  assert.equal(ui.writes.filter(w=>w.store==='localStorage').length,0,'No redundant localStorage writes');
  assert.equal(f.model.requests.filter(r=>r.method!=='GET').length,0,'No mutation HTTP request');
  assert.equal(ui.timers.filter(t=>t.delay===1200).length,0,'Selection does not schedule the persistence scan');
}

for(const [label,visible] of [['hidden',false],['shown',true],['null Show default',null],['absent Show default',undefined]])test('row highlight preserves '+label+' data through a sync inside the 750ms window and reload',{timeout:10000},async()=>{
  const s=await selectionFixture(visible),{f,b,ui}=s;
  b.context.renderLibrary();
  assertSelectionUnchanged(s,{editor:false});
  const requestsBefore=f.model.requests.length,writesBefore=ui.writes.length;
  ui.select(f.initial.id);
  assert.equal(ui.draw(f.initial.id),visible===false,'Exact emitted render temporarily inverts only drawing visibility');
  assert.equal(f.model.requests.length,requestsBefore,'A row click itself starts no sync or request');
  assert.equal(ui.writes.length,writesBefore,'A row click itself performs no durable writes');
  assert.equal(await b.sync(),true,'A complete sync runs while the highlight timer is pending');
  assert.deepEqual([...f.model.rows],s.baseline.server,'Sync inside the flash window must not upload temporary visibility or advance the server revision');
  assertSelectionUnchanged(s);
  ui.fire(ui.latest(750));
  assert.equal(ui.draw(f.initial.id),visible!==false,'Expiration restores the saved visual state');
  assert.equal(await b.sync(),true);assertSelectionUnchanged(s);
  const reloaded=await f.client('selection-reloaded',{local:JSON.parse(b.storage.get(LIB))[0]});
  const reloadedUI=installSelectionAdapter(reloaded);reloaded.context.renderLibrary();reloaded.context.render();
  assert.equal(reloadedUI.draw(f.initial.id),visible!==false,'Fresh client has no inherited flash state');
  assert.equal(await reloaded.sync(),true);
  assert.deepEqual(reloaded.tracks(),s.baseline.tracks);assert.deepEqual([...f.model.rows],s.baseline.server);
  assert.equal(f.model.requests.filter(r=>r.method!=='GET').length,0);
});

for(const visible of [false,true])test('repeated '+(visible?'shown':'hidden')+' row selection cancels stale expiry without clearing the newer flash',{timeout:10000},async()=>{
  const s=await selectionFixture(visible),{f,b,ui}=s;
  ui.select(f.initial.id);const stale=ui.latest(750);
  ui.select(f.initial.id);const current=ui.latest(750);
  assert.notEqual(current,stale);assert.equal(stale.cancelled,true,'Superseded expiration is cancelled');
  ui.fire(stale,true); // Model an already-queued callback, despite clearTimeout.
  assert.equal(ui.draw(f.initial.id),!visible,'A stale callback cannot expire the replacement flash');
  assert.equal(await b.sync(),true);assertSelectionUnchanged(s);
  ui.fire(current);assert.equal(ui.draw(f.initial.id),visible);assertSelectionUnchanged(s);
});

for(const pointer of [true,false])test('deliberate Show '+(pointer?'pointer':'keyboard-style click')+' wins over active and stale identification timers',{timeout:10000},async()=>{
  const s=await selectionFixture(false),{f,b,ui}=s;
  ui.select(f.initial.id);const stale=ui.latest(750);
  ui.show(f.initial.id,true,{pointer});
  assert.equal(stale.cancelled,true,'Explicit Show cancels the temporary highlight');
  assert.equal(b.tracks()[0].visible,true);assert.equal(b.context.state.current.visible,true);
  assert.equal(JSON.parse(b.storage.get(LIB))[0].visible,true,'Exact emitted Show persists the deliberate change');
  assert.equal(ui.draw(f.initial.id),true);
  ui.fire(stale,true);assert.equal(ui.draw(f.initial.id),true);assert.equal(b.tracks()[0].visible,true,'Stale flash must not undo Show');
  assert.equal(await b.sync(),true);
  const row=f.model.rows.get(f.initial.id);assert.equal(row.revision,2);assert.equal(row.track.visible,true);
  assert.deepEqual(row.track,{...s.baseline.tracks[0],visible:true});
  assert.equal(f.model.requests.filter(r=>r.method==='PUT').length,1,'Only the deliberate Show change uploads');
  assert.equal(b.stores.outbox.size,0);
  await b.rehydrateLibrary();assert.equal(b.tracks()[0].visible,true);assert.equal(await b.sync(),true);assert.equal(row.revision,2);
});

test('a deliberate Show click cancels an identification callback that has not begun',{timeout:10000},async()=>{
  const s=await selectionFixture(false),{f,b,ui}=s;
  b.context.renderLibrary();ui.dispatch('click',ui.row(f.initial.id));const pending=ui.latest(30);
  assert.ok(pending);ui.show(f.initial.id,true,{pointer:false});
  assert.equal(pending.cancelled,true,'Show cancels the pending row callback as well as an active flash');
  ui.fire(pending,true);assert.equal(ui.draw(f.initial.id),true,'Already-queued row callback cannot override the later Show action');
  assert.equal(ui.latest(750),undefined,'Cancelled identification cannot create a new flash window');
  assert.equal(await b.sync(),true);assert.equal(f.model.rows.get(f.initial.id).revision,2);
  assert.equal(f.model.requests.filter(r=>r.method==='PUT').length,1);
});

test('saving an unrelated note during identification serializes only durable visibility and uploads only that note',{timeout:10000},async()=>{
  const s=await selectionFixture(false,true),{f,b,ui}=s;
  ui.select(f.initial.id);const expiration=ui.latest(750);
  b.context.saveTrackNote('fixture-two','Deliberately saved other note');
  const saved=JSON.parse(b.storage.get(LIB));
  assert.deepEqual(saved[0],s.baseline.tracks[0],'A whole-library save cannot leak the transient highlight into storage');
  assert.equal(saved[1].note,'Deliberately saved other note');
  assert.deepEqual(clone(b.context.state.current),s.baseline.tracks[0],'Unrelated persistence leaves highlighted editor untouched');
  assert.equal(await b.sync(),true);
  assert.deepEqual(f.model.rows.get(f.initial.id),s.baseline.server[0][1],'Highlighted original hash/revision remains unchanged');
  assert.equal(f.model.rows.get('fixture-two').revision,2);assert.equal(f.model.rows.get('fixture-two').track.note,saved[1].note);
  assert.deepEqual(f.model.requests.filter(r=>r.method==='PUT').map(r=>r.id),['fixture-two'],'No incidental upload accompanies the legitimate save');
  assert.equal(ui.writes.some(w=>w.store==='outbox'&&w.op==='put'&&w.value.id===f.initial.id),false);
  ui.fire(expiration);assert.equal(ui.draw(f.initial.id),false);assert.deepEqual(b.tracks()[0],s.baseline.tracks[0]);
  await b.rehydrateLibrary();assert.deepEqual(b.tracks()[0],s.baseline.tracks[0]);assert.equal(b.tracks()[1].note,saved[1].note);
});

for(const removed of [false,true])test('flash expiry cannot mutate a '+(removed?'removed':'replacement')+' Library/editor object',{timeout:10000},async()=>{
  const s=await selectionFixture(false),{f,b,ui}=s;
  ui.select(f.initial.id);const expiration=ui.latest(750);
  // Synthetic external reconciliation replaces the objects, not the flash code.
  // This isolates expiry behavior without granting it any persistence capability.
  const replacement={...clone(f.initial),visible:true,name:'Newer replacement object',note:'Do not restore stale fields'};
  b.context.state.library=removed?[]:[clone(replacement)];
  b.context.state.current=removed?null:clone(replacement);b.context.state.currentId=removed?null:replacement.id;
  const before={library:b.tracks(),current:clone(b.context.state.current),writes:ui.writes.length};
  ui.fire(expiration);
  assert.deepEqual(b.tracks(),before.library,'Expiry must not restore an old saved visibility value');
  assert.deepEqual(clone(b.context.state.current),before.current);assert.equal(ui.writes.length,before.writes);
  assert.equal(ui.draw(f.initial.id),!removed,'Drawing now follows the replacement/surviving saved object');
  assert.deepEqual([...f.model.rows],s.baseline.server);assert.deepEqual([...b.storage],s.baseline.storage);
});

test('rapid selection of a different track expires only the latest flash and never persists either track',{timeout:10000},async()=>{
  const s=await selectionFixture(false,true),{f,b,ui}=s;
  ui.select(f.initial.id);const first=ui.latest(750);assert.equal(ui.draw(f.initial.id),true);
  ui.select('fixture-two');const second=ui.latest(750);
  assert.equal(first.cancelled,true);assert.equal(ui.draw(f.initial.id),false,'Old hidden track immediately returns to saved display state');
  assert.equal(ui.draw('fixture-two'),false,'New shown track temporarily flashes off');
  ui.fire(first,true);assert.equal(ui.draw('fixture-two'),false,'Older track callback cannot clear a newer highlight');
  assert.equal(await b.sync(),true);assertSelectionUnchanged(s,{editor:false});
  assert.deepEqual(clone(b.context.state.current),s.baseline.tracks[1]);
  ui.fire(second);assert.equal(ui.draw('fixture-two'),true);assertSelectionUnchanged(s,{editor:false});
});

test('backgrounding cancels the visual override without saving or syncing the selected track',{timeout:10000},async()=>{
  const s=await selectionFixture(false),{f,b,ui}=s;
  ui.select(f.initial.id);const expiration=ui.latest(750);
  b.context.document.visibilityState='hidden';ui.dispatch('visibilitychange',b.context.document);
  assert.equal(expiration.cancelled,true);assert.equal(ui.draw(f.initial.id),false);
  ui.fire(expiration,true);assert.equal(ui.draw(f.initial.id),false);assertSelectionUnchanged(s);
});

test('clicking the actual track-note wrapper never starts identification or a persistence scan',{timeout:10000},async()=>{
  const s=await selectionFixture(false),{f,b,ui}=s;
  b.context.state.noteOpenId=f.initial.id;b.context.renderLibrary();
  const note=ui.row(f.initial.id).children.find(e=>e.className==='track-note');assert.ok(note,'Exact emitted note wrapper');
  const requests=f.model.requests.length;ui.dispatch('click',note);
  assert.equal(ui.latest(30),undefined,'Note chrome is not a track identification action');
  assert.equal(ui.latest(750),undefined);assert.equal(f.model.requests.length,requests);assertSelectionUnchanged(s,{editor:false});
});
