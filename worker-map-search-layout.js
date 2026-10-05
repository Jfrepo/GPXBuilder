import baseWorker from './worker-map-search.js';

const SEARCH_LAYOUT_CSS = String.raw`
<style id="mancardo-map-search-layout-styles">
.mancardo-map-search-result-wrap{display:grid;grid-template-columns:minmax(0,1fr) 38px;align-items:stretch;gap:.2rem;border-radius:4px}
.mancardo-map-search-result-wrap:hover{background:var(--surface-2)}
.mancardo-map-search-result-wrap .mancardo-map-search-result{min-width:0}
.mancardo-map-direct-link{display:flex;align-items:center;justify-content:center;align-self:center;width:34px;height:34px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--accent);text-decoration:none}
.mancardo-map-direct-link:hover,.mancardo-map-direct-link:focus{border-color:var(--accent);outline:none;background:var(--surface-2)}
.mancardo-map-direct-link svg{width:19px;height:19px;display:block}
.mancardo-search-info{position:relative;min-width:150px;padding:.1rem 1.7rem .1rem 0;font:500 12px/1.3 'Source Sans 3',system-ui,sans-serif}
.mancardo-search-info strong{display:block;padding-right:.2rem}
.mancardo-search-info-address{margin-top:.15rem;color:#59636d;font-size:11px}
.mancardo-search-info-close{position:absolute;right:-5px;top:-7px;width:26px;height:26px;border:0;border-radius:50%;background:transparent;color:#333;font:700 21px/24px system-ui,sans-serif;cursor:pointer;padding:0}
.mancardo-search-info-close:hover{background:rgba(0,0,0,.08)}
.mancardo-search-info-direct{display:inline-flex;align-items:center;gap:.28rem;margin-top:.45rem;color:#1f6f6c;font-weight:700;text-decoration:none}
.mancardo-search-info-direct svg{width:15px;height:15px}

@media(max-width:767px){
  /* Keep search away from the mobile +/- zoom tray in the lower-right corner. */
  #mancardoMapSearchBtn{left:.5rem!important;right:auto!important;bottom:.55rem!important}
  #mancardoMapSearchPanel{left:.5rem!important;right:auto!important;bottom:3.35rem!important}
}

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
    var input=document.getElementById('mancardoMapSearchInput');
    var wrap=document.getElementById('mapWrap')||document.querySelector('.map-wrap');
    var topbar=document.querySelector('.topbar');
    if(!btn||!panel||!wrap||!topbar)return false;

    if(input)input.placeholder='Town, Trail, Hotel, POI';

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

const RESULT_RENDER_OLD = String.raw`    items.slice(0,8).forEach(function(item){
      var row=document.createElement('button');
      row.type='button';
      row.className='mancardo-map-search-result';
      var name=document.createElement('span');name.className='mancardo-map-search-name';name.textContent=item.name;
      var address=document.createElement('span');address.className='mancardo-map-search-address';address.textContent=item.address;
      row.appendChild(name);if(item.address)row.appendChild(address);
      row.onclick=function(){selectResult(item);};
      results.appendChild(row);
    });`;

const RESULT_RENDER_NEW = String.raw`    items.slice(0,8).forEach(function(item){
      var wrapRow=document.createElement('div');
      wrapRow.className='mancardo-map-search-result-wrap';
      var row=document.createElement('button');
      row.type='button';
      row.className='mancardo-map-search-result';
      var name=document.createElement('span');name.className='mancardo-map-search-name';name.textContent=item.name;
      var address=document.createElement('span');address.className='mancardo-map-search-address';address.textContent=item.address;
      row.appendChild(name);if(item.address)row.appendChild(address);
      row.onclick=function(){selectResult(item);};

      var direct=document.createElement('a');
      direct.className='mancardo-map-direct-link';
      direct.href='https://maps.apple.com/?daddr='+String(item.location.lat)+','+String(item.location.lng)+'&q='+encodeURIComponent(item.name||'Destination')+'&dirflg=d';
      direct.target='_blank';
      direct.rel='noopener';
      direct.title='Direct to in Apple Maps';
      direct.setAttribute('aria-label','Direct to '+(item.name||'location')+' in Apple Maps');
      direct.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19L19 5M10 5h9v9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
      direct.onclick=function(ev){ev.stopPropagation();};

      wrapRow.appendChild(row);
      wrapRow.appendChild(direct);
      results.appendChild(wrapRow);
    });`;

const INFO_WINDOW_OLD = String.raw`        var content=document.createElement('div');
        var strong=document.createElement('strong');strong.textContent=item.name;content.appendChild(strong);
        if(item.address){var addr=document.createElement('div');addr.textContent=item.address;content.appendChild(addr);}
        searchInfoWindow=new google.maps.InfoWindow({content:content,disableAutoPan:true});
        try{searchInfoWindow.open({map:googleMap,anchor:searchMarker});}catch(e){try{searchInfoWindow.open(googleMap,searchMarker);}catch(_e){}}`;

const INFO_WINDOW_NEW = String.raw`        var content=document.createElement('div');
        content.className='mancardo-search-info';
        var closeInfo=document.createElement('button');
        closeInfo.type='button';
        closeInfo.className='mancardo-search-info-close';
        closeInfo.title='Close';
        closeInfo.setAttribute('aria-label','Close search location info');
        closeInfo.innerHTML='&times;';
        closeInfo.onclick=function(ev){
          ev.preventDefault();ev.stopPropagation();
          if(searchInfoWindow){try{searchInfoWindow.close();}catch(e){}searchInfoWindow=null;}
        };
        content.appendChild(closeInfo);
        var strong=document.createElement('strong');strong.textContent=item.name;content.appendChild(strong);
        if(item.address){var addr=document.createElement('div');addr.className='mancardo-search-info-address';addr.textContent=item.address;content.appendChild(addr);}
        var directInfo=document.createElement('a');
        directInfo.className='mancardo-search-info-direct';
        directInfo.href='https://maps.apple.com/?daddr='+String(ll.lat)+','+String(ll.lng)+'&q='+encodeURIComponent(item.name||'Destination')+'&dirflg=d';
        directInfo.target='_blank';directInfo.rel='noopener';
        directInfo.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19L19 5M10 5h9v9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg><span>Direct to</span>';
        content.appendChild(directInfo);
        searchInfoWindow=new google.maps.InfoWindow({content:content,disableAutoPan:true,headerDisabled:true});
        try{searchInfoWindow.open({map:googleMap,anchor:searchMarker});}catch(e){try{searchInfoWindow.open(googleMap,searchMarker);}catch(_e){}}`;

function enhanceSearchBehaviour(html){
  if(html.includes(RESULT_RENDER_OLD))html=html.replace(RESULT_RENDER_OLD,RESULT_RENDER_NEW);
  if(html.includes(INFO_WINDOW_OLD))html=html.replace(INFO_WINDOW_OLD,INFO_WINDOW_NEW);
  html=html.replace("close.onclick=function(){closePanel();};","close.onclick=function(ev){if(ev){ev.preventDefault();ev.stopPropagation();}closePanel();};");
  return html;
}

function injectSearchLayout(html){
  html=enhanceSearchBehaviour(html);
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
