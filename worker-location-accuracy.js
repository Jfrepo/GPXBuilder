import baseWorker from './worker-mobile-library-icon.js';

const LOCATION_PATCH=String.raw`
<script id="mancardo-location-accuracy-fix">
(function(){
  if(window.__mancardoLocationAccuracyFixInstalled)return;
  window.__mancardoLocationAccuracyFixInstalled=true;

  var accuracyCircle=null;
  var bestAccuracy=Infinity;
  var bestAt=0;
  var activeRefineWatch=null;
  var refineTimer=null;
  var GOOD_ACCURACY=60;
  var ACCEPTABLE_ACCURACY=150;

  function finite(n){return typeof n==='number'&&isFinite(n);}
  function fmtAccuracy(a){
    if(!finite(a))return 'unknown accuracy';
    if(a<1000)return '±'+Math.max(1,Math.round(a))+' m';
    return '±'+(a/1000).toFixed(a<10000?1:0)+' km';
  }
  function setButton(text,error){
    try{
      var b=locationControls&&locationControls._loc;
      if(!b)return;
      b.title=text;
      b.setAttribute('aria-label',text);
      b.classList.add('on');
      b.classList.toggle('error',!!error);
    }catch(e){}
  }
  function locationError(err){
    if(err&&err.code===1)return 'Location permission blocked — allow location access in Safari settings';
    if(err&&err.code===2)return 'Location unavailable — check Location Services';
    if(err&&err.code===3)return 'Location timed out — tap again or move to an open area';
    return 'Unable to get current location';
  }
  function updateStatus(c){
    var a=finite(c&&c.accuracy)&&c.accuracy>0?c.accuracy:Infinity;
    if(a>ACCEPTABLE_ACCURACY)setButton('Approximate location '+fmtAccuracy(a)+' — enable Precise Location',true);
    else setButton('Current location '+fmtAccuracy(a),false);
    try{
      var b=locationControls&&locationControls._loc;
      if(b)b.dataset.locationAccuracy=finite(a)?String(Math.round(a)):'';
    }catch(e){}
  }
  function renderPosition(pos,recenter){
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

    updateStatus(c);
    if(recenter){
      var targetZoom=a<=GOOD_ACCURACY?17:(a<=ACCEPTABLE_ACCURACY?16:(a<=500?15:13));
      map.setView(ll,Math.max(map.getZoom(),targetZoom));
    }else map.panTo(ll,{animate:true});
    if(headingUp&&lastHeading!=null)setMapBearing(lastHeading);
    return true;
  }
  function shouldUse(pos){
    if(!pos||!pos.coords)return false;
    var a=finite(pos.coords.accuracy)&&pos.coords.accuracy>0?pos.coords.accuracy:Infinity;
    if(!lastUserLatLng)return true;
    if(a<=GOOD_ACCURACY)return true;
    if(a<bestAccuracy*0.8)return true;
    return Date.now()-bestAt>30000;
  }
  function stopRefine(){
    if(activeRefineWatch!=null){try{navigator.geolocation.clearWatch(activeRefineWatch);}catch(e){}activeRefineWatch=null;}
    if(refineTimer){clearTimeout(refineTimer);refineTimer=null;}
  }
  function startRefine(recenter){
    if(!navigator.geolocation)return;
    stopRefine();
    setButton('Improving GPS accuracy…',false);
    var best=null;
    activeRefineWatch=navigator.geolocation.watchPosition(function(pos){
      var a=finite(pos.coords.accuracy)&&pos.coords.accuracy>0?pos.coords.accuracy:Infinity;
      if(!best||a<(best.coords.accuracy||Infinity))best=pos;
      if(shouldUse(pos))renderPosition(pos,recenter);
      if(a<=GOOD_ACCURACY)stopRefine();
    },function(err){
      if(err&&err.code===1){setButton(locationError(err),true);stopRefine();}
      else if(!lastUserLatLng)setButton(locationError(err),true);
    },{enableHighAccuracy:true,maximumAge:5000,timeout:30000});
    refineTimer=setTimeout(function(){
      if(best)renderPosition(best,recenter);
      stopRefine();
    },15000);
  }

  window.updateUserLocation=function(pos){
    if(shouldUse(pos))renderPosition(pos,false);
    else if(pos&&pos.coords)updateStatus(pos.coords);
  };

  function requestFromUserTap(){
    if(!navigator.geolocation){setButton('Location unavailable',true);return;}
    setButton('Getting current location…',false);
    navigator.geolocation.getCurrentPosition(function(pos){
      renderPosition(pos,true);
      startRefine(true);
    },function(err){
      if(err&&err.code===1){setButton(locationError(err),true);return;}
      setButton('Trying GPS location…',false);
      startRefine(true);
    },{enableHighAccuracy:false,maximumAge:0,timeout:8000});
  }

  window.startLocationFollow=function(recenter){
    if(!navigator.geolocation){setButton('Location unavailable',true);return;}
    if(recenter)requestFromUserTap();
    if(locationWatchId==null){
      locationWatchId=navigator.geolocation.watchPosition(window.updateUserLocation,function(err){
        if(err&&err.code===1)setButton(locationError(err),true);
        else if(!lastUserLatLng)setButton(locationError(err),true);
      },{enableHighAccuracy:true,maximumAge:5000,timeout:30000});
    }
  };

  // Safari is strict about geolocation prompts being triggered directly from a user gesture.
  // Bind the actual location button in capture phase so the geolocation request runs in the tap itself.
  function bindDirectTap(){
    try{
      var b=locationControls&&locationControls._loc;
      if(!b||b.dataset.safariLocationBound==='1')return false;
      b.dataset.safariLocationBound='1';
      b.addEventListener('click',function(ev){
        ev.preventDefault();
        ev.stopImmediatePropagation();
        requestFromUserTap();
        if(locationWatchId==null){
          locationWatchId=navigator.geolocation.watchPosition(window.updateUserLocation,function(err){
            if(err&&err.code===1)setButton(locationError(err),true);
            else if(!lastUserLatLng)setButton(locationError(err),true);
          },{enableHighAccuracy:true,maximumAge:5000,timeout:30000});
        }
      },true);
      return true;
    }catch(e){return false;}
  }
  if(!bindDirectTap()){
    var tries=0,bindTimer=setInterval(function(){
      tries++;
      if(bindDirectTap()||tries>80)clearInterval(bindTimer);
    },250);
  }
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
