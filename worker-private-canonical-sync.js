import baseWorker from './worker-private-replication-fix.js';

const PREFIX='/api/private-library/canonical/tracks';
const MAX_TRACK_BYTES=1_750_000;

function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
function cookieValue(header,name){
  for(const part of String(header||'').split(';')){
    const i=part.indexOf('=');
    if(i<0)continue;
    if(part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim());
  }
  return '';
}
function decodePayload(token){
  try{
    const p=String(token||'').split('.')[1];
    if(!p)return null;
    let s=p.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';
    const raw=atob(s),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  }catch(e){return null;}
}
function bytes(text){return new TextEncoder().encode(String(text||'')).byteLength;}
function validId(id){return /^[A-Za-z0-9._:-]{1,128}$/.test(String(id||''));}
function validateTrack(t,id){
  if(!t||typeof t!=='object'||Array.isArray(t))return 'Track payload must be an object.';
  if(!validId(t.id)||String(t.id)!==String(id))return 'Track id is invalid.';
  if(t.type!=='track'&&t.type!=='route')return 'Track type must be track or route.';
  if(typeof t.name!=='string'||!t.name.trim()||t.name.length>240)return 'Track name is invalid.';
  if(!Array.isArray(t.segments))return 'Track segments must be an array.';
  for(const seg of t.segments){
    if(!Array.isArray(seg))return 'Track segment is invalid.';
    for(const p of seg){
      if(!p||typeof p!=='object'||!Number.isFinite(p.lat)||!Number.isFinite(p.lon))return 'Track contains invalid coordinates.';
      if(p.lat < -90 || p.lat > 90 || p.lon < -180 || p.lon > 180)return 'Track contains invalid coordinates.';
    }
  }
  return '';
}
async function auth(request,env,ctx){
  const u=new URL(request.url);u.pathname='/api/private-library/health';u.search='';
  const probe=await baseWorker.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env,ctx);
  let h={};try{h=await probe.json();}catch(e){}
  if(!h.authenticated||!h.accountLabel||!h.storageReady)return {error:json({error:'Private sync authentication or storage is not ready.'},401)};
  const email=String(h.accountLabel||'').trim().toLowerCase();
  if(!email||email.indexOf('@')<1)return {error:json({error:'Authenticated email identity is unavailable.'},401)};
  let token=String(request.headers.get('Cf-Access-Jwt-Assertion')||'').trim();
  if(!token)token=cookieValue(request.headers.get('cookie'),'CF_Authorization');
  const payload=decodePayload(token)||{};
  return {db:env.PRIVATE_LIBRARY_DB,owner:'email:'+email,legacyOwner:String(payload.sub||'').trim(),email};
}
async function migrateLegacy(a){
  if(!a.legacyOwner||a.legacyOwner===a.owner)return;
  try{
    await a.db.prepare(`INSERT OR IGNORE INTO private_library_tracks
      (owner_id,track_id,revision,name,track_type,payload_json,content_sha256,deleted,created_at,updated_at,device_id)
      SELECT ?1,track_id,revision,name,track_type,payload_json,content_sha256,deleted,created_at,updated_at,device_id
      FROM private_library_tracks WHERE owner_id=?2`).bind(a.owner,a.legacyOwner).run();
  }catch(e){}
}
async function list(a){
  await migrateLegacy(a);
  const r=await a.db.prepare(`SELECT track_id,revision,payload_json,content_sha256,deleted,updated_at,device_id
    FROM private_library_tracks WHERE owner_id=?1 ORDER BY updated_at ASC,track_id ASC`).bind(a.owner).all();
  const items=(r.results||[]).map(x=>({track_id:x.track_id,revision:x.revision,track:x.deleted?null:JSON.parse(x.payload_json),sha256:x.content_sha256,deleted:!!x.deleted,updated_at:x.updated_at,device_id:x.device_id||null}));
  return json({ok:true,count:items.filter(x=>!x.deleted).length,items});
}
async function put(request,a,id){
  if(!validId(id))return json({error:'Invalid track id.'},400);
  const raw=await request.text();
  if(bytes(raw)>MAX_TRACK_BYTES+65536)return json({error:'Track upload is too large.'},413);
  let body={};try{body=JSON.parse(raw||'{}');}catch(e){return json({error:'Invalid JSON.'},400);}
  const track=body.track,err=validateTrack(track,id);if(err)return json({error:err},400);
  const payload=JSON.stringify(track);if(bytes(payload)>MAX_TRACK_BYTES)return json({error:'Track upload is too large.'},413);
  await migrateLegacy(a);
  const existing=await a.db.prepare('SELECT revision,deleted FROM private_library_tracks WHERE owner_id=?1 AND track_id=?2').bind(a.owner,id).first();
  if(existing&&!existing.deleted)return json({ok:true,track_id:id,revision:Number(existing.revision),existing:true});
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload));
  const hash=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
  const now=Date.now(),device=String(body.device_id||'').slice(0,128)||null;
  if(existing){
    const next=Number(existing.revision||0)+1;
    await a.db.prepare(`UPDATE private_library_tracks SET revision=?3,name=?4,track_type=?5,payload_json=?6,content_sha256=?7,deleted=0,updated_at=?8,device_id=?9 WHERE owner_id=?1 AND track_id=?2`).bind(a.owner,id,next,track.name.trim(),track.type,payload,hash,now,device).run();
    return json({ok:true,track_id:id,revision:next});
  }
  await a.db.prepare(`INSERT INTO private_library_tracks (owner_id,track_id,revision,name,track_type,payload_json,content_sha256,deleted,created_at,updated_at,device_id) VALUES (?1,?2,1,?3,?4,?5,?6,0,?7,?7,?8)`).bind(a.owner,id,track.name.trim(),track.type,payload,hash,now,device).run();
  return json({ok:true,track_id:id,revision:1},201);
}

const CLIENT=String.raw`
<script id="mancardo-canonical-private-sync">
(function(){
  if(window.__mancardoCanonicalPrivateSyncInstalled)return;window.__mancardoCanonicalPrivateSyncInstalled=true;
  var KEY='switchback_local_tracks_v1',running=false;
  function api(path,opts){opts=opts||{};opts.credentials='include';opts.cache='no-store';opts.headers=Object.assign({'accept':'application/json'},opts.headers||{});return fetch('/api/private-library/canonical/tracks'+path,opts);}
  function j(r){return r.json().catch(function(){return {};}).then(function(d){return {r:r,d:d};});}
  function local(){try{var x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
  function save(x){localStorage.setItem(KEY,JSON.stringify(x));}
  function device(){try{return localStorage.getItem('mancardo_private_device_id_v1')||'';}catch(e){return '';}}
  function run(){
    if(running||!navigator.onLine)return Promise.resolve(false);running=true;
    return api('').then(j).then(function(x){
      if(!x.r.ok)throw new Error((x.d&&x.d.error)||('HTTP '+x.r.status));
      var lib=local(),cloud=x.d.items||[],cloudBy={},localBy={},added=0;
      cloud.forEach(function(c){cloudBy[String(c.track_id)]=c;});
      lib.forEach(function(t){if(t&&t.id)localBy[String(t.id)]=t;});
      cloud.forEach(function(c){if(!c.deleted&&c.track&&!localBy[String(c.track_id)]){lib.unshift(c.track);localBy[String(c.track_id)]=c.track;added++;}});
      if(added)save(lib);
      var chain=Promise.resolve();
      lib.forEach(function(t){if(!t||!t.id||cloudBy[String(t.id)])return;chain=chain.then(function(){return api('/'+encodeURIComponent(t.id),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({track:t,device_id:device()})}).then(j).then(function(y){if(!y.r.ok)throw new Error((y.d&&y.d.error)||('Upload HTTP '+y.r.status));});});});
      return chain.then(function(){return api('').then(j);}).then(function(y){
        if(!y.r.ok)throw new Error((y.d&&y.d.error)||('HTTP '+y.r.status));
        var msg=document.getElementById('mancardoPrivateSyncMessage');if(msg)msg.textContent='Private cloud canonical sync: '+lib.length+' local / '+(y.d.count||0)+' cloud tracks.';
        if(added)setTimeout(function(){location.reload();},350);
        return true;
      });
    }).catch(function(e){var msg=document.getElementById('mancardoPrivateSyncMessage');if(msg)msg.textContent='Private canonical sync failed: '+(e&&e.message?e.message:'unknown error');console.warn('canonical private sync failed',e);return false;}).finally(function(){running=false;});
  }
  document.addEventListener('click',function(ev){var t=ev.target;if(t&&t.closest&&t.closest('#mancardoPrivateSyncNow'))setTimeout(run,250);},true);
  window.addEventListener('focus',function(){setTimeout(run,450);});window.addEventListener('online',function(){setTimeout(run,450);});
  setTimeout(run,1800);
})();
</script>`;

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname===PREFIX&&request.method==='GET'){
      const a=await auth(request,env,ctx);if(a.error)return a.error;return list(a);
    }
    const m=url.pathname.match(/^\/api\/private-library\/canonical\/tracks\/([^/]+)$/);
    if(m&&request.method==='PUT'){
      const a=await auth(request,env,ctx);if(a.error)return a.error;return put(request,a,decodeURIComponent(m[1]));
    }
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=await response.text();
    if(!html.includes('mancardo-canonical-private-sync')){
      const i=html.toLowerCase().lastIndexOf('</body>');html=i>=0?html.slice(0,i)+CLIENT+'\n'+html.slice(i):html+CLIENT;
    }
    const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};