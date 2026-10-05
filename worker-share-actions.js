import baseWorker from './worker-waypoint-delete-selected.js';

const SHARE_ACTIONS_FEATURE = String.raw`
// ---------- share actions ----------
(function installMancardoShareActions(){
  if(window.__mancardoShareActionsInstalled)return;
  window.__mancardoShareActionsInstalled=true;

  var WAYPOINT_KEY='mancardo_saved_waypoints_v1';

  function readWaypoints(){
    try{
      var raw=localStorage.getItem(WAYPOINT_KEY);
      var parsed=raw?JSON.parse(raw):[];
      return Array.isArray(parsed)?parsed:[];
    }catch(e){return [];}
  }

  function writeWaypoints(items){
    try{localStorage.setItem(WAYPOINT_KEY,JSON.stringify(items));}catch(e){}
  }

  function escXml(value){
    return String(value==null?'':value)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  }

  function buildWaypointGpx(w){
    var name=(w.name||'Waypoint').trim()||'Waypoint';
    var lat=Number(w.lat),lon=Number(w.lon);
    var icon=(w.icon||'pin');
    return '<?xml version="1.0" encoding="UTF-8"?>\n'+
      '<gpx version="1.1" creator="ManCardo" xmlns="http://www.topografix.com/GPX/1/1">\n'+
      '  <metadata><name>'+escXml(name)+'</name><desc>ManCardo waypoint</desc></metadata>\n'+
      '  <wpt lat="'+lat.toFixed(6)+'" lon="'+lon.toFixed(6)+'"><name>'+escXml(name)+'</name><type>'+escXml(icon)+'</type></wpt>\n'+
      '  <trk><name>'+escXml(name)+'</name><extensions><mancardoWaypoint>true</mancardoWaypoint><mancardoIcon>'+escXml(icon)+'</mancardoIcon></extensions><trkseg>\n'+
      '    <trkpt lat="'+lat.toFixed(6)+'" lon="'+lon.toFixed(6)+'"></trkpt>\n'+
      '  </trkseg></trk>\n'+
      '</gpx>';
  }

  function shareWaypointToLibrary(id){
    var all=readWaypoints();
    var w=all.find(function(item){return item&&item.id===id;});
    if(!w)return;
    var lat=Number(w.lat),lon=Number(w.lon);
    if(!isFinite(lat)||!isFinite(lon))return;

    var who=(els&&els.sharedUserSelect&&els.sharedUserSelect.value)||'Justin';
    var gpx=buildWaypointGpx(w);
    var endpoint=w.sharedId?SHARED_API+'/api/tracks/'+encodeURIComponent(w.sharedId)+'/publish':SHARED_API+'/api/tracks';
    var payload=w.sharedId?
      {modifiedBy:who,gpx:gpx,basedOnVersion:w.sharedBaseVersion}:
      {name:(w.name||'Waypoint'),modifiedBy:who,gpx:gpx};

    fetch(endpoint,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
      .then(function(r){return r.json().catch(function(){return {};}).then(function(data){if(!r.ok)throw new Error(data.error||('HTTP '+r.status));return data;});})
      .then(function(data){
        w.sharedId=data.id||w.sharedId;
        w.sharedBaseVersion=data.version||w.sharedBaseVersion;
        w.sharedBaseModifiedAt=data.modifiedAt||w.sharedBaseModifiedAt;
        w.sharedBaseModifiedBy=data.modifiedBy||w.sharedBaseModifiedBy;
        w.updatedAt=new Date().toISOString();
        writeWaypoints(all);
        try{if(state&&state.libraryView==='shared'&&typeof loadSharedLibrary==='function')loadSharedLibrary();}catch(e){}
        window.alert('Waypoint shared to Shared Library.');
      })
      .catch(function(e){window.alert('Could not share this waypoint to Shared Library. '+(e.message||''));});
  }

  function enhanceShareActions(){
    Array.prototype.forEach.call(document.querySelectorAll('#trackList .track-item:not(.mancardo-waypoint-item) .track-menu button'),function(btn){
      var label=(btn.textContent||'').trim();
      if(label==='Post to Shared'||label==='Publish to Shared'){
        btn.textContent='Share';
        btn.title='Share this track to Shared Library';
      }
    });

    Array.prototype.forEach.call(document.querySelectorAll('#trackList .mancardo-waypoint-item'),function(card){
      var menu=card.querySelector('.track-menu');
      if(!menu||menu.querySelector('.mancardo-waypoint-share'))return;
      var id=card.getAttribute('data-waypoint-id');
      if(!id)return;
      var share=document.createElement('button');
      share.type='button';share.textContent='Share';share.className='mancardo-waypoint-share';share.title='Share this waypoint to Shared Library';
      share.onclick=function(ev){ev.stopPropagation();shareWaypointToLibrary(id);};
      var danger=menu.querySelector('button.danger');
      if(danger)menu.insertBefore(share,danger);else menu.appendChild(share);
    });
  }

  if(typeof renderLibrary==='function'){
    var baseRenderLibraryForShare=renderLibrary;
    renderLibrary=function(){
      var result=baseRenderLibraryForShare.apply(this,arguments);
      enhanceShareActions();
      return result;
    };
  }

  enhanceShareActions();
})();
`;

function injectShareActions(html){
  if(html.includes('installMancardoShareActions'))return html;
  const marker='// ---------- boot ----------';
  if(html.includes(marker))return html.replace(marker,SHARE_ACTIONS_FEATURE+'\n'+marker);
  return html;
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=injectShareActions(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
