import baseWorker from './worker-location-accuracy.js';

const STATIC_ASSET_RE=/\.(?:css|js|mjs|map|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|txt|xml|gpx)$/i;
const CONSOLIDATED_HEAD=String.raw`<style id="mancardo-consolidated-final-ui">
.local-chip[title="Saved on this device only"],.local-chip[aria-label="Saved on this device only"]{display:none!important}
.drawer-head>div{grid-template-columns:repeat(4,minmax(0,1fr))!important}
.drawer-head #newRouteBtn,.drawer-head #importBtn,.drawer-head #exportSelectedBtn,.drawer-head #deleteSelectedBtn{width:100%!important;min-width:0!important;min-height:32px!important;height:32px!important;padding:.18rem .28rem!important;font-size:.68rem!important;line-height:1!important}
@media(max-width:767px){#mancardoMapSearchBtn{z-index:760!important}#mancardoMapSearchPanel{z-index:770!important}.drawer-head>div{grid-template-columns:repeat(4,minmax(0,1fr))!important}}
</style>`;

const CONSOLIDATED_BODY=String.raw`<script id="mancardo-final-ui-behaviour">
(function(){
  function accountDisplayName(label){
    var raw=String(label||'').trim().toLowerCase();
    var local=(raw.split('@')[0]||raw).replace(/[^a-z0-9]+/g,' ');
    if(/\bpaul\b/.test(local))return 'Paul';
    if(/\bjustin\b|\bjay\b|fenno/.test(local))return 'Justin';
    return '';
  }
  function install(){
    var createBtn=document.getElementById('newRouteBtn');
    if(createBtn){
      createBtn.textContent='Create';
      createBtn.setAttribute('aria-label','Create track');
      createBtn.title='Create track';
    }
    var importBtn=document.getElementById('importBtn');
    var actions=document.querySelector('.drawer-head>div');
    if(importBtn&&actions&&importBtn.parentNode!==actions){
      var exportBtn=document.getElementById('exportSelectedBtn');
      actions.insertBefore(importBtn,exportBtn||actions.lastChild);
    }
    var userSelect=document.getElementById('sharedUserSelect');
    if(userSelect){
      fetch('/api/private-library/health',{credentials:'include',cache:'no-store',headers:{accept:'application/json'}})
        .then(function(r){return r.json().catch(function(){return {};});})
        .then(function(h){
          if(!h||!h.authenticated)return;
          var name=accountDisplayName(h.accountLabel);
          if(!name)return;
          userSelect.value=name;
          userSelect.disabled=true;
          userSelect.title='Shared Library identity follows the signed-in account';
          try{localStorage.setItem('mancardo.sharedUser',name);}catch(e){}
        }).catch(function(){});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
</script>`;

function optimizeSyncClient(html){
  // Fold the tiny final CSS-only Worker wrappers into this already-required final
  // HTML pass. This avoids extra response.text()/Response rebuild cycles.
  if(!html.includes('mancardo-consolidated-final-ui')){
    const i=html.toLowerCase().lastIndexOf('</head>');
    html=i>=0?html.slice(0,i)+CONSOLIDATED_HEAD+'\n'+html.slice(i):CONSOLIDATED_HEAD+html;
  }
  if(!html.includes('mancardo-final-ui-behaviour')){
    const i=html.toLowerCase().lastIndexOf('</body>');
    html=i>=0?html.slice(0,i)+CONSOLIDATED_BODY+'\n'+html.slice(i):html+CONSOLIDATED_BODY;
  }

  // The private track and waypoint clients used to poll every five seconds even
  // while nothing had changed. Keep explicit Sync, focus/online/visibility sync,
  // but reduce the idle poll to once per minute.
  html=html.replaceAll(
    "setInterval(function(){if(document.visibilityState==='visible'&&navigator.onLine)run();},5000);",
    "setInterval(function(){if(document.visibilityState==='visible'&&navigator.onLine)run();},60000);"
  );

  // Do not run a full private cloud sync after every unrelated click in the app.
  html=html.replace(
    "document.addEventListener('click',function(ev){\n    var t=ev.target;\n    if(t&&t.closest&&t.closest('#mancardoPrivateSyncNow'))setTimeout(run,250);\n    else setTimeout(run,900);\n  },true);",
    "document.addEventListener('click',function(ev){\n    var t=ev.target;\n    if(t&&t.closest&&t.closest('#mancardoPrivateSyncNow'))setTimeout(run,250);\n  },true);"
  );
  html=html.replace(
    "document.addEventListener('click',function(ev){var t=ev.target;if(t&&t.closest&&t.closest('#mancardoPrivateSyncNow'))setTimeout(run,300);else setTimeout(run,1000);},true);",
    "document.addEventListener('click',function(ev){var t=ev.target;if(t&&t.closest&&t.closest('#mancardoPrivateSyncNow'))setTimeout(run,300);},true);"
  );
  return html;
}

function migrationBackedWaypointDb(env,url){
  const db=env&&env.PRIVATE_LIBRARY_DB;
  if(!db||!url.pathname.startsWith('/api/private-library/canonical/waypoints'))return env;

  // migrations/0004_private_waypoints.sql already owns this schema. The waypoint
  // Worker historically re-ran the same CREATE TABLE/INDEX/TRIGGER statements on
  // every request. Suppress only those exact additive schema statements here;
  // normal SELECT/INSERT/UPDATE/DELETE queries still go directly to D1.
  const schemaDdl=/^\s*CREATE\s+(?:TABLE|INDEX|TRIGGER)\s+IF\s+NOT\s+EXISTS\s+(?:private_library_waypoints|private_library_waypoint_revisions|idx_private_library_waypoints_owner_updated|trg_private_library_waypoints_after_insert|trg_private_library_waypoints_after_update)\b/i;
  const proxy=new Proxy(db,{
    get(target,prop){
      if(prop!=='prepare'){
        const v=target[prop];
        return typeof v==='function'?v.bind(target):v;
      }
      return function(sql){
        if(schemaDdl.test(String(sql||''))){
          return {run:async function(){return {success:true,meta:{skipped_migration_backed_ddl:true}};}};
        }
        return target.prepare(sql);
      };
    }
  });
  return Object.assign({},env,{PRIVATE_LIBRARY_DB:proxy});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);

    // Wrangler must currently run the Worker first because ManCardo still injects
    // application features into index.html. Obvious static files do not need any
    // of that processing, so send them directly to the asset binding and avoid the
    // full nested Worker chain.
    if((request.method==='GET'||request.method==='HEAD') &&
       !url.pathname.startsWith('/api/') &&
       STATIC_ASSET_RE.test(url.pathname) && env.ASSETS){
      return env.ASSETS.fetch(request);
    }

    const effectiveEnv=migrationBackedWaypointDb(env,url);
    const response=await baseWorker.fetch(request,effectiveEnv,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;

    const original=await response.text();
    const html=optimizeSyncClient(original);
    if(html===original)return new Response(original,{status:response.status,statusText:response.statusText,headers:response.headers});

    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store, max-age=0');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
