import baseWorker from './worker-device-compatibility.js';

const MAX_TRACK_BYTES = 2 * 1024 * 1024;
const API_PREFIX = '/api/private-library';
const SYNC_SCHEMA_VERSION = 1;

function jsonResponse(data,status=200,extraHeaders={}){
  const headers=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store',...extraHeaders});
  return new Response(JSON.stringify(data),{status,headers});
}

function cleanOwner(value){
  const s=String(value||'').trim();
  return s && s.length<=200 ? s : '';
}

function b64urlBytes(value){
  let s=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
  while(s.length%4)s+='=';
  const raw=atob(s),out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
  return out;
}

function decodeJwtPart(value){
  return JSON.parse(new TextDecoder().decode(b64urlBytes(value)));
}

function normalizedIssuer(teamDomain){
  const raw=String(teamDomain||'').trim().replace(/^https?:\/\//i,'').replace(/\/$/,'');
  return raw ? 'https://'+raw : '';
}

function audMatches(claim,expected){
  if(Array.isArray(claim))return claim.includes(expected);
  return String(claim||'')===expected;
}

const jwksCache=new Map();
async function getAccessJwks(issuer){
  const now=Date.now(),cached=jwksCache.get(issuer);
  if(cached&&cached.expires>now)return cached.keys;
  const res=await fetch(issuer+'/cdn-cgi/access/certs',{headers:{accept:'application/json'}});
  if(!res.ok)throw new Error('Access certificate lookup failed');
  const data=await res.json();
  const keys=Array.isArray(data.keys)?data.keys:[];
  jwksCache.set(issuer,{keys,expires:now+10*60*1000});
  return keys;
}

async function verifyAccessIdentity(request,env){
  const issuer=normalizedIssuer(env.CF_ACCESS_TEAM_DOMAIN);
  const audience=String(env.CF_ACCESS_AUD||'').trim();
  if(!issuer||!audience)return {configured:false,identity:null,reason:'Authentication is not configured yet.'};

  const token=String(request.headers.get('Cf-Access-Jwt-Assertion')||'').trim();
  if(!token)return {configured:true,identity:null,reason:'Sign in is required for private My Library sync.'};

  try{
    const parts=token.split('.');
    if(parts.length!==3)throw new Error('Malformed token');
    const header=decodeJwtPart(parts[0]),payload=decodeJwtPart(parts[1]);
    if(header.alg!=='RS256'||!header.kid)throw new Error('Unsupported token');
    if(String(payload.iss||'')!==issuer)throw new Error('Wrong issuer');
    if(!audMatches(payload.aud,audience))throw new Error('Wrong audience');
    const now=Math.floor(Date.now()/1000);
    if(!payload.exp||Number(payload.exp)<=now)throw new Error('Expired token');
    if(payload.nbf&&Number(payload.nbf)>now+30)throw new Error('Token not active');
    const keys=await getAccessJwks(issuer);
    const jwk=keys.find(k=>k&&k.kid===header.kid);
    if(!jwk)throw new Error('Signing key not found');
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    const input=new TextEncoder().encode(parts[0]+'.'+parts[1]);
    const ok=await crypto.subtle.verify({name:'RSASSA-PKCS1-v1_5'},key,b64urlBytes(parts[2]),input);
    if(!ok)throw new Error('Invalid signature');
    const owner=cleanOwner(payload.sub);
    if(!owner)throw new Error('Missing subject');
    return {configured:true,identity:{ownerId:owner,email:String(payload.email||'').slice(0,254)},reason:''};
  }catch(e){
    return {configured:true,identity:null,reason:'Private sync authentication could not be verified.'};
  }
}

function validTrackId(id){return /^[A-Za-z0-9._:-]{1,128}$/.test(String(id||''));}
function finiteNumber(v){return typeof v==='number'&&Number.isFinite(v);}

function validateTrack(track,expectedId){
  if(!track||typeof track!=='object'||Array.isArray(track))return 'Track payload must be an object.';
  if(!validTrackId(track.id)||String(track.id)!==String(expectedId))return 'Track id is invalid or does not match the request.';
  if(track.type!=='track'&&track.type!=='route')return 'Track type must be track or route.';
  if(typeof track.name!=='string'||!track.name.trim()||track.name.length>240)return 'Track name is required and must be 240 characters or fewer.';
  if(!Array.isArray(track.segments))return 'Track segments must be an array.';
  let pointCount=0;
  for(const seg of track.segments){
    if(!Array.isArray(seg))return 'Every segment must be an array.';
    pointCount+=seg.length;
    if(pointCount>250000)return 'Track contains too many points for private sync.';
    for(const p of seg){
      if(!p||typeof p!=='object'||!finiteNumber(p.lat)||!finiteNumber(p.lon))return 'Track contains a point with invalid coordinates.';
      if(p.lat < -90 || p.lat > 90 || p.lon < -180 || p.lon > 180)return 'Track contains coordinates outside valid latitude/longitude ranges.';
      if(p.ele!=null&&!finiteNumber(p.ele))return 'Track contains an invalid elevation value.';
    }
  }
  return '';
}

async function sha256Hex(text){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function readJsonBody(request){
  const length=Number(request.headers.get('content-length')||0);
  if(length>MAX_TRACK_BYTES+65536)throw Object.assign(new Error('Payload is too large.'),{status:413});
  const text=await request.text();
  if(new TextEncoder().encode(text).byteLength>MAX_TRACK_BYTES+65536)throw Object.assign(new Error('Payload is too large.'),{status:413});
  try{return JSON.parse(text||'{}');}catch(e){throw Object.assign(new Error('Request body is not valid JSON.'),{status:400});}
}

async function requirePrivateContext(request,env){
  if(!env.PRIVATE_LIBRARY_DB)return {error:jsonResponse({error:'Private My Library cloud storage is not provisioned yet.',code:'storage_not_configured'},503)};
  const auth=await verifyAccessIdentity(request,env);
  if(!auth.configured)return {error:jsonResponse({error:auth.reason,code:'auth_not_configured'},503)};
  if(!auth.identity)return {error:jsonResponse({error:auth.reason,code:'authentication_required'},401)};
  return {db:env.PRIVATE_LIBRARY_DB,identity:auth.identity};
}

async function health(request,env){
  const auth=await verifyAccessIdentity(request,env);
  let dbReady=false,dbDetail='D1 binding PRIVATE_LIBRARY_DB is not configured.';
  if(env.PRIVATE_LIBRARY_DB){
    try{
      await env.PRIVATE_LIBRARY_DB.prepare('SELECT 1 AS ok').first();
      dbReady=true;dbDetail='Private My Library D1 binding is reachable.';
    }catch(e){dbDetail='D1 binding exists but the database query failed.';}
  }
  return jsonResponse({
    ok:true,
    schemaVersion:SYNC_SCHEMA_VERSION,
    storageConfigured:!!env.PRIVATE_LIBRARY_DB,
    storageReady:dbReady,
    storageDetail:dbDetail,
    authConfigured:auth.configured,
    authenticated:!!auth.identity,
    authDetail:auth.identity?'Private account identity verified.':auth.reason,
    maxTrackBytes:MAX_TRACK_BYTES
  });
}

async function listTracks(request,ctx){
  const url=new URL(request.url);
  const since=Math.max(0,Number(url.searchParams.get('since')||0)||0);
  const after=String(url.searchParams.get('after')||'').slice(0,128);
  const limit=Math.min(500,Math.max(1,Number(url.searchParams.get('limit')||200)||200));
  const rows=await ctx.db.prepare(`
    SELECT track_id,revision,name,track_type,payload_json,content_sha256,deleted,created_at,updated_at,device_id
    FROM private_library_tracks
    WHERE owner_id=?1 AND (updated_at>?2 OR (updated_at=?2 AND track_id>?3))
    ORDER BY updated_at ASC,track_id ASC
    LIMIT ?4
  `).bind(ctx.identity.ownerId,since,after,limit).all();
  const items=(rows.results||[]).map(r=>({
    track_id:r.track_id,revision:r.revision,name:r.name,type:r.track_type,
    track:r.deleted?null:JSON.parse(r.payload_json),sha256:r.content_sha256,
    deleted:!!r.deleted,created_at:r.created_at,updated_at:r.updated_at,device_id:r.device_id||null
  }));
  const last=items[items.length-1];
  return jsonResponse({items,next:last?{since:last.updated_at,after:last.track_id}:{since,after},has_more:items.length===limit});
}

async function getTrack(ctx,id){
  const row=await ctx.db.prepare(`
    SELECT track_id,revision,name,track_type,payload_json,content_sha256,deleted,created_at,updated_at,device_id
    FROM private_library_tracks WHERE owner_id=?1 AND track_id=?2
  `).bind(ctx.identity.ownerId,id).first();
  if(!row)return jsonResponse({error:'Track not found.',code:'not_found'},404);
  return jsonResponse({track_id:row.track_id,revision:row.revision,name:row.name,type:row.track_type,track:row.deleted?null:JSON.parse(row.payload_json),sha256:row.content_sha256,deleted:!!row.deleted,created_at:row.created_at,updated_at:row.updated_at,device_id:row.device_id||null});
}

async function putTrack(request,ctx,id){
  const body=await readJsonBody(request);
  const baseRevision=Number(body.base_revision);
  if(!Number.isInteger(baseRevision)||baseRevision<0)return jsonResponse({error:'base_revision must be a non-negative integer.',code:'invalid_revision'},400);
  const track=body.track;
  const validation=validateTrack(track,id);
  if(validation)return jsonResponse({error:validation,code:'invalid_track'},400);
  const payload=JSON.stringify(track);
  if(new TextEncoder().encode(payload).byteLength>MAX_TRACK_BYTES)return jsonResponse({error:'Track exceeds the 2 MiB private-sync limit.',code:'track_too_large'},413);
  const hash=await sha256Hex(payload),now=Date.now(),deviceId=String(body.device_id||'').slice(0,128)||null;

  if(baseRevision===0){
    const result=await ctx.db.prepare(`
      INSERT OR IGNORE INTO private_library_tracks
      (owner_id,track_id,revision,name,track_type,payload_json,content_sha256,deleted,created_at,updated_at,device_id)
      VALUES (?1,?2,1,?3,?4,?5,?6,0,?7,?7,?8)
    `).bind(ctx.identity.ownerId,id,track.name.trim(),track.type,payload,hash,now,deviceId).run();
    if(Number(result.meta&&result.meta.changes)!==1){
      const current=await ctx.db.prepare('SELECT revision,updated_at,content_sha256 FROM private_library_tracks WHERE owner_id=?1 AND track_id=?2').bind(ctx.identity.ownerId,id).first();
      return jsonResponse({error:'Cloud track already exists at a newer revision.',code:'revision_conflict',current},409);
    }
    return jsonResponse({track_id:id,revision:1,updated_at:now,sha256:hash},201);
  }

  const next=baseRevision+1;
  const result=await ctx.db.prepare(`
    UPDATE private_library_tracks
    SET revision=?3,name=?4,track_type=?5,payload_json=?6,content_sha256=?7,deleted=0,updated_at=?8,device_id=?9
    WHERE owner_id=?1 AND track_id=?2 AND revision=?10
  `).bind(ctx.identity.ownerId,id,next,track.name.trim(),track.type,payload,hash,now,deviceId,baseRevision).run();
  if(Number(result.meta&&result.meta.changes)!==1){
    const current=await ctx.db.prepare('SELECT revision,updated_at,content_sha256,deleted FROM private_library_tracks WHERE owner_id=?1 AND track_id=?2').bind(ctx.identity.ownerId,id).first();
    return jsonResponse({error:'This track changed on another device. Your local copy was not overwritten.',code:'revision_conflict',current:current||null},409);
  }
  return jsonResponse({track_id:id,revision:next,updated_at:now,sha256:hash});
}

async function deleteTrack(request,ctx,id){
  const body=await readJsonBody(request),baseRevision=Number(body.base_revision);
  if(!Number.isInteger(baseRevision)||baseRevision<1)return jsonResponse({error:'base_revision must identify the cloud revision being deleted.',code:'invalid_revision'},400);
  const now=Date.now(),deviceId=String(body.device_id||'').slice(0,128)||null,next=baseRevision+1;
  const result=await ctx.db.prepare(`
    UPDATE private_library_tracks SET revision=?3,deleted=1,updated_at=?4,device_id=?5
    WHERE owner_id=?1 AND track_id=?2 AND revision=?6 AND deleted=0
  `).bind(ctx.identity.ownerId,id,next,now,deviceId,baseRevision).run();
  if(Number(result.meta&&result.meta.changes)!==1){
    const current=await ctx.db.prepare('SELECT revision,updated_at,deleted FROM private_library_tracks WHERE owner_id=?1 AND track_id=?2').bind(ctx.identity.ownerId,id).first();
    return jsonResponse({error:'Delete was not applied because the cloud track has changed.',code:'revision_conflict',current:current||null},409);
  }
  return jsonResponse({track_id:id,revision:next,deleted:true,updated_at:now});
}

async function handlePrivateApi(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(path===API_PREFIX+'/health'&&request.method==='GET')return health(request,env);
  const ctx=await requirePrivateContext(request,env);
  if(ctx.error)return ctx.error;
  if(path===API_PREFIX+'/tracks'&&request.method==='GET')return listTracks(request,ctx);
  const match=path.match(/^\/api\/private-library\/tracks\/([^/]+)$/);
  if(match){
    const id=decodeURIComponent(match[1]);
    if(!validTrackId(id))return jsonResponse({error:'Invalid track id.',code:'invalid_track_id'},400);
    if(request.method==='GET')return getTrack(ctx,id);
    if(request.method==='PUT')return putTrack(request,ctx,id);
    if(request.method==='DELETE')return deleteTrack(request,ctx,id);
  }
  return jsonResponse({error:'Private library API route not found.',code:'not_found'},404);
}

const PRIVATE_SYNC_CSS=String.raw`
<style id="mancardo-private-sync-foundation-styles">
.mancardo-sync-audit-note{margin:.45rem .9rem .7rem;padding:.5rem .6rem;border:1px solid var(--border);border-radius:4px;background:var(--surface-2);font-size:.68rem;line-height:1.35;color:var(--text-muted)}
</style>`;

const PRIVATE_SYNC_FEATURE=String.raw`
// ---------- Private My Library sync foundation (shadow mode) ----------
(function installMancardoPrivateSyncFoundation(){
  if(window.__mancardoPrivateSyncFoundationInstalled)return;
  window.__mancardoPrivateSyncFoundationInstalled=true;

  var DB_NAME='mancardo_private_workspace_v1',DB_VERSION=1;
  var audit={mode:'shadow',indexedDbReady:false,lastMirrorAt:null,lastMirrorError:null,mirroredTracks:0,cloud:null};
  window.__mancardoPrivateSyncAudit=audit;

  function openDb(){
    return new Promise(function(resolve,reject){
      if(!window.indexedDB){reject(new Error('IndexedDB unavailable'));return;}
      var req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=function(){
        var db=req.result;
        if(!db.objectStoreNames.contains('tracks'))db.createObjectStore('tracks',{keyPath:'id'});
        if(!db.objectStoreNames.contains('outbox'))db.createObjectStore('outbox',{keyPath:'seq',autoIncrement:true});
        if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta',{keyPath:'key'});
      };
      req.onerror=function(){reject(req.error||new Error('IndexedDB open failed'));};
      req.onsuccess=function(){resolve(req.result);};
    });
  }

  function digest(text){
    if(!window.crypto||!crypto.subtle)return Promise.resolve('');
    return crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)).then(function(buf){return Array.prototype.map.call(new Uint8Array(buf),function(b){return b.toString(16).padStart(2,'0');}).join('');}).catch(function(){return '';});
  }

  function mirrorLibrary(){
    var snapshot=[];
    try{snapshot=Array.isArray(state&&state.library)?state.library.map(function(x){return deepClone(x);}):[];}catch(e){return Promise.resolve();}
    return openDb().then(function(db){
      audit.indexedDbReady=true;
      return Promise.all(snapshot.map(function(track){
        var payload=JSON.stringify(track);
        return digest(payload).then(function(hash){return {id:String(track.id),payload:track,sha256:hash,mirroredAt:Date.now(),syncState:'local-only'};});
      })).then(function(records){
        return new Promise(function(resolve,reject){
          var tx=db.transaction(['tracks','meta'],'readwrite'),store=tx.objectStore('tracks');
          records.forEach(function(rec){store.put(rec);});
          tx.objectStore('meta').put({key:'lastMirror',at:Date.now(),count:records.length});
          tx.oncomplete=function(){db.close();audit.lastMirrorAt=Date.now();audit.lastMirrorError=null;audit.mirroredTracks=records.length;resolve();};
          tx.onerror=function(){var err=tx.error||new Error('IndexedDB mirror failed');db.close();reject(err);};
        });
      });
    }).catch(function(e){audit.indexedDbReady=false;audit.lastMirrorError=String(e&&e.message||e);});
  }

  // Keep the established localStorage workflow untouched. After it successfully
  // persists, refresh a shadow IndexedDB mirror for managed-device and migration testing.
  if(typeof persistLibrary==='function'){
    var basePersistLibraryForPrivateSync=persistLibrary;
    persistLibrary=function(){
      var result=basePersistLibraryForPrivateSync.apply(this,arguments);
      setTimeout(mirrorLibrary,0);
      return result;
    };
  }
  setTimeout(mirrorLibrary,250);

  function setCompatRow(id,name,ok,detail){
    var list=document.getElementById('mancardoDeviceCompatList');if(!list)return;
    var row=document.getElementById('mancardoCompat_'+id);
    if(!row){row=document.createElement('div');row.id='mancardoCompat_'+id;list.appendChild(row);}
    row.className='mancardo-device-row '+(ok===null?'pending':(ok?'pass':'fail'));
    row.dataset.ok=ok===null?'':(ok?'1':'0');
    row.innerHTML='<div class="mancardo-device-icon">'+(ok===null?'…':(ok?'✓':'×'))+'</div><div><div class="mancardo-device-name"></div><div class="mancardo-device-detail"></div></div>';
    row.querySelector('.mancardo-device-name').textContent=name;row.querySelector('.mancardo-device-detail').textContent=detail;
  }

  function refreshCompatSummary(){
    var list=document.getElementById('mancardoDeviceCompatList'),summary=document.getElementById('mancardoDeviceCompatSummary');if(!list||!summary)return;
    var rows=list.querySelectorAll('.mancardo-device-row'),pending=0,fail=0;
    Array.prototype.forEach.call(rows,function(r){if(r.classList.contains('pending'))pending++;else if(r.classList.contains('fail'))fail++;});
    if(pending)return;
    summary.textContent=fail===0?'All compatibility and private-sync readiness checks passed on this device.':fail+' check'+(fail===1?'':'s')+' need attention. Failed items include a short explanation; optional failures do not necessarily prevent core local editing.';
  }

  function runPrivateReadiness(){
    setCompatRow('privateMirror','Private local workspace',null,'Checking IndexedDB shadow mirror…');
    setCompatRow('privateCloud','Private cloud storage',null,'Checking private My Library cloud service…');
    setCompatRow('privateAuth','Private account authentication',null,'Checking private account sign-in readiness…');
    mirrorLibrary().then(function(){
      setCompatRow('privateMirror','Private local workspace',audit.indexedDbReady,audit.indexedDbReady?'My Library can be mirrored safely into IndexedDB ('+audit.mirroredTracks+' track'+(audit.mirroredTracks===1?'':'s')+').':'IndexedDB mirror failed: '+(audit.lastMirrorError||'browser policy blocked the database.'));
      refreshCompatSummary();
    });
    fetch('/api/private-library/health',{cache:'no-store',credentials:'same-origin'}).then(function(r){return r.json();}).then(function(h){
      audit.cloud=h;
      var cloudOk=!!(h.storageConfigured&&h.storageReady);
      setCompatRow('privateCloud','Private cloud storage',cloudOk,cloudOk?'Private My Library D1 storage is provisioned and reachable.':String(h.storageDetail||'Private cloud storage is not configured yet.'));
      setCompatRow('privateAuth','Private account authentication',!!h.authenticated,h.authenticated?'Private account identity is verified on this device.':String(h.authDetail||'Private account sign-in is not configured or not active.'));
      refreshCompatSummary();
    }).catch(function(){
      setCompatRow('privateCloud','Private cloud storage',false,'Private cloud readiness endpoint could not be reached.');
      setCompatRow('privateAuth','Private account authentication',false,'Authentication readiness could not be checked.');
      refreshCompatSummary();
    });
  }

  document.addEventListener('click',function(ev){
    var t=ev.target;if(!t||!t.closest)return;
    if(t.closest('#mancardoDeviceCheckBtn')||t.closest('#mancardoDeviceCompatRun'))setTimeout(runPrivateReadiness,30);
  },true);
})();
`;

function injectPrivateSync(html){
  if(html.includes('installMancardoPrivateSyncFoundation'))return html;
  html=html.replace('</head>',PRIVATE_SYNC_CSS+'\n</head>');
  const close=html.lastIndexOf('})();');
  if(close===-1)return html;
  return html.slice(0,close)+PRIVATE_SYNC_FEATURE+'\n'+html.slice(close);
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname.startsWith(API_PREFIX+'/')){
      try{return await handlePrivateApi(request,env);}catch(e){return jsonResponse({error:e&&e.message?e.message:'Private library request failed.',code:'server_error'},Number(e&&e.status)||500);}
    }
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=injectPrivateSync(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
