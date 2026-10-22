// Local recovery only. No API calls, library writes, outbox writes or automatic restore.
export const EDITOR_RECOVERY = String.raw`
(function installEditorRecovery(){
  var PREFIX='mancardo_editor_recovery_v1:',FENCE='mancardo_editor_recovery_deleted_v1:';
  var MAX_RECORD=1024*1024,MAX_TOTAL=2*1024*1024,MAX_COUNT=10,AGE=7*24*60*60*1000;
  // New identity for every document, including duplicated tabs and reloads.
  var tab=crypto.randomUUID(),sequence=0,queued=false,active=Object.create(null),disabled=false;
  var status=document.createElement('span');status.id='mancardoRecoveryStatus';status.setAttribute('role','status');
  status.textContent='After reload, open Recovery copies to check for saved local edits.';
  var button=document.createElement('button');button.type='button';button.id='mancardoRecoveryOpen';button.textContent='Recovery copies';
  var panel=document.createElement('dialog');panel.id='mancardoRecoveryDialog';panel.style.maxWidth='min(92vw,640px)';
  var title=document.createElement('h3');title.textContent='Local recovery copies';panel.appendChild(title);
  var info=document.createElement('p');info.textContent='Recovery stays on this device. Recover opens a separate unsaved copy; Save is a separate action. Copies older than 7 days can only be downloaded or discarded.';panel.appendChild(info);
  var list=document.createElement('div');list.id='mancardoRecoveryList';panel.appendChild(list);
  var close=document.createElement('button');close.type='button';close.textContent='Keep for later';close.onclick=function(){panel.close();};panel.appendChild(close);
  document.body.appendChild(panel);var bar=document.createElement('div');bar.style.cssText='padding:.4rem .6rem;border-bottom:1px solid var(--border);font-size:.75rem;overflow-wrap:anywhere';status.style.display='block';bar.appendChild(button);bar.appendChild(status);document.getElementById('myLibraryPanel').prepend(bar);
  function owner(){return !disabled&&window.mancardoRecoveryOwner?window.mancardoRecoveryOwner():'';}
  function fail(e){status.textContent='Local recovery not saved: '+(e&&e.message||'storage unavailable')+'. Keep this editor open; use Save or Export GPX.';}
  function records(){
    var all=[];for(var i=0;i<localStorage.length;i++){var key=localStorage.key(i);if(key&&key.indexOf(PREFIX)===0)all.push({key:key,raw:localStorage.getItem(key)});}return all;
  }
  function parse(entry){
    var r=JSON.parse(entry.raw);if(!r||r.version!==1||!r.owner||!r.item||typeof r.payload!=='string'||!r.sha256||!Number.isFinite(r.at)||!Number.isInteger(r.sequence))throw Error('Invalid recovery record');
    if(entry.key!==PREFIX+encodeURIComponent(r.owner)+':'+r.tab+':'+encodeURIComponent(r.item))throw Error('Recovery owner/key mismatch');
    var track=JSON.parse(r.payload);if(!track||String(track.id)!==r.item||!Array.isArray(track.segments)||!track.segments.every(function(s){return Array.isArray(s)&&s.every(function(p){return p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon);});}))throw Error('Invalid recovery geometry');return r;
  }
  function hash(text){return crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)).then(function(bytes){return Array.from(new Uint8Array(bytes),function(b){return b.toString(16).padStart(2,'0');}).join('');});}
  function fenced(who,id){
    if(localStorage.getItem(FENCE+encodeURIComponent(who)+':'+encodeURIComponent(id)))return true;
    var pending=JSON.parse(localStorage.getItem('mancardo_authorized_delete_pending_v4')||'[]');
    if(!Array.isArray(pending))throw Error('Deletion intent cannot be checked');
    return pending.some(function(r){return r.accountKey===who&&String(r.id)===id&&r.authorizedUserDelete===true;});
  }
  window.mancardoFenceRecovery=function(who,id){
    id=String(id);
    try{var key=FENCE+encodeURIComponent(who)+':'+encodeURIComponent(id);if(localStorage.getItem(key)!=='deleted')localStorage.setItem(key,'deleted');}
    catch(e){disabled=true;fail(Error('deletion fence could not be saved'));throw e;}
  };
  async function capture(editor,who){
    if(!state.current||state.sharedPreview||!hasUnsavedEditorGeometry())return;
    if(state.current!==editor||owner()!==who)return;
    if(!who){fail(Error('verify the account bound to this workspace first'));return;}
    var payload=JSON.stringify(state.current),id=String(state.currentId||state.current.id),n=++sequence;
    var key=PREFIX+encodeURIComponent(who)+':'+tab+':'+encodeURIComponent(id),token=who+'|'+id;
    active[token]=(active[token]||0)+1;
    status.textContent='Local recovery saving…';
    try{
      var savedBase=state.library.find(function(t){return String(t.id)===id;}),baseText=savedBase?JSON.stringify(savedBase):null;
      var digest=await hash(payload),baseDigest=baseText?await hash(baseText):null,meta=await window.mancardoRecoveryMeta(id);
      if(owner()!==who||n!==sequence)return;
      if(fenced(who,id)||(meta&&meta.deleted)){status.textContent='Recovery blocked by deletion. Export GPX if you need to keep this editor.';return;}
      if(!navigator.locks)throw Error('browser recovery locking unavailable');
      await navigator.locks.request('mancardo-editor-recovery-capacity-v1',function(){
      if(n!==sequence)return;
      if(owner()!==who||state.current!==editor||JSON.stringify(editor)!==payload){fail(Error('editor or account changed before recovery completed'));return;}
      var record={version:1,owner:who,item:id,tab:tab,sequence:n,at:Date.now(),baseRevision:meta&&meta.revision||null,baseSha256:baseDigest,payload:payload,sha256:digest};
      var raw=JSON.stringify(record),all=records(),other=all.filter(function(e){return e.key!==key;});
      if((key.length+raw.length)*2>MAX_RECORD||other.length>=MAX_COUNT||other.reduce(function(sum,e){return sum+(e.key.length+e.raw.length)*2;},0)+(key.length+raw.length)*2>MAX_TOTAL)throw Error('recovery capacity reached; download/discard older copies');
      // No await between final ownership/deletion checks and this synchronous write.
      if(owner()!==who||fenced(who,id))return;
      localStorage.setItem(key,raw);
      status.textContent='Recovery saved on this device; cloud Save is separate';
      });
    }catch(e){fail(e);}finally{active[token]--;}
  }
  function schedule(changed){if(queued)return;var editor=state.current,who=owner(),before=JSON.stringify(editor&&editor.segments);queued=true;queueMicrotask(function(){queued=false;if(state.current===editor&&(changed||JSON.stringify(editor&&editor.segments)!==before))capture(editor,who);});}
  var originalHistory=pushHistory;
  pushHistory=function(){var result=originalHistory.apply(this,arguments);schedule();return result;};
  var originalUndo=undo,originalRedo=redo,originalJoin=completeJoinToLibraryPoint;
  undo=function(){schedule();return originalUndo.apply(this,arguments);};
  redo=function(){schedule();return originalRedo.apply(this,arguments);};
  completeJoinToLibraryPoint=function(){var before=JSON.stringify(state.current),result=originalJoin.apply(this,arguments);if(JSON.stringify(state.current)!==before)schedule(true);return result;};
  // Existing click handlers captured earlier function references.
  els.undoBtn.onclick=undo;els.redoBtn.onclick=redo;
  async function checked(entry,who){
    if(owner()!==who||localStorage.getItem(entry.key)!==entry.raw)throw Error('Account or recovery copy changed; reopen Recovery copies');
    var r=parse(entry);if(r.owner!==who)throw Error('Recovery belongs to another account');
    if(await hash(r.payload)!==r.sha256)throw Error('Recovery checksum failed');
    var meta=await window.mancardoRecoveryMeta(r.item);
    if(owner()!==who||localStorage.getItem(entry.key)!==entry.raw)throw Error('Account or recovery copy changed; reopen Recovery copies');
    return {record:r,deleted:fenced(who,r.item)||!!(meta&&meta.deleted),expired:Date.now()-r.at>AGE};
  }
  function finalCheck(entry,who){if(owner()!==who||localStorage.getItem(entry.key)!==entry.raw)throw Error('Account or recovery copy changed; reopen Recovery copies');}
  function action(label,fn,row){var b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=function(){Promise.resolve().then(fn).catch(fail);};row.appendChild(b);}
  async function show(){
    list.textContent='';var who=owner();if(!who){list.textContent='Verify the account bound to this workspace before opening recovery copies.';return;}
    var all=records();for(var entry of all){
      var r;try{r=parse(entry);}catch(e){
        if(entry.key.indexOf(PREFIX+encodeURIComponent(who)+':')===0){var broken=document.createElement('div');broken.textContent='Unreadable recovery copy (retained). ';(function(entry,row){action('Discard unreadable copy',function(){finalCheck(entry,who);if(confirm('Discard this unreadable local recovery copy?')){finalCheck(entry,who);localStorage.removeItem(entry.key);return show();}},row);})(entry,broken);list.appendChild(broken);}continue;}
      if(r.owner!==who)continue;
      var row=document.createElement('div');row.style.margin='1rem 0';
      var label=document.createElement('p');label.textContent=(JSON.parse(r.payload).name||'Unnamed track')+' · '+new Date(r.at).toLocaleString()+' · tab '+r.tab.slice(0,8);row.appendChild(label);
      (function(entry,row){
        action('Recover as new unsaved copy',async function(){
          var value=await checked(entry,who);finalCheck(entry,who);
          if(value.deleted||fenced(who,value.record.item)||value.expired)throw Error('Deleted or expired copy: download GPX or discard only');
          if(hasUnsavedEditorGeometry())throw Error('Save the current unsaved editor before recovery; Export GPX can make a separate backup');
          var track=JSON.parse(value.record.payload);track.id=uid();
          // A new copy must not overwrite an existing Shared track when saved/published.
          delete track.sharedId;delete track.sharedBaseVersion;delete track.sharedBaseModifiedAt;delete track.sharedBaseModifiedBy;
          state.current=track;state.currentId=null;state.sharedPreview=false;state.sharedPreviewMeta=null;
          state.selection=null;state.history=[];state.future=[];state.extend=null;state.joinFrom=null;state.mode='view';
          updateModeBanner();render();fitToTrack();panel.close();status.textContent='Recovered as an unsaved copy. Review it, then use Save; nothing was uploaded.';
        },row);
        action('Download GPX',async function(){var value=await checked(entry,who);finalCheck(entry,who);var track=JSON.parse(value.record.payload);var a=document.createElement('a'),url=URL.createObjectURL(new Blob([buildGpx(track)],{type:'application/gpx+xml'}));a.href=url;a.download='recovery-'+String(track.name||'track').replace(/[^a-z0-9_-]/gi,'_')+'.gpx';a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);},row);
        action('Discard this copy',async function(){finalCheck(entry,who);if(parse(entry).owner!==who)throw Error('Recovery belongs to another account');if(!confirm('Discard this local recovery copy? Other tabs and library tracks are unchanged.'))return;if(owner()!==who||localStorage.getItem(entry.key)!==entry.raw)throw Error('Recovery changed; reopen the list');localStorage.removeItem(entry.key);await show();},row);
      })(entry,row);list.appendChild(row);
    }
    if(!list.childNodes.length)list.textContent='No recovery copies for this verified account.';
  }
  button.onclick=function(){panel.showModal();show().catch(fail);};
  window.addEventListener('storage',function(){if(panel.open){list.textContent='Recovery or workspace changed. Close and reopen this list.';}});
  // Hide account data as soon as the existing sync UI reports a binding change.
  new MutationObserver(function(){if(!owner()&&panel.open){list.textContent='Account verification required.';}}).observe(document.getElementById('mancardoPrivateSyncChip'),{attributes:true,attributeFilter:['data-state']});
  // The obsolete unpartitioned draft slot is not automatically restored.
})();
`;
