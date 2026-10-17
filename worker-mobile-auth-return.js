import baseWorker from './worker-shared-library-cloud.js';

const MOBILE_AUTH_SCRIPT=String.raw`
<script id="mancardo-mobile-auth-return">
(function(){
  function isMobileLike(){
    try{return !!(window.matchMedia&&window.matchMedia('(pointer: coarse)').matches);}catch(e){}
    return window.innerWidth<760;
  }
  function wire(){
    var signin=document.getElementById('mancardoPrivateSyncSignIn');
    if(!signin||signin.dataset.mancardoMobileAuthReturn==='1')return;
    signin.dataset.mancardoMobileAuthReturn='1';
    signin.addEventListener('click',function(ev){
      if(!isMobileLike())return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      try{sessionStorage.setItem('__mancardo_auth_return__','1');}catch(e){}
      window.location.assign('/api/private-library/login?return=%2F');
    },true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else wire();
  setTimeout(wire,1200);
})();
</script>`;

const CROSS_DEVICE_RECONCILE_SCRIPT=String.raw`
<script id="mancardo-private-cross-device-reconcile">
(function(){
  if(window.__mancardoCrossDeviceReconcileInstalled)return;
  window.__mancardoCrossDeviceReconcileInstalled=true;
  var running=false;

  function api(path,opts){
    opts=opts||{};
    opts.credentials='include';
    opts.cache='no-store';
    opts.headers=Object.assign({'accept':'application/json'},opts.headers||{});
    return fetch('/api/private-library'+path,opts);
  }
  function asJson(r){return r.json().catch(function(){return {};}).then(function(d){return {r:r,d:d};});}
  function clone(x){try{return typeof deepClone==='function'?deepClone(x):JSON.parse(JSON.stringify(x));}catch(e){return null;}}
  function deviceId(){try{return localStorage.getItem('mancardo_private_device_id_v1')||'';}catch(e){return '';}}

  function pullAll(){
    var items=[],since=0,after='';
    function page(){
      return api('/tracks?since='+encodeURIComponent(since)+'&after='+encodeURIComponent(after)+'&limit=500').then(asJson).then(function(x){
        if(!x.r.ok)throw new Error((x.d&&x.d.error)||('HTTP '+x.r.status));
        var d=x.d||{};
        items=items.concat(d.items||[]);
        if(d.has_more&&d.next){since=d.next.since||since;after=d.next.after||'';return page();}
        return items;
      });
    }
    return page();
  }

  function reconcile(){
    if(running||!navigator.onLine||!window.state||!Array.isArray(state.library))return Promise.resolve(false);
    running=true;
    return api('/health').then(asJson).then(function(x){
      var h=x.d||{};
      if(!h.authenticated||!h.accountKey||!h.storageReady)return false;
      return pullAll().then(function(items){
        var cloudById=Object.create(null),changed=false;
        items.forEach(function(item){cloudById[String(item.track_id)]=item;});

        items.forEach(function(item){
          var id=String(item.track_id),exists=state.library.some(function(t){return t&&String(t.id)===id;});
          if(!exists&&!item.deleted&&item.track){var c=clone(item.track);if(c){state.library.unshift(c);changed=true;}}
        });

        var uploads=[];
        state.library.forEach(function(track){
          if(!track||!track.id)return;
          var id=String(track.id);
          if(Object.prototype.hasOwnProperty.call(cloudById,id))return;
          uploads.push(api('/tracks/'+encodeURIComponent(id),{
            method:'PUT',
            headers:{'content-type':'application/json'},
            body:JSON.stringify({base_revision:0,track:track,device_id:deviceId()})
          }).then(asJson).then(function(x){
            if(x.r.ok||x.r.status===409)return;
            throw new Error((x.d&&x.d.error)||('Upload HTTP '+x.r.status));
          }));
        });

        if(changed){
          try{persistLibrary();}catch(e){try{localStorage.setItem('switchback_local_tracks_v1',JSON.stringify(state.library));}catch(_){} }
          try{if(typeof renderLibrary==='function')renderLibrary();if(typeof render==='function')render();}catch(e){}
        }
        return Promise.all(uploads).then(function(){return true;});
      });
    }).catch(function(e){console.warn('cross-device My Library reconcile failed',e);return false;}).finally(function(){running=false;});
  }

  window.__mancardoForcePrivateReconcile=reconcile;
  window.addEventListener('focus',function(){setTimeout(reconcile,300);});
  window.addEventListener('online',function(){setTimeout(reconcile,300);});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')setTimeout(reconcile,350);});
  document.addEventListener('click',function(ev){
    var t=ev.target;if(!t||!t.closest)return;
    if(t.closest('#mancardoPrivateSyncNow'))setTimeout(reconcile,900);
  },false);
  setTimeout(reconcile,1800);
})();
</script>`;

function signedInReturnPage(){
  const body='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>ManCardo sign-in</title><style>body{font:16px system-ui;margin:0;background:#111820;color:#eef3f5;display:grid;place-items:center;min-height:100vh}.c{max-width:520px;padding:28px;border:1px solid #3b4a54;border-radius:8px;background:#1b252c}h2{margin-top:0}p{line-height:1.45;color:#c6d0d6}</style><div class="c"><h2>Sign-in complete</h2><p>Returning to ManCardo…</p></div><script>setTimeout(function(){location.replace("/");},300);<\/script>';
  return new Response(body,{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/private-library/login'&&request.method==='GET'){
      const response=await baseWorker.fetch(request,env,ctx);
      if(response.status===200)return signedInReturnPage();
      return response;
    }
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=await response.text();
    if(!html.includes('mancardo-mobile-auth-return')){
      const i=html.toLowerCase().lastIndexOf('</body>');
      html=i>=0?html.slice(0,i)+MOBILE_AUTH_SCRIPT+'\n'+html.slice(i):html+MOBILE_AUTH_SCRIPT;
    }
    if(false && !html.includes('mancardo-private-cross-device-reconcile')){
      const i=html.toLowerCase().lastIndexOf('</body>');
      html=i>=0?html.slice(0,i)+CROSS_DEVICE_RECONCILE_SCRIPT+'\n'+html.slice(i):html+CROSS_DEVICE_RECONCILE_SCRIPT;
    }
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
