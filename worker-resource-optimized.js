import baseWorker from './worker-location-accuracy.js';

const STATIC_ASSET_RE=/\.(?:css|js|mjs|map|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|txt|xml|gpx)$/i;
const CONSOLIDATED_HEAD=String.raw`<style id="mancardo-consolidated-final-ui">
.local-chip[title="Saved on this device only"],.local-chip[aria-label="Saved on this device only"]{display:none!important}
@media(max-width:767px){#mancardoMapSearchBtn{z-index:760!important}#mancardoMapSearchPanel{z-index:770!important}}
</style>`;

function optimizeSyncClient(html){
  // Fold the two tiny final CSS-only Worker wrappers into this already-required
  // final HTML pass. This removes two full response.text()/Response rebuild cycles.
  if(!html.includes('mancardo-consolidated-final-ui')){
    const i=html.toLowerCase().lastIndexOf('</head>');
    html=i>=0?html.slice(0,i)+CONSOLIDATED_HEAD+'\n'+html.slice(i):CONSOLIDATED_HEAD+html;
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
