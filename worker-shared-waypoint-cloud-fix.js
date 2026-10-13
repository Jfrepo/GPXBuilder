import baseWorker from './worker-shared-waypoint-cloud.js';

const PREFIX='/api/shared-waypoints';

function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
function cookieValue(header,name){
  for(const p of String(header||'').split(';')){
    const i=p.indexOf('=');
    if(i<0)continue;
    if(p.slice(0,i).trim()===name)return decodeURIComponent(p.slice(i+1).trim());
  }
  return '';
}
function clean(v,max){const s=String(v||'').trim();return s&&s.length<=max?s:'';}
function validIcon(v){return ['pin','camp','hotel','fuel','food','trail','parking','hazard'].includes(String(v||''))?String(v):'pin';}

async function auth(request,env,ctx){
  const u=new URL(request.url);
  u.pathname='/api/private-library/health';
  u.search='';
  const headers=new Headers(request.headers);
  if(!headers.get('Cf-Access-Jwt-Assertion')){
    const jwt=cookieValue(headers.get('cookie'),'CF_Authorization');
    if(jwt)headers.set('Cf-Access-Jwt-Assertion',jwt);
  }
  const probe=await baseWorker.fetch(new Request(u.toString(),{method:'GET',headers}),env,ctx);
  let h={};
  try{h=await probe.json();}catch(e){}
  if(!h.authenticated||!h.storageReady||!env.PRIVATE_LIBRARY_DB){
    return {error:json({error:'Sign in is required for Shared Library waypoints.'},401)};
  }
  const owner=String(h.accountKey||'').trim();
  if(!owner)return {error:json({error:'Shared waypoint account identity is unavailable.'},401)};
  return {db:env.PRIVATE_LIBRARY_DB,owner,label:String(h.accountLabel||'Shared user')};
}

async function ensureSchema(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS shared_library_waypoints (
    shared_id TEXT PRIMARY KEY,
    source_owner TEXT NOT NULL,
    source_waypoint_id TEXT NOT NULL,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    icon TEXT NOT NULL DEFAULT 'pin',
    current_version INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    modified_at INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    modified_by TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    UNIQUE(source_owner, source_waypoint_id)
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_shared_library_waypoints_modified ON shared_library_waypoints(deleted, modified_at DESC)').run();
}

async function list(db){
  const r=await db.prepare('SELECT shared_id,source_waypoint_id,name,lat,lon,icon,current_version,created_at,modified_at,created_by,modified_by FROM shared_library_waypoints WHERE deleted=0 ORDER BY modified_at DESC,shared_id ASC').all();
  return json({waypoints:(r.results||[]).map(x=>({id:x.shared_id,sourceWaypointId:x.source_waypoint_id,name:x.name,lat:Number(x.lat),lon:Number(x.lon),icon:x.icon,version:Number(x.current_version),createdAt:new Date(Number(x.created_at)).toISOString(),modifiedAt:new Date(Number(x.modified_at)).toISOString(),createdBy:x.created_by,modifiedBy:x.modified_by}))});
}

async function publish(request,a){
  let b={};
  try{b=await request.json();}catch(e){return json({error:'Invalid JSON.'},400);}
  const w=b.waypoint||{};
  const sourceId=clean(w.id,128),name=clean(w.name,240),lat=Number(w.lat),lon=Number(w.lon),icon=validIcon(w.icon),who=clean(b.modifiedBy,120)||a.label;
  if(!sourceId||!name||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<-90||lat>90||lon<-180||lon>180){
    return json({error:'Waypoint data is invalid.'},400);
  }
  const existing=await a.db.prepare('SELECT shared_id,current_version FROM shared_library_waypoints WHERE source_owner=?1 AND source_waypoint_id=?2').bind(a.owner,sourceId).first();
  const now=Date.now();
  if(existing){
    const next=(Number(existing.current_version)||0)+1;
    await a.db.prepare('UPDATE shared_library_waypoints SET name=?3,lat=?4,lon=?5,icon=?6,current_version=?7,modified_at=?8,modified_by=?9,deleted=0 WHERE source_owner=?1 AND source_waypoint_id=?2')
      .bind(a.owner,sourceId,name,lat,lon,icon,next,now,who).run();
    return json({id:existing.shared_id,version:next,modifiedAt:new Date(now).toISOString(),modifiedBy:who});
  }
  const id=crypto.randomUUID();
  await a.db.prepare('INSERT INTO shared_library_waypoints (shared_id,source_owner,source_waypoint_id,name,lat,lon,icon,current_version,created_at,modified_at,created_by,modified_by,deleted) VALUES (?1,?2,?3,?4,?5,?6,?7,1,?8,?8,?9,?9,0)')
    .bind(id,a.owner,sourceId,name,lat,lon,icon,now,who).run();
  return json({id,version:1,modifiedAt:new Date(now).toISOString(),modifiedBy:who},201);
}

async function remove(db,id){
  const r=await db.prepare('DELETE FROM shared_library_waypoints WHERE shared_id=?1').bind(id).run();
  if(Number(r.meta&&r.meta.changes)!==1)return json({error:'Shared waypoint not found.'},404);
  return json({ok:true,id});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname===PREFIX||url.pathname.startsWith(PREFIX+'/')){
      try{
        const a=await auth(request,env,ctx);
        if(a.error)return a.error;
        await ensureSchema(a.db);
        if(url.pathname===PREFIX&&request.method==='GET')return list(a.db);
        if(url.pathname===PREFIX&&request.method==='POST')return publish(request,a);
        const m=url.pathname.match(/^\/api\/shared-waypoints\/([^/]+)$/);
        if(m&&request.method==='DELETE')return remove(a.db,decodeURIComponent(m[1]));
        return json({error:'Shared waypoint API route not found.'},404);
      }catch(e){
        console.error('shared waypoint api failed',e);
        return json({error:'Shared waypoint storage failed: '+(e&&e.message?e.message:'unknown error')},500);
      }
    }
    return baseWorker.fetch(request,env,ctx);
  }
};
