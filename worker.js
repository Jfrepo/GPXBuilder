const POINT_LIST_CSS = String.raw`
<style id="point-list-highlight-styles">
table.points th.point-hl-head,
table.points td.point-hl-cell{width:34px;min-width:34px;text-align:center;padding:.2rem .25rem}
.point-hl-check{width:16px;height:16px;margin:0;vertical-align:middle;accent-color:var(--line-selected);cursor:pointer}
table.points tr.multi-point{background:rgba(193,68,45,.16)!important;box-shadow:inset 4px 0 0 var(--line-selected)}
table.points tr.scroll-point{outline:2px solid #d49a00;outline-offset:-2px;background:rgba(224,168,0,.12)}
table.points tr.multi-point.scroll-point{background:linear-gradient(90deg,rgba(193,68,45,.18),rgba(224,168,0,.16))!important}
table.points th.point-hl-head{font-size:.62rem;letter-spacing:.03em;cursor:default}
</style>`;

const POINT_LIST_FEATURE = String.raw`
// ---------- point-list map highlighting ----------
(function installPointListMapHighlighting(){
  if(state.pointHighlights==null) state.pointHighlights=[];
  if(state.pointHover==null) state.pointHover=null;
  state.pointHighlightAnchor=null;

  var pointHighlightLayer=L.layerGroup().addTo(map);
  var pointScrollFrame=null;

  function pointKey(seg,pt){return String(seg)+':'+String(pt);}
  function hasHighlight(seg,pt){
    var key=pointKey(seg,pt);
    return state.pointHighlights.some(function(x){return pointKey(x.seg,x.pt)===key;});
  }
  function addHighlight(seg,pt){
    if(!hasHighlight(seg,pt)) state.pointHighlights.push({seg:seg,pt:pt});
  }
  function removeHighlight(seg,pt){
    var key=pointKey(seg,pt);
    state.pointHighlights=state.pointHighlights.filter(function(x){return pointKey(x.seg,x.pt)!==key;});
  }
  function toggleHighlight(seg,pt){
    if(hasHighlight(seg,pt)) removeHighlight(seg,pt); else addHighlight(seg,pt);
    state.pointHighlightAnchor={seg:seg,pt:pt};
    renderPointsTable();
    drawPointListHighlights();
  }
  function addHighlightRange(seg,fromPt,toPt){
    var a=Math.min(fromPt,toPt),b=Math.max(fromPt,toPt);
    for(var i=a;i<=b;i++) addHighlight(seg,i);
    state.pointHighlightAnchor={seg:seg,pt:toPt};
    renderPointsTable();
    drawPointListHighlights();
  }
  function clearPointHighlights(){
    state.pointHighlights=[];
    state.pointHover=null;
    state.pointHighlightAnchor=null;
    pointHighlightLayer.clearLayers();
  }

  function drawPointListHighlights(){
    pointHighlightLayer.clearLayers();
    if(!state.current) return;

    var bySeg={};
    state.pointHighlights.forEach(function(sel){
      var seg=state.current.segments[sel.seg];
      if(!seg||!seg[sel.pt]) return;
      if(!bySeg[sel.seg]) bySeg[sel.seg]=[];
      bySeg[sel.seg].push(sel.pt);
    });

    Object.keys(bySeg).forEach(function(siText){
      var si=parseInt(siText,10),seg=state.current.segments[si];
      var pts=bySeg[si].slice().sort(function(a,b){return a-b;});
      if(!seg||!pts.length) return;

      if(pts.length>1){
        var start=pts[0],end=pts[pts.length-1];
        var line=seg.slice(start,end+1).map(function(p){return[p.lat,p.lon];});
        if(line.length>1){
          L.polyline(line,{color:'#111827',weight:15,opacity:.28,interactive:false,lineCap:'round',lineJoin:'round'}).addTo(pointHighlightLayer);
          L.polyline(line,{color:getCss('--line-selected'),weight:10,opacity:.96,interactive:false,lineCap:'round',lineJoin:'round'}).addTo(pointHighlightLayer);
        }
      }

      pts.forEach(function(pi){
        var p=seg[pi];
        L.circleMarker([p.lat,p.lon],{radius:7,color:'#fff',weight:2,fillColor:getCss('--line-selected'),fillOpacity:1,interactive:false}).addTo(pointHighlightLayer);
      });
    });

    if(state.pointHover){
      var hseg=state.current.segments[state.pointHover.seg];
      var hp=hseg&&hseg[state.pointHover.pt];
      if(hp){
        L.circleMarker([hp.lat,hp.lon],{radius:10,color:'#111827',weight:3,fillColor:'#ffd400',fillOpacity:1,interactive:false}).addTo(pointHighlightLayer);
      }
    }
  }

  function syncPointRowClasses(){
    var rows=els.pointsBody.querySelectorAll('tr[data-seg][data-pt]');
    rows.forEach(function(row){
      var si=parseInt(row.dataset.seg,10),pi=parseInt(row.dataset.pt,10);
      row.classList.toggle('multi-point',hasHighlight(si,pi));
      row.classList.toggle('scroll-point',!!state.pointHover&&state.pointHover.seg===si&&state.pointHover.pt===pi);
      var check=row.querySelector('.point-hl-check');
      if(check) check.checked=hasHighlight(si,pi);
    });
  }

  function setHoverPoint(seg,pt){
    if(state.pointHover&&state.pointHover.seg===seg&&state.pointHover.pt===pt) return;
    state.pointHover={seg:seg,pt:pt};
    syncPointRowClasses();
    drawPointListHighlights();
  }

  function highlightPointAtScrollCentre(){
    pointScrollFrame=null;
    if(els.pointsWrap.classList.contains('hidden')) return;
    var rows=els.pointsBody.querySelectorAll('tr[data-seg][data-pt]');
    if(!rows.length) return;
    var centre=els.pointsWrap.scrollTop+(els.pointsWrap.clientHeight/2);
    var best=null,bestDistance=Infinity;
    rows.forEach(function(row){
      var mid=row.offsetTop+(row.offsetHeight/2);
      var d=Math.abs(mid-centre);
      if(d<bestDistance){bestDistance=d;best=row;}
    });
    if(best) setHoverPoint(parseInt(best.dataset.seg,10),parseInt(best.dataset.pt,10));
  }

  var baseRenderPointsTable=renderPointsTable;
  renderPointsTable=function(){
    if(els.pointsWrap.classList.contains('hidden')) return;
    var oldScroll=els.pointsWrap.scrollTop;
    var body=els.pointsBody;body.innerHTML='';
    if(!state.current) return;

    var headRow=els.pointsWrap.querySelector('thead tr');
    if(headRow&&!headRow.querySelector('.point-hl-head')){
      var h=document.createElement('th');
      h.className='point-hl-head';h.textContent='HL';h.title='Highlight points on map';
      headRow.insertBefore(h,headRow.firstChild);
    }

    var running=0,idx=0;
    state.current.segments.forEach(function(seg,si){
      seg.forEach(function(p,pi){
        if(pi>0) running+=haversine(seg[pi-1],p);
        var tr=document.createElement('tr');
        tr.dataset.seg=si;tr.dataset.pt=pi;
        if(state.selection&&state.selection.seg===si&&state.selection.pt===pi) tr.classList.add('sel');
        if(hasHighlight(si,pi)) tr.classList.add('multi-point');
        if(state.pointHover&&state.pointHover.seg===si&&state.pointHover.pt===pi) tr.classList.add('scroll-point');
        tr.innerHTML='<td class="point-hl-cell"><input type="checkbox" class="point-hl-check" title="Highlight this point on map" '+(hasHighlight(si,pi)?'checked':'')+'></td><td>'+(idx+1)+'</td><td>'+si+'</td><td>'+p.lat.toFixed(5)+'</td><td>'+p.lon.toFixed(5)+'</td><td>'+(p.ele!=null?Math.round(p.ele):'')+'</td><td>'+(running/1000).toFixed(2)+'</td>';

        var check=tr.querySelector('.point-hl-check');
        check.addEventListener('click',function(ev){ev.stopPropagation();toggleHighlight(si,pi);});
        tr.addEventListener('mouseenter',function(){setHoverPoint(si,pi);});
        tr.addEventListener('click',function(ev){
          if(ev.ctrlKey||ev.metaKey){ev.preventDefault();toggleHighlight(si,pi);return;}
          if(ev.shiftKey&&state.pointHighlightAnchor&&state.pointHighlightAnchor.seg===si){ev.preventDefault();addHighlightRange(si,state.pointHighlightAnchor.pt,pi);return;}
          selectPoint(si,pi);
        });
        body.appendChild(tr);idx++;
      });
    });
    els.pointsWrap.scrollTop=oldScroll;
    if(pointScrollFrame==null) pointScrollFrame=requestAnimationFrame(highlightPointAtScrollCentre);
  };

  var baseRender=render;
  render=function(){
    baseRender();
    drawPointListHighlights();
  };

  var baseLoadItem=loadItem;
  loadItem=function(id){
    clearPointHighlights();
    baseLoadItem(id);
  };

  var baseStartNewRoute=startNewRoute;
  startNewRoute=function(){
    clearPointHighlights();
    baseStartNewRoute();
  };

  els.pointsWrap.addEventListener('scroll',function(){
    if(pointScrollFrame!=null) cancelAnimationFrame(pointScrollFrame);
    pointScrollFrame=requestAnimationFrame(highlightPointAtScrollCentre);
  },{passive:true});

  els.pointsWrap.addEventListener('mouseleave',function(){
    if(!state.pointHighlights.length){state.pointHover=null;syncPointRowClasses();drawPointListHighlights();}
  });

  render();
})();
`;

function injectPointListFeature(html){
  if(html.indexOf('installPointListMapHighlighting')!==-1) return html;
  html=html.replace('</head>',POINT_LIST_CSS+'\n</head>');
  var close=html.lastIndexOf('})();');
  if(close===-1) return html;
  return html.slice(0,close)+POINT_LIST_FEATURE+'\n'+html.slice(close);
}

export default {
  async fetch(request,env){
    const response=await env.ASSETS.fetch(request);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html')) return response;

    const html=injectPointListFeature(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
