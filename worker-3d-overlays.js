import baseWorker from './worker-3d-preview.js';

const MAP_3D_OVERLAY_CSS = String.raw`
<style id="mancardo-3d-overlay-styles">
#mancardo3dTools{position:absolute;left:.75rem;top:.75rem;z-index:790;display:none;flex-direction:column;gap:.35rem;max-width:260px;background:rgba(255,255,255,.94);color:#222;border:1px solid rgba(0,0,0,.18);border-radius:5px;padding:.45rem;box-shadow:0 2px 8px rgba(0,0,0,.22);font:600 .72rem 'Source Sans 3',sans-serif}
#mancardo3dTools.on{display:flex}
#mancardo3dTools .row{display:flex;gap:.3rem;align-items:center;flex-wrap:wrap}
#mancardo3dTools button,#mancardo3dTools select{border:1px solid #b7bec4;background:#fff;color:#222;border-radius:4px;min-height:30px;padding:.25rem .48rem;font:700 .7rem 'Source Sans 3',sans-serif}
#mancardo3dTools button.on{background:#1f6f6c;color:#fff;border-color:#1f6f6c}
#mancardo3dTools button.radar.on{background:#2563a8;border-color:#2563a8}
#mancardo3dTools button.fuel.on{background:#b91c1c;border-color:#b91c1c}
#mancardo3dOverlayStatus{font-size:.64rem;font-weight:600;line-height:1.2;color:#53606a;max-width:235px}
@media(max-width:700px){#mancardo3dTools{top:3.15rem;left:.45rem;max-width:220px}#mancardo3dTools button,#mancardo3dTools select{min-height:28px;font-size:.66rem}}
</style>`;

const MAP_3D_OVERLAY_FEATURE = String.raw`
// ---------- 3D contours, BOM rain and fuel ----------
(function installMancardo3DOverlays(){
  if(!mapWrap||!els)return;

  var tools=document.createElement('div');
  tools.id='mancardo3dTools';
  tools.innerHTML='<div class="row">'+
    '<button type="button" id="mancardo3dContoursBtn">Contours</button>'+
    '<button type="button" id="mancardo3dRadarBtn" class="radar">Rain radar</button>'+
    '<button type="button" id="mancardo3dFuelBtn" class="fuel">Fuel</button>'+
    '</div><div class="row"><label for="mancardo3dRadarMode">Radar:</label><select id="mancardo3dRadarMode">'+
    '<option value="observed">Observed</option><option value="forecast">Forecast</option><option value="chance">Chance</option></select></div>'+
    '<div id="mancardo3dOverlayStatus">3D overlays off</div>';
  mapWrap.appendChild(tools);

  var contourBtn=tools.querySelector('#mancardo3dContoursBtn');
  var radarBtn=tools.querySelector('#mancardo3dRadarBtn');
  var fuelBtn=tools.querySelector('#mancardo3dFuelBtn');
  var radarMode=tools.querySelector('#mancardo3dRadarMode');
  var statusEl=tools.querySelector('#mancardo3dOverlayStatus');
  if(els.radarMode)radarMode.value=els.radarMode.value||'observed';

  var map3d=null,lib3d=null;
  var contoursOn=false,radar3dOn=false,fuel3dOn=false;
  var contourEls=[],radarEls=[],fuelEls=[];
  var refreshTimer=null,refreshSeq=0;
  var lastContourKey='',lastFuelKey='',lastRadarKey='';

  function removeAll(arr){while(arr.length){var el=arr.pop();try{el.remove();}catch(e){}}}
  function setStatus(msg){statusEl.textContent=msg;}
  function is3DActive(){map3d=document.getElementById('mancardo3dMap');return !!(map3d&&map3d.classList.contains('on'));}

  function centerRange(){
    if(!map3d)return null;
    var c=map3d.center||{};
    var lat=Number(c.lat),lng=Number(c.lng),range=Number(map3d.range)||50000;
    if(!isFinite(lat)||!isFinite(lng))return null;
    return {lat:lat,lng:lng,range:range};
  }

  function viewBox(mult){
    var cr=centerRange();if(!cr)return null;
    var radius=Math.max(1500,Math.min(350000,cr.range*(mult||1.35)));
    var dLat=radius/111320;
    var cos=Math.max(.25,Math.cos(cr.lat*Math.PI/180));
    var dLng=radius/(111320*cos);
    return {south:cr.lat-dLat,north:cr.lat+dLat,west:cr.lng-dLng,east:cr.lng+dLng,range:cr.range,lat:cr.lat,lng:cr.lng};
  }

  function bboxKey(b,scale){
    scale=scale||100;
    return [Math.round(b.lat*scale)/scale,Math.round(b.lng*scale)/scale,Math.round(b.range/5000)*5000].join('|');
  }

  async function ensureLib(){
    if(lib3d)return lib3d;
    lib3d=await google.maps.importLibrary('maps3d');
    return lib3d;
  }

  async function refreshContours(seq){
    if(!contoursOn||!is3DActive())return;
    var b=viewBox(1.25);if(!b)return;
    if(b.range>140000){removeAll(contourEls);setStatus('Contours: zoom closer for NSW contour lines');return;}
    var south=Math.max(-37.7,b.south),north=Math.min(-28.0,b.north),west=Math.max(140.8,b.west),east=Math.min(154.0,b.east);
    if(south>=north||west>=east){removeAll(contourEls);setStatus('Contours: NSW coverage only');return;}
    var key=bboxKey(b,200);if(key===lastContourKey)return;lastContourKey=key;
    setStatus('Loading 3D contours…');
    var lib=await ensureLib();
    var Polyline3DElement=lib.Polyline3DElement,Marker3DElement=lib.Marker3DElement;
    var env=[west,south,east,north].join(',');
    var url=contourQuery+'?where=1%3D1&geometry='+encodeURIComponent(env)+
      '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects'+
      '&outFields=elevation%2Cclasssubtype&returnGeometry=true&outSR=4326&f=geojson&resultRecordCount=1600';
    try{
      var r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);
      var data=await r.json();if(seq!==refreshSeq||!contoursOn||!is3DActive())return;
      removeAll(contourEls);
      var features=data.features||[],labels=0,lines=0;
      features.forEach(function(ft){
        var elev=Number(ft.properties&&ft.properties.elevation);if(!isFinite(elev)||!ft.geometry)return;
        var parts=ft.geometry.type==='LineString'?[ft.geometry.coordinates]:(ft.geometry.type==='MultiLineString'?ft.geometry.coordinates:[]);
        parts.forEach(function(part){
          if(!part||part.length<2)return;
          var path=part.map(function(xy){return {lat:Number(xy[1]),lng:Number(xy[0]),altitude:4};}).filter(function(p){return isFinite(p.lat)&&isFinite(p.lng);});
          if(path.length<2)return;
          var major=Math.abs(Math.round(elev))%100===0;
          var line=new Polyline3DElement({path:path,strokeColor:major?'#5b3518':'#8b623c',strokeWidth:major?2.4:1.25,altitudeMode:'RELATIVE_TO_GROUND',drawsOccludedSegments:true,zIndex:4});
          map3d.append(line);contourEls.push(line);lines++;
          if(major&&labels<22&&path.length>6){
            var mid=path[Math.floor(path.length/2)];
            var marker=new Marker3DElement({position:{lat:mid.lat,lng:mid.lng,altitude:10},altitudeMode:'RELATIVE_TO_GROUND',label:Math.round(elev)+' m',sizePreserved:true,zIndex:5});
            map3d.append(marker);contourEls.push(marker);labels++;
          }
        });
      });
      setStatus('3D contours: '+lines+' lines · NSW Spatial Services');
    }catch(err){console.warn('3D contour load failed',err);setStatus('3D contours failed to load');}
  }

  async function refreshFuel(seq){
    if(!fuel3dOn||!is3DActive())return;
    var b=viewBox(1.15);if(!b)return;
    var south=Math.max(-44,b.south),north=Math.min(-9,b.north),west=Math.max(112,b.west),east=Math.min(154,b.east);
    if(south>=north||west>=east){removeAll(fuelEls);setStatus('Fuel: Australian coverage only');return;}
    if(b.range>180000){removeAll(fuelEls);setStatus('Fuel: zoom closer to load stations');return;}
    var key=bboxKey(b,120);if(key===lastFuelKey)return;lastFuelKey=key;
    setStatus('Loading 3D fuel locations…');
    try{
      var q='[out:json][timeout:25];nwr["amenity"="fuel"]('+[south,west,north,east].map(function(n){return n.toFixed(5);}).join(',')+');out center tags;';
      var data=await fetchFuelOverpass(q,0);if(seq!==refreshSeq||!fuel3dOn||!is3DActive())return;
      var lib=await ensureLib();var Marker3DElement=lib.Marker3DElement;
      removeAll(fuelEls);var seen={},count=0;
      (data.elements||[]).forEach(function(e){
        if(count>=180)return;
        var t=e.tags||{};if(!fuelIsActive(t))return;
        var lat=e.lat!=null?e.lat:(e.center&&e.center.lat),lng=e.lon!=null?e.lon:(e.center&&e.center.lon);if(lat==null||lng==null)return;
        var k=(+lat).toFixed(5)+','+(+lng).toFixed(5);if(seen[k])return;seen[k]=1;
        var name=t.name||t.brand||t.operator||'Fuel';
        var marker=new Marker3DElement({position:{lat:+lat,lng:+lng,altitude:12},altitudeMode:'RELATIVE_TO_GROUND',label:name,sizePreserved:true,drawsWhenOccluded:false,zIndex:8});
        marker.title=name;
        map3d.append(marker);fuelEls.push(marker);count++;
      });
      setStatus('3D fuel: '+count+' active mapped stations · OpenStreetMap');
    }catch(err){console.warn('3D fuel query failed',err);setStatus('3D fuel lookup temporarily unavailable');}
  }

  function tileX(lng,z){return (lng+180)/360*Math.pow(2,z);}
  function tileY(lat,z){var rad=lat*Math.PI/180;return (1-Math.asinh(Math.tan(rad))/Math.PI)/2*Math.pow(2,z);}
  function tileLon(x,z){return x/Math.pow(2,z)*360-180;}
  function tileLat(y,z){var n=Math.PI-2*Math.PI*y/Math.pow(2,z);return 180/Math.PI*Math.atan(Math.sinh(n));}

  async function bitmapFromBlob(blob){
    if(window.createImageBitmap)return createImageBitmap(blob);
    return new Promise(function(resolve,reject){var u=URL.createObjectURL(blob),img=new Image();img.onload=function(){URL.revokeObjectURL(u);resolve(img);};img.onerror=function(){URL.revokeObjectURL(u);reject(new Error('Image decode failed'));};img.src=u;});
  }

  async function radarTilePolys(cfg,time,gx,gy,z,Polygon3DElement,seq){
    var u=bomTileUrl(cfg,{x:gx,y:gy,z:z},time);if(!u)return [];
    var r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error('Radar tile HTTP '+r.status);
    var img=await bitmapFromBlob(await r.blob());if(seq!==refreshSeq)return [];
    var S=12,canvas=document.createElement('canvas');canvas.width=S;canvas.height=S;var ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.clearRect(0,0,S,S);ctx.drawImage(img,0,0,S,S);if(img.close)try{img.close();}catch(e){}
    var d=ctx.getImageData(0,0,S,S).data,out=[];
    for(var y=0;y<S;y++)for(var x=0;x<S;x++){
      var i=(y*S+x)*4,a=d[i+3];if(a<28)continue;
      var rr=d[i],gg=d[i+1],bb=d[i+2];
      if(rr>245&&gg>245&&bb>245)continue;
      var west=tileLon(gx+x/S,z),east=tileLon(gx+(x+1)/S,z),north=tileLat(gy+y/S,z),south=tileLat(gy+(y+1)/S,z);
      var alpha=Math.max(.18,Math.min(.72,(a/255)*.68));
      var poly=new Polygon3DElement({path:[{lat:north,lng:west,altitude:28},{lat:north,lng:east,altitude:28},{lat:south,lng:east,altitude:28},{lat:south,lng:west,altitude:28}],fillColor:'rgba('+rr+','+gg+','+bb+','+alpha.toFixed(2)+')',strokeColor:'rgba('+rr+','+gg+','+bb+',0)',strokeWidth:0,altitudeMode:'RELATIVE_TO_GROUND',drawsOccludedSegments:true,zIndex:6});
      out.push(poly);
    }
    return out;
  }

  async function refreshRadar(seq){
    if(!radar3dOn||!is3DActive())return;
    var b=viewBox(1.35);if(!b)return;
    var cfg=BOM_WEATHER[radarMode.value]||BOM_WEATHER.observed;
    var key=bboxKey(b,80)+'|'+radarMode.value;
    if(key===lastRadarKey)return;lastRadarKey=key;
    setStatus('Loading 3D BOM rain…');
    try{
      var frames=await getBomFrames(cfg);if(seq!==refreshSeq||!radar3dOn||!is3DActive())return;
      if(!frames.length){removeAll(radarEls);setStatus('BOM radar: no current frame');return;}
      var time=cfg.mode==='past'?frames[frames.length-1]:frames[0];
      var z=b.range<45000?8:(b.range<110000?7:6);
      var x0=Math.floor(tileX(b.west,z)),x1=Math.floor(tileX(b.east,z)),y0=Math.floor(tileY(b.north,z)),y1=Math.floor(tileY(b.south,z));
      var cx=Math.floor(tileX(b.lng,z)),cy=Math.floor(tileY(b.lat,z));
      x0=Math.max(x0,cx-1);x1=Math.min(x1,cx+1);y0=Math.max(y0,cy-1);y1=Math.min(y1,cy+1);
      var lib=await ensureLib();var Polygon3DElement=lib.Polygon3DElement;
      var jobs=[];for(var yy=y0;yy<=y1;yy++)for(var xx=x0;xx<=x1;xx++)jobs.push(radarTilePolys(cfg,time,xx,yy,z,Polygon3DElement,seq));
      var groups=await Promise.all(jobs);if(seq!==refreshSeq||!radar3dOn||!is3DActive())return;
      removeAll(radarEls);var count=0;
      groups.forEach(function(group){group.forEach(function(poly){if(count>=900)return;map3d.append(poly);radarEls.push(poly);count++;});});
      setStatus('3D '+cfg.name+': '+count+' rain cells · BOM');
    }catch(err){console.warn('3D radar load failed',err);removeAll(radarEls);setStatus('3D rain radar could not be rendered');}
  }

  function scheduleRefresh(){
    if(!is3DActive())return;
    clearTimeout(refreshTimer);refreshTimer=setTimeout(function(){
      var seq=++refreshSeq;
      if(contoursOn)refreshContours(seq);
      if(fuel3dOn)refreshFuel(seq);
      if(radar3dOn)refreshRadar(seq);
    },550);
  }

  function attach3DEvents(){
    map3d=document.getElementById('mancardo3dMap');if(!map3d||map3d.__mancardoOverlayEvents)return;
    map3d.__mancardoOverlayEvents=true;
    ['gmp-centerchange','gmp-rangechange','gmp-tiltchange','gmp-headingchange'].forEach(function(name){map3d.addEventListener(name,scheduleRefresh);});
  }

  function syncActiveState(){
    var on=is3DActive();tools.classList.toggle('on',on);
    if(on){attach3DEvents();scheduleRefresh();}
    else{refreshSeq++;removeAll(contourEls);removeAll(radarEls);removeAll(fuelEls);lastContourKey='';lastRadarKey='';lastFuelKey='';}
  }

  contourBtn.onclick=function(){contoursOn=!contoursOn;contourBtn.classList.toggle('on',contoursOn);if(!contoursOn){removeAll(contourEls);lastContourKey='';}scheduleRefresh();};
  radarBtn.onclick=function(){radar3dOn=!radar3dOn;radarBtn.classList.toggle('on',radar3dOn);if(!radar3dOn){removeAll(radarEls);lastRadarKey='';}scheduleRefresh();};
  fuelBtn.onclick=function(){fuel3dOn=!fuel3dOn;fuelBtn.classList.toggle('on',fuel3dOn);if(!fuel3dOn){removeAll(fuelEls);lastFuelKey='';}scheduleRefresh();};
  radarMode.onchange=function(){lastRadarKey='';if(radar3dOn)scheduleRefresh();};

  var observer=new MutationObserver(syncActiveState);
  var watch=setInterval(function(){var m=document.getElementById('mancardo3dMap');if(!m)return;clearInterval(watch);map3d=m;observer.observe(map3d,{attributes:true,attributeFilter:['class']});syncActiveState();},250);
})();
`;

function inject3DOverlays(html){
  if(html.includes('installMancardo3DOverlays'))return html;
  html=html.replace('</head>',MAP_3D_OVERLAY_CSS+'\n</head>');
  const close=html.lastIndexOf('})();');
  if(close===-1)return html;
  return html.slice(0,close)+MAP_3D_OVERLAY_FEATURE+'\n'+html.slice(close);
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=inject3DOverlays(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
