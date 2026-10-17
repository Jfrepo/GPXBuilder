import baseWorker from './worker-track-size-guard.js';

const RENDER_AUTOSAVE = "function render(){\n  autosaveEditor();";
const RENDER_SAFE = "function render(){";
const LEGACY_TRACK_SYNC = /<script id="mancardo-private-delete-tombstone-fix">[\s\S]*?<\/script>/i;
const LEGACY_WAYPOINT_SYNC = /<script id="mancardo-private-waypoint-sync">[\s\S]*?<\/script>/i;

const EXPLICIT_DELETE_BRIDGE = String.raw`
<script id="mancardo-explicit-delete-bridge">
(function(){
  if(window.__mancardoExplicitDeleteBridgeInstalled)return;
  window.__mancardoExplicitDeleteBridgeInstalled=true;

  function ids(){
    try{return (state.library||[]).filter(function(t){return t&&t.id;}).map(function(t){return String(t.id);});}
    catch(e){return [];}
  }
  function api(path,opts){
    opts=opts||{};
    opts.credentials='include';
    opts.cache='no-store';
    opts.headers=Object.assign({'accept':'application/json'},opts.headers||{});
    return fetch('/api/private-library'+path,opts);
  }
  function json(r){return r.json().catch(function(){return {};}).then(function(d){return {r:r,d:d};});}
  function device(){try{return localStorage.getItem('mancardo_private_device_id_v1')||'';}catch(e){return '';}}

  function deleteCloudTrack(id,attempt){
    attempt=attempt||0;
    return api('/tracks/'+encodeURIComponent(id)).then(json).then(function(x){
      if(x.r.status===404)return true;
      if(!x.r.ok)throw new Error((x.d&&x.d.error)||('Lookup HTTP '+x.r.status));
      if(x.d&&x.d.deleted)return true;
      var revision=Number(x.d&&x.d.revision)||0;
      if(revision<1)return true;
      return api('/tracks/'+encodeURIComponent(id),{
        method:'DELETE',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({base_revision:revision,device_id:device()})
      }).then(json).then(function(y){
        if(y.r.ok)return true;
        if(y.r.status===409&&attempt<1)return deleteCloudTrack(id,attempt+1);
        throw new Error((y.d&&y.d.error)||('Delete HTTP '+y.r.status));
      });
    });
  }

  function syncRemoved(before){
    setTimeout(function(){
      var after={};ids().forEach(function(id){after[id]=1;});
      var removed=before.filter(function(id){return !after[id];});
      if(!removed.length)return;
      Promise.all(removed.map(function(id){return deleteCloudTrack(id,0);})).then(function(){
        try{window.dispatchEvent(new CustomEvent('mancardo:explicit-cloud-delete'));}catch(e){}
      }).catch(function(e){
        console.warn('Explicit cloud delete is pending',e);
        var chip=document.getElementById('mancardoPrivateSyncChip');
        if(chip){chip.dataset.state='offline';chip.textContent='☁ Sync pending';chip.title='A library deletion is saved locally but still needs to sync to the cloud.';}
      });
    },80);
  }

  document.addEventListener('click',function(ev){
    var btn=ev.target&&ev.target.closest?ev.target.closest('#deleteTrackBtn,#deleteSelectedBtn'):null;
    if(!btn)return;
    var before=ids();
    setTimeout(function(){syncRemoved(before);},0);
  },true);
})();
</script>`;

function sharedDisplayName(accountLabel){
  const raw=String(accountLabel||'').trim().toLowerCase();
  const local=(raw.split('@')[0]||raw).replace(/[^a-z0-9]+/g,' ');
  if(/\bpaul\b|\btuffs\b/.test(local))return 'Paul';
  if(/\bjustin\b|\bjay\b|fenno/.test(local))return 'Justin';
  return '';
}

async function repairSharedAttribution(request,response,env,ctx){
  if(request.method!=='POST'||!env.PRIVATE_LIBRARY_DB)return response;
  const url=new URL(request.url);
  if(!(url.pathname==='/api/tracks'||/^\/api\/tracks\/[^/]+\/publish$/.test(url.pathname)))return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('application/json'))return response;

  let data;
  try{data=await response.clone().json();}catch(e){return response;}
  if(!response.ok||!data||data.modifiedBy!=='Shared user'||!data.id)return response;

  try{
    const healthUrl=new URL(request.url);
    healthUrl.pathname='/api/private-library/health';
    healthUrl.search='';
    const probe=await baseWorker.fetch(new Request(healthUrl.toString(),{method:'GET',headers:request.headers}),env,ctx);
    const health=await probe.json().catch(function(){return {};});
    const who=sharedDisplayName(health&&health.accountLabel);
    if(!who)return response;

    await env.PRIVATE_LIBRARY_DB.prepare(`
      UPDATE shared_library_tracks
      SET modified_by=?2,
          created_by=CASE WHEN current_version=1 AND created_by='Shared user' THEN ?2 ELSE created_by END
      WHERE track_id=?1 AND modified_by='Shared user'
    `).bind(String(data.id),who).run();

    data.modifiedBy=who;
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
  }catch(e){
    console.warn('Shared attribution repair failed',e);
    return response;
  }
}

export default {
  async fetch(request, env, ctx) {
    let response = await baseWorker.fetch(request, env, ctx);
    response = await repairSharedAttribution(request,response,env,ctx);

    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) return response;

    let html = await response.text();

    // Rendering must stay side-effect free. Autosave is triggered only by
    // actual edit/save actions, never by map/UI redraws.
    if (html.includes(RENDER_AUTOSAVE)) {
      html = html.replace(RENDER_AUTOSAVE, RENDER_SAFE);
    }

    // Disable the superseded canonical polling clients. Both legacy clients
    // poll every 5 seconds, run again after ordinary clicks/focus, and call
    // location.reload() when they reconcile changes. That can create a
    // continuous reload/reconcile loop alongside the newer revision-aware
    // private sync client. The server APIs remain available; only these old
    // browser-side polling scripts are removed.
    html = html.replace(LEGACY_TRACK_SYNC, '');
    html = html.replace(LEGACY_WAYPOINT_SYNC, '');

    // My Library deletes are deliberate UI actions. Mirror only those explicit
    // removals to the private cloud using the current server revision so a later
    // sync cannot resurrect a track that the user intentionally deleted.
    if(!html.includes('mancardo-explicit-delete-bridge')){
      const i=html.toLowerCase().lastIndexOf('</body>');
      html=i>=0?html.slice(0,i)+EXPLICIT_DELETE_BRIDGE+'\n'+html.slice(i):html+EXPLICIT_DELETE_BRIDGE;
    }

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control', 'no-store, max-age=0');
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
