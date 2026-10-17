import baseWorker from './worker-autosave-stability.js';

const OLD_DELETE_BRIDGE = /<script id="mancardo-explicit-delete-bridge">[\s\S]*?<\/script>/i;

// Plain JavaScript, not a script element: this executes inside the editor IIFE.
const DURABLE_DELETE_BRIDGE = String.raw`
// ---------- Durable, revision-pinned explicit My Library deletion ----------
(function(){
  if(window.__mancardoExplicitDeleteBridgeInstalled)return;
  window.__mancardoExplicitDeleteBridgeInstalled=true;
  var PENDING_KEY='mancardo_authorized_delete_pending_v4';
  var LIBRARY_KEY='switchback_local_tracks_v1';
  var workspaceAccount='',retrying=false,authorizing=false;

  function readPending(){
    var a=JSON.parse(localStorage.getItem(PENDING_KEY)||'[]');
    if(!Array.isArray(a))throw new Error('Delete queue is not readable. No deletion was applied.');
    return a.filter(function(x){return x&&x.id&&x.accountKey&&x.authorizedUserDelete===true&&Number.isInteger(x.baseRevision)&&x.baseRevision>0;});
  }
  function writePending(a){
    // Never remove the only local copy if the durable intent cannot be saved.
    localStorage.setItem(PENDING_KEY,JSON.stringify(a));
    return a;
  }
  function matches(a,b){return a.id===b.id&&a.accountKey===b.accountKey;}
  function removePending(record){return writePending(readPending().filter(function(x){return !matches(x,record);}));}
  function pendingFor(account,id){return readPending().find(function(x){return x.accountKey===account&&x.id===String(id);});}
  function markStatus(kind,label,message){
    if(window.mancardoSetDeleteStatus){window.mancardoSetDeleteStatus(kind,label,message);return;}
    var chip=document.getElementById('mancardoPrivateSyncChip');
    if(chip){chip.dataset.state=kind;chip.textContent='☁ '+label;chip.title=message;}
  }
  function report(error){
    markStatus('offline','Delete pending',error&&error.message||'Deletion is waiting for cloud confirmation.');
    console.warn('Explicit delete has not completed',error);
  }
  function api(path,opts,account){
    opts=opts||{};opts.credentials='include';opts.cache='no-store';
    opts.headers=Object.assign({'accept':'application/json'},opts.headers||{});
    if(account)opts.headers['x-mancardo-delete-account']=account;
    return fetch('/api/private-library'+path,opts).then(function(r){return r.json().catch(function(){return {};}).then(function(d){return {r:r,d:d};});});
  }
  function device(){try{return localStorage.getItem('mancardo_private_device_id_v1')||'';}catch(e){return '';}}

  function readWorkspace(ids){
    // Use the last revision actually reconciled by THIS workspace, never a new
    // GET revision. An offline delete cannot acquire authority over newer edits.
    return new Promise(function(resolve,reject){
      var request=indexedDB.open('mancardo_private_sync_v2',1);
      request.onupgradeneeded=function(){request.transaction.abort();};
      request.onerror=function(){reject(new Error('Sync My Library before deleting cloud tracks.'));};
      request.onsuccess=function(){
        var db=request.result,t;
        try{t=db.transaction(['meta','sync'],'readonly');}catch(e){db.close();reject(e);return;}
        var result={accountKey:'',records:[]};
        var bound=t.objectStore('meta').get('boundAccountKey');
        bound.onsuccess=function(){
          result.accountKey=String(bound.result&&bound.result.value||'');
          if(!result.accountKey)return;
          ids.forEach(function(id){
            var r=t.objectStore('sync').get(result.accountKey+'|'+id);
            r.onsuccess=function(){result.records.push({id:String(id),meta:r.result});};
          });
        };
        t.oncomplete=function(){db.close();resolve(result);};
        t.onerror=t.onabort=function(){db.close();reject(t.error||new Error('Cannot read the private sync workspace.'));};
      };
    });
  }
  function persistRemoval(ids){
    var blocked=Object.create(null);ids.forEach(function(id){blocked[String(id)]=true;});
    state.library=(state.library||[]).filter(function(t){return !(t&&blocked[String(t.id)]);});
    if(state.currentId&&blocked[String(state.currentId)]){state.current=null;state.currentId=null;state.selection=null;}
    state.trackMenuId=null;state.paletteId=null;
    // Do not schedule an upload from this deliberate removal.
    localStorage.setItem(LIBRARY_KEY,JSON.stringify(state.library));
    if(typeof render==='function')render();
    if(typeof renderLibrary==='function')renderLibrary();
  }
  function hidePendingLocally(){
    if(!workspaceAccount)return;
    var ids=readPending().filter(function(x){return x.accountKey===workspaceAccount;}).map(function(x){return x.id;});
    if((state.library||[]).some(function(t){return t&&ids.indexOf(String(t.id))>=0;}))persistRemoval(ids);
  }
  window.mancardoHasPendingDelete=function(account,id){return !!pendingFor(account,id);};
  window.mancardoDeleteBlocksCloudItem=function(account,item){
    var record=pendingFor(account,item.track_id);
    if(!record)return false;
    // A successful DELETE acknowledgement must also dominate an older pull that
    // was already in flight. Keep the revision watermark even after reconciliation.
    if(record.confirmedRevision&&Number(item.revision)>record.confirmedRevision&&!item.deleted){removePending(record);return false;}
    if(record.confirmedRevision&&item.deleted&&Number(item.revision)>=record.confirmedRevision)return false;
    return true;
  };
  function confirmed(record,revision){
    var pending=readPending();
    pending.forEach(function(x){if(matches(x,record))x.confirmedRevision=Number(revision)||record.baseRevision+1;});
    writePending(pending);
    markStatus('synced','Delete confirmed','The cloud confirmed this deletion.');
  }
  function reconcile(){window.dispatchEvent(new Event('online'));}
  function deleteCloudTrack(record){
    return api('/tracks/'+encodeURIComponent(record.id),{
      method:'DELETE',headers:{'content-type':'application/json'},
      body:JSON.stringify({base_revision:record.baseRevision,device_id:device(),authorized_user_delete:true,delete_intent:'explicit-ui-delete',requested_at:record.requestedAt})
    },record.accountKey).then(function(x){
      if(x.r.ok&&x.d.deleted){confirmed(record,x.d.revision);return;}
      if(x.r.status===409&&x.d.code==='revision_conflict'){
        // Covers a response lost after a successful DELETE, without issuing a
        // second DELETE at the newly observed revision.
        if(x.d.current&&x.d.current.deleted){confirmed(record,x.d.current.revision);return;}
        removePending(record);
        markStatus('conflict','Delete cancelled','This track changed on another device. The newer cloud copy will be restored; review it before deleting again.');
        reconcile();
        return;
      }
      throw new Error((x.d&&x.d.error)||('Delete HTTP '+x.r.status));
    });
  }
  function retryPending(){
    if(retrying||!navigator.onLine)return Promise.resolve();
    try{if(!readPending().some(function(x){return !x.confirmedRevision;}))return Promise.resolve();}catch(e){report(e);return Promise.resolve();}
    retrying=true;
    return readWorkspace([]).then(function(ws){
      workspaceAccount=ws.accountKey;
      return api('/health');
    }).then(function(h){
      if(!h.r.ok||!h.d.authenticated||!h.d.storageReady||h.d.accountKey!==workspaceAccount)throw new Error('Deletion paused: sign in to the account bound to this private workspace.');
      hidePendingLocally();
      var records=readPending().filter(function(x){return x.accountKey===workspaceAccount&&!x.confirmedRevision;});
      var chain=Promise.resolve();
      records.forEach(function(record){chain=chain.then(function(){return deleteCloudTrack(record).catch(report);});});
      return chain.then(function(){if(records.length)reconcile();});
    }).catch(report).finally(function(){retrying=false;});
  }
  function revisionHashes(snapshot){
    // Show/selection is presentation state, not a newer route edit. Recognise
    // only these known visible-field variants; never relax name/points/note/etc.
    var track=JSON.parse(snapshot),texts=[snapshot];
    if(!Object.prototype.hasOwnProperty.call(track,'visible')||track.visible===null||typeof track.visible==='boolean'){
      [true,false,null].forEach(function(visible){var candidate=JSON.parse(snapshot);candidate.visible=visible;texts.push(JSON.stringify(candidate));});
      var absent=JSON.parse(snapshot);delete absent.visible;texts.push(JSON.stringify(absent));
    }
    return Promise.all(Array.from(new Set(texts)).map(function(text){return crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)).then(function(d){return Array.from(new Uint8Array(d)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');});}));
  }
  function authorisedDelete(ids){
    if(authorizing)return Promise.resolve(false);
    ids=Array.from(new Set((ids||[]).map(String))).filter(function(id){return (state.library||[]).some(function(t){return t&&String(t.id)===id;});});
    if(!ids.length)return Promise.resolve(false);
    var snapshots=Object.create(null);ids.forEach(function(id){snapshots[id]=JSON.stringify((state.library||[]).find(function(t){return t&&String(t.id)===id;}));});
    authorizing=true;
    var hashes=Promise.resolve().then(function(){return Promise.all(ids.map(function(id){return revisionHashes(snapshots[id]).then(function(hashes){return [id,hashes];});}));});
    return Promise.all([readWorkspace(ids),hashes]).then(function(result){
      var ws=result[0],hashes=Object.fromEntries(result[1]);
      if(!ws.accountKey||ws.records.length!==ids.length)throw new Error('Sync My Library before deleting. The local tracks have not been removed.');
      var records=ws.records.map(function(x){
        if(!x.meta||x.meta.deleted||!Number.isInteger(Number(x.meta.revision))||Number(x.meta.revision)<1)throw new Error('Sync My Library before deleting. A known cloud revision is required; no track was removed.');
        if(hashes[x.id].indexOf(x.meta.sha256)<0||JSON.stringify((state.library||[]).find(function(t){return t&&String(t.id)===x.id;}))!==snapshots[x.id])throw new Error('This track has unsynced or newly received changes. Sync and review it before deleting; no track was removed.');
        return {id:x.id,accountKey:ws.accountKey,baseRevision:Number(x.meta.revision),authorizedUserDelete:true,requestedAt:Date.now()};
      });
      workspaceAccount=ws.accountKey;
      var pending=readPending();
      records.forEach(function(record){if(!pending.some(function(x){return matches(x,record);}))pending.push(record);});
      writePending(pending);
      persistRemoval(ids);
      markStatus('offline','Delete pending','Deletion is saved on this device and awaiting cloud confirmation.');
      return retryPending().then(function(){return true;});
    }).catch(function(e){markStatus('conflict','Delete not applied',e&&e.message||'No deletion was applied.');console.warn('Delete authorization failed',e);return false;}).finally(function(){authorizing=false;});
  }
  window.mancardoAuthorizedDelete=authorisedDelete;

  document.addEventListener('click',function(ev){
    var target=ev.target&&ev.target.closest?ev.target.closest('.mancardo-menu-delete,#deleteTrackBtn,#deleteSelectedBtn'):null;
    if(!target)return;
    if(target.id==='deleteTrackBtn'&&!target.classList.contains('confirming'))return;
    ev.preventDefault();ev.stopImmediatePropagation();
    if(target.classList.contains('mancardo-menu-delete')){
      var card=target.closest('.track-item'),id=card&&card.getAttribute('data-track-id');
      var item=(state.library||[]).find(function(t){return t&&String(t.id)===String(id);});
      if(item&&window.confirm('Delete "'+(item.name||'this track')+'" from My Library? This cannot be undone.'))authorisedDelete([id]);
    }else if(target.id==='deleteSelectedBtn'){
      var selected=(state.library||[]).filter(function(t){return t&&t.visible!==false;});
      if(selected.length&&window.confirm('Delete '+selected.length+' selected track(s) from My Library? This cannot be undone.'))authorisedDelete(selected.map(function(t){return t.id;}));
    }else{
      clearTimeout(confirmTimers[target.id]);target.classList.remove('confirming');target.textContent=target.dataset.label;
      if(state.currentId)authorisedDelete([state.currentId]);
    }
  },true);
  window.addEventListener('online',function(){setTimeout(retryPending,100);});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')setTimeout(retryPending,100);});
  setInterval(function(){if(document.visibilityState==='visible'&&readPending().some(function(x){return !x.confirmedRevision;}))retryPending();},15000);
  readWorkspace([]).then(function(ws){workspaceAccount=ws.accountKey;hidePendingLocally();if(readPending().length)retryPending();}).catch(report);
})();
`;

function injectDurableDeletion(html){
  const boot=html.indexOf('// ---------- boot ----------');
  if(boot<0)return html;
  html=html.replace(OLD_DELETE_BRIDGE,'');
  const apply='function applyCloudItem(item){';
  const scan='state.library.forEach(function(track){if(!track||!track.id)return;';
  const replace='function replaceLocal(id,track){';
  const preserve='function preserveConflictCopy(track,reason){';
  if(!html.includes(apply)||!html.includes(scan)||!html.includes(replace)||!html.includes(preserve))throw new Error('Private sync integration anchors missing; refusing an unqualified delete client.');
  html=html.replace(apply,'window.mancardoSetDeleteStatus=setStatus;\n'+apply+'if(window.mancardoDeleteBlocksCloudItem&&window.mancardoDeleteBlocksCloudItem(accountKey,item))return Promise.resolve();');
  html=html.replace(scan,scan+'if(window.mancardoHasPendingDelete&&window.mancardoHasPendingDelete(accountKey,track.id))return;');
  html=html.replace(replace,replace+'if(track&&window.mancardoHasPendingDelete&&window.mancardoHasPendingDelete(accountKey,id))return;');
  html=html.replace(preserve,preserve+'if(track&&window.mancardoHasPendingDelete&&window.mancardoHasPendingDelete(accountKey,track.id))return null;');
  const insertion=html.indexOf('// ---------- boot ----------');
  return html.slice(0,insertion)+DURABLE_DELETE_BRIDGE+'\n'+html.slice(insertion);
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    // Check account identity on the SAME authenticated request that would mutate
    // D1, not only a previous browser health check (which can race a sign-in).
    if(request.method==='DELETE'&&/^\/api\/private-library\/tracks\/[^/]+$/.test(url.pathname)){
      const expected=request.headers.get('x-mancardo-delete-account');
      if(!expected)return Response.json({error:'An account-bound explicit delete is required.',code:'delete_account_required'},{status:400});
      const healthUrl=new URL(request.url);healthUrl.pathname='/api/private-library/health';healthUrl.search='';
      const response=await baseWorker.fetch(new Request(healthUrl,{headers:request.headers}),env,ctx);
      const health=await response.json().catch(()=>({}));
      if(!response.ok||!health.authenticated||!health.accountKey||health.accountKey!==expected)return Response.json({error:'The signed-in account changed. Deletion is paused.',code:'delete_account_mismatch'},{status:409});
    }
    const response=await baseWorker.fetch(request,env,ctx);
    if(!(response.headers.get('content-type')||'').includes('text/html'))return response;
    const html=injectDurableDeletion(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store, max-age=0');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
