import baseWorker from './worker-3d-overlays.js';

const POINT_CURSOR_SYNC_FEATURE = String.raw`
// ---------- Google 2D/3D point-list cursor synchronisation ----------
(function installGooglePointCursorSync(){
  if(!window.google||!google.maps||!state||!els||!els.pointsWrap)return;

  var pointData=null;
  var map3dLib=null;
  var point3dEls=[];
  var syncFrame=null;
  var last3dSignature='';

  function clearData(data){
    if(!data)return;
    var remove=[];data.forEach(function(f){remove.push(f);});
    remove.forEach(function(f){data.remove(f);});
  }

  function hideLeafletPointHighlights(){
    var group=window.__mancardoPointHighlightLayer;
    if(!group||typeof group.eachLayer!=='function')return;
    group.eachLayer(function(layer){
      if(typeof layer.setStyle==='function'){
        try{layer.setStyle({opacity:0,fillOpacity:0});}catch(e){}
      }
    });
  }

  function selectedBySegment(){
    var bySeg={};
    (state.pointHighlights||[]).forEach(function(sel){
      if(!bySeg[sel.seg])bySeg[sel.seg]=[];
      bySeg[sel.seg].push(sel.pt);
    });
    Object.keys(bySeg).forEach(function(k){bySeg[k].sort(function(a,b){return a-b;});});
    return bySeg;
  }

  function ensure2DLayer(){
    var gmap=window.__mancardoGoogleMap;
    if(!gmap||typeof google.maps.Data!=='function')return null;
    if(pointData)return pointData;
    pointData=new google.maps.Data({map:gmap});
    pointData.setStyle(function(feature){
      var kind=feature.getProperty('kind');
      if(kind==='rangeHalo')return {clickable:false,zIndex:20,strokeColor:'#111827',strokeOpacity:.28,strokeWeight:15};
      if(kind==='rangeCore')return {clickable:false,zIndex:21,strokeColor:getCss('--line-selected'),strokeOpacity:.96,strokeWeight:10};
      if(kind==='hover')return {clickable:false,zIndex:24,icon:{path:google.maps.SymbolPath.CIRCLE,scale:10,fillColor:'#ffd400',fillOpacity:1,strokeColor:'#111827',strokeOpacity:1,strokeWeight:3}};
      return {clickable:false,zIndex:22,icon:{path:google.maps.SymbolPath.CIRCLE,scale:7,fillColor:getCss('--line-selected'),fillOpacity:1,strokeColor:'#ffffff',strokeOpacity:1,strokeWeight:2}};
    });
    return pointData;
  }

  function sync2D(){
    hideLeafletPointHighlights();
    var data=ensure2DLayer();
    if(!data)return;
    clearData(data);
    if(!state.current)return;

    var bySeg=selectedBySegment();
    Object.keys(bySeg).forEach(function(k){
      var si=parseInt(k,10),seg=state.current.segments&&state.current.segments[si],pts=bySeg[k];
      if(!seg||!pts.length)return;
      if(pts.length>1){
        var start=pts[0],end=pts[pts.length-1];
        var path=[];
        for(var i=start;i<=end;i++)if(seg[i])path.push(new google.maps.LatLng(seg[i].lat,seg[i].lon));
        if(path.length>1){
          data.add(new google.maps.Data.Feature({geometry:new google.maps.Data.LineString(path),properties:{kind:'rangeHalo'}}));
          data.add(new google.maps.Data.Feature({geometry:new google.maps.Data.LineString(path),properties:{kind:'rangeCore'}}));
        }
      }
      pts.forEach(function(pi){
        var p=seg[pi];if(!p)return;
        data.add(new google.maps.Data.Feature({geometry:new google.maps.Data.Point(new google.maps.LatLng(p.lat,p.lon)),properties:{kind:'selected'}}));
      });
    });

    if(state.pointHover){
      var hseg=state.current.segments&&state.current.segments[state.pointHover.seg];
      var hp=hseg&&hseg[state.pointHover.pt];
      if(hp)data.add(new google.maps.Data.Feature({geometry:new google.maps.Data.Point(new google.maps.LatLng(hp.lat,hp.lon)),properties:{kind:'hover'}}));
    }
  }

  function clear3D(){
    while(point3dEls.length){var el=point3dEls.pop();try{el.remove();}catch(e){}}
  }

  function pointSignature(){
    var h=state.pointHover?state.pointHover.seg+':'+state.pointHover.pt:'-';
    var s=(state.pointHighlights||[]).map(function(x){return x.seg+':'+x.pt;}).join(',');
    var id=state.current?(state.current.id||state.currentId||'current'):'none';
    return id+'|'+h+'|'+s;
  }

  async function sync3D(){
    var map3d=document.getElementById('mancardo3dMap');
    if(!map3d||!map3d.classList.contains('on')){clear3D();last3dSignature='';return;}
    if(!state.current)return;
    var sig=pointSignature();
    if(sig===last3dSignature)return;
    last3dSignature=sig;
    try{
      if(!map3dLib)map3dLib=await google.maps.importLibrary('maps3d');
      var Polyline3DElement=map3dLib.Polyline3DElement,Marker3DElement=map3dLib.Marker3DElement;
      clear3D();
      var bySeg=selectedBySegment();
      Object.keys(bySeg).forEach(function(k){
        var si=parseInt(k,10),seg=state.current.segments&&state.current.segments[si],pts=bySeg[k];
        if(!seg||!pts.length)return;
        if(pts.length>1){
          var path=[];
          for(var i=pts[0];i<=pts[pts.length-1];i++)if(seg[i])path.push({lat:seg[i].lat,lng:seg[i].lon,altitude:7});
          if(path.length>1){
            var halo=new Polyline3DElement({path:path,strokeColor:'#111827',strokeWidth:14,altitudeMode:'RELATIVE_TO_GROUND',drawsOccludedSegments:true,zIndex:30});
            var core=new Polyline3DElement({path:path,strokeColor:getCss('--line-selected'),strokeWidth:9,altitudeMode:'RELATIVE_TO_GROUND',drawsOccludedSegments:true,zIndex:31});
            map3d.append(halo);map3d.append(core);point3dEls.push(halo,core);
          }
        }
      });
      if(state.pointHover){
        var hseg=state.current.segments&&state.current.segments[state.pointHover.seg];
        var hp=hseg&&hseg[state.pointHover.pt];
        if(hp){
          var marker=new Marker3DElement({position:{lat:hp.lat,lng:hp.lon,altitude:14},altitudeMode:'RELATIVE_TO_GROUND',label:'●',sizePreserved:true,drawsWhenOccluded:true,zIndex:40});
          marker.title='Point '+(state.pointHover.pt+1);
          map3d.append(marker);point3dEls.push(marker);
        }
      }
    }catch(err){console.warn('3D point cursor sync failed',err);}
  }

  function syncAll(){
    syncFrame=null;
    sync2D();
    sync3D();
  }
  function queueSync(){
    if(syncFrame!=null)cancelAnimationFrame(syncFrame);
    syncFrame=requestAnimationFrame(syncAll);
  }

  var baseRenderPointCursor=render;
  render=function(){
    var result=baseRenderPointCursor.apply(this,arguments);
    queueSync();
    return result;
  };

  els.pointsWrap.addEventListener('scroll',queueSync,{passive:true});
  els.pointsWrap.addEventListener('wheel',function(){requestAnimationFrame(queueSync);},{passive:true});
  if(els.pointsBody){
    els.pointsBody.addEventListener('mouseover',queueSync,true);
    els.pointsBody.addEventListener('click',queueSync,true);
    if(window.MutationObserver){
      new MutationObserver(queueSync).observe(els.pointsBody,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    }
  }

  // The 3D map changes visibility independently of the point table. This lightweight
  // watcher catches entering/exiting 3D without driving map rendering itself.
  setInterval(function(){
    var map3d=document.getElementById('mancardo3dMap');
    if((map3d&&map3d.classList.contains('on'))||last3dSignature)queueSync();
  },250);

  queueSync();
})();
`;

function patchPointCursorSync(html){
  if(html.includes('installGooglePointCursorSync'))return html;
  html=html.replace(
    'var pointHighlightLayer=L.layerGroup().addTo(map);',
    'var pointHighlightLayer=L.layerGroup().addTo(map);window.__mancardoPointHighlightLayer=pointHighlightLayer;'
  );
  html=html.replace(
    '    // Render the visible route/track geometry in the same Google Maps renderer as the',
    '    window.__mancardoGoogleMap=googleMap;\n\n    // Render the visible route/track geometry in the same Google Maps renderer as the'
  );
  var close=html.lastIndexOf('})();');
  if(close===-1)return html;
  return html.slice(0,close)+POINT_CURSOR_SYNC_FEATURE+'\n'+html.slice(close);
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=patchPointCursorSync(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
