import baseWorker from './worker-private-canonical-sync.js';

const PREFIX='/api/private-library/canonical/tracks';

function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}

async function canonicalAuth(request,env,ctx){
  const u=new URL(request.url);
  u.pathname='/api/private-library/health';
  u.search='';
  const probe=await baseWorker.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env,ctx);
  let h={};
  try{h=await probe.json();}catch(e){}
  if(!h.authenticated||!h.accountLabel||!h.storageReady||!env.PRIVATE_LIBRARY_DB){
    return {error:json({error:'Private sync authentication or storage is not ready.'},401)};
  }
  const email=String(h.accountLabel||'').trim().toLowerCase();
  if(!email||email.indexOf('@')<1)return {error:json({error:'Authenticated email identity is unavailable.'},401)};
  return {db:env.PRIVATE_LIBRARY_DB,owner:'email:'+email};
}

async function softDelete(request,env,ctx,id){
  const a=await canonicalAuth(request,env,ctx);
  if(a.error)return a.error;
  const row=await a.db.prepare('SELECT revision,deleted FROM private_library_tracks WHERE owner_id=?1 AND track_id=?2').bind(a.owner,id).first();
  if(!row)return json({ok:true,track_id:id,deleted:true,missing:true});
  if(row.deleted)return json({ok:true,track_id:id,revision:Number(row.revision)||1,deleted:true});
  const next=(Number(row.revision)||0)+1;
  const now=Date.now();
  await a.db.prepare('UPDATE private_library_tracks SET revision=?3,deleted=1,updated_at=?4 WHERE owner_id=?1 AND track_id=?2').bind(a.owner,id,next,now).run();
  return json({ok:true,track_id:id,revision:next,deleted:true});
}

const CLIENT=String.raw`
<script id="mancardo-private-delete-tombstone-fix">
(function(){
  if(window.__mancardoPrivateDeleteFixInstalled)return;
  window.__mancardoPrivateDeleteFixInstalled=true;
  var LIB='switchback_local_tracks_v1';
  var SEEN='mancardo_private_canonical_seen_v2';
  var running=false;

  function api(path,opts){
    opts=opts||{};
    opts.credentials='include';
    opts.cache='no-store';
    opts.headers=Object.assign({'accept':'application/json'},opts.headers||{});
    return fetch('/api/private-library/canonical/tracks'+path,opts);
  }
  function j(r){return r.json().catch(function(){return {};}).then(function(d){return {r:r,d:d};});}
  function loadLib(){try{var x=JSON.parse(localStorage.getItem(LIB)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
  function saveLib(x){localStorage.setItem(LIB,JSON.stringify(x));}
  function loadSeen(){try{var x=JSON.parse(localStorage.getItem(SEEN)||'{}');return x&&typeof x==='object'?x:{};}catch(e){return {};}}
  function saveSeen(x){try{localStorage.setItem(SEEN,JSON.stringify(x));}catch(e){}}
  function device(){try{return localStorage.getItem('mancardo_private_device_id_v1')||'';}catch(e){return '';}}
  function setMsg(text){var el=document.getElementById('mancardoPrivateSyncMessage');if(el)el.textContent=text;}

  function run(){
    if(running||!navigator.onLine)return Promise.resolve(false);
    running=true;
    return api('').then(j).then(function(x){
      if(!x.r.ok)throw new Error((x.d&&x.d.error)||('HTTP '+x.r.status));
      var lib=loadLib(),seen=loadSeen(),cloud=x.d.items||[],localBy={},cloudBy={},changed=false,adds=0,deletes=0;
      lib.forEach(function(t){if(t&&t.id)localBy[String(t.id)]=t;});
      cloud.forEach(function(c){cloudBy[String(c.track_id)]=c;});

      var chain=Promise.resolve();

      cloud.forEach(function(c){
        var id=String(c.track_id);
        if(c.deleted){
          seen[id]=1;
          if(localBy[id]){
            lib=lib.filter(function(t){return !t||String(t.id)!==id;});
            delete localBy[id];
            changed=true;
          }
          return;
        }
        if(localBy[id]){seen[id]=1;return;}
        if(seen[id]){
          chain=chain.then(function(){
            return api('/'+encodeURIComponent(id),{method:'DELETE'}).then(j).then(function(y){
              if(!y.r.ok)throw new Error((y.d&&y.d.error)||('Delete HTTP '+y.r.status));
              deletes++;
            });
          });
          return;
        }
        if(c.track){
          lib.unshift(c.track);
          localBy[id]=c.track;
          seen[id]=1;
          changed=true;
          adds++;
        }
      });

      Object.keys(localBy).forEach(function(id){
        var c=cloudBy[id];
        if(c&&c.deleted){
          lib=lib.filter(function(t){return !t||String(t.id)!==id;});
          delete localBy[id];
          changed=true;
          seen[id]=1;
          return;
        }
        if(c){seen[id]=1;return;}
        var track=localBy[id];
        chain=chain.then(function(){
          return api('/'+encodeURIComponent(id),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({track:track,device_id:device()})}).then(j).then(function(y){
            if(!y.r.ok)throw new Error((y.d&&y.d.error)||('Upload HTTP '+y.r.status));
            seen[id]=1;
          });
        });
      });

      if(changed)saveLib(lib);
      saveSeen(seen);

      return chain.then(function(){return api('').then(j);}).then(function(y){
        if(!y.r.ok)throw new Error((y.d&&y.d.error)||('HTTP '+y.r.status));
        var active=(y.d.items||[]).filter(function(c){return !c.deleted;}).length;
        setMsg('Private cloud sync: '+lib.length+' local / '+active+' cloud tracks.'+(deletes?' '+deletes+' deletion'+(deletes===1?'':'s')+' synced.':''));
        if(adds||changed)setTimeout(function(){location.reload();},350);
        return true;
      });
    }).catch(function(e){
      setMsg('Private sync failed: '+(e&&e.message?e.message:'unknown error'));
      console.warn('private delete-aware sync failed',e);
      return false;
    }).finally(function(){running=false;});
  }

  document.addEventListener('click',function(ev){
    var t=ev.target;
    if(t&&t.closest&&t.closest('#mancardoPrivateSyncNow'))setTimeout(run,250);
    else setTimeout(run,900);
  },true);
  window.addEventListener('focus',function(){setTimeout(run,450);});
  window.addEventListener('online',function(){setTimeout(run,450);});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')setTimeout(run,500);});
  setInterval(function(){if(document.visibilityState==='visible'&&navigator.onLine)run();},5000);
  setTimeout(run,1400);
})();
</script>`;

function replaceCanonicalClient(html){
  html=html.replace(/<script id="mancardo-canonical-private-sync">[\s\S]*?<\/script>/i,'');
  if(html.includes('mancardo-private-delete-tombstone-fix'))return html;
  const i=html.toLowerCase().lastIndexOf('</body>');
  return i>=0?html.slice(0,i)+CLIENT+'\n'+html.slice(i):html+CLIENT;
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const m=url.pathname.match(/^\/api\/private-library\/canonical\/tracks\/([^/]+)$/);
    if(m&&request.method==='DELETE')return softDelete(request,env,ctx,decodeURIComponent(m[1]));

    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=replaceCanonicalClient(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
