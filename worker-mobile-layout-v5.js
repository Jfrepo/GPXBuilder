import baseWorker from './worker-mobile-layout-v4.js';

const LIBRARY_OPTIONS_CSS = String.raw`
<style id="mancardo-library-options-v5">
/* Keep each track's option menu to exactly two compact rows. */
.track-menu{
  display:grid!important;
  grid-template-columns:repeat(4,minmax(0,1fr))!important;
  gap:.22rem!important;
  padding:.34rem 0 0!important;
}
.track-menu button{
  width:100%!important;
  min-width:0!important;
  min-height:30px!important;
  padding:.18rem .16rem!important;
  font-size:.64rem!important;
  line-height:1.05!important;
  white-space:normal!important;
}
</style>`;

function injectLibraryOptions(html){
  if(html.includes('mancardo-library-options-v5'))return html;
  return html.replace('</head>',LIBRARY_OPTIONS_CSS+'\n</head>');
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=injectLibraryOptions(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
