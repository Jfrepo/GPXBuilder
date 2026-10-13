import baseWorker from './worker-private-waypoint-sync.js';

const OLD_BUTTON='<button class="mobile-library-toggle" id="mobileLibraryToggle" type="button" aria-label="Open track library" title="Track library">&#9776;</button>';
const NEW_BUTTON='<button class="mobile-library-toggle" id="mobileLibraryToggle" type="button" aria-label="Open track library" title="Track library"><svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M9 4v16"></path></svg></button>';

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=await response.text();
    if(html.includes(OLD_BUTTON))html=html.replace(OLD_BUTTON,NEW_BUTTON);
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
