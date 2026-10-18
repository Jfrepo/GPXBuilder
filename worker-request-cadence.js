// Development-only repair of the existing emitted clients. Keep acquisition
// separate from decoration, and keep each asynchronous sync cycle single-flight.
// Every anchor is checked so a changed upstream client fails closed.
const SHARED_DECORATOR = String.raw`  function decorateShared(){
    document.querySelectorAll('#sharedTrackList .shared-item:not(.mancardo-shared-waypoint-item)').forEach(function(card){
      var name=card.querySelector('.shared-item-name'),meta=card.querySelector('.shared-item-meta');
      if(!name)return;
      var note=clean(card.getAttribute('data-mancardo-shared-note'));
      var oldIcon=name.querySelector('.mancardo-note-icon'),oldNote=card.querySelector('.shared-item-note');
      if(!note){if(oldIcon)oldIcon.remove();if(oldNote)oldNote.remove();return;}
      if(!oldIcon)name.appendChild(icon('Note: '+note));
      if(!oldNote){oldNote=document.createElement('div');oldNote.className='shared-item-note';if(meta&&meta.nextSibling)card.insertBefore(oldNote,meta.nextSibling);else card.appendChild(oldNote);}
      if(oldNote.textContent!==note)oldNote.textContent=note;
    });
  }`;

const SCOPED_DECORATION = String.raw`  var decorationTimer=null;
  function scheduleDecorations(){
    if(decorationTimer!==null)return;
    decorationTimer=setTimeout(function(){decorationTimer=null;decorateLocal();decorateShared();},120);
  }
  ['trackList','sharedTrackList'].forEach(function(id){
    var root=document.getElementById(id);
    if(root)new MutationObserver(scheduleDecorations).observe(root,{subtree:true,childList:true});
  });`;

const SHARED_LOADER = String.raw`var sharedLibraryLoadPromise=null,sharedRefreshQueued=false;
function loadSharedLibrary(){
  if(sharedLibraryLoadPromise){sharedRefreshQueued=true;return sharedLibraryLoadPromise;}
  function load(){
    sharedRefreshQueued=false;
    els.sharedTrackList.innerHTML='<div class="empty-note">Loading shared tracks…</div>';
    return fetch(SHARED_API+'/api/tracks',{cache:'no-store',credentials:'include'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).then(function(data){
      state.sharedLibrary=Array.isArray(data.tracks)?data.tracks:[];
      renderSharedLibrary();
    }).catch(function(e){
      state.sharedLibrary=[];
      els.sharedTrackList.innerHTML='<div class="empty-note">Shared Library is unavailable. '+esc(e.message||'Connection error')+'</div>';
    }).then(function(){
      // A publish/delete/explicit refresh may have arrived after this request
      // took its snapshot. Coalesce it into one later read, never parallel reads.
      if(sharedRefreshQueued)return load();
      sharedLibraryLoadPromise=null;
    });
  }
  sharedLibraryLoadPromise=Promise.resolve().then(load).catch(function(error){sharedLibraryLoadPromise=null;throw error;});
  return sharedLibraryLoadPromise;
}
var sharedPreviewPulseLayer`;

const SYNC_COORDINATOR = String.raw`
  function failSyncCycle(error){
    ready=false;
    setStatus('offline','Sync pending','Changes remain saved locally. Private sync could not read its durable queue; try Sync now again.');
    console.warn('private sync cycle pending',error);
    return false;
  }
  function flushOutbox(){
    if(syncPromise){
      if(!afterSyncUploadPromise){
        function resumeUpload(){afterSyncUploadPromise=null;return flushOutbox();}
        afterSyncUploadPromise=syncPromise.then(resumeUpload,resumeUpload);
      }
      return afterSyncUploadPromise;
    }
    if(uploadPromise){uploadAgain=true;return uploadPromise;}
    function drain(){
      uploadAgain=false;
      return queueScan().then(flushOutboxPass).then(function(result){
        // A late edit can join after an earlier outbox snapshot. Re-scan and
        // drain it instead of treating the earlier acknowledgement as its own.
        if(uploadAgain)return drain();
        uploadPromise=null;
        return result;
      });
    }
    uploadPromise=Promise.resolve().then(drain).catch(function(error){uploadPromise=null;return failSyncCycle(error);});
    return uploadPromise;
  }
  function syncNow(){
    if(syncPromise)return syncPromise;
    // A standalone autosave may already own the upload queue. Wait for it
    // before the new health/scan/pull cycle, rather than reporting early success.
    syncPromise=Promise.resolve(uploadPromise).then(function(result){if(result===false)return false;return runSyncNow();}).catch(failSyncCycle).finally(function(){syncPromise=null;});
    return syncPromise;
  }
  function reconcilePrivateLibrary(){
    if(reconcileQueued)return;
    reconcileQueued=true;
    function resume(result){reconcileQueued=false;if(result===false&&!ready)return false;return syncNow();}
    // A delete can settle after an in-flight pull took its snapshot. Coalesce
    // one later reconciliation instead of losing it or dispatching online.
    Promise.resolve(syncPromise||uploadPromise).then(resume,function(error){reconcileQueued=false;return failSyncCycle(error);}).catch(failSyncCycle);
  }
  window.addEventListener('mancardo:private-reconcile',reconcilePrivateLibrary);
`;

function replaceRequired(text, before, after, label) {
  if (text.split(before).length !== 2) throw new Error(label + ' anchor is missing or ambiguous; refusing an unqualified sync client.');
  return text.replace(before, after);
}

export function repairRequestCadence(html) {
  const noteScript = /<script id="mancardo-stable-note-ui">([\s\S]*?)<\/script>/g;
  const noteMatches = [...html.matchAll(noteScript)];
  const noteMatch = noteMatches[0];
  const decorate = /^  function decorateShared\(\)\{[^\n]*\}$/gm;
  const observer = "  new MutationObserver(function(){setTimeout(function(){decorateLocal();decorateShared()},120)}).observe(document.documentElement,{subtree:true,childList:true});";
  if (noteMatches.length !== 1 || [...noteMatch[1].matchAll(decorate)].length !== 1) {
    throw new Error('Shared-note decoration anchors missing or ambiguous; refusing an unbounded request client.');
  }
  html = html.replace(noteScript, (_, source) => '<script id="mancardo-stable-note-ui">' +
    replaceRequired(source.replace(decorate, SHARED_DECORATOR), observer, SCOPED_DECORATION, 'Scoped decoration') + '</script>');

  // Use the note on this exact shared row, already fetched by the canonical
  // loader. Avoid a second list request and ambiguous matching by track name.
  const nameAnchor = "    var n=document.createElement('div');n.className='shared-item-name';";
  html = replaceRequired(html, nameAnchor,
    "    d.setAttribute('data-mancardo-shared-note',String(item.note||'').trim().slice(0,40));\n" + nameAnchor,
    'Shared-note row');

  const sharedLoad = /function loadSharedLibrary\(\)\{[\s\S]*?\n\}\nvar sharedPreviewPulseLayer/g;
  const sharedMatches = [...html.matchAll(sharedLoad)];
  const sharedMatch = sharedMatches[0];
  if (sharedMatches.length !== 1) throw new Error('Shared loader anchor missing or ambiguous; refusing an unbounded request client.');
  if (!sharedMatch[0].includes("fetch(SHARED_API+'/api/tracks'") ||
      !sharedMatch[0].includes('state.sharedLibrary=Array.isArray(data.tracks)?data.tracks:[];')) {
    throw new Error('Shared loader contents changed; refusing an unqualified request client.');
  }
  html = html.replace(sharedLoad, SHARED_LOADER);

  if (html.split('  function flushOutbox(){').length !== 2 ||
      html.split('\n\n  function syncNow(){').length !== 2) throw new Error('Private sync lifecycle anchors missing or ambiguous.');
  const uploadStart = html.indexOf('  function flushOutbox(){');
  const syncStart = html.indexOf('\n\n  function syncNow(){', uploadStart);
  const syncEnd = html.indexOf("\n\n  document.getElementById('mancardoPrivateSyncClose')", syncStart);
  if (uploadStart < 0 || syncStart < 0 || syncEnd < 0) throw new Error('Private sync lifecycle anchors missing.');
  let upload = html.slice(uploadStart, syncStart);
  upload = replaceRequired(upload, 'function flushOutbox(){', 'function flushOutboxPass(){', 'Upload pass');
  let sync = html.slice(syncStart, syncEnd);
  sync = replaceRequired(sync, 'function syncNow(){if(syncing)return Promise.resolve();', 'function runSyncNow(){', 'Whole sync lock');
  if (sync.split('.then(flushOutbox)').length !== 3) throw new Error('Whole sync upload phases changed.');
  sync = sync.replaceAll('.then(flushOutbox)', '.then(flushOutboxPass)');
  html = html.slice(0, uploadStart) + '  var uploadPromise=null,syncPromise=null,reconcileQueued=false,uploadAgain=false,afterSyncUploadPromise=null;\n' +
    upload + sync + SYNC_COORDINATOR + html.slice(syncEnd);
  return html;
}
