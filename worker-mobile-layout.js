import baseWorker from './worker-point-cursor-sync.js';

const MOBILE_LAYOUT_CSS = String.raw`
<style id="mancardo-mobile-layout-v2-styles">
@media (max-width:767px){
  /* One library/menu button only: keep the top-bar hamburger and remove the duplicate map hamburger. */
  #mobileLibraryToggle{display:none!important}

  /* Give the map the reclaimed vertical space; the dock grows only as much as it needs. */
  .main{height:calc(100dvh - 48px)!important}
  .map-wrap{flex:1 1 auto!important;height:auto!important;min-height:0!important}
  .dock{flex:0 0 auto!important;height:auto!important;max-height:42dvh!important;min-height:84px!important;padding:.22rem .3rem calc(.22rem + env(safe-area-inset-bottom))!important;overflow:hidden!important}

  /* Compact mobile stats: Name / Distance / Ascent only. */
  .stats-row{display:grid!important;grid-template-columns:minmax(0,1.7fr) minmax(72px,.8fr) minmax(62px,.65fr)!important;align-items:end!important;gap:.15rem .45rem!important;margin:0 0 .18rem!important;padding:0 .18rem!important}
  .stats-row .stat:nth-child(3),
  .stats-row .stat:nth-child(4),
  .stats-row .stat:nth-child(6){display:none!important}
  .stat{min-width:0!important;gap:0!important}
  .stat .v{font-size:.78rem!important;line-height:1.05!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .stat:first-child .v{font-size:.82rem!important}
  .stat .k{font-size:.49rem!important;line-height:1!important;letter-spacing:.055em!important}

  /* Mobile editing ribbon: swipe horizontally or use the fixed arrow buttons. */
  #mancardoMobileToolbarNav{display:grid;grid-template-columns:34px minmax(0,1fr) 34px;align-items:stretch;gap:3px;width:100%;min-height:44px;margin:.08rem 0 0}
  #mancardoMobileToolbarViewport{min-width:0;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;scroll-snap-type:x proximity;scrollbar-width:none;border:1px solid var(--border);border-radius:4px;background:var(--surface)}
  #mancardoMobileToolbarViewport::-webkit-scrollbar{display:none}
  #mancardoMobileToolbarNav>.mancardo-ribbon-arrow{display:flex;align-items:center;justify-content:center;min-width:34px;width:34px;height:44px;padding:0;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);font:800 22px/1 system-ui,sans-serif;box-shadow:none}
  #mancardoMobileToolbarNav>.mancardo-ribbon-arrow:disabled{opacity:.28}
  #mancardoMobileToolbarViewport .toolbar{display:flex!important;flex-wrap:nowrap!important;align-items:center!important;gap:3px!important;width:max-content!important;min-width:100%!important;margin:0!important;padding:2px!important;overflow:visible!important}
  #mancardoMobileToolbarViewport .toolbar .grp{display:flex!important;flex:none!important;gap:3px!important;margin:0!important;padding:0 4px 0 0!important;border-right:1px solid var(--border)!important;scroll-snap-align:start}
  #mancardoMobileToolbarViewport .toolbar .grp:last-child{border-right:0!important;padding-right:0!important}
  #mancardoMobileToolbarViewport .toolbar .icon-btn{flex:0 0 40px!important;width:40px!important;min-width:40px!important;height:38px!important;min-height:38px!important;padding:.12rem!important;font-size:.74rem!important;overflow:visible!important;text-overflow:clip!important}
  #mancardoMobileToolbarViewport .toolbar .tool-svg{width:23px!important;height:23px!important}
  .points-toggle{min-height:24px!important;height:24px!important;margin:.12rem .18rem 0!important;padding:.05rem .25rem!important;font-size:.66rem!important}
  .points-table-wrap{max-height:30dvh!important}

  /* Relocated Leaflet controls. */
  #mancardoMobileZoomTray{position:absolute;right:9px;bottom:9px;z-index:805;display:flex;flex-direction:column;align-items:flex-end;pointer-events:none}
  #mancardoMobileBottomTools{position:absolute;left:72px;bottom:9px;z-index:805;display:flex;align-items:flex-end;gap:6px;pointer-events:none}
  #mancardoMobileZoomTray .leaflet-control,
  #mancardoMobileBottomTools .leaflet-control{margin:0!important;float:none!important;clear:none!important;pointer-events:auto}
  #mancardoMobileZoomTray .leaflet-control-zoom{box-shadow:0 1px 6px rgba(0,0,0,.3)!important;border-radius:5px!important;overflow:hidden}
  #mancardoMobileZoomTray .leaflet-control-zoom a{width:40px!important;height:38px!important;line-height:38px!important;font-size:25px!important}
  #mancardoMobileBottomTools .overlay-control-btn,
  #mancardoMobileBottomTools .fuel-control-btn{width:44px!important;height:40px!important;min-width:44px!important;line-height:40px!important;margin:0!important;border-radius:5px!important;box-shadow:0 1px 6px rgba(0,0,0,.3)!important}
  #mancardoMobileBottomTools .overlay-control-btn{font-size:20px!important}
  #mancardoMobileBottomTools .fuel-control-btn{font-size:12px!important}

  /* Overlay menu now opens from the lower-left controls instead of covering the top map area. */
  .overlay-panel{top:auto!important;bottom:56px!important;left:72px!important;right:auto!important;max-width:calc(100vw - 84px)!important;max-height:46dvh!important;overflow:auto!important;z-index:910!important}
  .overlay-row{grid-template-columns:88px minmax(80px,130px)!important}
  .overlay-panel input[type=range]{width:100%!important}

  /* The dedicated 3D overlay tools follow the same bottom-control layout. */
  #mancardo3dTools{top:auto!important;bottom:10px!important;left:10px!important;right:auto!important;max-width:min(280px,calc(100vw - 20px))!important}

  /* Old Leaflet top-left corner no longer needs the 58px offset after controls are relocated. */
  .leaflet-top.leaflet-left{top:0!important}
}
</style>`;

const MOBILE_LAYOUT_FEATURE = String.raw`
// ---------- mobile layout v2 ----------
(function installMancardoMobileLayoutV2(){
  if(document.getElementById('mancardoMobileToolbarNav'))return;
  var mq=window.matchMedia('(max-width:767px)');
  var mapWrap=document.getElementById('mapWrap');
  var dock=document.querySelector('.dock');
  var toolbar=dock&&dock.querySelector('.toolbar');
  if(!mapWrap||!dock||!toolbar)return;

  var zoomTray=document.createElement('div');
  zoomTray.id='mancardoMobileZoomTray';
  var toolsTray=document.createElement('div');
  toolsTray.id='mancardoMobileBottomTools';
  mapWrap.appendChild(zoomTray);mapWrap.appendChild(toolsTray);

  function rememberNode(node){
    if(!node||node.__mancardoMobileHome)return;
    node.__mancardoMobileHome={parent:node.parentNode,next:node.nextSibling};
  }
  function restoreNode(node){
    var h=node&&node.__mancardoMobileHome;if(!h||!h.parent)return;
    try{h.parent.insertBefore(node,h.next&&h.next.parentNode===h.parent?h.next:null);}catch(e){try{h.parent.appendChild(node);}catch(_){}}
  }
  function controlFor(button){return button&&(button.closest('.leaflet-control')||button.parentElement);}

  function moveMapControls(){
    if(!mq.matches)return;
    var zoom=document.querySelector('.leaflet-control-zoom');
    var overlay=controlFor(document.querySelector('.overlay-control-btn'));
    var fuel=controlFor(document.querySelector('.fuel-control-btn'));
    if(zoom&&zoom.parentNode!==zoomTray){rememberNode(zoom);zoomTray.appendChild(zoom);}
    if(overlay&&overlay.parentNode!==toolsTray){rememberNode(overlay);toolsTray.appendChild(overlay);}
    if(fuel&&fuel.parentNode!==toolsTray){rememberNode(fuel);toolsTray.appendChild(fuel);}
  }
  function restoreMapControls(){
    Array.prototype.slice.call(zoomTray.children).forEach(restoreNode);
    Array.prototype.slice.call(toolsTray.children).forEach(restoreNode);
  }

  var nav=document.createElement('div');nav.id='mancardoMobileToolbarNav';
  var prev=document.createElement('button');prev.type='button';prev.className='mancardo-ribbon-arrow';prev.textContent='‹';prev.title='Previous tools';prev.setAttribute('aria-label','Scroll editing tools left');
  var next=document.createElement('button');next.type='button';next.className='mancardo-ribbon-arrow';next.textContent='›';next.title='More tools';next.setAttribute('aria-label','Scroll editing tools right');
  var viewport=document.createElement('div');viewport.id='mancardoMobileToolbarViewport';
  rememberNode(toolbar);
  toolbar.parentNode.insertBefore(nav,toolbar);nav.appendChild(prev);nav.appendChild(viewport);nav.appendChild(next);viewport.appendChild(toolbar);

  function updateRibbonArrows(){
    if(!mq.matches){prev.disabled=false;next.disabled=false;return;}
    prev.disabled=viewport.scrollLeft<=2;
    next.disabled=viewport.scrollLeft+viewport.clientWidth>=viewport.scrollWidth-2;
  }
  function scrollRibbon(dir){
    var amount=Math.max(120,Math.round(viewport.clientWidth*.72));
    viewport.scrollBy({left:dir*amount,behavior:'smooth'});
  }
  prev.onclick=function(){scrollRibbon(-1);};next.onclick=function(){scrollRibbon(1);};
  viewport.addEventListener('scroll',updateRibbonArrows,{passive:true});

  function applyLayout(){
    var duplicate=document.getElementById('mobileLibraryToggle');
    if(duplicate)duplicate.setAttribute('aria-hidden',mq.matches?'true':'false');
    if(mq.matches){
      if(toolbar.parentNode!==viewport)viewport.appendChild(toolbar);
      nav.style.display='grid';zoomTray.style.display='flex';toolsTray.style.display='flex';
      moveMapControls();
      setTimeout(updateRibbonArrows,0);
      try{if(typeof map!=='undefined'&&map)map.invalidateSize(false);}catch(e){}
    }else{
      nav.style.display='none';zoomTray.style.display='none';toolsTray.style.display='none';
      restoreMapControls();
      var h=toolbar.__mancardoMobileHome;
      if(h&&h.parent&&toolbar.parentNode===viewport)h.parent.insertBefore(toolbar,h.next&&h.next.parentNode===h.parent?h.next:null);
      try{if(typeof map!=='undefined'&&map)map.invalidateSize(false);}catch(e){}
    }
  }

  if(mq.addEventListener)mq.addEventListener('change',applyLayout);else if(mq.addListener)mq.addListener(applyLayout);
  window.addEventListener('resize',function(){if(mq.matches){moveMapControls();updateRibbonArrows();}} ,{passive:true});

  // Leaflet controls are created after the DOM shell; retry briefly and also watch the map wrapper.
  var tries=0,timer=setInterval(function(){tries++;moveMapControls();if(tries>40)clearInterval(timer);},250);
  if(window.MutationObserver){
    new MutationObserver(function(){if(mq.matches)moveMapControls();}).observe(mapWrap,{childList:true,subtree:true});
  }

  applyLayout();
})();
`;

function injectMobileLayout(html){
  if(html.includes('installMancardoMobileLayoutV2'))return html;
  html=html.replace('</head>',MOBILE_LAYOUT_CSS+'\n</head>');
  const close=html.lastIndexOf('})();');
  if(close===-1)return html;
  return html.slice(0,close)+MOBILE_LAYOUT_FEATURE+'\n'+html.slice(close);
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=injectMobileLayout(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
