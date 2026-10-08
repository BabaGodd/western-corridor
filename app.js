(function(){
const C=window.CONFIG,S=C.STATIONS,$=id=>document.getElementById(id),sp=(p,m)=>window.setSplashProgress(p,m);
if(!/^pk\./.test(C.MAPBOX_TOKEN)){sp(0,'Add your public pk. token in config.js');return;}
mapboxgl.accessToken=C.MAPBOX_TOKEN;

const km={units:'kilometers'};
const rawLine=turf.lineString(S.map(s=>s.lngLat));
const route=turf.bezierSpline(rawLine,{sharpness:C.ROUTE_SHARPNESS,resolution:C.ROUTE_RESOLUTION});
const routeCoordinates=route.geometry.coordinates;
const pt=coordinates=>({type:'Feature',geometry:{type:'Point',coordinates}});
const routeDistances=new Float64Array(routeCoordinates.length);
for(let i=1;i<routeCoordinates.length;i++){
  routeDistances[i]=routeDistances[i-1]+turf.distance(
    turf.point(routeCoordinates[i-1]),
    turf.point(routeCoordinates[i]),
    km
  );
}
const total=routeDistances[routeDistances.length-1];
const duration=total/C.SPEED_KM_S;
const along=distanceKm=>{
  const distance=Math.max(0,Math.min(distanceKm,total));
  if(distance>=total)return routeCoordinates[routeCoordinates.length-1];
  let low=0,high=routeDistances.length-1;
  while(low+1<high){
    const middle=(low+high)>>1;
    if(routeDistances[middle]<=distance)low=middle;
    else high=middle;
  }
  const segmentDistance=distance-routeDistances[low];
  if(segmentDistance===0)return routeCoordinates[low];
  const start=routeCoordinates[low],end=routeCoordinates[low+1];
  return turf.destination(start,segmentDistance,turf.bearing(start,end),km).geometry.coordinates;
};
const stationDistances=S.map(station=>turf.nearestPointOnLine(route,pt(station.lngLat),km).properties.location);
const $track=$('prog-track');

$('t-tot').textContent=fmt(duration);
$('lbl-a').textContent=S[0].name;
$('lbl-b').textContent=S[S.length-1].name;

function fmt(seconds){
  seconds=Math.round(seconds);
  return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
}
function warn(message){
  console.error(message);
  if(!/debug/.test(location.search))return;
  let banner=$('dbg');
  if(!banner){
    banner=document.createElement('div');
    banner.id='dbg';
    banner.style.cssText='position:fixed;left:8px;bottom:90px;z-index:99;max-width:70vw;background:#ce1126;color:#fff;font:11px monospace;padding:6px 8px;border-radius:6px';
    document.body.appendChild(banner);
  }
  banner.textContent=String(message).slice(0,300);
}
function showProblem(message){
  console.error(message);
  let banner=$('problem');
  if(!banner){
    banner=document.createElement('div');
    banner.id='problem';
    banner.style.cssText='position:fixed;left:8px;right:8px;top:70px;z-index:99;background:#ce1126;color:#fff;font:13px Inter,sans-serif;padding:10px 14px;border-radius:8px;text-align:center';
    document.body.appendChild(banner);
  }
  banner.textContent=message;
}

sp(10);
const map=new mapboxgl.Map({
  container:'map',
  style:'mapbox://styles/mapbox/satellite-streets-v12',
  center:S[0].lngLat,
  zoom:14,
  pitch:C.CAMERA_PITCH,
  projection:'mercator',
  antialias:true,
  attributionControl:false
});
map.on('error',event=>{
  const message=(event.error&&event.error.message)||'';
  if(/glb|model|Ghana_Freight_Train/i.test(message)||event.sourceId==='train-position'){
    showProblem('Could not load the train model file. Check that '+C.TRAIN_MODEL_URL+' is uploaded in the same folder as index.html.');
  }
  warn('map: '+(message||'unknown error'));
});
map.addControl(new mapboxgl.AttributionControl({compact:true}));

const elevationCache=new Map();
let lastCameraElevation=0,terrainProfileActive=false;
let initialized=false;
let playing=false,elapsed=0,lastFrameTime=null,rafId=null,arrived=false;
let previousSeekPlaying=false,dragging=false;
let trainSourceReady=false;

function getElevation(lngLat){
  const elevation=map.queryTerrainElevation(lngLat,{exaggerated:false});
  if(Number.isFinite(elevation)){
    lastCameraElevation=elevation;
    return elevation;
  }
  return lastCameraElevation;
}
function getRouteElevationBucket(bucket){
  const cached=elevationCache.get(bucket);
  if(Number.isFinite(cached))return cached;
  const distanceKm=bucket/100;
  const coordinate=along(distanceKm);
  const elevation=map.queryTerrainElevation(coordinate,{exaggerated:false});
  if(Number.isFinite(elevation)){
    elevationCache.set(bucket,elevation);
    return elevation;
  }
  for(let offset=1;offset<=10;offset++){
    const before=elevationCache.get(bucket-offset),after=elevationCache.get(bucket+offset);
    if(Number.isFinite(before)&&Number.isFinite(after))return (before+after)/2;
    if(Number.isFinite(before))return before;
    if(Number.isFinite(after))return after;
  }
  return null;
}
function getRouteElevation(distanceKm){
  const clamped=Math.max(0,Math.min(distanceKm,total));
  const bucketPosition=clamped*100;
  const lower=Math.floor(bucketPosition),upper=Math.ceil(bucketPosition);
  const lowElevation=getRouteElevationBucket(lower);
  if(lower===upper)return lowElevation;
  const highElevation=getRouteElevationBucket(upper);
  if(Number.isFinite(lowElevation)&&Number.isFinite(highElevation)){
    return lowElevation+(highElevation-lowElevation)*(bucketPosition-lower);
  }
  return Number.isFinite(lowElevation)?lowElevation:highElevation;
}
function getTrainGroundElevation(distanceKm){
  const halfLengthKm=0.04;
  const offsets=[-halfLengthKm,-halfLengthKm/2,0,halfLengthKm/2,halfLengthKm];
  const elevations=offsets.map(offset=>getRouteElevation(distanceKm+offset)).filter(Number.isFinite);
  return elevations.length?Math.max(...elevations)+0.5:null;
}
function headingAt(distanceKm){
  const behind=along(Math.max(distanceKm-0.05,0));
  const ahead=along(Math.min(distanceKm+0.05,total));
  return turf.bearing(behind,ahead);
}
function centeredModelPosition(coordinate,heading){
  return turf.destination(coordinate,C.TRAIN_LATERAL_OFFSET_M/1000,heading+90,km).geometry.coordinates;
}
function chaseCameraPoint(coordinate,heading){
  return turf.destination(coordinate,C.CHASE_BEHIND_KM,heading+180,km).geometry.coordinates;
}
function positionChaseCamera(cameraCoordinate,trainCoordinate){
  const cameraAltitude=getElevation(cameraCoordinate)+C.CAM_HEIGHT_M;
  const trainAltitude=getElevation(trainCoordinate)+2;
  const freeCamera=map.getFreeCameraOptions();
  freeCamera.position=mapboxgl.MercatorCoordinate.fromLngLat(cameraCoordinate,cameraAltitude);
  freeCamera.lookAtPoint(trainCoordinate,[0,0,1],trainAltitude);
  map.setFreeCameraOptions(freeCamera);
}
function updateHUD(distanceKm,fraction){
  let index=S.length-1;
  for(let i=S.length-1;i>=0;i--){
    if(distanceKm>=stationDistances[i]){index=i;break;}
  }
  const next=Math.min(index+1,S.length-1);
  $('j-cur').textContent=S[index].name;
  $('j-next').textContent=index===S.length-1?'—':S[next].name;
  $('j-dist').textContent=(index===S.length-1?0:Math.max(0,stationDistances[next]-distanceKm)).toFixed(1)+' km';
  $('j-rem').textContent=Math.max(0,total-distanceKm).toFixed(0)+' km';
  $('t-el').textContent=fmt(elapsed);
  $('pct').textContent=Math.round(fraction*100)+'%';
  $('prog').style.width=(fraction*100)+'%';
  $track.setAttribute('aria-valuenow',String(Math.round(fraction*100)));
}
function renderAt(seconds){
  const fraction=Math.min(seconds/duration,1);
  const distanceKm=fraction*total;
  const trainCoordinate=along(distanceKm);
  const heading=headingAt(distanceKm);
  const trainElevation=getTrainGroundElevation(distanceKm);
  let modelPosition=centeredModelPosition(trainCoordinate,heading);
  if(Number.isFinite(trainElevation)){
    if(!terrainProfileActive){
      map.setPaintProperty('train-model-layer','model-elevation-reference','sea');
      terrainProfileActive=true;
    }
    // GeoJSON point altitude is reliable here; model-translation is not vertical for this model layer.
    modelPosition=[modelPosition[0],modelPosition[1],trainElevation];
  }else if(terrainProfileActive){
    map.setPaintProperty('train-model-layer','model-elevation-reference','ground');
    terrainProfileActive=false;
  }
  if(trainSourceReady){
    map.getSource('train-position').setData({
      ...pt(modelPosition),
      properties:{rotation:[0,0,heading+C.TRAIN_BEARING_OFFSET_DEG]}
    });
  }
  positionChaseCamera(chaseCameraPoint(trainCoordinate,heading),trainCoordinate);
  updateHUD(distanceKm,fraction);
  return fraction;
}
function onArrival(){
  arrived=true;
  playing=false;
  $('arrive').hidden=false;
  $('play').textContent='▶';
  $('play').setAttribute('aria-label','Restart journey');
}
function frame(now){
  if(!playing)return;
  if(lastFrameTime===null)lastFrameTime=now;
  const dt=Math.min((now-lastFrameTime)/1000,0.1);
  lastFrameTime=now;
  elapsed=Math.min(elapsed+dt,duration);
  const fraction=renderAt(elapsed);
  if(fraction>=1){
    onArrival();
    return;
  }
  rafId=requestAnimationFrame(frame);
}
function start(){
  if(playing||arrived)return;
  playing=true;
  lastFrameTime=null;
  $('play').textContent='❚❚';
  $('play').setAttribute('aria-label','Pause journey');
  rafId=requestAnimationFrame(frame);
}
function pause(){
  playing=false;
  $('play').textContent='▶';
  $('play').setAttribute('aria-label','Play journey');
  if(rafId!==null)cancelAnimationFrame(rafId);
  rafId=null;
}
function restart(){
  pause();
  elapsed=0;
  arrived=false;
  $('arrive').hidden=true;
  renderAt(elapsed);
  start();
}
function seek(fraction){
  const clamped=Math.max(0,Math.min(1,fraction));
  elapsed=clamped*duration;
  lastFrameTime=null;
  if(clamped<1&&arrived){
    arrived=false;
    $('arrive').hidden=true;
  }
  const rendered=renderAt(elapsed);
  if(rendered>=1)onArrival();
  else if(clamped<1){
    arrived=false;
    $('arrive').hidden=true;
  }
}
function initialize(){
  if(initialized)return;
  initialized=true;
  try{
    sp(45);
    map.addSource('mapbox-dem',{type:'raster-dem',url:'mapbox://mapbox.mapbox-terrain-dem-v1',tileSize:512,maxzoom:14});
    map.setTerrain({source:'mapbox-dem',exaggeration:1});
    map.addLayer({id:'sky',type:'sky',paint:{'sky-type':'atmosphere','sky-atmosphere-sun':[0,70],'sky-atmosphere-sun-intensity':8}});
    map.addSource('route',{type:'geojson',data:route});
    map.addLayer({id:'route-glow',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fcd116','line-width':10,'line-blur':8,'line-opacity':.45}});
    map.addLayer({id:'route',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fcd116','line-width':3.5}});
    sp(70);
    map.addSource('stations',{type:'geojson',data:{type:'FeatureCollection',features:S.map(station=>({...pt(station.lngLat),properties:{name:station.name}}))}});
    map.addLayer({id:'st-dot',type:'circle',source:'stations',paint:{'circle-radius':5,'circle-color':'#ce1126','circle-stroke-color':'#fff','circle-stroke-width':1.5}});
    map.addLayer({id:'st-lbl',type:'symbol',source:'stations',layout:{'text-field':['get','name'],'text-font':['DIN Pro Bold','Arial Unicode MS Bold'],'text-size':12,'text-offset':[0,1.3],'text-anchor':'top','text-allow-overlap':true},paint:{'text-color':'#fff','text-halo-color':'#071018','text-halo-width':1.6}});

    const initialHeading=headingAt(0);
    map.addModel('train',C.TRAIN_MODEL_URL);
    map.addSource('train-position',{
      type:'geojson',
      data:{
        ...pt(centeredModelPosition(S[0].lngLat,initialHeading)),
        properties:{rotation:[0,0,initialHeading+C.TRAIN_BEARING_OFFSET_DEG]}
      }
    });
    map.addLayer({
      id:'train-model-layer',
      type:'model',
      source:'train-position',
      layout:{'model-id':'train'},
      paint:{
        'model-scale':C.TRAIN_SCALE,
        'model-elevation-reference':'ground',
        'model-rotation':['get','rotation']
      }
    });
    const trainSource=map.getSource('train-position');
    if(!trainSource||typeof trainSource.setData!=='function'){
      throw new Error('train position source cannot be updated');
    }
    trainSourceReady=true;

    sp(90);
    renderAt(0);
    let started=false;
    const begin=()=>{
      if(started)return;
      started=true;
      window.hideSplashScreen();
    };
    map.once('idle',begin);
    setTimeout(begin,9000);
  }catch(error){
    initialized=false;
    showProblem('Could not initialize the Western Corridor journey: '+(error.message||error));
    warn('map initialization failed: '+(error.message||error));
  }
}
map.once('load',initialize);
if(map.isStyleLoaded())setTimeout(initialize,0);

$('play').onclick=()=>arrived?restart():playing?pause():start();
$('restart').onclick=restart;
$('again').onclick=restart;

function fractionFromPointer(event){
  const rect=$track.getBoundingClientRect();
  return rect.width?Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)):0;
}
$track.addEventListener('pointerdown',event=>{
  dragging=true;
  previousSeekPlaying=playing;
  pause();
  $track.setPointerCapture(event.pointerId);
  seek(fractionFromPointer(event));
  event.preventDefault();
});
$track.addEventListener('pointermove',event=>{
  if(dragging)seek(fractionFromPointer(event));
});
function finishSeeking(){
  if(!dragging)return;
  dragging=false;
  if(previousSeekPlaying&&elapsed<duration)start();
}
$track.addEventListener('pointerup',finishSeeking);
$track.addEventListener('pointercancel',finishSeeking);
$track.addEventListener('keydown',event=>{
  const step=event.shiftKey?0.1:0.01;
  let fraction=elapsed/duration;
  if(event.key==='ArrowRight'||event.key==='ArrowUp')fraction+=step;
  else if(event.key==='ArrowLeft'||event.key==='ArrowDown')fraction-=step;
  else if(event.key==='Home')fraction=0;
  else if(event.key==='End')fraction=1;
  else return;
  event.preventDefault();
  previousSeekPlaying=playing;
  pause();
  seek(fraction);
  if(previousSeekPlaying&&elapsed<duration)start();
});
})();
