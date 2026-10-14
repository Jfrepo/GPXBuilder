import baseWorker from './worker-shared-note-toggle-ui.js';

function decodeXml(v){
  return String(v||'')
    .replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"')
    .replace(/&apos;/g,"'")
    .replace(/&amp;/g,'&')
    .trim();
}

function gpxName(gpx){
  const s=String(gpx||'');
  let m=s.match(/<trk\b[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>/i);
  if(!m)m=s.match(/<rte\b[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>/i);
  return m?decodeXml(m[1]).slice(0,240):'';
}

function isPublishRequest(request){
  if(String(request.method||'GET').toUpperCase()!=='POST')return false;
  const p=new URL(request.url).pathname;
  return /^\/api\/tracks\/[^/]+\/publish$/.test(p);
}

async function recoverMissingSharedTrack(originalRequest,response,env,ctx){
  if(response.status!==404)return response;
  let errorBody={};
  try{errorBody=await response.clone().json();}catch(e){}
  if(!errorBody||errorBody.code!=='not_found')return response;

  try{
    const body=await originalRequest.clone().json();
    const gpx=String(body&&body.gpx||'');
    const name=gpxName(gpx);
    if(!gpx.trim()||!name)return response;

    const url=new URL(originalRequest.url);
    url.pathname='/api/tracks';
    url.search='';
    const headers=new Headers(originalRequest.headers);
    headers.set('content-type','application/json');
    headers.delete('content-length');
    const createBody={name:name,gpx:gpx};
    if(body&&body.modifiedBy!=null)createBody.modifiedBy=body.modifiedBy;

    return baseWorker.fetch(new Request(url.toString(),{
      method:'POST',
      headers,
      body:JSON.stringify(createBody),
      redirect:originalRequest.redirect
    }),env,ctx);
  }catch(e){
    return response;
  }
}

export default {
  async fetch(request,env,ctx){
    if(!isPublishRequest(request))return baseWorker.fetch(request,env,ctx);
    const original=request.clone();
    const response=await baseWorker.fetch(request,env,ctx);
    return recoverMissingSharedTrack(original,response,env,ctx);
  }
};
