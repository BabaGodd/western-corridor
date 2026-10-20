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
  // Attribute the banner correctly instead of always blaming the train -- a scenery model failure was
  // previously silent (only logged, never shown) because it didn't match this check at all.
  if(e.sourceId==='train-position'||(/glb|model|Ghana_Freight_Train/i.test(msg)&&e.sourceId!=='scenery')){
    showProblem('Could not load the train model file. Check that '+TRAIN_URI+' is uploaded in the same folder as index.html.');
  }else if(e.sourceId==='scenery'||/scenery|station\.glb|tree\.glb|pole\.glb/i.test(msg)){
    showProblem('Could not load the scenery models. Check that models/station.glb, models/tree.glb, and models/pole.glb are uploaded.');
  }
  warn('map: '+(msg||'unknown error')+(e.sourceId?' [source: '+e.sourceId+']':''));
});
map.addControl(new mapboxgl.AttributionControl({compact:true}));
// Standard Satellite ships its own POI/road/transit name labels (random businesses, churches, street names) --
// fine for a general-purpose map, but noise next to our own branded journey panel on a government visualization.
// 'basemap' is the Standard style's config fragment id; these are its documented per-style config properties.
map.on('style.load',()=>{
  try{
    map.setConfigProperty('basemap','showPointOfInterestLabels',false);
    map.setConfigProperty('basemap','showPlaceLabels',false);
    map.setConfigProperty('basemap','showRoadLabels',false);
    map.setConfigProperty('basemap','showTransitLabels',false);
    // 'dawn'|'day'|'dusk'|'night' -- one line to change the time of day Standard's own sun/shadow system uses.
    map.setConfigProperty('basemap','lightPreset','day');
  }catch(e){warn('setConfigProperty: '+e.message);}
});
let playing=false,t=0,last=performance.now(),sm=null,gnd=null,tg=null,ready=false;
let lastTrainPosition=null;
map.on('load',()=>{
  sp(45);
  // Standard Satellite ships its own terrain -- no separate mapbox-dem source, no manual setTerrain, no
  // manual sky layer; adding our own on top of this style's built-in one caused drape/terrain conflicts before.
  map.addSource('route',{type:'geojson',data:line});
  // A single flat yellow line read as a highlighted route, not an actual railway. This is the standard
  // cartographic convention for a track instead: a dark ballast bed, two parallel steel rails offset from the
  // centerline via 'line-offset' (a real style-spec property, not a custom pattern image -- simpler and more
  // reliable), and a thin gold centerline kept underneath for brand/official-route identity, low-opacity so it
  // doesn't read as "highlighted" over the rails.
  map.addLayer({id:'route-brand',type:'line',source:'route',slot:'top',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fcd116','line-width':9,'line-blur':7,'line-opacity':.18}});
  map.addLayer({id:'route-ballast',type:'line',source:'route',slot:'top',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#453c31','line-width':5.5}});
  map.addLayer({id:'route-ties',type:'line',source:'route',slot:'top',layout:{'line-cap':'butt','line-join':'round'},paint:{'line-color':'#2a241c','line-width':5.5,'line-dasharray':[0.4,0.55]}});
  map.addLayer({id:'route-rail-l',type:'line',source:'route',slot:'top',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#c7ccd3','line-width':0.6,'line-offset':-1.6}});
  map.addLayer({id:'route-rail-r',type:'line',source:'route',slot:'top',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#c7ccd3','line-width':0.6,'line-offset':1.6}});
  sp(70);
  map.addSource('stations',{type:'geojson',data:{type:'FeatureCollection',features:S.map(s=>({...pt(s.lngLat),properties:{name:s.name}}))}});
  map.addLayer({id:'st-dot',type:'circle',source:'stations',slot:'top',paint:{'circle-radius':5,'circle-color':'#ce1126','circle-stroke-color':'#fff','circle-stroke-width':1.5}});
  map.addLayer({id:'st-lbl',type:'symbol',source:'stations',slot:'top',layout:{'text-field':['get','name'],'text-font':['DIN Pro Bold','Arial Unicode MS Bold'],'text-size':12,'text-offset':[0,1.3],'text-anchor':'top','text-allow-overlap':true},paint:{'text-color':'#fff','text-halo-color':'#071018','text-halo-width':1.6}});
  // Register the GLB once, then move its GeoJSON point as the journey advances.
  try{
    const initialHeading=turf.bearing(at(0),at(Math.min(0.05,total)));
    map.addModel('train',TRAIN_URI);
    map.addSource('train-position',{type:'geojson',data:{...pt(at(0)),properties:{rotation:[0,0,initialHeading+BEARING_OFFSET_DEG]}}});
    // model-allow-density-reduction must be false, and it's a LAYOUT property for a model-type layer (confirmed
    // against mapbox-gl@3.30.0's own type definitions), not paint -- a value under the wrong group is silently
    // ignored. This model has 1271 meshes, and Mapbox's automatic density reduction (meant to protect framerate
    // under memory/GPU pressure) can quietly drop part or ALL of a complex model's geometry. The full-route
    // preload and the large tile cache below both raise that pressure a lot -- without this flag, that's what
    // makes the whole train vanish rather than just flicker.
    // model-cast-shadows/model-receive-shadows + roughness/AO: without these, Standard Satellite's directional
    // light still lights the model, but gives it no shadow and a flat, uniform-brightness look -- shapes read
    // as silhouettes rather than solid objects. Turning shadows on is what actually makes geometry look 3D.
    map.addLayer({id:'train-model-layer',type:'model',source:'train-position',slot:'top',layout:{'model-id':'train','model-allow-density-reduction':false},paint:{'model-scale':C.TRAIN_SCALE||[1,1,1],'model-elevation-reference':'ground','model-rotation':['get','rotation'],'model-cast-shadows':true,'model-receive-shadows':true,'model-roughness':0.75,'model-ambient-occlusion-intensity':0.55}});
  }catch(e){showProblem('Could not load the train model. Check that '+TRAIN_URI+' is uploaded in the same folder as index.html.');warn('train model layer failed: '+e.message);}
  // STEP 2: trackside scenery -- a small station building plus a handful of trees and poles at each of the 15
  // stops, using the exact same addModel()+GeoJSON+data-driven-model-id pattern as the train itself (one model
  // layer, 'model-id' picks the right glTF per feature via ['get','modelId']). Deliberately placed only AT
  // stations, not scattered continuously along the full 765km route: the train's 1271-mesh model already showed
  // what GPU/memory pressure does to this style over a long route, so this stays conservative -- about 7 small,
  // low-poly instances per station (105 total) -- enough for every stop to look built and inhabited rather than
  // a bare dot on the map, without reopening the density/visibility problems the preload and tile cache exist
  // to prevent. Each model's own geometry is already modeled in real-world meters, so model-scale stays [1,1,1].
  try{
    map.addModel('scenery-station','./models/station.glb');
    map.addModel('scenery-tree','./models/tree.glb');
    map.addModel('scenery-pole','./models/pole.glb');
    const sceneryFeatures=[];
    S.forEach((s,i)=>{
      const prev=S[Math.max(0,i-1)].lngLat,next=S[Math.min(S.length-1,i+1)].lngLat;
      const hd=turf.bearing(prev,next);
      // Small station plaza, offset off the track so nothing overlaps the moving train.
      const buildingPt=turf.destination(s.lngLat,0.028,hd+90,km).geometry.coordinates; // ~28m off-track
      sceneryFeatures.push({...pt(buildingPt),properties:{modelId:'scenery-station',rotation:[0,0,hd]}});
      // A pole flanking each side of the approach.
      [-1,1].forEach(side=>{
        const polePt=turf.destination(s.lngLat,0.018,hd+90*side,km).geometry.coordinates;
        sceneryFeatures.push({...pt(polePt),properties:{modelId:'scenery-pole',rotation:[0,0,0]}});
      });
      // A small cluster of trees behind the building.
      [[0.04,20],[0.05,55],[0.045,100],[0.052,145]].forEach(([dist,ang])=>{
        const treePt=turf.destination(buildingPt,dist,hd+ang,km).geometry.coordinates;
        sceneryFeatures.push({...pt(treePt),properties:{modelId:'scenery-tree',rotation:[0,0,ang*3]}});
      });
    });
    console.log('[scenery] features built:', sceneryFeatures.length, sceneryFeatures.slice(0,2));
    map.addSource('scenery',{type:'geojson',data:{type:'FeatureCollection',features:sceneryFeatures}});
    // Three separate layers with a literal 'model-id' string each + a filter, instead of one layer with a
    // data-driven ['get','modelId'] expression. The literal form is the exact pattern already proven to work
    // on the train layer above; the data-driven form was only ever confirmed against type definitions, never
    // seen actually render, and is the most likely real cause of nothing showing up after everything else
    // checked out clean on paper.
    const sceneryPaint={'model-elevation-reference':'ground','model-cast-shadows':true,'model-receive-shadows':true,'model-roughness':0.8,'model-ambient-occlusion-intensity':0.6,'model-rotation':['get','rotation']};
    ['scenery-station','scenery-tree','scenery-pole'].forEach(id=>{
      map.addLayer({id:id+'-layer',type:'model',source:'scenery',slot:'top',filter:['==',['get','modelId'],id],layout:{'model-id':id,'model-allow-density-reduction':false},paint:sceneryPaint});
    });
  }catch(e){showProblem('Could not place the scenery models: '+e.message);warn('scenery layer failed: '+e.message);}
  // Remove ONLY the ground-level haze that was washing out the terrain -- not the sky itself, and not anything
  // else about the style's fog. setFog() replaces the whole fog object, so start from exactly what the Standard
  // style already has and change nothing but 'color' -- the single term that creates ground-level haze.
  try{
    const existingFog=map.getFog()||{};
    map.setFog({...existingFog,color:'rgba(0,0,0,0)'});
  }catch(e){warn('setFog: '+e.message);}
  // Full-route preload: before the train ever moves, walk the exact chase-camera path the whole 765km route
  // will use -- same position/camera/train math as render() -- so every satellite and terrain tile the real
  // playback will need gets requested and cached now, while the splash screen still covers the view, instead
  // of being discovered for the first time mid-playback (which is what produced the black terrain the client
  // saw live). This is necessarily slow on a long route -- that's the trade for "never goes black again", and
  // it's why index.html's own watchdog timeout is set to 4 minutes rather than a short one.
  function renderAtDistance(d){t=(d/total)*C.DURATION_S;try{render();}catch(e){warn('prewarm render @'+d.toFixed(1)+'km: '+e.message);}}
  function prewarmRoute(done){
    // 10km steps (not 6): fewer total tile-request bursts over 765km. STEP_DELAY_MS deliberately paces those
    // bursts -- jumping the camera along the whole route as fast as 'idle' allowed was firing tile requests
    // faster than this Mapbox account's rate limit, which showed up live as ~1000 "429 Too Many Requests"
    // errors on the satellite tile API (api.mapbox.com/v4/...) and degraded/broke tile loading across the
    // whole page, not just the preload -- that, not the models, was the real cause of nothing looking right.
    // If 429s still show up in the console after this, the account's rate limit itself needs raising at
    // account.mapbox.com, which no amount of client-side pacing alone can fully work around.
    const STEP_KM=10,STEP_DELAY_MS=450,steps=Math.max(1,Math.ceil(total/STEP_KM));
    let i=0;
    (function next(){
      if(i>steps){done();return;}
      renderAtDistance(Math.min(total,i*STEP_KM));
      sp(15+Math.round((i/steps)*80),'Loading full route terrain… '+Math.round((i/steps)*100)+'%');
      i++;
      let settled=false;
      const proceed=()=>{if(settled)return;settled=true;map.off('idle',onIdle);setTimeout(next,STEP_DELAY_MS);};
      const onIdle=()=>proceed();
      // Per-step cap: if a particular tile never settles (dropped request, offline patch of the route, or a
      // 429 that never resolves), the whole preload must still be able to move on instead of hanging forever.
      map.once('idle',onIdle);setTimeout(proceed,2200);
    })();
  }
  sp(15,'Loading full route terrain… 0%');
  prewarmRoute(()=>{
    // Clear camera/terrain smoothing and the train's last-drawn position so real playback starts clean from
    // Takoradi, not mid-interpolation from wherever the last preload step left off.
    t=0;sm=null;gnd=null;tg=null;lastTrainPosition=null;
    try{render();}catch(e){warn('post-preload render: '+e.message);}
    // Critical state first, BEFORE anything that could throw (like hideSplashScreen touching a splash element
    // that index.html's own watchdog may already have removed if it raced us). Page loads paused: the splash
    // clears onto the stationary train at Takoradi with the Play icon showing -- playing stays false here
    // instead of auto-starting.
    ready=true;last=performance.now();
    try{window.hideSplashScreen();}catch(e){warn('hideSplashScreen: '+e.message);}
  });
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