import baseWorker from './worker-private-delete-tombstone-fix.js';

const PREFIX='/api/private-library/canonical/waypoints';
const MAX_WAYPOINT_BYTES=32768;

function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
function bytes(text){return new TextEncoder().encode(String(text||'')).byteLength;}
function validId(id){return /^[A-Za-z0-9._:-]{1,128}$/.test(String(id||''));}
function cookieValue(header,name){
  for(const part of String(header||'').split(';')){
    const i=part.indexOf('=');if(i<0)continue;
    if(part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim());
  }
  return '';
}
function decodePayload(token){
  try{
    const p=String(token||'').split('.')[1];if(!p)return null;
    let s=p.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';
    const raw=atob(s),b=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)b[i]=raw.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(b));
  }catch(e){return null;}
}
async function auth(request,env,ctx){
  const u=new URL(request.url);u.pathname='/api/private-library/health';u.search='';
  const probe=await baseWorker.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env,ctx);
  let h={};try{h=await probe.json();}catch(e){}
  if(!h.authenticated||!h.accountLabel||!h.storageReady||!env.PRIVATE_LIBRARY_DB){
    return {error:json({error:'Private sync authentication or storage is not ready.'},401)};
  }
  const email=String(h.accountLabel||'').trim().toLowerCase();
  if(!email||email.indexOf('@')<1)return {error:json({error:'Authenticated email identity is unavailable.'},401)};
  let token=String(request.headers.get('Cf-Access-Jwt-Assertion')||'').trim();
  if(!token)token=cookieValue(request.headers.get('cookie'),'CF_Authorization');
  const payload=decodePayload(token)||{};
  return {db:env.PRIVATE_LIBRARY_DB,owner:'email:'+email,legacyOwner:String(payload.sub||'').trim()};
}
async function ensureSchema(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS private_library_waypoints (
    owner_id TEXT NOT NULL,
    waypoint_id TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    payload_json TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    client_modified_at INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    device_id TEXT,
    PRIMARY KEY (owner_id, waypoint_id)
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_private_library_waypoints_owner_updated ON private_library_waypoints(owner_id,updated_at,waypoint_id)').run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS private_library_waypoint_revisions (
    owner_id TEXT NOT NULL,
    waypoint_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    client_modified_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    device_id TEXT,
    PRIMARY KEY (owner_id, waypoint_id, revision)
  )`).run();
  await db.prepare(`CREATE TRIGGER IF NOT EXISTS trg_private_library_waypoints_after_insert AFTER INSERT ON private_library_waypoints BEGIN
    INSERT OR REPLACE INTO private_library_waypoint_revisions(owner_id,waypoint_id,revision,payload_json,deleted,client_modified_at,updated_at,device_id)
    VALUES(NEW.owner_id,NEW.waypoint_id,NEW.revision,NEW.payload_json,NEW.deleted,NEW.client_modified_at,NEW.updated_at,NEW.device_id);
  END`).run();
  await db.prepare(`CREATE TRIGGER IF NOT EXISTS trg_private_library_waypoints_after_update AFTER UPDATE ON private_library_waypoints BEGIN
    INSERT OR REPLACE INTO private_library_waypoint_revisions(owner_id,waypoint_id,revision,payload_json,deleted,client_modified_at,updated_at,device_id)
    VALUES(NEW.owner_id,NEW.waypoint_id,NEW.revision,NEW.payload_json,NEW.deleted,NEW.client_modified_at,NEW.updated_at,NEW.device_id);
  END`).run();
}
async function migrateLegacy(a){
  if(!a.legacyOwner||a.legacyOwner===a.owner)return;
  try{
    await a.db.prepare(`INSERT OR IGNORE INTO private_library_waypoints
      (owner_id,waypoint_id,revision,payload_json,deleted,client_modified_at,created_at,updated_at,device_id)
      SELECT ?1,waypoint_id,revision,payload_json,deleted,client_modified_at,created_at,updated_at,device_id
      FROM private_library_waypoints WHERE owner_id=?2`).bind(a.owner,a.legacyOwner).run();
  }catch(e){}
}
function validateWaypoint(w,id){
  if(!w||typeof w!=='object'||Array.isArray(w))return 'Waypoint payload must be an object.';
  if(!validId(w.id)||String(w.id)!==String(id))return 'Waypoint id is invalid.';
  if(typeof w.name!=='string'||!w.name.trim()||w.name.length>240)return 'Waypoint name is invalid.';
  if(!Number.isFinite(+w.lat)||!Number.isFinite(+w.lon))return 'Waypoint coordinates are invalid.';
  if(+w.lat < -90 || +w.lat > 90 || +w.lon < -180 || +w.lon > 180)return 'Waypoint coordinates are invalid.';
  if(w.icon!=null&&typeof w.icon!=='string')return 'Waypoint icon is invalid.';
  if(w.visible!=null&&typeof w.visible!=='boolean')return 'Waypoint visibility is invalid.';
  return '';
}
function clientModifiedAt(w){
  const t=Date.parse(String((w&&w.updatedAt)||(w&&w.createdAt)||''));
  return Number.isFinite(t)?t:0;
}
async function list(a){
  await ensureSchema(a.db);await migrateLegacy(a);
  const r=await a.db.prepare(`SELECT waypoint_id,revision,payload_json,deleted,client_modified_at,updated_at,device_id
    FROM private_library_waypoints WHERE owner_id=?1 ORDER BY updated_at ASC,waypoint_id ASC`).bind(a.owner).all();
  const items=(r.results||[]).map(x=>({waypoint_id:x.waypoint_id,revision:Number(x.revision)||1,waypoint:x.deleted?null:JSON.parse(x.payload_json),deleted:!!x.deleted,client_modified_at:Number(x.client_modified_at)||0,updated_at:Number(x.updated_at)||0,device_id:x.device_id||null}));
  return json({ok:true,count:items.filter(x=>!x.deleted).length,items});
}
async function put(request,a,id){
  if(!validId(id))return json({error:'Invalid waypoint id.'},400);
  const raw=await request.text();if(bytes(raw)>MAX_WAYPOINT_BYTES+4096)return json({error:'Waypoint upload is too large.'},413);
  let body={};try{body=JSON.parse(raw||'{}');}catch(e){return json({error:'Invalid JSON.'},400);}
  const w=body.waypoint,err=validateWaypoint(w,id);if(err)return json({error:err},400);
  const payload=JSON.stringify(w);if(bytes(payload)>MAX_WAYPOINT_BYTES)return json({error:'Waypoint upload is too large.'},413);
  await ensureSchema(a.db);await migrateLegacy(a);
  const existing=await a.db.prepare('SELECT revision,deleted,client_modified_at FROM private_library_waypoints WHERE owner_id=?1 AND waypoint_id=?2').bind(a.owner,id).first();
  const cm=clientModifiedAt(w),now=Date.now(),device=String(body.device_id||'').slice(0,128)||null;
  if(existing && !existing.deleted && Number(existing.client_modified_at||0)>cm){
    return json({ok:true,waypoint_id:id,revision:Number(existing.revision)||1,ignored_older:true});
  }
  if(existing){
    const next=(Number(existing.revision)||0)+1;
    await a.db.prepare(`UPDATE private_library_waypoints SET revision=?3,payload_json=?4,deleted=0,client_modified_at=?5,updated_at=?6,device_id=?7 WHERE owner_id=?1 AND waypoint_id=?2`)
      .bind(a.owner,id,next,payload,cm,now,device).run();
    return json({ok:true,waypoint_id:id,revision:next});
  }
  await a.db.prepare(`INSERT INTO private_library_waypoints(owner_id,waypoint_id,revision,payload_json,deleted,client_modified_at,created_at,updated_at,device_id)
    VALUES(?1,?2,1,?3,0,?4,?5,?5,?6)`).bind(a.owner,id,payload,cm,now,device).run();
  return json({ok:true,waypoint_id:id,revision:1},201);
}
async function softDelete(a,id){
  if(!validId(id))return json({error:'Invalid waypoint id.'},400);
  await ensureSchema(a.db);await migrateLegacy(a);
  const row=await a.db.prepare('SELECT revision,deleted,payload_json,client_modified_at,created_at FROM private_library_waypoints WHERE owner_id=?1 AND waypoint_id=?2').bind(a.owner,id).first();
  const now=Date.now();
  if(!row){
    const payload=JSON.stringify({id:id,name:'Deleted waypoint',lat:0,lon:0,icon:'pin',visible:false,createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString()});
    await a.db.prepare(`INSERT INTO private_library_waypoints(owner_id,waypoint_id,revision,payload_json,deleted,client_modified_at,created_at,updated_at,device_id)
      VALUES(?1,?2,1,?3,1,?4,?4,?4,NULL)`).bind(a.owner,id,payload,now).run();
    return json({ok:true,waypoint_id:id,revision:1,deleted:true});
  }
  if(row.deleted)return json({ok:true,waypoint_id:id,revision:Number(row.revision)||1,deleted:true});
  const next=(Number(row.revision)||0)+1;
  await a.db.prepare('UPDATE private_library_waypoints SET revision=?3,deleted=1,client_modified_at=?4,updated_at=?4 WHERE owner_id=?1 AND waypoint_id=?2')
    .bind(a.owner,id,next,now).run();
  return json({ok:true,waypoint_id:id,revision:next,deleted:true});
}

const CLIENT=String.raw`
<script id="mancardo-private-waypoint-sync">
(function(){
  if(window.__mancardoPrivateWaypointSyncInstalled)return;window.__mancardoPrivateWaypointSyncInstalled=true;
  var KEY='mancardo_saved_waypoints_v1',SEEN='mancardo_private_waypoint_seen_v1',running=false;
  function api(path,opts){opts=opts||{};opts.credentials='include';opts.cache='no-store';opts.headers=Object.assign({'accept':'application/json'},opts.headers||{});return fetch('/api/private-library/canonical/waypoints'+path,opts);}
  function j(r){return r.json().catch(function(){return {};}).then(function(d){return {r:r,d:d};});}
  function load(){try{var x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
  function save(x){try{localStorage.setItem(KEY,JSON.stringify(x));}catch(e){}}
  function loadSeen(){try{var x=JSON.parse(localStorage.getItem(SEEN)||'{}');return x&&typeof x==='object'?x:{};}catch(e){return {};}}
  function saveSeen(x){try{localStorage.setItem(SEEN,JSON.stringify(x));}catch(e){}}
  function device(){try{return localStorage.getItem('mancardo_private_device_id_v1')||'';}catch(e){return '';}}
  function modified(w){var t=Date.parse(String((w&&w.updatedAt)||(w&&w.createdAt)||''));return isFinite(t)?t:0;}
  function setMsg(text){var el=document.getElementById('mancardoPrivateSyncMessage');if(el){var prior=String(el.textContent||'');el.textContent=(prior&&prior.indexOf('waypoint')<0?prior+' ':'')+text;}}
  function same(a,b){try{return JSON.stringify(a)===JSON.stringify(b);}catch(e){return false;}}
  function run(){
    if(running||!navigator.onLine)return Promise.resolve(false);running=true;
    return api('').then(j).then(function(x){
      if(!x.r.ok)throw new Error((x.d&&x.d.error)||('HTTP '+x.r.status));
      var lib=load(),seen=loadSeen(),cloud=x.d.items||[],localBy={},cloudBy={},changed=false,adds=0,deletes=0,updates=0;
      lib.forEach(function(w){if(w&&w.id)localBy[String(w.id)]=w;});
      cloud.forEach(function(c){cloudBy[String(c.waypoint_id)]=c;});
      var chain=Promise.resolve();
      cloud.forEach(function(c){
        var id=String(c.waypoint_id),local=localBy[id];
        if(c.deleted){
          seen[id]=1;
          if(local){lib=lib.filter(function(w){return !w||String(w.id)!==id;});delete localBy[id];changed=true;}
          return;
        }
        if(!local){
          if(seen[id]){
            chain=chain.then(function(){return api('/'+encodeURIComponent(id),{method:'DELETE'}).then(j).then(function(y){if(!y.r.ok)throw new Error((y.d&&y.d.error)||('Delete HTTP '+y.r.status));deletes++;});});
          }else if(c.waypoint){lib.unshift(c.waypoint);localBy[id]=c.waypoint;seen[id]=1;changed=true;adds++;}
          return;
        }
        seen[id]=1;
        if(!c.waypoint||same(local,c.waypoint))return;
        var lm=modified(local),cm=Number(c.client_modified_at)||modified(c.waypoint);
        if(lm>cm){
          chain=chain.then(function(){return api('/'+encodeURIComponent(id),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({waypoint:local,device_id:device()})}).then(j).then(function(y){if(!y.r.ok)throw new Error((y.d&&y.d.error)||('Update HTTP '+y.r.status));updates++;});});
        }else{
          for(var i=0;i<lib.length;i++){if(lib[i]&&String(lib[i].id)===id){lib[i]=c.waypoint;break;}}
          localBy[id]=c.waypoint;changed=true;updates++;
        }
      });
      Object.keys(localBy).forEach(function(id){
        var c=cloudBy[id],w=localBy[id];
        if(c){seen[id]=1;return;}
        chain=chain.then(function(){return api('/'+encodeURIComponent(id),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({waypoint:w,device_id:device()})}).then(j).then(function(y){if(!y.r.ok)throw new Error((y.d&&y.d.error)||('Upload HTTP '+y.r.status));seen[id]=1;adds++;});});
      });
      if(changed)save(lib);saveSeen(seen);
      return chain.then(function(){return api('').then(j);}).then(function(y){
        if(!y.r.ok)throw new Error((y.d&&y.d.error)||('HTTP '+y.r.status));
        setMsg('Waypoints: '+lib.length+' local / '+(y.d.count||0)+' cloud.'+(deletes?' '+deletes+' deletion'+(deletes===1?'':'s')+' synced.':''));
        if(changed)setTimeout(function(){location.reload();},350);
        return true;
      });
    }).catch(function(e){setMsg('Waypoint sync failed: '+(e&&e.message?e.message:'unknown error'));console.warn('private waypoint sync failed',e);return false;}).finally(function(){running=false;});
  }
  document.addEventListener('click',function(ev){var t=ev.target;if(t&&t.closest&&t.closest('#mancardoPrivateSyncNow'))setTimeout(run,300);else setTimeout(run,1000);},true);
  window.addEventListener('focus',function(){setTimeout(run,500);});window.addEventListener('online',function(){setTimeout(run,500);});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')setTimeout(run,600);});
  setInterval(function(){if(document.visibilityState==='visible'&&navigator.onLine)run();},5000);
  setTimeout(run,1600);
})();
</script>`;

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname===PREFIX&&request.method==='GET'){
      const a=await auth(request,env,ctx);if(a.error)return a.error;return list(a);
    }
    const m=url.pathname.match(/^\/api\/private-library\/canonical\/waypoints\/([^/]+)$/);
    if(m&&request.method==='PUT'){
      const a=await auth(request,env,ctx);if(a.error)return a.error;return put(request,a,decodeURIComponent(m[1]));
    }
    if(m&&request.method==='DELETE'){
      const a=await auth(request,env,ctx);if(a.error)return a.error;return softDelete(a,decodeURIComponent(m[1]));
    }
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;
    let html=await response.text();
    if(!html.includes('mancardo-private-waypoint-sync')){
      const i=html.toLowerCase().lastIndexOf('</body>');html=i>=0?html.slice(0,i)+CLIENT+'\n'+html.slice(i):html+CLIENT;
    }
    const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
