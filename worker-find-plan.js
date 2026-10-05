import baseWorker from './worker-share-actions.js';

const FIND_PLAN_CSS = String.raw`
<style id="mancardo-find-plan-styles">
#mancardoFindPlanBtn{flex:none}
#mancardoFindPlanBtn .fp-mobile-label{display:none}
#mancardoFindPlanPanel{width:370px;min-width:320px;max-width:42vw;flex:none;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;min-height:0;z-index:820}
#mancardoFindPlanPanel.hidden{display:none!important}
.mancardo-fp-head{display:flex;align-items:center;gap:.55rem;padding:.72rem .75rem;border-bottom:1px solid var(--border)}
.mancardo-fp-head-title{font:700 1.02rem 'Barlow Condensed',sans-serif;letter-spacing:.02em;flex:1}
.mancardo-fp-head-sub{font-size:.65rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.mancardo-fp-close{width:32px;height:32px;min-height:32px;padding:0;font-size:1.15rem}
.mancardo-fp-note{margin:.55rem .65rem .2rem;padding:.52rem .58rem;border:1px solid var(--border);border-radius:4px;background:var(--surface-2);font-size:.7rem;line-height:1.35;color:var(--text-muted)}
.mancardo-fp-quick{display:flex;gap:.35rem;flex-wrap:wrap;padding:.4rem .65rem .2rem}
.mancardo-fp-quick button{border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:14px;padding:.28rem .48rem;font-size:.68rem;cursor:pointer}
.mancardo-fp-quick button:hover{border-color:var(--accent)}
.mancardo-fp-messages{flex:1;min-height:0;overflow:auto;padding:.55rem .65rem .8rem;display:flex;flex-direction:column;gap:.55rem;overscroll-behavior:contain}
.mancardo-fp-msg{max-width:94%;border:1px solid var(--border);border-radius:7px;padding:.55rem .62rem;font-size:.78rem;line-height:1.42;white-space:pre-wrap;overflow-wrap:anywhere}
.mancardo-fp-msg.user{align-self:flex-end;background:var(--accent);border-color:var(--accent);color:var(--accent-contrast)}
.mancardo-fp-msg.assistant{align-self:flex-start;background:var(--surface)}
.mancardo-fp-msg.error{border-color:var(--danger);color:var(--danger)}
.mancardo-fp-sources{margin-top:.5rem;padding-top:.4rem;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:.3rem;white-space:normal}
.mancardo-fp-source{display:flex;align-items:center;gap:.32rem;min-width:0}
.mancardo-fp-source a{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--accent);font-size:.68rem;text-decoration:none;flex:1}
.mancardo-fp-source a:hover{text-decoration:underline}
.mancardo-fp-import{border:1px solid var(--accent);background:var(--surface);color:var(--accent);border-radius:3px;padding:.2rem .35rem;font-size:.64rem;font-weight:700;cursor:pointer;flex:none}
.mancardo-fp-import:hover{background:var(--surface-2)}
.mancardo-fp-thinking{align-self:flex-start;font-size:.7rem;color:var(--text-muted);padding:.15rem .2rem}
.mancardo-fp-compose{border-top:1px solid var(--border);padding:.55rem .65rem;background:var(--surface)}
#mancardoFindPlanInput{width:100%;min-height:76px;max-height:170px;resize:vertical;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);padding:.5rem .55rem;font:400 .8rem/1.35 'Source Sans 3',sans-serif}
#mancardoFindPlanInput:focus{outline:2px solid color-mix(in srgb,var(--accent) 38%,transparent);border-color:var(--accent)}
.mancardo-fp-compose-row{display:flex;align-items:center;gap:.4rem;margin-top:.42rem}
.mancardo-fp-status{font-size:.65rem;color:var(--text-muted);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mancardo-fp-send{min-height:34px;padding:.35rem .6rem}
.mancardo-fp-clear{min-height:34px;padding:.35rem .5rem}
@media(max-width:1100px){
  #mancardoFindPlanPanel{position:absolute;left:0;top:0;bottom:0;width:min(390px,92vw);max-width:none;box-shadow:4px 0 14px rgba(0,0,0,.18);z-index:1200}
}
@media(max-width:767px){
  #mancardoFindPlanBtn{width:38px!important;padding:.4rem!important}
  #mancardoFindPlanBtn .fp-desktop-label{display:none}
  #mancardoFindPlanBtn .fp-mobile-label{display:inline}
  #mancardoFindPlanPanel{position:fixed;left:0;right:0;top:50px;bottom:0;width:auto;max-width:none;z-index:1750;border-right:0;box-shadow:none}
  .mancardo-fp-msg{max-width:96%;font-size:.82rem}
}
</style>`;

const FIND_PLAN_FEATURE = String.raw`
// ---------- Find & Plan assistant ----------
(function installMancardoFindPlan(){
  if(window.__mancardoFindPlanInstalled)return;
  window.__mancardoFindPlanInstalled=true;

  var STORE='mancardo_find_plan_chat_v1';
  var topbar=document.querySelector('.topbar');
  var layout=document.querySelector('.layout');
  var main=document.querySelector('.main');
  if(!topbar||!layout||!main)return;

  var button=document.createElement('button');
  button.type='button';
  button.id='mancardoFindPlanBtn';
  button.className='icon-btn';
  button.title='Find public ride reports and GPX tracks';
  button.setAttribute('aria-label','Open Find and Plan assistant');
  button.innerHTML='<span aria-hidden="true">&#10022;</span><span class="fp-desktop-label">Find &amp; Plan</span><span class="fp-mobile-label" aria-hidden="true">AI</span>';
  var searchHost=document.getElementById('mancardoTopbarSearchHost');
  var chip=topbar.querySelector('.local-chip');
  if(searchHost&&searchHost.parentNode===topbar)topbar.insertBefore(button,searchHost);
  else if(chip)topbar.insertBefore(button,chip);
  else topbar.appendChild(button);

  var panel=document.createElement('aside');
  panel.id='mancardoFindPlanPanel';
  panel.className='hidden';
  panel.setAttribute('aria-label','Find and Plan assistant');
  panel.innerHTML=''
    +'<div class="mancardo-fp-head">'
    +  '<div><div class="mancardo-fp-head-title">Find &amp; Plan</div><div class="mancardo-fp-head-sub">Dual sport / enduro route research</div></div>'
    +  '<button type="button" class="icon-btn mancardo-fp-close" id="mancardoFindPlanClose" title="Close" aria-label="Close Find and Plan">&times;</button>'
    +'</div>'
    +'<div class="mancardo-fp-note">Searches public ride reports and track sources. A ridden GPS recording does not prove current public access. ManCardo will not invent trail geometry.</div>'
    +'<div class="mancardo-fp-quick">'
    +  '<button type="button" data-fp-prompt="Find good dual-sport and enduro motorcycle tracks around the current map area. Prioritise routes with public GPX downloads and recent rider reports.">Search this map area</button>'
    +  '<button type="button" data-fp-prompt="Find publicly available GPX tracks ridden on adventure, dual-sport or enduro motorcycles in this area. Compare the best candidates and flag access uncertainty.">Find GPX tracks</button>'
    +'</div>'
    +'<div class="mancardo-fp-messages" id="mancardoFindPlanMessages"></div>'
    +'<div class="mancardo-fp-compose">'
    +  '<textarea id="mancardoFindPlanInput" placeholder="Example: Find FE501-suitable tracks between Batemans Bay and Bermagui. Prefer flowing forest trails and public GPX downloads."></textarea>'
    +  '<div class="mancardo-fp-compose-row"><span class="mancardo-fp-status" id="mancardoFindPlanStatus">Ready</span><button type="button" class="icon-btn mancardo-fp-clear" id="mancardoFindPlanClear">Clear</button><button type="button" class="icon-btn primary mancardo-fp-send" id="mancardoFindPlanSend">Search</button></div>'
    +'</div>';
  layout.insertBefore(panel,main);

  var messagesEl=document.getElementById('mancardoFindPlanMessages');
  var input=document.getElementById('mancardoFindPlanInput');
  var sendBtn=document.getElementById('mancardoFindPlanSend');
  var clearBtn=document.getElementById('mancardoFindPlanClear');
  var closeBtn=document.getElementById('mancardoFindPlanClose');
  var statusEl=document.getElementById('mancardoFindPlanStatus');
  var busy=false;
  var chat=[];

  function loadChat(){
    try{
      var raw=localStorage.getItem(STORE);
      var parsed=raw?JSON.parse(raw):[];
      if(Array.isArray(parsed))chat=parsed.slice(-30);
    }catch(e){chat=[];}
  }
  function saveChat(){
    try{localStorage.setItem(STORE,JSON.stringify(chat.slice(-30)));}catch(e){}
  }
  function safeUrl(value){
    try{var u=new URL(String(value||''));return (u.protocol==='https:'||u.protocol==='http:')?u.toString():'';}catch(e){return '';}
  }
  function looksLikeGpx(url){return /\.gpx(?:$|[?#])/i.test(String(url||''));}
  function filenameForUrl(url){
    try{var p=new URL(url).pathname.split('/').pop()||'imported.gpx';return /\.gpx$/i.test(p)?p:(p+'.gpx');}catch(e){return 'imported.gpx';}
  }
  function uniqueUrls(items){
    var seen={};var out=[];
    (items||[]).forEach(function(v){var u=safeUrl(typeof v==='string'?v:(v&&v.url));if(u&&!seen[u]){seen[u]=true;out.push(u);}});
    return out;
  }
  function importGpxUrl(url,btn){
    url=safeUrl(url);if(!url)return;
    if(btn){btn.disabled=true;btn.textContent='Loading…';}
    statusEl.textContent='Fetching public GPX…';
    fetch('/api/find-plan/gpx',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:url})})
      .then(function(r){return r.text().then(function(text){if(!r.ok){var msg=text;try{var j=JSON.parse(text);msg=j.error||msg;}catch(e){}throw new Error(msg||('HTTP '+r.status));}return text;});})
      .then(function(gpx){
        var items=parseGpxFile(gpx,filenameForUrl(url));
        if(!items||!items.length)throw new Error('No track or route data found in this GPX.');
        showImportDialog(items);
        statusEl.textContent='GPX ready to import';
      })
      .catch(function(e){
        statusEl.textContent='GPX import failed';
        alert('Could not import this GPX. '+(e&&e.message?e.message:'Open the source and download it manually.'));
      })
      .finally(function(){if(btn){btn.disabled=false;btn.textContent='Import GPX';}});
  }
  function renderChat(){
    messagesEl.innerHTML='';
    if(!chat.length){
      var intro=document.createElement('div');intro.className='mancardo-fp-msg assistant';
      intro.textContent='Ask me to find ridden motorcycle routes, public GPX tracks, trail reports or route ideas. I will compare evidence and source links, then we can import real GPX geometry into ManCardo and customise it.';
      messagesEl.appendChild(intro);
    }
    chat.forEach(function(msg){
      var box=document.createElement('div');
      box.className='mancardo-fp-msg '+(msg.role==='user'?'user':'assistant')+(msg.error?' error':'');
      var text=document.createElement('div');text.textContent=msg.text||'';box.appendChild(text);
      if(msg.role!=='user'){
        var sources=Array.isArray(msg.sources)?msg.sources:[];
        var gpxUrls=uniqueUrls(msg.gpx_urls||[]);
        var srcUrls=uniqueUrls(sources);
        var combined=gpxUrls.slice();
        srcUrls.forEach(function(u){if(looksLikeGpx(u)&&combined.indexOf(u)===-1)combined.push(u);});
        if(sources.length||combined.length){
          var list=document.createElement('div');list.className='mancardo-fp-sources';
          sources.slice(0,12).forEach(function(src,i){
            var url=safeUrl(src&&src.url);if(!url)return;
            var row=document.createElement('div');row.className='mancardo-fp-source';
            var a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.textContent=(i+1)+'. '+((src&&src.title)||new URL(url).hostname);a.title=url;row.appendChild(a);
            if(looksLikeGpx(url)){var imp=document.createElement('button');imp.type='button';imp.className='mancardo-fp-import';imp.textContent='Import GPX';imp.onclick=function(ev){ev.preventDefault();ev.stopPropagation();importGpxUrl(url,imp);};row.appendChild(imp);}
            list.appendChild(row);
          });
          combined.forEach(function(url){
            if(sources.some(function(src){return safeUrl(src&&src.url)===url&&looksLikeGpx(url);}))return;
            var row=document.createElement('div');row.className='mancardo-fp-source';
            var a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.textContent='GPX: '+filenameForUrl(url);a.title=url;row.appendChild(a);
            var imp=document.createElement('button');imp.type='button';imp.className='mancardo-fp-import';imp.textContent='Import GPX';imp.onclick=function(ev){ev.preventDefault();ev.stopPropagation();importGpxUrl(url,imp);};row.appendChild(imp);list.appendChild(row);
          });
          box.appendChild(list);
        }
      }
      messagesEl.appendChild(box);
    });
    messagesEl.scrollTop=messagesEl.scrollHeight;
  }
  function mapContext(){
    var out={};
    try{var c=map.getCenter();out.map_center={lat:Number(c.lat.toFixed(5)),lon:Number(c.lng.toFixed(5)),zoom:map.getZoom()};}catch(e){}
    try{
      if(state.current){var st=state.current.stats||computeStats(state.current);out.current_track={name:state.current.name||'Untitled',distance_km:Number(((st&&st.distance||0)/1000).toFixed(1)),segments:state.current.segments?state.current.segments.length:0};}
      out.visible_library_tracks=(state.library||[]).filter(function(t){return t&&t.visible;}).slice(0,10).map(function(t){var st=t.stats||computeStats(t);return{name:t.name||'Untitled',distance_km:Number(((st&&st.distance||0)/1000).toFixed(1))};});
    }catch(e){}
    return out;
  }
  function setBusy(value){busy=!!value;sendBtn.disabled=busy;input.disabled=busy;clearBtn.disabled=busy;statusEl.textContent=busy?'Searching public sources…':'Ready';}
  function openPanel(){panel.classList.remove('hidden');button.classList.add('primary');button.setAttribute('aria-expanded','true');setTimeout(function(){try{map.invalidateSize();}catch(e){}input.focus();},80);}
  function closePanel(){panel.classList.add('hidden');button.classList.remove('primary');button.setAttribute('aria-expanded','false');setTimeout(function(){try{map.invalidateSize();}catch(e){}},80);}
  function sendPrompt(forced){
    if(busy)return;
    var q=String(forced!=null?forced:input.value||'').trim();if(!q)return;
    input.value='';
    chat.push({role:'user',text:q});saveChat();renderChat();setBusy(true);
    var payloadMessages=chat.filter(function(m){return m&&m.text&&(m.role==='user'||m.role==='assistant')&&!m.error;}).slice(-12).map(function(m){return{role:m.role,content:String(m.text).slice(0,5000)};});
    fetch('/api/find-plan/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:payloadMessages,context:mapContext()})})
      .then(function(r){return r.json().catch(function(){return {};}).then(function(data){if(!r.ok)throw new Error(data.error||('HTTP '+r.status));return data;});})
      .then(function(data){chat.push({role:'assistant',text:data.text||'No answer returned.',sources:data.sources||[],gpx_urls:data.gpx_urls||[]});saveChat();renderChat();statusEl.textContent='Search complete';})
      .catch(function(e){chat.push({role:'assistant',text:'Find & Plan could not complete this search. '+(e&&e.message?e.message:'Connection error'),error:true});saveChat();renderChat();statusEl.textContent='Search failed';})
      .finally(function(){setBusy(false);});
  }

  button.onclick=function(){if(panel.classList.contains('hidden'))openPanel();else closePanel();};
  closeBtn.onclick=closePanel;
  sendBtn.onclick=function(){sendPrompt();};
  clearBtn.onclick=function(){if(busy)return;if(chat.length&&!confirm('Clear the Find & Plan conversation on this device?'))return;chat=[];saveChat();renderChat();statusEl.textContent='Ready';};
  input.addEventListener('keydown',function(ev){if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();sendPrompt();}});
  Array.prototype.forEach.call(panel.querySelectorAll('[data-fp-prompt]'),function(b){b.onclick=function(){openPanel();sendPrompt(b.getAttribute('data-fp-prompt'));};});

  loadChat();renderChat();button.setAttribute('aria-expanded','false');
})();
`;

const MAX_GPX_BYTES = 5 * 1024 * 1024;

function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}

function sameOriginRequest(request){
  const origin=request.headers.get('origin');
  if(!origin)return true;
  try{return new URL(origin).host===new URL(request.url).host;}catch(e){return false;}
}

async function requestJson(request){
  try{return await request.json();}catch(e){return null;}
}

function cleanedMessages(value){
  if(!Array.isArray(value))return [];
  return value.slice(-12).map((m)=>({
    role:m&&m.role==='assistant'?'assistant':'user',
    content:String(m&&m.content||'').slice(0,5000)
  })).filter((m)=>m.content.trim());
}

function findPlanInstructions(context){
  const ctx=JSON.stringify(context&&typeof context==='object'?context:{}).slice(0,4000);
  return [
    'You are ManCardo Find & Plan, an evidence-first route research assistant for adventure, dual-sport and enduro motorcycle GPX planning.',
    'Use web search to find PUBLIC ride reports, GPS/GPX track listings, club/forum posts, trip reports, trail databases and direct track downloads relevant to the rider request.',
    'Prioritise routes that were actually ridden on adventure, dual-sport or enduro motorcycles. Prefer recent reports when available.',
    'Never invent, interpolate, guess or fabricate trail geometry, GPX coordinates, GPX download URLs, distances, access status or rider reports.',
    'Search results identify candidates; only a real downloadable GPX/KML or other verified mapping data can provide route geometry.',
    'A rider recording does not prove current legal/public access. Flag closures, private land, permits, seasonal access and uncertainty. Do not advise trespass or bypassing restrictions.',
    'For each strong candidate, give the area/name, source evidence, motorcycle suitability evidence, distance/date if known, terrain/difficulty if supported, and access caveats. Clearly label unknowns.',
    'If a direct publicly accessible GPX URL is genuinely found, print the exact URL on its own line prefixed with GPX: . Do not create a guessed download URL.',
    'If the source needs login, payment, membership, a manual download button, or does not expose a direct GPX, say Open source -> download/upload manually instead of trying to bypass it.',
    'Use source citations throughout. Separate sourced facts from recommendations or inferences.',
    'Collaborate with the rider: compare options and suggest what to inspect or import next. Ask a follow-up only when it materially improves the search.',
    'Keep the response practical and concise enough for a map-side planning panel.',
    'Current ManCardo map context (may be empty and is not necessarily the rider physical location): '+ctx
  ].join('\n');
}

function extractOpenAIResult(data){
  let text='';
  const sourceMap=new Map();
  const outputs=Array.isArray(data&&data.output)?data.output:[];
  for(const item of outputs){
    if(item&&item.type==='message'&&Array.isArray(item.content)){
      for(const content of item.content){
        if(content&&content.type==='output_text'){
          if(content.text)text+=(text?'\n':'')+content.text;
          const anns=Array.isArray(content.annotations)?content.annotations:[];
          for(const ann of anns){
            if(!ann||ann.type!=='url_citation')continue;
            const url=ann.url||(ann.url_citation&&ann.url_citation.url);
            const title=ann.title||(ann.url_citation&&ann.url_citation.title)||'';
            if(url&&!sourceMap.has(url))sourceMap.set(url,{url,title});
          }
        }
      }
    }
    if(item&&item.type==='web_search_call'){
      const sources=(item.action&&Array.isArray(item.action.sources))?item.action.sources:[];
      for(const src of sources){
        const url=src&&src.url;
        const title=src&&src.title||'';
        if(url&&!sourceMap.has(url))sourceMap.set(url,{url,title});
      }
    }
  }
  const gpx=[];
  const re=/\bGPX:\s*(https?:\/\/[^\s<>"']+)/ig;
  let match;
  while((match=re.exec(text))){
    const value=String(match[1]||'').replace(/[),.;]+$/,'');
    if(value&&!gpx.includes(value))gpx.push(value);
  }
  for(const src of sourceMap.values()){
    if(/\.gpx(?:$|[?#])/i.test(src.url)&&!gpx.includes(src.url))gpx.push(src.url);
  }
  return {text:text.trim(),sources:Array.from(sourceMap.values()).slice(0,20),gpx_urls:gpx.slice(0,12)};
}

async function handleFindPlanChat(request,env){
  if(!sameOriginRequest(request))return json({error:'Cross-origin requests are not allowed.'},403);
  if(!env||!String(env.OPENAI_API_KEY||'').trim())return json({error:'OpenAI is not configured yet. Add OPENAI_API_KEY as a Cloudflare Worker secret for ManCardo.'},503);
  const body=await requestJson(request);
  if(!body)return json({error:'Invalid request.'},400);
  const messages=cleanedMessages(body.messages);
  if(!messages.length)return json({error:'Enter a route-planning question first.'},400);
  const model=String(env.OPENAI_MODEL||'gpt-5.6').trim();
  const payload={
    model,
    instructions:findPlanInstructions(body.context),
    input:messages,
    tools:[{type:'web_search'}],
    tool_choice:'auto',
    include:['web_search_call.action.sources'],
    max_output_tokens:2600,
    store:false
  };
  let upstream;
  try{
    upstream=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{'content-type':'application/json','authorization':'Bearer '+String(env.OPENAI_API_KEY).trim()},
      body:JSON.stringify(payload)
    });
  }catch(e){return json({error:'Could not reach OpenAI.'},502);}
  const data=await upstream.json().catch(()=>({}));
  if(!upstream.ok){
    const message=(data&&data.error&&data.error.message)||('OpenAI returned HTTP '+upstream.status);
    return json({error:message},upstream.status>=400&&upstream.status<600?upstream.status:502);
  }
  const result=extractOpenAIResult(data);
  if(!result.text)return json({error:'The research response did not contain an answer.'},502);
  return json(result,200);
}

function isPrivateIpv4(host){
  if(!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host))return false;
  const p=host.split('.').map(Number);
  if(p.some((n)=>n<0||n>255))return true;
  if(p[0]===10||p[0]===127||p[0]===0)return true;
  if(p[0]===169&&p[1]===254)return true;
  if(p[0]===172&&p[1]>=16&&p[1]<=31)return true;
  if(p[0]===192&&p[1]===168)return true;
  if(p[0]===100&&p[1]>=64&&p[1]<=127)return true;
  return false;
}

function validatePublicUrl(value){
  let u;
  try{u=new URL(String(value||''));}catch(e){throw new Error('Invalid GPX URL.');}
  if(u.protocol!=='https:'&&u.protocol!=='http:')throw new Error('Only public HTTP/HTTPS GPX URLs are supported.');
  if(u.username||u.password)throw new Error('Authenticated URLs are not supported.');
  const h=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(!h||h==='localhost'||h==='::1'||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.internal')||h==='metadata.google.internal'||isPrivateIpv4(h))throw new Error('Private or local URLs are not supported.');
  return u;
}

async function fetchPublicGpx(startUrl){
  let current=validatePublicUrl(startUrl);
  for(let i=0;i<4;i++){
    const r=await fetch(current.toString(),{redirect:'manual',headers:{'user-agent':'ManCardo GPX importer/1.0','accept':'application/gpx+xml,application/xml,text/xml,text/plain,*/*;q=0.5'}});
    if(r.status>=300&&r.status<400){
      const loc=r.headers.get('location');if(!loc)throw new Error('GPX download redirected without a location.');
      current=validatePublicUrl(new URL(loc,current).toString());
      continue;
    }
    if(!r.ok)throw new Error('Source returned HTTP '+r.status+'. Open the source and download the GPX manually.');
    const len=Number(r.headers.get('content-length')||0);
    if(len&&len>MAX_GPX_BYTES)throw new Error('GPX file is larger than 5 MB.');
    const text=await r.text();
    if(text.length>MAX_GPX_BYTES)throw new Error('GPX file is larger than 5 MB.');
    if(!/<gpx(?:\s|>)/i.test(text))throw new Error('This link did not return a GPX file. Open the source and download the GPX manually.');
    return {text,url:current.toString()};
  }
  throw new Error('Too many redirects while fetching GPX.');
}

async function handleFindPlanGpx(request){
  if(!sameOriginRequest(request))return json({error:'Cross-origin requests are not allowed.'},403);
  const body=await requestJson(request);if(!body)return json({error:'Invalid request.'},400);
  try{
    const result=await fetchPublicGpx(body.url);
    return new Response(result.text,{status:200,headers:{'content-type':'application/gpx+xml; charset=utf-8','cache-control':'no-store','x-mancardo-source-url':result.url}});
  }catch(e){return json({error:e&&e.message?e.message:'Could not fetch GPX.'},400);}
}

function injectFindPlan(html){
  if(!html.includes('mancardo-find-plan-styles'))html=html.replace('</head>',FIND_PLAN_CSS+'\n</head>');
  if(html.includes('installMancardoFindPlan'))return html;
  const close=html.lastIndexOf('})();');
  if(close===-1)return html;
  return html.slice(0,close)+FIND_PLAN_FEATURE+'\n'+html.slice(close);
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/find-plan/chat'&&request.method==='POST')return handleFindPlanChat(request,env);
    if(url.pathname==='/api/find-plan/gpx'&&request.method==='POST')return handleFindPlanGpx(request);
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=injectFindPlan(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
