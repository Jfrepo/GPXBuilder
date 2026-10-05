import baseWorker from './worker-mobile-map-controls.js';

const WAYPOINT_CSS = String.raw`
<style id="mancardo-saved-waypoint-styles">
.mancardo-waypoint-item .mancardo-waypoint-dot{
  width:14px;height:14px;flex:none;border:1px solid rgba(0,0,0,.32);border-radius:50%;background:var(--danger);box-shadow:inset 0 0 0 3px #fff;
}
.mancardo-waypoint-item .ti-meta{padding-left:2.05rem!important}
#mancardoWaypointOverlay .mancardo-waypoint-coords{margin:-.2rem 0 .7rem;color:var(--text-muted);font:600 .72rem 'IBM Plex Mono',monospace}
#mancardoWaypointOverlay .mancardo-waypoint-tip{margin:.15rem 0 .7rem;color:var(--text-muted);font-size:.75rem;line-height:1.3}
</style>`;

const WAYPOINT_FEATURE = String.raw`
// ---------- saved waypoints: press and hold map ----------
(function installMancardoSavedWaypoints(){
  if(window.__mancardoSavedWaypointsInstalled)return;
  window.__mancardoSavedWaypointsInstalled=true;

  var KEY='mancardo_saved_waypoints_v1';
  var waypoints=[];
  var googleMarkers={};
  var waypointMenuId=null;
  var pendingWaypoint=null;
  var holdTimer=null;
  var holdStart=null;
  var suppressClickUntil=0;
  var LONG_PRESS_MS=650;
  var MOVE_CANCEL_PX=12;

  function loadWaypoints(){
    try{
      var raw=localStorage.getItem(KEY);
      var parsed=raw?JSON.parse(raw):[];
      waypoints=Array.isArray(parsed)?parsed.filter(function(w){return w&&isFinite(+w.lat)&&isFinite(+w.lon);}):[];
    }catch(e){waypoints=[];}
  }
  function saveWaypoints(){
    try{localStorage.setItem(KEY,JSON.stringify(waypoints));}catch(e){console.warn('Could not save waypoints locally',e);}
  }
  function waypointById(id){return waypoints.find(function(w){return w.id===id;});}
  function makeId(){return 'wp_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);}

  function ensureDialog(){
    var overlay=document.getElementById('mancardoWaypointOverlay');
    if(overlay)return overlay;
    overlay=document.createElement('div');
    overlay.className='overlay hidden';
    overlay.id='mancardoWaypointOverlay';
    overlay.innerHTML='<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="mancardoWaypointTitle">'+
      '<h3 id="mancardoWaypointTitle">Save Waypoint</h3>'+
      '<input type="text" id="mancardoWaypointName" placeholder="Waypoint name" autocomplete="off">'+
      '<div class="mancardo-waypoint-coords" id="mancardoWaypointCoords"></div>'+
      '<div class="mancardo-waypoint-tip">This waypoint will be saved on this device and shown in My Library.</div>'+
      '<div class="btnrow"><button class="icon-btn" id="mancardoWaypointCancel" type="button">Cancel</button><button class="icon-btn primary" id="mancardoWaypointSave" type="button">Save Waypoint</button></div>'+
      '</div>';
    document.body.appendChild(overlay);
    var input=document.getElementById('mancardoWaypointName');
    var cancel=document.getElementById('mancardoWaypointCancel');
    var save=document.getElementById('mancardoWaypointSave');
    function close(){pendingWaypoint=null;overlay.classList.add('hidden');}
    cancel.onclick=close;
    overlay.addEventListener('pointerdown',function(ev){if(ev.target===overlay)close();});
    input.addEventListener('keydown',function(ev){
      if(ev.key==='Enter'){ev.preventDefault();save.click();}
      else if(ev.key==='Escape'){ev.preventDefault();close();}
    });
    save.onclick=function(){
      var name=input.value.trim();
      if(!name||!pendingWaypoint)return;
      var now=new Date().toISOString();
      waypoints.unshift({id:makeId(),name:name,lat:+pendingWaypoint.lat.toFixed(6),lon:+pendingWaypoint.lng.toFixed(6),visible:true,createdAt:now,updatedAt:now});
      saveWaypoints();
      close();
      renderWaypointMarkers();
      renderLibrary();
      try{setLibraryView('my');}catch(e){}
      var status=document.getElementById('mancardoRenderStatus');
      if(status){status.textContent='Waypoint saved';status.classList.add('on');setTimeout(function(){status.classList.remove('on');},900);}
    };
    return overlay;
  }

  function openWaypointDialog(latlng){
    if(!latlng||state.mode!=='view'||state.sharedPreview)return;
    pendingWaypoint={lat:+latlng.lat,lng:+latlng.lng};
    var overlay=ensureDialog();
    var input=document.getElementById('mancardoWaypointName');
    var coords=document.getElementById('mancardoWaypointCoords');
    input.value='';
    coords.textContent=pendingWaypoint.lat.toFixed(6)+', '+pendingWaypoint.lng.toFixed(6);
    overlay.classList.remove('hidden');
    setTimeout(function(){try{input.focus();}catch(e){}},30);
    try{if(navigator.vibrate)navigator.vibrate(25);}catch(e){}
  }

  function clearHold(){
    if(holdTimer){clearTimeout(holdTimer);holdTimer=null;}
    holdStart=null;
  }
  function blockedTarget(target){
    if(!target||!target.closest)return false;
    return !!target.closest('button,a,input,textarea,select,.leaflet-control,.layer-toggle,.overlay-panel,#desktopToolbarHost,#mancardoMobileToolbarNav,#mancardoMapSearchPanel,#mancardoMapSearchBtn,#mancardoSearchLocationCard');
  }
  function pointToLatLng(clientX,clientY){
    var node=map.getContainer();
    var r=node.getBoundingClientRect();
    return map.containerPointToLatLng(L.point(clientX-r.left,clientY-r.top));
  }
  function beginHold(ev){
    if(state.mode!=='view'||state.sharedPreview||blockedTarget(ev.target))return;
    if(ev.pointerType==='mouse'&&ev.button!==0)return;
    clearHold();
    var latlng=pointToLatLng(ev.clientX,ev.clientY);
    holdStart={x:ev.clientX,y:ev.clientY,pointerId:ev.pointerId,latlng:latlng};
    holdTimer=setTimeout(function(){
      holdTimer=null;
      if(!holdStart)return;
      suppressClickUntil=Date.now()+900;
      var ll=holdStart.latlng;
      holdStart=null;
      openWaypointDialog(ll);
    },LONG_PRESS_MS);
  }
  function moveHold(ev){
    if(!holdStart||ev.pointerId!==holdStart.pointerId)return;
    var dx=ev.clientX-holdStart.x,dy=ev.clientY-holdStart.y;
    if(Math.sqrt(dx*dx+dy*dy)>MOVE_CANCEL_PX)clearHold();
  }

  var mapNode=map.getContainer();
  mapNode.addEventListener('pointerdown',beginHold,true);
  mapNode.addEventListener('pointermove',moveHold,true);
  mapNode.addEventListener('pointerup',clearHold,true);
  mapNode.addEventListener('pointercancel',clearHold,true);
  mapNode.addEventListener('pointerleave',function(ev){if(ev.pointerType==='mouse')clearHold();},true);
  mapNode.addEventListener('contextmenu',function(ev){if(holdStart||Date.now()<suppressClickUntil)ev.preventDefault();},true);
  mapNode.addEventListener('click',function(ev){
    if(Date.now()<suppressClickUntil){ev.preventDefault();ev.stopPropagation();if(ev.stopImmediatePropagation)ev.stopImmediatePropagation();}
  },true);

  function clearGoogleMarkers(){
    Object.keys(googleMarkers).forEach(function(id){
      try{googleMarkers[id].setMap(null);}catch(e){}
      delete googleMarkers[id];
    });
  }
  function markerClick(id){
    var w=waypointById(id);if(!w)return;
    map.setView([w.lat,w.lon],Math.max(map.getZoom(),15));
    try{setLibraryView('my');}catch(e){}
    var row=document.querySelector('.mancardo-waypoint-item[data-waypoint-id="'+id+'"]');
    if(row)row.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function renderWaypointMarkers(){
    var gmap=window.__mancardoGoogleMap;
    if(!gmap||!window.google||!google.maps||typeof google.maps.Marker!=='function')return false;
    clearGoogleMarkers();
    waypoints.forEach(function(w){
      if(w.visible===false)return;
      var marker=new google.maps.Marker({map:gmap,position:{lat:+w.lat,lng:+w.lon},title:w.name||'Waypoint',zIndex:12000});
      marker.addListener('click',function(){markerClick(w.id);});
      googleMarkers[w.id]=marker;
    });
    return true;
  }

  function renameWaypoint(id){
    var w=waypointById(id);if(!w)return;
    var name=window.prompt('Rename waypoint',w.name||'Waypoint');
    if(!name||!name.trim())return;
    w.name=name.trim();w.updatedAt=new Date().toISOString();saveWaypoints();waypointMenuId=null;renderWaypointMarkers();renderLibrary();
  }
  function deleteWaypoint(id){
    var w=waypointById(id);if(!w)return;
    if(!window.confirm('Delete "'+(w.name||'this waypoint')+'" from My Library?'))return;
    waypoints=waypoints.filter(function(x){return x.id!==id;});saveWaypoints();waypointMenuId=null;renderWaypointMarkers();renderLibrary();
  }
  function setWaypointVisible(id,visible){
    var w=waypointById(id);if(!w)return;
    w.visible=visible;w.updatedAt=new Date().toISOString();saveWaypoints();renderWaypointMarkers();
  }

  function buildWaypointCard(w){
    var d=document.createElement('div');
    d.className='track-item mancardo-waypoint-item';
    d.setAttribute('data-waypoint-id',w.id);
    d.title='Waypoint · click to focus on map';
    var row=document.createElement('div');row.className='track-row';
    var show=document.createElement('input');show.type='checkbox';show.className='track-show';show.checked=w.visible!==false;show.title='Show waypoint on map';
    show.addEventListener('click',function(ev){ev.stopPropagation();setWaypointVisible(w.id,show.checked);});
    var dot=document.createElement('span');dot.className='mancardo-waypoint-dot';dot.setAttribute('aria-hidden','true');
    var name=document.createElement('span');name.className='ti-name';name.textContent=w.name||'Waypoint';
    var more=document.createElement('button');more.type='button';more.className='track-more';more.innerHTML='&#8942;';more.title='Waypoint options';
    more.addEventListener('click',function(ev){ev.stopPropagation();waypointMenuId=waypointMenuId===w.id?null:w.id;renderLibrary();});
    row.appendChild(show);row.appendChild(dot);row.appendChild(name);row.appendChild(more);d.appendChild(row);
    var meta=document.createElement('div');meta.className='ti-meta';meta.textContent='Waypoint · '+(+w.lat).toFixed(5)+', '+(+w.lon).toFixed(5);d.appendChild(meta);
    if(waypointMenuId===w.id){
      var menu=document.createElement('div');menu.className='track-menu';
      [['Rename',function(){renameWaypoint(w.id)}],['Delete',function(){deleteWaypoint(w.id)}]].forEach(function(x){
        var b=document.createElement('button');b.type='button';b.textContent=x[0];if(x[0]==='Delete')b.className='danger';
        b.onclick=function(ev){ev.stopPropagation();x[1]();};menu.appendChild(b);
      });
      d.appendChild(menu);
    }
    d.addEventListener('click',function(){markerClick(w.id);});
    return d;
  }
  function renderWaypointLibrary(){
    var wrap=els.trackList;if(!wrap)return;
    Array.prototype.forEach.call(wrap.querySelectorAll('.mancardo-waypoint-item'),function(n){n.remove();});
    if(!waypoints.length){
      if(!state.library.length){var empty=wrap.querySelector('.empty-note');if(empty)empty.textContent='No tracks or waypoints yet. Import a GPX file, start a track, or press and hold the map to save a waypoint.';}
      return;
    }
    if(!state.library.length){var empty=wrap.querySelector('.empty-note');if(empty)empty.remove();}
    var frag=document.createDocumentFragment();
    waypoints.slice().sort(function(a,b){return String(b.updatedAt||'').localeCompare(String(a.updatedAt||''));}).forEach(function(w){frag.appendChild(buildWaypointCard(w));});
    wrap.insertBefore(frag,wrap.firstChild);
  }

  var baseRenderLibraryForWaypoints=renderLibrary;
  renderLibrary=function(){
    var result=baseRenderLibraryForWaypoints.apply(this,arguments);
    renderWaypointLibrary();
    return result;
  };

  document.addEventListener('pointerdown',function(ev){
    if(!waypointMenuId)return;
    var card=ev.target&&ev.target.closest?ev.target.closest('.mancardo-waypoint-item'):null;
    if(card&&card.getAttribute('data-waypoint-id')===waypointMenuId)return;
    waypointMenuId=null;renderLibrary();
  },true);

  loadWaypoints();
  ensureDialog();
  renderWaypointLibrary();
  if(!renderWaypointMarkers()){
    var tries=0,timer=setInterval(function(){tries++;if(renderWaypointMarkers()||tries>80)clearInterval(timer);},250);
  }
})();
`;

function injectSavedWaypoints(html){
  if(html.includes('installMancardoSavedWaypoints'))return html;
  html=html.replace('</head>',WAYPOINT_CSS+'\n</head>');
  const marker='// ---------- boot ----------';
  if(html.includes(marker))html=html.replace(marker,WAYPOINT_FEATURE+'\n'+marker);
  return html;
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=injectSavedWaypoints(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
