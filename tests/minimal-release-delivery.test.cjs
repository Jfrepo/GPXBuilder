const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {validateExportHtml,validateInsertHtml,validateFuelDisabledHtml,validateCancelHtml,validateDeleteHtml}=require('../scripts/release-map-performance-development.cjs');
test('all exact delivery gates accept actual emitted minimal candidate and reject enabled Fuel',async()=>{
 const root=path.resolve(process.env.CANDIDATE_ROOT||path.join(__dirname,'../../candidate')),source=fs.readFileSync(path.join(root,'index.html'),'utf8'),overlay=fs.readFileSync(path.join(root,'worker-3d-overlays.js'),'utf8'),bridge=fs.readFileSync(path.join(root,'worker-delete-durable-fix.js'),'utf8');
 const worker=(await import(pathToFileURL(path.join(root,'worker-delete-durable-fix.js')))).default;
 const response=await worker.fetch(new Request('https://fixture.invalid/'),{ASSETS:{fetch:async()=>new Response(source,{headers:{'content-type':'text/html'}})},PRIVATE_LIBRARY_DB:{prepare(){throw Error('Data access prohibited')}}},{waitUntil(){throw Error('Background prohibited')}});
 const html=await response.text();const exportSource=fs.readFileSync(path.join(root,'worker-gpx-export.js'),'utf8');validateExportHtml(html,exportSource);
 for(const text of ['function serializeGpxSelection(','function installGpxExport()','#mancardoGpxExport{'])assert.throws(()=>validateExportHtml(html.replace(text,'REMOVED'),exportSource));
validateInsertHtml(html,source);validateCancelHtml(html,source);validateDeleteHtml(html,source,bridge);validateFuelDisabledHtml(html,source,overlay);
 assert.throws(()=>validateInsertHtml(html.replace('seg.splice(target.index,0,point);','seg.push(point);'),source));
 for(const line of source.split('\n').filter(line=>line.includes('pendingInsert')||line.includes('chooseInsertPoint')||line.includes('insertPointBtn')))assert.throws(()=>validateInsertHtml(html.replace(line,'/* missing hook */'),source),line);
 assert.throws(()=>validateInsertHtml(html.replace('id="insertPointBtn"','id="missingInsert"'),source));
 assert.throws(()=>validateFuelDisabledHtml(html.replace('const fuelOverlayEnabled=false;','const fuelOverlayEnabled=true;'),source,overlay));
});
