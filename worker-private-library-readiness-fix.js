import baseWorker from './worker-private-library-integrity.js';

const READINESS_FIX = String.raw`
<script id="mancardo-private-readiness-fix">
(function installMancardoPrivateReadinessFix(){
  if(window.__mancardoPrivateReadinessFixInstalled)return;
  window.__mancardoPrivateReadinessFixInstalled=true;

  function setRow(ok,detail){
    var row=document.getElementById('mancardoCompat_privateMirror');
    if(!row)return;
    row.classList.remove('pass','fail','pending');
    row.classList.add(ok?'pass':'fail');
    row.dataset.ok=ok?'1':'0';
    var icon=row.querySelector('.mancardo-device-icon');
    var name=row.querySelector('.mancardo-device-name');
    var detailEl=row.querySelector('.mancardo-device-detail');
    if(icon)icon.textContent=ok?'✓':'×';
    if(name)name.textContent='Private local workspace';
    if(detailEl)detailEl.textContent=detail;
    refreshSummary();
  }

  function refreshSummary(){
    var list=document.getElementById('mancardoDeviceCompatList');
    var summary=document.getElementById('mancardoDeviceCompatSummary');
    if(!list||!summary)return;
    var rows=list.querySelectorAll('.mancardo-device-row'),pending=0,fail=0;
    Array.prototype.forEach.call(rows,function(r){
      if(r.classList.contains('pending'))pending++;
      else if(r.classList.contains('fail'))fail++;
    });
    if(pending)return;
    summary.textContent=fail===0
      ?'All compatibility and private-sync readiness checks passed on this device.'
      :fail+' check'+(fail===1?'':'s')+' need attention. Failed items include a short explanation; optional failures do not necessarily prevent core local editing.';
  }

  function probe(){
    if(!window.indexedDB){
      setRow(false,'Private sync IndexedDB workspace is unavailable.');
      return;
    }
    var req;
    try{req=indexedDB.open('mancardo_private_sync_v2',1);}catch(e){
      setRow(false,'Private sync IndexedDB workspace could not be opened: '+(e&&e.message?e.message:'blocked'));
      return;
    }
    req.onupgradeneeded=function(){
      var db=req.result;
      if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta',{keyPath:'key'});
      if(!db.objectStoreNames.contains('sync'))db.createObjectStore('sync',{keyPath:'key'});
      if(!db.objectStoreNames.contains('outbox')){
        var store=db.createObjectStore('outbox',{keyPath:'key'});
        store.createIndex('queuedAt','queuedAt');
      }
    };
    req.onerror=function(){setRow(false,'Private sync IndexedDB workspace open failed.');};
    req.onsuccess=function(){
      var db=req.result;
      var required=['meta','sync','outbox'];
      var missing=required.filter(function(name){return !db.objectStoreNames.contains(name);});
      if(missing.length){db.close();setRow(false,'Private sync workspace is incomplete: missing '+missing.join(', ')+'.');return;}
      try{
        var tx=db.transaction('meta','readwrite');
        var store=tx.objectStore('meta');
        store.put({key:'__device_check_probe__',value:Date.now()});
        store.delete('__device_check_probe__');
        tx.oncomplete=function(){db.close();setRow(true,'Private sync IndexedDB workspace is writable.');};
        tx.onerror=function(){db.close();setRow(false,'Private sync IndexedDB workspace opened but write access failed.');};
        tx.onabort=function(){db.close();setRow(false,'Private sync IndexedDB workspace write was blocked.');};
      }catch(e){db.close();setRow(false,'Private sync IndexedDB workspace write failed: '+(e&&e.message?e.message:'blocked'));}
    };
  }

  function scheduleProbe(){setTimeout(probe,450);}
  document.addEventListener('click',function(ev){
    var t=ev.target;if(!t||!t.closest)return;
    if(t.closest('#mancardoDeviceCheckBtn')||t.closest('#mancardoDeviceCompatRun'))scheduleProbe();
  },true);
})();
</script>`;

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=await response.text();
    if(!html.includes('mancardo-private-readiness-fix'))html=html.replace('</body>',READINESS_FIX+'\n</body>');
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
