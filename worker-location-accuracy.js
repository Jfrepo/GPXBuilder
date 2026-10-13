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
  var pendingFix=null;
  var pendingSince=0;
  var pendingTimer=null;
  var GOOD_ACCURACY=60;
  var ACCEPTABLE_ACCURACY=150;
  var FIRST_FIX_WAIT_MS=12000;

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
  function setButton(text,error){
    try{
      var b=locationControls&&locationControls._loc;
      if(!b)return;
      b.title=text;b.setAttribute('aria-label',text);
      b.classList.add('on');b.classList.toggle('error',!!error);
    }catch(e){}
  }
  function setLocationStatus(c,accepted){
    var a=finite(c&&c.accuracy)?c.accuracy:Infinity;
    var approximate=a>ACCEPTABLE_ACCURACY;
    var text=approximate
      ? 'Approximate location '+fmtAccuracy(a)+' — enable Precise Location in browser/device settings'
      : 'Current location '+fmtAccuracy(a);
    setButton(text,approximate);
    try{
      var b=locationControls&&locationControls._loc;if(!b)return;
      b.dataset.locationAccuracy=finite(a)?String(Math.round(a)):'';
      if(!accepted)b.dataset.locationIgnored='1';else delete b.dataset.locationIgnored;
    }catch(e){}
  }
  function applyFix(pos,recenter){
    if(!pos||!pos.coords)return false;
    var c=pos.coords;
    if(!finite(c.latitude)||!finite(c.longitude))return false;
    var ll=L.latLng(c.latitude,c.longitude);
    var a=finite(c.accuracy)&&c.accuracy>0?c.accuracy:Infinity;

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

    setLocationStatus(c,true);
    if(recenter)map.setView(ll,Math.max(map.getZoom(),a<=GOOD_ACCURACY?17:15));
    else map.panTo(ll,{animate:true});
    if(headingUp&&lastHeading!=null)setMapBearing(lastHeading);
    return true;
  }
  function considerFix(pos,recenter){
    if(!pos||!pos.coords)return false;
    var c=pos.coords;
    if(!finite(c.latitude)||!finite(c.longitude))return false;
    var ll=L.latLng(c.latitude,c.longitude);
    var a=finite(c.accuracy)&&c.accuracy>0?c.accuracy:Infinity;
    var now=Date.now();

    if(lastUserLatLng){
      var jump=distanceMeters(lastUserLatLng,ll);
      if(a<=GOOD_ACCURACY)return applyFix(pos,recenter);
      if(bestAccuracy<=GOOD_ACCURACY && a>Math.max(200,bestAccuracy*3) && jump>Math.max(300,a)){
        setLocationStatus(c,false);return false;
      }
      if(a<=ACCEPTABLE_ACCURACY || now-bestAt>30000 || a<bestAccuracy*0.75)return applyFix(pos,recenter);
      setLocationStatus(c,false);return false;
    }

    // Do not immediately centre on the browser's first coarse Wi‑Fi/IP fix.
    if(a<=ACCEPTABLE_ACCURACY)return applyFix(pos,recenter);
    if(!pendingFix || a<(pendingFix.coords.accuracy||Infinity))pendingFix=pos;
    if(!pendingSince)pendingSince=now;
    setButton('Improving GPS lock… '+fmtAccuracy(a),true);
    if(!pendingTimer){
      pendingTimer=setTimeout(function(){
        pendingTimer=null;
        if(!lastUserLatLng&&pendingFix){
          applyFix(pendingFix,true);
          setLocationStatus(pendingFix.coords,true);
        }
        pendingFix=null;pendingSince=0;
      },FIRST_FIX_WAIT_MS);
    }
    return false;
  }

  window.updateUserLocation=function(pos){considerFix(pos,false);};

  function startFreshLock(){
    if(freshRequestRunning||!navigator.geolocation)return;
    freshRequestRunning=true;
    setButton('Getting precise GPS location…',false);
    var started=Date.now(),best=null,tempWatch=null,done=false;
    function finish(useBest){
      if(done)return;done=true;freshRequestRunning=false;
      if(tempWatch!=null)try{navigator.geolocation.clearWatch(tempWatch);}catch(e){}
      if(useBest&&best){applyFix(best,true);setLocationStatus(best.coords,true);}
      else if(lastUserLatLng)map.setView(lastUserLatLng,Math.max(map.getZoom(),15));
    }
    tempWatch=navigator.geolocation.watchPosition(function(pos){
      var a=finite(pos.coords.accuracy)&&pos.coords.accuracy>0?pos.coords.accuracy:Infinity;
      if(!best||a<(best.coords.accuracy||Infinity))best=pos;
      setButton('Getting precise GPS location… '+fmtAccuracy(a),a>ACCEPTABLE_ACCURACY);
      if(a<=GOOD_ACCURACY){finish(true);return;}
      if(a<=ACCEPTABLE_ACCURACY && Date.now()-started>2500){finish(true);return;}
      if(Date.now()-started>=FIRST_FIX_WAIT_MS)finish(true);
    },function(err){
      freshRequestRunning=false;
      if(tempWatch!=null)try{navigator.geolocation.clearWatch(tempWatch);}catch(e){}
      if(best)applyFix(best,true);
      else setButton(err&&err.code===1?'Location permission blocked':'Unable to obtain precise location',true);
    },{enableHighAccuracy:true,maximumAge:0,timeout:20000});
    setTimeout(function(){if(!done)finish(!!best);},FIRST_FIX_WAIT_MS+1000);
  }

  window.startLocationFollow=function(recenter){
    if(!navigator.geolocation){setButton('Location unavailable',true);return;}
    var opts={enableHighAccuracy:true,maximumAge:0,timeout:20000};
    if(locationWatchId==null){
      locationWatchId=navigator.geolocation.watchPosition(window.updateUserLocation,function(err){
        setButton(err&&err.code===1?'Location permission blocked':'Unable to get current location',true);
      },opts);
    }
    if(recenter)startFreshLock();
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
