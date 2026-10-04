import baseWorker from './worker-mobile-layout-v5.js';

const LIBRARY_SORT_CSS = String.raw`
<style id="mancardo-library-sort-styles">
.mancardo-library-controls{display:flex;align-items:center;min-height:42px;border-bottom:1px solid var(--border);background:var(--surface)}
.mancardo-library-controls #selectAllWrap{flex:1;min-width:0;border-bottom:0!important;padding:.45rem .6rem!important}
.mancardo-library-controls #selectAllWrap span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#mancardoLibrarySort{flex:0 0 132px;width:132px;max-width:42%;height:30px;margin-right:.55rem;padding:0 1.55rem 0 .48rem;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);font:600 .72rem 'Source Sans 3',system-ui,sans-serif;cursor:pointer}
#mancardoLibrarySort:focus{outline:2px solid color-mix(in srgb,var(--accent) 45%,transparent);outline-offset:1px;border-color:var(--accent)}
@media(max-width:520px){
  #mancardoLibrarySort{flex-basis:120px;width:120px;margin-right:.4rem;font-size:.68rem;padding-left:.38rem}
  .mancardo-library-controls #selectAllWrap{padding-left:.48rem!important;padding-right:.35rem!important}
}
</style>`;

const LIBRARY_SORT_FEATURE = String.raw`
// ---------- My Library sorting ----------
(function installMancardoLibrarySort(){
  if(window.__mancardoLibrarySortInstalled)return;
  window.__mancardoLibrarySortInstalled=true;

  var SORT_KEY='mancardo_library_sort_v1';
  var validSorts={
    'modified-desc':1,'modified-asc':1,'name-asc':1,'name-desc':1,'distance-desc':1,'distance-asc':1
  };

  function savedSort(){
    try{
      var value=localStorage.getItem(SORT_KEY)||'modified-desc';
      return validSorts[value]?value:'modified-desc';
    }catch(e){return 'modified-desc';}
  }

  function itemName(item){return String(item&&item.name||'');}
  function modifiedTime(item){
    var value=item&&(item.updatedAt||item.createdAt);
    var t=value?Date.parse(value):0;
    return isFinite(t)?t:0;
  }
  function distanceMetres(item){
    var d=item&&item.stats&&Number(item.stats.distanceMeters);
    if(isFinite(d))return d;
    try{
      if(item&&typeof computeStats==='function'){
        var stats=computeStats(item);
        d=stats&&Number(stats.distanceMeters);
        if(isFinite(d))return d;
      }
    }catch(e){}
    return 0;
  }
  function nameCompare(a,b){
    return itemName(a).localeCompare(itemName(b),undefined,{numeric:true,sensitivity:'base'});
  }

  function comparator(mode){
    return function(a,b){
      var result=0;
      if(mode==='modified-desc')result=modifiedTime(b)-modifiedTime(a);
      else if(mode==='modified-asc')result=modifiedTime(a)-modifiedTime(b);
      else if(mode==='name-asc')result=nameCompare(a,b);
      else if(mode==='name-desc')result=nameCompare(b,a);
      else if(mode==='distance-desc')result=distanceMetres(b)-distanceMetres(a);
      else if(mode==='distance-asc')result=distanceMetres(a)-distanceMetres(b);
      if(result===0)return nameCompare(a,b);
      return result;
    };
  }

  function currentMode(){
    var select=document.getElementById('mancardoLibrarySort');
    return select&&validSorts[select.value]?select.value:savedSort();
  }

  function applyLibrarySort(){
    var list=document.getElementById('trackList');
    if(!list||!window.state||!Array.isArray(state.library))return;
    var byId={};
    state.library.forEach(function(item){if(item&&item.id!=null)byId[String(item.id)]=item;});
    var cards=Array.prototype.slice.call(list.querySelectorAll('.track-item'));
    if(cards.length<2)return;
    var cmp=comparator(currentMode());
    cards.sort(function(a,b){
      var ai=byId[String(a.getAttribute('data-track-id'))]||{};
      var bi=byId[String(b.getAttribute('data-track-id'))]||{};
      return cmp(ai,bi);
    });
    cards.forEach(function(card){list.appendChild(card);});
  }

  function ensureSortControl(){
    var panel=document.getElementById('myLibraryPanel');
    var selectAll=document.getElementById('selectAllWrap');
    if(!panel||!selectAll)return null;
    var existing=document.getElementById('mancardoLibrarySort');
    if(existing)return existing;

    var controls=document.createElement('div');
    controls.className='mancardo-library-controls';
    controls.id='mancardoLibraryControls';
    panel.insertBefore(controls,selectAll);
    controls.appendChild(selectAll);

    var select=document.createElement('select');
    select.id='mancardoLibrarySort';
    select.title='Sort My Library tracks';
    select.setAttribute('aria-label','Sort My Library tracks');
    [
      ['modified-desc','Modified ↓'],
      ['modified-asc','Modified ↑'],
      ['name-asc','Name A–Z'],
      ['name-desc','Name Z–A'],
      ['distance-desc','Distance ↓'],
      ['distance-asc','Distance ↑']
    ].forEach(function(pair){
      var option=document.createElement('option');option.value=pair[0];option.textContent=pair[1];select.appendChild(option);
    });
    select.value=savedSort();
    select.addEventListener('change',function(){
      try{localStorage.setItem(SORT_KEY,select.value);}catch(e){}
      applyLibrarySort();
    });
    controls.appendChild(select);
    return select;
  }

  ensureSortControl();
  applyLibrarySort();

  if(typeof renderLibrary==='function'){
    var baseRenderLibrary=renderLibrary;
    renderLibrary=function(){
      var result=baseRenderLibrary.apply(this,arguments);
      ensureSortControl();
      applyLibrarySort();
      return result;
    };
  }
})();
`;

function injectLibrarySort(html){
  if(html.includes('installMancardoLibrarySort'))return html;
  html=html.replace('</head>',LIBRARY_SORT_CSS+'\n</head>');
  const close=html.lastIndexOf('})();');
  if(close===-1)return html;
  return html.slice(0,close)+LIBRARY_SORT_FEATURE+'\n'+html.slice(close);
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=injectLibrarySort(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
