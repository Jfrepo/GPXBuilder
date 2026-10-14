import baseWorker from './worker-shared-notes-stable.js';

const CLIENT=String.raw`
<style id="mancardo-shared-note-toggle-styles">
#sharedTrackList .shared-item-name{display:flex!important;align-items:center;gap:.3rem}
#sharedTrackList .shared-item-name .mancardo-note-icon{margin-left:auto!important;pointer-events:auto!important;cursor:pointer;opacity:.95}
#sharedTrackList .shared-item-name .mancardo-note-icon:focus{outline:2px solid currentColor;outline-offset:2px;border-radius:3px}
#sharedTrackList .shared-item-note{display:none!important}
#sharedTrackList .shared-item-note.mancardo-note-open{display:block!important}
</style>
<script id="mancardo-shared-note-toggle-ui">
(function(){
  if(window.__mancardoSharedNoteToggleUiInstalled)return;
  window.__mancardoSharedNoteToggleUiInstalled=true;

  function prepare(){
    document.querySelectorAll('#sharedTrackList .shared-item:not(.mancardo-shared-waypoint-item)').forEach(function(card){
      var icon=card.querySelector('.shared-item-name .mancardo-note-icon');
      var note=card.querySelector('.shared-item-note');
      if(!icon||!note)return;
      if(!icon.hasAttribute('role'))icon.setAttribute('role','button');
      if(!icon.hasAttribute('tabindex'))icon.setAttribute('tabindex','0');
      icon.setAttribute('aria-label','Show track note');
      var open=card.dataset.mancardoNoteOpen==='1';
      note.classList.toggle('mancardo-note-open',open);
      icon.setAttribute('aria-expanded',open?'true':'false');
      icon.title=open?'Hide note':'Show note';
    });
  }

  function toggle(icon){
    var card=icon.closest('.shared-item');if(!card)return;
    var note=card.querySelector('.shared-item-note');if(!note)return;
    var open=card.dataset.mancardoNoteOpen==='1';
    open=!open;
    card.dataset.mancardoNoteOpen=open?'1':'0';
    note.classList.toggle('mancardo-note-open',open);
    icon.setAttribute('aria-expanded',open?'true':'false');
    icon.setAttribute('aria-label',open?'Hide track note':'Show track note');
    icon.title=open?'Hide note':'Show note';
  }

  document.addEventListener('click',function(ev){
    var icon=ev.target&&ev.target.closest?ev.target.closest('#sharedTrackList .shared-item-name .mancardo-note-icon'):null;
    if(!icon)return;
    ev.preventDefault();ev.stopPropagation();toggle(icon);
  },true);
  document.addEventListener('keydown',function(ev){
    var icon=ev.target&&ev.target.closest?ev.target.closest('#sharedTrackList .shared-item-name .mancardo-note-icon'):null;
    if(!icon||(ev.key!=='Enter'&&ev.key!==' '))return;
    ev.preventDefault();ev.stopPropagation();toggle(icon);
  },true);

  new MutationObserver(function(){setTimeout(prepare,0);}).observe(document.documentElement,{subtree:true,childList:true});
  setTimeout(prepare,250);
})();
</script>`;

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=await response.text();
    if(!html.includes('mancardo-shared-note-toggle-ui')){
      const i=html.toLowerCase().lastIndexOf('</body>');
      html=i>=0?html.slice(0,i)+CLIENT+'\n'+html.slice(i):html+CLIENT;
    }
    const headers=new Headers(response.headers);
    headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store, max-age=0');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
