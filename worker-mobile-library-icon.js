import baseWorker from './worker-private-waypoint-sync.js';

const LAYERS_SVG='<svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3.5 7.5 12 12l8.5-4.5L12 3Z"></path><path d="m3.5 12 8.5 4.5 8.5-4.5"></path><path d="m3.5 16.5 8.5 4.5 8.5-4.5"></path></svg>';

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=await response.text();

    // Replace the actual map-overlays control at source. This avoids late mobile-layout
    // scripts or browser caching restoring the original hamburger glyph.
    html=html.replace(
      "btn.type='button'; btn.title='Show / hide map overlays'; btn.setAttribute('aria-label','Show or hide map overlays'); btn.innerHTML='&#9776;';",
      "btn.type='button'; btn.title='Map overlays'; btn.setAttribute('aria-label','Show or hide map overlays'); btn.innerHTML='"+LAYERS_SVG+"';"
    );

    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store, max-age=0');
    headers.set('pragma','no-cache');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
