import baseWorker from './worker-google-loader.js';

const MAP_3D_CSS = String.raw`
<style id="mancardo-3d-preview-styles">
#mancardo3dMap{position:absolute;inset:0;z-index:2;width:100%;height:100%;display:none;background:#d9e0e5}
#mancardo3dMap.on{display:block}
#mancardo3dHint{position:absolute;left:50%;top:.8rem;transform:translateX(-50%);z-index:760;display:none;background:rgba(20,27,31,.88);color:#fff;border-radius:4px;padding:.35rem .6rem;font-size:.7rem;font-weight:700;pointer-events:none;white-space:nowrap}
#mancardo3dHint.on{display:block}
@media(max-width:700px){#mancardo3dHint{top:3.2rem;max-width:76vw;white-space:normal;text-align:center}}
</style>`;

const MAP_3D_FEATURE = String.raw`
// ---------- Google Photorealistic 3D preview ----------
(function installMancardo3DPreview(){
  var mapWrap=document.getElementById('mapWrap');
  var leafletDiv=document.getElementById('mapDiv');
  var google2d=document.getElementById('googleBaseMap');
  if(!mapWrap||!leafletDiv||!map||!els||!els.layerStreetsBtn)return;

  var toggle=els.layerStreetsBtn.parentElement;
  if(!toggle||document.getElementById('mancardo3dBtn'))return;

  var btn3d=document.createElement('button');
  btn3d.type='button';
  btn3d.id='mancardo3dBtn';
  btn3d.textContent='3D';
  btn3d.title='Google photorealistic 3D terrain';
  toggle.appendChild(btn3d);

  var hint=document.createElement('div');
  hint.id='mancardo3dHint';
  hint.textContent='3D view · drag to move · wheel to zoom · use the 3D controls to tilt and rotate';
  mapWrap.appendChild(hint);

  var map3d=null;
  var Polyline3DElement=null;
  var active=false;
  var loading=false;
  var track3d=[];

  function approxRange(){
    var c=map.getCenter();
    var z=map.getZoom();
    var metresPerPixel=156543.03392*Math.cos(c.lat*Math.PI/180)/Math.pow(2,z);
    var h=Math.max(300,mapWrap.clientHeight||700);
    return Math.max(250,Math.min(5000000,metresPerPixel*h*1.25));
  }

  function clear3DTracks(){
    track3d.forEach(function(line){try{line.remove();}catch(e){}});
    track3d=[];
  }

  function addTrack3D(item,isCurrent){
    if(!item||item.visible===false||!Polyline3DElement||!map3d)return;
    var colour=defaultTrackColour(item);
    (item.segments||[]).forEach(function(seg){
      if(!seg||seg.length<2)return;
      var path=seg.map(function(p){return {lat:p.lat,lng:p.lon};});
      var line=new Polyline3DElement({
        path:path,
        strokeColor:colour,
        strokeWidth:isCurrent?8:6,
        outerColor:'#ffffff',
        outerWidth:.24,
        altitudeMode:'CLAMP_TO_GROUND',
        drawsOccludedSegments:true,
        geodesic:false
      });
      map3d.append(line);
      track3d.push(line);
    });
  }

  function sync3DTracks(){
    if(!active||!map3d||!Polyline3DElement)return;
    clear3DTracks();
    state.library.forEach(function(item){
      if(item.id===state.currentId||(state.current&&item.id===state.current.id))return;
      addTrack3D(item,false);
    });
    if(state.current)addTrack3D(state.current,true);
  }

  function set2DVisible(visible){
    google2d=document.getElementById('googleBaseMap')||google2d;
    if(google2d)google2d.style.display=visible?'':'none';
    leafletDiv.style.display=visible?'':'none';
  }

  function markButton(){
    Array.prototype.forEach.call(toggle.querySelectorAll('button'),function(b){b.classList.toggle('on',b===btn3d&&active);});
  }

  async function ensure3D(){
    if(map3d)return true;
    if(loading)return false;
    loading=true;
    var status=document.createElement('div');
    status.className='google-preview-status';
    status.textContent='Loading 3D terrain…';
    mapWrap.appendChild(status);
    try{
      var lib=await google.maps.importLibrary('maps3d');
      var Map3DElement=lib.Map3DElement;
      Polyline3DElement=lib.Polyline3DElement;
      var c=map.getCenter();
      map3d=new Map3DElement({
        center:{lat:c.lat,lng:c.lng,altitude:0},
        range:approxRange(),
        tilt:65,
        heading:0,
        mode:'HYBRID',
        gestureHandling:'GREEDY'
      });
      map3d.id='mancardo3dMap';
      mapWrap.insertBefore(map3d,leafletDiv);
      status.remove();
      loading=false;
      return true;
    }catch(err){
      console.error('ManCardo 3D failed to initialise',err);
      status.textContent='3D terrain could not load. Check Maps JavaScript API access and browser WebGL support.';
      loading=false;
      return false;
    }
  }

  async function enter3D(){
    if(active)return;
    var ok=await ensure3D();
    if(!ok)return;
    var c=map.getCenter();
    try{
      map3d.center={lat:c.lat,lng:c.lng,altitude:0};
      map3d.range=approxRange();
      map3d.tilt=65;
      map3d.heading=0;
      map3d.mode='HYBRID';
    }catch(e){}
    active=true;
    set2DVisible(false);
    map3d.classList.add('on');
    hint.classList.add('on');
    sync3DTracks();
    markButton();
    try{localStorage.setItem('mancardo_map_view_v1','3d');}catch(e){}
  }

  function exit3D(){
    if(!active)return;
    active=false;
    hint.classList.remove('on');
    if(map3d)map3d.classList.remove('on');
    set2DVisible(true);
    clear3DTracks();
    setTimeout(function(){try{map.invalidateSize(false);}catch(e){}},0);
  }

  btn3d.onclick=function(){enter3D();};

  // Existing 2D buttons keep their normal behavior, but first leave the 3D view.
  Array.prototype.forEach.call(toggle.querySelectorAll('button'),function(b){
    if(b===btn3d)return;
    var original=b.onclick;
    b.onclick=function(){
      exit3D();
      if(original)return original.apply(this,arguments);
    };
  });

  if(typeof render==='function'){
    var baseRenderFor3D=render;
    render=function(){
      var result=baseRenderFor3D.apply(this,arguments);
      if(active)sync3DTracks();
      return result;
    };
  }
})();
`;

function inject3D(html){
  if(html.includes('installMancardo3DPreview'))return html;
  html=html.replace('</head>',MAP_3D_CSS+'\n</head>');
  const close=html.lastIndexOf('})();');
  if(close===-1)return html;
  return html.slice(0,close)+MAP_3D_FEATURE+'\n'+html.slice(close);
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=inject3D(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
