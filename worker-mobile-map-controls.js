import baseWorker from './worker-map-search-actions.js';

const MOBILE_MAP_CONTROLS_CSS = String.raw`
<style id="mancardo-mobile-map-controls-bottom-right">
@media(max-width:767px){
  /* Keep zoom, overlays and fuel together beside the editing toolbar. */
  #mancardoMobileBottomTools{
    left:auto!important;
    right:8px!important;
    top:auto!important;
    bottom:8px!important;
    flex-direction:column!important;
    align-items:flex-end!important;
    gap:4px!important;
  }
  #mancardoMobileZoomTray{
    left:auto!important;
    right:8px!important;
    top:auto!important;
    bottom:84px!important;
  }

  /* Search stays adjacent to the control stack without covering zoom. */
  #mancardoMapSearchBtn{
    left:auto!important;
    right:50px!important;
    top:auto!important;
    bottom:8px!important;
  }
  #mancardoMapSearchPanel{
    left:auto!important;
    right:8px!important;
    top:auto!important;
    bottom:52px!important;
  }

  /* Open overlay controls next to the relocated button stack. */
  .overlay-panel{
    top:auto!important;
    bottom:84px!important;
    left:auto!important;
    right:50px!important;
    max-width:calc(100vw - 66px)!important;
    max-height:50dvh!important;
  }
}
</style>`;

function injectMobileMapControls(html){
  if(html.includes('mancardo-mobile-map-controls-bottom-right'))return html;
  return html.replace('</head>',MOBILE_MAP_CONTROLS_CSS+'\n</head>');
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=injectMobileMapControls(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
