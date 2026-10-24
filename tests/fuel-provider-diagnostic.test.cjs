const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(path.join(process.env.CANDIDATE_ROOT||path.resolve(__dirname,'..'),'node_modules/playwright'));
const {installFuelObserver,permitProvider,sanitizeRecords,QUERY}=require('../scripts/fuel-provider/observer.cjs');
let browser;test.before(async()=>{browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']})});test.after(()=>browser.close());
const provider='https://overpass-api.de/api/interpreter?data='+encodeURIComponent(QUERY);
async function fixture(t,handler){const context=await browser.newContext({serviceWorkers:'block'});t.after(()=>context.close());const page=await context.newPage();await page.addInitScript(installFuelObserver);await page.route('**/*',r=>r.request().url()==='https://fixture.test/'?r.fulfill({contentType:'text/html',body:'<!doctype html><title>isolated fixture</title>'}):handler(r));await page.goto('https://fixture.test/');return page;}
async function observed(page){await page.waitForFunction(()=>__fuelProviderObservation.pending===0);return sanitizeRecords(await page.evaluate(()=>__fuelProviderObservation.records));}
test('allow only unchanged exact GET query, once per approved provider',()=>{
 const seen=new Set(),req=(url,method='GET')=>({url:()=>url,method:()=>method});
 for(const url of [provider.replace('overpass-api.de','evil.test'),provider.replace('https:','http:'),provider+'&key=secret',provider.replace('timeout%3A8','timeout%3A80'),provider.replace('overpass-api.de','overpass-api.de:8443')])assert.equal(permitProvider(req(url),seen),false);
 assert.equal(permitProvider(req(provider,'POST'),seen),false);assert.equal(permitProvider(req(provider),seen),true);assert.equal(permitProvider(req(provider),seen),false);assert.equal(permitProvider(req(provider.replace('overpass-api.de','overpass.kumi.systems')),seen),true);
});
test('copy only bounded allowlisted metadata, never injected payload/URL/error text',()=>{
 const secret='TOP_SECRET_ACCOUNT';const result=sanitizeRecords([{provider:secret,outcome:secret,status:secret,elapsedMs:Infinity,responseBytes:-1,remarkPresent:secret,elements:secret,body:secret,url:secret,error:secret}]);assert.ok(!JSON.stringify(result).includes(secret));assert.equal(result[0].provider,'withheld');
});
test('browser receives unchanged payload; observer emits only status/counts/coordinate shape',async t=>{
 const payload={remark:'PRIVATE_SERVER_DETAIL',elements:[{type:'node',id:1,lat:-33.86,lon:151.2,tags:{name:'PRIVATE_STATION'}},{type:'way',id:2,center:{lat:-33.86,lon:151.2}},{type:'relation',id:3}]};
 const page=await fixture(t,r=>r.fulfill({json:payload}));
 assert.deepEqual(await page.evaluate(async u=>(await fetch(u,{credentials:'omit',cache:'no-store'})).json(),provider),payload);
 const records=await observed(page);assert.equal(records[0].elements,3);assert.equal(records[0].validCoordinates,2);assert.equal(records[0].invalidCoordinates,1);assert.equal(records[0].remarkPresent,true);assert.equal(records[0].status,200);assert.ok(!JSON.stringify(records).includes('PRIVATE'));
});
test('non-json and rate-limit response retain HTTP evidence without content',async t=>{
 const page=await fixture(t,r=>r.fulfill({status:429,contentType:'text/html',body:'SECRET_TOKEN login'}));await page.evaluate(async u=>{await (await fetch(u)).text()},provider);const [r]=await observed(page);assert.equal(r.status,429);assert.equal(r.outcome,'non-json');assert.equal(r.responseBytes,18);assert.ok(!JSON.stringify(r).includes('SECRET'));
});
test('native abort signal preserved; thrown error message not retained',async t=>{
 const page=await fixture(t,r=>r.abort());const result=await page.evaluate(async u=>{const c=new AbortController();c.abort();try{await fetch(u,{signal:c.signal})}catch(e){return e.name}},provider);assert.equal(result,'AbortError');const [r]=await observed(page);assert.equal(r.outcome,'abort');assert.equal(r.status,null);
});
test('response observation bounded without truncating application response',async t=>{
 const body='x'.repeat(1000001),page=await fixture(t,r=>r.fulfill({body}));assert.equal(await page.evaluate(async u=>(await (await fetch(u)).text()).length,provider),1000001);const [r]=await observed(page);assert.equal(r.outcome,'body-limit');assert.equal(r.bodyComplete,false);
});
test('current cache fallback and 429 cooldown unchanged under observation',async t=>{
 const full=fs.readFileSync(path.join(process.env.CANDIDATE_ROOT||path.resolve(__dirname,'..'),'index.html'),'utf8'),source=full.slice(full.indexOf('// Fuel data belongs to OSM')),cache=source.slice(0,source.indexOf('var fuelLayer=')),active=source.slice(source.indexOf('function fuelIsActive('),source.indexOf('function fuelPopup('));
 for(const mode of ['fallback','429']){
  let count=0;const page=await fixture(t,r=>{count++;return count===1?r.fulfill({status:mode==='429'?429:503,body:'private-error'}):r.fulfill({json:{elements:[{type:'node',id:1,lat:-33.86,lon:151.2,tags:{amenity:'fuel'}}]}})});
  await page.addScriptTag({content:cache+'\n'+active+'\nfuelData.watch({south:-33.87,north:-33.85,west:151.19,east:151.21},r=>window.result={count:r.stations.length,failed:r.failed,loading:r.loading});'});
  await page.waitForFunction(()=>window.result&&!result.loading);const r=await page.evaluate(()=>result);const rows=await observed(page);
  assert.equal(count,mode==='429'?1:2);assert.equal(rows.length,count);assert.equal(r.count,mode==='429'?0:1);assert.equal(r.failed,mode==='429');
 }
});
test('runner has no deployment, data mutation or persisted browser capture',()=>{
 const code=fs.readFileSync(path.join(__dirname,'../scripts/fuel-provider/run.cjs'),'utf8');assert.doesNotMatch(code,/wrangler.*deploy|method:'(?:POST|PUT|PATCH|DELETE)'|storageState|\.screenshot\(|recordHar|console\.log/);assert.ok(code.includes("headers:{'CF-Access-Client-Id':env.CF_ACCESS_CLIENT_ID"));assert.ok(!code.includes('extraHTTPHeaders'));assert.ok(code.includes("await current()!==deployment"));assert.ok(code.includes('serviceWorkers:\'block\''));
});
test('response-stage redirect guard stops destination without a replacement request',async t=>{
 const http=require('node:http'),{installRedirectGuard}=require('../scripts/fuel-provider/observer.cjs');const reached=[];
 const server=http.createServer((req,res)=>{reached.push(req.url);if(req.url==='/approved'){res.writeHead(302,{Location:'/blocked-destination'});res.end();}else res.end('must not be reached');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const context=await browser.newContext();t.after(()=>context.close());const page=await context.newPage();const url='http://127.0.0.1:'+server.address().port+'/approved';
 await context.route('**/*',r=>[url,url.replace('/approved','/ok')].includes(r.request().url())?r.continue():r.abort());
 await installRedirectGuard(page);
 await assert.rejects(page.goto(url,{timeout:5000}));assert.deepEqual(reached,['/approved']);
 const page2=await context.newPage();await installRedirectGuard(page2);const ok=await page2.goto(url.replace('/approved','/ok'));assert.equal(ok.status(),200);assert.deepEqual(reached,['/approved','/ok']);
});
test('workflow operation is isolated, pinned and excluded from push deployment',()=>{
 const w=fs.readFileSync(path.join(__dirname,'../.github/workflows/cloudflare-dev.yml'),'utf8');
 const job=w.split('  diagnose-fuel-provider:')[1];assert.ok(job);
 assert.ok(job.includes("if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/mancardo-dev' && inputs.operation == 'fuel-provider'"));
 assert.ok(job.includes('ref: 637af20b858659d8942cfcc1fc51050070cccb8f'));assert.ok(job.includes('persist-credentials: false'));assert.ok(job.includes('timeout-minutes: 5'));
 assert.doesNotMatch(job,/wrangler|release-map-performance-development.cjs|npm run test:map-performance|trace-map-performance/);
 assert.ok(w.includes("- 'scripts/fuel-provider/**'"));assert.ok(w.includes("- 'tests/fuel-provider-diagnostic.test.cjs'"));
 const deploy=w.split('  deploy:')[1].split('  deploy-performance-candidate:')[0];assert.ok(deploy.includes("if: github.event_name == 'push' &&"));
 const stage=w.split('  deploy-performance-candidate:')[1].split('  diagnose-performance:')[0];assert.ok(stage.includes("(inputs.operation == 'stage' || inputs.operation == 'verify')"));assert.ok(!stage.includes("inputs.operation == 'fuel-provider'"));
 const r=fs.readFileSync(path.join(__dirname,'../scripts/fuel-provider/run.cjs'),'utf8');
 for(const pin of ['637af20b858659d8942cfcc1fc51050070cccb8f','92791139a357b74f373b948e8a50b8bd7cc3d9640bb17c2a15a0217db3260446','bd6fa40e-4696-4183-a713-3ee08c975d97'])assert.ok(r.includes(pin));
 assert.ok(r.indexOf('await identity();const deployment=await current()')<r.indexOf('chromium.launch'));
 assert.ok(r.indexOf('guards.validateFuelHtml(')<r.indexOf('chromium.launch'));
 assert.ok(r.includes("await context.route('**/*'"));assert.ok(r.includes('req.frame().page()!==page'));assert.ok(r.includes('const redirects=await installRedirectGuard(page)'));
 assert.ok(r.includes("u.protocol==='https:'&&!u.port&&!u.username&&!u.password"));assert.ok(r.includes('await identity();if(await current()!==deployment)'));
});

test('workflow guard suite runs from the controller checkout for relative source reads',()=>{
 const w=fs.readFileSync(path.join(__dirname,'../.github/workflows/cloudflare-dev.yml'),'utf8');
 const step=w.split('      - name: Verify diagnostic guards and intercepted browser fixtures\n')[1].split('      - name:')[0];
 assert.match(step,/^        working-directory: controller$/m);
 assert.match(step,/^        run: node --test tests\/fuel-provider-diagnostic\.test\.cjs tests\/map-performance-development\.test\.cjs tests\/fuel-delivery-diagnostic\.test\.cjs tests\/release-safety\.test\.cjs$/m);
});
