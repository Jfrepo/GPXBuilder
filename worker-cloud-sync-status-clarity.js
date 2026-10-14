import baseWorker from './worker-mobile-search-layering.js';

const CLOUD_STATUS_CLARITY = String.raw`
<style id="mancardo-cloud-status-clarity-styles">
#mancardoPrivateSyncChip[data-clarity-state="checking"]{background:#fff3cd!important;border-color:#d6a800!important;color:#6d5200!important;font-weight:800!important}
#mancardoPrivateSyncChip[data-clarity-state="signedin"]{background:#e7f6ec!important;border-color:#2f8f4e!important;color:#176332!important;font-weight:800!important}
#mancardoPrivateSyncChip[data-clarity-state="signin"]{background:#eef3f7!important;border-color:#8a99a8!important;color:#263645!important;font-weight:800!important}
#mancardoPrivateSyncChip[data-clarity-state="error"]{background:#fdeaea!important;border-color:#c74646!important;color:#8d1f1f!important;font-weight:800!important}
#mancardoPrivateSyncStatusBanner{margin:.7rem .9rem;padding:.7rem .8rem;border:1px solid var(--border);border-radius:6px;font-weight:800;line-height:1.35}
#mancardoPrivateSyncStatusBanner[data-state="signedin"]{background:#e7f6ec;border-color:#2f8f4e;color:#176332}
#mancardoPrivateSyncStatusBanner[data-state="checking"]{background:#fff3cd;border-color:#d6a800;color:#6d5200}
#mancardoPrivateSyncStatusBanner[data-state="signin"]{background:#eef3f7;border-color:#8a99a8;color:#263645}
#mancardoPrivateSyncStatusBanner[data-state="error"]{background:#fdeaea;border-color:#c74646;color:#8d1f1f}
#mancardoPrivateSyncStatusBanner .mancardo-cloud-banner-title{display:block;font-size:.92rem}
#mancardoPrivateSyncStatusBanner .mancardo-cloud-banner-detail{display:block;margin-top:.15rem;font-size:.72rem;font-weight:650}
</style>
<script id="mancardo-cloud-status-clarity-feature">
(function(){
  if(window.__mancardoCloudStatusClarityInstalled)return;
  window.__mancardoCloudStatusClarityInstalled=true;

  function setText(el,text){if(el&&el.textContent!==text)el.textContent=text;}

  function ensureBanner(){
    var overlay=document.getElementById('mancardoPrivateSyncOverlay');
    if(!overlay)return null;
    var banner=document.getElementById('mancardoPrivateSyncStatusBanner');
    if(!banner){
      banner=document.createElement('div');
      banner.id='mancardoPrivateSyncStatusBanner';
      banner.setAttribute('role','status');
      var first=overlay.firstElementChild;
      if(first&&first.firstElementChild)first.insertBefore(banner,first.firstElementChild.nextSibling);
      else overlay.insertBefore(banner,overlay.firstChild);
    }
    return banner;
  }

  function updatePopup(state){
    var banner=ensureBanner();
    if(!banner)return;
    banner.dataset.state=state;
    if(state==='signedin'){
      banner.innerHTML='<span class="mancardo-cloud-banner-title">✓ Signed in</span><span class="mancardo-cloud-banner-detail">Private My Library cloud sync is active and your library is synced.</span>';
    }else if(state==='checking'){
      banner.innerHTML='<span class="mancardo-cloud-banner-title">Connecting…</span><span class="mancardo-cloud-banner-detail">Verifying your private ManCardo sign-in and cloud sync status.</span>';
    }else if(state==='signin'){
      banner.innerHTML='<span class="mancardo-cloud-banner-title">Not signed in</span><span class="mancardo-cloud-banner-detail">Sign in to enable private My Library cloud sync across your devices.</span>';
    }else if(state==='error'){
      banner.innerHTML='<span class="mancardo-cloud-banner-title">Sync needs attention</span><span class="mancardo-cloud-banner-detail">Open the details below and retry sign-in or sync.</span>';
    }
  }

  function apply(){
    var chip=document.getElementById('mancardoPrivateSyncChip');
    if(!chip)return false;
    var raw=String(chip.textContent||'').trim();
    var low=raw.toLowerCase();
    var state='';
    if(low.indexOf('checking')>=0){
      state='checking';
      chip.dataset.clarityState=state;
      setText(chip,'☁ Connecting…');
      chip.title='Connecting to your private ManCardo account';
      chip.setAttribute('aria-label',chip.title);
    }else if(low.indexOf('synced')>=0){
      state='signedin';
      chip.dataset.clarityState=state;
      setText(chip,'✓ Signed in · Synced');
      chip.title='Signed in and My Library is synced to the private cloud';
      chip.setAttribute('aria-label',chip.title);
    }else if(low.indexOf('sign in')>=0){
      state='signin';
      chip.dataset.clarityState=state;
      setText(chip,'☁ Sign in');
      chip.title='Sign in to enable private My Library cloud sync';
      chip.setAttribute('aria-label',chip.title);
    }else if(low.indexOf('failed')>=0||low.indexOf('error')>=0||low.indexOf('offline')>=0||low.indexOf('pending')>=0){
      state='error';
      chip.dataset.clarityState=state;
    }else if(chip.dataset.clarityState){
      state=chip.dataset.clarityState;
    }
    if(state)updatePopup(state);
    return true;
  }

  function watch(){
    if(!apply()){setTimeout(watch,300);return;}
    var chip=document.getElementById('mancardoPrivateSyncChip');
    if(!chip)return;
    var obs=new MutationObserver(function(){apply();});
    obs.observe(chip,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['data-state']});
    var overlay=document.getElementById('mancardoPrivateSyncOverlay');
    if(overlay){
      var overlayObs=new MutationObserver(function(){apply();});
      overlayObs.observe(overlay,{attributes:true,attributeFilter:['class']});
    }
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
