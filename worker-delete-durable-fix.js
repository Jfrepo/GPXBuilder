import baseWorker from './worker-autosave-stability.js';

const OLD_DELETE_BRIDGE = /<script id="mancardo-explicit-delete-bridge">[\s\S]*?<\/script>/i;

const DURABLE_DELETE_BRIDGE = String.raw`
<script id="mancardo-explicit-delete-bridge">
(function(){
  if(window.__mancardoExplicitDeleteBridgeInstalled)return;
  window.__mancardoExplicitDeleteBridgeInstalled=true;
  var PENDING_KEY='mancardo_explicit_delete_pending_v2';
  var deleteIntent=null;

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

  function deleteCloudTrack(id,attempt){
    attempt=attempt||0;
    return api('/tracks/'+encodeURIComponent(id)).then(json).then(function(x){
      if(x.r.status===404||x.d&&x.d.deleted){removePending(id);return true;}
      if(!x.r.ok)throw new Error((x.d&&x.d.error)||('Lookup HTTP '+x.r.status));
      var revision=Number(x.d&&x.d.revision)||0;
      if(revision<1){removePending(id);return true;}
      return api('/tracks/'+encodeURIComponent(id),{
        method:'DELETE',headers:{'content-type':'application/json'},
        body:JSON.stringify({base_revision:revision,device_id:device()})
      }).then(json).then(function(y){
        if(y.r.ok){removePending(id);return true;}
        if(y.r.status===409&&attempt<2)return deleteCloudTrack(id,attempt+1);
        throw new Error((y.d&&y.d.error)||('Delete HTTP '+y.r.status));
      });
    });
  }

  function retryPending(){
    var pending=readPending();
    if(!pending.length)return Promise.resolve();
    var chain=Promise.resolve();
    pending.forEach(function(id){chain=chain.then(function(){return deleteCloudTrack(id,0);});});
    return chain.then(function(){
      try{window.dispatchEvent(new CustomEvent('mancardo:explicit-cloud-delete'));}catch(e){}
    }).catch(function(e){markPendingStatus();console.warn('Explicit cloud delete still pending',e);});
  }

  document.addEventListener('click',function(ev){
    var btn=ev.target&&ev.target.closest?ev.target.closest('#deleteTrackBtn,#deleteSelectedBtn'):null;
    if(!btn)return;
    if(btn.id==='deleteTrackBtn'&&!btn.classList.contains('confirming'))return;
    deleteIntent={before:ids(),expires:Date.now()+3000};
  },true);

  var basePersist=persistLibrary;
  persistLibrary=function(){
    var intent=deleteIntent;
    var r=basePersist.apply(this,arguments);
    if(intent&&Date.now()<=intent.expires){
      var after={};ids().forEach(function(id){after[id]=1;});
      var removed=intent.before.filter(function(id){return !after[id];});
      deleteIntent=null;
      if(removed.length){addPending(removed);markPendingStatus();retryPending();}
    }
    return r;
  };

  window.addEventListener('online',function(){setTimeout(retryPending,200);});
  setTimeout(retryPending,300);
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
