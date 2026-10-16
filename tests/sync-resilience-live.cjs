const {chromium}=require('playwright');
const assert=require('node:assert/strict');

const base=(process.env.MANCARDO_TEST_URL||'https://mancardo-dev-test.jayfenno.workers.dev/').replace(/\/$/,'');
const accessClientId=process.env.CF_ACCESS_CLIENT_ID||'';
const accessClientSecret=process.env.CF_ACCESS_CLIENT_SECRET||'';
if(!accessClientId||!accessClientSecret)throw new Error('Missing Cloudflare Access service-token secrets.');
const accessHeaders={'CF-Access-Client-Id':accessClientId,'CF-Access-Client-Secret':accessClientSecret};

function track(id,name){
  return {id,type:'track',name,draft:false,segments:[[{lat:-33.8601,lon:151.2001,ele:12},{lat:-33.8606,lon:151.2011,ele:14}]],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
}

async function api(page,path,options={}){
  return page.evaluate(async ({path,options})=>{
    const r=await fetch(path,{credentials:'include',cache:'no-store',...options,headers:{accept:'application/json',...(options.headers||{})}});
    let data={};try{data=await r.json();}catch{}
    return {status:r.status,ok:r.ok,data};
  },{path:'/api/private-library'+path,options});
}

(async()=>{
  // Access isolation: without the service token, the protected dev app/API must not expose authenticated private data.
  const unauth=await fetch(base+'/api/private-library/health',{redirect:'manual'});
  assert.notEqual(unauth.status,200,'Unauthenticated request unexpectedly reached private API with HTTP 200');

  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({extraHTTPHeaders:accessHeaders});
  const page=await context.newPage();
  try{
    const response=await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:30000});
    assert.ok(response&&response.ok(),'Development app must return HTTP 2xx through Access service token');
    await page.waitForFunction(()=>window.__mancardoPrivateCloudSyncInstalled===true,null,{timeout:15000});

    const health=await api(page,'/health');
    assert.equal(health.status,200,'Private health endpoint must return 200');
    assert.equal(health.data.storageReady,true,'Development D1 binding must be reachable');
    assert.equal(health.data.authConfigured,true,'Private sync authentication must be configured');
    assert.equal(health.data.authenticated,true,'Access service token must resolve to an authenticated identity');
    assert.ok(health.data.accountKey,'Authenticated health response must expose an account key');

    await page.waitForFunction(()=>document.querySelector('#mancardoPrivateSyncChip')?.dataset.state==='synced',null,{timeout:20000});

    // 1) Offline/interrupted save: persist locally while offline, verify durable outbox, reconnect, verify upload and acknowledgement.
    const offlineId='accept-offline-'+Date.now().toString(36);
    await context.setOffline(true);
    await page.evaluate(t=>{
      state.library.unshift(t);
      persistLibrary();
      window.dispatchEvent(new CustomEvent('mancardo:track-autosaved'));
    },track(offlineId,'Acceptance Offline Retry'));
    await page.waitForTimeout(1800);
    const queued=await page.evaluate(async id=>{
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('mancardo_private_sync_v2',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      const rows=await new Promise((resolve,reject)=>{const tx=db.transaction('outbox','readonly');const q=tx.objectStore('outbox').getAll();q.onsuccess=()=>resolve(q.result||[]);q.onerror=()=>reject(q.error);});
      db.close();
      return rows.some(x=>x.id===id&&x.op==='put');
    },offlineId);
    assert.equal(queued,true,'Offline edit must remain in the durable outbox');
    assert.equal(await page.evaluate(()=>document.querySelector('#mancardoPrivateSyncChip')?.dataset.state),'offline','UI must report offline state');

    await context.setOffline(false);
    await page.waitForFunction(async id=>{
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('mancardo_private_sync_v2',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      const rows=await new Promise((resolve,reject)=>{const tx=db.transaction('outbox','readonly');const q=tx.objectStore('outbox').getAll();q.onsuccess=()=>resolve(q.result||[]);q.onerror=()=>reject(q.error);});
      db.close();
      return !rows.some(x=>x.id===id);
    },offlineId,{timeout:25000});
    const uploaded=await api(page,'/tracks/'+encodeURIComponent(offlineId));
    assert.equal(uploaded.status,200,'Reconnected offline edit must be uploaded');
    assert.equal(uploaded.data.track?.name,'Acceptance Offline Retry','Cloud copy must match the offline local edit');
    const offlineRev=Number(uploaded.data.revision)||1;
    const cleanupOffline=await api(page,'/tracks/'+encodeURIComponent(offlineId),{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({base_revision:offlineRev,device_id:'acceptance-cleanup'})});
    assert.ok(cleanupOffline.ok,'Offline test row cleanup must succeed');

    // 2) Stale-revision conflict: one writer advances the cloud revision; a stale writer must receive 409 and must not overwrite it.
    const conflictId='accept-conflict-'+Date.now().toString(36);
    const create=await api(page,'/tracks/'+encodeURIComponent(conflictId),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({base_revision:0,track:track(conflictId,'Conflict Base'),device_id:'browser-a'})});
    assert.equal(create.status,201,'Conflict test track creation must succeed');
    const winner=track(conflictId,'Conflict Winner');
    const update=await api(page,'/tracks/'+encodeURIComponent(conflictId),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({base_revision:1,track:winner,device_id:'browser-a'})});
    assert.equal(update.status,200,'Current-revision update must succeed');
    const stale=track(conflictId,'Stale Writer Must Not Win');
    const staleWrite=await api(page,'/tracks/'+encodeURIComponent(conflictId),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({base_revision:1,track:stale,device_id:'browser-b'})});
    assert.equal(staleWrite.status,409,'Stale revision must be rejected with HTTP 409');
    const after=await api(page,'/tracks/'+encodeURIComponent(conflictId));
    assert.equal(after.status,200);
    assert.equal(after.data.track?.name,'Conflict Winner','Stale writer must not silently overwrite newer cloud data');
    assert.equal(Number(after.data.revision),2,'Cloud revision must remain at the winning update');
    const cleanupConflict=await api(page,'/tracks/'+encodeURIComponent(conflictId),{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({base_revision:2,device_id:'acceptance-cleanup'})});
    assert.ok(cleanupConflict.ok,'Conflict test row cleanup must succeed');

    console.log(JSON.stringify({health:{storageReady:health.data.storageReady,authConfigured:health.data.authConfigured,authenticated:health.data.authenticated},offlineRetry:'PASS',staleRevisionConflict:'PASS',accessIsolation:'PASS'}));
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
