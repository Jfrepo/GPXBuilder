import baseWorker from './worker-mobile-map-controls.js';

const WAYPOINT_CSS = String.raw`
<style id="mancardo-saved-waypoint-styles">
.mancardo-waypoint-item .mancardo-waypoint-dot{
  width:20px;height:20px;flex:none;display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(0,0,0,.25);border-radius:50%;background:#fff;font-size:13px;line-height:1;
}
.mancardo-waypoint-item .ti-meta{padding-left:2.45rem!important}
#mancardoWaypointOverlay .mancardo-waypoint-coords{margin:-.2rem 0 .7rem;color:var(--text-muted);font:600 .72rem 'IBM Plex Mono',monospace}
#mancardoWaypointOverlay .mancardo-waypoint-tip{margin:.15rem 0 .55rem;color:var(--text-muted);font-size:.75rem;line-height:1.3}
.mancardo-waypoint-picker-label{margin:.15rem 0 .35rem;font:700 .74rem 'Source Sans 3',sans-serif;color:var(--text)}
.mancardo-waypoint-icon-picker{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.38rem;margin:0 0 .75rem}
.mancardo-waypoint-icon-choice{min-height:48px;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:4px 2px;font:600 .62rem/1.05 'Source Sans 3',sans-serif;cursor:pointer}
.mancardo-waypoint-icon-choice .glyph{font-size:20px;line-height:1}
.mancardo-waypoint-icon-choice.on{border:2px solid var(--accent);background:var(--surface-2);padding:3px 1px}
.mancardo-waypoint-icon-menu{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.3rem;padding:.38rem 0 0 2rem}
.mancardo-waypoint-icon-menu button{min-height:38px;border:1px solid var(--border);border-radius:4px;background:var(--surface);font-size:18px;line-height:1;cursor:pointer}
.mancardo-waypoint-icon-menu button.on{border:2px solid var(--accent);background:var(--surface-2)}
@media(max-width:480px){.mancardo-waypoint-icon-picker{grid-template-columns:repeat(4,minmax(0,1fr));gap:.28rem}.mancardo-waypoint-icon-choice{min-height:44px}.mancardo-waypoint-icon-choice .glyph{font-size:18px}}
</style>`;

const WAYPOINT_FEATURE = String.raw`
// ---------- saved waypoints: press and hold map ----------
(function installMancardoSavedWaypoints(){
  if(window.__mancardoSavedWaypointsInstalled)return;
  window.__mancardoSavedWaypointsInstalled=true;

  var KEY='mancardo_saved_waypoints_v1';
  var ICON_OPTIONS=[
    {id:'pin',label:'Pin',glyph:'📍'},
    {id:'camp',label:'Camp',glyph:'⛺'},
    {id:'hotel',label:'Hotel',glyph:'🏨'},
    {id:'fuel',label:'Fuel',glyph:'⛽'},
    {id:'food',label:'Food',glyph:'🍴'},
    {id:'trail',label:'Trail',glyph:'🥾'},
    {id:'parking',label:'Parking',glyph:'🅿️'},
    {id:'hazard',label:'Hazard',glyph:'⚠️'}
  ];
  var waypoints=[];
  var googleMarkers={};
  var waypointMenuId=null;
  var waypointIconMenuId=null;
  var pendingWaypoint=null;
  var pendingIcon='pin';
  var holdTimer=null;
  var holdStart=null;
  var suppressClickUntil=0;
  var LONG_PRESS_MS=650;
  var MOVE_CANCEL_PX=12;

  function iconOption(id){return ICON_OPTIONS.find(function(x){return x.id===id;})||ICON_OPTIONS[0];}
  function normaliseIcon(id){return iconOption(id).id;}
  function loadWaypoints(){
    try{
      var raw=localStorage.getItem(KEY);
      var parsed=raw?JSON.parse(raw):[];
      waypoints=Array.isArray(parsed)?parsed.filter(function(w){return w&&isFinite(+w.lat)&&isFinite(+w.lon);}).map(function(w){w.icon=normaliseIcon(w.icon||'pin');return w;}):[];
    }catch(e){waypoints=[];}
  }
  function saveWaypoints(){
    try{localStorage.setItem(KEY,JSON.stringify(waypoints));}catch(e){console.warn('Could not save waypoints locally',e);}
  }
  function waypointById(id){return waypoints.find(function(w){return w.id===id;});}
  function makeId(){return 'wp_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);}

  function iconPickerHtml(){
    return '<div class="mancardo-waypoint-picker-label">Waypoint icon</div><div class="mancardo-waypoint-icon-picker" id="mancardoWaypointIconPicker">'+ICON_OPTIONS.map(function(o){return '<button type="button" class="mancardo-waypoint-icon-choice" data-waypoint-icon="'+o.id+'" title="'+o.label+'"><span class="glyph" aria-hidden="true">'+o.glyph+'</span><span>'+o.label+'</span></button>';}).join('')+'</div>';
  }
  function refreshDialogIconPicker(){
    var picker=document.getElementById('mancardoWaypointIconPicker');if(!picker)return;
    Array.prototype.forEach.call(picker.querySelectorAll('[data-waypoint-icon]'),function(btn){btn.classList.toggle('on',btn.getAttribute('data-waypoint-icon')===pendingIcon);});
  }

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
      iconPickerHtml()+
      '<div class="btnrow"><button class="icon-btn" id="mancardoWaypointCancel" type="button">Cancel</button><button class="icon-btn primary" id="mancardoWaypointSave" type="button">Save Waypoint</button></div>'+
      '</div>';
    document.body.appendChild(overlay);
    var input=document.getElementById('mancardoWaypointName');
    var cancel=document.getElementById('mancardoWaypointCancel');
    var save=document.getElementById('mancardoWaypointSave');
    var picker=document.getElementById('mancardoWaypointIconPicker');
    function close(){pendingWaypoint=null;overlay.classList.add('hidden');}
    cancel.onclick=close;
    overlay.addEventListener('pointerdown',function(ev){if(ev.target===overlay)close();});
    picker.addEventListener('click',function(ev){
      var btn=ev.target&&ev.target.closest?ev.target.closest('[data-waypoint-icon]'):null;if(!btn)return;
      pendingIcon=normaliseIcon(btn.getAttribute('data-waypoint-icon'));refreshDialogIconPicker();
    });
    input.addEventListener('keydown',function(ev){
      if(ev.key==='Enter'){ev.preventDefault();save.click();}
      else if(ev.key==='Escape'){ev.preventDefault();close();}
    });
    save.onclick=function(){
      var name=input.value.trim();
      if(!name||!pendingWaypoint)return;
      var now=new Date().toISOString();
      waypoints.unshift({id:makeId(),name:name,lat:+pendingWaypoint.lat.toFixed(6),lon:+pendingWaypoint.lng.toFixed(6),icon:normaliseIcon(pendingIcon),visible:true,createdAt:now,updatedAt:now});
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
    pendingIcon='pin';
    var overlay=ensureDialog();
    var input=document.getElementById('mancardoWaypointName');
    var coords=document.getElementById('mancardoWaypointCoords');
    input.value='';
    coords.textContent=pendingWaypoint.lat.toFixed(6)+', '+pendingWaypoint.lng.toFixed(6);
    refreshDialogIconPicker();
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
  function waypointSvg(kind){
    var symbol='';
    if(kind==='camp')symbol='<path d="M10 25l7-12 7 12z" fill="none" stroke="#fff" stroke-width="2.3" stroke-linejoin="round"/><path d="M17 13v12" stroke="#fff" stroke-width="2"/>';
    else if(kind==='hotel')symbol='<path d="M9 22h16v5H9z" fill="#fff"/><path d="M10 16h5v5h-5zm7 1h7v4h-7z" fill="#fff"/><path d="M9 14v13M25 16v11" stroke="#fff" stroke-width="2"/>';
    else if(kind==='fuel')symbol='<path d="M10 13h8v14h-8zM11 15h6v5h-6z" fill="#fff"/><path d="M18 17h3l2 3v7" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>';
    else if(kind==='food')symbol='<path d="M11 13v6m-2-6v4c0 2 4 2 4 0v-4m-2 6v8M21 13v14m0-14c-3 2-3 6 0 7" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>';
    else if(kind==='trail')symbol='<path d="M8 25l6-8 4 5 3-4 5 7z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/><path d="M18 12v6" stroke="#fff" stroke-width="2"/>';
    else if(kind==='parking')symbol='<path d="M12 27V13h6c4 0 6 2 6 5s-2 5-6 5h-4" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
    else if(kind==='hazard')symbol='<path d="M17 12l8 14H9z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/><path d="M17 17v4m0 3v1" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>';
    else symbol='<circle cx="17" cy="20" r="5" fill="#fff"/>';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42"><path d="M17 1C8.2 1 2 7.2 2 15.4 2 26.6 17 41 17 41s15-14.4 15-25.6C32 7.2 25.8 1 17 1z" fill="#c1442d" stroke="#fff" stroke-width="2"/>'+symbol+'</svg>';
  }
  function markerIcon(kind){
    var svg=waypointSvg(normaliseIcon(kind));
    return {url:'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg),scaledSize:new google.maps.Size(34,42),anchor:new google.maps.Point(17,42)};
  }
  function renderWaypointMarkers(){
    var gmap=window.__mancardoGoogleMap;
    if(!gmap||!window.google||!google.maps||typeof google.maps.Marker!=='function')return false;
    clearGoogleMarkers();
    waypoints.forEach(function(w){
      if(w.visible===false)return;
      var marker=new google.maps.Marker({map:gmap,position:{lat:+w.lat,lng:+w.lon},title:w.name||'Waypoint',icon:markerIcon(w.icon),zIndex:12000});
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
    waypoints=waypoints.filter(function(x){return x.id!==id;});saveWaypoints();waypointMenuId=null;waypointIconMenuId=null;renderWaypointMarkers();renderLibrary();
  }
  function setWaypointVisible(id,visible){
    var w=waypointById(id);if(!w)return;
    w.visible=visible;w.updatedAt=new Date().toISOString();saveWaypoints();renderWaypointMarkers();
  }
  function setWaypointIcon(id,icon){
    var w=waypointById(id);if(!w)return;
    w.icon=normaliseIcon(icon);w.updatedAt=new Date().toISOString();saveWaypoints();waypointIconMenuId=null;waypointMenuId=null;renderWaypointMarkers();renderLibrary();
  }

  function buildWaypointCard(w){
    var d=document.createElement('div');
    d.className='track-item mancardo-waypoint-item';
    d.setAttribute('data-waypoint-id',w.id);
    d.title='Waypoint · click to focus on map';
    var row=document.createElement('div');row.className='track-row';
    var show=document.createElement('input');show.type='checkbox';show.className='track-show';show.checked=w.visible!==false;show.title='Show waypoint on map';
    show.addEventListener('click',function(ev){ev.stopPropagation();setWaypointVisible(w.id,show.checked);});
    var opt=iconOption(w.icon);
    var dot=document.createElement('span');dot.className='mancardo-waypoint-dot';dot.setAttribute('aria-hidden','true');dot.textContent=opt.glyph;dot.title=opt.label;
    var name=document.createElement('span');name.className='ti-name';name.textContent=w.name||'Waypoint';
    var more=document.createElement('button');more.type='button';more.className='track-more';more.innerHTML='&#8942;';more.title='Waypoint options';
    more.addEventListener('click',function(ev){ev.stopPropagation();waypointMenuId=waypointMenuId===w.id?null:w.id;waypointIconMenuId=null;renderLibrary();});
    row.appendChild(show);row.appendChild(dot);row.appendChild(name);row.appendChild(more);d.appendChild(row);
    var meta=document.createElement('div');meta.className='ti-meta';meta.textContent=opt.label+' waypoint · '+(+w.lat).toFixed(5)+', '+(+w.lon).toFixed(5);d.appendChild(meta);
    if(waypointMenuId===w.id){
      var menu=document.createElement('div');menu.className='track-menu';
      [['Rename',function(){renameWaypoint(w.id)}],['Icon',function(){waypointIconMenuId=waypointIconMenuId===w.id?null:w.id;waypointMenuId=null;renderLibrary();}],['Delete',function(){deleteWaypoint(w.id)}]].forEach(function(x){
        var b=document.createElement('button');b.type='button';b.textContent=x[0];if(x[0]==='Delete')b.className='danger';
        b.onclick=function(ev){ev.stopPropagation();x[1]();};menu.appendChild(b);
      });
      d.appendChild(menu);
    }
    if(waypointIconMenuId===w.id){
      var im=document.createElement('div');im.className='mancardo-waypoint-icon-menu';
      ICON_OPTIONS.forEach(function(o){var b=document.createElement('button');b.type='button';b.textContent=o.glyph;b.title=o.label;b.className=normaliseIcon(w.icon)===o.id?'on':'';b.onclick=function(ev){ev.stopPropagation();setWaypointIcon(w.id,o.id);};im.appendChild(b);});
      d.appendChild(im);
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
    if(!waypointMenuId&&!waypointIconMenuId)return;
    var card=ev.target&&ev.target.closest?ev.target.closest('.mancardo-waypoint-item'):null;
    var id=card&&card.getAttribute('data-waypoint-id');
    if(id&&(id===waypointMenuId||id===waypointIconMenuId))return;
    waypointMenuId=null;waypointIconMenuId=null;renderLibrary();
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
