const POINT_LIST_CSS = String.raw`
<style id="point-list-highlight-styles">
.app{height:100dvh;max-height:100dvh;overflow:hidden}
.layout,.main,.map-wrap{min-height:0}
.dock{flex:none;max-height:48dvh;min-height:0;overflow:hidden;display:flex;flex-direction:column}
.points-table-wrap{max-height:none!important;min-height:96px;flex:1 1 220px;overflow:auto;overscroll-behavior:contain}
table.points tr.multi-point{background:rgba(193,68,45,.16)!important;box-shadow:inset 4px 0 0 var(--line-selected)}
table.points tr.scroll-point{outline:2px solid #d49a00;outline-offset:-2px;background:rgba(224,168,0,.12)}
table.points tr.multi-point.scroll-point{background:linear-gradient(90deg,rgba(193,68,45,.18),rgba(224,168,0,.16))!important}
table.points tr.range-anchor{box-shadow:inset 4px 0 0 var(--accent)}
@media(max-height:700px){.dock{max-height:55dvh}.points-table-wrap{min-height:80px}}
</style>`;

const POINT_LIST_FEATURE = String.raw`
// ---------- point-list map highlighting ----------
(function installPointListMapHighlighting(){
  if(state.pointHighlights==null) state.pointHighlights=[];
  if(state.pointHover==null) state.pointHover=null;
  state.pointHighlightAnchor=null;

  var pointHighlightLayer=L.layerGroup().addTo(map);
  var pointScrollFrame=null;
  var shiftHeld=false;

  function pointKey(seg,pt){return String(seg)+':'+String(pt);}
  function hasHighlight(seg,pt){
    var key=pointKey(seg,pt);
    return state.pointHighlights.some(function(x){return pointKey(x.seg,x.pt)===key;});
  }
  function setRange(seg,fromPt,toPt){
    var a=Math.min(fromPt,toPt),b=Math.max(fromPt,toPt);
    state.pointHighlights=[];
    for(var i=a;i<=b;i++) state.pointHighlights.push({seg:seg,pt:i});
    syncPointRowClasses();
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
      row.classList.toggle('range-anchor',!!state.pointHighlightAnchor&&state.pointHighlightAnchor.seg===si&&state.pointHighlightAnchor.pt===pi);
    });
  }

  function setHoverPoint(seg,pt){
    var changed=!(state.pointHover&&state.pointHover.seg===seg&&state.pointHover.pt===pt);
    state.pointHover={seg:seg,pt:pt};
    if(shiftHeld&&state.pointHighlightAnchor&&state.pointHighlightAnchor.seg===seg){
      setRange(seg,state.pointHighlightAnchor.pt,pt);
      return;
    }
    if(changed){syncPointRowClasses();drawPointListHighlights();}
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

  renderPointsTable=function(){
    if(els.pointsWrap.classList.contains('hidden')) return;
    var oldScroll=els.pointsWrap.scrollTop;
    var body=els.pointsBody;body.innerHTML='';
    if(!state.current) return;

    var running=0,idx=0;
    state.current.segments.forEach(function(seg,si){
      seg.forEach(function(p,pi){
        if(pi>0) running+=haversine(seg[pi-1],p);
        var tr=document.createElement('tr');
        tr.dataset.seg=si;tr.dataset.pt=pi;
        if(state.selection&&state.selection.seg===si&&state.selection.pt===pi) tr.classList.add('sel');
        if(hasHighlight(si,pi)) tr.classList.add('multi-point');
        if(state.pointHover&&state.pointHover.seg===si&&state.pointHover.pt===pi) tr.classList.add('scroll-point');
        if(state.pointHighlightAnchor&&state.pointHighlightAnchor.seg===si&&state.pointHighlightAnchor.pt===pi) tr.classList.add('range-anchor');
        tr.innerHTML='<td>'+(idx+1)+'</td><td>'+si+'</td><td>'+p.lat.toFixed(5)+'</td><td>'+p.lon.toFixed(5)+'</td><td>'+(p.ele!=null?Math.round(p.ele):'')+'</td><td>'+(running/1000).toFixed(2)+'</td>';

        tr.addEventListener('mouseenter',function(){setHoverPoint(si,pi);});
        tr.addEventListener('click',function(ev){
          if(ev.shiftKey&&state.pointHighlightAnchor&&state.pointHighlightAnchor.seg===si){
            ev.preventDefault();
            setRange(si,state.pointHighlightAnchor.pt,pi);
            return;
          }
          state.pointHighlights=[];
          state.pointHighlightAnchor={seg:si,pt:pi};
          state.pointHover={seg:si,pt:pi};
          selectPoint(si,pi);
          syncPointRowClasses();
          drawPointListHighlights();
        });
        body.appendChild(tr);idx++;
      });
    });
    els.pointsWrap.scrollTop=oldScroll;
    if(pointScrollFrame==null) pointScrollFrame=requestAnimationFrame(highlightPointAtScrollCentre);
  };

  var baseRender=render;
  render=function(){baseRender();drawPointListHighlights();};

  var baseLoadItem=loadItem;
  loadItem=function(id){clearPointHighlights();baseLoadItem(id);};

  var baseStartNewRoute=startNewRoute;
  startNewRoute=function(){clearPointHighlights();baseStartNewRoute();};

  document.addEventListener('keydown',function(ev){
    if(ev.key==='Shift') shiftHeld=true;
  },true);
  document.addEventListener('keyup',function(ev){
    if(ev.key==='Shift') shiftHeld=false;
  },true);
  window.addEventListener('blur',function(){shiftHeld=false;});

  els.pointsWrap.addEventListener('scroll',function(){
    if(pointScrollFrame!=null) cancelAnimationFrame(pointScrollFrame);
    pointScrollFrame=requestAnimationFrame(highlightPointAtScrollCentre);
  },{passive:true});

  els.pointsWrap.addEventListener('wheel',function(ev){
    shiftHeld=!!ev.shiftKey;
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
