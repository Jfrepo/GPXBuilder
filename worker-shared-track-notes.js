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
.mancardo-note-icon{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;min-width:18px;margin-left:.28rem;vertical-align:middle;color:var(--text);opacity:.9;pointer-events:none}
.mancardo-note-icon svg{display:block;width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.track-row>.mancardo-note-icon{margin-left:.05rem;margin-right:.12rem}
.shared-item-name .mancardo-note-icon{width:16px;height:16px;min-width:16px;margin-left:.3rem}
.shared-item-name .mancardo-note-icon svg{width:16px;height:16px}
</style>
<script id="mancardo-shared-track-notes">
(function(){
  if(window.__mancardoSharedTrackNotesInstalled)return;window.__mancardoSharedTrackNotesInstalled=true;
  var rawFetch=window.fetch.bind(window);
  var NOTE_KEY='switchback_local_tracks_v1';
  var pendingNotes=Object.create(null),noteTimers=Object.create(null),pullingNotes=false;
  var noteSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"></path><path d="M16 3v5h5"></path><path d="M7 10h7"></path><path d="M7 14h5"></path></svg>';

  function clean(v){return String(v==null?'':v).trim().slice(0,40);}
  function localTracks(){try{var x=JSON.parse(localStorage.getItem(NOTE_KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
  function getLocalTrack(id){
    var sid=String(id||'');
    try{if(window.state&&Array.isArray(state.library)){for(var i=0;i<state.library.length;i++){if(state.library[i]&&String(state.library[i].id)===sid)return state.library[i];}}}catch(e){}
    var lib=localTracks();for(var j=0;j<lib.length;j++){if(lib[j]&&String(lib[j].id)===sid)return lib[j];}
    return null;
  }
  function persistNoteLocally(id,note){
    var sid=String(id||''),changed=false,cleaned=clean(note);
    try{
      if(window.state&&Array.isArray(state.library)){
        for(var i=0;i<state.library.length;i++)if(state.library[i]&&String(state.library[i].id)===sid){if(String(state.library[i].note||'')!==cleaned){state.library[i].note=cleaned;changed=true;}break;}
      }
      if(changed&&typeof window.persistLibrary==='function')window.persistLibrary();
      else if(changed)localStorage.setItem(NOTE_KEY,JSON.stringify(state.library));
      if(changed&&typeof window.renderLibrary==='function')window.renderLibrary();
    }catch(e){}
    return changed;
  }
  function api(url,opts){var o=Object.assign({credentials:'include',cache:'no-store',headers:{accept:'application/json'}},opts||{});return rawFetch(url,o);}
  function getRemote(id){
    return api('/api/private-library/tracks/'+encodeURIComponent(id)).then(function(r){
      if(r.status===404)return {response:r,data:null};
      return r.json().catch(function(){return {};}).then(function(d){return {response:r,data:d};});
    });
  }
  function putRemote(id,base,track){
    return api('/api/private-library/tracks/'+encodeURIComponent(id),{method:'PUT',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({base_revision:base,track:track})}).then(function(r){return r.json().catch(function(){return {};}).then(function(d){return {response:r,data:d};});});
  }
  function syncNoteNow(id,note,retry){
    var sid=String(id||'');if(!sid||!navigator.onLine)return Promise.resolve(false);
    var local=getLocalTrack(sid);if(!local)return Promise.resolve(false);
    var wanted=clean(note);
    pendingNotes[sid]=wanted;
    return getRemote(sid).then(function(x){
      if(x.response.status===401||x.response.status===503){delete pendingNotes[sid];return false;}
      var base=0,remoteTrack=null;
      if(x.response.ok&&x.data){base=Number(x.data.revision)||0;remoteTrack=x.data.track||null;}
      else if(x.response.status!==404)throw new Error('Note cloud read failed');
      var merged=remoteTrack&&typeof remoteTrack==='object'?JSON.parse(JSON.stringify(remoteTrack)):JSON.parse(JSON.stringify(local));
      merged.id=local.id;merged.type=local.type;merged.name=local.name;merged.note=wanted;
      return putRemote(sid,base,merged).then(function(y){
        if(y.response.ok){delete pendingNotes[sid];return true;}
        if(y.response.status===409&&!retry)return syncNoteNow(sid,wanted,true);
        if(y.response.status===401||y.response.status===503){delete pendingNotes[sid];return false;}
        throw new Error((y.data&&y.data.error)||'Note cloud write failed');
      });
    }).catch(function(e){console.warn('track note replication failed',e);return false;});
  }
  function queueNoteSync(id,note){
    var sid=String(id||'');if(!sid)return;
    pendingNotes[sid]=clean(note);
    clearTimeout(noteTimers[sid]);
    noteTimers[sid]=setTimeout(function(){syncNoteNow(sid,pendingNotes[sid],false);},650);
  }
  function pullNotes(){
    if(pullingNotes||!navigator.onLine)return Promise.resolve(false);pullingNotes=true;
    return api('/api/private-library/tracks?since=0&limit=500').then(function(r){if(!r.ok)return null;return r.json().catch(function(){return null;});}).then(function(data){
      if(!data||!Array.isArray(data.items))return false;
      var any=false;
      data.items.forEach(function(item){
        if(!item||item.deleted||!item.track||!Object.prototype.hasOwnProperty.call(item.track,'note'))return;
        var id=String(item.track_id||item.track.id||'');if(!id||Object.prototype.hasOwnProperty.call(pendingNotes,id))return;
        if(persistNoteLocally(id,item.track.note))any=true;
      });
      return any;
    }).catch(function(e){return false;}).finally(function(){pullingNotes=false;});
  }
  function icon(title){var s=document.createElement('span');s.className='mancardo-note-icon';s.title=title||'Track note';s.innerHTML=noteSvg;return s;}
  function decorateLocalNotes(){
    var cards=document.querySelectorAll('#trackList .track-item[data-track-id]:not(.mancardo-waypoint-item)');
    Array.prototype.forEach.call(cards,function(card){
      var id=String(card.getAttribute('data-track-id')||''),item=getLocalTrack(id),row=card.querySelector('.track-row'),nameEl=card.querySelector('.ti-name');
      var old=card.querySelector('.track-row>.mancardo-note-icon');
      if(!item||!clean(item.note)){if(old)old.remove();return;}
      if(!old&&row&&nameEl)nameEl.insertAdjacentElement('afterend',icon('Note: '+clean(item.note)));
      else if(old)old.title='Note: '+clean(item.note);
    });
  }
  function xmlName(gpx){var m=String(gpx||'').match(/<(?:trk|rte)\b[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>/i);if(!m)return '';var d=document.createElement('textarea');d.innerHTML=m[1];return String(d.value||'').trim();}
  function noteForBody(body){
    var name=String((body&&body.name)||xmlName(body&&body.gpx)||'').trim();if(!name)return '';
    var lib=localTracks();for(var i=0;i<lib.length;i++){var t=lib[i];if(t&&String(t.name||'').trim()===name)return clean(t.note);}return '';
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
      var nameEl=card.querySelector('.shared-item-name'),metaEl=card.querySelector('.shared-item-meta');if(!nameEl)return;
      var plainName='';for(var n=nameEl.firstChild;n;n=n.nextSibling){if(n.nodeType===3)plainName+=n.nodeValue||'';}
      var name=String(plainName||nameEl.textContent||'').trim(),meta=String(metaEl&&metaEl.textContent||''),item=null;
      var list=(window.state&&Array.isArray(state.sharedLibrary))?state.sharedLibrary:[];
      for(var i=0;i<list.length;i++){var x=list[i];if(x&&String(x.name||'').trim()===name&&(!meta||meta.indexOf('v'+(x.version||1))!==-1)){item=x;break;}}
      var oldNote=card.querySelector('.shared-item-note'),oldIcon=nameEl.querySelector('.mancardo-note-icon');
      if(!item||!item.note){if(oldNote)oldNote.remove();if(oldIcon)oldIcon.remove();return;}
      if(!oldIcon)nameEl.appendChild(icon('Note: '+clean(item.note)));else oldIcon.title='Note: '+clean(item.note);
      if(!oldNote){var d=document.createElement('div');d.className='shared-item-note';d.textContent=item.note;if(metaEl&&metaEl.nextSibling)card.insertBefore(d,metaEl.nextSibling);else card.appendChild(d);}else oldNote.textContent=item.note;
    });
  }
  function refreshDecorations(){decorateLocalNotes();applyNotes();}
  document.addEventListener('input',function(ev){
    var ta=ev.target;if(!ta||ta.tagName!=='TEXTAREA'||!ta.closest('.track-note'))return;
    var card=ta.closest('.track-item[data-track-id]');if(!card)return;
    queueNoteSync(card.getAttribute('data-track-id'),ta.value);setTimeout(decorateLocalNotes,0);
  },true);
  document.addEventListener('change',function(ev){
    var ta=ev.target;if(!ta||ta.tagName!=='TEXTAREA'||!ta.closest('.track-note'))return;
    var card=ta.closest('.track-item[data-track-id]');if(card)queueNoteSync(card.getAttribute('data-track-id'),ta.value);
  },true);
  var orig=window.renderSharedLibrary;
  if(typeof orig==='function')window.renderSharedLibrary=function(){var r=orig.apply(this,arguments);setTimeout(refreshDecorations,0);return r;};
  new MutationObserver(function(){setTimeout(refreshDecorations,0);}).observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('focus',function(){setTimeout(pullNotes,450);});
  window.addEventListener('online',function(){setTimeout(pullNotes,450);});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')setTimeout(pullNotes,500);});
  setInterval(function(){if(document.visibilityState==='visible'&&navigator.onLine)pullNotes();},60000);
  setTimeout(function(){pullNotes();refreshDecorations();},900);
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
