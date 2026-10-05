import baseWorker from './worker-waypoint-save.js';

const LIBRARY_HEADER_CSS = String.raw`
<style id="mancardo-library-header-layout-styles">
/* Remove the redundant LIBRARY heading and let the primary actions use the full drawer width. */
.drawer-head>.label-caps{display:none!important}
.drawer-head{display:block!important;padding:.55rem!important}
.drawer-head>div{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:.45rem!important;width:100%!important}
.drawer-head #newRouteBtn,
.drawer-head #exportSelectedBtn,
.drawer-head #deleteSelectedBtn{
  width:100%!important;
  min-width:0!important;
  min-height:44px!important;
  padding:.45rem .35rem!important;
  white-space:normal!important;
  line-height:1.15!important;
  text-align:center!important;
}
@media(max-width:767px){
  /* Shorter mobile label gives each of the three actions more usable touch space. */
  .drawer-head #exportSelectedBtn{font-size:0!important}
  .drawer-head #exportSelectedBtn::after{content:'Export';font-size:.85rem!important;line-height:1!important}
}
</style>`;

function injectLibraryHeaderLayout(html){
  if(html.includes('mancardo-library-header-layout-styles'))return html;
  return html.replace('</head>',LIBRARY_HEADER_CSS+'\n</head>');
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=injectLibraryHeaderLayout(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
