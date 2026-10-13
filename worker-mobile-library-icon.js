import baseWorker from './worker-private-waypoint-sync.js';

const PATCH=String.raw`
<script id="mancardo-mobile-library-panel-icon">
(function(){
  function layersSvg(){
    return '<svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3.5 7.5 12 12l8.5-4.5L12 3Z"></path><path d="m3.5 12 8.5 4.5 8.5-4.5"></path><path d="m3.5 16.5 8.5 4.5 8.5-4.5"></path></svg>';
  }
  function apply(){
    var overlay=document.querySelector('.overlay-control-btn');
    if(overlay){
      overlay.innerHTML=layersSvg();
      overlay.setAttribute('aria-label','Show or hide map overlays');
      overlay.setAttribute('title','Map overlays');
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
  new MutationObserver(apply).observe(document.documentElement,{subtree:true,childList:true});
  setTimeout(apply,250);
  setTimeout(apply,1000);
})();
</script>`;

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=await response.text();
    if(!html.includes('mancardo-mobile-library-panel-icon')){
      const i=html.toLowerCase().lastIndexOf('</body>');
      html=i>=0?html.slice(0,i)+PATCH+'\n'+html.slice(i):html+PATCH;
    }
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
