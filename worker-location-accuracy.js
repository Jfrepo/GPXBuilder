import baseWorker from './worker-mobile-library-icon.js';

const LOCATION_PATCH=String.raw`
<script id="mancardo-location-accuracy-fix">
(function(){
  if(window.__mancardoLocationAccuracyFixInstalled)return;
  window.__mancardoLocationAccuracyFixInstalled=true;

  var bestAccuracy=Infinity;
  var bestAt=0;
  var accuracyCircle=null;
  var freshRequestRunning=false;

  function finite(n){return typeof n==='number'&&isFinite(n);}
  function fmtAccuracy(a){
    if(!finite(a))return 'unknown accuracy';
    if(a<1000)return '±'+Math.max(1,Math.round(a))+' m';
    return '±'+(a/1000).toFixed(a<10000?1:0)+' km';
  }
  function distanceMeters(a,b){
    if(!a||!b)return 0;
    try{return a.distanceTo(b);}catch(e){return 0;}
  }
  function setLocationStatus(c,accepted){
    try{
      var b=locationControls&&locationControls._loc;
      if(!b)return;
      var a=finite(c.accuracy)?c.accuracy:Infinity;
      b.classList.add('on');
      b.classList.toggle('error',a>500);
      if(a>500){
        b.title='Approximate location '+fmtAccuracy(a)+' — enable Precise Location in your browser/device settings';
        b.setAttribute('aria-label','Approximate location '+fmtAccuracy(a)+'. Enable Precise Location in browser or device settings.');
      }else{
        b.classList.remove('error');
        b.title='Current location '+fmtAccuracy(a);
        b.setAttribute('aria-label','Current location '+fmtAccuracy(a));
      }
      b.dataset.locationAccuracy=finite(a)?String(Math.round(a)):'';
      if(!accepted)b.dataset.locationIgnored='1';else delete b.dataset.locationIgnored;
    }catch(e){}
  }

  function shouldAccept(c,ll){
    var a=finite(c.accuracy)&&c.accuracy>0?c.accuracy:Infinity;
    var now=Date.now();
    if(!lastUserLatLng)return true;
    if(a<=100)return true;
    if(now-bestAt>30000)return true;
    if(a<bestAccuracy*0.8)return true;
    var jump=distanceMeters(lastUserLatLng,ll);
    // Reject a substantially worse, low-confidence fix that would jump the map.
    if(bestAccuracy<=100 && a>Math.max(250,bestAccuracy*3) && jump>Math.max(500,a*1.5))return false;
    return true;
  }

  window.updateUserLocation=function(pos){
    if(!pos||!pos.coords)return;
    var c=pos.coords;
    if(!finite(c.latitude)||!finite(c.longitude))return;
    var ll=L.latLng(c.latitude,c.longitude);
    var a=finite(c.accuracy)&&c.accuracy>0?c.accuracy:Infinity;
    var accepted=shouldAccept(c,ll);
    setLocationStatus(c,accepted);
    if(!accepted)return;

    lastUserLatLng=ll;
    if(a<bestAccuracy||Date.now()-bestAt>30000){bestAccuracy=a;bestAt=Date.now();}
    if(c.heading!=null&&isFinite(c.heading)&&c.speed!=null&&c.speed>0.5)lastHeading=c.heading;

    if(!userLocationMarker)userLocationMarker=L.marker(ll,{icon:L.divIcon({className:'',html:'<div class="user-location-dot"></div>',iconSize:[16,16],iconAnchor:[8,8]}),zIndexOffset:1000}).addTo(map);
    else userLocationMarker.setLatLng(ll);

    if(!userHeadingMarker)userHeadingMarker=L.marker(ll,{icon:L.divIcon({className:'',html:'<div class="user-heading-arrow"></div>',iconSize:[14,20],iconAnchor:[7,10]}),zIndexOffset:999}).addTo(map);
    else userHeadingMarker.setLatLng(ll);

    var arrow=userHeadingMarker.getElement()&&userHeadingMarker.getElement().querySelector('.user-heading-arrow');
    if(arrow&&lastHeading!=null)arrow.style.transform='rotate('+lastHeading+'deg)';

    try{
      if(finite(a)){
        if(!accuracyCircle)accuracyCircle=L.circle(ll,{radius:a,interactive:false,weight:1,opacity:.45,fillOpacity:.06}).addTo(map);
        else{accuracyCircle.setLatLng(ll);accuracyCircle.setRadius(a);}
      }
    }catch(e){}

    if(locationControls&&locationControls._loc){locationControls._loc.classList.add('on');}
    map.panTo(ll,{animate:true});
    if(headingUp&&lastHeading!=null)setMapBearing(lastHeading);
  };

  window.startLocationFollow=function(recenter){
    if(!navigator.geolocation){
      if(locationControls&&locationControls._loc){locationControls._loc.title='Location unavailable';locationControls._loc.setAttribute('aria-label','Location unavailable');locationControls._loc.classList.add('error');}
      return;
    }
    var opts={enableHighAccuracy:true,maximumAge:0,timeout:20000};
    if(locationWatchId==null){
      locationWatchId=navigator.geolocation.watchPosition(window.updateUserLocation,function(err){
        if(locationControls&&locationControls._loc){
          locationControls._loc.title=err&&err.code===1?'Location permission blocked':'Unable to get a fresh location';
          locationControls._loc.setAttribute('aria-label',locationControls._loc.title);
          locationControls._loc.classList.add('error');
        }
      },opts);
    }
    // A tap on My Location must request a fresh GPS fix, not simply reuse a cached fix.
    if(recenter&&!freshRequestRunning){
      freshRequestRunning=true;
      if(locationControls&&locationControls._loc){locationControls._loc.title='Getting precise location…';locationControls._loc.setAttribute('aria-label','Getting precise location');}
      navigator.geolocation.getCurrentPosition(function(pos){
        freshRequestRunning=false;
        window.updateUserLocation(pos);
        if(lastUserLatLng)map.setView(lastUserLatLng,Math.max(map.getZoom(),16));
      },function(err){
        freshRequestRunning=false;
        if(lastUserLatLng)map.setView(lastUserLatLng,Math.max(map.getZoom(),15));
        if(locationControls&&locationControls._loc){
          locationControls._loc.title=err&&err.code===1?'Location permission blocked':'Could not get a fresh precise fix';
          locationControls._loc.setAttribute('aria-label',locationControls._loc.title);
          locationControls._loc.classList.add('error');
        }
      },opts);
    }else if(recenter&&lastUserLatLng){
      map.setView(lastUserLatLng,Math.max(map.getZoom(),15));
    }
  };
})();
</script>`;

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=await response.text();
    if(!html.includes('mancardo-location-accuracy-fix')){
      const i=html.toLowerCase().lastIndexOf('</body>');
      html=i>=0?html.slice(0,i)+LOCATION_PATCH+'\n'+html.slice(i):html+LOCATION_PATCH;
    }
    const headers=new Headers(response.headers);
    headers.delete('content-length');headers.delete('etag');
    headers.set('cache-control','no-store, max-age=0');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
