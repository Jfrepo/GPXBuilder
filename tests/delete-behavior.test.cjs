// Isolated browser qualification: real Chromium, localStorage and IndexedDB;
// fixture API only. These are NOT authenticated Cloudflare/D1 acceptance tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const source = fs.readFileSync(path.join(__dirname, '../worker-delete-durable-fix.js'), 'utf8');
const client = source.match(/const DURABLE_DELETE_BRIDGE = String.raw`([\s\S]*?)`;/)[1];
const key = 'mancardo_authorized_delete_pending_v4';
const dialogMarkup=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<dialog id="libraryDeleteDialog"[\s\S]*?<\/dialog>/)[0];
let browser;
test.before(async () => {
  browser = await chromium.launch({headless:true,
    ...(fs.existsSync('/usr/bin/chromium') ? {executablePath:'/usr/bin/chromium'} : {}),
    args:['--no-sandbox']});
});
test.after(async () => { await browser?.close(); });

async function fixture(t, options={}) {
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  const model = {account:'A', rows:{one:{revision:4,deleted:false},two:{revision:7,deleted:false}}, requests:[], failIds:[], loseResponse:false, ...options.model};
  const errors=[]; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const request=route.request(), url=new URL(request.url());
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><body><button id="mancardoPrivateSyncChip"></button>'+dialogMarkup+'</body>'});
    if(url.pathname.endsWith('/health'))return route.fulfill({json:{authenticated:true,storageReady:true,accountKey:model.account}});
    if(url.pathname.startsWith('/api/private-library/tracks/')) {
      const id=decodeURIComponent(url.pathname.split('/').pop());
      const data=request.postDataJSON();
      model.requests.push({id,method:request.method(),data,account:request.headers()['x-mancardo-delete-account']});
      if(model.failIds.includes(id))return route.fulfill({status:503,json:{error:'Fixture unavailable'}});
      if(request.headers()['x-mancardo-delete-account']!==model.account)return route.fulfill({status:409,json:{code:'delete_account_mismatch',error:'Account changed'}});
      const row=model.rows[id];
      if(!row||row.deleted||data.base_revision!==row.revision)return route.fulfill({status:409,json:{code:'revision_conflict',current:row||null}});
      row.revision++;row.deleted=true;
      if(model.loseResponse){model.loseResponse=false;return route.abort('failed');}
      return route.fulfill({json:{deleted:true,revision:row.revision}});
    }
    throw new Error('Unexpected fixture request '+request.url());
  });
  await page.goto('http://127.0.0.1:43671/');
  await page.evaluate(async ({key, options}) => {
    const tracks=options.tracks||[{id:'one',name:'AAAAAA',visible:true},{id:'two',name:'Other',visible:true}];
    localStorage.setItem('switchback_local_tracks_v1',JSON.stringify(tracks));
    if(options.pending)localStorage.setItem(key,JSON.stringify(options.pending));
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('mancardo_private_sync_v2',1);r.onupgradeneeded=()=>{for(const name of ['meta','sync','outbox'])r.result.createObjectStore(name,{keyPath:'key'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const hashes=await Promise.all(tracks.map(async track=>[track.id,Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(track))))).map(x=>x.toString(16).padStart(2,'0')).join('')]));
    await new Promise((resolve,reject)=>{const tx=db.transaction(['meta','sync'],'readwrite');tx.objectStore('meta').put({key:'boundAccountKey',value:options.boundAccount||'A'});for(const [id,sha256] of hashes){if(!options.noMeta)tx.objectStore('sync').put({key:(options.boundAccount||'A')+'|'+id,accountKey:options.boundAccount||'A',id,revision:id==='one'?4:7,sha256:options.wrongHash?'different':sha256,deleted:false});}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  }, {key,options:{...options,model:undefined}});
  async function install(){
    await page.evaluate(() => {
      window.state={library:JSON.parse(localStorage.getItem('switchback_local_tracks_v1')),currentId:'one',current:{id:'one'},selection:null};
      window.confirmTimers={}; window.render=()=>{}; window.renderLibrary=()=>{};
      window.confirm=()=>true;
      window.reconciliations=0;window.addEventListener('online',()=>{window.reconciliations++;});
    });
    await page.addScriptTag({content:client});
    await page.waitForFunction(()=>typeof window.mancardoAuthorizedDelete==='function');
    await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,30)));
  }
  await install();
  return {page,context,model,errors, async reload(){await page.reload();await install();},
    async remove(ids=['one']){return page.evaluate(ids=>window.mancardoAuthorizedDelete(ids),ids);},
    async pending(){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'[]'),key);},
    async ids(){return page.evaluate(()=>state.library.map(x=>x.id));}};
}

test('no deletion is inferred from startup or a missing local ID',async t=>{
  const f=await fixture(t,{tracks:[]});await f.page.waitForTimeout(120);
  assert.equal(f.model.requests.length,0);assert.deepEqual(f.errors,[]);
});

test('explicit delete persists original account/revision before local removal and survives refresh',async t=>{
  const f=await fixture(t);assert.equal(await f.remove(),true);
  assert.deepEqual(await f.ids(),['two']);
  assert.equal(f.model.rows.one.deleted,true);
  assert.deepEqual(f.model.requests.map(x=>[x.method,x.account,x.data.base_revision]),[['DELETE','A',4]]);
  const [pending]=await f.pending();assert.equal(pending.baseRevision,4);assert.equal(pending.confirmedRevision,5);
  await f.reload();assert.deepEqual(await f.ids(),['two']);
  assert.equal(f.model.requests.length,1);assert.deepEqual(f.errors,[]);
});

test('offline delete retains its original revision across reload and does not delete a newer cloud edit',async t=>{
  const f=await fixture(t);await f.context.setOffline(true);assert.equal(await f.remove(),true);
  assert.equal(f.model.requests.length,0);assert.equal((await f.pending())[0].baseRevision,4);
  f.model.rows.one.revision=5;
  await f.reload();assert.deepEqual(await f.ids(),['two']);
  await f.context.setOffline(false);
  await f.page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)||'[]').length===0,key);
  assert.equal(f.model.rows.one.deleted,false);assert.equal(f.model.requests.length,1);
  assert.equal(f.model.requests[0].data.base_revision,4);
  assert.ok(await f.page.evaluate(()=>reconciliations)>0);
  await f.page.waitForTimeout(250);assert.equal(f.model.requests.length,1);
});

test('lost successful DELETE response retries the same revision and accepts existing tombstone',async t=>{
  const f=await fixture(t,{model:{loseResponse:true}});await f.remove();
  assert.equal((await f.pending())[0].confirmedRevision,undefined);
  await f.reload();await f.page.waitForFunction(key=>!!JSON.parse(localStorage.getItem(key)||'[]')[0]?.confirmedRevision,key);
  assert.deepEqual(f.model.requests.map(x=>x.data.base_revision),[4,4]);
  assert.equal(f.model.rows.one.revision,5);assert.deepEqual(await f.ids(),['two']);
});

test('account switch pauses all pending DELETE requests, including same-ID records',async t=>{
  const f=await fixture(t);await f.context.setOffline(true);await f.remove();
  f.model.account='B';await f.context.setOffline(false);await f.page.waitForTimeout(400);
  assert.equal(f.model.requests.length,0);assert.equal(f.model.rows.one.deleted,false);
  assert.equal((await f.pending())[0].accountKey,'A');
});

test('another account pending record never hides this account local track',async t=>{
  const f=await fixture(t,{pending:[{id:'one',accountKey:'B',baseRevision:4,authorizedUserDelete:true,requestedAt:1}]});
  assert.deepEqual(await f.ids(),['one','two']);assert.equal(f.model.requests.length,0);
  assert.equal(await f.page.evaluate(()=>mancardoHasPendingDelete('A','one')),false);
});

test('quota failure when saving intent leaves local track and cloud untouched',async t=>{
  const f=await fixture(t);
  await f.page.evaluate(key=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('Quota exceeded','QuotaExceededError');return original.call(this,k,v);};},key);
  assert.equal(await f.remove(),false);assert.deepEqual(await f.ids(),['one','two']);assert.equal(f.model.requests.length,0);
});

test('unknown revision and unsynced content fail closed without losing the local copy',async t=>{
  for(const options of [{noMeta:true},{wrongHash:true}]){
    const f=await fixture(t,options);assert.equal(await f.remove(),false);
    assert.deepEqual(await f.ids(),['one','two']);assert.equal(f.model.requests.length,0);assert.deepEqual(await f.pending(),[]);
  }
});

test('malformed delete queue fails closed without replacing the unreadable data',async t=>{
  const f=await fixture(t);await f.page.evaluate(key=>localStorage.setItem(key,'not-json'),key);
  assert.equal(await f.remove(),false);assert.deepEqual(await f.ids(),['one','two']);assert.equal(f.model.requests.length,0);
  assert.equal(await f.page.evaluate(key=>localStorage.getItem(key),key),'not-json');
});

test('one failed queued DELETE does not prevent another explicit deletion from completing',async t=>{
  const f=await fixture(t,{model:{failIds:['one']}});await f.remove(['one','two']);
  assert.equal(f.model.rows.one.deleted,false);assert.equal(f.model.rows.two.deleted,true);
  assert.deepEqual(f.model.requests.map(x=>x.id),['one','two']);
});

test('confirmed deletion blocks stale pulls, accepts tombstones, and permits a genuinely newer recreation',async t=>{
  const f=await fixture(t);await f.remove();
  assert.equal(await f.page.evaluate(()=>mancardoDeleteBlocksCloudItem('A',{track_id:'one',revision:4,deleted:false})),true);
  assert.equal(await f.page.evaluate(()=>mancardoDeleteBlocksCloudItem('A',{track_id:'one',revision:5,deleted:true})),false);
  // Keep the watermark after seeing a tombstone: an older pull can still be in flight.
  assert.equal(await f.page.evaluate(()=>mancardoHasPendingDelete('A','one')),true);
  assert.equal(await f.page.evaluate(()=>mancardoDeleteBlocksCloudItem('A',{track_id:'one',revision:6,deleted:false})),false);
  assert.equal(await f.page.evaluate(()=>mancardoHasPendingDelete('A','one')),false);
});

test('main delete first click and cancellation do nothing; confirmed menu click deletes once',async t=>{
  const f=await fixture(t);
  await f.page.evaluate(()=>{const button=document.createElement('button');button.id='deleteTrackBtn';document.body.appendChild(button);button.click();});
  assert.equal(f.model.requests.length,0);assert.deepEqual(await f.ids(),['one','two']);
  await f.page.evaluate(()=>{const card=document.createElement('div');card.className='track-item';card.dataset.trackId='one';card.innerHTML='<button class="mancardo-menu-delete">Delete</button>';document.body.appendChild(card);card.firstChild.click();document.getElementById('libraryDeleteKeep').click();});
  assert.equal(f.model.requests.length,0);assert.deepEqual(await f.ids(),['one','two']);
  await f.page.evaluate(()=>{window.confirm=()=>true;document.querySelector('.mancardo-menu-delete').click();document.querySelector('.mancardo-menu-delete').click();});
  await f.page.locator('#libraryDeleteConfirm').click();
  await f.page.waitForFunction(()=>state.library.length===1);
  await f.page.waitForTimeout(200);assert.equal(f.model.requests.length,1);
});

test('confirmed main delete targets only the current track and repeated clicks do not duplicate it',async t=>{
  const f=await fixture(t);
  await f.page.evaluate(()=>{
    const button=document.createElement('button');button.id='deleteTrackBtn';button.dataset.label='Delete track';document.body.appendChild(button);
    button.click();
  });
  assert.equal(f.model.requests.length,0);assert.deepEqual(await f.ids(),['one','two']);
  // The base editor owns first-click confirmation styling. Exercise the exact
  // injected capture handler once that existing confirmation state is present.
  await f.page.evaluate(()=>{const button=document.getElementById('deleteTrackBtn');button.classList.add('confirming');button.click();button.click();});
  await f.page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)||'[]')[0]?.confirmedRevision===5,key);
  assert.deepEqual(await f.ids(),['two']);assert.equal(f.model.rows.two.deleted,false);
  assert.deepEqual(f.model.requests.map(x=>[x.id,x.data.base_revision]),[['one',4]]);assert.deepEqual(f.errors,[]);
});

test('selected delete requires confirmation and never deletes a hidden track',async t=>{
  const f=await fixture(t);
  await f.page.evaluate(()=>{
    state.library[1].visible=false;
    const button=document.createElement('button');button.id='deleteSelectedBtn';document.body.appendChild(button);
    window.confirm=()=>false;button.click();
  });
  assert.equal(f.model.requests.length,0);assert.deepEqual(await f.ids(),['one','two']);
  await f.page.evaluate(()=>{window.confirm=()=>true;document.getElementById('deleteSelectedBtn').click();});
  await f.page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)||'[]')[0]?.confirmedRevision===5,key);
  assert.deepEqual(await f.ids(),['two']);assert.equal(f.model.rows.two.deleted,false);
  assert.deepEqual(f.model.requests.map(x=>[x.id,x.data.base_revision]),[['one',4]]);assert.deepEqual(f.errors,[]);
});


test('visibility-only change does not block an otherwise reconciled deletion',async t=>{
  const f=await fixture(t);await f.page.evaluate(()=>{state.library[0].visible=false;});
  assert.equal(await f.remove(),true);assert.deepEqual(await f.ids(),['two']);assert.equal(f.model.requests.length,1);
});

test('dialog confirmation reads final workspace after delayed hashing',async t=>{
 const f=await fixture(t);
 await f.page.evaluate(()=>{const card=document.createElement('div');card.className='track-item';card.dataset.trackId='one';card.innerHTML='<button class="mancardo-menu-delete">Delete</button>';document.body.appendChild(card);card.firstChild.click();});
 await f.page.waitForFunction(()=>!document.getElementById('libraryDeleteConfirm').disabled);
 await f.page.evaluate(()=>{const original=crypto.subtle.digest.bind(crypto.subtle);const waiting=new Promise(r=>window.releaseHash=r);crypto.subtle.digest=async(...args)=>{await waiting;return original(...args);};document.getElementById('libraryDeleteConfirm').click();});
 await f.page.evaluate(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('mancardo_private_sync_v2',1);q.onsuccess=()=>r(q.result);});await new Promise(r=>{const tx=db.transaction('sync','readwrite'),store=tx.objectStore('sync'),q=store.get('A|one');q.onsuccess=()=>{q.result.revision++;store.put(q.result);};tx.oncomplete=r;});db.close();window.releaseHash();});
 await f.page.waitForFunction(()=>!window.mancardoEditDeletionPending());
 assert.deepEqual(await f.ids(),['one','two']);assert.equal(f.model.requests.length,0);assert.deepEqual(f.errors,[]);
});
