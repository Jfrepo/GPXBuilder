import baseWorker from './worker-track-menu-cleanup.js';

const MAP_SEARCH_CSS = String.raw`
<style id="mancardo-map-search-styles">
#mancardoMapSearchBtn{position:absolute;right:.75rem;bottom:.8rem;z-index:910;width:38px;height:36px;min-height:36px;padding:0;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);box-shadow:0 1px 5px rgba(0,0,0,.20);display:flex;align-items:center;justify-content:center}
#mancardoMapSearchBtn:hover,#mancardoMapSearchBtn.on{border-color:var(--accent);color:var(--accent)}
#mancardoMapSearchBtn svg{width:18px;height:18px;display:block}
#mancardoMapSearchPanel{position:absolute;right:.75rem;bottom:3.55rem;z-index:920;width:min(350px,calc(100vw - 24px));border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);box-shadow:0 3px 14px rgba(0,0,0,.22);overflow:hidden}
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
.mancardo-map-search-note.error{color:var(--danger)}
.mancardo-map-search-result{display:block;width:100%;text-align:left;border:0;border-radius:4px;background:transparent;color:var(--text);padding:.48rem .5rem;cursor:pointer}
.mancardo-map-search-result:hover,.mancardo-map-search-result:focus{background:var(--surface-2);outline:none}
.mancardo-map-search-name{display:block;font-weight:750;font-size:.8rem;line-height:1.2}
.mancardo-map-search-address{display:block;margin-top:.12rem;color:var(--text-muted);font-size:.67rem;line-height:1.25}
@media(max-width:767px){
  #mancardoMapSearchBtn{right:.5rem;bottom:.55rem;width:38px;height:36px;min-height:36px}
  #mancardoMapSearchPanel{right:.5rem;bottom:3.35rem;width:min(340px,calc(100vw - 16px))}
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
  var searchInfoWindow=null;
  var searchMarkerMode='';
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
  function setNote(text,isError){
    results.innerHTML='';
    var note=document.createElement('div');
    note.className='mancardo-map-search-note'+(isError?' error':'');
    note.textContent=text;
    results.appendChild(note);
  }
  function shortError(err){
    var text='';
    try{text=String((err&&err.message)||err||'Unknown error');}catch(e){text='Unknown error';}
    text=text.replace(/\s+/g,' ').trim();
    if(text.length>180)text=text.slice(0,177)+'...';
    return text;
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
  function currentBoundsLiteral(){
    try{
      var b=map.getBounds();
      if(!b)return null;
      return {north:b.getNorth(),south:b.getSouth(),east:b.getEast(),west:b.getWest()};
    }catch(e){return null;}
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
  function clearSearchMarker(){
    if(searchInfoWindow){try{searchInfoWindow.close();}catch(e){}searchInfoWindow=null;}
    if(!searchMarker)return;
    if(searchMarkerMode==='google'){
      try{searchMarker.setMap(null);}catch(e){}
    }else{
      try{map.removeLayer(searchMarker);}catch(e){}
    }
    searchMarker=null;
    searchMarkerMode='';
  }
  function showSearchMarker(item){
    var ll=item.location;
    if(!ll)return;
    clearSearchMarker();

    var googleMap=window.__mancardoGoogleMap;
    if(googleMap&&window.google&&google.maps&&typeof google.maps.Marker==='function'){
      searchMarker=new google.maps.Marker({
        position:{lat:ll.lat,lng:ll.lng},
        map:googleMap,
        title:item.name,
        zIndex:999
      });
      searchMarkerMode='google';
      if(typeof google.maps.InfoWindow==='function'){
        var content=document.createElement('div');
        var strong=document.createElement('strong');strong.textContent=item.name;content.appendChild(strong);
        if(item.address){var addr=document.createElement('div');addr.textContent=item.address;content.appendChild(addr);}
        searchInfoWindow=new google.maps.InfoWindow({content:content});
        try{searchInfoWindow.open({map:googleMap,anchor:searchMarker});}catch(e){try{searchInfoWindow.open(googleMap,searchMarker);}catch(_e){}}
      }
      return;
    }

    if(window.L&&typeof L.marker==='function'){
      searchMarker=L.marker([ll.lat,ll.lng],{title:item.name}).addTo(map);
      searchMarkerMode='leaflet';
      var popup=document.createElement('div');
      var strong2=document.createElement('strong');strong2.textContent=item.name;popup.appendChild(strong2);
      if(item.address){var addr2=document.createElement('div');addr2.textContent=item.address;popup.appendChild(addr2);}
      searchMarker.bindPopup(popup).openPopup();
    }
  }
  function selectResult(item){
    var ll=item.location;
    if(!ll)return;
    var z=chooseZoom(item.types);
    if(typeof map.flyTo==='function')map.flyTo([ll.lat,ll.lng],z,{animate:true,duration:.45});
    else map.setView([ll.lat,ll.lng],z);
    showSearchMarker(item);
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
  async function searchPlacesNew(query){
    if(!(window.google&&google.maps))return {items:[],error:'Google Maps has not finished loading'};
    if(typeof google.maps.importLibrary!=='function')return {items:[],error:'Google Maps Places library is unavailable'};
    try{
      var lib=await google.maps.importLibrary('places');
      var Place=(lib&&lib.Place)||(google.maps.places&&google.maps.places.Place);
      if(!Place||typeof Place.searchByText!=='function')return {items:[],error:'Places API (New) search is unavailable'};
      var request={
        textQuery:query,
        fields:['displayName','formattedAddress','location','types'],
        maxResultCount:8,
        region:'au'
      };
      var bias=currentBoundsLiteral();
      if(bias)request.locationBias=bias;
      var response=await Place.searchByText(request);
      var places=response&&response.places||[];
      var items=places.map(function(p){return {name:displayName(p),address:displayAddress(p),location:normaliseLocation(p.location),types:normaliseTypes(p)};}).filter(function(x){return x.location;});
      return {items:items,error:''};
    }catch(err){
      console.warn('ManCardo Places API (New) search failed',err);
      return {items:[],error:shortError(err)};
    }
  }
  function geocodeGoogle(query){
    return new Promise(function(resolve){
      if(!(window.google&&google.maps&&google.maps.Geocoder)){resolve({items:[],error:'Google Geocoding library is unavailable'});return;}
      try{
        var geocoder=new google.maps.Geocoder();
        var request={address:query,region:'au'};
        geocoder.geocode(request,function(found,status){
          var ok=status==='OK'||(google.maps.GeocoderStatus&&status===google.maps.GeocoderStatus.OK);
          if(!ok){resolve({items:[],error:'Geocoding: '+String(status||'unknown status')});return;}
          var items=(found||[]).slice(0,8).map(function(p){
            return {
              name:String((p.address_components&&p.address_components[0]&&p.address_components[0].long_name)||p.formatted_address||query),
              address:String(p.formatted_address||''),
              location:normaliseLocation(p.geometry&&p.geometry.location),
              types:normaliseTypes(p)
            };
          }).filter(function(x){return x.location;});
          resolve({items:items,error:''});
        });
      }catch(err){
        console.warn('ManCardo geocoding fallback failed',err);
        resolve({items:[],error:shortError(err)});
      }
    });
  }
  async function runSearch(){
    var query=String(input.value||'').trim();
    if(!query){setNote('Enter a town, accommodation, landmark, business or address.');input.focus();return;}
    var token=++searchToken;
    setNote('Searching…');

    var places=await searchPlacesNew(query);
    if(token!==searchToken)return;
    if(places.items.length){renderResults(places.items);return;}

    var geocoded=await geocodeGoogle(query);
    if(token!==searchToken)return;
    if(geocoded.items.length){renderResults(geocoded.items);return;}

    var detail=[];
    if(places.error)detail.push('Places: '+places.error);
    if(geocoded.error)detail.push(geocoded.error);
    if(detail.length)setNote('Search could not return results. '+detail.join(' · '),true);
    else setNote('No matching places found. Try a town, business name, accommodation, landmark or address.');
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

function exposeGoogleMap(html){
  if(html.includes('window.__mancardoGoogleMap=googleMap'))return html;
  const needle="var googleTrackData=new google.maps.Data({map:googleMap});";
  if(!html.includes(needle))return html;
  return html.replace(needle,"window.__mancardoGoogleMap=googleMap;\n    "+needle);
}

function injectMapSearch(html){
  html=ensurePlacesLibrary(html);
  html=exposeGoogleMap(html);
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
