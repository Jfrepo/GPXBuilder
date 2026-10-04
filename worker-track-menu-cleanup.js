import baseWorker from './worker-waypoint-zoom.js';

const TRACK_MENU_CLEANUP_FEATURE = String.raw`
// ---------- Remove redundant Copy / Paste track actions ----------
(function installMancardoTrackMenuCleanup(){
  if(window.__mancardoTrackMenuCleanupInstalled)return;
  window.__mancardoTrackMenuCleanupInstalled=true;

  function pruneTrackMenu(root){
    var list=root&&root.querySelectorAll?root:document.getElementById('trackList');
    if(!list)return;
    list.querySelectorAll('.track-menu button').forEach(function(button){
      var label=String(button.textContent||'').trim();
      if(label==='Copy'||label==='Paste')button.remove();
    });
  }

  if(typeof renderLibrary==='function'){
    var baseRenderLibrary=renderLibrary;
    renderLibrary=function(){
      var result=baseRenderLibrary.apply(this,arguments);
      pruneTrackMenu();
      return result;
    };
  }

  var list=document.getElementById('trackList');
  if(list&&typeof MutationObserver==='function'){
    new MutationObserver(function(){pruneTrackMenu(list);}).observe(list,{childList:true,subtree:true});
  }

  pruneTrackMenu();
})();
`;

function stripCopyPasteFromSource(html){
  // Remove the actions from the app's menu definition before it reaches the browser.
  // The runtime cleanup below remains as a fallback in case another wrapper rebuilds the menu.
  html=html.replace(/\['Copy',function\(\)\{copyTrack\(item\.id\)\}\],?/g,'');
  html=html.replace(/,?\['Paste',pasteTrack\]/g,'');
  return html;
}

function injectTrackMenuCleanup(html){
  html=stripCopyPasteFromSource(html);
  if(html.includes('installMancardoTrackMenuCleanup'))return html;
  const close=html.lastIndexOf('})();');
  if(close===-1)return html;
  return html.slice(0,close)+TRACK_MENU_CLEANUP_FEATURE+'\n'+html.slice(close);
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=injectTrackMenuCleanup(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
