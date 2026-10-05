import baseWorker from './worker-track-menu-cleanup.js';

const MAP_SEARCH_CSS = String.raw`
<style id="mancardo-map-search-styles">
#mancardoMapSearchBtn{position:absolute;right:.7rem;top:3.55rem;z-index:910;width:36px;height:34px;min-height:34px;padding:0;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);box-shadow:0 1px 5px rgba(0,0,0,.20);display:flex;align-items:center;justify-content:center}
#mancardoMapSearchBtn:hover,#mancardoMapSearchBtn.on{border-color:var(--accent);color:var(--accent)}
#mancardoMapSearchBtn svg{width:18px;height:18px;display:block}
#mancardoMapSearchPanel{position:absolute;right:.7rem;top:6rem;z-index:920;width:min(340px,calc(100vw - 24px));border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);box-shadow:0 3px 14px rgba(0,0,0,.22);overflow:hidden}
#mancardoMapSearchPanel.hidden{display:none!important}
.mancardo-map-search-head{display:flex;align-items:center;gap:.35rem;padding:.45rem;border-bottom:1px solid var(--border)}
#mancardoMapSearchInput{flex:1;min-width:0;height:34px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);padding:0 .55rem;font:600 .78rem 'Source Sans 3',system-ui,sans-serif}
#mancardoMapSearchInput:focus{outline:2px solid color-mix(in srgb,var(--accent) 40%,transparent);outline-offset:1px;border-color:var(--accent)}
#mancardoMapSearchGo,#mancardoMapSearchClose{height:34px;min-height:34px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);font-weight:800}
#mancardoMapSearchGo{width:38px;padding:0;font-size:0}
#mancardoMapSearchGo svg{width:17px;height:17px;vertical-align:middle}
#mancardoMapSearchClose{width:34px;padding:0;font-size:18px;line-height:30px}
#mancardoMapSearchGo:hover,#mancardoMapSearchClose:hover{border-color:var(--accent)}
#mancardoMapSearchResults{max-height:min(44vh,340px);overflow-y:auto;padding:.25rem}
.mancardo-map-search-note{padding:.7rem .65rem;color:var(--text-muted);font-size:.74rem;line-height:1.35}
.mancardo-map-search-result{display:block;width:100%;text-align:left;border:0;border-radius:4px;background:transparent;color:var(--text);padding:.48rem .5rem;cursor:pointer}
.mancardo-map-search-result:hover,.mancardo-map-search-result:focus{background:var(--surface-2);outline:none}
.mancardo-map-search-name{display:block;font-weight:750;font-size:.8rem;line-height:1.2}
.mancardo-map-search-address{display:block;margin-top:.12rem;color:var(--text-muted);font-size:.67rem;line-height:1.25}
@media(max-width:767px){
  #mancardoMapSearchBtn{right:.55rem;top:3.4rem;width:34px;height:32px;min-height:32px}
  #mancardoMapSearchPanel{right:.5rem;top:5.75rem;width:min(330px,calc(100vw - 16px))}
}
</style>`;

const MAP_SEARCH_FEATURE = String.raw`
// ---------- Map place / town / accommodation / POI search ----------
(function installMancardoMapSearch(){
  if(window.__mancardoMapSearchInstalled)return;
  window.__mancardoMapSearchInstalled=true;

  var wrap=document.querySelector('.map-wrap');
  if(!wrap)return;

  var searchMarker=null;
  var searchToken=0;

  var icon='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.2" fill="none" stroke="currentColor" stroke-width="2"></circle><path d="M15.2 15.2L20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>';

  var btn=document.createElement('button');
  btn.type='button';
  btn.id='mancardoMapSearchBtn';
  btn.title='Search map';
  btn.setAttribute('aria-label','Search map');
  btn.innerHTML=icon;

  var panel=document.createElement('div');
  panel.id='mancardoMapSearchPanel';
  panel.className='hidden';
  panel.innerHTML='<div class="mancardo-map-search-head">'
    +'<input id="mancardoMapSearchInput" type="search" autocomplete="off" spellcheck="false" placeholder="Town, accommodation or POI">'
    +'<button type="button" id="mancardoMapSearchGo" title="Search" aria-label="Search">'+icon+'</button>'
    +'<button type="button" id="mancardoMapSearchClose" title="Close" aria-label="Close">&times;</button>'
    +'</div><div id="mancardoMapSearchResults"><div class="mancardo-map-search-note">Search for towns, accommodation, landmarks, shops, fuel, food and other places.</div></div>';

  wrap.appendChild(btn);
  wrap.appendChild(panel);

  var input=panel.querySelector('#mancardoMapSearchInput');
  var go=panel.querySelector('#mancardoMapSearchGo');
  var close=panel.querySelector('#mancardoMapSearchClose');
  var results=panel.querySelector('#mancardoMapSearchResults');

  function openPanel(){
    panel.classList.remove('hidden');
    btn.classList.add('on');
    setTimeout(function(){input.focus();input.select();},0);
  }
  function closePanel(){
    panel.classList.add('hidden');
    btn.classList.remove('on');
  }
  function setNote(text){
    results.innerHTML='';
    var note=document.createElement('div');
    note.className='mancardo-map-search-note';
    note.textContent=text;
    results.appendChild(note);
  }
  function normaliseLocation(loc){
    if(!loc)return null;
    var lat=typeof loc.lat==='function'?loc.lat():Number(loc.lat);
    var lng=typeof loc.lng==='function'?loc.lng():Number(loc.lng);
    if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
    return {lat:lat,lng:lng};
  }
  function displayName(place){
    var name=place&&place.displayName;
    if(name&&typeof name==='object')name=name.text||name.name||'';
    return String(name||place.name||place.formattedAddress||place.formatted_address||'Place');
  }
  function displayAddress(place){
    return String((place&&(place.formattedAddress||place.formatted_address))||'');
  }
  function normaliseTypes(place){
    return Array.isArray(place&&place.types)?place.types.slice():[];
  }
  function chooseZoom(types){
    types=types||[];
    if(types.indexOf('country')>=0)return 5;
    if(types.indexOf('administrative_area_level_1')>=0)return 7;
    if(types.indexOf('administrative_area_level_2')>=0)return 9;
    if(types.indexOf('locality')>=0||types.indexOf('postal_town')>=0)return 12;
    if(types.indexOf('lodging')>=0||types.indexOf('restaurant')>=0||types.indexOf('tourist_attraction')>=0||types.indexOf('point_of_interest')>=0||types.indexOf('establishment')>=0)return 16;
    return 14;
  }
  function selectResult(item){
    var ll=item.location;
    if(!ll)return;
    var z=chooseZoom(item.types);
    if(typeof map.flyTo==='function')map.flyTo([ll.lat,ll.lng],z,{animate:true,duration:.45});
    else map.setView([ll.lat,ll.lng],z);

    if(searchMarker){try{map.removeLayer(searchMarker);}catch(e){} searchMarker=null;}
    if(window.L&&typeof L.marker==='function'){
      searchMarker=L.marker([ll.lat,ll.lng],{title:item.name}).addTo(map);
      var popup=document.createElement('div');
      var strong=document.createElement('strong');strong.textContent=item.name;popup.appendChild(strong);
      if(item.address){var addr=document.createElement('div');addr.textContent=item.address;popup.appendChild(addr);}
      searchMarker.bindPopup(popup).openPopup();
    }
    closePanel();
  }
  function renderResults(items){
    results.innerHTML='';
    if(!items.length){setNote('No matching places found. Try a town, business name, accommodation, landmark or address.');return;}
    items.slice(0,8).forEach(function(item){
      var row=document.createElement('button');
      row.type='button';
      row.className='mancardo-map-search-result';
      var name=document.createElement('span');name.className='mancardo-map-search-name';name.textContent=item.name;
      var address=document.createElement('span');address.className='mancardo-map-search-address';address.textContent=item.address;
      row.appendChild(name);if(item.address)row.appendChild(address);
      row.onclick=function(){selectResult(item);};
      results.appendChild(row);
    });
  }
  async function modernPlaces(query){
    if(!(window.google&&google.maps))return null;
    var lib=null;
    try{if(typeof google.maps.importLibrary==='function')lib=await google.maps.importLibrary('places');}catch(e){return null;}
    var Place=(lib&&lib.Place)||(google.maps.places&&google.maps.places.Place);
    if(!Place||typeof Place.searchByText!=='function')return null;
    try{
      var response=await Place.searchByText({
        textQuery:query,
        fields:['displayName','formattedAddress','location','types'],
        maxResultCount:8
      });
      var places=response&&response.places||[];
      return places.map(function(p){return {name:displayName(p),address:displayAddress(p),location:normaliseLocation(p.location),types:normaliseTypes(p)};}).filter(function(x){return x.location;});
    }catch(e){return null;}
  }
  function legacyPlaces(query){
    return new Promise(function(resolve){
      if(!(window.google&&google.maps&&google.maps.places&&google.maps.places.PlacesService)){resolve(null);return;}
      try{
        var service=new google.maps.places.PlacesService(document.createElement('div'));
        service.textSearch({query:query},function(found,status){
          if(status!==google.maps.places.PlacesServiceStatus.OK){resolve(status===google.maps.places.PlacesServiceStatus.ZERO_RESULTS?[]:null);return;}
          resolve((found||[]).slice(0,8).map(function(p){return {name:displayName(p),address:displayAddress(p),location:normaliseLocation(p.geometry&&p.geometry.location),types:normaliseTypes(p)};}).filter(function(x){return x.location;}));
        });
      }catch(e){resolve(null);}
    });
  }
  function geocodeFallback(query){
    return new Promise(function(resolve){
      if(!(window.google&&google.maps&&google.maps.Geocoder)){resolve([]);return;}
      try{
        var geocoder=new google.maps.Geocoder();
        geocoder.geocode({address:query},function(found,status){
          if(status!=='OK'){resolve([]);return;}
          resolve((found||[]).slice(0,8).map(function(p){return {name:String((p.address_components&&p.address_components[0]&&p.address_components[0].long_name)||p.formatted_address||query),address:String(p.formatted_address||''),location:normaliseLocation(p.geometry&&p.geometry.location),types:normaliseTypes(p)};}).filter(function(x){return x.location;}));
        });
      }catch(e){resolve([]);}
    });
  }
  async function runSearch(){
    var query=String(input.value||'').trim();
    if(!query){setNote('Enter a town, accommodation, landmark, business or address.');input.focus();return;}
    var token=++searchToken;
    setNote('Searching…');
    var found=await modernPlaces(query);
    if(found===null)found=await legacyPlaces(query);
    if(found===null)found=await geocodeFallback(query);
    if(token!==searchToken)return;
    renderResults(found||[]);
  }

  btn.onclick=function(ev){ev.stopPropagation();panel.classList.contains('hidden')?openPanel():closePanel();};
  go.onclick=function(){runSearch();};
  close.onclick=function(){closePanel();};
  input.addEventListener('keydown',function(ev){
    if(ev.key==='Enter'){ev.preventDefault();runSearch();}
    else if(ev.key==='Escape'){ev.preventDefault();closePanel();}
  });
  panel.addEventListener('click',function(ev){ev.stopPropagation();});
  document.addEventListener('click',function(ev){
    if(panel.classList.contains('hidden'))return;
    if(ev.target===btn||btn.contains(ev.target)||panel.contains(ev.target))return;
    closePanel();
  });
})();
`;

function ensurePlacesLibrary(html){
  return html.replace(/https:\/\/maps\.googleapis\.com\/maps\/api\/js\?[^\"'<>]+/g,function(src){
    if(/[?&]libraries=/.test(src)){
      return src.replace(/([?&]libraries=)([^&\"'<>]+)/,function(_m,prefix,value){
        var libs=value.split(',');
        if(libs.indexOf('places')<0)libs.push('places');
        return prefix+libs.join(',');
      });
    }
    return src+'&libraries=places';
  });
}

function injectMapSearch(html){
  html=ensurePlacesLibrary(html);
  if(!html.includes('mancardo-map-search-styles'))html=html.replace('</head>',MAP_SEARCH_CSS+'\n</head>');
  if(html.includes('installMancardoMapSearch'))return html;
  const close=html.lastIndexOf('})();');
  if(close===-1)return html;
  return html.slice(0,close)+MAP_SEARCH_FEATURE+'\n'+html.slice(close);
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=injectMapSearch(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
