import baseWorker from './worker-resource-optimized.js';

const SHARED_LIST='/api/tracks';
const NOTE_TAG='mancardoNote';
const MAX_NOTE=40;

function escapeXml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
function decodeXml(s){return String(s||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');}
function cleanNote(v){return String(v||'').trim().slice(0,MAX_NOTE);}
function readNoteFromGpx(gpx){
  const m=String(gpx||'').match(/<mancardoNote>([\s\S]*?)<\/mancardoNote>/i);
  return m?cleanNote(decodeXml(m[1])):'';
}
function writeNoteToGpx(gpx,note){
  let s=String(gpx||'');
  s=s.replace(/\s*<extensions>\s*<mancardoNote>[\s\S]*?<\/mancardoNote>\s*<\/extensions>/ig,'');
  if(!note)return s;
  const ext='<extensions><'+NOTE_TAG+'>'+escapeXml(note)+'</'+NOTE_TAG+'></extensions>';
  const trackName=/<trk\b[^>]*>[\s\S]*?<name>[\s\S]*?<\/name>/i;
  const routeName=/<rte\b[^>]*>[\s\S]*?<name>[\s\S]*?<\/name>/i;
  if(trackName.test(s))return s.replace(trackName,m=>m+'\n    '+ext);
  if(routeName.test(s))return s.replace(routeName,m=>m+'\n    '+ext);
  return s;
}

const CLIENT=String.raw`
<style id="mancardo-shared-track-note-styles">
.shared-item-note{margin:.08rem 0 .34rem;padding:.28rem .38rem;border-left:3px solid var(--accent);background:var(--surface-2);font-size:.72rem;line-height:1.3;color:var(--text);white-space:pre-wrap;overflow-wrap:anywhere}
</style>
<script id="mancardo-shared-track-notes">
(function(){
  if(window.__mancardoSharedTrackNotesInstalled)return;window.__mancardoSharedTrackNotesInstalled=true;
  var rawFetch=window.fetch.bind(window);
  function localTracks(){try{var x=JSON.parse(localStorage.getItem('switchback_local_tracks_v1')||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
  function xmlName(gpx){var m=String(gpx||'').match(/<(?:trk|rte)\b[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>/i);if(!m)return '';var d=document.createElement('textarea');d.innerHTML=m[1];return String(d.value||'').trim();}
  function noteForBody(body){
    var name=String((body&&body.name)||xmlName(body&&body.gpx)||'').trim();if(!name)return '';
    var lib=localTracks();for(var i=0;i<lib.length;i++){var t=lib[i];if(t&&String(t.name||'').trim()===name)return String(t.note||'').trim().slice(0,40);}return '';
  }
  window.fetch=function(input,init){
    try{
      var url=typeof input==='string'?input:(input&&input.url)||'';var method=String((init&&init.method)||'GET').toUpperCase();
      if(method==='POST'&&(url==='/api/tracks'||/\/api\/tracks\/[^/]+\/publish(?:\?|$)/.test(url))&&init&&typeof init.body==='string'){
        var b=JSON.parse(init.body||'{}');b.note=noteForBody(b);init=Object.assign({},init,{body:JSON.stringify(b)});
      }
    }catch(e){}
    return rawFetch(input,init);
  };
  function applyNotes(){
    var cards=document.querySelectorAll('#sharedTrackList .shared-item:not(.mancardo-shared-waypoint-item)');
    Array.prototype.forEach.call(cards,function(card){
      if(card.querySelector('.shared-item-note'))return;
      var nameEl=card.querySelector('.shared-item-name'),metaEl=card.querySelector('.shared-item-meta');if(!nameEl)return;
      var name=String(nameEl.textContent||'').trim();var meta=String(metaEl&&metaEl.textContent||'');var item=null;
      var list=(window.state&&Array.isArray(state.sharedLibrary))?state.sharedLibrary:[];
      for(var i=0;i<list.length;i++){var x=list[i];if(x&&String(x.name||'').trim()===name&&(!meta||meta.indexOf('v'+(x.version||1))!==-1)){item=x;break;}}
      if(!item||!item.note)return;
      var n=document.createElement('div');n.className='shared-item-note';n.textContent=item.note;
      if(metaEl&&metaEl.nextSibling)card.insertBefore(n,metaEl.nextSibling);else card.appendChild(n);
    });
  }
  var orig=window.renderSharedLibrary;
  if(typeof orig==='function')window.renderSharedLibrary=function(){var r=orig.apply(this,arguments);setTimeout(applyNotes,0);return r;};
  new MutationObserver(function(){setTimeout(applyNotes,0);}).observe(document.documentElement,{subtree:true,childList:true});
  setTimeout(applyNotes,500);
})();
</script>`;

async function rewriteSharedPost(request){
  try{
    const raw=await request.clone().text();
    const body=JSON.parse(raw||'{}');
    if(typeof body.gpx!=='string')return request;
    body.gpx=writeNoteToGpx(body.gpx,cleanNote(body.note));
    delete body.note;
    const headers=new Headers(request.headers);headers.set('content-type','application/json');headers.delete('content-length');
    return new Request(request.url,{method:request.method,headers,body:JSON.stringify(body),redirect:request.redirect,credentials:request.credentials,cache:request.cache});
  }catch(e){return request;}
}

async function addNotesToList(response,env){
  if(!response.ok||!env.PRIVATE_LIBRARY_DB)return response;
  try{
    const data=await response.clone().json();
    if(!data||!Array.isArray(data.tracks)||!data.tracks.length)return response;
    const r=await env.PRIVATE_LIBRARY_DB.prepare('SELECT track_id,gpx FROM shared_library_tracks WHERE deleted=0').all();
    const notes={};for(const row of (r.results||[]))notes[String(row.track_id)]=readNoteFromGpx(row.gpx);
    for(const item of data.tracks){const n=notes[String(item.id)];if(n)item.note=n;}
    const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');
    return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
  }catch(e){return response;}
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const isSharedPost=request.method==='POST'&&(url.pathname===SHARED_LIST||/^\/api\/tracks\/[^/]+\/publish$/.test(url.pathname));
    const req=isSharedPost?await rewriteSharedPost(request):request;
    let response=await baseWorker.fetch(req,env,ctx);
    if(request.method==='GET'&&url.pathname===SHARED_LIST)response=await addNotesToList(response,env);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=await response.text();
    if(!html.includes('mancardo-shared-track-notes')){const i=html.toLowerCase().lastIndexOf('</body>');html=i>=0?html.slice(0,i)+CLIENT+'\n'+html.slice(i):html+CLIENT;}
    const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store, max-age=0');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
