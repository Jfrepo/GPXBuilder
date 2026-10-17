// Independent safety review of the exact helper emitted by the full Worker.
// Isolated adapters expose mutation/await boundaries. Complete sync and browser
// integration are qualified separately in delete-cross-client*.test.cjs.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {pathToFileURL}=require('node:url');
const {createHash,webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
let helper,hashHelper,ackHelper;
test.before(async()=>{
  const worker=(await import(pathToFileURL(path.join(root,'worker-delete-durable-fix.js')).href)).default;
  const html=await (await worker.fetch(new Request('https://fixture.test/'),{
    ASSETS:{fetch:async()=>new Response(fs.readFileSync(path.join(root,'index.html'),'utf8'),{headers:{'content-type':'text/html'}})},
    PRIVATE_LIBRARY_DB:{prepare(){throw new Error('No D1 access permitted');}},
  },{})).text();
  const start=html.indexOf('function applyCloudTombstone(item){'),end=html.indexOf('function applyCloudItem(item){',start);
  assert.ok(start>=0&&end>start);helper=html.slice(start,end);
  const ackStart=html.indexOf('function acknowledgeVerifiedLivePut(op,cloud,owner){');
  assert.ok(ackStart>=0&&ackStart<start);ackHelper=html.slice(ackStart,start);
  const hs=html.indexOf('function revisionHashes(snapshot){'),he=html.indexOf('function authorisedDelete(',hs);
  assert.ok(hs>=0&&he>hs);hashHelper=html.slice(hs,he);
});

function fixture(options={}){
  const original={id:'one',name:'Original',visible:true,segments:[[{lat:1,lon:2}]],note:'Keep',updatedAt:'2026-10-17'};
  const state={library:[clone(options.local||original)],currentId:options.editor?'one':null,current:clone(options.editor||null)};
  let meta=Object.hasOwn(options,'meta')?clone(options.meta):{id:'one',accountKey:'A',revision:1,sha256:sha(original),deleted:false};
  let reads=0;
  const copies=[],removals=[],writes=[],outboxDeletes=[];
  const context={state,accountKey:'A',crypto:webcrypto,TextEncoder,Uint8Array,window:{},
    localById:id=>state.library.find(t=>t.id===id)||null,
    async getSyncMeta(){reads++;await options.onRead?.(reads,api);return clone(meta);},
    async putSyncMeta(id,value){writes.push({id,value:clone(value)});meta={...clone(value),id,accountKey:context.accountKey};},
    async delOutbox(id){await options.beforeOutbox?.(api);outboxDeletes.push(context.accountKey+'|'+id);},
    async tx(store,mode,fn){await options.beforeOutbox?.(api);assert.equal(store,'outbox');assert.equal(mode,'readwrite');return fn({delete:key=>outboxDeletes.push(key)});},
    preserveConflictCopy(value){copies.push(clone(value));},
    replaceLocal(id,value){assert.equal(value,null);removals.push(id);state.library=state.library.filter(t=>t.id!==id);if(state.currentId===id){state.current=null;state.currentId=null;}},
  };
  vm.createContext(context);vm.runInContext(hashHelper+'\n'+helper,context);
  context.window.mancardoReconciledRevisionHashes=context.revisionHashes;
  const api={state,context,copies,removals,writes,outboxDeletes,original,get meta(){return meta;},set meta(value){meta=clone(value);},
    run:item=>context.applyCloudTombstone(item||{track_id:'one',revision:2,deleted:true,sha256:sha(original)})};
  return api;
}

test('known unchanged replica and presentation-only editor state are removed without a recovery copy',async()=>{
  const f=fixture();f.state.currentId='one';f.state.current=clone(f.original);f.state.current.visible=false;
  assert.equal(await f.run(),true);assert.equal(f.copies.length,0);assert.deepEqual(f.state.library,[]);assert.equal(f.state.current,null);
  assert.equal(f.writes[0].value.deleted,true);assert.deepEqual(f.outboxDeletes,['A|one']);
});

test('older or equal tombstones cannot supersede a known live local revision',async()=>{
  for(const revision of [1,2]){
    const f=fixture();f.meta={...f.meta,revision:2};
    assert.equal(await f.run({track_id:'one',revision,deleted:true}),false);
    assert.equal(f.removals.length,0);assert.equal(f.copies.length,0);assert.equal(f.writes.length,0);assert.equal(f.state.library.length,1);
  }
});

test('unknown, missing, or already-deleted metadata never proves a clean live replica',async()=>{
  for(const change of [()=>null,m=>({...m,deleted:true}),m=>{delete m.deleted;return m;},m=>({...m,deleted:'false'})]){
    const f=fixture();f.meta=change(f.meta);await f.run();
    assert.equal(f.copies.length,1,'Unknown live provenance must preserve the local payload');assert.deepEqual(f.copies[0],f.original);
  }
});

test('substantive library edits are preserved and editor-only geometry changes defer all mutation',async()=>{
  const edited=fixture();edited.state.library[0].name='Unsynced rename';await edited.run();
  assert.equal(edited.copies.length,1);assert.equal(edited.copies[0].name,'Unsynced rename');
  const editor=fixture();editor.state.currentId='one';editor.state.current=clone(editor.original);editor.state.current.segments[0][0].lat=9;
  assert.equal(await editor.run(),false);assert.equal(editor.state.current.segments[0][0].lat,9);assert.equal(editor.removals.length,0);assert.equal(editor.writes.length,0);
});

test('a new library edit after hashing is reconsidered rather than silently discarded',async()=>{
  const f=fixture({onRead(n,api){if(n===2)api.state.library[0].name='Arrived after hash';}});
  await f.run();assert.equal(f.copies.length,1);assert.equal(f.copies[0].name,'Arrived after hash');
});

test('editor and metadata changes after hashing are rechecked after the final await',async()=>{
  const editor=fixture({onRead(n,api){if(n===2){api.state.currentId='one';api.state.current=clone(api.original);api.state.current.segments[0][0].lon=8;}}});
  assert.equal(await editor.run(),false);assert.equal(editor.removals.length,0);assert.equal(editor.state.current.segments[0][0].lon,8);
  const newer=fixture({onRead(n,api){if(n===2)api.meta={...api.meta,revision:3};}});
  assert.equal(await newer.run(),false);assert.equal(newer.removals.length,0);assert.equal(newer.writes.length,0);
});

test('account changes during metadata reads cannot remove a track or update metadata',async()=>{
  const f=fixture({onRead(n,api){if(n===2)api.context.accountKey='B';}});
  await assert.rejects(f.run(),/account changed/);assert.equal(f.removals.length,0);assert.equal(f.writes.length,0);assert.deepEqual(f.outboxDeletes,[]);
});

test('an account switch while opening the final outbox transaction cannot delete another account queue',async()=>{
  const f=fixture({beforeOutbox(api){api.context.accountKey='B';}});
  await assert.rejects(f.run(),/account changed/);
  assert.deepEqual(f.outboxDeletes,[],'Do not evaluate a mutable account key after the asynchronous database open');
});

test('continuously changing snapshots defer instead of exhausting safety through a retry',async()=>{
  const f=fixture({onRead(n,api){if(n%2===0)api.state.library[0].name='Changing '+n;}});
  assert.equal(await f.run(),false);assert.equal(f.removals.length,0);assert.equal(f.copies.length,0);assert.equal(f.writes.length,0);
});

function acknowledgmentFixture(options={}){
  let meta=options.meta,closed=0,opened=0;
  const writes=[],keys=[],state={library:[{id:'one',name:'Newer local edit'}],current:{id:'one',name:'Editor edit'}};
  const outbox=[{id:'one',track:{name:'Newer queued edit'}}];
  const context={accountKey:'A',async openDb(){
    opened++;await options.onOpen?.(api);
    return {close(){closed++;},transaction(name,mode){
      assert.equal(name,'sync');assert.equal(mode,'readwrite');
      const tx={aborted:false,abort(){this.aborted=true;setImmediate(()=>this.onabort?.());}};
      tx.objectStore=store=>{assert.equal(store,'sync');return {
        get(key){keys.push(key);const request={};setImmediate(()=>{options.onRead?.(api);request.result=clone(meta);request.onsuccess?.();setImmediate(()=>{if(!tx.aborted)tx.oncomplete?.();});});return request;},
        put(value){writes.push(clone(value));meta=clone(value);},
      };};return tx;
    }};
  }};
  const api={context,state,outbox,writes,keys,get meta(){return meta;},set meta(value){meta=clone(value);},get opened(){return opened;},get closed(){return closed;},
    run:(cloud={revision:2,sha256:'verified-hash',deleted:false},op={id:'one',accountKey:'A',localHash:'verified-hash'})=>context.acknowledgeVerifiedLivePut(op,cloud,'A')};
  vm.createContext(context);vm.runInContext(ackHelper,context);return api;
}

test('verified live acknowledgment updates metadata only and leaves newer editor and queued content intact',async()=>{
  const f=acknowledgmentFixture();const before=JSON.stringify([f.state,f.outbox]);
  assert.equal(await f.run(),true);assert.equal(JSON.stringify([f.state,f.outbox]),before);
  assert.deepEqual(f.keys,['A|one']);assert.equal(f.writes.length,1);assert.equal(f.writes[0].key,'A|one');assert.equal(f.writes[0].deleted,false);assert.equal(f.closed,1);
});

test('live acknowledgment rejects account switches during database open and transactional metadata read',async()=>{
  for(const boundary of ['onOpen','onRead']){
    const f=acknowledgmentFixture({[boundary](api){api.context.accountKey='B';}});
    await assert.rejects(f.run(),/account changed/);assert.equal(f.writes.length,0);
    assert.ok(f.keys.every(key=>key==='A|one'),'Never read another account key');
  }
});

test('live acknowledgment cannot overwrite newer metadata or an equal-revision tombstone arriving during open',async()=>{
  for(const meta of [{accountKey:'A',revision:3,deleted:false,sha256:'newer'},{accountKey:'A',revision:2,deleted:true,sha256:'deleted'},{accountKey:'A',revision:2,sha256:'unknown-live-state'}]){
    const f=acknowledgmentFixture({onOpen(api){api.meta=meta;}});
    assert.equal(await f.run(),false);assert.equal(f.writes.length,0);assert.deepEqual(f.meta,meta);
  }
});

test('unverified live acknowledgment fails before opening a database',async()=>{
  for(const cloud of [{revision:2,sha256:'verified-hash',deleted:true},{revision:2,sha256:'verified-hash'},{revision:2,sha256:'wrong',deleted:false},{revision:0,sha256:'verified-hash',deleted:false}]){
    const f=acknowledgmentFixture();await assert.rejects(f.run(cloud),/Unverified/);assert.equal(f.opened,0);assert.equal(f.writes.length,0);
  }
});
