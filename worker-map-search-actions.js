import baseWorker from './worker-map-search-layout.js';

const SEARCH_ACTION_FIXES = String.raw`
<style id="mancardo-map-search-action-fixes">
.mancardo-search-info-close,.mancardo-search-info-direct,.mancardo-map-direct-link{pointer-events:auto!important;touch-action:manipulation!important}
</style>
<script id="mancardo-map-search-action-fixes-script">
(function installMancardoSearchActionFixes(){
  if(window.__mancardoSearchActionFixesInstalled)return;
  window.__mancardoSearchActionFixesInstalled=true;

  function appleUrl(el){
    if(!el)return '';
    var href=el.getAttribute&&el.getAttribute('href');
    return href&&href.indexOf('maps.apple.com')>=0?href:'';
  }

  function hideSearchInfo(el){
    var node=el;
    while(node&&node!==document.body){
      if(node.classList&&(node.classList.contains('gm-style-iw-t')||node.classList.contains('gm-style-iw-c'))){
        var root=node.classList.contains('gm-style-iw-t')?node:node.closest('.gm-style-iw-t')||node;
        root.style.display='none';
        root.setAttribute('aria-hidden','true');
        return true;
      }
      node=node.parentElement;
    }
    var info=el&&el.closest?el.closest('.mancardo-search-info'):null;
    if(info){
      var shell=info.closest('.gm-style-iw-t')||info.closest('.gm-style-iw-c');
      if(shell){shell.style.display='none';shell.setAttribute('aria-hidden','true');return true;}
      info.style.display='none';
      return true;
    }
    return false;
  }

  function handle(ev){
    var target=ev.target;
    if(!target||!target.closest)return;

    var close=target.closest('.mancardo-search-info-close');
    if(close){
      ev.preventDefault();
      ev.stopPropagation();
      if(ev.stopImmediatePropagation)ev.stopImmediatePropagation();
      hideSearchInfo(close);
      return;
    }

    var direct=target.closest('.mancardo-search-info-direct,.mancardo-map-direct-link');
    if(direct){
      var url=appleUrl(direct);
      if(!url)return;
      ev.preventDefault();
      ev.stopPropagation();
      if(ev.stopImmediatePropagation)ev.stopImmediatePropagation();
      window.location.assign(url);
    }
  }

  // Capture before Google Maps' own handlers so taps/clicks are not swallowed by the map overlay.
  document.addEventListener('click',handle,true);
})();
</script>`;

function injectFixes(html){
  if(html.includes('mancardo-map-search-action-fixes-script'))return html;
  return html.replace('</body>',SEARCH_ACTION_FIXES+'\n</body>');
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=injectFixes(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
