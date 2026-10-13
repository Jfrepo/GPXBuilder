import baseWorker from './worker-mobile-auth-return.js';

const INNER_PATCH=String.raw`
  // ---------- Private My Library cross-device hard reconcile ----------
  var __mancardoHardReconciling=false;
  function hardPrivateReconcile(){
    if(__mancardoHardReconciling||!navigator.onLine)return Promise.resolve(false);
    __mancardoHardReconciling=true;
    return health().then(function(h){
      if(!h.storageReady)throw new Error(h.storageDetail||'Private cloud storage is not ready.');
      if(!h.authConfigured)throw new Error('Private account authentication is not configured.');
      if(!h.authenticated||!h.accountKey)throw new Error('Sign in is required for private My Library sync.');
      return bindAccount(h).then(function(ok){
        if(!ok)throw new Error('Private account binding is paused on this browser.');
        ready=true;
        setStatus('syncing','Syncing','Verifying My Library across devices…');
        return pullAll().then(function(items){
          var cloudById=Object.create(null),changed=false,activeCloud=0;
          items.forEach(function(item){
            cloudById[String(item.track_id)]=item;
            if(!item.deleted)activeCloud++;
            if(!item.deleted&&item.track&&!localById(item.track_id)){
              replaceLocal(item.track_id,item.track);
              changed=true;
            }
          });
          if(changed)persistRemoteChanges();

          var chain=Promise.resolve();
          state.library.forEach(function(track){
            if(!track||!track.id)return;
            var id=String(track.id);
            if(Object.prototype.hasOwnProperty.call(cloudById,id))return;
            chain=chain.then(function(){
              return api('/tracks/'+encodeURIComponent(id),{
                method:'PUT',
                headers:{'content-type':'application/json'},
                body:JSON.stringify({base_revision:0,track:clone(track),device_id:deviceId})
              }).then(jsonOrEmpty).then(function(x){
                if(x.response.ok)return true;
                if(x.response.status===409)return true;
                var msg=(x.data&&x.data.error)||('Upload HTTP '+x.response.status);
                throw new Error(msg);
              });
            });
          });

          return chain.then(function(){
            return pullAll().then(function(after){
              return mergeCloud(after).then(function(){
                var count=after.filter(function(item){return !item.deleted;}).length;
                setStatus('synced','Synced','Private cloud verified: '+state.library.length+' local / '+count+' cloud track'+(count===1?'':'s')+'.');
                return true;
              });
            });
          });
        });
      });
    }).catch(function(e){
      var detail=e&&e.message?e.message:'Private My Library replication failed.';
      setStatus('offline','Sync pending','Private replication failed: '+detail);
      console.warn('private hard reconcile failed',e);
      return false;
    }).finally(function(){__mancardoHardReconciling=false;updatePending();});
  }

  window.__mancardoHardPrivateReconcile=hardPrivateReconcile;
  document.addEventListener('click',function(ev){
    var t=ev.target;if(!t||!t.closest)return;
    if(t.closest('#mancardoPrivateSyncNow'))setTimeout(hardPrivateReconcile,1800);
  },true);
  window.addEventListener('focus',function(){setTimeout(hardPrivateReconcile,700);});
  window.addEventListener('online',function(){setTimeout(hardPrivateReconcile,700);});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')setTimeout(hardPrivateReconcile,800);});
  setInterval(function(){if(document.visibilityState==='visible'&&navigator.onLine)setTimeout(hardPrivateReconcile,100);},60000);
  setTimeout(hardPrivateReconcile,2600);
`;

function patchHtml(html){
  if(html.includes('Private My Library cross-device hard reconcile'))return html;
  const marker='  setTimeout(syncNow,900);\n})();';
  if(!html.includes(marker))return html;
  return html.replace(marker,INNER_PATCH+'\n'+marker);
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=patchHtml(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
