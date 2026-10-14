import baseWorker from './worker-mobile-search-layering.js';

const STATIC_ASSET_RE=/\.(?:css|js|mjs|map|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|txt|xml|gpx)$/i;

function optimizeSyncClient(html){
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

    const response=await baseWorker.fetch(request,env,ctx);
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
