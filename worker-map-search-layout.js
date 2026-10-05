import baseWorker from './worker-map-search.js';

const SEARCH_LAYOUT_CSS = String.raw`
<style id="mancardo-map-search-layout-styles">
@media(min-width:768px){
  /* Search lives in the top bar, immediately before the local-storage chip. */
  #mancardoTopbarSearchHost{position:relative;display:flex;align-items:center;flex:none}
  #mancardoTopbarSearchHost #mancardoMapSearchBtn{
    position:static!important;
    right:auto!important;
    top:auto!important;
    bottom:auto!important;
    width:36px!important;
    height:34px!important;
    min-height:34px!important;
  }
  #mancardoTopbarSearchHost #mancardoMapSearchPanel{
    position:absolute!important;
    right:0!important;
    top:calc(100% + .45rem)!important;
    bottom:auto!important;
    z-index:1500!important;
  }

  /* Reclaim the unused space above and below the desktop editing toolbar. */
  #desktopToolbarHost{
    top:3.25rem!important;
    bottom:.35rem!important;
    width:62px!important;
    max-height:none!important;
    overflow:hidden!important;
  }

  /* Keep every desktop editing tool in one vertical column. */
  #desktopToolbarHost .toolbar{
    display:flex!important;
    flex-direction:column!important;
    flex-wrap:nowrap!important;
    align-items:stretch!important;
    align-content:stretch!important;
    gap:.22rem!important;
    width:100%!important;
    height:100%!important;
    max-height:100%!important;
    padding:.35rem!important;
    overflow-y:auto!important;
    overflow-x:hidden!important;
    scrollbar-width:thin;
  }
  #desktopToolbarHost .toolbar .grp{
    display:flex!important;
    flex-direction:column!important;
    flex-wrap:nowrap!important;
    gap:.22rem!important;
    width:100%!important;
    margin:0!important;
    padding:0 0 .28rem!important;
    border-right:0!important;
    border-bottom:1px solid var(--border)!important;
  }
  #desktopToolbarHost .toolbar .grp:last-child{
    padding-bottom:0!important;
    border-bottom:0!important;
  }
  #desktopToolbarHost .toolbar .icon-btn{
    width:100%!important;
    min-width:0!important;
    flex:none!important;
  }
}
</style>`;

const SEARCH_LAYOUT_FEATURE = String.raw`
<script id="mancardo-map-search-layout-feature">
(function installMancardoSearchTopbarLayout(){
  if(window.__mancardoSearchTopbarLayoutInstalled)return;
  window.__mancardoSearchTopbarLayoutInstalled=true;

  var resizeTimer=null;
  var observer=null;

  function moveSearch(){
    var btn=document.getElementById('mancardoMapSearchBtn');
    var panel=document.getElementById('mancardoMapSearchPanel');
    var wrap=document.getElementById('mapWrap')||document.querySelector('.map-wrap');
    var topbar=document.querySelector('.topbar');
    if(!btn||!panel||!wrap||!topbar)return false;

    var desktop=window.matchMedia('(min-width:768px)').matches;
    if(desktop){
      var host=document.getElementById('mancardoTopbarSearchHost');
      if(!host){
        host=document.createElement('div');
        host.id='mancardoTopbarSearchHost';
        var chip=topbar.querySelector('.local-chip');
        if(chip)topbar.insertBefore(host,chip);
        else topbar.appendChild(host);
      }
      if(btn.parentNode!==host)host.appendChild(btn);
      if(panel.parentNode!==host)host.appendChild(panel);
    }else{
      var host=document.getElementById('mancardoTopbarSearchHost');
      if(btn.parentNode!==wrap)wrap.appendChild(btn);
      if(panel.parentNode!==wrap)wrap.appendChild(panel);
      if(host&&host.parentNode)host.parentNode.removeChild(host);
    }
    return true;
  }

  if(!moveSearch()){
    observer=new MutationObserver(function(){
      if(moveSearch()&&observer){observer.disconnect();observer=null;}
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }

  window.addEventListener('resize',function(){
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(moveSearch,80);
  });
})();
</script>`;

function injectSearchLayout(html){
  if(!html.includes('mancardo-map-search-layout-styles')){
    html=html.replace('</head>',SEARCH_LAYOUT_CSS+'\n</head>');
  }
  if(!html.includes('mancardo-map-search-layout-feature')){
    html=html.replace('</body>',SEARCH_LAYOUT_FEATURE+'\n</body>');
  }
  return html;
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html')) return response;

    const html=injectSearchLayout(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
