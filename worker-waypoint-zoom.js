import baseWorker from './worker-ui-optimizations-v2.js';

const TRACK_POINT_MIN_ZOOM = 14;

const TRACK_CLICK_FLASH_FEATURE = String.raw`
// ---------- Flash a track when its Library row is pressed ----------
(function installMancardoTrackClickFlash(){
  if(window.__mancardoTrackClickFlashInstalled)return;
  window.__mancardoTrackClickFlashInstalled=true;

  var flashTimers=[];
  var activeFlash=null;

  function clearFlashTimers(){
    while(flashTimers.length)clearTimeout(flashTimers.pop());
  }

  function findLibraryItem(id){
    if(!Array.isArray(state.library))return null;
    return state.library.find(function(item){return String(item&&item.id)===String(id);})||null;
  }

  function setTransientVisibility(id,visible){
    var item=findLibraryItem(id);
    if(item)item.visible=visible;
    if(String(state.currentId)===String(id)&&state.current)state.current.visible=visible;
  }

  function restoreActiveFlash(){
    clearFlashTimers();
    if(!activeFlash)return;
    setTransientVisibility(activeFlash.id,activeFlash.originalVisible);
    activeFlash=null;
    if(typeof render==='function')render();
  }

  function flashTrack(id){
    restoreActiveFlash();
    var item=findLibraryItem(id);
    if(!item||typeof render!=='function')return;

    var originalVisible=item.visible!==false;
    activeFlash={id:id,originalVisible:originalVisible};

    // Flash once for one second, then return to the saved Show state.
    // Visible tracks go off then back on. Hidden tracks briefly appear then hide again.
    setTransientVisibility(id,!originalVisible);
    render();

    flashTimers.push(setTimeout(function(){
      if(!activeFlash||String(activeFlash.id)!==String(id))return;
      setTransientVisibility(id,originalVisible);
      activeFlash=null;
      render();
    },1000));
  }

  // Cancel any in-progress flash before the user deliberately changes Show state.
  document.addEventListener('pointerdown',function(ev){
    var target=ev.target;
    if(target&&target.closest&&target.closest('#trackList .track-show'))restoreActiveFlash();
  },true);

  // Capture the Library card BEFORE the base row handler runs. The base handler calls
  // renderLibrary(), which replaces the clicked DOM node before a bubbling document
  // listener would see it. Capturing here makes the identify flash reliable.
  document.addEventListener('click',function(ev){
    var target=ev.target;
    if(!target||!target.closest)return;
    var card=target.closest('#trackList .track-item');
    if(!card)return;

    // Only a row/name press is an identify action. Do not flash for colour, Show,
    // options, notes or buttons inside the track card.
    if(target.closest('button,input,textarea,select,.track-menu,.track-palette,.track-note-wrap'))return;

    var id=card.getAttribute('data-track-id');
    if(!id)return;

    // Run after the base row click has loaded/selected the track so this works even
    // when the same already-selected track is pressed again.
    setTimeout(function(){flashTrack(id);},30);
  },true);
})();
`;

function suppressZoomedOutTrackPoints(html){
  if(!html.includes('__mancardoTrackPointMinZoom')){
    const oldBlock = `        if(layer instanceof L.CircleMarker){
          var ll=layer.getLatLng();
          var opts=layer.options||{};
          var strokeOpacity=opts.opacity==null?1:Number(opts.opacity);
          var fillOpacity=opts.fillOpacity==null?1:Number(opts.fillOpacity);
          googleTrackData.add(new google.maps.Data.Feature({
            geometry:new google.maps.Data.Point(new google.maps.LatLng(ll.lat,ll.lng)),
            properties:{kind:'point',radius:opts.radius||4,fillColor:opts.fillColor||opts.color||'#2563a8',fillOpacity:fillOpacity,strokeColor:opts.color||'#ffffff',strokeOpacity:strokeOpacity,strokeWeight:opts.weight||1}
          }));
          if(typeof layer.setStyle==='function')layer.setStyle({opacity:0,fillOpacity:0});
        }`;

    const newBlock = `        if(layer instanceof L.CircleMarker){
          var __mancardoTrackPointMinZoom=${TRACK_POINT_MIN_ZOOM};
          var showTrackPoint=map.getZoom()>=__mancardoTrackPointMinZoom;
          var ll=layer.getLatLng();
          var opts=layer.options||{};
          var strokeOpacity=opts.opacity==null?1:Number(opts.opacity);
          var fillOpacity=opts.fillOpacity==null?1:Number(opts.fillOpacity);
          if(showTrackPoint){
            googleTrackData.add(new google.maps.Data.Feature({
              geometry:new google.maps.Data.Point(new google.maps.LatLng(ll.lat,ll.lng)),
              properties:{kind:'point',radius:opts.radius||4,fillColor:opts.fillColor||opts.color||'#2563a8',fillOpacity:fillOpacity,strokeColor:opts.color||'#ffffff',strokeOpacity:strokeOpacity,strokeWeight:opts.weight||1}
            }));
          }
          if(typeof layer.setStyle==='function')layer.setStyle({opacity:0,fillOpacity:0});
          var el=typeof layer.getElement==='function'?layer.getElement():null;
          if(el)el.style.pointerEvents=showTrackPoint?'':'none';
        }`;

    const oldEvents = `    map.on('move zoom resize moveend zoomend',queueSync);`;
    const newEvents = `    map.on('move zoom resize moveend zoomend',queueSync);\n    map.on('zoomend',syncGoogleTrackVisuals);`;

    if(html.includes(oldBlock)&&html.includes(oldEvents)){
      html=html.replace(oldBlock,newBlock);
      html=html.replace(oldEvents,newEvents);
    }
  }

  if(!html.includes('installMancardoTrackClickFlash')){
    const close=html.lastIndexOf('})();');
    if(close!==-1)html=html.slice(0,close)+TRACK_CLICK_FLASH_FEATURE+'\n'+html.slice(close);
  }
  return html;
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=suppressZoomedOutTrackPoints(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
