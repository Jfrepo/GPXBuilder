// Executes the actual injected client with deterministic in-memory browser/API
// adapters. Does not substitute for the companion Chromium or live D1 tests.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto,createHash}=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../worker-delete-durable-fix.js'),'utf8');
const client=source.match(/const DURABLE_DELETE_BRIDGE = String.raw`([\s\S]*?)`;/)[1];
const KEY='mancardo_authorized_delete_pending_v4',LIB='switchback_local_tracks_v1';
const settle=()=>new Promise(resolve=>setImmediate(resolve));

async function fixture(options={}){
  const tracks=options.tracks||[{id:'one',name:'AAAAAA',visible:true},{id:'two',name:'Other',visible:true}];
  const storage=options.storage||new Map([[LIB,JSON.stringify(tracks)]]);
  if(options.pending)storage.set(KEY,JSON.stringify(options.pending));
  const meta=new Map([['boundAccountKey',{value:options.bound||'A'}]]),sync=new Map();
  for(const track of tracks)if(!options.noMeta)sync.set((options.bound||'A')+'|'+track.id,{revision:track.id==='one'?4:7,sha256:options.wrongHash?'wrong':createHash('sha256').update(JSON.stringify(track)).digest('hex')});
  const model=options.model||{account:'A',rows:{one:{revision:4,deleted:false},two:{revision:7,deleted:false}},requests:[],failIds:[],loseResponse:false};
  const writes=[],timers=[],handlers={},documentHandlers={},chip={dataset:{}};
  const indexedDB={open(){const req={};queueMicrotask(()=>{
    if(options.idbBlocked){req.error=new Error('IDB blocked');req.onerror();return;}
    req.result={close(){},transaction(){const tx={pending:0,objectStore(name){return {get(key){const r={};tx.pending++;queueMicrotask(()=>{r.result=(name==='meta'?meta:sync).get(key);r.onsuccess?.();tx.pending--;});return r;}};}};setImmediate(function complete(){if(tx.pending)setImmediate(complete);else tx.oncomplete?.();});return tx;}};req.onsuccess();
  });return req;}};
  const context={state:{library:JSON.parse(storage.get(LIB)),currentId:'one',current:{id:'one'},selection:null},
    localStorage:{getItem(k){return storage.get(k)??null;},setItem(k,v){if(options.quota&&k===KEY)throw new Error('Quota exceeded');writes.push({key:k,ids:context.state.library.map(x=>x.id)});storage.set(k,String(v));}},
    indexedDB,crypto:webcrypto,TextEncoder,Uint8Array,Event,console:{warn(){}},navigator:{onLine:options.online!==false},
    document:{visibilityState:'visible',getElementById(){return chip;},addEventListener(k,fn){(documentHandlers[k]??=[]).push(fn);}},
    render(){},renderLibrary(){},confirmTimers:{},setTimeout(fn,delay){timers.push({fn,delay});return timers.length;},clearTimeout(){},setInterval(){},
    addEventListener(k,fn){(handlers[k]??=[]).push(fn);},dispatchEvent(ev){for(const fn of handlers[ev.type]||[])fn(ev);},confirm(){return true;},
    async fetch(url,opts={}){
      if(url.endsWith('/health'))return new Response(JSON.stringify({authenticated:true,storageReady:true,accountKey:model.account}));
      const id=decodeURIComponent(url.split('/').pop()),data=JSON.parse(opts.body||'{}');
      model.requests.push({id,method:opts.method,data,account:opts.headers['x-mancardo-delete-account']});
      if(model.failIds.includes(id))return new Response(JSON.stringify({error:'Fixture unavailable'}),{status:503});
      if(opts.headers['x-mancardo-delete-account']!==model.account)return new Response(JSON.stringify({code:'delete_account_mismatch',error:'Account changed'}),{status:409});
      const row=model.rows[id];
      if(!row||row.deleted||row.revision!==data.base_revision)return new Response(JSON.stringify({code:'revision_conflict',current:row||null}),{status:409});
      row.revision++;row.deleted=true;
      if(model.loseResponse){model.loseResponse=false;throw new Error('Response lost');}
      return new Response(JSON.stringify({deleted:true,revision:row.revision}));
    }};
  context.window=context;vm.createContext(context);vm.runInContext(client,context);await settle();await settle();
  return {context,storage,model,writes,timers,chip,handlers,documentHandlers,
    async remove(ids=['one']){return context.mancardoAuthorizedDelete(ids);},
    ids(){return Array.from(context.state.library,x=>x.id);},pending(){return JSON.parse(storage.get(KEY)||'[]');},
    async retry(){context.dispatchEvent(new Event('online'));const timer=timers.findLast(x=>x.delay===100);timer?.fn();for(let i=0;i<8;i++)await settle();}};
}

test('startup and missing local IDs never infer DELETE',async()=>{const f=await fixture({tracks:[]});assert.equal(f.model.requests.length,0);});

test('intent is durable before removal, account/revision-pinned, and confirmed deletion survives reload',async()=>{
 const f=await fixture();assert.equal(await f.remove(),true);assert.deepEqual(f.ids(),['two']);
 assert.deepEqual(f.writes.find(x=>x.key===KEY).ids,['one','two']);
 assert.deepEqual(f.model.requests.map(x=>[x.method,x.account,x.data.base_revision]),[['DELETE','A',4]]);
 assert.equal(f.pending()[0].confirmedRevision,5);
 const reload=await fixture({storage:f.storage,model:f.model});assert.deepEqual(reload.ids(),['two']);assert.equal(f.model.requests.length,1);
});

test('offline stale-delete after reload does not delete a later cloud edit',async()=>{
 const f=await fixture({online:false});assert.equal(await f.remove(),true);assert.equal(f.model.requests.length,0);
 f.model.rows.one.revision=5;
 const reload=await fixture({online:false,storage:f.storage,model:f.model});assert.deepEqual(reload.ids(),['two']);
 reload.context.navigator.onLine=true;await reload.retry();
 assert.equal(f.model.rows.one.deleted,false);assert.deepEqual(f.model.requests.map(x=>x.data.base_revision),[4]);assert.deepEqual(reload.pending(),[]);
 await reload.retry();assert.equal(f.model.requests.length,1);
});

test('lost successful response retries only original revision and accepts server tombstone',async()=>{
 const f=await fixture();f.model.loseResponse=true;await f.remove();assert.equal(f.pending()[0].confirmedRevision,undefined);
 await f.retry();assert.deepEqual(f.model.requests.map(x=>x.data.base_revision),[4,4]);assert.equal(f.pending()[0].confirmedRevision,5);assert.equal(f.model.rows.one.revision,5);
});

test('account switch pauses pending DELETE and unrelated-account pending IDs do not hide tracks',async()=>{
 const f=await fixture({online:false});await f.remove();f.model.account='B';f.context.navigator.onLine=true;await f.retry();
 assert.equal(f.model.requests.length,0);assert.equal(f.pending()[0].accountKey,'A');
 const other=await fixture({pending:[{id:'one',accountKey:'B',baseRevision:4,authorizedUserDelete:true}]});assert.deepEqual(other.ids(),['one','two']);assert.equal(other.context.mancardoHasPendingDelete('A','one'),false);
});

test('quota error, blocked IndexedDB, unknown revision, and unsynced content preserve the local copy',async()=>{
 for(const opts of [{quota:true},{idbBlocked:true},{noMeta:true},{wrongHash:true}]){const f=await fixture(opts);assert.equal(await f.remove(),false);assert.deepEqual(f.ids(),['one','two']);assert.equal(f.model.requests.length,0);}
});

test('malformed queue remains untouched and never permits a delete',async()=>{
 const f=await fixture();f.storage.set(KEY,'not-json');assert.equal(await f.remove(),false);assert.deepEqual(f.ids(),['one','two']);assert.equal(f.storage.get(KEY),'not-json');assert.equal(f.model.requests.length,0);
});

test('failure of one pending DELETE does not starve the next explicit intent',async()=>{
 const f=await fixture();f.model.failIds=['one'];await f.remove(['one','two']);assert.equal(f.model.rows.one.deleted,false);assert.equal(f.model.rows.two.deleted,true);assert.deepEqual(f.model.requests.map(x=>x.id),['one','two']);
});

test('confirmed revision watermark blocks stale pulls but permits newer live recreation',async()=>{
 const f=await fixture();await f.remove();const check=f.context.mancardoDeleteBlocksCloudItem;
 assert.equal(check('A',{track_id:'one',revision:4,deleted:false}),true);
 assert.equal(check('A',{track_id:'one',revision:5,deleted:true}),false);
 assert.equal(f.context.mancardoHasPendingDelete('A','one'),true);
 assert.equal(check('A',{track_id:'one',revision:6,deleted:false}),false);
 assert.equal(f.context.mancardoHasPendingDelete('A','one'),false);
});

test('repeated delete clicks do not issue duplicate DELETE operations',async()=>{
 const f=await fixture();await Promise.all([f.remove(),f.remove()]);assert.equal(f.model.requests.length,1);
});

test('edit while authorization awaits IndexedDB is not silently removed',async()=>{
 const f=await fixture();const removing=f.remove();f.context.state.library[0].name='Changed while waiting';assert.equal(await removing,false);assert.deepEqual(f.ids(),['one','two']);assert.equal(f.model.requests.length,0);
});

// Verify the same-request account guard independently from client preflights.
test('server guard rejects missing/mismatched identity before forwarding DELETE',async()=>{
 const base=(await import('../worker-autosave-stability.js')).default;
 const worker=(await import('../worker-delete-durable-fix.js')).default;
 const original=base.fetch;const calls=[];let actual='B';
 base.fetch=async request=>{calls.push(request);return request.method==='DELETE'?Response.json({deleted:true,revision:5}):Response.json({authenticated:true,accountKey:actual});};
 try{
   let response=await worker.fetch(new Request('https://fixture.test/api/private-library/tracks/one',{method:'DELETE'}),{},{});assert.equal(response.status,400);assert.equal(calls.length,0);
   response=await worker.fetch(new Request('https://fixture.test/api/private-library/tracks/one',{method:'DELETE',headers:{'x-mancardo-delete-account':'A'}}),{},{});assert.equal(response.status,409);assert.equal(calls.filter(x=>x.method==='DELETE').length,0);
   actual='A';response=await worker.fetch(new Request('https://fixture.test/api/private-library/tracks/one',{method:'DELETE',headers:{'x-mancardo-delete-account':'A'}}),{},{});assert.equal(response.status,200);assert.equal(calls.filter(x=>x.method==='DELETE').length,1);
 }finally{base.fetch=original;}
});


test('visibility-only changes can be deleted without waiting for another sync',async()=>{
 const f=await fixture();f.context.state.library[0].visible=false;
 assert.equal(await f.remove(),true);assert.deepEqual(f.ids(),['two']);assert.equal(f.model.requests.length,1);assert.equal(f.model.requests[0].data.base_revision,4);
});

test('substantive unsynced edits still cannot acquire deletion authority from a prior revision',async()=>{
 const f=await fixture();f.context.state.library[0].name='An unsynced renamed track';
 assert.equal(await f.remove(),false);assert.deepEqual(f.ids(),['one','two']);assert.equal(f.model.requests.length,0);
});
