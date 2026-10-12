import baseWorker from './worker-shared-library-cloud.js';

const MOBILE_AUTH_SCRIPT=String.raw`
<script id="mancardo-mobile-auth-return">
(function(){
  function isMobileLike(){
    try{return !!(window.matchMedia&&window.matchMedia('(pointer: coarse)').matches);}catch(e){}
    return window.innerWidth<760;
  }
  function wire(){
    var signin=document.getElementById('mancardoPrivateSyncSignIn');
    if(!signin||signin.dataset.mancardoMobileAuthReturn==='1')return;
    signin.dataset.mancardoMobileAuthReturn='1';
    signin.addEventListener('click',function(ev){
      if(!isMobileLike())return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      try{sessionStorage.setItem('__mancardo_auth_return__','1');}catch(e){}
      window.location.assign('/api/private-library/login?return=%2F');
    },true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else wire();
  setTimeout(wire,1200);
})();
</script>`;

function signedInReturnPage(){
  const body='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>ManCardo sign-in</title><style>body{font:16px system-ui;margin:0;background:#111820;color:#eef3f5;display:grid;place-items:center;min-height:100vh}.c{max-width:520px;padding:28px;border:1px solid #3b4a54;border-radius:8px;background:#1b252c}h2{margin-top:0}p{line-height:1.45;color:#c6d0d6}</style><div class="c"><h2>Sign-in complete</h2><p>Returning to ManCardo…</p></div><script>setTimeout(function(){location.replace("/");},300);<\/script>';
  return new Response(body,{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/private-library/login'&&request.method==='GET'){
      const response=await baseWorker.fetch(request,env,ctx);
      if(response.status===200)return signedInReturnPage();
      return response;
    }
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=await response.text();
    if(!html.includes('mancardo-mobile-auth-return')){
      const i=html.toLowerCase().lastIndexOf('</body>');
      html=i>=0?html.slice(0,i)+MOBILE_AUTH_SCRIPT+'\n'+html.slice(i):html+MOBILE_AUTH_SCRIPT;
    }
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
