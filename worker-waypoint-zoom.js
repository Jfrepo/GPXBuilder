import baseWorker from './worker-ui-optimizations-v2.js';

const TRACK_POINT_MIN_ZOOM = 14;

function suppressZoomedOutTrackPoints(html){
  if(html.includes('__mancardoTrackPointMinZoom'))return html;

  const oldBlock = `        if(layer instanceof L.CircleMarker){
          var ll=layer.getLatLng();
          var opts=layer.options||{};
          var strokeOpacity=opts.opacity==null?1:Number(opts.opacity);
          var fillOpacity=opts.fillOpacity==null?1:Number(opts.fillOpacity);
          googleTrackData.add(new google.maps.Data.Feature({
            geometry:new google.maps.Data.Point(new google.maps.LatLng(ll.lat,ll.lng)),
            properties:{kind:'point',radius:opts.radius||4,fillColor:opts.fillColor||opts.color||'#2563a8',fillOpacity:fillOpacity,strokeColor:opts.color||'#ffffff',strokeOpacity:strokeOpacity,strokeWeight:opts.weight||1}
          }));
          if(typeof layer.setStyle==='function')layer.setStyle({opacity:0,fillOpacity:0});
        }`;

  const newBlock = `        if(layer instanceof L.CircleMarker){
          var __mancardoTrackPointMinZoom=${TRACK_POINT_MIN_ZOOM};
          var showTrackPoint=map.getZoom()>=__mancardoTrackPointMinZoom;
          var ll=layer.getLatLng();
          var opts=layer.options||{};
          var strokeOpacity=opts.opacity==null?1:Number(opts.opacity);
          var fillOpacity=opts.fillOpacity==null?1:Number(opts.fillOpacity);
          if(showTrackPoint){
            googleTrackData.add(new google.maps.Data.Feature({
              geometry:new google.maps.Data.Point(new google.maps.LatLng(ll.lat,ll.lng)),
              properties:{kind:'point',radius:opts.radius||4,fillColor:opts.fillColor||opts.color||'#2563a8',fillOpacity:fillOpacity,strokeColor:opts.color||'#ffffff',strokeOpacity:strokeOpacity,strokeWeight:opts.weight||1}
            }));
          }
          if(typeof layer.setStyle==='function')layer.setStyle({opacity:0,fillOpacity:0});
          var el=typeof layer.getElement==='function'?layer.getElement():null;
          if(el)el.style.pointerEvents=showTrackPoint?'':'none';
        }`;

  const oldEvents = `    map.on('move zoom resize moveend zoomend',queueSync);`;
  const newEvents = `    map.on('move zoom resize moveend zoomend',queueSync);\n    map.on('zoomend',syncGoogleTrackVisuals);`;

  if(!html.includes(oldBlock)||!html.includes(oldEvents))return html;
  html=html.replace(oldBlock,newBlock);
  html=html.replace(oldEvents,newEvents);
  return html;
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=suppressZoomedOutTrackPoints(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
