import previewWorker from './worker-google-preview.js';

function googleLoaderTag(apiKey){
  if(!apiKey) return '';
  const src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(apiKey)+'&v=weekly';
  return '<script src="'+src+'"></script>';
}

export default {
  async fetch(request,env,ctx){
    const response=await previewWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html')) return response;

    let html=await response.text();
    if(!html.includes('maps.googleapis.com/maps/api/js')){
      const loader=googleLoaderTag(env.GOOGLE_MAPS_API_KEY||'');
      if(loader) html=html.replace('</head>',loader+'\n</head>');
    }

    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
