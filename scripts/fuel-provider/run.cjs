// Read-only provider observation. No app deployment or account-data requests.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {installFuelObserver,permitProvider,sanitizeRecords,installRedirectGuard}=require('./observer.cjs');
const PIN='637af20b858659d8942cfcc1fc51050070cccb8f',MANIFEST='92791139a357b74f373b948e8a50b8bd7cc3d9640bb17c2a15a0217db3260446',VERSION='bd6fa40e-4696-4183-a713-3ee08c975d97';
const APP='https://mancardo-dev-test.jayfenno.workers.dev/';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function boundedText(response,max){
 const reader=response.body.getReader(),chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){reader.cancel().catch(()=>{});throw Error('BODY_LIMIT');}chunks.push(Buffer.from(value));}
 return Buffer.concat(chunks).toString('utf8');
}
async function run(){
 const env=process.env,root=path.resolve(env.CANDIDATE_ROOT||'.'),controller=path.resolve(env.CONTROLLER_ROOT||'.');
 // Reuse existing reviewed identity/delivery checks; do not invoke its release entrypoint.
 const guards=require(path.join(controller,'scripts/release-map-performance-development.cjs'));
 const evidence={candidate:PIN,version:VERSION,isolatedContext:true,providers:[]};let browser;
 try{
  guards.requiredEnv(env);
  if(cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()!==PIN)throw Error('WRONG_CANDIDATE');
  const out=path.join(root,'dist/waypoint-development'),manifest=fs.readFileSync(path.join(out,'manifest.json'));
  if(sha(manifest)!==MANIFEST)throw Error('MANIFEST_MISMATCH');
  for(const [file,digest]of Object.entries(JSON.parse(manifest))){if(file.includes('..')||path.isAbsolute(file)||sha(fs.readFileSync(path.join(out,file)))!==digest)throw Error('MANIFEST_MISMATCH');}
  const config=fs.readFileSync(path.join(out,'wrangler.toml'),'utf8');
  async function read(suffix){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+env.CF_ACCOUNT+suffix,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.CF_TOKEN}});if(!r.ok)throw Error('IDENTITY_READ_FAILED');const d=JSON.parse(await boundedText(r,200000));if(d.success!==true||!d.result)throw Error('IDENTITY_READ_FAILED');return d.result;}
  const prefix='/workers/scripts/mancardo-dev-test';
  async function identity(){guards.identity(await read('/d1/database/'+env.DEV_DB),await read(prefix+'/settings'),env,config);const domain=await read('/workers/subdomain'),enabled=await read(prefix+'/subdomain');if(domain.subdomain!=='jayfenno'||enabled.enabled!==true||enabled.previews_enabled!==true)throw Error('IDENTITY_MISMATCH');}
  async function current(){const d=guards.latest(await read(prefix+'/deployments'));if(guards.activeVersion(d)!==VERSION)throw Error('VERSION_CHANGED');const v=await read(prefix+'/versions/'+VERSION);if(v.annotations?.['workers/message']!==PIN+' '+MANIFEST)throw Error('VERSION_CHANGED');return d.id;}
  await identity();const deployment=await current();
  const response=await fetch(APP,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'CF-Access-Client-Id':env.CF_ACCESS_CLIENT_ID,'CF-Access-Client-Secret':env.CF_ACCESS_CLIENT_SECRET}});
  if(response.status!==200||!response.headers.get('content-type')?.includes('text/html'))throw Error('SHELL_UNAVAILABLE');
  let html=await boundedText(response,2000000);const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
  guards.validateFuelHtml(html,source,fs.readFileSync(path.join(root,'worker-3d-overlays.js'),'utf8'));
  guards.validateCancelHtml(html,source);
  const marker='// ---------- boot ----------';if(html.split(marker).length!==2)throw Error('SHELL_UNAVAILABLE');
  html=html.replace(marker,'window.__fuelDiagnosticMap=map;\n'+marker);
  const {chromium}=require(path.join(root,'node_modules/playwright'));
  browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'}),page=await context.newPage();
  page.setDefaultTimeout(30000);const seen=new Set();let observing=false,blockedProvider=0;
  await page.addInitScript(installFuelObserver);
  await context.route('**/*',route=>{const req=route.request(),u=new URL(req.url());
   if(req.frame().page()!==page)return route.abort();
   if(u.href===APP&&req.method()==='GET')return route.fulfill({contentType:'text/html',body:html});
   if((u.origin===new URL(APP).origin&&u.pathname.startsWith('/api/'))||u.hostname==='api.mancardo.com')return route.fulfill({json:{authenticated:false,tracks:[],waypoints:[],notes:[]}});
   if(['overpass-api.de','overpass.kumi.systems'].includes(u.hostname)){
    if(observing&&permitProvider(req,seen))return route.continue();blockedProvider++;return route.abort();
   }
   if(u.origin===new URL(APP).origin)return route.abort();
   // Match the established live-provider check's public map/static allowlist.
   if(req.method()==='GET'&&u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&/(^|\.)(googleapis\.com|gstatic\.com|google\.com|googleusercontent\.com|cloudflare\.com)$/.test(u.hostname))return route.continue();
   return route.abort();
  });
  const redirects=await installRedirectGuard(page);
  await page.goto(APP,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__mancardoGoogleMap?.getProjection()&&window.__fuelDiagnosticMap);
  await page.getByRole('button',{name:'Roads',exact:true}).click();
  await page.evaluate(()=>__fuelDiagnosticMap.setView([-33.86,151.2],13,{animate:false}));await page.waitForTimeout(1000);
  const oneCell=await page.evaluate(()=>{const b=__fuelDiagnosticMap.getBounds();return b.getSouth()>-34&&b.getNorth()<-33.5&&b.getWest()>151&&b.getEast()<151.5;});
  if(!oneCell)throw Error('VIEW_OUTSIDE_SINGLE_CELL');
  if(await page.locator('.fuel-control-btn').getAttribute('aria-pressed')!=='false')throw Error('NOT_COLD_START');
  observing=true;await page.locator('.fuel-control-btn').click();
  try{await page.waitForFunction(()=>__fuelProviderObservation.records.length>0&&__fuelProviderObservation.pending===0&&!document.querySelector('.fuel-control-btn').classList.contains('loading'),null,{timeout:25000});}catch{evidence.observationIncomplete=true;}
  observing=false;evidence.providers=sanitizeRecords(await page.evaluate(()=>__fuelProviderObservation.records));
  for(const redirect of redirects){const row=evidence.providers.find(r=>r.provider===redirect.provider);if(row){row.status=redirect.status;row.outcome='redirect-blocked';}}
  evidence.blockedProviderRequests=blockedProvider;
  // Never copy status text, console errors, response bodies, URLs, screenshots or HAR.
  await browser.close();browser=null;
  await identity();if(await current()!==deployment)throw Error('VERSION_CHANGED');evidence.versionUnchanged=true;
 }catch{evidence.error='DIAGNOSTIC_INCOMPLETE';process.exitCode=1;}
 finally{if(browser)await browser.close();}
 fs.writeFileSync(path.resolve(env.FUEL_DIAGNOSTIC_EVIDENCE||'fuel-provider-diagnostic.json'),JSON.stringify(evidence,null,2)+'\n');
}
module.exports={run,boundedText};
if(require.main===module)run().catch(()=>{console.error('Diagnostic incomplete; details withheld.');process.exitCode=1;});
