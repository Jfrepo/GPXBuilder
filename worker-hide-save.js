import baseWorker from './worker-location-accuracy.js';

const HIDE_LOCAL_ONLY = String.raw`<style id="mancardo-hide-local-only-indicator">.local-chip{display:none!important}</style>`;

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=await response.text();
    if(!html.includes('mancardo-hide-local-only-indicator')){
      const i=html.toLowerCase().lastIndexOf('</head>');
      html=i>=0?html.slice(0,i)+HIDE_LOCAL_ONLY+'\n'+html.slice(i):HIDE_LOCAL_ONLY+html;
    }
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store, max-age=0');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
