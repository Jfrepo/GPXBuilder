import baseWorker from './worker-waypoint-save.js';

// Pure serializer: explicit selected saved items only; never creates corner waypoints.
export const GPX_SERIALIZER=String.raw`function serializeGpxSelection(tracks, waypoints) {
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
}`;

const EXPORT_CSS=String.raw`<style id="mancardo-gpx-export-style">
#mancardoGpxExport{width:min(540px,calc(100vw - 32px));max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);box-sizing:border-box;overflow:auto;border:1px solid var(--border);border-radius:12px;background:var(--surface,#fff);color:var(--text,#222);padding:20px}
#mancardoGpxExport::backdrop{background:#0008}#mancardoGpxExport h2{margin:0 0 12px}#mancardoGpxExport p{font-size:.9rem;line-height:1.4}
#mancardoGpxExportItems{max-height:45vh;max-height:45dvh;overflow:auto}#mancardoGpxExport fieldset{min-width:0;border:1px solid var(--border);margin:12px 0;padding:8px}#mancardoGpxExport li{padding:6px 0;overflow-wrap:anywhere}
#mancardoGpxExport button{min-height:44px;padding:8px 12px;margin:4px;cursor:pointer}#mancardoGpxExport .export-actions{display:flex;flex-wrap:wrap}#mancardoGpxExportStatus{min-height:1.5em}
</style>`;
const EXPORT_UI=String.raw`
(function installGpxExport(){
 if(document.getElementById('mancardoGpxExport'))return;
 const key='mancardo_saved_waypoints_v1';let snapshot=null,busy=false,opener=null;
 const button=els.exportSelectedBtn;button.textContent='Export';button.title='Export ticked tracks and waypoints';button.setAttribute('aria-label',button.title);
 els.exportBtn.title='Export current track';els.exportBtn.setAttribute('aria-label','Export current track');els.exportBtn.dataset.tooltip='Export current track';
 const dialog=document.createElement('dialog');dialog.id='mancardoGpxExport';dialog.setAttribute('aria-labelledby','mancardoGpxExportTitle');
 dialog.innerHTML='<h2 id="mancardoGpxExportTitle">Export ticked items</h2><p id="mancardoGpxExportScope">Includes all ticked saved tracks and waypoints in My Library, including items hidden by search or filters. Unticked items are excluded. Save track edits first to include them.</p><div id="mancardoGpxExportItems"></div><p id="mancardoGpxExportStatus" role="status" aria-live="polite"></p><div class="export-actions"><button type="button" id="mancardoGpxDownload">Download GPX</button><button type="button" id="mancardoGpxShare">Share GPX…</button><button type="button" id="mancardoGpxClose">Cancel</button></div><p>On iPhone, use Share when available, or download and open the file in Files. Sharing options depend on your browser and installed apps.</p>';
 document.body.appendChild(dialog);
 const items=dialog.querySelector('#mancardoGpxExportItems'),status=dialog.querySelector('#mancardoGpxExportStatus'),download=dialog.querySelector('#mancardoGpxDownload'),share=dialog.querySelector('#mancardoGpxShare');
 function file(){if(!snapshot||snapshot.waypointBytes!==(localStorage.getItem(key)||'[]')||snapshot.trackBytes!==JSON.stringify(state.library||[]))throw Error('Saved items or ticks changed. Cancel and reopen Export to review them.');return new File([serializeGpxSelection(snapshot.tracks,snapshot.waypoints)],snapshot.tracks.length?'mancardo-tracks-waypoints.gpx':'mancardo-waypoints.gpx',{type:'application/gpx+xml'});}
 function update(){const count=snapshot.tracks.length+snapshot.waypoints.length;status.textContent=count?snapshot.tracks.length+' tracks/routes and '+snapshot.waypoints.length+' waypoints will be exported in one GPX file.':'Nothing is ticked. Cancel and tick items in My Library to export.';download.disabled=!count||busy;share.disabled=true;if(count&&!busy&&navigator.share&&navigator.canShare){try{share.disabled=!navigator.canShare({files:[file()]});}catch(e){status.textContent=e.message;}}}
 function open(scope,trigger){
   if(busy)return;try{const waypointBytes=localStorage.getItem(key)||'[]',w=JSON.parse(waypointBytes);if(!Array.isArray(w)||w.some(x=>!x||typeof x!=='object'||Array.isArray(x)))throw Error('Unreadable saved waypoints.');const trackBytes=JSON.stringify(state.library||[]),tracks=JSON.parse(trackBytes);const single=scope!=null;if(single&&(!['tracks','waypoints'].includes(scope.kind)||typeof scope.id!=='string'))throw Error('Invalid export target.');const chosen=single?(scope.kind==='tracks'?tracks:w).filter(item=>String(item.id)===scope.id):null;if(single&&chosen.length!==1)throw Error('Saved export target changed.');snapshot={tracks:single?(scope.kind==='tracks'?chosen:[]):tracks.filter(t=>t.visible!==false),waypoints:single?(scope.kind==='waypoints'?chosen:[]):w.filter(w=>w.visible!==false),waypointBytes,trackBytes};}catch(e){window.alert('Saved items could not be read. Nothing was exported.');return;}
   opener=trigger||button;
   dialog.querySelector('h2').textContent=scope?'Export saved '+(scope.kind==='tracks'?'track':'waypoint'):'Export ticked items';
   dialog.querySelector('#mancardoGpxExportScope').textContent=scope?'Only this saved '+(scope.kind==='tracks'?'track':'waypoint')+' will be exported, regardless of other ticks. Unsaved editor changes are excluded.':'Includes all ticked saved tracks and waypoints in My Library, including items hidden by search or filters. Unticked items are excluded. Save track edits first to include them.';
   items.replaceChildren();for(const kind of ['tracks','waypoints']){
     if(!snapshot[kind].length)continue;
     const field=document.createElement('fieldset'),legend=document.createElement('legend'),list=document.createElement('ul');legend.textContent=(kind==='tracks'?'Tracks and routes':'Waypoints')+' ('+snapshot[kind].length+')';field.appendChild(legend);
     snapshot[kind].forEach(item=>{const row=document.createElement('li');row.textContent=String(item.name||(kind==='tracks'?'Track':'Waypoint'));list.appendChild(row);});field.appendChild(list);items.appendChild(field);
   }
   update();dialog.showModal();dialog.querySelector('h2').tabIndex=-1;dialog.querySelector('h2').focus();
 }
 button.onclick=()=>open();dialog.querySelector('#mancardoGpxClose').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 dialog.addEventListener('close',()=>{if(!busy){snapshot=null;items.replaceChildren();}(opener&&opener.isConnected?opener:button).focus();});
 download.onclick=()=>{try{const f=file(),url=URL.createObjectURL(f),a=document.createElement('a');a.href=url;a.download=f.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent='Download requested. Check your browser downloads or Files.';}catch(e){status.textContent=e.message;}};
 share.onclick=async()=>{try{const f=file();if(!navigator.canShare||!navigator.canShare({files:[f]}))throw Error('File sharing is unavailable. Use Download GPX.');busy=true;update();await navigator.share({files:[f],title:'Mancardo GPX'});status.textContent='Share dialog completed.';}catch(e){status.textContent=e.name==='AbortError'?'Sharing cancelled. No file was downloaded.':'Sharing unavailable. Use Download GPX.';}finally{busy=false;if(dialog.open){const message=status.textContent;update();status.textContent=message;}else{snapshot=null;items.replaceChildren();}}};
 const baseRender=renderLibrary;renderLibrary=function(){const result=baseRender.apply(this,arguments);addItemExports();return result;};
 function addItemExports(){document.querySelectorAll('#trackList .track-item .track-menu').forEach(menu=>{
   if(menu.querySelector('[data-export-item]'))return;
   const card=menu.closest('.track-item'),waypointId=card.getAttribute('data-waypoint-id'),trackId=card.getAttribute('data-track-id');
   if(waypointId==null&&trackId==null)return;
   const scope={kind:waypointId!=null?'waypoints':'tracks',id:waypointId!=null?waypointId:trackId};
   const action=document.createElement('button');action.type='button';action.dataset.exportItem=scope.kind;action.textContent='Export';action.title='Export this saved '+(scope.kind==='tracks'?'track':'waypoint');action.setAttribute('aria-label',action.title);
   action.onclick=e=>{e.stopPropagation();open(scope,action);};menu.appendChild(action);
 });}
 addItemExports();
})();
`;
export default {async fetch(request,env,ctx){const response=await baseWorker.fetch(request,env,ctx);if(!(response.headers.get('content-type')||'').includes('text/html'))return response;let html=await response.text();if(!html.includes('function installGpxExport()')){html=html.replace('</head>',EXPORT_CSS+'</head>');html=html.replace('// ---------- boot ----------',GPX_SERIALIZER+'\n'+EXPORT_UI+'\n// ---------- boot ----------');}const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');return new Response(html,{status:response.status,statusText:response.statusText,headers});}};
