import baseWorker from './worker-mobile-search-layering.js';

const CLOUD_STATUS_CLARITY = String.raw`
<style id="mancardo-cloud-status-clarity-styles">
#mancardoPrivateSyncChip[data-clarity-state="checking"]{background:#fff3cd!important;border-color:#d6a800!important;color:#6d5200!important;font-weight:800!important}
#mancardoPrivateSyncChip[data-clarity-state="signedin"]{background:#e7f6ec!important;border-color:#2f8f4e!important;color:#176332!important;font-weight:800!important}
#mancardoPrivateSyncChip[data-clarity-state="signin"]{background:#eef3f7!important;border-color:#8a99a8!important;color:#263645!important;font-weight:800!important}
#mancardoPrivateSyncChip[data-clarity-state="error"]{background:#fdeaea!important;border-color:#c74646!important;color:#8d1f1f!important;font-weight:800!important}
</style>
<script id="mancardo-cloud-status-clarity-feature">
(function(){
  if(window.__mancardoCloudStatusClarityInstalled)return;
  window.__mancardoCloudStatusClarityInstalled=true;
  function apply(){
    var chip=document.getElementById('mancardoPrivateSyncChip');
    if(!chip)return false;
    var raw=String(chip.textContent||'').trim();
    var low=raw.toLowerCase();
    if(low.indexOf('checking')>=0){
      chip.dataset.clarityState='checking';
      chip.textContent='☁ Checking account…';
      chip.title='Checking whether your private ManCardo account is signed in';
      chip.setAttribute('aria-label',chip.title);
    }else if(low.indexOf('synced')>=0){
      chip.dataset.clarityState='signedin';
      chip.textContent='✓ Signed in · Synced';
      chip.title='Signed in and My Library is synced to the private cloud';
      chip.setAttribute('aria-label',chip.title);
    }else if(low.indexOf('sign in')>=0){
      chip.dataset.clarityState='signin';
      chip.textContent='☁ Sign in';
      chip.title='Sign in to enable private My Library cloud sync';
      chip.setAttribute('aria-label',chip.title);
    }else if(low.indexOf('failed')>=0||low.indexOf('error')>=0||low.indexOf('offline')>=0){
      chip.dataset.clarityState='error';
    }
    return true;
  }
  function watch(){
    if(!apply()){setTimeout(watch,300);return;}
    var chip=document.getElementById('mancardoPrivateSyncChip');
    if(!chip)return;
    var obs=new MutationObserver(function(){apply();});
    obs.observe(chip,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['data-state']});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});else watch();
})();
</script>`;

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=await response.text();
    if(!html.includes('mancardo-cloud-status-clarity-styles')){
      const head=html.toLowerCase().lastIndexOf('</head>');
      html=head>=0?html.slice(0,head)+CLOUD_STATUS_CLARITY+'\n'+html.slice(head):html+CLOUD_STATUS_CLARITY;
    }
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store, max-age=0');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
