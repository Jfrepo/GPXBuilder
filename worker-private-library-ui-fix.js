import baseWorker from './worker-private-library-readiness-fix.js';

const UI_FIX=String.raw`
<script id="mancardo-private-sync-ui-fix">
(function(){
  function wire(){
    var chip=document.getElementById('mancardoPrivateSyncChip');
    var overlay=document.getElementById('mancardoPrivateSyncOverlay');
    if(!chip||!overlay)return;
    function openSync(ev){
      if(ev){ev.preventDefault();ev.stopPropagation();}
      overlay.classList.remove('hidden');
      var msg=document.getElementById('mancardoPrivateSyncMessage');
      if(msg&&!msg.textContent.trim())msg.textContent='Private My Library cloud sync.';
    }
    chip.disabled=false;
    chip.style.pointerEvents='auto';
    chip.addEventListener('click',openSync,true);
    chip.addEventListener('pointerup',openSync,true);

    var close=document.getElementById('mancardoPrivateSyncClose');
    var done=document.getElementById('mancardoPrivateSyncDone');
    if(close)close.addEventListener('click',function(){overlay.classList.add('hidden');},true);
    if(done)done.addEventListener('click',function(){overlay.classList.add('hidden');},true);

    var signin=document.getElementById('mancardoPrivateSyncSignIn');
    if(signin)signin.addEventListener('click',function(ev){
      ev.preventDefault();ev.stopPropagation();
      window.open('/api/private-library/login','mancardo-private-login','width=640,height=700');
    },true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else wire();
  setTimeout(wire,1200);
})();
</script>`;

function inject(html){
  if(html.includes('mancardo-private-sync-ui-fix'))return html;
  const i=html.toLowerCase().lastIndexOf('</body>');
  if(i>=0)return html.slice(0,i)+UI_FIX+'\n'+html.slice(i);
  return html+UI_FIX;
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=inject(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
