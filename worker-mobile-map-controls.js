import baseWorker from './worker-map-search-actions.js';

const DESKTOP_MAP_CONTROLS_CSS = String.raw`
<style id="mancardo-desktop-map-controls-bottom-right">
@media(min-width:768px){
  /* Keep desktop navigation controls beside the editing toolbar for faster hand/mouse travel. */
  #mancardoDesktopMapControls{
    position:absolute;
    right:76px;
    bottom:.55rem;
    z-index:805;
    display:flex;
    flex-direction:column;
    align-items:flex-end;
    gap:5px;
    pointer-events:none;
  }
  #mancardoDesktopMapControls .leaflet-control{
    margin:0!important;
    float:none!important;
    clear:none!important;
    pointer-events:auto;
  }

  /* Open the overlay/settings panel beside the relocated control stack. */
  .overlay-panel{
    top:auto!important;
    bottom:.55rem!important;
    left:auto!important;
    right:138px!important;
    max-height:calc(100% - 1.1rem)!important;
    overflow:auto!important;
  }
}
</style>`;

const DESKTOP_MAP_CONTROLS_FEATURE = String.raw`
<script id="mancardo-desktop-map-controls-feature">
(function installMancardoDesktopMapControls(){
  if(window.__mancardoDesktopMapControlsInstalled)return;
  window.__mancardoDesktopMapControlsInstalled=true;

  var mq=window.matchMedia('(min-width:768px)');
  var wrap=document.getElementById('mapWrap')||document.querySelector('.map-wrap');
  if(!wrap)return;

  var tray=document.createElement('div');
  tray.id='mancardoDesktopMapControls';
  wrap.appendChild(tray);

  function rememberNode(node){
    if(!node||node.__mancardoDesktopHome)return;
    node.__mancardoDesktopHome={parent:node.parentNode,next:node.nextSibling};
  }
  function restoreNode(node){
    var h=node&&node.__mancardoDesktopHome;
    if(!h||!h.parent)return;
    try{h.parent.insertBefore(node,h.next&&h.next.parentNode===h.parent?h.next:null);}catch(e){try{h.parent.appendChild(node);}catch(_){}}
  }
  function controlFor(button){return button&&(button.closest('.leaflet-control')||button.parentElement);}

  function moveControls(){
    if(!mq.matches)return;
    var zoom=document.querySelector('.leaflet-control-zoom');
    var overlay=controlFor(document.querySelector('.overlay-control-btn'));
    var fuel=controlFor(document.querySelector('.fuel-control-btn'));
    [zoom,overlay,fuel].forEach(function(control){
      if(control&&control.parentNode!==tray){rememberNode(control);tray.appendChild(control);}
    });
  }

  function restoreControls(){
    Array.prototype.slice.call(tray.children).forEach(restoreNode);
  }

  function apply(){
    if(mq.matches){tray.style.display='flex';moveControls();}
    else{restoreControls();tray.style.display='none';}
    try{if(typeof map!=='undefined'&&map)map.invalidateSize(false);}catch(e){}
  }

  if(mq.addEventListener)mq.addEventListener('change',apply);else if(mq.addListener)mq.addListener(apply);
  window.addEventListener('resize',function(){if(mq.matches)moveControls();},{passive:true});

  var tries=0,timer=setInterval(function(){
    tries++;
    if(mq.matches)moveControls();
    if(tries>40)clearInterval(timer);
  },250);

  if(window.MutationObserver){
    new MutationObserver(function(){if(mq.matches)moveControls();}).observe(wrap,{childList:true,subtree:true});
  }

  apply();
})();
</script>`;

function injectDesktopMapControls(html){
  if(html.includes('mancardo-desktop-map-controls-feature'))return html;
  html=html.replace('</head>',DESKTOP_MAP_CONTROLS_CSS+'\n</head>');
  return html.replace('</body>',DESKTOP_MAP_CONTROLS_FEATURE+'\n</body>');
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=injectDesktopMapControls(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
