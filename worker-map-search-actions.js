import baseWorker from './worker-map-search-layout.js';

const SEARCH_ACTION_FIXES = String.raw`
<style id="mancardo-map-search-action-fixes">
#mancardoSearchLocationCard{
  position:absolute;
  left:50%;
  top:5.25rem;
  transform:translateX(-50%);
  z-index:1800;
  width:min(330px,calc(100% - 24px));
  padding:.65rem .72rem;
  border:1px solid var(--border);
  border-radius:6px;
  background:var(--surface);
  color:var(--text);
  box-shadow:0 3px 14px rgba(0,0,0,.24);
  pointer-events:auto!important;
  touch-action:manipulation!important;
}
#mancardoSearchLocationCard .mancardo-search-card-title{font-weight:800;font-size:.82rem;line-height:1.2;padding-right:2rem}
#mancardoSearchLocationCard .mancardo-search-card-address{margin-top:.18rem;color:var(--text-muted);font-size:.68rem;line-height:1.25;padding-right:2rem}
#mancardoSearchLocationCard .mancardo-search-card-close{
  position:absolute;right:.42rem;top:.36rem;width:30px;height:30px;min-height:30px;padding:0;
  border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);
  font:800 20px/26px system-ui,sans-serif;cursor:pointer;z-index:2;
}
#mancardoSearchLocationCard .mancardo-search-card-direct{
  display:inline-flex;align-items:center;gap:.32rem;margin-top:.55rem;padding:.38rem .55rem;
  border:1px solid var(--border);border-radius:4px;background:var(--surface-2);color:var(--accent);
  font-weight:800;font-size:.72rem;text-decoration:none;pointer-events:auto!important;touch-action:manipulation!important;
}
#mancardoSearchLocationCard .mancardo-search-card-direct svg{width:16px;height:16px;display:block}
@media(max-width:767px){
  #mancardoSearchLocationCard{top:3.8rem;width:min(330px,calc(100% - 16px))}
}
</style>
<script id="mancardo-map-search-action-fixes-script">
(function installMancardoSearchActionFixes(){
  if(window.__mancardoSearchActionFixesInstalled)return;
  window.__mancardoSearchActionFixesInstalled=true;

  var lastInfo=null;

  function mapWrap(){return document.getElementById('mapWrap')||document.querySelector('.map-wrap');}

  function hideGoogleInfo(info){
    if(!info)return;
    var shell=info.closest&&((info.closest('.gm-style-iw-t'))||(info.closest('.gm-style-iw-c')));
    if(shell){shell.style.display='none';shell.setAttribute('aria-hidden','true');}
    else info.style.display='none';
  }

  function removeCard(){
    var card=document.getElementById('mancardoSearchLocationCard');
    if(card&&card.parentNode)card.parentNode.removeChild(card);
  }

  function buildCard(info){
    if(!info||info===lastInfo)return;
    lastInfo=info;

    var host=mapWrap();
    if(!host)return;

    var title=(info.querySelector('strong')&&info.querySelector('strong').textContent)||'Selected location';
    var addressNode=info.querySelector('.mancardo-search-info-address');
    var address=addressNode?addressNode.textContent:'';
    var direct=info.querySelector('.mancardo-search-info-direct');
    var href=direct&&direct.getAttribute('href');

    removeCard();
    hideGoogleInfo(info);

    var card=document.createElement('div');
    card.id='mancardoSearchLocationCard';
    card.setAttribute('role','dialog');
    card.setAttribute('aria-label','Selected search location');

    var close=document.createElement('button');
    close.type='button';
    close.className='mancardo-search-card-close';
    close.setAttribute('aria-label','Close selected location');
    close.title='Close';
    close.textContent='×';
    close.addEventListener('pointerdown',function(ev){ev.stopPropagation();});
    close.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();removeCard();});
    card.appendChild(close);

    var t=document.createElement('div');
    t.className='mancardo-search-card-title';
    t.textContent=title;
    card.appendChild(t);

    if(address){
      var a=document.createElement('div');
      a.className='mancardo-search-card-address';
      a.textContent=address;
      card.appendChild(a);
    }

    if(href&&href.indexOf('maps.apple.com')>=0){
      var link=document.createElement('a');
      link.className='mancardo-search-card-direct';
      link.href=href;
      link.setAttribute('aria-label','Direct to '+title+' in Apple Maps');
      link.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19L19 5M10 5h9v9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg><span>Direct to</span>';
      link.addEventListener('pointerdown',function(ev){ev.stopPropagation();});
      link.addEventListener('click',function(ev){ev.stopPropagation();});
      card.appendChild(link);
    }

    card.addEventListener('pointerdown',function(ev){ev.stopPropagation();});
    card.addEventListener('click',function(ev){ev.stopPropagation();});
    host.appendChild(card);
  }

  function normalizeResultLinks(root){
    var links=(root||document).querySelectorAll? (root||document).querySelectorAll('.mancardo-map-direct-link') : [];
    Array.prototype.forEach.call(links,function(link){
      link.removeAttribute('target');
      link.onclick=null;
    });
  }

  function scan(root){
    normalizeResultLinks(root||document);
    var infos=(root||document).querySelectorAll? (root||document).querySelectorAll('.mancardo-search-info') : [];
    Array.prototype.forEach.call(infos,buildCard);
  }

  scan(document);
  if(window.MutationObserver){
    new MutationObserver(function(mutations){
      mutations.forEach(function(m){
        Array.prototype.forEach.call(m.addedNodes||[],function(node){
          if(!node||node.nodeType!==1)return;
          if(node.matches&&node.matches('.mancardo-search-info'))buildCard(node);
          scan(node);
        });
      });
    }).observe(document.documentElement,{childList:true,subtree:true});
  }
})();
</script>`;

function injectFixes(html){
  if(html.includes('mancardo-map-search-action-fixes-script'))return html;
  return html.replace('</body>',SEARCH_ACTION_FIXES+'\n</body>');
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=injectFixes(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
