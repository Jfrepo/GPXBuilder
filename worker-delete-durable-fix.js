import baseWorker from './worker-autosave-stability.js';
import { repairRequestCadence } from './worker-request-cadence.js';

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
  function reconcile(){window.dispatchEvent(new Event('mancardo:private-reconcile'));}
  function deleteCloudTrack(record){
    return api('/tracks/'+encodeURIComponent(record.id),{
      method:'DELETE',headers:{'content-type':'application/json'},
      body:JSON.stringify({base_revision:record.baseRevision,device_id:device(),authorized_user_delete:true,delete_intent:'explicit-ui-delete',requested_at:record.requestedAt})
    },record.accountKey).then(function(x){
      if(x.r.ok&&x.d.deleted){confirmed(record,x.d.revision);return true;}
      if(x.r.status===409&&x.d.code==='revision_conflict'){
        // Covers a response lost after a successful DELETE, without issuing a
        // second DELETE at the newly observed revision.
        if(x.d.current&&x.d.current.deleted){confirmed(record,x.d.current.revision);return true;}
        removePending(record);
        markStatus('conflict','Delete cancelled','This track changed on another device. The newer cloud copy will be restored; review it before deleting again.');
        return true;
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
      var chain=Promise.resolve(),changed=false;
      records.forEach(function(record){chain=chain.then(function(){return deleteCloudTrack(record).then(function(didChange){if(didChange)changed=true;}).catch(report);});});
      // Failed attempts remain pending for the normal retry cadence. They must
      // not synthesize online and recursively trigger their own retry handler.
      return chain.then(function(){if(changed)reconcile();});
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
  window.mancardoReconciledRevisionHashes=revisionHashes;
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

// Runs inside the actual cloud-sync IIFE. Other devices do not have this
// browser's explicit-delete intent, so they must reconcile a server tombstone
// against their own last reconciled content instead of always making a copy.
const REMOTE_TOMBSTONE_RECONCILIATION = String.raw`
  function acknowledgeVerifiedLivePut(op,cloud,owner){
    if(!owner||accountKey!==owner||op.accountKey!==owner)return Promise.reject(new Error('Private account changed during upload reconciliation.'));
    var revision=Number(cloud.revision);
    if((cloud.deleted!==false&&cloud.deleted!==0)||cloud.sha256!==op.localHash||!Number.isInteger(revision)||revision<1)return Promise.reject(new Error('Unverified live upload acknowledgment.'));
    return openDb().then(function(db){
      return new Promise(function(resolve,reject){
        var transaction,store,request,accepted=false;
        try{
          if(accountKey!==owner)throw new Error('Private account changed during upload reconciliation.');
          transaction=db.transaction('sync','readwrite');store=transaction.objectStore('sync');request=store.get(owner+'|'+op.id);
          request.onsuccess=function(){
            try{
              var meta=request.result;
              if(accountKey!==owner||(meta&&meta.accountKey!==owner))throw new Error('Private account changed during upload reconciliation.');
              if(meta&&(Number(meta.revision)>revision||(Number(meta.revision)===revision&&meta.deleted!==false&&meta.deleted!==0)))return;
              // Check and acknowledge in one transaction. Never replace local
              // content or clear its queue: the next scan retains newer edits.
              store.put({key:owner+'|'+op.id,id:op.id,accountKey:owner,revision:revision,sha256:cloud.sha256,deleted:false,updatedAt:cloud.updated_at||0,deviceId:cloud.device_id||null});accepted=true;
            }catch(error){transaction.abort();reject(error);}
          };
          transaction.oncomplete=function(){db.close();resolve(accepted);};
          transaction.onerror=transaction.onabort=function(){db.close();reject(new Error('Upload acknowledgment was not committed.'));};
        }catch(error){db.close();reject(error);}
      });
    });
  }
  function applyCloudTombstone(item){
    var id=String(item.track_id),owner=accountKey,revision=Number(item.revision),attempts=0;
    if(item.deleted!==true||!Number.isInteger(revision)||revision<1)return Promise.reject(new Error('Invalid cloud deletion revision.'));
    function sameOwner(){if(!ready||!owner||accountKey!==owner)throw new Error('Private account changed during deletion reconciliation.');}
    function inspect(){
      sameOwner();
      if(++attempts>3)return Promise.resolve(false); // Busy editor: defer, never discard a late edit.
      return getSyncMeta(id).then(function(meta){
        sameOwner();
        if(meta&&meta.accountKey!==owner)throw new Error('Cloud deletion metadata belongs to another account.');
        var known=!!(meta&&Number.isInteger(Number(meta.revision))&&Number(meta.revision)>0),knownLive=!!(known&&(meta.deleted===false||meta.deleted===0));
        // An older/equal tombstone cannot supersede a newer/equal known live row.
        if(known&&(Number(meta.revision)>revision||(knownLive&&Number(meta.revision)===revision)))return false;
        var local=localById(id),snapshot=local?JSON.stringify(local):null,metaSnapshot=JSON.stringify(meta||null);
        var editor=String(state.currentId||'')===id?state.current:null,editorSnapshot=editor?JSON.stringify(editor):null;
        var hashes=Promise.all([local?window.mancardoReconciledRevisionHashes(snapshot):Promise.resolve([]),editor?window.mancardoReconciledRevisionHashes(editorSnapshot):Promise.resolve([])]);
        return hashes.then(function(groups){
          return getSyncMeta(id).then(function(latestMeta){
            sameOwner();
            var latest=localById(id),latestEditor=String(state.currentId||'')===id?state.current:null;
            // Both checks happen after the FINAL await. A new object, edit, or
            // sync result that arrived during hashing must be reconsidered.
            if(JSON.stringify(latestMeta||null)!==metaSnapshot||(latest?JSON.stringify(latest):null)!==snapshot||(latestEditor?JSON.stringify(latestEditor):null)!==editorSnapshot)return inspect();
            var values=groups[0],editorValues=groups[1];
            // The editor is a separate clone. Preserve/defer an edit that has
            // not reached the library rather than clearing it with the row.
            if(latestEditor&&!editorValues.some(function(hash){return values.indexOf(hash)>=0;}))return false;
            var unchanged=!!(knownLive&&Number(meta.revision)<revision&&values.indexOf(meta.sha256)>=0);
            if(latest&&!unchanged)preserveConflictCopy(latest,'Recovery snapshot before cloud delete');
            replaceLocal(id,null);
            return putSyncMeta(id,{revision:revision,sha256:item.sha256||'',deleted:true,updatedAt:item.updated_at||0,deviceId:item.device_id||null}).then(function(){
              sameOwner();
              return tx('outbox','readwrite',function(store){sameOwner();return store.delete(owner+'|'+id);});
            }).then(function(){return true;});
          });
        });
      });
    }
    return inspect();
  }
`;

// A live pull has the same late-edit hazard as a tombstone: hashing and
// metadata reads yield while the editor can replace or mutate the local row.
// Revalidate every input after the final await and reconsider only a bounded
// number of times. An unsaved editor clone is never discarded by a cloud pull.
const LIVE_ROW_RECONCILIATION = String.raw`
  var liveReconciliationDeferred=false;
  function deferLiveReconciliation(){liveReconciliationDeferred=true;return false;}
  function applyCloudItem(item){
    var id=String(item.track_id),owner=accountKey,revision=Number(item.revision),attempts=0;
    function sameOwner(){if(!ready||!owner||accountKey!==owner)throw new Error('Private account changed during live reconciliation.');}
    function blocked(){return window.mancardoDeleteBlocksCloudItem&&window.mancardoDeleteBlocksCloudItem(owner,item);}
    sameOwner();
    if(blocked())return Promise.resolve(false);
    if(item.deleted===true)return applyCloudTombstone(item);
    if((item.deleted!==false&&item.deleted!==0)||!Number.isInteger(revision)||revision<1||!item.track||String(item.track.id)!==id) return Promise.reject(new Error('Invalid cloud live revision.'));
    function inspect(){
      sameOwner();
      if(++attempts>3)return Promise.resolve(deferLiveReconciliation());
      return getSyncMeta(id).then(function(meta){
        sameOwner();
        if(meta&&meta.accountKey!==owner)throw new Error('Cloud live metadata belongs to another account.');
        var known=!!(meta&&Number.isInteger(Number(meta.revision))&&Number(meta.revision)>0),knownLive=!!(known&&(meta.deleted===false||meta.deleted===0));
        if(known&&(Number(meta.revision)>revision||(Number(meta.revision)===revision&&!knownLive)))return false;
        var local=localById(id),snapshot=local?JSON.stringify(local):null,metaSnapshot=JSON.stringify(meta||null);
        var editor=String(state.currentId||'')===id?state.current:null,editorSnapshot=editor?JSON.stringify(editor):null;
        return Promise.all([local?hashTrack(local):Promise.resolve(null),editor?window.mancardoReconciledRevisionHashes(editorSnapshot):Promise.resolve([])]).then(function(hashes){
          return getSyncMeta(id).then(function(latestMeta){
            sameOwner();
            var latest=localById(id),latestEditor=String(state.currentId||'')===id?state.current:null;
            if(JSON.stringify(latestMeta||null)!==metaSnapshot||(latest?JSON.stringify(latest):null)!==snapshot||(latestEditor?JSON.stringify(latestEditor):null)!==editorSnapshot)return inspect();
            if(blocked())return false;
            var localHash=hashes[0];
            if(latestEditor&&(!latest||hashes[1].indexOf(localHash)<0))return deferLiveReconciliation();
            var acknowledgement={revision:revision,sha256:item.sha256||'',deleted:false,updatedAt:item.updated_at||0,deviceId:item.device_id||null};
            if(!latest){replaceLocal(id,item.track);return putSyncMeta(id,acknowledgement);}
            if(localHash===item.sha256)return putSyncMeta(id,acknowledgement);
            if(knownLive&&localHash===meta.sha256){replaceLocal(id,item.track);return putSyncMeta(id,acknowledgement);}
            if(known&&Number(meta.revision)===revision)return false;
            preserveConflictCopy(latest,'Recovered from cross-device conflict');replaceLocal(id,item.track);
            return putSyncMeta(id,acknowledgement);
          });
        });
      });
    }
    return inspect();
  }
`;

// A conflicting PUT's GET can also outlive an editor change. Use the same
// final-await reconciliation as ordinary pulls; a deferred editor keeps both
// its local content and the owner-bound queued operation intact.
const LIVE_PUT_CONFLICT_RECONCILIATION = String.raw`
  function resolvePutConflict(op,conflict){
    var conflictOwner=accountKey;
    function sameOwner(){if(!ready||!conflictOwner||accountKey!==conflictOwner||op.accountKey!==conflictOwner)throw new Error('Private account changed during upload reconciliation.');}
    sameOwner();
    if(conflict&&conflict.current&&(conflict.current.deleted===false||conflict.current.deleted===0)&&conflict.current.content_sha256&&conflict.current.content_sha256===op.localHash)return acknowledgeVerifiedLivePut(op,{revision:conflict.current.revision,sha256:conflict.current.content_sha256,deleted:false,updated_at:conflict.current.updated_at},conflictOwner);
    return api('/tracks/'+encodeURIComponent(op.id),{headers:{'x-mancardo-private-account':op.accountKey}}).then(jsonOrEmpty).then(function(x){
      sameOwner();
      if(!x.response.ok)throw new Error('Could not resolve cloud conflict');
      var cloud=x.data;
      if(cloud.deleted)return applyCloudTombstone(cloud).then(function(){persistRemoteChanges();});
      if((cloud.deleted===false||cloud.deleted===0)&&cloud.sha256===op.localHash)return acknowledgeVerifiedLivePut(op,cloud,conflictOwner);
      return applyCloudItem(cloud).then(function(applied){
        sameOwner();
        if(applied===false){setStatus('offline','Sync pending','A local editor change is still being preserved. Save or reconcile that edit before applying the cloud version.');return false;}
        persistRemoteChanges();
        return tx('outbox','readwrite',function(store){sameOwner();return store.delete(conflictOwner+'|'+op.id);}).then(function(){setStatus('conflict','Conflict kept','A newer cloud version existed. Your unsynced local version was preserved as a separate Draft conflict copy.');});
      });
    });
  }
`;

function injectDurableDeletion(html){
  const boot=html.indexOf('// ---------- boot ----------');
  if(boot<0)return html;
  html=html.replace(OLD_DELETE_BRIDGE,'');
  // The note decoration bridge used a second, unbound private replication
  // path. Actual textarea edits already call saveTrackNote -> persistLibrary,
  // which the revision/account-aware cloud client observes. Keep decoration
  // and shared notes, but never let this legacy bridge read/write private data.
  const noteScript=/<script id="mancardo-stable-note-ui">([\s\S]*?)<\/script>/;
  const noteMatch=html.match(noteScript);
  const noteSync=/^  function sync\(id,note,retry\)\{[^\n]*\}$/m;
  const notePull=/^  function pull\(\)\{[^\n]*\}$/m;
  if(!noteMatch||!noteSync.test(noteMatch[1])||!notePull.test(noteMatch[1]))throw new Error('Private note integration anchors missing; refusing an unbound note client.');
  html=html.replace(noteScript,(_,script)=>'<script id="mancardo-stable-note-ui">'+script.replace(noteSync,'  function sync(){/* Private notes use the account-bound editor sync. */}').replace(notePull,'  function pull(){/* Private notes arrive through the account-bound editor sync. */}')+'</script>');
  const privateApi="function api(path,opts){opts=opts||{};opts.credentials='include';opts.cache='no-store';opts.headers=Object.assign({'accept':'application/json'},opts.headers||{});return fetch('/api/private-library'+path,opts);}";
  const bindAccount=/^  function bindAccount\(h\)\{[^\n]*\}$/m;
  if(!html.includes(privateApi)||!bindAccount.test(html))throw new Error('Private account integration anchors missing; refusing an unbound sync client.');
  // A health preflight can become stale when the browser's authenticated
  // session changes. Pin every private track request to the durable workspace,
  // not only the mutable last-health accountKey, and validate at the server.
  html=html.replace(bindAccount,"  function bindAccount(h){var candidateKey=String(h.accountKey||''),candidateLabel=String(h.accountLabel||'');if(!candidateKey)return Promise.resolve(false);return getMetaValue(ACCOUNT_META).then(function(bound){if(bound&&bound!==candidateKey){ready=false;setStatus('paused','Paused','A different private account previously used this browser profile. Sync is paused. Use a separate browser profile; your local changes remain saved.');return false;}function activate(){privateWorkspaceAccount=candidateKey;accountKey=candidateKey;accountLabel=candidateLabel;return true;}return bound?activate():setMetaValue(ACCOUNT_META,candidateKey).then(activate);});}");
  html=html.replace(privateApi,"var privateWorkspaceAccount='';\n  function api(path,opts){opts=opts||{};opts.credentials='include';opts.cache='no-store';opts.headers=Object.assign({'accept':'application/json'},opts.headers||{});if(/^\\/tracks(?:\\/|\\?|$)/.test(path)){var owner=opts.headers['x-mancardo-private-account']||privateWorkspaceAccount;if(!owner||owner!==privateWorkspaceAccount||accountKey!==owner)return Promise.reject(new Error('Private account changed; workspace sync is paused.'));opts.headers['x-mancardo-private-account']=owner;}return fetch('/api/private-library'+path,opts);}");
  const queuedPut="return api('/tracks/'+encodeURIComponent(op.id),{method:'PUT',headers:{'content-type':'application/json'},";
  const conflictGet="return api('/tracks/'+encodeURIComponent(op.id)).then(jsonOrEmpty)";
  if(!html.includes(queuedPut)||!html.includes(conflictGet))throw new Error('Private operation-owner anchors missing; refusing an unbound upload.');
  html=html.replace(queuedPut,"return api('/tracks/'+encodeURIComponent(op.id),{method:'PUT',headers:{'content-type':'application/json','x-mancardo-private-account':op.accountKey},");
  html=html.replaceAll(conflictGet,"return api('/tracks/'+encodeURIComponent(op.id),{headers:{'x-mancardo-private-account':op.accountKey}}).then(jsonOrEmpty)");
  const apply='function applyCloudItem(item){';
  const scan='state.library.forEach(function(track){if(!track||!track.id)return;';
  const replace='function replaceLocal(id,track){';
  const preserve='function preserveConflictCopy(track,reason){';
  const tombstoneStart="if(item.deleted){\n        preserveConflictCopy(local,'Recovery snapshot before cloud delete');";
  const putResolver='function resolvePutConflict(op,conflict){';
  const putFastPath='if(conflict&&conflict.current&&conflict.current.content_sha256&&conflict.current.content_sha256===op.localHash)';
  const putConflict="var cloud=x.data;if(local)preserveConflictCopy(local,'Recovered from cross-device conflict');";
  if(!html.includes(apply)||!html.includes(scan)||!html.includes(replace)||!html.includes(preserve)||!html.includes(tombstoneStart)||!html.includes(putResolver)||!html.includes(putFastPath)||!html.includes(putConflict))throw new Error('Private sync integration anchors missing; refusing an unqualified delete client.');
  html=html.replace(apply,'window.mancardoSetDeleteStatus=setStatus;\n'+REMOTE_TOMBSTONE_RECONCILIATION+'\n'+apply+'if(window.mancardoDeleteBlocksCloudItem&&window.mancardoDeleteBlocksCloudItem(accountKey,item))return Promise.resolve();if(item.deleted)return applyCloudTombstone(item);');
  // The existing branch is unreachable after the early tombstone dispatch.
  // Remove it rather than leaving the unsafe unconditional-copy implementation.
  html=html.replace(/      if\(item\.deleted\)\{\n        preserveConflictCopy\(local,'Recovery snapshot before cloud delete'\);[\s\S]*?\n      \}/,"      if(item.deleted)return applyCloudTombstone(item);");
  // A tombstone retains the old content hash. Matching that hash is not proof
  // a stale PUT succeeded. Missing `deleted` is ambiguous too: GET the row.
  const putEnd='\n  function resolveDeleteConflict(op,conflict){';
  if(html.split(putResolver).length!==2||html.split(putEnd).length!==2)throw new Error('Upload reconciliation anchor missing or ambiguous; refusing a lossy conflict client.');
  const putIndex=html.indexOf(putResolver),putEndIndex=html.indexOf(putEnd,putIndex);
  if(putEndIndex<putIndex)throw new Error('Upload reconciliation boundary changed; refusing a lossy conflict client.');
  html=html.slice(0,putIndex)+LIVE_PUT_CONFLICT_RECONCILIATION+html.slice(putEndIndex);
  html=html.replace(scan,scan+'if(window.mancardoHasPendingDelete&&window.mancardoHasPendingDelete(accountKey,track.id))return;');
  html=html.replace(replace,replace+'if(track&&window.mancardoHasPendingDelete&&window.mancardoHasPendingDelete(accountKey,id))return;');
  html=html.replace(preserve,preserve+'if(track&&window.mancardoHasPendingDelete&&window.mancardoHasPendingDelete(accountKey,track.id))return null;');
  // A recovery diagnostic is not user track content. Preserve the cloned note
  // verbatim (including an absent/empty note) and keep the reason in the existing
  // session-local sync panel instead of overwriting any track-payload property.
  const recoveryNote="c.note=String(reason||'Recovered sync conflict').slice(0,40);";
  if(html.split(recoveryNote).length!==2)throw new Error('Conflict-note preservation anchor missing or ambiguous; refusing a lossy recovery client.');
  html=html.replace(recoveryNote,"conflictEl.title=String(reason||'Recovered sync conflict');");
  const liveStart='function applyCloudItem(item){',liveEnd='\n\n  function mergeCloud(items)';
  if(html.split(liveStart).length!==2||html.split(liveEnd).length!==2)throw new Error('Live reconciliation anchor missing or ambiguous; refusing a lossy pull client.');
  const liveIndex=html.indexOf(liveStart),mergeIndex=html.indexOf(liveEnd,liveIndex);
  if(mergeIndex<liveIndex)throw new Error('Live reconciliation boundary changed; refusing a lossy pull client.');
  html=html.slice(0,liveIndex)+LIVE_ROW_RECONCILIATION+html.slice(mergeIndex);
  const mergeStart='function mergeCloud(items){';
  const finalSynced="if(ready&&!syncing)setStatus('synced','Synced','My Library is saved locally and synced to your private cloud account.');return true;";
  if(html.split(mergeStart).length!==2||html.split(finalSynced).length!==2)throw new Error('Deferred reconciliation status anchor missing or ambiguous; refusing a misleading sync client.');
  html=html.replace(mergeStart,mergeStart+'liveReconciliationDeferred=false;');
  html=html.replace(finalSynced,"if(liveReconciliationDeferred){setStatus('offline','Sync pending','A local editor change is preserved but has not yet been reconciled with the cloud version.');return false;}"+finalSynced);
  html=repairRequestCadence(html);
  const insertion=html.indexOf('// ---------- boot ----------');
  return html.slice(0,insertion)+DURABLE_DELETE_BRIDGE+'\n'+html.slice(insertion);
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const privateTrackPath=/^\/api\/private-library\/tracks(?:\/[^/]+)?$/.test(url.pathname);
    const privateExpected=request.headers.get('x-mancardo-private-account');
    if(privateTrackPath&&(request.method==='PUT'||(request.method==='GET'&&privateExpected!==null))){
      if(!privateExpected)return Response.json({error:'An account-bound private workspace is required.',code:'private_account_required'},{status:400});
      const healthUrl=new URL(request.url);healthUrl.pathname='/api/private-library/health';healthUrl.search='';
      const probe=await baseWorker.fetch(new Request(healthUrl,{headers:request.headers}),env,ctx);
      const health=await probe.json().catch(()=>({}));
      if(!health.authenticated||!health.accountKey)return Response.json({error:'Private account authentication is required.',code:'authentication_required'},{status:401});
      if(!probe.ok||health.accountKey!==privateExpected)return Response.json({error:'The signed-in account changed. Private workspace sync is paused.',code:'private_account_mismatch'},{status:409});
    }
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
