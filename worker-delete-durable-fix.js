import baseWorker from './worker-autosave-stability.js';

const OLD_DELETE_BRIDGE = /<script id="mancardo-explicit-delete-bridge">[\s\S]*?<\/script>/i;

const DURABLE_DELETE_BRIDGE = String.raw`
<script id="mancardo-explicit-delete-bridge">
(function(){
  if(window.__mancardoExplicitDeleteBridgeInstalled)return;
  window.__mancardoExplicitDeleteBridgeInstalled=true;
  var PENDING_KEY='mancardo_explicit_delete_pending_v2';
  var LIBRARY_KEY='switchback_local_tracks_v1';
  var deleteIntent=null;
  var retrying=false;

  function ids(){
    try{return (state.library||[]).filter(function(t){return t&&t.id;}).map(function(t){return String(t.id);});}
    catch(e){return [];}
  }
  function readPending(){
    try{var a=JSON.parse(localStorage.getItem(PENDING_KEY)||'[]');return Array.isArray(a)?a.map(String):[];}catch(e){return [];}
  }
  function writePending(a){
    var seen={},out=[];(a||[]).forEach(function(id){id=String(id||'');if(id&&!seen[id]){seen[id]=1;out.push(id);}});
    try{localStorage.setItem(PENDING_KEY,JSON.stringify(out));}catch(e){}
    return out;
  }
  function addPending(a){return writePending(readPending().concat(a||[]));}
  function removePending(id){return writePending(readPending().filter(function(x){return x!==String(id);}));}
  function api(path,opts){
    opts=opts||{};opts.credentials='include';opts.cache='no-store';
    opts.headers=Object.assign({'accept':'application/json'},opts.headers||{});
    return fetch('/api/private-library'+path,opts);
  }
  function json(r){return r.json().catch(function(){return {};}).then(function(d){return {r:r,d:d};});}
  function device(){try{return localStorage.getItem('mancardo_private_device_id_v1')||'';}catch(e){return '';}}
  function markPendingStatus(){
    var chip=document.getElementById('mancardoPrivateSyncChip');
    if(chip){chip.dataset.state='offline';chip.textContent='☁ Sync pending';chip.title='A library deletion is saved locally and is waiting for cloud confirmation.';}
  }

  function hidePendingLocally(){
    var pending=readPending();
    if(!pending.length)return false;
    var blocked={};pending.forEach(function(id){blocked[String(id)]=1;});
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

  function deleteCloudTrack(id){
    return api('/tracks/'+encodeURIComponent(id)).then(json).then(function(x){
      if(x.r.status===404||(x.d&&x.d.deleted)){removePending(id);return true;}
      if(!x.r.ok)throw new Error((x.d&&x.d.error)||('Lookup HTTP '+x.r.status));
      var revision=Number(x.d&&x.d.revision)||0;
      if(revision<1)throw new Error('Cloud revision unavailable for delete');
      return api('/tracks/'+encodeURIComponent(id),{
        method:'DELETE',headers:{'content-type':'application/json'},
        body:JSON.stringify({base_revision:revision,device_id:device()})
      }).then(json).then(function(y){
        if(y.r.ok||(y.d&&y.d.deleted)){removePending(id);return true;}
        if(y.r.status===409)throw new Error('Delete conflict: a newer cloud revision exists; manual reconciliation required.');
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
    pending.forEach(function(id){chain=chain.then(function(){return deleteCloudTrack(id);});});
    return chain.then(function(){
      hidePendingLocally();
      try{window.dispatchEvent(new CustomEvent('mancardo:explicit-cloud-delete'));}catch(e){}
    }).catch(function(e){markPendingStatus();console.warn('Explicit cloud delete still pending',e);})
      .finally(function(){retrying=false;});
  }

  document.addEventListener('click',function(ev){
    var btn=ev.target&&ev.target.closest?ev.target.closest('#deleteTrackBtn,#deleteSelectedBtn'):null;
    if(!btn)return;
    deleteIntent={before:ids(),expires:Date.now()+5000};
  },true);

  var basePersist=persistLibrary;
  persistLibrary=function(){
    var intent=deleteIntent;
    var r=basePersist.apply(this,arguments);
    if(intent&&Date.now()<=intent.expires){
      var after={};ids().forEach(function(id){after[id]=1;});
      var removed=intent.before.filter(function(id){return !after[id];});
      if(removed.length){deleteIntent=null;addPending(removed);hidePendingLocally();markPendingStatus();retryPending();}
    }
    hidePendingLocally();
    return r;
  };

  window.addEventListener('online',function(){setTimeout(retryPending,150);});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')setTimeout(retryPending,150);});
  setInterval(function(){if(document.visibilityState==='visible'){hidePendingLocally();retryPending();}},2000);
  setTimeout(function(){hidePendingLocally();retryPending();},100);
})();
</script>`;

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=await response.text();
    html=html.replace(OLD_DELETE_BRIDGE,'');
    const i=html.toLowerCase().lastIndexOf('</body>');
    html=i>=0?html.slice(0,i)+DURABLE_DELETE_BRIDGE+'\n'+html.slice(i):html+DURABLE_DELETE_BRIDGE;
    const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store, max-age=0');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
