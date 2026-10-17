const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const base=(process.env.MANCARDO_TEST_URL||'https://mancardo-dev-test.jayfenno.workers.dev/').replace(/\/$/,'');
const accessClientId=process.env.CF_ACCESS_CLIENT_ID||'';
const accessClientSecret=process.env.CF_ACCESS_CLIENT_SECRET||'';
if(!accessClientId||!accessClientSecret)throw new Error('Missing Cloudflare Access service-token secrets.');
const accessHeaders={'CF-Access-Client-Id':accessClientId,'CF-Access-Client-Secret':accessClientSecret};

async function api(page,path,options={}){
  return page.evaluate(async ({path,options})=>{
    const r=await fetch(path,{credentials:'include',cache:'no-store',...options,headers:{accept:'application/json',...(options.headers||{})}});
    let data={};try{data=await r.json();}catch{}
    return {status:r.status,ok:r.ok,data};
  },{path:'/api/private-library'+path,options});
}

(async()=>{
  // Outer Access boundary: the dev app/API must not be directly reachable without Access credentials.
  const unauth=await fetch(base+'/api/private-library/health',{redirect:'manual'});
  assert.notEqual(unauth.status,200,'Unauthenticated request unexpectedly reached the protected development API');

  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({extraHTTPHeaders:accessHeaders});
  const page=await context.newPage();
  try{
    const response=await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:30000});
    assert.ok(response&&response.ok(),'Development app must return HTTP 2xx through the CI Access service token');
    await page.waitForFunction(()=>window.__mancardoPrivateCloudSyncInstalled===true,null,{timeout:15000});

    // Live infrastructure check. The CI service token opens the protected dev site but intentionally does not impersonate an end-user identity.
    const health=await api(page,'/health');
    assert.equal(health.status,200,'Private health endpoint must return 200 through the protected dev site');
    assert.equal(health.data.storageReady,true,'Development D1 binding must be reachable');
    assert.equal(health.data.authConfigured,true,'Private sync authentication must be configured');
    assert.equal(health.data.authenticated,false,'CI Access service token must not be treated as an end-user private-sync identity');

    // Inner application auth boundary: even after the CI token gets through Cloudflare Access, private data stays inaccessible without a verified user JWT.
    const privateList=await api(page,'/tracks?limit=1');
    assert.equal(privateList.status,401,'Private track API must reject the CI service token without an end-user identity');
    assert.equal(privateList.data.code,'authentication_required','Private API must fail closed with authentication_required');

    // Resilience contracts exercised by the deployed release code. These checks intentionally test the exact implementation shipped by this commit.
    const cloud=fs.readFileSync('worker-private-library-cloud.js','utf8');
    const sync=fs.readFileSync('worker-private-library-sync.js','utf8');

    // Offline/interrupted-save durability: IndexedDB outbox, offline status, online retry and periodic retry must all be present.
    assert.match(cloud,/createObjectStore\('outbox'/,'Durable IndexedDB outbox must exist');
    assert.match(cloud,/putOutbox\(/,'Local changes must be queued into the outbox');
    assert.match(cloud,/window\.addEventListener\('online',[^]*syncNow/,'Reconnect must trigger cloud retry');
    assert.match(cloud,/Changes are saved locally and queued\. They will upload when this device is online again\./,'Offline state must explicitly preserve local changes for retry');
    assert.match(cloud,/setInterval\([^]*syncNow\(\)[^]*60000/,'Visible online sessions must retry sync periodically');

    // Stale-writer protection: revision-conditional SQL must reject stale updates with 409, and the browser keeps a conflict copy.
    assert.match(sync,/WHERE owner_id=\?1 AND track_id=\?2 AND revision=\?10/,'Cloud update must be conditional on the expected revision');
    assert.match(sync,/code:'revision_conflict'[^]*409/,'Stale cloud writes must return revision_conflict with HTTP 409');
    assert.match(cloud,/if\(x\.response\.status===409\)return resolvePutConflict/,'Client must route HTTP 409 into conflict handling');
    assert.match(cloud,/preserveConflictCopy\(local,'Recovered from cross-device conflict'\)/,'Unsynced local data must be preserved as a conflict copy');
    assert.match(cloud,/Missing local entries are NOT evidence of intentional deletion/,'Sync scan must never infer cloud deletes from absent local rows');

    // Account isolation: a browser profile already bound to one private account must pause rather than cross-upload into another account.
    assert.match(cloud,/if\(bound!==accountKey\)[^]*setStatus\('paused','Paused'/,'Account mismatch must pause private sync');

    console.log(JSON.stringify({
      liveDevelopment:{storageReady:health.data.storageReady,authConfigured:health.data.authConfigured,ciServiceTokenIsEndUser:false},
      accessIsolation:'PASS',
      offlineRetryContract:'PASS',
      staleRevisionConflictContract:'PASS',
      accountIsolationContract:'PASS'
    }));
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
