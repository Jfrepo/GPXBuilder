import pointListWorker from './worker.js';

const POINT_LIST_BUTTON_LAYOUT = `
<style id="point-list-button-layout">
.dock{
  display:grid!important;
  grid-template-columns:max-content minmax(150px,1fr);
  grid-template-rows:auto auto minmax(0,1fr);
  column-gap:1.35rem;
  align-items:center;
}
.stats-row{grid-column:1;grid-row:1;margin-bottom:0!important}
.points-toggle{
  grid-column:2;
  grid-row:1;
  justify-self:start;
  align-self:center;
  margin:0!important;
  min-height:36px!important;
  padding:.42rem .78rem!important;
  font-size:.86rem!important;
}
.toolbar{grid-column:1/-1;grid-row:2;margin-top:.55rem}
.points-table-wrap{grid-column:1/-1;grid-row:3;width:100%}
@media(max-width:1100px){
  .dock{display:flex!important;flex-direction:column}
  .points-toggle{align-self:flex-start;margin-top:.5rem!important}
}
</style>`;

export default {
  async fetch(request, env, ctx){
    const response = await pointListWorker.fetch(request, env, ctx);
    const type = response.headers.get('content-type') || '';
    if(!type.includes('text/html')) return response;

    let html = await response.text();
    html = html.replace('</head>', POINT_LIST_BUTTON_LAYOUT + '\n</head>');

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
