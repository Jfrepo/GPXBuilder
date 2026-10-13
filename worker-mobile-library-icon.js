import baseWorker from './worker-private-waypoint-sync.js';

const PATCH=String.raw`
<style id="mancardo-mobile-overlay-layers-icon-style">
@media (max-width:899px){
  .overlay-control-btn{
    font-size:0!important;
    line-height:0!important;
    position:relative!important;
    display:inline-flex!important;
    align-items:center!important;
    justify-content:center!important;
  }
  .overlay-control-btn::before{
    content:"";
    width:24px;
    height:24px;
    display:block;
    background-repeat:no-repeat;
    background-position:center;
    background-size:24px 24px;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23333' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 3 3.5 7.5 12 12l8.5-4.5L12 3Z'/%3E%3Cpath d='m3.5 12 8.5 4.5 8.5-4.5'/%3E%3Cpath d='m3.5 16.5 8.5 4.5 8.5-4.5'/%3E%3C/svg%3E");
  }
  .overlay-control-btn.on::before{filter:brightness(0) invert(1)}
}
</style>
<script id="mancardo-mobile-overlay-layers-icon-script">
(function(){
  function apply(){
    var buttons=document.querySelectorAll('.overlay-control-btn');
    buttons.forEach(function(b){
      b.setAttribute('aria-label','Show or hide map overlays');
      b.setAttribute('title','Map overlays');
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
  setTimeout(apply,250);setTimeout(apply,1000);setTimeout(apply,2500);
})();
</script>`;

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=await response.text();
    if(!html.includes('mancardo-mobile-overlay-layers-icon-style')){
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
