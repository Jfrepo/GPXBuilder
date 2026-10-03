import baseWorker from './worker-shared-filter.js';

const GOOGLE_PREVIEW_CSS = String.raw`
<style id="google-preview-styles">
#googleBaseMap{position:absolute;inset:0;z-index:0;background:#e8edf1}
#mapDiv{position:relative;z-index:1;background:transparent!important}
#mapDiv.leaflet-container{background:transparent!important}
.layer-toggle{flex-wrap:wrap;max-width:min(92vw,520px)}
.layer-toggle button{white-space:nowrap}
.google-preview-status{position:absolute;left:50%;top:4.1rem;transform:translateX(-50%);z-index:820;background:var(--surface);color:var(--text);border:1px solid var(--border);padding:.45rem .7rem;border-radius:4px;font-size:.75rem;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.18)}
@media(max-width:700px){.layer-toggle{right:.4rem;top:.5rem;max-width:calc(100% - 5rem)}.layer-toggle button{padding:.35rem .48rem;font-size:.7rem}.google-preview-status{top:5.5rem;max-width:80vw;text-align:center}}
</style>`;

const GOOGLE_PREVIEW_FEATURE = String.raw`
// ---------- Google Maps preview basemaps ----------
(function installGoogleMapsPreview(){
  var mapWrap=document.getElementById('mapWrap');
  var leafletDiv=document.getElementById('mapDiv');
  if(!mapWrap||!leafletDiv||!map||!els.layerStreetsBtn||!els.layerTerrainBtn)return;

  var status=document.createElement('div');
  status.className='google-preview-status';
  status.textContent='Waiting for Google Maps JavaScript API…';
  mapWrap.appendChild(status);

  var tries=0;
  function waitForGoogle(){
    if(window.google&&google.maps){status.remove();startGoogle();return;}
    tries++;
    if(tries<120)setTimeout(waitForGoogle,250);
    else status.textContent='Google Maps JavaScript API is not loaded for this preview.';
  }

  function startGoogle(){
    if(document.getElementById('googleBaseMap'))return;
    var googleDiv=document.createElement('div');googleDiv.id='googleBaseMap';googleDiv.setAttribute('aria-hidden','true');mapWrap.insertBefore(googleDiv,leafletDiv);
    var centre=map.getCenter();
    var googleMap=new google.maps.Map(googleDiv,{center:{lat:centre.lat,lng:centre.lng},zoom:map.getZoom(),mapTypeId:'roadmap',disableDefaultUI:true,gestureHandling:'none',keyboardShortcuts:false,clickableIcons:false,streetViewControl:false,mapTypeControl:false,fullscreenControl:false,rotateControl:false,scaleControl:false,backgroundColor:'#e8edf1'});

    var toggle=els.layerStreetsBtn.parentElement;
    els.layerStreetsBtn.textContent='Roads';els.layerStreetsBtn.title='Google road map';
    els.layerTerrainBtn.textContent='Terrain';els.layerTerrainBtn.title='Google terrain map';
    var satelliteBtn=document.createElement('button');satelliteBtn.type='button';satelliteBtn.textContent='Satellite';satelliteBtn.title='Google satellite imagery';
    var hybridBtn=document.createElement('button');hybridBtn.type='button';hybridBtn.textContent='Hybrid';hybridBtn.title='Google satellite imagery with roads and labels';
    toggle.appendChild(satelliteBtn);toggle.appendChild(hybridBtn);
    var buttons={roadmap:els.layerStreetsBtn,terrain:els.layerTerrainBtn,satellite:satelliteBtn,hybrid:hybridBtn};

    function hideLeafletBase(){if(map.hasLayer(streetsLayer))map.removeLayer(streetsLayer);if(map.hasLayer(terrainLayer))map.removeLayer(terrainLayer);var pane=map.getPane('tilePane');if(pane)pane.style.display='none';}
    function sync(){var c=map.getCenter();googleMap.setCenter({lat:c.lat,lng:c.lng});if(googleMap.getZoom()!==map.getZoom())googleMap.setZoom(map.getZoom());}
    var frame=null;function queueSync(){if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(function(){frame=null;sync();});}
    function setType(type){if(!buttons[type])type='roadmap';hideLeafletBase();googleMap.setMapTypeId(type);Object.keys(buttons).forEach(function(k){buttons[k].classList.toggle('on',k===type);});try{localStorage.setItem('mancardo_google_map_type_v1',type);}catch(e){}queueSync();}

    els.layerStreetsBtn.onclick=function(){setType('roadmap');};
    els.layerTerrainBtn.onclick=function(){setType('terrain');};
    satelliteBtn.onclick=function(){setType('satellite');};
    hybridBtn.onclick=function(){setType('hybrid');};
    map.on('move zoom resize moveend zoomend',queueSync);
    var initial='roadmap';try{var saved=localStorage.getItem('mancardo_google_map_type_v1');if(buttons[saved])initial=saved;}catch(e){}
    setType(initial);setTimeout(function(){google.maps.event.trigger(googleMap,'resize');queueSync();},100);
  }

  waitForGoogle();
})();
`;

function injectGooglePreview(html){
  if(html.indexOf('installGoogleMapsPreview')!==-1)return html;
  html=html.replace('</head>',GOOGLE_PREVIEW_CSS+'\n</head>');
  var close=html.lastIndexOf('})();');if(close===-1)return html;
  return html.slice(0,close)+GOOGLE_PREVIEW_FEATURE+'\n'+html.slice(close);
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=injectGooglePreview(await response.text());
    const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
