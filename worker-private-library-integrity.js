import baseWorker from './worker-private-library-cloud.js';

const API_PREFIX='/api/private-library';
// Cloudflare D1 currently caps a table row/string/BLOB at 2,000,000 bytes.
// Keep track JSON comfortably below that ceiling so row metadata and future schema
// additions cannot turn a nominally valid upload into a D1 write failure.
const SAFE_MAX_TRACK_BYTES=1_750_000;
const MAX_REQUEST_BYTES=SAFE_MAX_TRACK_BYTES+64*1024;
const REQUIRED_SCHEMA_OBJECTS=[
  ['table','private_library_tracks'],
  ['table','private_library_revisions'],
  ['trigger','trg_private_library_tracks_after_insert'],
  ['trigger','trg_private_library_tracks_after_update']
];

function jsonResponse(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
  });
}

function utf8Bytes(text){
  return new TextEncoder().encode(String(text||'')).byteLength;
}

async function checkSchema(env){
  if(!env.PRIVATE_LIBRARY_DB){
    return {ready:false,detail:'D1 binding PRIVATE_LIBRARY_DB is not configured.',missing:REQUIRED_SCHEMA_OBJECTS.map(x=>x[1])};
  }
  try{
    const names=REQUIRED_SCHEMA_OBJECTS.map(x=>x[1]);
    const rows=await env.PRIVATE_LIBRARY_DB.prepare(
      'SELECT type,name FROM sqlite_master WHERE name IN (?1,?2,?3,?4)'
    ).bind(...names).all();
    const present=new Set((rows.results||[]).map(r=>String(r.type)+':'+String(r.name)));
    const missing=REQUIRED_SCHEMA_OBJECTS.filter(x=>!present.has(x[0]+':'+x[1])).map(x=>x[1]);
    if(missing.length){
      return {ready:false,detail:'D1 is reachable, but the private-library migration is incomplete. Missing: '+missing.join(', ')+'.',missing};
    }
    return {ready:true,detail:'Private My Library schema and revision-history triggers are ready.',missing:[]};
  }catch(e){
    return {ready:false,detail:'D1 is bound, but private-library schema verification failed.',missing:REQUIRED_SCHEMA_OBJECTS.map(x=>x[1])};
  }
}

async function enforceSafeTrackSize(request){
  const length=Number(request.headers.get('content-length')||0);
  if(length>MAX_REQUEST_BYTES){
    return {error:jsonResponse({
      error:'Track upload is too large for reliable D1 storage.',
      code:'track_too_large',
      maxTrackBytes:SAFE_MAX_TRACK_BYTES
    },413)};
  }

  const text=await request.text();
  if(utf8Bytes(text)>MAX_REQUEST_BYTES){
    return {error:jsonResponse({
      error:'Track upload is too large for reliable D1 storage.',
      code:'track_too_large',
      maxTrackBytes:SAFE_MAX_TRACK_BYTES
    },413)};
  }

  let body;
  try{body=JSON.parse(text||'{}');}
  catch(e){
    return {error:jsonResponse({error:'Request body is not valid JSON.',code:'invalid_json'},400)};
  }

  if(body&&body.track&&utf8Bytes(JSON.stringify(body.track))>SAFE_MAX_TRACK_BYTES){
    return {error:jsonResponse({
      error:'Track exceeds the safe private-sync size limit for D1.',
      code:'track_too_large',
      maxTrackBytes:SAFE_MAX_TRACK_BYTES
    },413)};
  }

  const forwarded=new Request(request.url,{
    method:request.method,
    headers:request.headers,
    body:text,
    redirect:request.redirect
  });
  return {request:forwarded};
}

async function strengthenHealth(request,env,ctx){
  const response=await baseWorker.fetch(request,env,ctx);
  const type=response.headers.get('content-type')||'';
  if(!type.includes('application/json'))return response;

  let data;
  try{data=await response.json();}
  catch(e){return response;}

  const schema=await checkSchema(env);
  data.schemaReady=schema.ready;
  data.schemaDetail=schema.detail;
  data.schemaMissing=schema.missing;
  data.maxTrackBytes=SAFE_MAX_TRACK_BYTES;
  data.d1RowLimitBytes=2_000_000;
  data.integrityGuard='2026-10';

  // A binding alone is not enough: the app must not enter active sync until the
  // required tables and immutable revision-history triggers are present.
  if(data.storageReady&&!schema.ready){
    data.storageReady=false;
    data.storageDetail=schema.detail;
  }

  return jsonResponse(data,response.status);
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);

    if(url.pathname===API_PREFIX+'/health'&&request.method==='GET'){
      return strengthenHealth(request,env,ctx);
    }

    if(request.method==='PUT'&&/^\/api\/private-library\/tracks\/[^/]+$/.test(url.pathname)){
      const checked=await enforceSafeTrackSize(request);
      if(checked.error)return checked.error;
      return baseWorker.fetch(checked.request,env,ctx);
    }

    return baseWorker.fetch(request,env,ctx);
  }
};
