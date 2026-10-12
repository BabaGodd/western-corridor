(function(){
const C=window.CONFIG,S=C.STATIONS,$=id=>document.getElementById(id),sp=(p,m)=>window.setSplashProgress(p,m);
if(!/^pk\./.test(C.MAPBOX_TOKEN)){sp(0,'Add your public pk. token in config.js');return;}
mapboxgl.accessToken=C.MAPBOX_TOKEN;
const line=turf.lineString(S.map(s=>s.lngLat)),km={units:'kilometers'},total=turf.length(line,km);
const cum=S.map((s,i)=>i?turf.length(turf.lineString(S.slice(0,i+1).map(x=>x.lngLat)),km):0);
const at=d=>turf.along(line,Math.min(Math.max(d,0),total),km).geometry.coordinates;
const chaseBack=C.CHASE_BEHIND_KM; // real km, via turf.destination below, never a raw route fraction
const CAM_SIDE_M=C.CAM_SIDE_M??70; // perpendicular offset from directly-behind, for a three-quarter view (not a flat rear chase)
const TRAIN_URI=C.TRAIN_MODEL_URL||'./Ghana_Freight_Train.glb'; // STEP 1: confirm this filename/path matches what you added to the project
const BEARING_OFFSET_DEG=C.TRAIN_BEARING_OFFSET_DEG??0; // tune in 90deg steps after watching the first stretch of route
const TRAIN_LOOK_LIFT_M=C.TRAIN_LOOK_LIFT_M??2.5; // look at roughly the train's body height, not ground level under it
const pt=c=>({type:'Feature',geometry:{type:'Point',coordinates:c}});
// Defensive setters: the HTML/CSS for this page gets edited separately from app.js (including by other tools),
// so an element id app.js expects can go missing without warning. A direct $(id).textContent= on a missing
// element throws immediately and silently kills the whole script before the map even loads -- that's exactly
// what happened with the 'o-dist'/'o-stops' overview panel once it was removed from the page markup. These
// helpers no-op instead of crashing when an id isn't present.
function txt(id,val){const el=$(id);if(el)el.textContent=val;}
function setHidden(id,val){const el=$(id);if(el)el.hidden=val;}
function setWidth(id,pct){const el=$(id);if(el)el.style.width=pct;}
txt('o-dist',Math.round(total)+' km');txt('o-stops',S.length);
txt('t-tot',fmt(C.DURATION_S));txt('lbl-a',S[0].name);txt('lbl-b',S[S.length-1].name);
function fmt(s){s=Math.round(s);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
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
// maxTileCacheSize: without this, Mapbox sizes the tile cache to roughly what the current viewport needs and
// evicts older tiles as new ones load. Over a 765km route that means satellite/terrain tiles seen early in the
// journey get evicted long before the train passes back near them, which is what shows up as terrain flashing
// black mid-playback. A large explicit cache keeps everything the preload pass below fetches resident in memory
// for the whole run instead of being thrown away.
const map=new mapboxgl.Map({container:'map',style:'mapbox://styles/mapbox/standard-satellite',center:S[0].lngLat,zoom:12,pitch:65,projection:'mercator',antialias:true,attributionControl:false,maxTileCacheSize:2000});
map.on('error',e=>{
  const msg=(e.error&&e.error.message)||'';
  if(/glb|model|Ghana_Freight_Train/i.test(msg)||(e.sourceId==='train-position'))showProblem('Could not load the train model file. Check that '+TRAIN_URI+' is uploaded in the same folder as index.html.');
  warn('map: '+(msg||'unknown error'));
});
map.addControl(new mapboxgl.AttributionControl({compact:true}));
let playing=false,t=0,last=performance.now(),sm=null,gnd=null,tg=null,ready=false;
let lastTrainPosition=null;
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
  // Register the GLB once, then move its GeoJSON point as the journey advances.
  try{
    const initialHeading=turf.bearing(at(0),at(Math.min(0.05,total)));
    map.addModel('train',TRAIN_URI);
    map.addSource('train-position',{type:'geojson',data:{...pt(at(0)),properties:{rotation:[0,0,initialHeading+BEARING_OFFSET_DEG]}}});
    map.addLayer({id:'train-model-layer',type:'model',source:'train-position',slot:'top',layout:{'model-id':'train'},paint:{'model-scale':C.TRAIN_SCALE||[1,1,1],'model-elevation-reference':'ground','model-rotation':['get','rotation']}});
  }catch(e){showProblem('Could not load the train model. Check that '+TRAIN_URI+' is uploaded in the same folder as index.html.');warn('train model layer failed: '+e.message);}
  // Remove ONLY the ground-level haze that was washing out the terrain -- not the sky itself, and not anything
  // else about the style's fog. setFog() replaces the whole fog object, so start from exactly what the Standard
  // style already has and change nothing but 'color' -- the single term that creates ground-level haze. Earlier
  // we also zeroed high-color/space-color (removed the sky backdrop -> black band at the top) and overrode
  // range/horizon-blend (an unnecessary, unverified change); this is the minimal version of that fix.
  try{
    const existingFog=map.getFog()||{};
    map.setFog({...existingFog,color:'rgba(0,0,0,0)'});
  }catch(e){warn('setFog: '+e.message);}
  ready=true;sp(90);
  try{render();}catch(e){warn('initial render: '+e.message);}
  // Reveal the map once its initial view settles; don't preload the entire route before startup.
  let started=false;
  const begin=()=>{if(started)return;started=true;window.hideSplashScreen();last=performance.now();};
  map.once('idle',begin);
  setTimeout(begin,9000);
});
function render(){
  const p=t/C.DURATION_S,d=p*total,pos=at(d);
  // Heading from a short lookahead/lookbehind sample (not the point-to-point segment), recalculated every
  // frame, so the train visibly turns through curves rather than snapping station-to-station.
  const LOOK=0.05,d0=Math.max(0,d-LOOK),d1=Math.min(total,d+LOOK),headingDeg=turf.bearing(at(d0),at(d1));
  const trainSource=map.getSource('train-position');
  const trainRotation=headingDeg+BEARING_OFFSET_DEG;
  if(trainSource&&(!lastTrainPosition||lastTrainPosition[0]!==pos[0]||lastTrainPosition[1]!==pos[1]||lastTrainPosition[2]!==trainRotation)){
    trainSource.setData({...pt(pos),properties:{rotation:[0,0,trainRotation]}});
    lastTrainPosition=[pos[0],pos[1],trainRotation];
  }
  // Three-quarter chase camera: move behind the train along its reverse heading (real km, via turf.destination,
  // never a raw fraction of route length), then move that point sideways perpendicular to heading -- a pure
  // rear chase only shows the back of the train and the track receding, which reads as a flat overhead shot.
  const back=d-chaseBack;
  const behindPt=back>=0?at(back):turf.destination(at(0),-back,turf.bearing(at(0),at(0.05))+180,km).geometry.coordinates;
  const camPt=turf.destination(behindPt,CAM_SIDE_M/1000,headingDeg+90,km).geometry.coordinates;
  sm=sm?[sm[0]+(camPt[0]-sm[0])*.5,sm[1]+(camPt[1]-sm[1])*.5]:camPt;
  // Height relative to terrain AT THE CAMERA'S OWN POSITION, not a fixed absolute altitude -- and keep the last
  // known-good reading when a tile hasn't loaded yet instead of snapping to sea level (0).
  const g=map.queryTerrainElevation(sm);if(g!=null)gnd=gnd==null?g:gnd+(g-gnd)*.3;
  const tgRaw=map.queryTerrainElevation(pos);if(tgRaw!=null)tg=tg==null?tgRaw:tg+(tgRaw-tg)*.3;
  const camAlt=(gnd??0)+C.CAM_HEIGHT_M,trainAlt=(tg??0)+TRAIN_LOOK_LIFT_M;
  const fc=map.getFreeCameraOptions();
  fc.position=mapboxgl.MercatorCoordinate.fromLngLat(sm,camAlt);
  fc.lookAtPoint({lng:pos[0],lat:pos[1]},[0,0,1],trainAlt); // look directly at the train, not behind it -- this is what leaves open track visible ahead of it on screen
  map.setFreeCameraOptions(fc);
  let i=0;while(i<S.length-1&&cum[i+1]<=d)i++;
  const nx=Math.min(i+1,S.length-1);
  txt('j-cur',S[i].name);txt('j-next',S[nx].name);
  txt('j-dist',(i===S.length-1?0:Math.max(0,cum[nx]-d)).toFixed(1)+' km');
  txt('j-rem',Math.max(0,total-d).toFixed(0)+' km');
  txt('t-el',fmt(t));txt('pct',Math.round(p*100)+'%');setWidth('prog',p*100+'%');
  const track=$('prog-track');if(track)track.setAttribute('aria-valuenow',String(Math.round(p*100)));
  txt('o-status',p>=1?'Arrived':playing?'In service':'Paused');
}
function arrive(){playing=false;setHidden('arrive',false);txt('play','▶');}
function frame(now){const dt=(now-last)/1000;last=now;
  if(ready){if(playing){t=Math.min(C.DURATION_S,t+dt);if(t>=C.DURATION_S)arrive();}try{render();}catch(e){warn('render: '+e.message);}}
  requestAnimationFrame(frame);}
requestAnimationFrame(frame);
// Guard these too: same reasoning as the txt()/setHidden()/setWidth() helpers above -- a missing control
// element shouldn't be able to throw and take the rest of the page down with it.
if($('play'))$('play').onclick=()=>{if(t>=C.DURATION_S)return;playing=!playing;txt('play',playing?'❚❚':'▶');};
const restart=()=>{t=0;sm=null;playing=true;setHidden('arrive',true);txt('play','❚❚');};
if($('restart'))$('restart').onclick=restart;
if($('again'))$('again').onclick=restart;
const track=$('prog-track');
if(track){
  let dragging=false,resumeAfterSeek=false;
  const seekTo=(fraction)=>{
    t=Math.max(0,Math.min(1,fraction))*C.DURATION_S;
    sm=null;gnd=null;tg=null;
    setHidden('arrive',true);
    last=performance.now();
    if(ready){try{render();}catch(e){warn('seek render: '+e.message);}}
  };
  const seekFromPointer=event=>{
    const rect=track.getBoundingClientRect();
    if(rect.width)seekTo((event.clientX-rect.left)/rect.width);
  };
  track.addEventListener('pointerdown',event=>{
    dragging=true;resumeAfterSeek=playing;playing=false;txt('play','▶');
    track.setPointerCapture(event.pointerId);
    seekFromPointer(event);event.preventDefault();
  });
  track.addEventListener('pointermove',event=>{if(dragging)seekFromPointer(event);});
  const finishSeek=()=>{
    if(!dragging)return;
    dragging=false;
    if(t>=C.DURATION_S)arrive();
    else{playing=resumeAfterSeek;txt('play',playing?'❚❚':'▶');last=performance.now();}
  };
  track.addEventListener('pointerup',finishSeek);
  track.addEventListener('pointercancel',finishSeek);
  track.addEventListener('keydown',event=>{
    let fraction=t/C.DURATION_S;
    const step=event.shiftKey?0.1:0.01;
    if(event.key==='ArrowRight'||event.key==='ArrowUp')fraction+=step;
    else if(event.key==='ArrowLeft'||event.key==='ArrowDown')fraction-=step;
    else if(event.key==='PageUp')fraction+=0.1;
    else if(event.key==='PageDown')fraction-=0.1;
    else if(event.key==='Home')fraction=0;
    else if(event.key==='End')fraction=1;
    else return;
    event.preventDefault();seekTo(fraction);
    if(t>=C.DURATION_S)arrive();
  });
}
})();