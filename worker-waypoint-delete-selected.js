import baseWorker from './worker-library-header-layout.js';

const WAYPOINT_BULK_DELETE_FEATURE = String.raw`
// ---------- bulk delete: include saved waypoints ----------
(function installMancardoWaypointBulkDelete(){
  if(window.__mancardoWaypointBulkDeleteInstalled)return;
  window.__mancardoWaypointBulkDeleteInstalled=true;

  var btn=els&&els.deleteSelectedBtn?els.deleteSelectedBtn:document.getElementById('deleteSelectedBtn');
  if(!btn)return;
  var KEY='mancardo_saved_waypoints_v1';
  btn.title='Delete all shown tracks and waypoints';

  function readWaypoints(){
    try{
      var raw=localStorage.getItem(KEY);
      var parsed=raw?JSON.parse(raw):[];
      return Array.isArray(parsed)?parsed:[];
    }catch(e){return [];}
  }

  btn.addEventListener('click',function(ev){
    var allWaypoints=readWaypoints();
    var selectedWaypoints=allWaypoints.filter(function(w){return w&&w.visible!==false;});
    if(!selectedWaypoints.length)return;

    ev.preventDefault();
    ev.stopPropagation();
    if(ev.stopImmediatePropagation)ev.stopImmediatePropagation();

    var selectedTracks=state&&Array.isArray(state.library)?state.library.filter(function(item){return item.visible!==false;}):[];
    var parts=[];
    if(selectedTracks.length)parts.push(selectedTracks.length===1?'1 selected track':selectedTracks.length+' selected tracks');
    if(selectedWaypoints.length)parts.push(selectedWaypoints.length===1?'1 selected waypoint':selectedWaypoints.length+' selected waypoints');
    if(!window.confirm('Delete '+parts.join(' and ')+' from My Library? This cannot be undone.'))return;

    if(selectedTracks.length){
      var trackIds={};
      selectedTracks.forEach(function(item){trackIds[item.id]=true;});
      state.library=state.library.filter(function(item){return !trackIds[item.id];});
      if(state.currentId&&trackIds[state.currentId]){
        state.current=null;state.currentId=null;state.selection=null;state.history=[];state.future=[];state.extend=null;
      }
      state.trackMenuId=null;state.paletteId=null;
      try{persistLibrary();}catch(e){}
    }

    var waypointIds={};
    selectedWaypoints.forEach(function(w){waypointIds[w.id]=true;});
    try{localStorage.setItem(KEY,JSON.stringify(allWaypoints.filter(function(w){return !waypointIds[w.id];})));}catch(e){}

    // Reload once so the saved-waypoint marker layer and My Library are rebuilt from the updated local data.
    window.location.reload();
  },true);
})();
`;

function injectWaypointBulkDelete(html){
  if(html.includes('installMancardoWaypointBulkDelete'))return html;
  const marker='// ---------- boot ----------';
  if(html.includes(marker))return html.replace(marker,WAYPOINT_BULK_DELETE_FEATURE+'\n'+marker);
  return html;
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=injectWaypointBulkDelete(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
