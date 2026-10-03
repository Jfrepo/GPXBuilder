import previewWorker from './worker-google-preview.js';

const SAVE_STATE_CSS = String.raw`
<style id="save-state-styles">
#saveBtn.save-state-dirty:not(:disabled){background:var(--warn)!important;border-color:var(--warn)!important;color:#fff!important;box-shadow:0 0 0 2px color-mix(in srgb,var(--warn) 28%,transparent)}
#saveBtn.save-state-clean:not(:disabled){background:var(--good)!important;border-color:var(--good)!important;color:#fff!important}
</style>`;

const SAVE_STATE_FEATURE = String.raw`
// ---------- explicit Save button state ----------
(function installSaveStateIndicator(){
  if(!els||!els.saveBtn)return;
  var baselines=Object.create(null);
  var forceDirty=false;

  function currentKey(){
    if(!state.current)return '';
    return String(state.currentId||state.current.id||'__new__');
  }
  function fingerprint(track){
    if(!track)return '';
    var copy=deepClone(track);
    delete copy.updatedAt;
    delete copy.stats;
    return JSON.stringify(copy);
  }
  function rememberBaseline(){
    if(!state.current)return;
    baselines[currentKey()]=fingerprint(state.current);
    forceDirty=false;
  }
  function isDirty(){
    if(!state.current)return false;
    var key=currentKey();
    if(forceDirty)return true;
    if(!Object.prototype.hasOwnProperty.call(baselines,key))return true;
    return baselines[key]!==fingerprint(state.current);
  }
  function updateSaveState(){
    var btn=els.saveBtn;
    btn.classList.remove('save-state-dirty','save-state-clean');
    if(state.sharedPreview||!state.current){
      btn.textContent='Save';
      btn.title='Save';
      return;
    }
    var dirty=isDirty();
    btn.classList.add(dirty?'save-state-dirty':'save-state-clean');
    btn.textContent=dirty?'Save changes':'Saved';
    btn.title=dirty?'Unsaved changes — click to save':'All changes saved';
  }

  if(state.current&&state.currentId)rememberBaseline();

  if(typeof pushHistory==='function'){
    var basePushHistory=pushHistory;
    pushHistory=function(){
      var result=basePushHistory.apply(this,arguments);
      if(state.current&&!state.sharedPreview){forceDirty=true;setTimeout(updateSaveState,0);}
      return result;
    };
  }

  var baseLoadItem=loadItem;
  loadItem=function(){
    var result=baseLoadItem.apply(this,arguments);
    if(state.current&&!state.sharedPreview)rememberBaseline();
    updateSaveState();
    return result;
  };

  var baseRender=render;
  render=function(){
    var result=baseRender.apply(this,arguments);
    updateSaveState();
    return result;
  };

  var baseRefreshDock=refreshDock;
  refreshDock=function(){
    var result=baseRefreshDock.apply(this,arguments);
    updateSaveState();
    return result;
  };

  var baseSaveClick=els.saveBtn.onclick;
  els.saveBtn.onclick=function(){
    var existing=!!(state.current&&state.currentId);
    var result=baseSaveClick&&baseSaveClick.apply(this,arguments);
    if(existing)rememberBaseline();
    updateSaveState();
    return result;
  };

  if(els.nameSaveBtn){
    var baseNameSaveClick=els.nameSaveBtn.onclick;
    els.nameSaveBtn.onclick=function(){
      var result=baseNameSaveClick&&baseNameSaveClick.apply(this,arguments);
      if(state.current&&state.currentId)rememberBaseline();
      updateSaveState();
      return result;
    };
  }

  setInterval(updateSaveState,250);
  updateSaveState();
})();
`;

function googleLoaderTag(apiKey){
  if(!apiKey) return '';
  const src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(apiKey)+'&v=weekly';
  return '<script src="'+src+'"></script>';
}

function injectSaveState(html){
  if(html.includes('installSaveStateIndicator')) return html;
  html=html.replace('</head>',SAVE_STATE_CSS+'\n</head>');
  const close=html.lastIndexOf('})();');
  if(close===-1) return html;
  return html.slice(0,close)+SAVE_STATE_FEATURE+'\n'+html.slice(close);
}

export default {
  async fetch(request,env,ctx){
    const response=await previewWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html')) return response;

    let html=await response.text();
    if(!html.includes('maps.googleapis.com/maps/api/js')){
      const loader=googleLoaderTag(env.GOOGLE_MAPS_API_KEY||'');
      if(loader) html=html.replace('</head>',loader+'\n</head>');
    }
    html=injectSaveState(html);

    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
