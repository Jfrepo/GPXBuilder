import baseWorker from './worker-private-waypoint-sync.js';

const PREFIX='/api/shared-waypoints';

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
function cookieValue(header,name){for(const p of String(header||'').split(';')){const i=p.indexOf('=');if(i<0)continue;if(p.slice(0,i).trim()===name)return decodeURIComponent(p.slice(i+1).trim());}return '';}
function clean(v,max){const s=String(v||'').trim();return s&&s.length<=max?s:'';}
function validIcon(v){return ['pin','camp','hotel','fuel','food','trail','parking','hazard'].includes(String(v||''))?String(v):'pin';}
async function auth(request,env,ctx){
  const u=new URL(request.url);u.pathname='/api/private-library/health';u.search='';
  const headers=new Headers(request.headers);
  if(!headers.get('Cf-Access-Jwt-Assertion')){const jwt=cookieValue(headers.get('cookie'),'CF_Authorization');if(jwt)headers.set('Cf-Access-Jwt-Assertion',jwt);}
  const probe=await baseWorker.fetch(new Request(u.toString(),{method:'GET',headers}),env,ctx);
  let h={};try{h=await probe.json();}catch(e){}
  if(!h.authenticated||!h.storageReady||!env.PRIVATE_LIBRARY_DB)return {error:json({error:'Sign in is required for Shared Library waypoints.'},401)};
  return {db:env.PRIVATE_LIBRARY_DB,owner:String(h.accountKey||''),label:String(h.accountLabel||'Shared user')};
}
async function ensureSchema(db){
  await db.exec(`CREATE TABLE IF NOT EXISTS shared_library_waypoints (
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
  );
  CREATE INDEX IF NOT EXISTS idx_shared_library_waypoints_modified ON shared_library_waypoints(deleted, modified_at DESC);`);
}
async function list(db){
  const r=await db.prepare('SELECT shared_id,source_waypoint_id,name,lat,lon,icon,current_version,created_at,modified_at,created_by,modified_by FROM shared_library_waypoints WHERE deleted=0 ORDER BY modified_at DESC,shared_id ASC').all();
  return json({waypoints:(r.results||[]).map(x=>({id:x.shared_id,sourceWaypointId:x.source_waypoint_id,name:x.name,lat:Number(x.lat),lon:Number(x.lon),icon:x.icon,version:Number(x.current_version),createdAt:new Date(Number(x.created_at)).toISOString(),modifiedAt:new Date(Number(x.modified_at)).toISOString(),createdBy:x.created_by,modifiedBy:x.modified_by}))});
}
async function publish(request,a){
  let b={};try{b=await request.json();}catch(e){return json({error:'Invalid JSON.'},400);}
  const w=b.waypoint||{};
  const sourceId=clean(w.id,128),name=clean(w.name,240),lat=Number(w.lat),lon=Number(w.lon),icon=validIcon(w.icon),who=clean(b.modifiedBy,120)||a.label;
  if(!sourceId||!name||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<-90||lat>90||lon<-180||lon>180)return json({error:'Waypoint data is invalid.'},400);
  const existing=await a.db.prepare('SELECT shared_id,current_version,created_by,created_at FROM shared_library_waypoints WHERE source_owner=?1 AND source_waypoint_id=?2').bind(a.owner,sourceId).first();
  const now=Date.now();
  if(existing){
    const next=Number(existing.current_version||0)+1;
    await a.db.prepare('UPDATE shared_library_waypoints SET name=?3,lat=?4,lon=?5,icon=?6,current_version=?7,modified_at=?8,modified_by=?9,deleted=0 WHERE source_owner=?1 AND source_waypoint_id=?2').bind(a.owner,sourceId,name,lat,lon,icon,next,now,who).run();
    return json({id:existing.shared_id,version:next,modifiedAt:new Date(now).toISOString(),modifiedBy:who});
  }
  const id=crypto.randomUUID();
  await a.db.prepare('INSERT INTO shared_library_waypoints (shared_id,source_owner,source_waypoint_id,name,lat,lon,icon,current_version,created_at,modified_at,created_by,modified_by,deleted) VALUES (?1,?2,?3,?4,?5,?6,?7,1,?8,?8,?9,?9,0)').bind(id,a.owner,sourceId,name,lat,lon,icon,now,who).run();
  return json({id,version:1,modifiedAt:new Date(now).toISOString(),modifiedBy:who},201);
}
async function remove(db,id){const r=await db.prepare('DELETE FROM shared_library_waypoints WHERE shared_id=?1').bind(id).run();if(Number(r.meta&&r.meta.changes)!==1)return json({error:'Shared waypoint not found.'},404);return json({ok:true,id});}

const CLIENT=String.raw`
<script id="mancardo-shared-waypoint-client">
(function(){
  if(window.__mancardoSharedWaypointClientInstalled)return;window.__mancardoSharedWaypointClientInstalled=true;
  var KEY='mancardo_saved_waypoints_v1';
  var shared=[];
  function api(path,opts){opts=opts||{};opts.credentials='include';opts.cache='no-store';opts.headers=Object.assign({'accept':'application/json'},opts.headers||{});return fetch('/api/shared-waypoints'+path,opts);}
  function loadLocal(){try{var x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
  function saveLocal(x){localStorage.setItem(KEY,JSON.stringify(x));}
  function glyph(icon){return {pin:'📍',camp:'⛺',hotel:'🏨',fuel:'⛽',food:'🍴',trail:'🥾',parking:'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4v7h6V4h4l3 12v4h-8v-6h-4v6H2v-4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M2 16h8m4 0h8" stroke="currentColor" stroke-width="2"/></svg>',hazard:'⚠️'}[icon]||'📍';}
  function modifiedBy(){var el=document.getElementById('sharedUserSelect');return el&&el.value?el.value:'';}
  function publishWaypoint(id){
    var w=loadLocal().find(function(x){return x&&String(x.id)===String(id);});if(!w)return;
    api('',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({waypoint:w,modifiedBy:modifiedBy()})}).then(function(r){return r.json().catch(function(){return {};}).then(function(d){if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d;});}).then(function(){alert('Waypoint published to Shared Library.');try{if(window.loadSharedLibrary&&document.getElementById('sharedLibraryPanel')&&!document.getElementById('sharedLibraryPanel').classList.contains('hidden'))window.loadSharedLibrary();}catch(e){}}).catch(function(e){alert('Could not share waypoint. '+(e.message||''));});
  }
  function wireShareButtons(){
    document.querySelectorAll('.mancardo-waypoint-item').forEach(function(card){
      var id=card.getAttribute('data-waypoint-id'),menu=card.querySelector('.track-menu');if(!id||!menu)return;
      var buttons=Array.prototype.filter.call(menu.querySelectorAll('button'),function(btn){return (btn.textContent||'').trim()==='Share'||btn.classList.contains('mancardo-waypoint-share')||btn.hasAttribute('data-share-waypoint');});
      var b=buttons[0];
      if(!b){b=document.createElement('button');b.type='button';b.textContent='Share';menu.insertBefore(b,menu.firstChild);}
      for(var i=1;i<buttons.length;i++)buttons[i].remove();
      if(b.getAttribute('data-shared-waypoint-wired')==='1')return;
      b.setAttribute('data-shared-waypoint-wired','1');
      b.setAttribute('data-share-waypoint','1');
      b.classList.add('mancardo-waypoint-share');
      b.title='Share this waypoint to Shared Library';
      b.onclick=function(ev){ev.preventDefault();ev.stopPropagation();publishWaypoint(id);};
    });
  }
  function copyShared(w){
    var lib=loadLocal();var now=new Date().toISOString();var id='wp_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
    lib.unshift({id:id,name:w.name||'Waypoint',lat:+w.lat,lon:+w.lon,icon:w.icon||'pin',visible:true,createdAt:now,updatedAt:now});saveLocal(lib);alert('Waypoint copied to My Library.');setTimeout(function(){location.reload();},200);
  }
  function previewShared(w){try{if(window.map&&map.setView)map.setView([+w.lat,+w.lon],Math.max(map.getZoom?map.getZoom():12,15));}catch(e){}}
  function deleteShared(w){if(!confirm('Delete "'+(w.name||'this waypoint')+'" from Shared Library?'))return;api('/'+encodeURIComponent(w.id),{method:'DELETE'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).then(function(){loadSharedWaypoints();}).catch(function(e){alert('Could not delete shared waypoint. '+(e.message||''));});}
  function renderSharedWaypoints(){
    var wrap=document.getElementById('sharedTrackList');if(!wrap)return;
    wrap.querySelectorAll('.mancardo-shared-waypoint-item').forEach(function(n){n.remove();});
    if(shared.length){var empty=wrap.querySelector('.empty-note');if(empty&&/No shared tracks/.test(empty.textContent||''))empty.remove();}
    shared.forEach(function(w){
      var d=document.createElement('div');d.className='shared-item mancardo-shared-waypoint-item';d.style.cursor='pointer';d.onclick=function(){previewShared(w);};
      var n=document.createElement('div');n.className='shared-item-name';var icon=document.createElement('span');icon.innerHTML=glyph(w.icon);icon.setAttribute('aria-hidden','true');n.appendChild(icon);n.appendChild(document.createTextNode(' '+(w.name||'Waypoint')));d.appendChild(n);
      var m=document.createElement('div');m.className='shared-item-meta';m.textContent=({pin:'Pin',camp:'Camp',hotel:'Hotel',fuel:'Fuel',food:'Food',trail:'Trail',parking:'Lookout',hazard:'Hazard'}[w.icon]||'Pin')+' waypoint · '+(+w.lat).toFixed(5)+', '+(+w.lon).toFixed(5)+' · v'+(w.version||1)+' · '+(w.modifiedBy||'Unknown');d.appendChild(m);
      var a=document.createElement('div');a.className='shared-item-actions';
      var p=document.createElement('button');p.type='button';p.className='icon-btn';p.textContent='Preview';p.onclick=function(ev){ev.stopPropagation();previewShared(w);};a.appendChild(p);
      var c=document.createElement('button');c.type='button';c.className='icon-btn primary';c.textContent='Copy to My Library';c.onclick=function(ev){ev.stopPropagation();copyShared(w);};a.appendChild(c);
      var x=document.createElement('button');x.type='button';x.className='icon-btn danger';x.textContent='Delete';x.onclick=function(ev){ev.stopPropagation();deleteShared(w);};a.appendChild(x);
      d.appendChild(a);wrap.appendChild(d);
    });
  }
  function loadSharedWaypoints(){return api('').then(function(r){return r.json().catch(function(){return {};}).then(function(d){if(!r.ok)throw new Error(d.error||('HTTP '+r.status));shared=Array.isArray(d.waypoints)?d.waypoints:[];renderSharedWaypoints();});}).catch(function(e){console.warn('shared waypoint load failed',e);});}
  var origRender=window.renderSharedLibrary;window.renderSharedLibrary=function(){var r=origRender&&origRender.apply(this,arguments);setTimeout(function(){renderSharedWaypoints();},0);return r;};
  var origLoad=window.loadSharedLibrary;window.loadSharedLibrary=function(){var r=origLoad&&origLoad.apply(this,arguments);setTimeout(loadSharedWaypoints,120);return r;};
  document.addEventListener('click',function(){setTimeout(wireShareButtons,0);},true);
  new MutationObserver(function(){wireShareButtons();}).observe(document.documentElement,{subtree:true,childList:true});
  setTimeout(function(){wireShareButtons();loadSharedWaypoints();},1200);
})();
</script>`;

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname===PREFIX||url.pathname.startsWith(PREFIX+'/')){
      const a=await auth(request,env,ctx);if(a.error)return a.error;await ensureSchema(a.db);
      if(url.pathname===PREFIX&&request.method==='GET')return list(a.db);
      if(url.pathname===PREFIX&&request.method==='POST')return publish(request,a);
      const m=url.pathname.match(/^\/api\/shared-waypoints\/([^/]+)$/);if(m&&request.method==='DELETE')return remove(a.db,decodeURIComponent(m[1]));
      return json({error:'Shared waypoint API route not found.'},404);
    }
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;
    let html=await response.text();if(!html.includes('mancardo-shared-waypoint-client')){const i=html.toLowerCase().lastIndexOf('</body>');html=i>=0?html.slice(0,i)+CLIENT+'\n'+html.slice(i):html+CLIENT;}
    const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
