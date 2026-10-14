import baseWorker from './worker-shared-track-notes.js';

const CLIENT=String.raw`
<script id="mancardo-shared-note-autosync">
(function(){
  if(window.__mancardoSharedNoteAutosyncInstalled)return;
  window.__mancardoSharedNoteAutosyncInstalled=true;
  var timers=Object.create(null),running=Object.create(null),queued=Object.create(null);

  function clean(v){return String(v==null?'':v).trim().slice(0,40);}
  function getTrack(id){
    var sid=String(id||'');
    try{
      if(window.state&&Array.isArray(state.library)){
        for(var i=0;i<state.library.length;i++){
          var t=state.library[i];if(t&&String(t.id)===sid)return t;
        }
      }
    }catch(e){}
    return null;
  }
  function persist(){try{if(typeof window.persistLibrary==='function')window.persistLibrary();}catch(e){}}
  function refreshShared(){try{if(typeof window.loadSharedLibrary==='function')window.loadSharedLibrary();}catch(e){}}

  function publishNote(id){
    var sid=String(id||''),item=getTrack(sid);
    if(!item||!item.sharedId||!item.sharedBaseVersion||typeof window.buildGpx!=='function'||!navigator.onLine)return Promise.resolve(false);
    if(running[sid]){queued[sid]=true;return Promise.resolve(false);}
    running[sid]=true;
    var endpoint='/api/tracks/'+encodeURIComponent(item.sharedId)+'/publish';
    var payload={basedOnVersion:Number(item.sharedBaseVersion),gpx:window.buildGpx(item)};
    return fetch(endpoint,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
      .then(function(r){return r.json().catch(function(){return {};}).then(function(d){return {r:r,d:d};});})
      .then(function(x){
        if(!x.r.ok){
          if(x.r.status===409&&x.d&&x.d.currentVersion){item.sharedBaseVersion=Number(x.d.currentVersion);persist();return false;}
          throw new Error((x.d&&x.d.error)||('HTTP '+x.r.status));
        }
        if(x.d&&x.d.id)item.sharedId=x.d.id;
        if(x.d&&x.d.version)item.sharedBaseVersion=Number(x.d.version);
        if(x.d&&x.d.modifiedAt)item.sharedBaseModifiedAt=x.d.modifiedAt;
        persist();refreshShared();return true;
      })
      .catch(function(e){console.warn('shared note autosync failed',e);return false;})
      .finally(function(){
        running[sid]=false;
        if(queued[sid]){delete queued[sid];setTimeout(function(){publishNote(sid);},250);}
      });
  }
  function queue(id){
    var sid=String(id||'');if(!sid)return;
    clearTimeout(timers[sid]);
    timers[sid]=setTimeout(function(){publishNote(sid);},900);
  }
  function onNote(ev){
    var ta=ev.target;if(!ta||ta.tagName!=='TEXTAREA'||!ta.closest('.track-note'))return;
    var card=ta.closest('.track-item[data-track-id]');if(card)queue(card.getAttribute('data-track-id'));
  }
  document.addEventListener('input',onNote,true);
  document.addEventListener('change',onNote,true);
})();
</script>`;

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=await response.text();
    if(!html.includes('mancardo-shared-note-autosync')){
      const i=html.toLowerCase().lastIndexOf('</body>');
      html=i>=0?html.slice(0,i)+CLIENT+'\n'+html.slice(i):html+CLIENT;
    }
    const headers=new Headers(response.headers);
    headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store, max-age=0');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
