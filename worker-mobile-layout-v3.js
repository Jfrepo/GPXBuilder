import baseWorker from './worker-mobile-layout.js';

const MOBILE_LAYOUT_V3_CSS = String.raw`
<style id="mancardo-mobile-layout-v3-styles">
@media (max-width:767px){
  /* Keep the map mode selector at the top, with overlay/fuel controls immediately to its left. */
  #mancardoMobileBottomTools{left:8px!important;top:8px!important;bottom:auto!important;align-items:flex-start!important;gap:4px!important}
  #mancardoMobileBottomTools .overlay-control-btn,
  #mancardoMobileBottomTools .fuel-control-btn{width:34px!important;height:34px!important;min-width:34px!important;line-height:32px!important;border-radius:4px!important}
  #mancardoMobileBottomTools .overlay-control-btn{font-size:17px!important}
  #mancardoMobileBottomTools .fuel-control-btn{font-size:10px!important;padding:0 3px!important}
  .layer-toggle{top:8px!important;right:8px!important;max-width:calc(100vw - 88px)!important;overflow-x:auto!important;overflow-y:hidden!important;scrollbar-width:none!important}
  .layer-toggle::-webkit-scrollbar{display:none!important}
  .layer-toggle button{min-height:34px!important;padding:.31rem .42rem!important;font-size:.68rem!important;flex:none!important}

  /* Overlay menu opens downward from the new top-left overlay button. */
  .overlay-panel{top:48px!important;bottom:auto!important;left:8px!important;right:auto!important;max-width:calc(100vw - 16px)!important;max-height:52dvh!important}

  /* 3D overlay panel also stays near the map-mode controls on mobile. */
  #mancardo3dTools{top:48px!important;bottom:auto!important;left:8px!important;right:auto!important;max-width:min(280px,calc(100vw - 16px))!important}

  /* Smaller bottom-right zoom control. */
  #mancardoMobileZoomTray{right:8px!important;bottom:8px!important}
  #mancardoMobileZoomTray .leaflet-control-zoom a{width:34px!important;height:32px!important;line-height:32px!important;font-size:21px!important}

  /* Finger swipe is enough for the editing ribbon; remove redundant left/right arrows. */
  #mancardoMobileToolbarNav{display:block!important;min-height:42px!important;margin:.06rem 0 0!important}
  #mancardoMobileToolbarNav>.mancardo-ribbon-arrow{display:none!important}
  #mancardoMobileToolbarViewport{width:100%!important}
  #mancardoMobileToolbarViewport .toolbar .icon-btn{height:36px!important;min-height:36px!important}

  /* Put Show/Hide point list beside the track name and make the data strip shallower. */
  .dock{min-height:76px!important;padding:.18rem .3rem calc(.18rem + env(safe-area-inset-bottom))!important}
  .stats-row{grid-template-columns:minmax(0,1.35fr) max-content 68px 58px!important;align-items:center!important;gap:.12rem .3rem!important;margin:0 0 .1rem!important}
  .stats-row .stat:nth-child(1){grid-column:1!important;grid-row:1!important}
  .stats-row .stat:nth-child(2){grid-column:3!important;grid-row:1!important}
  .stats-row .stat:nth-child(5){grid-column:4!important;grid-row:1!important}
  .stats-row #pointsToggle{grid-column:2!important;grid-row:1!important;align-self:center!important;justify-self:start!important;min-height:28px!important;height:28px!important;max-width:90px!important;margin:0!important;padding:.12rem .4rem!important;font-size:.61rem!important;line-height:1!important;white-space:nowrap!important;text-decoration:none!important;border-radius:4px!important}
  .stat .v{font-size:.75rem!important}
  .stat:first-child .v{font-size:.8rem!important}
  .stat .k{font-size:.46rem!important}
  .points-table-wrap{margin-top:.18rem!important}
}
</style>`;

const MOBILE_LAYOUT_V3_FEATURE = String.raw`
// ---------- mobile layout v3 refinements ----------
(function installMancardoMobileLayoutV3(){
  if(window.__mancardoMobileLayoutV3Installed)return;
  window.__mancardoMobileLayoutV3Installed=true;

  var mq=window.matchMedia('(max-width:767px)');
  var topHb=els&&els.hamburgerBtn;
  var drawer=els&&els.drawer;
  var statsRow=document.querySelector('.stats-row');
  var pointsToggle=els&&els.pointsToggle;
  var originalHbClick=topHb&&topHb.onclick;
  var pointHome=pointsToggle?{parent:pointsToggle.parentNode,next:pointsToggle.nextSibling}:null;

  function restorePointToggle(){
    if(!pointsToggle||!pointHome||!pointHome.parent)return;
    try{pointHome.parent.insertBefore(pointsToggle,pointHome.next&&pointHome.next.parentNode===pointHome.parent?pointHome.next:null);}catch(e){try{pointHome.parent.appendChild(pointsToggle);}catch(_){}}
  }

  function installHbToggle(){
    if(!topHb)return;
    topHb.onclick=function(){
      if(drawer&&drawer.classList.contains('open'))closeDrawer();
      else openDrawer();
    };
    topHb.setAttribute('aria-label',drawer&&drawer.classList.contains('open')?'Close track library':'Open track library');
  }

  function applyV3(){
    if(mq.matches){
      installHbToggle();
      if(pointsToggle&&statsRow&&pointsToggle.parentNode!==statsRow)statsRow.appendChild(pointsToggle);
    }else{
      if(topHb)topHb.onclick=originalHbClick;
      restorePointToggle();
    }
    try{if(typeof map!=='undefined'&&map)map.invalidateSize(false);}catch(e){}
  }

  if(topHb&&drawer&&window.MutationObserver){
    new MutationObserver(function(){
      if(!mq.matches)return;
      topHb.setAttribute('aria-label',drawer.classList.contains('open')?'Close track library':'Open track library');
    }).observe(drawer,{attributes:true,attributeFilter:['class']});
  }

  if(mq.addEventListener)mq.addEventListener('change',applyV3);else if(mq.addListener)mq.addListener(applyV3);
  window.addEventListener('resize',applyV3,{passive:true});
  applyV3();
})();
`;

function injectMobileLayoutV3(html){
  if(html.includes('installMancardoMobileLayoutV3'))return html;
  html=html.replace('</head>',MOBILE_LAYOUT_V3_CSS+'\n</head>');
  const close=html.lastIndexOf('})();');
  if(close===-1)return html;
  return html.slice(0,close)+MOBILE_LAYOUT_V3_FEATURE+'\n'+html.slice(close);
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=injectMobileLayoutV3(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
