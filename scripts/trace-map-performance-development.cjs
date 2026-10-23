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
function instrument(source){
 const needle='  const modes=[];';
 const sample='({...__wheelEvidence,start:undefined,geometryUnchanged:';
 if(source.split(needle).length!==2||source.split(sample).length!==2)throw Error('Unexpected checker source; refusing diagnostic patch.');
 source=source.replace(needle,'  await page.evaluate('+JSON.stringify('('+installTrace.toString()+')(__performanceAcceptance.map,__mancardoGoogleMap)')+');\n'+needle);
 return source.replace(sample,'({...__wheelEvidence,start:undefined,timingTrace:{events:__timingTrace.events.map(e=>({...e,at:e.at-__timingTrace.events[0].at})),longtasks:__timingTrace.longtasks.map(e=>({...e,start:e.start-__timingTrace.events[0].at}))},geometryUnchanged:');
}
async function run(){
 const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
 const {execFileSync}=require('node:child_process');
 const {PIN,validateBrowserEvidence}=require('./release-map-performance-development.cjs');
 const root=process.env.CANDIDATE_ROOT;
 if(!root||execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()!==PIN)throw Error('Diagnostic candidate SHA mismatch.');
 const filename=path.join(root,'scripts/check-map-performance-development.cjs');
 const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
 mod._compile(instrument(fs.readFileSync(filename,'utf8')),filename);
 await mod.exports.check();
 const evidence=JSON.parse(fs.readFileSync(process.env.PERFORMANCE_LIVE_EVIDENCE,'utf8'));
 evidence.sourceSha=PIN;
 evidence.measurementEndpoints={existingCommandP95:'wheel to Google zoom_changed callback',handoff:'wheel to Google setZoom entry'};
 for(const mode of evidence.modes)for(const sample of mode.samples){
  const events=sample.timingTrace.events,first=name=>events.find(e=>e.name===name)?.at??null;
  sample.handoffEntryMs=first('google:setZoom:entry');
  sample.providerCallbackMs=first('google:zoom_changed');
 }
 fs.writeFileSync(process.env.PERFORMANCE_LIVE_EVIDENCE,JSON.stringify(evidence,null,2)+'\n');
 validateBrowserEvidence(evidence);
}
module.exports={installTrace,instrument};
if(require.main===module)run().catch(()=>{console.error('Read-only diagnostic did not meet acceptance; inspect sanitized timing evidence. No deployment was attempted.');process.exitCode=1;});
