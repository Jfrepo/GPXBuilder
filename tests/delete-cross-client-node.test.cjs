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
