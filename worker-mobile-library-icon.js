import baseWorker from './worker-private-waypoint-sync.js';

const PATCH=String.raw`
<script id="mancardo-mobile-library-panel-icon">
(function(){
  function apply(){
    var b=document.getElementById('mobileLibraryToggle');
    if(!b)return;
    b.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M9 4v16"></path></svg>';
    b.setAttribute('aria-label','Open track library panel');
    b.setAttribute('title','Track library');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
  new MutationObserver(apply).observe(document.documentElement,{subtree:true,childList:true});
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
