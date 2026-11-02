/* Mancardo read-only track integrity analysis.
 * No localStorage, network, editing or GPX export side effects.
 * CommonJS + browser global for isolated node:test and editor use.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.MancardoTrackIntegrity=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const R=6371000;
  function valid(p){return p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;}
  function distance(a,b){
    if(!valid(a)||!valid(b))return Infinity;
    const rad=Math.PI/180,dLat=(b.lat-a.lat)*rad,dLon=(b.lon-a.lon)*rad;
    const q=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;
    return 2*R*Math.asin(Math.min(1,Math.sqrt(q)));
  }
  function ends(seg,reverse){return reverse?[seg[seg.length-1],seg[0]]:[seg[0],seg[seg.length-1]];}
  function gap(a,ar,b,br){return distance(ends(a,ar)[1],ends(b,br)[0]);}
  function evaluate(segments,order,tolerance){
    const joins=[];let totalGapMeters=0;
    for(let i=1;i<order.length;i++){
      const prev=order[i-1],next=order[i];
      const meters=gap(segments[prev.segment],prev.reversed,segments[next.segment],next.reversed);
      joins.push({fromSegment:prev.segment+1,toSegment:next.segment+1,distanceMeters:meters,
        status:meters<=tolerance?'connected':'review'});
      totalGapMeters+=meters;
    }
    return {joins,totalGapMeters};
  }
  // Exact minimum total endpoint gap with no fabricated joining geometry.
  // Paths have equivalent reverse directions until the rider flags a start.
  function optimal(segments,start,maxExact){
    const n=segments.length;
    if(n===0)return {order:[],supported:true};
    if(n>maxExact)return {order:[],supported:false};
    const maskMax=1<<n, dp=new Map();
    function key(mask,idx,rev){return mask+'|'+idx+'|'+rev;}
    for(let i=0;i<n;i++)for(let r=0;r<2;r++){
      if(start&&(start.segment!==i||start.reversed!==Boolean(r)))continue;
      dp.set(key(1<<i,i,r),{cost:0,order:[{segment:i,reversed:Boolean(r)}]});
    }
    for(let mask=1;mask<maskMax;mask++)for(let i=0;i<n;i++){
      if(!(mask&(1<<i)))continue;
      for(let r=0;r<2;r++){
        const cur=dp.get(key(mask,i,r));if(!cur)continue;
        for(let j=0;j<n;j++)if(!(mask&(1<<j)))for(let t=0;t<2;t++){
          const nextMask=mask|(1<<j),k=key(nextMask,j,t);
          const cost=cur.cost+gap(segments[i],Boolean(r),segments[j],Boolean(t));
          const old=dp.get(k);
          if(!old||cost<old.cost-1e-6)dp.set(k,{cost,order:cur.order.concat({segment:j,reversed:Boolean(t)})});
        }
      }
    }
    let best=null;
    for(let i=0;i<n;i++)for(let r=0;r<2;r++){
      const c=dp.get(key(maskMax-1,i,r));
      if(c&&(!best||c.cost<best.cost))best=c;
    }
    return {order:best?best.order:[],supported:true};
  }
  function analyze(track,options){
    options=options||{};
    const tolerance=Number.isFinite(options.toleranceMeters)?Math.max(0,options.toleranceMeters):5;
    const maxExact=10;
    const segments=Array.isArray(track&&track.segments)?track.segments:[];
    const issues=[],counts={segments:segments.length,points:0};
    if(!segments.length)issues.push({code:'empty_track',severity:'error',message:'Track contains no segments.'});
    segments.forEach(function(seg,i){
      if(!Array.isArray(seg)||seg.length<2){issues.push({code:'short_segment',severity:'error',segment:i+1,message:'Segment '+(i+1)+' has fewer than two points.'});return;}
      counts.points+=seg.length;
      for(let j=0;j<seg.length;j++)if(!valid(seg[j])){issues.push({code:'invalid_coordinate',severity:'error',segment:i+1,point:j+1,message:'Invalid coordinate in segment '+(i+1)+'.'});break;}
    });
    const safe=issues.length===0;
    const original=segments.map(function(_,i){return {segment:i,reversed:false};});
    const current=safe?evaluate(segments,original,tolerance):{joins:[],totalGapMeters:null};
    const issuesCurrent=current.joins.filter(x=>x.status==='review');
    issuesCurrent.forEach(function(x){issues.push({code:'disconnected_segments',severity:'warning',fromSegment:x.fromSegment,toSegment:x.toSegment,distanceMeters:x.distanceMeters,message:'Gap between original segments '+x.fromSegment+' and '+x.toSegment+'.'});});
    let start=null;
    if(options.start){
      const x=options.start;
      if(!Number.isInteger(x.segment)||x.segment<0||x.segment>=segments.length||typeof x.reversed!=='boolean'){
        issues.push({code:'invalid_start',severity:'error',message:'Start must identify a valid segment endpoint and direction.'});
      }else start={segment:x.segment,reversed:x.reversed};
    }
    let proposal={order:[],joins:[],totalGapMeters:null,supported:false};
    if(safe&&!issues.some(x=>x.code==='invalid_start')){
      const opt=optimal(segments,start,maxExact);
      if(opt.supported){
        const evaluated=evaluate(segments,opt.order,tolerance);
        proposal={order:opt.order.map(x=>({segment:x.segment+1,reversed:x.reversed})),
          joins:evaluated.joins,totalGapMeters:evaluated.totalGapMeters,supported:true};
      }else issues.push({code:'too_many_segments',severity:'warning',message:'Automatic sequencing is limited to 10 segments; manual review required.'});
    }
    if(!start&&segments.length)issues.push({code:'start_unconfirmed',severity:'warning',message:'Flag the intended trail start and direction before approving repairs.'});
    if(proposal.supported){
      proposal.joins.filter(x=>x.status==='review').forEach(function(x){
        issues.push({code:'proposed_gap',severity:'warning',fromSegment:x.fromSegment,toSegment:x.toSegment,
          distanceMeters:x.distanceMeters,message:'Proposed connection '+x.fromSegment+' to '+x.toSegment+' needs review.'});
      });
    }
    // Any unresolved proposal gap or unconfirmed direction prevents an all-clear result.
    const status=issues.some(x=>x.severity==='error')?'invalid':issues.length?'review':'valid';
    return {status,counts,toleranceMeters:tolerance,original:{order:original.map(x=>({segment:x.segment+1,reversed:x.reversed})),
      joins:current.joins,totalGapMeters:current.totalGapMeters},proposal,issues,
      immutable:true};
  }
  return {analyze,distance};
});
