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
  // Track colour is rendered once, inside .shared-item-name by index.html.
  // Do not inject a second swatch at the shared-item row level.

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
