import baseWorker from './worker-shared-notes-stable.js';

const SAFE_AUTH=String.raw`
<script id="mancardo-shared-auth-guard-safe">
(function(){
  if(window.__mancardoSharedAuthSafeInstalled)return;
  window.__mancardoSharedAuthSafeInstalled=true;
  function isShareButton(btn){
    if(!btn||btn.dataset.mancardoSharedAuthBypass==='1')return false;
    var t=(btn.textContent||'').trim().toLowerCase();
    return t==='share'||t==='publish'||t.indexOf('publish')===0;
  }
  function runOriginal(btn){
    btn.dataset.mancardoSharedAuthBypass='1';
    try{btn.click();}finally{setTimeout(function(){delete btn.dataset.mancardoSharedAuthBypass;},0);}
  }
  function showSignIn(){
    var overlay=document.getElementById('mancardoPrivateSyncOverlay');
    var msg=document.getElementById('mancardoPrivateSyncMessage');
    var chip=document.getElementById('mancardoPrivateSyncChip');
    if(overlay){
      overlay.classList.remove('hidden');
      if(msg)msg.textContent='Sign in is required before publishing to Shared Library. Choose Sign in, complete Cloudflare Access, then return and tap Share again.';
      return true;
    }
    if(chip){try{chip.click();return true;}catch(e){}}
    return false;
  }
  document.addEventListener('click',function(ev){
    var btn=ev.target&&ev.target.closest?ev.target.closest('button'):null;
    if(!isShareButton(btn))return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    fetch('/api/private-library/health',{credentials:'include',cache:'no-store',headers:{accept:'application/json'}})
      .then(function(r){return r.json().catch(function(){return {};});})
      .then(function(h){
        if(h&&h.authenticated&&h.accountKey){runOriginal(btn);return;}
        if(!showSignIn())alert('Sign in is required before publishing to Shared Library. Open the cloud sync control, choose Sign in, then try Share again.');
      })
      .catch(function(){
        if(!showSignIn())alert('Could not verify your ManCardo account. Please sign in using the cloud sync control, then try Share again.');
      });
  },true);
})();
</script>`;

function removeLegacyAuthGuard(html){
  return String(html||'').replace(/<script id="mancardo-shared-auth-guard">[\s\S]*?<\/script>/i,'');
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=removeLegacyAuthGuard(await response.text());
    if(!html.includes('mancardo-shared-auth-guard-safe')){
      const i=html.toLowerCase().lastIndexOf('</body>');
      html=i>=0?html.slice(0,i)+SAFE_AUTH+'\n'+html.slice(i):html+SAFE_AUTH;
    }
    const headers=new Headers(response.headers);
    headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store, max-age=0');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
