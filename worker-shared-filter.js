import baseWorker from './worker-layout.js';

const SHARED_FILTER_FEATURE = String.raw`
// ---------- shared-library user filtering ----------
(function installSharedLibraryUserFilter(){
  if(!els.sharedUserSelect || typeof renderSharedLibrary!=='function') return;

  var select=els.sharedUserSelect;
  var saved=null;
  try{saved=localStorage.getItem(SHARED_USER_KEY);}catch(e){}
  // Publishing identity is verified server-side, never inferred from this filter.

  select.innerHTML='<option value="all">All Tracks</option><option value="Justin">Justin</option><option value="Paul">Paul</option>';
  select.title='Filter Shared Library tracks by user (not the publishing owner)';
  select.disabled=false;
  select.removeAttribute('disabled');
  select.value=(saved==='Paul'||saved==='Justin'||saved==='all')?saved:'all';

  function normaliseSharedUser(value){return String(value||'').trim().toLowerCase();}
  function matchesSharedUser(item,filter){
    if(!filter||filter==='all') return true;
    var who=normaliseSharedUser(item&&item.modifiedBy);
    if(filter==='Justin'){
      return who==='justin' || who==='jayfenno' || who==='jayfenno@gmail.com' || who==='justin.fenwick1@gmail.com' || who.indexOf('justin')!==-1;
    }
    if(filter==='Paul'){
      return who==='paul' || who==='tuffsy' || who==='tuffsy@gmail.com' || who.indexOf('paul')!==-1 || who.indexOf('tuffs')!==-1;
    }
    return true;
  }

  var baseRenderSharedLibrary=renderSharedLibrary;
  renderSharedLibrary=function(){
    var allTracks=state.sharedLibrary;
    var filter=select.value||'all';
    var filtered=filter==='all'?allTracks:allTracks.filter(function(item){return matchesSharedUser(item,filter);});
    state.sharedLibrary=filtered;
    try{
      baseRenderSharedLibrary();
      if(!filtered.length && allTracks.length){
        els.sharedTrackList.innerHTML='<div class="empty-note">No shared tracks for '+esc(filter)+'.</div>';
      }
    }finally{
      state.sharedLibrary=allTracks;
    }
  };

  select.onchange=function(){
    try{localStorage.setItem(SHARED_USER_KEY,select.value);}catch(e){}
    renderSharedLibrary();
  };

  // Never rewrite the selected filter to impersonate a publishing owner.
  // The API derives modifiedBy from the authenticated Cloudflare Access identity.
  function decorateSharedColours(){
    var list=els.sharedTrackList;
    if(!list)return;
    var local=state.library||[];
    var shared=state.sharedLibrary||[];
    var rows=list.children;
    Array.prototype.forEach.call(rows,function(row){
      if(row.dataset&&row.dataset.mancardoColourDecorated)return;
      var label=(row.textContent||'').toLowerCase();
      var match=shared.find(function(s){return s.name&&label.indexOf(String(s.name).toLowerCase())!==-1;});
      if(!match)return;
      var own=local.find(function(t){return t.id===match.id;})||local.find(function(t){return t.name===match.name;});
      var colour=own&&(own.color||own.colour);
      if(!colour||!/^#[0-9a-f]{3,8}$/i.test(colour))return;
      var dot=document.createElement('span');dot.title='Track colour';dot.setAttribute('aria-label','Track colour');
      dot.style.cssText='display:inline-block;width:11px;height:11px;border-radius:2px;vertical-align:middle;margin-right:6px;border:1px solid rgba(0,0,0,.25);background:'+colour;
      row.insertBefore(dot,row.firstChild);row.dataset.mancardoColourDecorated='1';
    });
  }
  var renderWithColours=renderSharedLibrary;
  renderSharedLibrary=function(){renderWithColours();decorateSharedColours();};

  renderSharedLibrary();
})();
`;

function injectSharedFilter(html){
  if(html.indexOf('installSharedLibraryUserFilter')!==-1) return html;
  var close=html.lastIndexOf('})();');
  if(close===-1) return html;
  return html.slice(0,close)+SHARED_FILTER_FEATURE+'\n'+html.slice(close);
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html')) return response;

    const html=injectSharedFilter(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
