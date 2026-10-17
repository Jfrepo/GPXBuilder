import baseWorker from './worker-shared-stale-link-recovery.js';

const SAFE_TRACK_BYTES = Math.floor(1.8 * 1024 * 1024);
const WARN_TRACK_BYTES = Math.floor(1.6 * 1024 * 1024);

function jsonResponse(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
  });
}

async function trackPayloadBytes(request){
  try{
    const body=await request.clone().json();
    if(!body || !body.track || typeof body.track!=='object')return null;
    return new TextEncoder().encode(JSON.stringify(body.track)).byteLength;
  }catch(e){
    return null;
  }
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const isPrivateTrackPut=request.method==='PUT' && /^\/api\/private-library\/tracks\/[^/]+$/.test(url.pathname);
    if(!isPrivateTrackPut)return baseWorker.fetch(request,env,ctx);

    const bytes=await trackPayloadBytes(request);
    if(bytes!=null && bytes>SAFE_TRACK_BYTES){
      return jsonResponse({
        error:'Track is too large to sync safely. Reduce the track size before cloud sync.',
        code:'track_safety_limit',
        trackBytes:bytes,
        safeTrackBytes:SAFE_TRACK_BYTES
      },413);
    }

    const response=await baseWorker.fetch(request,env,ctx);
    if(bytes!=null && bytes>WARN_TRACK_BYTES){
      const headers=new Headers(response.headers);
      headers.set('x-mancardo-track-size-warning','Track is approaching the 1.8 MiB cloud safety limit.');
      headers.set('x-mancardo-track-bytes',String(bytes));
      return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
    }
    return response;
  }
};
