// Offline deploy-equivalent packaging check. Every browser request is intercepted by fixtures.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
async function check(){
 const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'mancardo-export-bundle-'));
 try{
  execFileSync(process.execPath,['scripts/build-waypoint-development.cjs'],{cwd:root,stdio:'pipe'});
  execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','deploy','--dry-run','--config','dist/waypoint-development/wrangler.toml','--outdir',temp],{cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false',XDG_CONFIG_HOME:path.join(temp,'config')},stdio:'pipe',timeout:120000});
  fs.copyFileSync(path.join(root,'index.html'),path.join(temp,'index.html'));fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');
  const worker=(await import(pathToFileURL(path.join(temp,'worker-delete-durable-fix.js')))).default;
  const response=await worker.fetch(new Request('https://fixture.invalid/'),{ASSETS:{fetch:async()=>new Response(fs.readFileSync(path.join(temp,'index.html'),'utf8'),{headers:{'content-type':'text/html'}})},PRIVATE_LIBRARY_DB:{prepare(){throw Error('Data access prohibited')}}},{waitUntil(){throw Error('Background work prohibited')}});
  const html=await response.text(),{GPX_SERIALIZER}=await import(pathToFileURL(path.join(root,'worker-gpx-export.js')));
  assert.equal(html.split(GPX_SERIALIZER).length,2,'Bundled browser serializer must remain exact literal source');
  const serialize=require('node:vm').runInNewContext('('+GPX_SERIALIZER+')');assert.ok(serialize([],[{name:'Synthetic & safe',lat:1,lon:2}]).includes('Synthetic &amp; safe'));
  execFileSync(process.execPath,['--test','tests/waypoint-export.test.cjs'],{cwd:root,env:{...process.env,MANCARDO_PERF_ROOT:temp},stdio:'inherit',timeout:180000});
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
if(require.main===module)check().catch(()=>{console.error('Deploy-equivalent waypoint export bundle checks failed.');process.exitCode=1;});
module.exports={check};
