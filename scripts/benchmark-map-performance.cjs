// Serial local synthetic comparison. MANCARDO_PERF_ROOT may point to an immutable
// baseline worktree; only its source is read. No provider or account requests.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {chromium}=require('playwright'),{fixture}=require('../tests/helpers/map-performance-fixture.cjs');
(async()=>{
 const root=process.env.MANCARDO_PERF_ROOT||path.resolve(__dirname,'..');
 const evidence=path.resolve(process.env.PERFORMANCE_EVIDENCE||'performance-local.json');
 if(fs.existsSync(evidence))throw Error('Choose a new evidence path; existing results are never overwritten.');
 const browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']});
 const cleanups=[],result={source:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim(),provider:'mock; real Chromium/Leaflet',runs:[]};
 try{
  const {page:p,errors}=await fixture(browser,{after:fn=>cleanups.push(fn)},{points:Number(process.env.POINTS||10000),waypoints:Number(process.env.WAYPOINTS||0)});
  await p.evaluate(()=>{map.getContainer().addEventListener('wheel',()=>{window.lastWheel=performance.now()},{capture:true,passive:true});});
  const box=await p.locator('#mapDiv').boundingBox();await p.mouse.move(box.x+box.width*.55,box.y+box.height*.5);
  for(const z of [15,13,15,13,15,13]){
   await p.evaluate(z=>{lastWheel=0;map.setZoom(z,{animate:false})},z);await p.waitForTimeout(500);await p.evaluate(()=>{metrics={};longtasks=[]});
   await p.mouse.wheel(0,-60);await p.waitForTimeout(700);
   result.runs.push(await p.evaluate(z=>({from:z,to:map.getZoom(),metrics:{...metrics},longtasks:[...longtasks]}),z));
  }
  await p.evaluate(()=>{metrics={};longtasks=[]});await p.waitForTimeout(1100);result.idle=await p.evaluate(()=>({metrics:{...metrics},longtasks:[...longtasks]}));
  await p.evaluate(()=>{lastWheel=0;metrics={};longtasks=[]});await p.mouse.down();await p.mouse.move(box.x+box.width*.7,box.y+box.height*.6,{steps:30});await p.mouse.up();await p.waitForTimeout(500);result.drag=await p.evaluate(()=>({metrics:{...metrics},longtasks:[...longtasks]}));result.errors=errors;
  fs.writeFileSync(evidence,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({source:result.source,dirty:result.dirty,wheelMs:result.runs.map(r=>r.metrics.wheelToGoogleMs),renders:result.runs.map(r=>r.metrics.renders||0),idleClones:result.idle.metrics.clones||0,evidence}));
 }finally{for(const close of cleanups)await close();await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
