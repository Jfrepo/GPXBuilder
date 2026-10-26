import baseWorker from './worker-waypoint-save.js';

// Pure serializer: explicit selected saved items only; never creates corner waypoints.
export function serializeGpxSelection(tracks, waypoints) {
  function text(value) {
    const s=String(value==null?'':value);
    for(const c of s){const n=c.codePointAt(0);if(!(n===9||n===10||n===13||(n>=32&&n<=0xd7ff)||(n>=0xe000&&n<=0xfffd)||(n>=0x10000&&n<=0x10ffff)))throw Error('An item contains text that cannot be written to XML.');}
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  }
  function number(value,label){if((typeof value!=='number'&&typeof value!=='string')||String(value).trim()===''||!Number.isFinite(Number(value)))throw Error('Invalid '+label+'. Nothing was exported.');return Number(value);}
  function decimal(n){const s=String(n);if(!/[eE]/.test(s))return s;const parts=s.split(/[eE]/),negative=parts[0][0]==='-',coefficient=parts[0].replace('-',''),digits=coefficient.replace('.',''),at=(coefficient.includes('.')?coefficient.indexOf('.'):coefficient.length)+Number(parts[1]);return (negative?'-':'')+(at<=0?'0.'+'0'.repeat(-at)+digits:at>=digits.length?digits+'0'.repeat(at-digits.length):digits.slice(0,at)+'.'+digits.slice(at));}
  function tag(name,value){return value==null?'':'<'+name+'>'+text(value)+'</'+name+'>';}
  function extensions(item,fields){const body=fields.filter(k=>item[k]!=null).map(k=>tag('mancardo:'+k,item[k])).join('');return body?'<extensions>'+body+'</extensions>':'';}
  function point(p,kind){
    const lat=number(p.lat,'latitude'),lon=number(p.lon,'longitude');
    if(lat< -90||lat>90||lon< -180||lon>=180)throw Error('Coordinates are outside GPX bounds. Nothing was exported.');
    let out='<'+kind+' lat="'+decimal(lat)+'" lon="'+decimal(lon)+'">';
    if(p.ele!=null)out+=tag('ele',decimal(number(p.ele,'elevation')));
    if(p.time!=null){if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(String(p.time))||!Number.isFinite(Date.parse(p.time)))throw Error('Invalid recorded time. Nothing was exported.');const parts=String(p.time).match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)/),year=Number(parts[1]),month=Number(parts[2]),day=Number(parts[3]),days=[31,(year%4===0&&(year%100!==0||year%400===0))?29:28,31,30,31,30,31,31,30,31,30,31];if(!year||month<1||month>12||day<1||day>days[month-1]||Number(parts[4])>23||Number(parts[5])>59||Number(parts[6])>59)throw Error('Invalid recorded time. Nothing was exported.');const zone=String(p.time).match(/([+-])(\d\d):(\d\d)$/);if(zone&&(Number(zone[2])>14||Number(zone[3])>59||(Number(zone[2])===14&&Number(zone[3])!==0)))throw Error('Invalid recorded time. Nothing was exported.');out+=tag('time',p.time);}
    if(kind==='wpt'){
      out+=tag('name',p.name||'Waypoint')+tag('cmt',p.cmt??p.comment)+tag('desc',p.desc??p.description??p.note)+tag('sym',p.sym)+tag('type',p.type??p.icon);
      out+=extensions(p,['icon','note','createdAt','updatedAt']);
    }
    return out+'</'+kind+'>';
  }
  if(!Array.isArray(tracks)||!Array.isArray(waypoints)||!tracks.length&&!waypoints.length)throw Error('Choose at least one track or waypoint.');
  let xml='<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Mancardo" xmlns="http://www.topografix.com/GPX/1/1" xmlns:mancardo="https://mancardo.com/gpx">';
  for(const w of waypoints)xml+=point(w,'wpt');
  for(const route of [true,false])for(const item of tracks){
    if((item.type==='route')!==route)continue;
    if(!Array.isArray(item.segments)||!item.segments.some(s=>Array.isArray(s)&&s.length))throw Error('A selected track has no geometry. Nothing was exported.');
    const details=tag('name',item.name)+tag('desc',item.note)+extensions(item,['color']);
    if(!route)xml+='<trk>'+details;
    for(const seg of item.segments){if(!Array.isArray(seg))throw Error('Invalid track segment.');if(route&&!seg.length)continue;xml+=route?'<rte>'+details:'<trkseg>';for(const p of seg)xml+=point(p,route?'rtept':'trkpt');xml+=route?'</rte>':'</trkseg>';}
    if(!route)xml+='</trk>';
  }
  return xml+'</gpx>\n';
}

const EXPORT_CSS=String.raw`<style id="mancardo-gpx-export-style">
#mancardoGpxExport{width:min(540px,calc(100vw - 32px));max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);box-sizing:border-box;overflow:auto;border:1px solid var(--border);border-radius:12px;background:var(--surface,#fff);color:var(--text,#222);padding:20px}
#mancardoGpxExportBtn{min-height:44px!important;white-space:normal!important;padding:6px!important}#mancardoGpxExport::backdrop{background:#0008}#mancardoGpxExport h2{margin:0 0 12px}#mancardoGpxExport p{font-size:.9rem;line-height:1.4}
#mancardoGpxExportItems{max-height:45vh;max-height:45dvh;overflow:auto}#mancardoGpxExport fieldset{min-width:0;border:1px solid var(--border);margin:12px 0;padding:8px}#mancardoGpxExport label{display:flex;align-items:center;gap:10px;padding:8px;min-height:28px;overflow-wrap:anywhere}#mancardoGpxExport input{flex:none}
#mancardoGpxExport button{min-height:44px;padding:8px 12px;margin:4px;cursor:pointer}#mancardoGpxExport .export-actions{display:flex;flex-wrap:wrap}#mancardoGpxExportStatus{min-height:1.5em}
</style>`;
const EXPORT_UI=String.raw`
(function installGpxExport(){
 if(document.getElementById('mancardoGpxExportBtn'))return;
 const key='mancardo_saved_waypoints_v1';let snapshot=null,busy=false;
 const button=document.createElement('button');button.id='mancardoGpxExportBtn';button.className='icon-btn';button.textContent='Export GPX…';button.title='Choose saved tracks and waypoints to export';els.exportSelectedBtn.insertAdjacentElement('afterend',button);
 const dialog=document.createElement('dialog');dialog.id='mancardoGpxExport';dialog.setAttribute('aria-labelledby','mancardoGpxExportTitle');
 dialog.innerHTML='<h2 id="mancardoGpxExportTitle">Export tracks and waypoints</h2><p>Choose saved items below. Map visibility and search filters do not select items for export. Save track edits first to include them.</p><div id="mancardoGpxExportItems"></div><p id="mancardoGpxExportStatus" role="status" aria-live="polite"></p><div class="export-actions"><button type="button" id="mancardoGpxDownload">Download GPX</button><button type="button" id="mancardoGpxShare">Share GPX…</button><button type="button" id="mancardoGpxClose">Close</button></div><p>On iPhone, use Share when available, or download and open the file in Files. Sharing options depend on your browser and installed apps.</p>';
 document.body.appendChild(dialog);
 const items=dialog.querySelector('#mancardoGpxExportItems'),status=dialog.querySelector('#mancardoGpxExportStatus'),download=dialog.querySelector('#mancardoGpxDownload'),share=dialog.querySelector('#mancardoGpxShare');
 function selected(){const result={tracks:[],waypoints:[]};items.querySelectorAll('input:checked').forEach(c=>result[c.dataset.kind].push(snapshot[c.dataset.kind][Number(c.dataset.index)]));return result;}
 function file(){if(!snapshot||snapshot.waypointBytes!==(localStorage.getItem(key)||'[]')||snapshot.trackBytes!==JSON.stringify(state.library||[]))throw Error('Saved items changed. Close and reopen Export to review them.');const s=selected();return new File([serializeGpxSelection(s.tracks,s.waypoints)],s.tracks.length?'mancardo-tracks-waypoints.gpx':'mancardo-waypoints.gpx',{type:'application/gpx+xml'});}
 function update(){const s=selected(),count=s.tracks.length+s.waypoints.length;status.textContent=s.tracks.length+' tracks/routes and '+s.waypoints.length+' waypoints selected';download.disabled=!count||busy;share.disabled=true;if(count&&!busy&&navigator.share&&navigator.canShare){try{share.disabled=!navigator.canShare({files:[file()]});}catch(e){status.textContent=e.message;}}}
 function open(id){
   if(busy)return;try{const w=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(w)||w.some(x=>!x||typeof x!=='object'||Array.isArray(x)))throw Error('Saved waypoint data could not be read.');snapshot={tracks:JSON.parse(JSON.stringify(state.library||[])),waypoints:w,waypointBytes:localStorage.getItem(key)||'[]',trackBytes:JSON.stringify(state.library||[])};}catch(e){window.alert('Saved items could not be read. Nothing was exported.');return;}
   items.replaceChildren();for(const kind of ['tracks','waypoints']){
     const field=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=kind==='tracks'?'Saved tracks and routes':'Saved waypoints';field.appendChild(legend);
     for(const all of [true,false]){const b=document.createElement('button');b.type='button';b.textContent=all?'Select all '+kind:'Clear '+kind;b.onclick=()=>{field.querySelectorAll('input').forEach(c=>c.checked=all);update();};field.appendChild(b);}
     snapshot[kind].forEach((item,index)=>{const label=document.createElement('label'),c=document.createElement('input');c.type='checkbox';c.dataset.kind=kind;c.dataset.index=String(index);c.checked=kind==='waypoints'&&id!=null&&item.id===id;c.onchange=update;label.appendChild(c);label.appendChild(document.createTextNode(String(item.name||(kind==='tracks'?'Track':'Waypoint'))));field.appendChild(label);});items.appendChild(field);
   }
   update();dialog.showModal();dialog.querySelector('h2').tabIndex=-1;dialog.querySelector('h2').focus();
 }
 button.onclick=()=>open();dialog.querySelector('#mancardoGpxClose').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 dialog.addEventListener('close',()=>{if(!busy){snapshot=null;items.replaceChildren();}button.focus();});
 download.onclick=()=>{try{const f=file(),url=URL.createObjectURL(f),a=document.createElement('a');a.href=url;a.download=f.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent='Download requested. Check your browser downloads or Files.';}catch(e){status.textContent=e.message;}};
 share.onclick=async()=>{try{const f=file();if(!navigator.canShare||!navigator.canShare({files:[f]}))throw Error('File sharing is unavailable. Use Download GPX.');busy=true;update();await navigator.share({files:[f],title:'Mancardo GPX'});status.textContent='Share dialog completed.';}catch(e){status.textContent=e.name==='AbortError'?'Sharing cancelled. No file was downloaded.':'Sharing unavailable. Use Download GPX.';}finally{busy=false;if(dialog.open){const message=status.textContent;update();status.textContent=message;}else{snapshot=null;items.replaceChildren();}}};
 const baseRender=renderLibrary;renderLibrary=function(){const result=baseRender.apply(this,arguments);addCardExports();return result;};
 function addCardExports(){document.querySelectorAll('.mancardo-waypoint-item .track-menu').forEach(menu=>{if(menu.querySelector('[data-export-waypoint]'))return;const b=document.createElement('button');b.type='button';b.dataset.exportWaypoint='true';b.textContent='Export GPX…';b.onclick=e=>{e.stopPropagation();open(menu.closest('[data-waypoint-id]').getAttribute('data-waypoint-id'));};menu.appendChild(b);});}
 addCardExports();
})();
`;
export default {async fetch(request,env,ctx){const response=await baseWorker.fetch(request,env,ctx);if(!(response.headers.get('content-type')||'').includes('text/html'))return response;let html=await response.text();if(!html.includes('function installGpxExport()')){html=html.replace('</head>',EXPORT_CSS+'</head>');html=html.replace('// ---------- boot ----------',serializeGpxSelection.toString()+'\n'+EXPORT_UI+'\n// ---------- boot ----------');}const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');return new Response(html,{status:response.status,statusText:response.statusText,headers});}};
