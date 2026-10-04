import baseWorker from './worker-ui-optimizations.js';

const UI_OPTIMIZATION_V2_FEATURE = String.raw`
// ---------- UI optimizations v2: 3D overlay loading feedback ----------
(function installMancardoUIOptimizationsV2(){
  if(window.__mancardoUIOptimizationsV2Installed)return;
  window.__mancardoUIOptimizationsV2Installed=true;

  var timer=null;
  function showBusy(label,duration){
    var chip=document.getElementById('mancardoRenderStatus');
    if(!chip)return;
    chip.textContent=label||'Loading…';
    chip.classList.add('on');
    clearTimeout(timer);
    timer=setTimeout(function(){chip.classList.remove('on');},duration||1000);
  }

  document.addEventListener('click',function(ev){
    var t=ev.target;
    if(!t||!t.closest)return;
    if(t.closest('#mancardo3dContoursBtn'))showBusy('Loading 3D contours…',1200);
    else if(t.closest('#mancardo3dRadarBtn'))showBusy('Loading 3D weather…',1200);
    else if(t.closest('#mancardo3dFuelBtn'))showBusy('Loading 3D fuel locations…',1200);
  },true);

  document.addEventListener('change',function(ev){
    var t=ev.target;
    if(t&&t.id==='mancardo3dRadarMode')showBusy('Updating 3D weather…',1200);
  },true);
})();
`;

function injectUIOptimizationsV2(html){
  if(html.includes('installMancardoUIOptimizationsV2'))return html;
  const close=html.lastIndexOf('})();');
  if(close===-1)return html;
  return html.slice(0,close)+UI_OPTIMIZATION_V2_FEATURE+'\n'+html.slice(close);
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=injectUIOptimizationsV2(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
