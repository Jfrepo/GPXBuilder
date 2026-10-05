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

  function waypointById(id){
    return readWaypoints().find(function(w){return w&&w.id===id;})||null;
  }

  function shareWaypoint(id){
    var w=waypointById(id);if(!w)return;
    var name=(w.name||'Waypoint').trim()||'Waypoint';
    var lat=Number(w.lat),lon=Number(w.lon);
    if(!isFinite(lat)||!isFinite(lon))return;
    var coords=lat.toFixed(6)+', '+lon.toFixed(6);
    var url='https://maps.apple.com/?ll='+encodeURIComponent(lat+','+lon)+'&q='+encodeURIComponent(name);
    var text=name+'\n'+coords;
    var payload={title:name,text:text,url:url};

    if(navigator.share){
      navigator.share(payload).catch(function(err){
        if(err&&err.name==='AbortError')return;
        fallbackShare(text+'\n'+url);
      });
      return;
    }
    fallbackShare(text+'\n'+url);
  }

  function fallbackShare(text){
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){window.alert('Waypoint share link copied.');}).catch(function(){window.prompt('Copy waypoint',text);});
    }else{
      window.prompt('Copy waypoint',text);
    }
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
      share.type='button';share.textContent='Share';share.className='mancardo-waypoint-share';share.title='Share this waypoint';
      share.onclick=function(ev){ev.stopPropagation();shareWaypoint(id);};
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
