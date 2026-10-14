import baseWorker from './worker-resource-optimized.js';

const SHARED_LIST='/api/tracks';
const MAX_NOTE=40;
function cleanNote(v){return String(v==null?'':v).trim().slice(0,MAX_NOTE);}
function decodeXml(s){return String(s||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');}
function readNoteFromGpx(gpx){const m=String(gpx||'').match(/<mancardoNote>([\s\S]*?)<\/mancardoNote>/i);return m?cleanNote(decodeXml(m[1])):'';}

const CLIENT=String.raw`
<style id="mancardo-stable-note-styles">
.shared-item-note{margin:.08rem 0 .34rem;padding:.28rem .38rem;border-left:3px solid var(--accent);background:var(--surface-2);font-size:.72rem;line-height:1.3;color:var(--text);white-space:pre-wrap;overflow-wrap:anywhere}
.mancardo-note-icon{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;min-width:18px;margin-left:.28rem;vertical-align:middle;color:var(--text);opacity:.9;pointer-events:none}
.mancardo-note-icon svg{display:block;width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.shared-item-name .mancardo-note-icon{width:16px;height:16px;min-width:16px;margin-left:.3rem}.shared-item-name .mancardo-note-icon svg{width:16px;height:16px}
</style>
<script id="mancardo-stable-note-ui">
(function(){
  if(window.__mancardoStableNoteUiInstalled)return;window.__mancardoStableNoteUiInstalled=true;
  var KEY='switchback_local_tracks_v1',pending=Object.create(null),timers=Object.create(null),pulling=false;
  var svg='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"></path><path d="M16 3v5h5"></path><path d="M7 10h7"></path><path d="M7 14h5"></path></svg>';
  function clean(v){return String(v==null?'':v).trim().slice(0,40)}
  function lib(){try{var x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[]}catch(e){return []}}
  function byId(id){var a=lib(),s=String(id||'');for(var i=0;i<a.length;i++)if(a[i]&&String(a[i].id)===s)return a[i];return null}
  function icon(t){var s=document.createElement('span');s.className='mancardo-note-icon';s.title=t||'Track note';s.innerHTML=svg;return s}
  function decorateLocal(){document.querySelectorAll('#trackList .track-item[data-track-id]:not(.mancardo-waypoint-item)').forEach(function(c){var it=byId(c.getAttribute('data-track-id')),n=c.querySelector('.ti-name'),old=c.querySelector('.mancardo-note-icon');if(!it||!clean(it.note)){if(old)old.remove();return}if(!old&&n)n.insertAdjacentElement('afterend',icon('Note: '+clean(it.note)));else if(old)old.title='Note: '+clean(it.note)})}
  function decorateShared(){fetch('/api/tracks',{credentials:'include',cache:'no-store',headers:{accept:'application/json'}}).then(function(r){return r.ok?r.json():null}).then(function(d){if(!d||!Array.isArray(d.tracks))return;var map={};d.tracks.forEach(function(t){if(t&&t.name)map[String(t.name).trim()]=t});document.querySelectorAll('#sharedTrackList .shared-item:not(.mancardo-shared-waypoint-item)').forEach(function(c){var ne=c.querySelector('.shared-item-name'),me=c.querySelector('.shared-item-meta');if(!ne)return;var plain='';for(var n=ne.firstChild;n;n=n.nextSibling)if(n.nodeType===3)plain+=n.nodeValue||'';var it=map[String(plain||ne.textContent||'').trim()],oi=ne.querySelector('.mancardo-note-icon'),on=c.querySelector('.shared-item-note');if(!it||!clean(it.note)){if(oi)oi.remove();if(on)on.remove();return}if(!oi)ne.appendChild(icon('Note: '+clean(it.note)));if(!on){on=document.createElement('div');on.className='shared-item-note';if(me&&me.nextSibling)c.insertBefore(on,me.nextSibling);else c.appendChild(on)}on.textContent=clean(it.note)})}).catch(function(){})}
  function api(u,o){o=o||{};o.credentials='include';o.cache='no-store';o.headers=Object.assign({accept:'application/json'},o.headers||{});return fetch(u,o)}
  function sync(id,note,retry){var s=String(id||''),local=byId(s);if(!s||!local||!navigator.onLine)return;var wanted=clean(note);pending[s]=wanted;api('/api/private-library/tracks/'+encodeURIComponent(s)).then(function(r){if(r.status===404)return {r:r,d:null};return r.json().catch(function(){return {}}).then(function(d){return {r:r,d:d}})}).then(function(x){if(x.r.status===401||x.r.status===503){delete pending[s];return null}var base=0,remote=null;if(x.r.ok&&x.d){base=Number(x.d.revision)||0;remote=x.d.track||null}else if(x.r.status!==404)throw new Error();var merged=remote&&typeof remote==='object'?JSON.parse(JSON.stringify(remote)):JSON.parse(JSON.stringify(local));merged.id=local.id;merged.type=local.type;merged.name=local.name;merged.note=wanted;return api('/api/private-library/tracks/'+encodeURIComponent(s),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({base_revision:base,track:merged})})}).then(function(r){if(!r)return;if(r.ok){delete pending[s];return}if(r.status===409&&!retry)return sync(s,wanted,true);delete pending[s]}).catch(function(){delete pending[s]})}
  function queue(id,note){var s=String(id||'');if(!s)return;clearTimeout(timers[s]);timers[s]=setTimeout(function(){sync(s,note,false)},650)}
  function pull(){if(pulling||!navigator.onLine)return;pulling=true;api('/api/private-library/tracks?since=0&limit=500').then(function(r){return r.ok?r.json():null}).then(function(d){if(!d||!Array.isArray(d.items))return;var a=lib(),m={};a.forEach(function(t){if(t)m[String(t.id)]=t});var changed=false;d.items.forEach(function(x){if(!x||x.deleted||!x.track||!Object.prototype.hasOwnProperty.call(x.track,'note'))return;var id=String(x.track_id||x.track.id||'');if(!id||pending[id]||!m[id])return;var n=clean(x.track.note);if(clean(m[id].note)!==n){m[id].note=n;changed=true}});if(changed){localStorage.setItem(KEY,JSON.stringify(a));decorateLocal()}}).catch(function(){}).finally(function(){pulling=false})}
  document.addEventListener('input',function(e){var t=e.target;if(!t||t.tagName!=='TEXTAREA'||!t.closest('.track-note'))return;var c=t.closest('.track-item[data-track-id]');if(c){queue(c.getAttribute('data-track-id'),t.value);setTimeout(decorateLocal,0)}},true);
  new MutationObserver(function(){setTimeout(function(){decorateLocal();decorateShared()},120)}).observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('focus',function(){pull();decorateShared()});window.addEventListener('online',function(){pull();decorateShared()});document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'){pull();decorateShared()}});setTimeout(function(){pull();decorateLocal();decorateShared()},800);setInterval(function(){if(document.visibilityState==='visible'&&navigator.onLine)pull()},60000);
})();
</script>`;

function embedNoteInBuildGpx(html){
  const routeNeedle="    lines.push('  <rte>');\n    lines.push('    <name>'+esc(item.name)+'</name>');\n    var routePts=[];";
  const routeReplacement="    lines.push('  <rte>');\n    lines.push('    <name>'+esc(item.name)+'</name>');\n    if(item.note)lines.push('    <extensions><mancardoNote>'+esc(String(item.note).slice(0,40))+'</mancardoNote></extensions>');\n    var routePts=[];";
  const trackNeedle="    lines.push('  <trk>');\n    lines.push('    <name>'+esc(item.name)+'</name>');\n    item.segments.forEach(function(seg){";
  const trackReplacement="    lines.push('  <trk>');\n    lines.push('    <name>'+esc(item.name)+'</name>');\n    if(item.note)lines.push('    <extensions><mancardoNote>'+esc(String(item.note).slice(0,40))+'</mancardoNote></extensions>');\n    item.segments.forEach(function(seg){";
  return html.replace(routeNeedle,routeReplacement).replace(trackNeedle,trackReplacement);
}

function addSharedNoteAutosync(html){
  const needle="function saveTrackNote(id,value){\n  var item=state.library.find(function(t){return t.id===id;});if(!item)return;\n  item.note=String(value||'').slice(0,40);item.updatedAt=new Date().toISOString();\n  if(state.currentId===id&&state.current)state.current.note=item.note;\n  persistLibrary();\n}";
  const replacement="var mancardoSharedNoteTimers={};\nfunction mancardoSyncSharedNote(item,retry){if(!item||!item.sharedId||!item.sharedBaseVersion||!navigator.onLine)return;var endpoint=SHARED_API+'/api/tracks/'+encodeURIComponent(item.sharedId)+'/publish';var payload={modifiedBy:(els.sharedUserSelect.value||'Justin'),gpx:buildGpx(item),basedOnVersion:Number(item.sharedBaseVersion)};fetch(endpoint,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(function(r){return r.json().catch(function(){return {}}).then(function(d){return {r:r,d:d}})}).then(function(x){if(x.r.ok){item.sharedId=x.d.id||item.sharedId;item.sharedBaseVersion=Number(x.d.version)||item.sharedBaseVersion;item.sharedBaseModifiedAt=x.d.modifiedAt||item.sharedBaseModifiedAt;persistLibrary();loadSharedLibrary();return}if(x.r.status===409&&!retry&&x.d&&x.d.currentVersion){item.sharedBaseVersion=Number(x.d.currentVersion);persistLibrary();mancardoSyncSharedNote(item,true)}}).catch(function(){})}\nfunction saveTrackNote(id,value){\n  var item=state.library.find(function(t){return t.id===id;});if(!item)return;\n  item.note=String(value||'').slice(0,40);item.updatedAt=new Date().toISOString();\n  if(state.currentId===id&&state.current)state.current.note=item.note;\n  persistLibrary();\n  if(item.sharedId&&item.sharedBaseVersion){clearTimeout(mancardoSharedNoteTimers[id]);mancardoSharedNoteTimers[id]=setTimeout(function(){mancardoSyncSharedNote(item,false)},900)}\n}";
  return html.replace(needle,replacement);
}

async function addNotesToList(response,env){
  if(!response.ok||!env.PRIVATE_LIBRARY_DB)return response;
  try{
    const data=await response.clone().json();if(!data||!Array.isArray(data.tracks)||!data.tracks.length)return response;
    const r=await env.PRIVATE_LIBRARY_DB.prepare('SELECT track_id,gpx FROM shared_library_tracks WHERE deleted=0').all();
    const notes={};for(const row of (r.results||[]))notes[String(row.track_id)]=readNoteFromGpx(row.gpx);
    for(const item of data.tracks){const n=notes[String(item.id)];if(n)item.note=n;}
    const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('content-type','application/json; charset=utf-8');
    return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
  }catch(e){return response;}
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);let response=await baseWorker.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname===SHARED_LIST)response=await addNotesToList(response,env);
    const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;
    let html=await response.text();html=embedNoteInBuildGpx(html);html=addSharedNoteAutosync(html);
    if(!html.includes('mancardo-stable-note-ui')){const i=html.toLowerCase().lastIndexOf('</body>');html=i>=0?html.slice(0,i)+CLIENT+'\n'+html.slice(i):html+CLIENT;}
    const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store, max-age=0');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
