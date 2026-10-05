import baseWorker from './worker-map-search.js';

const SEARCH_LAYOUT_CSS = String.raw`
<style id="mancardo-map-search-layout-styles">
@media(min-width:768px){
  /* Place search in its own slot directly above the editing toolbar. */
  #mancardoMapSearchBtn{
    right:.7rem!important;
    top:4.2rem!important;
    bottom:auto!important;
  }
  #desktopToolbarHost{
    top:6.85rem!important;
  }
  #mancardoMapSearchPanel{
    right:5.35rem!important;
    top:4.2rem!important;
    bottom:auto!important;
  }
}
</style>`;

function injectSearchLayout(html){
  if(html.includes('mancardo-map-search-layout-styles')) return html;
  return html.replace('</head>',SEARCH_LAYOUT_CSS+'\n</head>');
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html')) return response;

    const html=injectSearchLayout(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
