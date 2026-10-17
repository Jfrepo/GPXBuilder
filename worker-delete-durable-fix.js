import baseWorker from './worker-autosave-stability.js';

const OLD_DELETE_BRIDGE = /<script id="mancardo-explicit-delete-bridge">[\s\S]*?<\/script>/i;

const DURABLE_DELETE_BRIDGE = String.raw`
<script id="mancardo-explicit-delete-bridge">
(function(){
  if(window.__mancardoExplicitDeleteBridgeInstalled)return;
  window.__mancardoExplicitDeleteBridgeInstalled=true;

  var PENDING_KEY='mancardo_authorized_delete_pending_v3';
  var LIBRARY_KEY='switchback_local_tracks_v1';
  var retrying=false;

  function readPending(){
    try{
      var a=JSON.parse(localStorage.getItem(PENDING_KEY)||'[]');
      return Array.isArray(a)?a.filter(function(x){return x&&x.id&&x.authorizedUserDelete===true;}):[];
    }catch(e){return [];}
  }
  function writePending(a){
    var seen={},out=[];
    (a||[]).forEach(function(x){
      if(!x||!x.id||x.authorizedUserDelete!==true)return;
      var id=String(x.id);
      if(seen[id])return;
      seen[id]=1;
      out.push({id:id,authorizedUserDelete:true,requestedAt:Number(x.requestedAt)||Date.now(),attempts:Number(x.attempts)||0});
    });
    try{localStorage.setItem(PENDING_KEY,JSON.stringify(out));}catch(e){}
    return out;
  }
  function authorize(ids){
    var now=Date.now(),pending=readPending();
    (ids||[]).forEach(function(id){
      id=String(id||'');
      if(id)pending.push({id:id,authorizedUserDelete:true,requestedAt:now,attempts:0});
    });
    return writePending(pending);
  }
  function removePending(id){
    id=String(id);
    return writePending(readPending().filter(function(x){return String(x.id)!==id;}));
  }
  function pendingIds(){
    var out={};readPending().forEach(function(x){out[String(x.id)]=1;});return out;
  }
  function api(path,opts){
    opts=opts||{};opts.credentials='include';opts.cache='no-store';
    opts.headers=Object.assign({'accept':'application/json'},opts.headers||{});
    return fetch('/api/private-library'+path,opts);
  }
  function json(r){return r.json().catch(function(){return {};}).then(function(d){return {r:r,d:d};});}
  function device(){try{return localStorage.getItem('mancardo_private_device_id_v1')||'';}catch(e){return '';}}
  function markPendingStatus(){
    var chip=document.getElementById('mancardoPrivateSyncChip');
    if(chip){chip.dataset.state='offline';chip.textContent='☁ Delete pending';chip.title='An authorised library deletion is waiting for cloud confirmation.';}
  }

  function hidePendingLocally(){
    var blocked=pendingIds();
    if(!Object.keys(blocked).length)return false;
    var before=(state.library||[]).length;
    state.library=(state.library||[]).filter(function(t){return !(t&&blocked[String(t.id)]);});
    if(state.currentId&&blocked[String(state.currentId)]){state.current=null;state.currentId=null;state.selection=null;}
    if(state.library.length!==before){
      try{localStorage.setItem(LIBRARY_KEY,JSON.stringify(state.library));}catch(e){}
      try{if(typeof renderLibrary==='function')renderLibrary();if(typeof render==='function')render();}catch(e){}
      return true;
    }
    return false;
  }

  function deleteCloudTrack(record,attempt){
    var id=String(record.id),n=attempt||0;
    return api('/tracks/'+encodeURIComponent(id)).then(json).then(function(x){
      if(x.r.status===404||(x.d&&x.d.deleted)){removePending(id);return true;}
      if(!x.r.ok)throw new Error((x.d&&x.d.error)||('Lookup HTTP '+x.r.status));
      var revision=Number(x.d&&x.d.revision)||0;
      if(revision<1)throw new Error('Cloud revision unavailable for authorised delete');
      return api('/tracks/'+encodeURIComponent(id),{
        method:'DELETE',headers:{'content-type':'application/json'},
        body:JSON.stringify({
          base_revision:revision,
          device_id:device(),
          authorized_user_delete:true,
          delete_intent:'explicit-ui-delete',
          requested_at:Number(record.requestedAt)||Date.now()
        })
      }).then(json).then(function(y){
        if(y.r.ok||(y.d&&y.d.deleted)){removePending(id);return true;}
        if(y.r.status===409&&n<3)return deleteCloudTrack(record,n+1);
        throw new Error((y.d&&y.d.error)||('Delete HTTP '+y.r.status));
      });
    });
  }

  function retryPending(){
    hidePendingLocally();
    var pending=readPending();
    if(!pending.length||retrying||!navigator.onLine)return Promise.resolve();
    retrying=true;
    var chain=Promise.resolve();
    pending.forEach(function(record){chain=chain.then(function(){return deleteCloudTrack(record,0);});});
    return chain.then(function(){
      hidePendingLocally();
      try{window.dispatchEvent(new CustomEvent('mancardo:explicit-cloud-delete'));}catch(e){}
    }).catch(function(e){markPendingStatus();console.warn('Authorised cloud delete still pending',e);})
      .finally(function(){retrying=false;});
  }

  function removeLocal(ids){
    var blocked={};(ids||[]).forEach(function(id){blocked[String(id)]=1;});
    state.library=(state.library||[]).filter(function(t){return !(t&&blocked[String(t.id)]);});
    if(state.currentId&&blocked[String(state.currentId)]){state.current=null;state.currentId=null;state.selection=null;}
    try{state.trackMenuId=null;state.paletteId=null;}catch(e){}
    try{persistLibrary();}catch(e){try{localStorage.setItem(LIBRARY_KEY,JSON.stringify(state.library));}catch(_){} }
    try{if(typeof render==='function')render();if(typeof renderLibrary==='function')renderLibrary();}catch(e){}
    markPendingStatus();
    retryPending();
  }

  function authorisedDelete(ids){
    ids=(ids||[]).map(String).filter(Boolean);
    if(!ids.length)return false;
    // The deletion authority is written synchronously BEFORE the local track is removed.
    // This survives browser refresh and prevents cloud reconciliation from treating the
    // missing track as accidental data loss.
    authorize(ids);
    removeLocal(ids);
    return true;
  }
  window.mancardoAuthorizedDelete=authorisedDelete;

  document.addEventListener('click',function(ev){
    var target=ev.target&&ev.target.closest?ev.target.closest('.mancardo-menu-delete,#deleteTrackBtn,#deleteSelectedBtn'):null;
    if(!target)return;

    if(target.classList.contains('mancardo-menu-delete')){
      ev.preventDefault();ev.stopImmediatePropagation();
      var card=target.closest('.track-item');
      var id=card&&card.getAttribute('data-track-id');
      var item=(state.library||[]).find(function(t){return t&&String(t.id)===String(id);});
      if(!id||!item)return;
      if(!window.confirm('Delete "'+(item.name||'this track')+'" from My Library? This cannot be undone.'))return;
      authorisedDelete([id]);
      return;
    }

    if(target.id==='deleteSelectedBtn'){
      ev.preventDefault();ev.stopImmediatePropagation();
      var selected=(state.library||[]).filter(function(item){return item&&item.visible!==false;});
      if(!selected.length)return;
      var label=selected.length===1?'this selected track':selected.length+' selected tracks';
      if(!window.confirm('Delete '+label+' from the library? This cannot be undone.'))return;
      authorisedDelete(selected.map(function(item){return item.id;}));
      return;
    }

    // The main Delete button uses a two-click armConfirm flow. Allow the first click to arm it,
    // then own the second confirmed click so the authorisation record is durable before removal.
    if(target.id==='deleteTrackBtn'&&target.classList.contains('confirming')){
      ev.preventDefault();ev.stopImmediatePropagation();
      if(state.currentId)authorisedDelete([state.currentId]);
    }
  },true);

  // Keep authorised tombstones dominant over a stale cloud pull until the server confirms delete.
  window.addEventListener('online',function(){setTimeout(retryPending,100);});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')setTimeout(retryPending,100);});
  window.addEventListener('mancardo:track-autosaved',function(){setTimeout(hidePendingLocally,0);});
  setInterval(function(){if(document.visibilityState==='visible'){hidePendingLocally();retryPending();}},1500);
  setTimeout(function(){hidePendingLocally();retryPending();},50);
})();
</script>`;

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=await response.text();
    html=html.replace(OLD_DELETE_BRIDGE,'');
    // The editor's state, persistLibrary and track menu handlers are scoped to its
    // main IIFE. An external script appended before </body> cannot access them.
    // Insert plain JavaScript inside that IIFE, before the boot sequence.
    const boot=html.indexOf('// ---------- boot ----------');
    if(boot<0)return response;
    const client=DURABLE_DELETE_BRIDGE.replace(/^<script[^>]*>\s*/i,'').replace(/\s*<\/script>\s*$/i,'');
    html=html.slice(0,boot)+'\n'+client+'\n'+html.slice(boot);
    const headers=new Headers(response.headers);
    headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store, max-age=0');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
