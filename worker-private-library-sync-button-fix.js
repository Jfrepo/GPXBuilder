import baseWorker from './worker-private-library-ui-fix.js';

const SYNC_BUTTON_FIX=String.raw`
<script id="mancardo-private-sync-button-fix">
(function(){
  function wire(){
    var btn=document.getElementById('mancardoPrivateSyncNow');
    if(!btn||btn.dataset.mancardoSyncButtonFix==='1')return;
    btn.dataset.mancardoSyncButtonFix='1';
    btn.addEventListener('click',function(ev){
      ev.preventDefault();
      ev.stopImmediatePropagation();
      var msg=document.getElementById('mancardoPrivateSyncMessage');
      var account=document.getElementById('mancardoPrivateSyncAccount');
      var chip=document.getElementById('mancardoPrivateSyncChip');
      var old=btn.textContent;
      btn.disabled=true;
      btn.textContent='Checking…';
      if(msg)msg.textContent='Verifying your signed-in private account…';
      if(chip){chip.dataset.state='syncing';chip.textContent='☁ Checking';}
      fetch('/api/private-library/health',{credentials:'include',cache:'no-store',headers:{accept:'application/json'}})
        .then(function(r){return r.json().catch(function(){return {};}).then(function(d){return {r:r,d:d};});})
        .then(function(x){
          var h=x.d||{};
          if(h.authenticated&&h.accountKey){
            if(account)account.textContent=h.accountLabel||'Private account';
            if(msg)msg.textContent='Account verified. Starting private My Library sync…';
            try{sessionStorage.setItem('__mancardo_resume_private_sync__','1');}catch(e){}
            setTimeout(function(){location.reload();},250);
            return;
          }
          btn.disabled=false;
          btn.textContent=old||'Sync now';
          if(h.authConfigured){
            if(msg)msg.textContent='Your private account is not active in this tab yet. Click Sign in, complete the Access login, then return here and press Sync now.';
            if(chip){chip.dataset.state='signin';chip.textContent='☁ Sign in';}
          }else{
            if(msg)msg.textContent='Private account authentication is not configured for this deployment.';
            if(chip){chip.dataset.state='setup';chip.textContent='☁ Setup needed';}
          }
        })
        .catch(function(e){
          btn.disabled=false;
          btn.textContent=old||'Sync now';
          if(msg)msg.textContent='Could not verify the private account session. '+(e&&e.message?e.message:'Please sign in again.');
          if(chip){chip.dataset.state='signin';chip.textContent='☁ Sign in';}
        });
    },true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else wire();
  setTimeout(wire,1200);
})();
</script>`;

function inject(html){
  if(html.includes('mancardo-private-sync-button-fix'))return html;
  const i=html.toLowerCase().lastIndexOf('</body>');
  if(i>=0)return html.slice(0,i)+SYNC_BUTTON_FIX+'\n'+html.slice(i);
  return html+SYNC_BUTTON_FIX;
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
