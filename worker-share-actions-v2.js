import baseWorker from './worker-share-actions.js';

function patchShareActions(html){
  html=html.replace(
    "'    <trkpt lat=\"'+lat.toFixed(6)+'\" lon=\"'+lon.toFixed(6)+'\"></trkpt>\\n'+\n      '  </trkseg></trk>\\n'+",
    "'    <trkpt lat=\"'+lat.toFixed(6)+'\" lon=\"'+lon.toFixed(6)+'\"></trkpt>\\n'+\n      '    <trkpt lat=\"'+lat.toFixed(6)+'\" lon=\"'+lon.toFixed(6)+'\"></trkpt>\\n'+\n      '  </trkseg></trk>\\n'+"
  );
  html=html.replace(
    "fetch(endpoint,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})",
    "fetch(endpoint,{method:'POST',credentials:'include',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(payload)})"
  );
  return html;
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=patchShareActions(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
