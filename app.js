(function(){
const C=window.CONFIG,S=C.STATIONS,$=id=>document.getElementById(id),sp=(p,m)=>window.setSplashProgress(p,m);
if(!/^pk\./.test(C.MAPBOX_TOKEN)){sp(0,'Add your public pk. token in config.js');return;}
mapboxgl.accessToken=C.MAPBOX_TOKEN;
const line=turf.lineString(S.map(s=>s.lngLat)),km={units:'kilometers'},total=turf.length(line,km);
const cum=S.map((s,i)=>i?turf.length(turf.lineString(S.slice(0,i+1).map(x=>x.lngLat)),km):0);
const at=d=>turf.along(line,Math.min(Math.max(d,0),total),km).geometry.coordinates;
const chaseBack=C.CHASE_BEHIND_KM; // real km, via turf.destination below, never a raw route fraction
const CAM_SIDE_M=C.CAM_SIDE_M??0; // lateral offset from directly behind; keep zero for a rear chase
const TRAIN_URI=C.TRAIN_MODEL_URL||'./Ghana_Freight_Train.glb'; // STEP 1: confirm this filename/path matches what you added to the project
const LATERAL_OFFSET_M=C.TRAIN_LATERAL_OFFSET_M??1.7; // model mesh origin isn't centered on its width; tune/flip sign if it sits off-track
const BEARING_OFFSET_DEG=C.TRAIN_BEARING_OFFSET_DEG??0; // tune in 90deg steps after watching the first stretch of route
const TRAIN_LOOK_LIFT_M=C.TRAIN_LOOK_LIFT_M??2.5; // look at roughly the train's body height, not ground level under it
const pt=c=>({type:'Feature',geometry:{type:'Point',coordinates:c}});
$('t-tot').textContent=fmt(C.DURATION_S);$('lbl-a').textContent=S[0].name;$('lbl-b').textContent=S[S.length-1].name;
function fmt(s){s=Math.round(s);const h=Math.floor(s/3600),m=Math.floor(s/60)%60,r=s%60;return h?h+':'+String(m).padStart(2,'0')+':'+String(r).padStart(2,'0'):m+':'+String(r).padStart(2,'0');}
function warn(m){console.error(m);if(!/debug/.test(location.search))return; // technical log, only shown with ?debug
  let b=document.getElementById('dbg');if(!b){b=document.createElement('div');b.id='dbg';b.style.cssText='position:fixed;left:8px;bottom:90px;z-index:99;max-width:70vw;background:#ce1126;color:#fff;font:11px monospace;padding:6px 8px;border-radius:6px';document.body.appendChild(b);}b.textContent=String(m).slice(0,300);}
// Plain-language banner, always visible (no ?debug or dev tools needed), for problems a visitor should know about.
function showProblem(msg){console.error(msg);let b=document.getElementById('problem');
  if(!b){b=document.createElement('div');b.id='problem';b.style.cssText='position:fixed;left:8px;right:8px;top:70px;z-index:99;background:#ce1126;color:#fff;font:13px Inter,sans-serif;padding:10px 14px;border-radius:8px;text-align:center';document.body.appendChild(b);}
  b.textContent=msg;}
sp(10);
// Standard Satellite (not classic satellite-streets-v12): the model layer needs this style's built-in 3D
// lighting/sky/shadow system to actually draw anything, not just avoid throwing an error. This style ships
// its own terrain, so -- per the original build notes -- we do NOT add a separate mapbox-dem terrain source.
const map=new mapboxgl.Map({container:'map',style:'mapbox://styles/mapbox/standard-satellite',center:S[0].lngLat,zoom:12,pitch:65,projection:'mercator',antialias:true,attributionControl:false});
map.on('error',e=>{
  const msg=(e.error&&e.error.message)||'';
  if(/glb|model|Ghana_Freight_Train/i.test(msg)||(e.sourceId==='train-model-source'))showProblem('Could not load the train model file. Check that '+TRAIN_URI+' is uploaded in the same folder as index.html.');
  warn('map: '+(msg||'unknown error'));
});
map.addControl(new mapboxgl.AttributionControl({compact:true}));
let playing=false,t=0,last=performance.now(),sm=null,gnd=null,tg=null,ready=false;
map.on('load',()=>{
  sp(45);
  // Standard Satellite ships its own terrain -- no separate mapbox-dem source, no manual setTerrain, no
  // manual sky layer; adding our own on top of this style's built-in one caused drape/terrain conflicts before.
  map.addSource('route',{type:'geojson',data:line});
  map.addLayer({id:'route-glow',type:'line',source:'route',slot:'top',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fcd116','line-width':10,'line-blur':8,'line-opacity':.45}});
  map.addLayer({id:'route',type:'line',source:'route',slot:'top',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fcd116','line-width':3.5}});
  sp(70);
  map.addSource('stations',{type:'geojson',data:{type:'FeatureCollection',features:S.map(s=>({...pt(s.lngLat),properties:{name:s.name}}))}});
  map.addLayer({id:'st-dot',type:'circle',source:'stations',slot:'top',paint:{'circle-radius':5,'circle-color':'#ce1126','circle-stroke-color':'#fff','circle-stroke-width':1.5}});
  map.addLayer({id:'st-lbl',type:'symbol',source:'stations',slot:'top',layout:{'text-field':['get','name'],'text-font':['DIN Pro Bold','Arial Unicode MS Bold'],'text-size':12,'text-offset':[0,1.3],'text-anchor':'top','text-allow-overlap':true},paint:{'text-color':'#fff','text-halo-color':'#071018','text-halo-width':1.6}});
  // STEP 1: native Mapbox `model` source/layer replacing the 2D canvas-pictogram custom WebGL layer.
  // Orientation is [roll, pitch, yaw] in DEGREES (not radians). This model's own bounding box (X=width,
  // Y=height, Z=length) already lies flat at identity rotation, so roll stays 0 -- no 90deg "handstand" tip.
  try{
    map.addSource('train-model-source',{type:'model',models:{train:{uri:TRAIN_URI,position:S[0].lngLat,orientation:[0,0,0]}}});
    map.addLayer({id:'train-model-layer',type:'model',source:'train-model-source',slot:'top',paint:{'model-elevation-reference':'ground'}});
  }catch(e){showProblem('Could not load the train model. Check that '+TRAIN_URI+' is uploaded in the same folder as index.html.');warn('train model layer failed: '+e.message);}
  ready=true;sp(90);
  // The model source can still be finishing its own internal setup in this same tick (even though 'load' has
  // fired), so this very first render() can throw once, before any requestAnimationFrame has run. That throw
  // was NOT caught here -- unlike every later frame via frame()'s own try/catch -- so it aborted this handler
  // before reaching the go()/idle/timeout lines below, which is why the splash screen never cleared at all.
  try{render();}catch(e){warn('initial render: '+e.message);}
  let done=false;const go=()=>{if(done)return;done=true;window.hideSplashScreen();playing=true;last=performance.now();};
  map.once('idle',go);setTimeout(go,9000);
});
function render(){
  const p=t/C.DURATION_S,d=p*total,pos=at(d);
  // Heading from a short lookahead/lookbehind sample (not the point-to-point segment), recalculated every
  // frame, so the train visibly turns through curves rather than snapping station-to-station.
  const LOOK=0.05,d0=Math.max(0,d-LOOK),d1=Math.min(total,d+LOOK),headingDeg=turf.bearing(at(d0),at(d1));
  const lateral=turf.destination(pos,LATERAL_OFFSET_M/1000,headingDeg+90,km).geometry.coordinates;
  // Gotcha: fetch the source fresh from the map every frame before calling setModels() -- a cached
  // reference from outside the loop fails silently ("setModels is not a function").
  const ms=map.getSource('train-model-source');
  if(ms)ms.setModels({train:{uri:TRAIN_URI,position:lateral,orientation:[0,0,headingDeg+BEARING_OFFSET_DEG]}});
  // Keep the camera directly behind the train at its altitude for a level rear chase.
  const back=d-chaseBack;
  const behindPt=back>=0?at(back):turf.destination(at(0),-back,turf.bearing(at(0),at(0.05))+180,km).geometry.coordinates;
  const camPt=turf.destination(behindPt,CAM_SIDE_M/1000,headingDeg+90,km).geometry.coordinates;
  sm=sm?[sm[0]+(camPt[0]-sm[0])*.5,sm[1]+(camPt[1]-sm[1])*.5]:camPt;
  const g=map.queryTerrainElevation(sm);if(g!=null)gnd=gnd==null?g:gnd+(g-gnd)*.3;
  const tgRaw=map.queryTerrainElevation(pos);if(tgRaw!=null)tg=tg==null?tgRaw:tg+(tgRaw-tg)*.3;
  const trainAlt=(tg??0)+TRAIN_LOOK_LIFT_M,camAlt=(gnd??0)+C.CAM_HEIGHT_M;
  const fc=map.getFreeCameraOptions();
  fc.position=mapboxgl.MercatorCoordinate.fromLngLat(sm,camAlt);
  fc.lookAtPoint({lng:pos[0],lat:pos[1]},[0,0,1],trainAlt); // look directly at the train, not behind it -- this is what leaves open track visible ahead of it on screen
  map.setFreeCameraOptions(fc);
  let i=0;while(i<S.length-1&&cum[i+1]<=d)i++;
  const nx=Math.min(i+1,S.length-1);
  $('j-cur').textContent=S[i].name;$('j-next').textContent=S[nx].name;
  $('j-dist').textContent=(i===S.length-1?0:Math.max(0,cum[nx]-d)).toFixed(1)+' km';
  $('j-rem').textContent=Math.max(0,total-d).toFixed(0)+' km';
  $('t-el').textContent=fmt(t);$('pct').textContent=Math.round(p*100)+'%';$('prog').style.width=p*100+'%';
}
function arrive(){playing=false;$('arrive').hidden=false;$('play').textContent='▶';}
function frame(now){const dt=(now-last)/1000;last=now;
  if(ready){if(playing){t=Math.min(C.DURATION_S,t+dt);if(t>=C.DURATION_S)arrive();}try{render();}catch(e){warn('render: '+e.message);}}
  requestAnimationFrame(frame);}
requestAnimationFrame(frame);
$('play').onclick=()=>{if(t>=C.DURATION_S)return;playing=!playing;$('play').textContent=playing?'❚❚':'▶';};
const restart=()=>{t=0;sm=null;playing=true;$('arrive').hidden=true;$('play').textContent='❚❚';};
$('restart').onclick=restart;$('again').onclick=restart;
})();