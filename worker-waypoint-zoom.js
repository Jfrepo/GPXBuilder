import baseWorker from './worker-ui-optimizations-v2.js';

const TRACK_POINT_MIN_ZOOM = 14;

const TRACK_CLICK_FLASH_FEATURE = String.raw`
// ---------- Render-only track identification ----------
// This override belongs to the view, never to a track payload or sync queue.
var mancardoTrackFlash=null;
function mancardoTrackRenderVisible(item){
  if(!item)return false;
  if(mancardoTrackFlash&&String(item.id)===mancardoTrackFlash.id)return mancardoTrackFlash.visible;
  return item.visible!==false;
}
(function installMancardoTrackClickFlash(){
  if(window.__mancardoTrackClickFlashInstalled)return;
  window.__mancardoTrackClickFlashInstalled=true;

  var startTimer=null,flashTimer=null,generation=0;
  function findLibraryItem(id){
    if(!Array.isArray(state.library))return null;
    return state.library.find(function(item){return String(item&&item.id)===String(id);})||null;
  }
  function clearFlash(){
    generation++;
    clearTimeout(startTimer);clearTimeout(flashTimer);
    startTimer=null;flashTimer=null;
    if(!mancardoTrackFlash)return;
    mancardoTrackFlash=null;
    if(typeof render==='function')render();
  }
  function flashTrack(id,token){
    if(token!==generation)return;
    startTimer=null;
    var item=findLibraryItem(id);
    if(!item||typeof render!=='function')return;
    var flash={id:String(id),visible:item.visible===false};
    mancardoTrackFlash=flash;
    render();
    flashTimer=setTimeout(function(){
      if(token!==generation||mancardoTrackFlash!==flash)return;
      mancardoTrackFlash=null;flashTimer=null;
      render();
    },750);
  }
  function isShowControl(target){
    return !!(target&&target.closest&&target.closest('#trackList .track-show,#selectAllTracks'));
  }
  // Mouse, keyboard and change-driven Show controls cancel even the delayed
  // selection callback before the normal durable visibility handler runs.
  document.addEventListener('pointerdown',function(ev){if(isShowControl(ev.target))clearFlash();},true);
  document.addEventListener('change',function(ev){if(isShowControl(ev.target))clearFlash();},true);
  document.addEventListener('click',function(ev){
    var target=ev.target;
    if(isShowControl(target)){clearFlash();return;}
    if(!target||!target.closest)return;
    var card=target.closest('#trackList .track-item');
    if(!card)return;
    if(target.closest('button,input,textarea,select,.track-menu,.track-palette,.track-note,.track-note-wrap'))return;
    var id=card.getAttribute('data-track-id');
    if(!id)return;
    clearFlash();
    var token=generation;
    // Let the existing row handler select and zoom without changing its data.
    startTimer=setTimeout(function(){flashTrack(id,token);},30);
  },true);
  document.addEventListener('visibilitychange',function(){if(document.visibilityState!=='visible')clearFlash();});
})();
`;

export function repairTrackIdentification(html){
  // Non-editor maintenance pages have no selection/rendering surface to patch.
  if(!html.includes('// ---------- boot ----------')&&!html.includes('function renderLibrary(){'))return html;
  if(html.includes('// ---------- Render-only track identification ----------'))return html;
  const replacements=[
    ['if(item.visible===false||item.id===state.currentId||(state.current&&item.id===state.current.id))return;',
      'if(!mancardoTrackRenderVisible(item)||item.id===state.currentId||(state.current&&item.id===state.current.id))return;'],
    ['if(state.current && state.current.visible!==false){','if(state.current && mancardoTrackRenderVisible(state.current)){'],
    ['if(!item||item.visible===false||!Polyline3DElement||!map3d)return;',
      'if(!item||!mancardoTrackRenderVisible(item)||!Polyline3DElement||!map3d)return;'],
    ['if(item.visible==null)item.visible=true;',
      '// Missing/null visibility displays as visible without changing saved data.']
  ];
  for(const [before,after] of replacements){
    if(html.split(before).length!==2)throw new Error('Track identification render anchor mismatch');
    html=html.replace(before,after);
  }
  const close=html.lastIndexOf('})();');
  if(close<0||html.includes('installMancardoTrackClickFlash'))throw new Error('Track identification installation anchor mismatch');
  return html.slice(0,close)+TRACK_CLICK_FLASH_FEATURE+'\n'+html.slice(close);
}

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
          var pointFeature=new google.maps.Data.Feature({
              geometry:new google.maps.Data.Point(new google.maps.LatLng(ll.lat,ll.lng)),
              properties:{kind:'point',radius:opts.radius||4,fillColor:opts.fillColor||opts.color||'#2563a8',fillOpacity:fillOpacity,strokeColor:opts.color||'#ffffff',strokeOpacity:strokeOpacity,strokeWeight:opts.weight||1}
          });
          googleTrackPoints.push({layer:layer,feature:pointFeature});
          if(showTrackPoint)googleTrackData.add(pointFeature);
          if(typeof layer.setStyle==='function')layer.setStyle({opacity:0,fillOpacity:0});
          var el=typeof layer.getElement==='function'?layer.getElement():null;
          if(el)el.style.pointerEvents=showTrackPoint?'':'none';
        }`;

    const oldEvents = `    map.on('move zoom resize moveend zoomend',queueSync);`;
    const newEvents = `    map.on('move zoom resize moveend zoomend',queueSync);
    var __mancardoTrackPointsVisible=map.getZoom()>=${TRACK_POINT_MIN_ZOOM};
    map.on('zoomend',function(){
      var nextVisible=map.getZoom()>=${TRACK_POINT_MIN_ZOOM};
      if(nextVisible===__mancardoTrackPointsVisible)return;
      __mancardoTrackPointsVisible=nextVisible;
      // Retain line features and Leaflet interaction geometry. Only toggle the
      // sampled Google point features and their Leaflet hit targets.
      googleTrackPoints.forEach(function(point){
        if(nextVisible)googleTrackData.add(point.feature);else googleTrackData.remove(point.feature);
        var el=typeof point.layer.getElement==='function'?point.layer.getElement():null;
        if(el)el.style.pointerEvents=nextVisible?'':'none';
      });
    });`;

    if(html.includes(oldBlock)&&html.includes(oldEvents)){
      html=html.replace('function clearGoogleTrackData(){','var googleTrackPoints=[];\n    function clearGoogleTrackData(){\n      googleTrackPoints=[];');
      html=html.replace(oldBlock,newBlock);
      html=html.replace(oldEvents,newEvents);
    }
  }

  return repairTrackIdentification(html);
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