import baseWorker from './worker-private-library-sync.js';

const API_PREFIX='/api/private-library';

function jsonResponse(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}

function decodeJwtPayload(token){
  try{
    const part=String(token||'').split('.')[1];
    if(!part)return null;
    let s=part.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';
    const raw=atob(s),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  }catch(e){return null;}
}

async function shortHash(value){
  const data=new TextEncoder().encode(String(value||''));
  const digest=await crypto.subtle.digest('SHA-256',data);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,24);
}

async function enrichHealth(request,response){
  const type=response.headers.get('content-type')||'';
  if(!type.includes('application/json'))return response;
  let data;try{data=await response.json();}catch(e){return response;}
  if(data&&data.authenticated){
    const payload=decodeJwtPayload(request.headers.get('Cf-Access-Jwt-Assertion'));
    if(payload&&payload.sub){
      data.accountKey=await shortHash(payload.sub);
      data.accountLabel=String(payload.email||'Private account').slice(0,254);
    }
  }
  return jsonResponse(data,response.status);
}

function loginPage(env,request){
  const configured=!!(String(env.CF_ACCESS_TEAM_DOMAIN||'').trim()&&String(env.CF_ACCESS_AUD||'').trim());
  const token=String(request.headers.get('Cf-Access-Jwt-Assertion')||'').trim();
  const ok=configured&&!!token;
  const body='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>ManCardo private sync</title><style>body{font:16px system-ui;margin:0;background:#111820;color:#eef3f5;display:grid;place-items:center;min-height:100vh}.c{max-width:520px;padding:28px;border:1px solid #3b4a54;border-radius:8px;background:#1b252c}h2{margin-top:0}p{line-height:1.45;color:#c6d0d6}</style><div class="c"><h2>'+ (ok?'Private sync sign-in complete':'Private sync setup required') +'</h2><p>'+ (ok?'This browser is authenticated for your private ManCardo My Library. Return to ManCardo and press Sync now.':'Cloudflare Access must be configured for the private-library API before cross-device sync can sign in securely.') +'</p></div>';
  return new Response(body,{status:ok?200:503,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
}

const ACTIVE_SYNC_CSS=String.raw`
<style id="mancardo-private-cloud-sync-styles">
#mancardoPrivateSyncChip{cursor:pointer;border:1px solid var(--border);white-space:nowrap}
#mancardoPrivateSyncChip[data-state="synced"]{border-color:var(--good);color:var(--good)}
#mancardoPrivateSyncChip[data-state="syncing"]{border-color:var(--accent);color:var(--accent)}
#mancardoPrivateSyncChip[data-state="offline"],#mancardoPrivateSyncChip[data-state="setup"],#mancardoPrivateSyncChip[data-state="signin"]{border-color:var(--warn);color:var(--warn)}
#mancardoPrivateSyncChip[data-state="conflict"],#mancardoPrivateSyncChip[data-state="paused"]{border-color:var(--danger);color:var(--danger)}
#mancardoPrivateSyncOverlay{position:fixed;inset:0;z-index:2700;background:rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center;padding:1rem}
#mancardoPrivateSyncOverlay.hidden{display:none!important}
.mancardo-private-sync-dialog{width:min(520px,96vw);background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:7px;box-shadow:0 8px 28px rgba(0,0,0,.3)}
.mancardo-private-sync-head{display:flex;align-items:center;gap:.5rem;padding:.8rem .9rem;border-bottom:1px solid var(--border)}
.mancardo-private-sync-head h3{margin:0;flex:1;font-size:1.1rem}.mancardo-private-sync-body{padding:.8rem .9rem;font-size:.78rem;line-height:1.45}.mancardo-private-sync-kv{display:grid;grid-template-columns:120px 1fr;gap:.3rem .55rem;margin-top:.55rem}.mancardo-private-sync-kv b{color:var(--text-muted)}
.mancardo-private-sync-actions{display:flex;justify-content:flex-end;gap:.45rem;padding:.7rem .9rem;border-top:1px solid var(--border)}
@media(max-width:767px){#mancardoPrivateSyncChip{font-size:0;padding:.3rem .45rem}#mancardoPrivateSyncChip::after{content:'☁';font-size:.9rem}}
</style>`;

const ACTIVE_SYNC_FEATURE=String.raw`
// ---------- Active private My Library cloud sync ----------
(function installMancardoPrivateCloudSync(){
  if(window.__mancardoPrivateCloudSyncInstalled)return;
  window.__mancardoPrivateCloudSyncInstalled=true;

  var DB='mancardo_private_sync_v2',VERSION=1,ACCOUNT_META='boundAccountKey';
  var deviceId='';try{deviceId=localStorage.getItem('mancardo_private_device_id_v1')||'';if(!deviceId){deviceId='dev-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);localStorage.setItem('mancardo_private_device_id_v1',deviceId);}}catch(e){deviceId='dev-'+Date.now().toString(36);}
  var accountKey='',accountLabel='',ready=false,syncing=false,suppressScan=false,scanTimer=null,lastHealth=null,lastMessage='Checking private cloud…',conflictCount=0;

  var topbar=document.querySelector('.topbar');
  if(!topbar)return;
  var chip=document.createElement('button');chip.type='button';chip.id='mancardoPrivateSyncChip';chip.className='local-chip';chip.dataset.state='checking';chip.textContent='☁ Checking';chip.title='Private My Library cloud sync';
  var localChip=topbar.querySelector('.local-chip');if(localChip)topbar.insertBefore(chip,localChip);else topbar.appendChild(chip);

  var overlay=document.createElement('div');overlay.id='mancardoPrivateSyncOverlay';overlay.className='hidden';overlay.innerHTML=''
    +'<div class="mancardo-private-sync-dialog" role="dialog" aria-modal="true">'
    +'<div class="mancardo-private-sync-head"><h3>Private My Library sync</h3><button type="button" class="icon-btn" id="mancardoPrivateSyncClose">×</button></div>'
    +'<div class="mancardo-private-sync-body"><div id="mancardoPrivateSyncMessage"></div><div class="mancardo-private-sync-kv"><b>Account</b><span id="mancardoPrivateSyncAccount">—</span><b>Device</b><span id="mancardoPrivateSyncDevice">—</span><b>Pending</b><span id="mancardoPrivateSyncPending">—</span><b>Conflicts kept</b><span id="mancardoPrivateSyncConflicts">0</span></div></div>'
    +'<div class="mancardo-private-sync-actions"><button type="button" class="icon-btn" id="mancardoPrivateSyncSignIn">Sign in</button><button type="button" class="icon-btn primary" id="mancardoPrivateSyncNow">Sync now</button><button type="button" class="icon-btn" id="mancardoPrivateSyncDone">Done</button></div></div>';
  document.body.appendChild(overlay);
  var msgEl=document.getElementById('mancardoPrivateSyncMessage'),accountEl=document.getElementById('mancardoPrivateSyncAccount'),deviceEl=document.getElementById('mancardoPrivateSyncDevice'),pendingEl=document.getElementById('mancardoPrivateSyncPending'),conflictEl=document.getElementById('mancardoPrivateSyncConflicts');
  deviceEl.textContent=deviceId;

  function setStatus(state,label,message){chip.dataset.state=state;chip.textContent='☁ '+label;lastMessage=message||label;msgEl.textContent=lastMessage;accountEl.textContent=accountLabel||'Not signed in';conflictEl.textContent=String(conflictCount);updatePending();}

  function openDb(){return new Promise(function(resolve,reject){if(!window.indexedDB){reject(new Error('IndexedDB unavailable'));return;}var r=indexedDB.open(DB,VERSION);r.onupgradeneeded=function(){var d=r.result;if(!d.objectStoreNames.contains('meta'))d.createObjectStore('meta',{keyPath:'key'});if(!d.objectStoreNames.contains('sync'))d.createObjectStore('sync',{keyPath:'key'});if(!d.objectStoreNames.contains('outbox')){var s=d.createObjectStore('outbox',{keyPath:'key'});s.createIndex('queuedAt','queuedAt');}};r.onsuccess=function(){resolve(r.result);};r.onerror=function(){reject(r.error||new Error('IndexedDB open failed'));};});}
  function tx(store,mode,fn){return openDb().then(function(db){return new Promise(function(resolve,reject){var t=db.transaction(store,mode),s=t.objectStore(store),req;try{req=fn(s);}catch(e){db.close();reject(e);return;}if(req){req.onsuccess=function(){resolve(req.result);};req.onerror=function(){reject(req.error||new Error('IndexedDB request failed'));};}else{t.oncomplete=function(){resolve();};t.onerror=function(){reject(t.error||new Error('IndexedDB transaction failed'));};}t.oncomplete=function(){db.close();};});});}
  function getMetaValue(key){return tx('meta','readonly',function(s){return s.get(key);}).then(function(v){return v&&v.value;});}
  function setMetaValue(key,value){return tx('meta','readwrite',function(s){return s.put({key:key,value:value});});}
  function syncKey(id){return accountKey+'|'+id;}
  function getSyncMeta(id){return tx('sync','readonly',function(s){return s.get(syncKey(id));});}
  function putSyncMeta(id,data){data=data||{};data.key=syncKey(id);data.id=id;data.accountKey=accountKey;return tx('sync','readwrite',function(s){return s.put(data);});}
  function allSyncMeta(){return tx('sync','readonly',function(s){return s.getAll();}).then(function(a){return (a||[]).filter(function(x){return x.accountKey===accountKey;});});}
  function putOutbox(op){op.key=syncKey(op.id);op.accountKey=accountKey;op.queuedAt=Date.now();return tx('outbox','readwrite',function(s){return s.put(op);});}
  function delOutbox(id){return tx('outbox','readwrite',function(s){return s.delete(syncKey(id));});}
  function allOutbox(){return tx('outbox','readonly',function(s){return s.getAll();}).then(function(a){return (a||[]).filter(function(x){return x.accountKey===accountKey;}).sort(function(a,b){return a.queuedAt-b.queuedAt;});});}
  function updatePending(){if(!accountKey){pendingEl.textContent='—';return;}allOutbox().then(function(a){pendingEl.textContent=String(a.length);}).catch(function(){pendingEl.textContent='?';});}

  function clone(x){try{return deepClone(x);}catch(e){return JSON.parse(JSON.stringify(x));}}
  function hashTrack(track){var text=JSON.stringify(track);return crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)).then(function(d){return Array.from(new Uint8Array(d)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');});}
  function localById(id){return state.library.find(function(t){return String(t&&t.id)===String(id);})||null;}
  function persistRemoteChanges(){suppressScan=true;try{basePersistLibrary();renderLibrary();render();}finally{suppressScan=false;}}
  function stripSharedLink(t){delete t.sharedId;delete t.sharedBaseVersion;delete t.sharedBaseModifiedAt;delete t.sharedBaseModifiedBy;}
  function preserveConflictCopy(track,reason){if(!track)return null;var c=clone(track);c.id=(typeof uid==='function'?uid():('conflict-'+Date.now()+'-'+Math.random().toString(36).slice(2,8)));c.name=String(c.name||'Track')+' (conflict copy)';c.draft=true;c.note=String(reason||'Recovered sync conflict').slice(0,40);c.createdAt=c.updatedAt=new Date().toISOString();stripSharedLink(c);state.library.unshift(c);conflictCount++;return c;}

  var basePersistLibrary=persistLibrary;
  persistLibrary=function(){var r=basePersistLibrary.apply(this,arguments);if(!suppressScan)scheduleScan();return r;};

  function api(path,opts){opts=opts||{};opts.credentials='include';opts.cache='no-store';opts.headers=Object.assign({'accept':'application/json'},opts.headers||{});return fetch(API_PREFIX+path,opts);}
  function jsonOrEmpty(r){return r.json().catch(function(){return {};}).then(function(d){return {response:r,data:d};});}

  function health(){return api('/health').then(function(r){return jsonOrEmpty(r);}).then(function(x){lastHealth=x.data||{};if(!x.response.ok&&x.response.status!==401&&x.response.status!==503)throw new Error('Health check HTTP '+x.response.status);return x.data||{};});}
  function bindAccount(h){accountKey=String(h.accountKey||'');accountLabel=String(h.accountLabel||'');if(!accountKey)return Promise.resolve(false);return getMetaValue(ACCOUNT_META).then(function(bound){if(!bound){return setMetaValue(ACCOUNT_META,accountKey).then(function(){return true;});}if(bound!==accountKey){ready=false;setStatus('paused','Paused','A different private account previously used this browser profile. Sync is paused to prevent one user’s local tracks being uploaded to another account. Use a separate browser profile or clear the private sync workspace intentionally.');return false;}return true;});}

  function pullAll(){var items=[],since=0,after='';function page(){var q='/tracks?since='+encodeURIComponent(since)+'&after='+encodeURIComponent(after)+'&limit=500';return api(q).then(jsonOrEmpty).then(function(x){if(!x.response.ok)throw Object.assign(new Error((x.data&&x.data.error)||('HTTP '+x.response.status)),{status:x.response.status,data:x.data});var d=x.data||{};items=items.concat(d.items||[]);if(d.has_more&&d.next){since=d.next.since||since;after=d.next.after||'';return page();}return items;});}return page();}

  function replaceLocal(id,track){var i=state.library.findIndex(function(t){return String(t&&t.id)===String(id);});if(track){if(i>=0)state.library[i]=clone(track);else state.library.unshift(clone(track));}else if(i>=0)state.library.splice(i,1);if(state.currentId===id){if(track)state.current=clone(track);else{state.current=null;state.currentId=null;state.selection=null;}}}

  function applyCloudItem(item){var id=item.track_id,local=localById(id);return getSyncMeta(id).then(function(meta){if(!local){if(!item.deleted)replaceLocal(id,item.track);return putSyncMeta(id,{revision:item.revision,sha256:item.sha256||'',deleted:!!item.deleted,updatedAt:item.updated_at||0,deviceId:item.device_id||null});}
    return hashTrack(local).then(function(localHash){
      if(item.deleted){
        if(!(meta&&localHash===meta.sha256))preserveConflictCopy(local,'Local copy kept after cloud delete');
        replaceLocal(id,null);
        return putSyncMeta(id,{revision:item.revision,sha256:item.sha256||'',deleted:true,updatedAt:item.updated_at||0,deviceId:item.device_id||null});
      }
      if(localHash===item.sha256){return putSyncMeta(id,{revision:item.revision,sha256:item.sha256,deleted:false,updatedAt:item.updated_at||0,deviceId:item.device_id||null});}
      if(meta&&localHash===meta.sha256){replaceLocal(id,item.track);return putSyncMeta(id,{revision:item.revision,sha256:item.sha256,deleted:false,updatedAt:item.updated_at||0,deviceId:item.device_id||null});}
      if(meta&&Number(meta.revision)===Number(item.revision))return Promise.resolve();
      preserveConflictCopy(local,'Recovered from cross-device conflict');replaceLocal(id,item.track);
      return putSyncMeta(id,{revision:item.revision,sha256:item.sha256,deleted:false,updatedAt:item.updated_at||0,deviceId:item.device_id||null});
    });
  });}

  function mergeCloud(items){var chain=Promise.resolve(),changed=false;items.forEach(function(item){chain=chain.then(function(){var before=JSON.stringify(state.library);return applyCloudItem(item).then(function(){if(JSON.stringify(state.library)!==before)changed=true;});});});return chain.then(function(){if(changed)persistRemoteChanges();return items;});}

  function queueScan(){if(!ready||!accountKey)return Promise.resolve();return allSyncMeta().then(function(metaList){var metaMap={};metaList.forEach(function(m){metaMap[m.id]=m;});var localIds={};var p=Promise.resolve();state.library.forEach(function(track){if(!track||!track.id)return;localIds[track.id]=true;p=p.then(function(){return hashTrack(track).then(function(h){var m=metaMap[track.id];if(!m||m.deleted||m.sha256!==h){return putOutbox({id:track.id,op:'put',baseRevision:m?Number(m.revision)||0:0,track:clone(track),localHash:h});}return delOutbox(track.id);});});});metaList.forEach(function(m){if(!m.deleted&&!localIds[m.id]){p=p.then(function(){return putOutbox({id:m.id,op:'delete',baseRevision:Number(m.revision)||0});});}});return p.then(updatePending);});}
  function scheduleScan(){clearTimeout(scanTimer);scanTimer=setTimeout(function(){queueScan().then(function(){if(navigator.onLine)flushOutbox();}).catch(function(e){console.warn('private sync queue scan failed',e);});},1200);}

  function acceptPutSuccess(id,track,data,hash){return putSyncMeta(id,{revision:Number(data.revision)||1,sha256:String(data.sha256||hash||''),deleted:false,updatedAt:Number(data.updated_at)||Date.now(),deviceId:deviceId}).then(function(){return delOutbox(id);});}
  function acceptDeleteSuccess(id,data){return putSyncMeta(id,{revision:Number(data.revision)||1,sha256:'',deleted:true,updatedAt:Number(data.updated_at)||Date.now(),deviceId:deviceId}).then(function(){return delOutbox(id);});}

  function resolvePutConflict(op,conflict){var local=localById(op.id);if(conflict&&conflict.current&&conflict.current.content_sha256&&conflict.current.content_sha256===op.localHash){return putSyncMeta(op.id,{revision:Number(conflict.current.revision)||1,sha256:op.localHash,deleted:false,updatedAt:Number(conflict.current.updated_at)||Date.now(),deviceId:null}).then(function(){return delOutbox(op.id);});}
    return api('/tracks/'+encodeURIComponent(op.id)).then(jsonOrEmpty).then(function(x){if(!x.response.ok)throw new Error((x.data&&x.data.error)||'Could not resolve cloud conflict');var cloud=x.data;if(local)preserveConflictCopy(local,'Recovered from cross-device conflict');if(cloud.deleted)replaceLocal(op.id,null);else replaceLocal(op.id,cloud.track);persistRemoteChanges();return putSyncMeta(op.id,{revision:cloud.revision,sha256:cloud.sha256||'',deleted:!!cloud.deleted,updatedAt:cloud.updated_at||0,deviceId:cloud.device_id||null}).then(function(){return delOutbox(op.id);}).then(function(){setStatus('conflict','Conflict kept','A newer cloud version existed. Your unsynced local version was preserved as a separate Draft conflict copy, so no track data was discarded.');});});}
  function resolveDeleteConflict(op,conflict){if(conflict&&conflict.current&&conflict.current.deleted){return acceptDeleteSuccess(op.id,conflict.current);}return api('/tracks/'+encodeURIComponent(op.id)).then(jsonOrEmpty).then(function(x){if(!x.response.ok)throw new Error('Could not resolve delete conflict');var cloud=x.data;if(!cloud.deleted){replaceLocal(op.id,cloud.track);persistRemoteChanges();}return putSyncMeta(op.id,{revision:cloud.revision,sha256:cloud.sha256||'',deleted:!!cloud.deleted,updatedAt:cloud.updated_at||0,deviceId:cloud.device_id||null}).then(function(){return delOutbox(op.id);}).then(function(){setStatus('conflict','Delete cancelled','The track changed on another device after this device marked it for deletion. The newer cloud copy was restored locally instead of being deleted.');});});}

  function flushOutbox(){if(syncing||!ready||!accountKey||!navigator.onLine)return Promise.resolve();syncing=true;setStatus('syncing','Syncing','Uploading queued My Library changes…');return allOutbox().then(function(ops){var chain=Promise.resolve();ops.forEach(function(op){chain=chain.then(function(){if(op.op==='put'){
          var current=localById(op.id);if(!current)return delOutbox(op.id);return hashTrack(current).then(function(h){op.track=clone(current);op.localHash=h;return api('/tracks/'+encodeURIComponent(op.id),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({base_revision:Number(op.baseRevision)||0,track:op.track,device_id:deviceId})}).then(jsonOrEmpty).then(function(x){if(x.response.ok)return acceptPutSuccess(op.id,current,x.data,h);if(x.response.status===409)return resolvePutConflict(op,x.data);if(x.response.status===401)throw Object.assign(new Error('Sign in required'),{code:'signin'});if(x.response.status===503)throw Object.assign(new Error((x.data&&x.data.error)||'Cloud storage not ready'),{code:'setup'});throw new Error((x.data&&x.data.error)||('Upload HTTP '+x.response.status));});});
        }
        return api('/tracks/'+encodeURIComponent(op.id),{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({base_revision:Number(op.baseRevision)||0,device_id:deviceId})}).then(jsonOrEmpty).then(function(x){if(x.response.ok)return acceptDeleteSuccess(op.id,x.data);if(x.response.status===409)return resolveDeleteConflict(op,x.data);if(x.response.status===401)throw Object.assign(new Error('Sign in required'),{code:'signin'});if(x.response.status===503)throw Object.assign(new Error((x.data&&x.data.error)||'Cloud storage not ready'),{code:'setup'});throw new Error((x.data&&x.data.error)||('Delete HTTP '+x.response.status));});
      });});return chain;}).then(function(){setStatus('synced','Synced','My Library is saved locally and synced to your private cloud account.');}).catch(function(e){if(e&&e.code==='signin')setStatus('signin','Sign in','Private sync is ready but this browser needs to sign in.');else if(e&&e.code==='setup')setStatus('setup','Setup needed',e.message);else if(!navigator.onLine)setStatus('offline','Offline','Changes are saved locally and queued. They will upload when this device is online again.');else setStatus('offline','Sync pending','Changes are saved locally. Cloud upload will retry automatically. '+(e&&e.message?e.message:''));}).finally(function(){syncing=false;updatePending();});}

  function syncNow(){if(syncing)return Promise.resolve();if(!window.indexedDB){setStatus('setup','Unsupported','IndexedDB is unavailable. Private cloud sync stays disabled on this device because a durable local queue cannot be guaranteed.');return Promise.resolve();}setStatus('syncing','Checking','Checking private cloud storage and account…');return health().then(function(h){if(!h.storageReady){ready=false;setStatus('setup','Setup needed',h.storageDetail||'Private cloud storage is not provisioned yet.');return false;}if(!h.authConfigured){ready=false;setStatus('setup','Setup needed','Private account authentication is not configured yet.');return false;}if(!h.authenticated||!h.accountKey){ready=false;setStatus('signin','Sign in','Sign in to your private ManCardo account before syncing My Library across devices.');return false;}return bindAccount(h).then(function(ok){if(!ok)return false;ready=true;setStatus('syncing','Syncing','Checking for newer My Library changes from your other devices…');return pullAll().then(mergeCloud).then(queueScan).then(flushOutbox).then(function(){if(ready&&!syncing)setStatus('synced','Synced','My Library is saved locally and synced to your private cloud account.');return true;});});}).catch(function(e){ready=false;if(!navigator.onLine)setStatus('offline','Offline','Local editing remains available. Cloud sync will retry when the network returns.');else setStatus('signin','Sign in','Private cloud could not verify this browser session. Use Sign in, then Sync now.');console.warn('private sync failed',e);});}

  document.getElementById('mancardoPrivateSyncClose').onclick=function(){overlay.classList.add('hidden');};document.getElementById('mancardoPrivateSyncDone').onclick=function(){overlay.classList.add('hidden');};document.getElementById('mancardoPrivateSyncNow').onclick=syncNow;document.getElementById('mancardoPrivateSyncSignIn').onclick=function(){window.open(API_PREFIX+'/login','mancardo-private-login','width=640,height=700');};chip.onclick=function(){overlay.classList.remove('hidden');msgEl.textContent=lastMessage;updatePending();};overlay.addEventListener('click',function(ev){if(ev.target===overlay)overlay.classList.add('hidden');});

  if(els&&els.saveBtn){var baseSaveClick=els.saveBtn.onclick;els.saveBtn.onclick=function(){var r=baseSaveClick&&baseSaveClick.apply(this,arguments);setTimeout(function(){queueScan().then(flushOutbox);},30);return r;};}
  window.addEventListener('online',function(){setTimeout(syncNow,250);});window.addEventListener('offline',function(){setStatus('offline','Offline','Changes remain saved locally and will sync when the network returns.');});document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')setTimeout(syncNow,400);});
  setInterval(function(){if(document.visibilityState==='visible'&&navigator.onLine)syncNow();},60000);
  setTimeout(syncNow,900);
})();
`;

function injectActiveSync(html){
  if(html.includes('installMancardoPrivateCloudSync'))return html;
  html=html.replace('</head>',ACTIVE_SYNC_CSS+'\n</head>');
  const close=html.lastIndexOf('})();');
  if(close===-1)return html;
  return html.slice(0,close)+ACTIVE_SYNC_FEATURE+'\n'+html.slice(close);
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname===API_PREFIX+'/login'&&request.method==='GET')return loginPage(env,request);
    if(url.pathname===API_PREFIX+'/health'&&request.method==='GET'){
      const response=await baseWorker.fetch(request,env,ctx);
      return enrichHealth(request,response);
    }
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=injectActiveSync(await response.text());
    const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
