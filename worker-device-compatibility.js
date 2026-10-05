import baseWorker from './worker-find-plan.js';

const DEVICE_COMPAT_CSS = String.raw`
<style id="mancardo-device-compat-styles">
#mancardoDeviceCheckBtn{flex:none}
#mancardoDeviceCompatOverlay{position:fixed;inset:0;z-index:2600;background:rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center;padding:1rem}
#mancardoDeviceCompatOverlay.hidden{display:none!important}
.mancardo-device-dialog{width:min(560px,96vw);max-height:88vh;overflow:auto;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:7px;box-shadow:0 8px 28px rgba(0,0,0,.3)}
.mancardo-device-head{display:flex;align-items:center;gap:.5rem;padding:.8rem .9rem;border-bottom:1px solid var(--border)}
.mancardo-device-head h3{margin:0;flex:1;font-size:1.15rem}
.mancardo-device-summary{padding:.7rem .9rem;font-size:.78rem;line-height:1.35;color:var(--text-muted);border-bottom:1px solid var(--border)}
.mancardo-device-list{padding:.35rem .7rem .7rem}
.mancardo-device-row{display:grid;grid-template-columns:28px minmax(0,1fr);gap:.4rem;padding:.55rem .2rem;border-bottom:1px solid var(--border)}
.mancardo-device-row:last-child{border-bottom:0}
.mancardo-device-icon{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.76rem}
.mancardo-device-row.pass .mancardo-device-icon{background:color-mix(in srgb,var(--good) 18%,transparent);color:var(--good);border:1px solid var(--good)}
.mancardo-device-row.fail .mancardo-device-icon{background:color-mix(in srgb,var(--danger) 14%,transparent);color:var(--danger);border:1px solid var(--danger)}
.mancardo-device-row.pending .mancardo-device-icon{background:var(--surface-2);color:var(--text-muted);border:1px solid var(--border)}
.mancardo-device-name{font-weight:700;font-size:.8rem}
.mancardo-device-detail{font-size:.7rem;line-height:1.3;color:var(--text-muted);margin-top:.08rem}
.mancardo-device-actions{display:flex;justify-content:flex-end;gap:.45rem;padding:.7rem .9rem;border-top:1px solid var(--border)}
@media(max-width:767px){#mancardoDeviceCheckBtn{width:38px;padding:.4rem;font-size:0}#mancardoDeviceCheckBtn::after{content:'✓?';font-size:.72rem;font-weight:800}}
</style>`;

const DEVICE_COMPAT_FEATURE = String.raw`
// ---------- Device compatibility test ----------
(function installMancardoDeviceCompatibility(){
  if(window.__mancardoDeviceCompatibilityInstalled)return;
  window.__mancardoDeviceCompatibilityInstalled=true;

  var topbar=document.querySelector('.topbar');
  if(!topbar)return;

  var btn=document.createElement('button');
  btn.type='button';
  btn.id='mancardoDeviceCheckBtn';
  btn.className='icon-btn';
  btn.textContent='Device Check';
  btn.title='Check this device for ManCardo local editing and cloud sync compatibility';
  btn.setAttribute('aria-label','Run device compatibility check');
  var chip=topbar.querySelector('.local-chip');
  if(chip)topbar.insertBefore(btn,chip);else topbar.appendChild(btn);

  var overlay=document.createElement('div');
  overlay.id='mancardoDeviceCompatOverlay';
  overlay.className='hidden';
  overlay.innerHTML=''
    +'<div class="mancardo-device-dialog" role="dialog" aria-modal="true" aria-labelledby="mancardoDeviceCompatTitle">'
    +'<div class="mancardo-device-head"><h3 id="mancardoDeviceCompatTitle">Device compatibility</h3><button type="button" class="icon-btn" id="mancardoDeviceCompatClose" aria-label="Close">×</button></div>'
    +'<div class="mancardo-device-summary" id="mancardoDeviceCompatSummary">Run the check to confirm whether this browser can support local ManCardo editing and the planned private cloud-sync workflow.</div>'
    +'<div class="mancardo-device-list" id="mancardoDeviceCompatList"></div>'
    +'<div class="mancardo-device-actions"><button type="button" class="icon-btn" id="mancardoDeviceCompatRun">Run again</button><button type="button" class="icon-btn primary" id="mancardoDeviceCompatDone">Done</button></div>'
    +'</div>';
  document.body.appendChild(overlay);

  var list=document.getElementById('mancardoDeviceCompatList');
  var summary=document.getElementById('mancardoDeviceCompatSummary');
  var close=document.getElementById('mancardoDeviceCompatClose');
  var done=document.getElementById('mancardoDeviceCompatDone');
  var rerun=document.getElementById('mancardoDeviceCompatRun');

  var tests=[
    {id:'https',name:'Secure HTTPS connection'},
    {id:'local',name:'Local browser storage'},
    {id:'idb',name:'IndexedDB working storage'},
    {id:'persist',name:'Persistent storage protection'},
    {id:'cloud',name:'Cloudflare app connection'},
    {id:'cookies',name:'First-party cookies enabled'},
    {id:'files',name:'GPX file import support'},
    {id:'download',name:'GPX download support'},
    {id:'webgl',name:'WebGL / 3D map support'},
    {id:'geo',name:'Geolocation capability'},
    {id:'sw',name:'Offline/service-worker capability'}
  ];

  function renderRows(){
    list.innerHTML='';
    tests.forEach(function(t){
      var row=document.createElement('div');row.className='mancardo-device-row pending';row.id='mancardoCompat_'+t.id;
      row.innerHTML='<div class="mancardo-device-icon">…</div><div><div class="mancardo-device-name"></div><div class="mancardo-device-detail">Checking…</div></div>';
      row.querySelector('.mancardo-device-name').textContent=t.name;
      list.appendChild(row);
    });
  }

  function setResult(id,ok,detail){
    var row=document.getElementById('mancardoCompat_'+id);if(!row)return;
    row.classList.remove('pass','fail','pending');row.classList.add(ok?'pass':'fail');
    row.querySelector('.mancardo-device-icon').textContent=ok?'✓':'×';
    row.querySelector('.mancardo-device-detail').textContent=detail||'';
    row.dataset.ok=ok?'1':'0';
  }

  function testIndexedDB(){
    return new Promise(function(resolve){
      if(!window.indexedDB){resolve({ok:false,detail:'IndexedDB is unavailable or blocked by browser policy.'});return;}
      var name='mancardo_compat_test_'+Date.now();
      var req;
      try{req=indexedDB.open(name,1);}catch(e){resolve({ok:false,detail:'IndexedDB could not be opened: '+(e.message||'blocked')});return;}
      req.onupgradeneeded=function(){try{req.result.createObjectStore('test');}catch(e){}};
      req.onerror=function(){resolve({ok:false,detail:'IndexedDB open failed. Managed-browser policy may be blocking local database storage.'});};
      req.onsuccess=function(){
        var db=req.result;
        try{
          var tx=db.transaction('test','readwrite');tx.objectStore('test').put('ok','probe');
          tx.oncomplete=function(){db.close();try{indexedDB.deleteDatabase(name);}catch(e){}resolve({ok:true,detail:'IndexedDB can open and write local track data.'});};
          tx.onerror=function(){db.close();resolve({ok:false,detail:'IndexedDB opened but write access failed.'});};
        }catch(e){db.close();resolve({ok:false,detail:'IndexedDB write test failed: '+(e.message||'blocked')});}
      };
    });
  }

  function testCloud(){
    var controller=typeof AbortController!=='undefined'?new AbortController():null;
    var timer=controller?setTimeout(function(){controller.abort();},5000):null;
    return fetch(location.origin+'/?mancardo_compat=1',{method:'HEAD',cache:'no-store',credentials:'same-origin',signal:controller?controller.signal:undefined})
      .then(function(r){if(timer)clearTimeout(timer);return {ok:r.ok,detail:r.ok?'Cloudflare-hosted ManCardo is reachable from this device.':'Cloudflare connection returned HTTP '+r.status+'.'};})
      .catch(function(e){if(timer)clearTimeout(timer);return {ok:false,detail:'Could not reach the ManCardo cloud endpoint. A firewall or network policy may be blocking it.'};});
  }

  function testWebGL(){
    try{
      var c=document.createElement('canvas');var gl=c.getContext('webgl2')||c.getContext('webgl')||c.getContext('experimental-webgl');
      return !!gl;
    }catch(e){return false;}
  }

  function run(){
    renderRows();summary.textContent='Running compatibility checks…';
    setResult('https',location.protocol==='https:',location.protocol==='https:'?'Secure browser context is active.':'ManCardo is not running over HTTPS; cloud sync and some browser APIs may be restricted.');

    var localOk=false;
    try{var k='__mancardo_compat__';localStorage.setItem(k,'1');localOk=localStorage.getItem(k)==='1';localStorage.removeItem(k);}catch(e){}
    setResult('local',localOk,localOk?'Browser local storage is writable.':'Local storage is blocked, disabled or not persistent in this browser session.');

    setResult('cookies',navigator.cookieEnabled===true,navigator.cookieEnabled?'Browser reports first-party cookies enabled.':'Cookies are disabled; account sign-in may not work correctly.');
    setResult('files',!!(window.File&&window.FileReader&&window.Blob),'File' in window&&'FileReader' in window?'Browser supports local GPX file selection and reading.':'Required browser file APIs are unavailable or blocked.');
    var a=document.createElement('a');setResult('download','download' in a,'download' in a?'Browser supports generated file downloads.':'Browser does not expose standard file download support.');
    var webgl=testWebGL();setResult('webgl',webgl,webgl?'WebGL is available for accelerated map/3D rendering.':'WebGL is unavailable or disabled; Google 3D may not work on this device.');
    setResult('geo','geolocation' in navigator,'geolocation' in navigator?'Geolocation API is available. Permission may still be controlled by the user or administrator.':'Geolocation is unavailable or disabled by browser/device policy.');
    setResult('sw','serviceWorker' in navigator,'serviceWorker' in navigator?'Service workers are supported for future offline caching.':'Service workers are unavailable or blocked; core online editing can still work.');

    testIndexedDB().then(function(r){setResult('idb',r.ok,r.detail);finishIfReady();});
    testCloud().then(function(r){setResult('cloud',r.ok,r.detail);finishIfReady();});

    if(navigator.storage&&typeof navigator.storage.persisted==='function'){
      navigator.storage.persisted().then(function(p){setResult('persist',!!p,p?'Browser has granted persistent site storage.':'Persistent storage is not currently guaranteed; a managed browser may clear local data. Cloud sync should remain the durable copy.');finishIfReady();}).catch(function(){setResult('persist',false,'Could not read persistent-storage status; browser policy may restrict this API.');finishIfReady();});
    }else{
      setResult('persist',false,'This browser does not expose the persistent-storage status API.');
    }
    setTimeout(finishIfReady,5500);
  }

  function finishIfReady(){
    var rows=list.querySelectorAll('.mancardo-device-row');if(!rows.length)return;
    var pending=0,fail=0;Array.prototype.forEach.call(rows,function(r){if(r.classList.contains('pending'))pending++;else if(r.classList.contains('fail'))fail++;});
    if(pending)return;
    if(fail===0)summary.textContent='All compatibility checks passed on this device.';
    else summary.textContent=fail+' check'+(fail===1?'':'s')+' need attention. Failed items include a short explanation below; some optional features can fail without preventing core track editing.';
  }

  function open(){overlay.classList.remove('hidden');run();}
  function shut(){overlay.classList.add('hidden');}
  btn.addEventListener('click',open);close.addEventListener('click',shut);done.addEventListener('click',shut);rerun.addEventListener('click',run);
  overlay.addEventListener('click',function(ev){if(ev.target===overlay)shut();});
})();
`;

function injectDeviceCompatibility(html){
  if(html.includes('installMancardoDeviceCompatibility'))return html;
  html=html.replace('</head>',DEVICE_COMPAT_CSS+'\n</head>');
  const close=html.lastIndexOf('})();');
  if(close===-1)return html;
  return html.slice(0,close)+DEVICE_COMPAT_FEATURE+'\n'+html.slice(close);
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=injectDeviceCompatibility(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
