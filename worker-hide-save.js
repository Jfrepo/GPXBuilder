import baseWorker from './worker-location-accuracy.js';

const HIDE_SAVE = String.raw`<style id="mancardo-hide-manual-save">#saveBtn{display:none!important}</style>`;

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=await response.text();
    if(!html.includes('mancardo-hide-manual-save')){
      const i=html.toLowerCase().lastIndexOf('</head>');
      html=i>=0?html.slice(0,i)+HIDE_SAVE+'\n'+html.slice(i):HIDE_SAVE+html;
    }
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store, max-age=0');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
