import baseWorker from './worker-private-waypoint-sync.js';

const PATCH=String.raw`
<style id="mancardo-overlay-layers-icon-global">
.overlay-control-btn,
button[title="Map overlays"],
button[aria-label="Show or hide map overlays"]{
  font-size:0!important;
  line-height:0!important;
  position:relative!important;
}
.overlay-control-btn::before,
button[title="Map overlays"]::before,
button[aria-label="Show or hide map overlays"]::before{
  content:""!important;
  display:block!important;
  width:24px!important;
  height:24px!important;
  background-repeat:no-repeat!important;
  background-position:center!important;
  background-size:24px 24px!important;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23333' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 3 3.5 7.5 12 12l8.5-4.5L12 3Z'/%3E%3Cpath d='m3.5 12 8.5 4.5 8.5-4.5'/%3E%3Cpath d='m3.5 16.5 8.5 4.5 8.5-4.5'/%3E%3C/svg%3E")!important;
}
.overlay-control-btn.on::before{filter:brightness(0) invert(1)}
</style>
<script id="mancardo-overlay-layers-icon-global-script">
(function(){
  function apply(){
    document.querySelectorAll('.overlay-control-btn,button[title="Map overlays"],button[aria-label="Show or hide map overlays"]').forEach(function(b){
      if(!b||b.id==='hamburgerBtn'||b.classList.contains('fuel-control-btn'))return;
      b.setAttribute('title','Map overlays');
      b.setAttribute('aria-label','Show or hide map overlays');
      b.textContent='';
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
  new MutationObserver(apply).observe(document.documentElement,{subtree:true,childList:true});
  setInterval(apply,750);
})();
</script>`;

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=await response.text();
    if(!html.includes('mancardo-overlay-layers-icon-global')){
      const i=html.toLowerCase().lastIndexOf('</body>');
      html=i>=0?html.slice(0,i)+PATCH+'\n'+html.slice(i):html+PATCH;
    }
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store, max-age=0');
    headers.set('pragma','no-cache');
    headers.set('x-mancardo-overlay-icon','layers-global-v1');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
