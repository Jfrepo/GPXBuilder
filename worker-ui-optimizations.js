import baseWorker from './worker-library-sort.js';

const UI_OPTIMIZATION_CSS = String.raw`
<style id="mancardo-ui-optimization-styles">
/* Library search / filter controls remain fixed while the track list itself scrolls. */
.mancardo-library-controls,.mancardo-library-searchbar{flex:none;position:relative;z-index:4;background:var(--surface)}
.mancardo-library-searchbar{display:grid;grid-template-columns:minmax(0,1fr) 92px;gap:.35rem;align-items:center;padding:.36rem .5rem;border-bottom:1px solid var(--border)}
#mancardoLibrarySearch,#mancardoLibraryFilter{height:30px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);font:600 .72rem 'Source Sans 3',system-ui,sans-serif}
#mancardoLibrarySearch{min-width:0;padding:0 .48rem}
#mancardoLibraryFilter{padding:0 .3rem;cursor:pointer}
#mancardoLibrarySearch:focus,#mancardoLibraryFilter:focus{outline:2px solid color-mix(in srgb,var(--accent) 45%,transparent);outline-offset:1px;border-color:var(--accent)}
.mancardo-library-empty-filter{padding:.8rem .65rem;color:var(--text-muted);font-size:.76rem;text-align:center}

/* Make the active/editing track unmistakable. */
.track-item.active{border-color:var(--accent)!important;background:color-mix(in srgb,var(--accent) 12%,var(--surface))!important;box-shadow:inset 5px 0 0 var(--accent)!important}
.track-item .ti-name{cursor:pointer}
.mancardo-active-badge{flex:none;margin-left:.1rem;padding:.08rem .28rem;border-radius:3px;background:var(--accent);color:var(--accent-contrast);font-size:.54rem;font-weight:800;letter-spacing:.05em;line-height:1.3;text-transform:uppercase}

/* Small map status and transient render/load indicator. */
#mancardoMapStatus{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);z-index:770;max-width:min(70vw,460px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:1px solid var(--border);border-radius:16px;background:color-mix(in srgb,var(--surface) 91%,transparent);color:var(--text);box-shadow:0 1px 5px rgba(0,0,0,.14);padding:.27rem .56rem;font:700 .64rem/1.2 'Source Sans 3',system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(4px)}
#mancardoMapStatus:hover{border-color:var(--accent)}
#mancardoRenderStatus{position:absolute;left:50%;bottom:38px;transform:translateX(-50%);z-index:771;border:1px solid var(--border);border-radius:14px;background:var(--surface);color:var(--text);box-shadow:0 1px 5px rgba(0,0,0,.14);padding:.24rem .5rem;font:700 .62rem/1.2 'Source Sans 3',system-ui,sans-serif;opacity:0;pointer-events:none;transition:opacity .14s ease}
#mancardoRenderStatus.on{opacity:1}

/* Mobile: compress action header into one row and use the drawer as a temporary Library focus mode. */
#mancardoMapFocusBtn{display:none}
@media(max-width:767px){
  .drawer{width:min(92vw,390px)!important}
  .drawer-head{padding:.3rem .4rem!important;min-height:40px!important}
  .drawer-head>div{width:100%!important;display:grid!important;grid-template-columns:1fr 1fr .8fr!important;gap:.28rem!important}
  .drawer-head #newRouteBtn,.drawer-head #exportSelectedBtn,.drawer-head #deleteSelectedBtn{width:100%!important;min-width:0!important;min-height:32px!important;height:32px!important;padding:.18rem .28rem!important;font-size:.68rem!important;line-height:1!important}
  .drawer-head #newRouteBtn::after{font-size:.68rem!important}
  .drawer-head #exportSelectedBtn{font-size:0!important}
  .drawer-head #exportSelectedBtn::after{content:'Export';font-size:.68rem!important}
  .library-tabs{grid-template-columns:1fr 1fr auto!important;position:relative;z-index:5;background:var(--surface)}
  #mancardoMapFocusBtn{display:block;min-width:52px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);font:700 .72rem 'Source Sans 3',system-ui,sans-serif;padding:0 .45rem}
  #mancardoMapFocusBtn:hover{border-color:var(--accent)}
  .mancardo-library-searchbar{grid-template-columns:minmax(0,1fr) 82px;padding:.3rem .4rem;gap:.28rem}
  #mancardoLibrarySearch,#mancardoLibraryFilter{height:29px;font-size:.68rem}
  #mancardoMapStatus{bottom:8px;max-width:54vw;font-size:.59rem;padding:.24rem .45rem}
  #mancardoRenderStatus{bottom:36px;font-size:.58rem}
}
</style>`;

const UI_OPTIMIZATION_FEATURE = String.raw`
// ---------- ManCardo UI optimizations ----------
(function installMancardoUIOptimizations(){
  if(window.__mancardoUIOptimizationsInstalled)return;
  window.__mancardoUIOptimizationsInstalled=true;

  var FILTER_KEY='mancardo_library_filter_v1';
  var filterModes={all:1,visible:1,hidden:1};
  var busyTimer=null;

  function savedFilter(){
    try{var v=localStorage.getItem(FILTER_KEY)||'all';return filterModes[v]?v:'all';}catch(e){return 'all';}
  }

  function ensureLibrarySearch(){
    var panel=document.getElementById('myLibraryPanel');
    var list=document.getElementById('trackList');
    if(!panel||!list)return;
    var existing=document.getElementById('mancardoLibrarySearch');
    if(existing)return existing;

    var row=document.createElement('div');
    row.className='mancardo-library-searchbar';
    row.id='mancardoLibrarySearchbar';

    var input=document.createElement('input');
    input.id='mancardoLibrarySearch';input.type='search';input.placeholder='Search tracks';
    input.autocomplete='off';input.spellcheck=false;input.setAttribute('aria-label','Search My Library tracks');

    var filter=document.createElement('select');
    filter.id='mancardoLibraryFilter';filter.title='Filter My Library tracks';filter.setAttribute('aria-label','Filter My Library tracks');
    [['all','All'],['visible','Visible'],['hidden','Hidden']].forEach(function(pair){var o=document.createElement('option');o.value=pair[0];o.textContent=pair[1];filter.appendChild(o);});
    filter.value=savedFilter();

    row.appendChild(input);row.appendChild(filter);
    panel.insertBefore(row,list);

    input.addEventListener('input',applyLibrarySearchAndFilter);
    input.addEventListener('keydown',function(ev){if(ev.key==='Escape'){input.value='';applyLibrarySearchAndFilter();input.blur();}});
    filter.addEventListener('change',function(){try{localStorage.setItem(FILTER_KEY,filter.value);}catch(e){}applyLibrarySearchAndFilter();});
    return input;
  }

  function applyLibrarySearchAndFilter(){
    var list=document.getElementById('trackList');
    if(!list)return;
    var input=document.getElementById('mancardoLibrarySearch');
    var filter=document.getElementById('mancardoLibraryFilter');
    var q=String(input&&input.value||'').trim().toLocaleLowerCase();
    var mode=filter&&filterModes[filter.value]?filter.value:'all';
    var visibleCards=0;
    Array.prototype.forEach.call(list.querySelectorAll('.track-item'),function(card){
      var nameEl=card.querySelector('.ti-name');
      var name=String(nameEl&&nameEl.textContent||'').toLocaleLowerCase();
      var showBox=card.querySelector('.track-show');
      var shown=!!(showBox&&showBox.checked);
      var matchesName=!q||name.indexOf(q)!==-1;
      var matchesMode=mode==='all'||(mode==='visible'&&shown)||(mode==='hidden'&&!shown);
      var yes=matchesName&&matchesMode;
      card.style.display=yes?'':'none';
      if(yes)visibleCards++;
    });
    var old=list.querySelector('.mancardo-library-empty-filter');if(old)old.remove();
    if(!visibleCards&&list.querySelector('.track-item')){
      var note=document.createElement('div');note.className='mancardo-library-empty-filter';note.textContent='No tracks match this search / filter.';list.appendChild(note);
    }
  }

  function enhanceTrackCards(){
    var list=document.getElementById('trackList');if(!list)return;
    Array.prototype.forEach.call(list.querySelectorAll('.track-item'),function(card){
      var name=card.querySelector('.ti-name');
      if(name)name.title='Open and focus this track';
      var badge=card.querySelector('.mancardo-active-badge');
      if(card.classList.contains('active')){
        if(!badge){badge=document.createElement('span');badge.className='mancardo-active-badge';badge.textContent='Active';if(name&&name.parentNode)name.parentNode.insertBefore(badge,name.nextSibling);}
      }else if(badge){badge.remove();}
    });
  }

  function ensureMapFocusButton(){
    var tabs=document.querySelector('.library-tabs');if(!tabs||document.getElementById('mancardoMapFocusBtn'))return;
    var btn=document.createElement('button');btn.type='button';btn.id='mancardoMapFocusBtn';btn.textContent='Map';btn.title='Return to full map';btn.setAttribute('aria-label','Return to full map');
    btn.addEventListener('click',function(){
      if(typeof closeDrawer==='function')closeDrawer();
      else{var close=document.getElementById('drawerCloseBtn');if(close)close.click();}
    });
    tabs.appendChild(btn);
  }

  function ensureMapStatus(){
    var wrap=document.getElementById('mapWrap');if(!wrap)return;
    if(!document.getElementById('mancardoMapStatus')){
      var status=document.createElement('button');status.type='button';status.id='mancardoMapStatus';status.title='Map status · tap for map overlay controls';status.setAttribute('aria-label','Map status. Tap for map overlay controls.');wrap.appendChild(status);
      status.addEventListener('click',function(){
        var in3d=document.getElementById('mancardo3dMap')&&document.getElementById('mancardo3dMap').classList.contains('on');
        if(!in3d){var overlay=document.querySelector('.overlay-control-btn');if(overlay)overlay.click();}
      });
    }
    if(!document.getElementById('mancardoRenderStatus')){
      var busy=document.createElement('div');busy.id='mancardoRenderStatus';busy.textContent='Rendering…';wrap.appendChild(busy);
    }
  }

  function mapModeLabel(){
    var map3d=document.getElementById('mancardo3dMap');
    if(map3d&&map3d.classList.contains('on'))return '3D';
    var on=document.querySelector('.layer-toggle button.on');
    return String(on&&on.textContent||'Roads').trim()||'Roads';
  }

  function updateMapStatus(){
    ensureMapStatus();
    var status=document.getElementById('mancardoMapStatus');if(!status)return;
    var count=0;
    try{count=document.querySelectorAll('#trackList .track-show:checked').length;}catch(e){}
    var gps=false;
    try{gps=!!lastUserLatLng;}catch(e){}
    var mode=mapModeLabel();
    var is3d=mode==='3D';
    status.textContent=mode+' · '+count+' visible · GPS '+(gps?'on':'off')+' · 3D '+(is3d?'on':'off');
  }

  function showBusy(label,duration){
    ensureMapStatus();
    var chip=document.getElementById('mancardoRenderStatus');if(!chip)return;
    chip.textContent=label||'Rendering…';chip.classList.add('on');
    clearTimeout(busyTimer);busyTimer=setTimeout(function(){chip.classList.remove('on');},duration||700);
  }

  // The base app already uses one state.trackMenuId, so opening another menu collapses the previous one.
  // Also close the open menu when the user clicks outside its track card.
  document.addEventListener('pointerdown',function(ev){
    try{
      if(typeof state==='undefined'||!state.trackMenuId)return;
      var card=ev.target&&ev.target.closest?ev.target.closest('.track-item'):null;
      if(card&&String(card.getAttribute('data-track-id'))===String(state.trackMenuId))return;
      if(ev.target&&ev.target.closest&&ev.target.closest('.track-menu'))return;
      state.trackMenuId=null;
      if(typeof renderLibrary==='function')renderLibrary();
    }catch(e){}
  },true);

  ensureLibrarySearch();ensureMapFocusButton();ensureMapStatus();enhanceTrackCards();applyLibrarySearchAndFilter();updateMapStatus();

  if(typeof renderLibrary==='function'){
    var baseRenderLibraryForUI=renderLibrary;
    renderLibrary=function(){
      var result=baseRenderLibraryForUI.apply(this,arguments);
      ensureLibrarySearch();ensureMapFocusButton();enhanceTrackCards();applyLibrarySearchAndFilter();updateMapStatus();
      return result;
    };
  }

  if(typeof render==='function'){
    var baseRenderForUI=render;
    render=function(){
      showBusy('Rendering tracks…',650);
      var result=baseRenderForUI.apply(this,arguments);
      updateMapStatus();
      return result;
    };
  }

  // Surface map-data work so delays from contours, radar and fuel feel intentional.
  document.addEventListener('click',function(ev){
    var t=ev.target;
    if(!t||!t.closest)return;
    if(t.closest('.overlay-control-btn'))showBusy('Updating map controls…',500);
    else if(t.closest('.fuel-control-btn'))showBusy('Loading fuel locations…',1000);
    else if(t.closest('.layer-toggle'))showBusy('Changing map view…',600);
  },true);
  document.addEventListener('change',function(ev){
    var t=ev.target;
    if(t&&t.id==='slopeOverlayToggle')showBusy('Loading contours…',1100);
    else if(t&&(t.id==='radarOverlayToggle'||t.id==='radarMode'))showBusy('Loading weather…',1100);
  },true);

  // Keep status current through map mode, visibility and GPS changes without adding heavy rendering work.
  setInterval(updateMapStatus,1000);
})();
`;

function injectUIOptimizations(html){
  if(html.includes('installMancardoUIOptimizations'))return html;
  html=html.replace('</head>',UI_OPTIMIZATION_CSS+'\n</head>');
  const close=html.lastIndexOf('})();');
  if(close===-1)return html;
  return html.slice(0,close)+UI_OPTIMIZATION_FEATURE+'\n'+html.slice(close);
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=injectUIOptimizations(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
