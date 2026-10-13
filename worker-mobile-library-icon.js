import baseWorker from './worker-private-waypoint-sync.js';

const PATCH=String.raw`
<style id="mancardo-mobile-overlay-icon-force">
@media (max-width:899px){
  #mancardoMobileBottomTools button[data-mancardo-overlay-icon="1"],
  #mancardoMobileBottomTools .overlay-control-btn,
  button[title="Map overlays"],
  button[aria-label="Show or hide map overlays"]{
    font-size:0!important;
    line-height:0!important;
    position:relative!important;
  }
  #mancardoMobileBottomTools button[data-mancardo-overlay-icon="1"]::before,
  #mancardoMobileBottomTools .overlay-control-btn::before,
  button[title="Map overlays"]::before,
  button[aria-label="Show or hide map overlays"]::before{
    content:"◆"!important;
    display:inline-flex!important;
    align-items:center!important;
    justify-content:center!important;
    width:26px!important;
    height:26px!important;
    font:700 22px/1 system-ui,sans-serif!important;
    color:currentColor!important;
    transform:rotate(45deg)!important;
  }
}
</style>
<script id="mancardo-mobile-overlay-icon-force-script">
(function(){
  function mark(){
    var candidates=[].slice.call(document.querySelectorAll('.overlay-control-btn,button[title*="overlay" i],button[aria-label*="overlay" i]'));
    var tray=document.getElementById('mancardoMobileBottomTools');
    if(tray){
      [].slice.call(tray.querySelectorAll('button')).forEach(function(b){
        var txt=(b.textContent||'').trim().toLowerCase();
        if(!b.classList.contains('fuel-control-btn') && txt!=='fuel') candidates.push(b);
      });
    }
    candidates.forEach(function(b){
      if(!b||b.id==='hamburgerBtn')return;
      b.dataset.mancardoOverlayIcon='1';
      b.setAttribute('title','Map overlays');
      b.setAttribute('aria-label','Show or hide map overlays');
      b.innerHTML='';
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mark,{once:true});else mark();
  new MutationObserver(mark).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','title','aria-label']});
  setInterval(mark,500);
})();
</script>`;

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const url=new URL(request.url);
    if(request.method!=='GET'||url.pathname.startsWith('/api/'))return response;
    let html=await response.text();
    if(!html.includes('mancardo-mobile-overlay-icon-force')){
      const i=html.toLowerCase().lastIndexOf('</body>');
      html=i>=0?html.slice(0,i)+PATCH+'\n'+html.slice(i):html+PATCH;
    }
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store, max-age=0');
    headers.set('pragma','no-cache');
    headers.set('x-mancardo-overlay-icon','force-v1');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
