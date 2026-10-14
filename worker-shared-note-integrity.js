import baseWorker from './worker-shared-note-autosync.js';

const NOTE_HEADER='x-mancardo-track-note';
const MAX_NOTE=40;

function cleanNote(v){return String(v==null?'':v).trim().slice(0,MAX_NOTE);}
function isSharedPost(url,method){
  if(String(method||'GET').toUpperCase()!=='POST')return false;
  const p=url.pathname;
  return p==='/api/tracks'||/^\/api\/tracks\/[^/]+\/publish$/.test(p);
}

const CLIENT=String.raw`
<script id="mancardo-shared-note-integrity">
(function(){
  if(window.__mancardoSharedNoteIntegrityInstalled)return;
  window.__mancardoSharedNoteIntegrityInstalled=true;
  var previousFetch=window.fetch.bind(window);
  function clean(v){return String(v==null?'':v).trim().slice(0,40);}
  function xmlName(gpx){var m=String(gpx||'').match(/<(?:trk|rte)\b[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>/i);if(!m)return '';var d=document.createElement('textarea');d.innerHTML=m[1];return String(d.value||'').trim();}
  function trackFor(url,body){
    var list=[];try{if(window.state&&Array.isArray(state.library))list=state.library;}catch(e){}
    var m=String(url||'').match(/\/api\/tracks\/([^/?]+)\/publish(?:\?|$)/);
    if(m){var sharedId='';try{sharedId=decodeURIComponent(m[1]);}catch(e){sharedId=m[1];}for(var i=0;i<list.length;i++){var t=list[i];if(t&&String(t.sharedId||'')===sharedId)return t;}}
    var name=String((body&&body.name)||xmlName(body&&body.gpx)||'').trim();
    if(name){for(var j=0;j<list.length;j++){var x=list[j];if(x&&String(x.name||'').trim()===name)return x;}}
    return null;
  }
  window.fetch=function(input,init){
    try{
      var url=typeof input==='string'?input:(input&&input.url)||'';
      var method=String((init&&init.method)||(input&&input.method)||'GET').toUpperCase();
      var parsed=new URL(url,location.href);
      if(method==='POST'&&(parsed.pathname==='/api/tracks'||/^\/api\/tracks\/[^/]+\/publish$/.test(parsed.pathname))&&init&&typeof init.body==='string'){
        var body=JSON.parse(init.body||'{}'),track=trackFor(parsed.pathname,body),note=track?clean(track.note):'';
        var headers=new Headers(init.headers||{});headers.set('X-ManCardo-Track-Note',encodeURIComponent(note));
        init=Object.assign({},init,{headers:headers});
      }
    }catch(e){}
    return previousFetch(input,init);
  };
})();
</script>`;

async function withExplicitNote(request){
  const url=new URL(request.url);
  if(!isSharedPost(url,request.method))return request;
  const encoded=request.headers.get(NOTE_HEADER);
  if(encoded==null)return request;
  try{
    let note='';try{note=decodeURIComponent(encoded);}catch(e){note=encoded;}
    const raw=await request.clone().text();
    const body=JSON.parse(raw||'{}');
    body.note=cleanNote(note);
    const headers=new Headers(request.headers);
    headers.delete(NOTE_HEADER);headers.delete('content-length');headers.set('content-type','application/json');
    return new Request(request.url,{method:request.method,headers,body:JSON.stringify(body),redirect:request.redirect,credentials:request.credentials,cache:request.cache});
  }catch(e){return request;}
}

export default {
  async fetch(request,env,ctx){
    const req=await withExplicitNote(request);
    const response=await baseWorker.fetch(req,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=await response.text();
    if(!html.includes('mancardo-shared-note-integrity')){
      const i=html.toLowerCase().lastIndexOf('</body>');
      html=i>=0?html.slice(0,i)+CLIENT+'\n'+html.slice(i):html+CLIENT;
    }
    const headers=new Headers(response.headers);
    headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store, max-age=0');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
