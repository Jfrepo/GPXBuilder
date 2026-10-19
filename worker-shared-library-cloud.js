import baseWorker from './worker-private-library-sync-button-fix.js';

const SHARED_PREFIX='/api/tracks';
const MAX_GPX_BYTES=1_500_000;

const SHARED_AUTH_UI=String.raw`
<script id="mancardo-shared-auth-guard">
(function(){
  function isShareButton(btn){
    if(!btn||btn.dataset.mancardoSharedAuthBypass==='1')return false;
    var t=(btn.textContent||'').trim().toLowerCase();
    return t==='share'||t==='publish'||t.indexOf('publish')===0;
  }
  function runOriginal(btn){
    btn.dataset.mancardoSharedAuthBypass='1';
    try{btn.click();}finally{setTimeout(function(){delete btn.dataset.mancardoSharedAuthBypass;},0);}
  }
  function mobileLike(){
    try{return window.matchMedia&&window.matchMedia('(pointer: coarse)').matches;}catch(e){}
    return window.innerWidth<760;
  }
  function showSignIn(){
    var overlay=document.getElementById('mancardoPrivateSyncOverlay');
    var msg=document.getElementById('mancardoPrivateSyncMessage');
    var chip=document.getElementById('mancardoPrivateSyncChip');
    if(overlay){
      overlay.classList.remove('hidden');
      if(msg)msg.textContent='Sign in is required before publishing to Shared Library. Tap Sign in, complete the Cloudflare Access login, then return and tap Share again.';
      return true;
    }
    if(chip){try{chip.click();return true;}catch(e){}}
    return false;
  }
  document.addEventListener('click',function(ev){
    var btn=ev.target&&ev.target.closest?ev.target.closest('button'):null;
    if(!isShareButton(btn))return;
    ev.preventDefault();
    ev.stopImmediatePropagation();

    var isMobile=mobileLike();
    var popup=null;
    if(!isMobile){
      try{popup=window.open('about:blank','mancardo-private-login','width=640,height=700');}catch(e){}
    }
    fetch('/api/private-library/health',{credentials:'include',cache:'no-store',headers:{accept:'application/json'}})
      .then(function(r){return r.json().catch(function(){return {};});})
      .then(function(h){
        if(h&&h.authenticated&&h.accountKey){
          if(popup&&!popup.closed)popup.close();
          runOriginal(btn);
          return;
        }
        if(isMobile){
          if(popup&&!popup.closed)popup.close();
          if(!showSignIn())alert('Sign in is required before publishing to Shared Library. Open the cloud sync control, choose Sign in, then try Share again.');
          return;
        }
        if(popup&&!popup.closed){
          popup.location='/api/private-library/login';
          try{popup.focus();}catch(e){}
        }else if(!showSignIn()){
          alert('Sign in is required before publishing to Shared Library. Open the cloud sync control, choose Sign in, then try Share again.');
        }
      })
      .catch(function(){
        if(popup&&!popup.closed)popup.close();
        if(!showSignIn())alert('Could not verify your ManCardo account. Please sign in using the cloud sync control, then try Share again.');
      });
  },true);
})();
</script>`;

function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
function text(data,status=200,type='text/plain; charset=utf-8'){
  return new Response(data,{status,headers:{'content-type':type,'cache-control':'no-store'}});
}
function bytes(s){return new TextEncoder().encode(String(s||'')).byteLength;}
function cleanName(v){const s=String(v||'').trim();return s&&s.length<=240?s:'';}
function cleanLabel(v){const s=String(v||'').trim();return s&&s.length<=120?s:'';}
function decodeXmlText(v){return String(v||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&').trim();}
function gpxItemName(gpx){
  const s=String(gpx||'');
  let m=s.match(/<trk\b[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>/i);
  if(!m)m=s.match(/<rte\b[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>/i);
  return cleanName(m?decodeXmlText(m[1]):'');
}
function cookieValue(header,name){
  const parts=String(header||'').split(';');
  for(const p of parts){const i=p.indexOf('=');if(i<0)continue;if(p.slice(0,i).trim()===name)return decodeURIComponent(p.slice(i+1).trim());}
  return '';
}
async function authContext(request,env,ctx){
  const url=new URL(request.url);url.pathname='/api/private-library/health';url.search='';
  const headers=new Headers(request.headers);
  if(!headers.get('Cf-Access-Jwt-Assertion')){
    const jwt=cookieValue(headers.get('cookie'),'CF_Authorization');
    if(jwt)headers.set('Cf-Access-Jwt-Assertion',jwt);
  }
  const probe=await baseWorker.fetch(new Request(url.toString(),{method:'GET',headers}),env,ctx);
  let h={};try{h=await probe.json();}catch(e){}
  if(!h.authConfigured)return {error:json({error:'Shared Library authentication is not configured.',code:'auth_not_configured'},503)};
  if(!h.authenticated)return {error:json({error:'Sign in is required for Shared Library.',code:'authentication_required'},401)};
  return {accountKey:String(h.accountKey||''),accountLabel:String(h.accountLabel||'Private account')};
}
function authenticatedDisplayName(auth){
  const raw=String(auth&&auth.accountLabel||'').trim().toLowerCase();
  const local=(raw.split('@')[0]||raw).replace(/[^a-z0-9]+/g,' ');
  if(/\bpaul\b/.test(local))return 'Paul';
  if(/\bjustin\b|\bjay\b|fenno/.test(local))return 'Justin';
  return 'Shared user';
}
async function schemaReady(env){
  if(!env.PRIVATE_LIBRARY_DB)return false;
  try{
    const row=await env.PRIVATE_LIBRARY_DB.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('shared_library_tracks','shared_library_versions','trg_shared_library_tracks_after_insert','trg_shared_library_tracks_after_update')").first();
    return Number(row&&row.n)===4;
  }catch(e){return false;}
}
async function bodyJson(request){
  const len=Number(request.headers.get('content-length')||0);if(len>MAX_GPX_BYTES+65536)throw Object.assign(new Error('Request is too large.'),{status:413});
  const raw=await request.text();if(bytes(raw)>MAX_GPX_BYTES+65536)throw Object.assign(new Error('Request is too large.'),{status:413});
  try{return JSON.parse(raw||'{}');}catch(e){throw Object.assign(new Error('Request body is not valid JSON.'),{status:400});}
}
function identityLabel(auth){return authenticatedDisplayName(auth);}
async function listTracks(db){
  const r=await db.prepare('SELECT track_id,name,current_version,created_at,modified_at,modified_by FROM shared_library_tracks WHERE deleted=0 ORDER BY modified_at DESC, track_id ASC').all();
  return json({tracks:(r.results||[]).map(x=>({id:x.track_id,name:x.name,version:x.current_version,createdAt:new Date(Number(x.created_at)).toISOString(),modifiedAt:new Date(Number(x.modified_at)).toISOString(),modifiedBy:x.modified_by}))});
}
async function getGpx(db,id){
  const r=await db.prepare('SELECT gpx FROM shared_library_tracks WHERE track_id=?1 AND deleted=0').bind(id).first();
  if(!r)return json({error:'Shared track not found.',code:'not_found'},404);
  return text(r.gpx,200,'application/gpx+xml; charset=utf-8');
}
async function createTrack(request,db,auth){
  const b=await bodyJson(request),name=cleanName(b.name),gpx=String(b.gpx||'');
  if(!name)return json({error:'Track name is required.',code:'invalid_name'},400);
  if(!gpx.trim())return json({error:'GPX data is required.',code:'invalid_gpx'},400);
  if(bytes(gpx)>MAX_GPX_BYTES)return json({error:'Shared track exceeds the cloud storage limit.',code:'track_too_large'},413);
  const id=crypto.randomUUID(),now=Date.now(),who=identityLabel(auth);
  await db.prepare('INSERT INTO shared_library_tracks (track_id,name,current_version,gpx,created_at,modified_at,created_by,modified_by,deleted) VALUES (?1,?2,1,?3,?4,?4,?5,?5,0)').bind(id,name,gpx,now,who).run();
  return json({id,version:1,modifiedAt:new Date(now).toISOString(),modifiedBy:who},201);
}
// History triggers and cascading deletes contribute to D1 meta.changes. Only
// this statement's atomic RETURNING rows identify whether its predicate matched.
// A malformed acknowledgement is uncertain, not proof of rollback or a retry.
function sharedMutationRow(result,expected){
  if(!result||result.success!==true||!Array.isArray(result.results)||result.results.length>1)
    throw new Error('Shared Library mutation acknowledgement is uncertain. Read current state before retrying.');
  if(result.results.length===0)return null;
  const row=result.results[0];
  if(!row||typeof row!=='object'||Object.entries(expected).some(([key,value])=>row[key]!==value))
    throw new Error('Shared Library mutation acknowledgement is uncertain. Read current state before retrying.');
  return row;
}
async function publishTrack(request,db,auth,id){
  const b=await bodyJson(request),gpx=String(b.gpx||''),base=Number(b.basedOnVersion),who=identityLabel(auth);
  if(!Number.isInteger(base)||base<1)return json({error:'basedOnVersion must identify the Shared version being edited.',code:'invalid_version'},400);
  if(!gpx.trim())return json({error:'GPX data is required.',code:'invalid_gpx'},400);
  if(bytes(gpx)>MAX_GPX_BYTES)return json({error:'Shared track exceeds the cloud storage limit.',code:'track_too_large'},413);
  const current=await db.prepare('SELECT current_version,name,deleted FROM shared_library_tracks WHERE track_id=?1').bind(id).first();
  if(!current||current.deleted)return json({error:'Shared track not found.',code:'not_found'},404);

  const incomingName=gpxItemName(gpx);
  if(incomingName&&incomingName!==String(current.name||'')){
    const newId=crypto.randomUUID(),now=Date.now();
    await db.prepare('INSERT INTO shared_library_tracks (track_id,name,current_version,gpx,created_at,modified_at,created_by,modified_by,deleted) VALUES (?1,?2,1,?3,?4,?4,?5,?5,0)').bind(newId,incomingName,gpx,now,who).run();
    return json({id:newId,version:1,modifiedAt:new Date(now).toISOString(),modifiedBy:who,forkedFrom:id},201);
  }

  if(Number(current.current_version)!==base)return json({error:'A newer Shared version exists.',code:'revision_conflict',currentVersion:Number(current.current_version)},409);
  const next=base+1,now=Date.now();
  const result=await db.prepare('UPDATE shared_library_tracks SET current_version=?2,gpx=?3,modified_at=?4,modified_by=?5 WHERE track_id=?1 AND current_version=?6 AND deleted=0 RETURNING track_id,current_version,gpx,modified_at,modified_by,deleted').bind(id,next,gpx,now,who,base).all();
  if(!sharedMutationRow(result,{track_id:id,current_version:next,gpx,modified_at:now,modified_by:who,deleted:0})){const latest=await db.prepare('SELECT current_version FROM shared_library_tracks WHERE track_id=?1').bind(id).first();return json({error:'A newer Shared version exists.',code:'revision_conflict',currentVersion:Number(latest&&latest.current_version)||base},409);}
  return json({id,version:next,modifiedAt:new Date(now).toISOString(),modifiedBy:who});
}
async function deleteTrack(db,id){
  const result=await db.prepare('DELETE FROM shared_library_tracks WHERE track_id=?1 RETURNING track_id').bind(id).all();
  const deleted=!!sharedMutationRow(result,{track_id:id});
  return json({ok:true,id,deleted,alreadyDeleted:!deleted});
}
async function handleShared(request,env,ctx){
  if(!(await schemaReady(env)))return json({error:'Shared Library cloud schema is not ready yet.',code:'storage_not_configured'},503);
  const auth=await authContext(request,env,ctx);if(auth.error)return auth.error;
  const db=env.PRIVATE_LIBRARY_DB,url=new URL(request.url),path=url.pathname;
  try{
    if(path===SHARED_PREFIX&&request.method==='GET')return listTracks(db);
    if(path===SHARED_PREFIX&&request.method==='POST')return createTrack(request,db,auth);
    let m=path.match(/^\/api\/tracks\/([^/]+)\/gpx$/);if(m&&request.method==='GET')return getGpx(db,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/tracks\/([^/]+)\/publish$/);if(m&&request.method==='POST')return await publishTrack(request,db,auth,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/tracks\/([^/]+)$/);if(m&&request.method==='DELETE')return await deleteTrack(db,decodeURIComponent(m[1]));
    return json({error:'Shared Library API route not found.',code:'not_found'},404);
  }catch(e){return json({error:e&&e.message?e.message:'Shared Library request failed.',code:'shared_error'},Number(e&&e.status)||500);}
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname===SHARED_PREFIX||url.pathname.startsWith(SHARED_PREFIX+'/'))return handleShared(request,env,ctx);
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=await response.text();
    html=html.replace("var SHARED_API = 'https://api.mancardo.com';","var SHARED_API = '';");
    if(!html.includes('mancardo-shared-auth-guard')){
      const i=html.toLowerCase().lastIndexOf('</body>');
      html=i>=0?html.slice(0,i)+SHARED_AUTH_UI+'\n'+html.slice(i):html+SHARED_AUTH_UI;
    }
    const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
