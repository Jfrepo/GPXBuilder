// Diagnostic-only adapter: retain every existing acceptance threshold and request
// interceptor. Never record coordinates, URLs, keys, track data or auth headers.
function installTrace(map,provider){
 const trace=window.__timingTrace={events:[],longtasks:[],active:false};
 function record(name,extra={}){if(trace.active)trace.events.push({name,at:performance.now(),...extra});}
 map.getContainer().addEventListener('wheel',()=>{trace.active=true;trace.events=[];trace.longtasks=[];record('wheel')},{capture:true,passive:true});
 for(const name of ['zoomstart','zoomanim','zoom','zoomend','movestart','move','moveend'])map.on(name,()=>record('leaflet:'+name));
 for(const name of ['setCenter','setZoom']){const original=provider[name];provider[name]=function(...args){record('google:'+name+':entry');try{return original.apply(this,args)}finally{record('google:'+name+':exit')}};}
 for(const name of ['zoom_changed','center_changed','bounds_changed','idle'])if(provider.addListener)provider.addListener(name,()=>record('google:'+name));
 new PerformanceObserver(list=>{if(trace.active)trace.longtasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))}).observe({type:'longtask'});
}
function sanitizeProfile(profile){
 function source(url){
  try{const u=new URL(url);if(u.hostname==='mancardo-dev-test.jayfenno.workers.dev')return 'application';
   if(/(^|\.)(googleapis\.com|gstatic\.com|google\.com|googleusercontent\.com)$/.test(u.hostname))return 'google-provider:'+u.pathname.split('/').pop().replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,80);
   if(u.hostname==='cdnjs.cloudflare.com')return 'public-dependency:'+u.pathname.split('/').pop().replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,80);
  }catch{}
  return url?'other-script':'browser-or-evaluated';
 }
 return {startTime:profile.startTime,endTime:profile.endTime,samples:profile.samples,timeDeltas:profile.timeDeltas,nodes:profile.nodes.map(n=>({id:n.id,children:n.children||[],callFrame:{functionName:n.callFrame.functionName.slice(0,120),source:source(n.callFrame.url),lineNumber:n.callFrame.lineNumber,columnNumber:n.callFrame.columnNumber}}))};
}
function instrument(source,{profile=true}={}){
 const needle='  const modes=[];';
 const sample='({...__wheelEvidence,start:undefined,geometryUnchanged:';
 const wheelLine=source.split('\n').find(line=>line.includes('await page.mouse.wheel(0,-60);'));
 if(!wheelLine||source.split('await page.mouse.wheel(0,-60);').length!==2)throw Error('Unexpected wheel instrumentation point.');
 if(source.split(needle).length!==2||source.split(sample).length!==2)throw Error('Unexpected checker source; refusing diagnostic patch.');
 if(!source.includes('for(const z of [15,13])')||!source.includes('  const latencies=')||!source.includes('const result={commandP95,'))throw Error('Unexpected warm-control instrumentation point.');
 source=source.replace('for(const z of [15,13])','for(const z of [15,13,15])');
 source=source.replace('  const latencies=',"  const diagnosticWarmControls=modes.map(m=>({mode:m.mode,samples:m.samples.splice(2)}));\n  const latencies=");
 source=source.replace('const result={commandP95,',"const result={diagnosticWarmControls,profiling:'"+(profile?'1ms CPU sampling':'disabled; no additional per-wheel waits')+"',commandP95,");
 if(profile){
 source='const sanitizeProfile='+sanitizeProfile.toString()+';\n'+source;
 source=source.replace(wheelLine,`    await cdp.send('Profiler.start');
    const clockBefore=(await cdp.send('Performance.getMetrics')).metrics.find(m=>m.name==='Timestamp').value*1000;
    const pageNow=await page.evaluate(()=>performance.now());
    const clockAfter=(await cdp.send('Performance.getMetrics')).metrics.find(m=>m.name==='Timestamp').value*1000;
${wheelLine}
    const rawProfile=await cdp.send('Profiler.stop');
    samples[samples.length-1].cpuProfile=sanitizeProfile(rawProfile.profile);
    samples[samples.length-1].profileClock={monotonicMinusPageMs:(clockBefore+clockAfter)/2-pageNow,uncertaintyMs:(clockAfter-clockBefore)/2};`);
 }
 const setup=profile?"  const cdp=await context.newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Performance.enable');\n":'';
 source=source.replace(needle,'  await page.evaluate('+JSON.stringify('('+installTrace.toString()+')(__performanceAcceptance.map,__mancardoGoogleMap)')+');\n'+setup+needle);
 return source.replace(sample,'({...__wheelEvidence,start:undefined,timingTrace:{wheelPageMs:__timingTrace.events[0].at,events:__timingTrace.events.map(e=>({...e,at:e.at-__timingTrace.events[0].at})),longtasks:__timingTrace.longtasks.map(e=>({...e,start:e.start-__timingTrace.events[0].at}))},geometryUnchanged:');
}
async function run(){
 const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
 const {execFileSync}=require('node:child_process');
 const {PIN,validateBrowserEvidence}=require('./release-map-performance-development.cjs');
 const root=process.env.CANDIDATE_ROOT;
 if(!root||execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()!==PIN)throw Error('Diagnostic candidate SHA mismatch.');
 const filename=path.join(root,'scripts/check-map-performance-development.cjs');
 const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
 const repeat=process.env.PERFORMANCE_DIAGNOSTIC_MODE==='repeatability';
 mod._compile(instrument(fs.readFileSync(filename,'utf8'),{profile:!repeat}),filename);
 const output=process.env.PERFORMANCE_LIVE_EVIDENCE;
 if(!output)throw Error('Evidence output path is required.');
 const runs=[];
 for(let index=0;index<(repeat?3:1);index++){
  const file=repeat?output+'.context-'+(index+1)+'.json':output;
  process.env.PERFORMANCE_LIVE_EVIDENCE=file;
  let checkerPassed=true;try{await mod.exports.check()}catch{checkerPassed=false;}
  const evidence=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{errors:['Checker failed before producing evidence'],modes:[],diagnosticWarmControls:[]};
 evidence.sourceSha=PIN;
 evidence.measurementEndpoints={existingCommandP95:'wheel to Google zoom_changed callback',handoff:'wheel to Google setZoom entry'};
 for(const mode of [...evidence.modes,...evidence.diagnosticWarmControls])for(const sample of mode.samples){
  const events=sample.timingTrace.events,first=name=>events.find(e=>e.name===name)?.at??null;
  sample.handoffEntryMs=first('google:setZoom:entry');
  sample.providerCallbackMs=first('google:zoom_changed');
 }
 evidence.checkerPassed=checkerPassed;
 let acceptancePassed=checkerPassed;
 try{validateBrowserEvidence(evidence)}catch{acceptancePassed=false;}
 runs.push({context:index+1,acceptancePassed,evidence});
 fs.writeFileSync(file,JSON.stringify(evidence,null,2)+'\n');
 if(repeat)fs.writeFileSync(output,JSON.stringify({sourceSha:PIN,mode:'three fresh browsers; unprofiled; original gates retained per context',completedContexts:runs.length,acceptancePassed:runs.length===3&&runs.every(r=>r.acceptancePassed),runs},null,2)+'\n');
 }
 process.env.PERFORMANCE_LIVE_EVIDENCE=output;
 if(runs.some(r=>!r.acceptancePassed))throw Error('One or more original acceptance gates failed.');
}
module.exports={installTrace,instrument,sanitizeProfile};
if(require.main===module)run().catch(()=>{console.error('Read-only diagnostic did not meet acceptance; inspect sanitized timing evidence. No deployment was attempted.');process.exitCode=1;});
