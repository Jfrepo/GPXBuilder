import baseWorker from './worker-mobile-layout-v3.js';

const MOBILE_LAYOUT_V4_CSS = String.raw`
<style id="mancardo-mobile-layout-v4-styles">
@media (max-width:767px){
  /* Keep the mobile library drawer below the fixed ManCardo header so its action buttons stay visible. */
  .drawer{top:48px!important;bottom:0!important;height:auto!important;max-height:calc(100dvh - 48px)!important}
  .drawer-backdrop{top:48px!important}

  /* Simplify the mobile drawer heading and use track terminology. */
  .drawer-head>.label-caps{display:none!important}
  #newRouteBtn{font-size:0!important}
  #newRouteBtn::after{content:'+ Track';font-size:.85rem!important;line-height:1!important}

  /* Track row: pin List to the left edge so it never shifts with track data. */
  .stats-row{position:relative!important;grid-template-columns:minmax(0,1fr) 68px 58px!important;gap:.12rem .3rem!important;padding-left:52px!important}
  .stats-row .stat:nth-child(1){grid-column:1!important;grid-row:1!important}
  .stats-row .stat:nth-child(2){grid-column:2!important;grid-row:1!important}
  .stats-row .stat:nth-child(5){grid-column:3!important;grid-row:1!important}
  .stats-row #pointsToggle{position:absolute!important;left:0!important;top:50%!important;transform:translateY(-50%)!important;grid-column:auto!important;grid-row:auto!important;justify-self:auto!important;min-width:42px!important;max-width:46px!important;width:46px!important;font-size:0!important;padding:.12rem .28rem!important;margin:0!important}
  .stats-row #pointsToggle::after{content:'List';font-size:.62rem!important;line-height:1!important;font-weight:700}
}
</style>`;

const MOBILE_LAYOUT_V4_FEATURE = String.raw`
// ---------- mobile layout v4: location marker locked to Google renderer ----------
(function installMancardoMobileLayoutV4(){
  if(window.__mancardoMobileLayoutV4Installed)return;
  window.__mancardoMobileLayoutV4Installed=true;

  var newTrackBtn=document.getElementById('newRouteBtn');
  if(newTrackBtn){newTrackBtn.setAttribute('aria-label','New track');newTrackBtn.title='New track';}

  var googleLocationMarker=null;
  var pendingLocation=null;

  function hideLeafletLocationMarkers(){
    try{if(userLocationMarker&&typeof userLocationMarker.setOpacity==='function')userLocationMarker.setOpacity(0);}catch(e){}
    try{if(userHeadingMarker&&typeof userHeadingMarker.setOpacity==='function')userHeadingMarker.setOpacity(0);}catch(e){}
  }

  function syncGoogleLocation(ll){
    pendingLocation=ll||pendingLocation;
    if(!pendingLocation)return;
    var gmap=window.__mancardoGoogleMap;
    if(!gmap||!window.google||!google.maps||typeof google.maps.Marker!=='function')return;
    var pos={lat:Number(pendingLocation.lat),lng:Number(pendingLocation.lng)};
    if(!isFinite(pos.lat)||!isFinite(pos.lng))return;
    if(!googleLocationMarker){
      googleLocationMarker=new google.maps.Marker({
        map:gmap,
        position:pos,
        clickable:false,
        optimized:true,
        zIndex:10000,
        title:'Current location',
        icon:{
          path:google.maps.SymbolPath.CIRCLE,
          scale:8,
          fillColor:'#2563a8',
          fillOpacity:1,
          strokeColor:'#ffffff',
          strokeOpacity:1,
          strokeWeight:3
        }
      });
    }else{
      googleLocationMarker.setMap(gmap);
      googleLocationMarker.setPosition(pos);
    }
    hideLeafletLocationMarkers();
  }

  if(typeof updateUserLocation==='function'){
    var baseUpdateUserLocation=updateUserLocation;
    updateUserLocation=function(pos){
      var result=baseUpdateUserLocation.apply(this,arguments);
      try{
        var c=pos&&pos.coords;
        if(c)syncGoogleLocation({lat:c.latitude,lng:c.longitude});
      }catch(e){}
      hideLeafletLocationMarkers();
      return result;
    };
  }

  /* Google map is created asynchronously after the geolocation controls, so retry briefly. */
  var tries=0;
  var timer=setInterval(function(){
    tries++;
    if(lastUserLatLng)syncGoogleLocation(lastUserLatLng);
    if(window.__mancardoGoogleMap&&googleLocationMarker){clearInterval(timer);return;}
    if(tries>120)clearInterval(timer);
  },250);

  /* Once the location dot exists in Google Maps it shares the basemap renderer and remains
     spatially locked through wheel/pinch zoom and pan. Keep the Leaflet copy invisible. */
  if(typeof map!=='undefined'&&map){
    map.on('zoom zoomend move moveend',function(){hideLeafletLocationMarkers();});
  }
})();
`;

function injectMobileLayoutV4(html){
  if(html.includes('installMancardoMobileLayoutV4'))return html;
  html=html.replace('</head>',MOBILE_LAYOUT_V4_CSS+'\n</head>');
  const close=html.lastIndexOf('})();');
  if(close===-1)return html;
  return html.slice(0,close)+MOBILE_LAYOUT_V4_FEATURE+'\n'+html.slice(close);
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=injectMobileLayoutV4(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
