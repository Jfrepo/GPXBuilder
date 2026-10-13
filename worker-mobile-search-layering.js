import baseWorker from './worker-location-accuracy.js';

const MOBILE_SEARCH_LAYERING = String.raw`
<style id="mancardo-mobile-search-layering">
@media(max-width:767px){
  /* Keep map search available on the map, but below the mobile library drawer/backdrop. */
  #mancardoMapSearchBtn{z-index:760!important}
  #mancardoMapSearchPanel{z-index:770!important}
}
</style>`;

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=await response.text();
    if(!html.includes('mancardo-mobile-search-layering')){
      const i=html.toLowerCase().lastIndexOf('</head>');
      html=i>=0?html.slice(0,i)+MOBILE_SEARCH_LAYERING+'\n'+html.slice(i):MOBILE_SEARCH_LAYERING+html;
    }
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store, max-age=0');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
