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
// ---- Station stops: the journey clock (t) is still the 0..DURATION_S seek bar, but distance is no longer a straight
// line of t. Each intermediate station gets a short dwell (train stands still), with a gentle ease out of / into
// every stop, so the clock, the seek bar and the "total time" label all stay exactly as they were.
const DWELL_S=C.STATION_DWELL_S??8,RAMP_S=C.STATION_RAMP_S??5,N_DWELL=Math.max(0,S.length-2);
const MOVE_S=Math.max(1,C.DURATION_S-N_DWELL*DWELL_S),V0=total/MOVE_S;
const segs=[];
(function(){let t0=0;for(let i=0;i<S.length-1;i++){
  const L=cum[i+1]-cum[i],T=L/V0,r=Math.min(RAMP_S,T/3),v=L/(T-r);
  segs.push({t0,T,L,d0:cum[i],v,r});
  t0+=T+((i+1<=S.length-2)?DWELL_S:0);
}})();
function dOf(tt){
  if(tt<=0)return 0;
  for(const g of segs){
    if(tt<g.t0+g.T){
      if(tt<g.t0)return g.d0;                       // standing at the station before this leg
      const u=tt-g.t0,{T,r,v,L,d0}=g;
      if(u<r)return d0+v*u*u/(2*r);                 // pulling away
      if(u>T-r){const w=T-u;return d0+L-v*w*w/(2*r);} // braking into the next stop
      return d0+v*(u-r/2);                          // cruising
    }
  }
  return total;
}
// Station banner (built here so it needs no HTML/CSS edits): shows as the train approaches, while it stands, and
// as it pulls away.
(function(){
  const st=document.createElement('style');
  st.textContent='#stbanner{position:fixed;left:208px;top:calc(88px + env(safe-area-inset-top));transform:translateX(-12px);z-index:20;pointer-events:none;opacity:0;transition:opacity .6s ease,transform .6s ease;min-width:230px;max-width:min(300px,calc(100vw - 230px));padding:12px 20px 12px 18px;border-radius:14px;background:rgba(5,13,19,.78);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.14);border-left:5px solid #fcd116;box-shadow:0 18px 55px rgba(0,0,0,.35);color:#fff;font-family:Inter,system-ui,sans-serif}#stbanner.on{opacity:1;transform:translateX(0)}#stbanner small{display:block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#fcd116;margin-bottom:4px}#stbanner b{display:block;font-size:24px;font-weight:700;line-height:1.1}#stbanner span{display:block;font-size:13px;color:rgba(255,255,255,.72);margin-top:6px}@media (max-width:900px){#stbanner{left:12px;top:auto;bottom:120px;max-width:calc(100vw - 24px)}}#stbanner i{display:block;height:3px;margin-top:10px;border-radius:2px;background:linear-gradient(90deg,#ce1126 0 33%,#fcd116 33% 66%,#006b3f 66%)}';
  document.head.appendChild(st);
  const el=document.createElement('div');el.id='stbanner';el.innerHTML='<small></small><b></b><span></span><i></i>';
  document.body.appendChild(el);
  let shown=-2;
  window.__updateBanner=function(d){
    let idx=-1;
    for(let i=0;i<S.length;i++){const k=d-cum[i];if(k>-0.55&&k<0.35){idx=i;break;}}
    if(idx===shown)return;shown=idx;
    if(idx<0){el.classList.remove('on');return;}
    const q=el.children,last=idx===S.length-1;
    q[0].textContent=idx===0?'Journey begins':last?'Final stop':'Station '+(idx+1)+' of '+S.length;
    q[1].textContent=S[idx].name;
    let sub=last?'Journey complete · '+Math.round(total)+' km':'Next: '+S[idx+1].name+' · '+(cum[idx+1]-cum[idx]).toFixed(0)+' km ahead';
    let e=null;try{e=map.queryTerrainElevation(S[idx].lngLat);}catch(_){}
    const facts=[Math.round(cum[idx])+' km from '+S[0].name];if(e!=null&&isFinite(e))facts.push('elevation '+Math.round(e)+' m');
    if(S[idx].info)facts.push(S[idx].info);
    q[2].innerHTML='';q[2].appendChild(document.createTextNode(sub));
    const f=document.createElement('em');f.style.cssText='display:block;font-style:normal;font-size:12px;color:rgba(255,255,255,.55);margin-top:4px';f.textContent=facts.join(' · ');q[2].appendChild(f);
    el.classList.add('on');
  };
})();
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
    showProblem('Could not load the scenery models. Check that every .glb in the models folder is uploaded (station, canopy, tree, pole, flag, flag-grda, sign, signal, fence, watertower, wagon).');
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
let mapLoaded=false;
setTimeout(()=>{if(!mapLoaded){sp(10,'Still connecting to Mapbox… check your internet connection');console.error('[startup] map load event not fired after 30s');}},30000);
let playing=false,t=0,last=performance.now(),sm=null,gnd=null,tg=null,ready=false;
let lastTrainPosition=null;
let forestTick=()=>{};
let effectsTick=()=>{};
// Cinematic camera: camB 0 = normal chase camera, 1 = high overview of the whole corridor. The page opens on the
// overview; the first Play descends to the chase view (train waits), and arriving at Hamile pulls back out.
let camB=0,camAnim=null,introHold=false;
// Optional cinematic cameras (key C). 0 = the normal chase camera, which stays the default and is never altered.
let camMode=0,passAnchor=null;const CAM_NAMES=['Chase (default)','Trackside pass','Station orbit','Helicopter','Head-on'];
// Live train state shared with the effects (smoke layer, sound, profile strip).
const trainState={pos:null,alt:0,heading:0,d:0,speed:0,pd:null,pt:0};
const INTRO_MS=C.INTRO_MS??10000,OUTRO_MS=C.OUTRO_MS??8000;
const easeIO=u=>-(Math.cos(Math.PI*u)-1)/2;   // gentle sine ease in/out (softer than the old cubic)
function camAnimate(to,dur,onDone){camAnim={from:camB,to,t0:performance.now(),dur,onDone};}
function camBlendNow(){
  if(camAnim){const u=(performance.now()-camAnim.t0)/camAnim.dur;
    if(u>=1){camB=camAnim.to;const cb=camAnim.onDone;camAnim=null;if(cb)cb();}
    else camB=camAnim.from+(camAnim.to-camAnim.from)*easeIO(u);}
  return camB;
}
map.on('load',()=>{
  mapLoaded=true;
  sp(45);
  // Standard Satellite ships its own terrain -- no separate mapbox-dem source, no manual setTerrain, no
  // manual sky layer; adding our own on top of this style's built-in one caused drape/terrain conflicts before.
  map.addSource('route',{type:'geojson',data:line});
  // A single flat yellow line read as a highlighted route, not an actual railway. This is the standard
  // cartographic convention for a track instead: a dark ballast bed, two parallel steel rails offset from the
  // centerline via 'line-offset' (a real style-spec property, not a custom pattern image -- simpler and more
  // reliable), and a thin gold centerline kept underneath for brand/official-route identity, low-opacity so it
  // doesn't read as "highlighted" over the rails.
  map.addLayer({id:'route-brand',type:'line',source:'route',slot:'top',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':C.BRAND_GLOW_COLOR||'#2fdc6a','line-width':9,'line-blur':7,'line-opacity':.2}});
  map.addLayer({id:'route-ballast',type:'line',source:'route',slot:'top',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#453c31','line-width':5.5}});
  map.addLayer({id:'route-ties',type:'line',source:'route',slot:'top',layout:{'line-cap':'butt','line-join':'round'},paint:{'line-color':'#2a241c','line-width':5.5,'line-dasharray':[0.4,0.55]}});
  map.addLayer({id:'route-rail-l',type:'line',source:'route',slot:'top',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#c7ccd3','line-width':0.6,'line-offset':-1.6}});
  map.addLayer({id:'route-rail-r',type:'line',source:'route',slot:'top',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#c7ccd3','line-width':0.6,'line-offset':1.6}});
  sp(70);
  map.addSource('stations',{type:'geojson',data:{type:'FeatureCollection',features:S.map((s,i)=>({...pt(s.lngLat),properties:{name:s.name,side:(i%2===0)?'left':'right',prio:(i===0||i===S.length-1)?0:1+i}}))}});
  map.addLayer({id:'st-dot',type:'circle',source:'stations',slot:'top',paint:{'circle-radius':5,'circle-color':'#ce1126','circle-stroke-color':'#fff','circle-stroke-width':1.5}});
  map.addLayer({id:'st-lbl',type:'symbol',source:'stations',slot:'top',layout:{'text-field':['get','name'],'text-font':['DIN Pro Bold','Arial Unicode MS Bold'],'text-size':['interpolate',['linear'],['zoom'],4,10,9,12,14,13],'text-anchor':['case',['==',['get','side'],'left'],'right','left'],'text-offset':['case',['==',['get','side'],'left'],['literal',[-0.85,0]],['literal',[0.85,0]]],'text-allow-overlap':false,'text-padding':3,'symbol-sort-key':['get','prio']},paint:{'text-color':'#fff','text-halo-color':'#071018','text-halo-width':1.6}});
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
  const flagF=[];
  try{
    const IDS=['station','canopy','tree','pole','flag','flag-grda','sign','signal','fence','watertower','wagon','house-a','house-b','house-c','hut','field','person-a','person-b','person-c'];
    IDS.forEach(n=>map.addModel('scenery-'+n,'./models/'+(n==='flag-grda'?'flag-grda':n)+'.glb'));
    const sceneryFeatures=[];
    const add=(id,c,yaw)=>sceneryFeatures.push({...pt(c),properties:{modelId:'scenery-'+id,rotation:[0,0,yaw]}});
    // point at 'side' metres right of track (negative = left) and 'along' metres forward along track, from station s
    const at=(origin,hd,side,along)=>{
      let c=origin;
      if(along) c=turf.destination(c,Math.abs(along)/1000,along>0?hd:hd+180,km).geometry.coordinates;
      if(side)  c=turf.destination(c,Math.abs(side)/1000,side>0?hd+90:hd-90,km).geometry.coordinates;
      return c;
    };
    const WATER=['Takoradi','Sunyani','Wa'];
    const sidingLines=[];
    S.forEach((s,i)=>{
      const prev=S[Math.max(0,i-1)].lngLat,next=S[Math.min(S.length-1,i+1)].lngLat;
      const hd=turf.bearing(prev,next);
      const o=s.lngLat;
      // Station building: long axis parallel to track (yaw = hd-90), canopy/front facing the track.
      const bp=at(o,hd,28,0);
      add('station',bp,hd-90);
      add('canopy',bp,hd-90);
      add('sign',at(o,hd,14,14),hd);
      // Waiting passengers on the platform (deterministic per station).
      {let ps=0;for(const ch of s.name)ps=(ps*37+ch.charCodeAt(0))>>>0;const pr=()=>{ps=(ps*1664525+1013904223)>>>0;return ps/4294967296;};
       const nP=5+Math.floor(pr()*5);
       for(let k=0;k<nP;k++) add(['person-a','person-b','person-c'][Math.floor(pr()*3)],at(o,hd,20.5+pr()*1.6,(pr()-0.5)*11),pr()*360);}
      // Two flags at every station: Ghana + GRDA, side by side, facing the approaching (rear-chase) camera.
      flagF.push({id:'flag',c:at(o,hd,16,-5),yaw:hd,ph:i*1.7});
      flagF.push({id:'flag-grda',c:at(o,hd,16,5),yaw:hd,ph:i*1.7+0.9});
      // Signals either side, utility poles, perimeter fence behind the building.
      add('signal',at(o,hd,-9,-60),hd);
      add('signal',at(o,hd,9,60),hd+180);
      [-1,1].forEach(sd=>add('pole',at(o,hd,18*sd,0),0));
      [-8.4,-4.2,0,4.2,8.4].forEach(a=>add('fence',at(o,hd,44,a),hd-90));
      // Trees behind the building.
      [[0.04,20],[0.05,55],[0.045,100],[0.052,145]].forEach(([dist,ang])=>{
        add('tree',turf.destination(bp,dist,hd+ang,km).geometry.coordinates,ang*3);
      });
      // ---- Village around the station: houses (and huts in the savanna north), plus a few crop fields ----
      {
        const big={Takoradi:16,Sekondi:14,Tarkwa:12,Dunkwa:12,Sunyani:18,Wa:16,Bibiani:10,Bole:10,Jirapa:9,Bamboi:8};
        const nH=big[s.name]||7, north=s.lngLat[1]>8.0;
        let vs=0;for(const ch of s.name)vs=(vs*31+ch.charCodeAt(0))>>>0;
        const vr=()=>{vs=(vs*1664525+1013904223)>>>0;return vs/4294967296;};
        for(let k=0;k<nH;k++){
          const side=vr()<0.5?-1:1,along=(vr()-0.5)*560,off=58+vr()*170;
          if(Math.abs(along)<60&&side>0) continue;           // keep the station yard clear
          const id=(north&&vr()<0.55)?'hut':['house-a','house-b','house-c'][Math.floor(vr()*3)];
          add(id,at(o,hd,side*off,along),(side>0?hd+90:hd-90)+(vr()-0.5)*26);
          if(vr()<0.4) add('tree',at(o,hd,side*(off+14+vr()*16),along+(vr()-0.5)*20),vr()*360);
        }
        const nF=nH>=12?4:2;
        for(let k=0;k<nF;k++){
          const side=k%2?-1:1,along=(vr()-0.5)*520,off=120+vr()*160;
          add('field',at(o,hd,side*off,along),hd-90+(vr()-0.5)*14);
        }
      }
      if(WATER.includes(s.name)) add('watertower',at(o,hd,70,-20),0);
      if(s.name==='Takoradi'){
        // Freight siding with parked wagons, on the left of the main line.
        sidingLines.push({type:'Feature',geometry:{type:'LineString',coordinates:[at(o,hd,-10,-90),at(o,hd,-10,90)]}});
        [-39,-26,-13,0,13,26,39].forEach(a=>add('wagon',at(o,hd,-10,a),hd-90));
      }
    });
    // ---- Continuous trackside scenery along the whole 765km route (sparse, so the load stays small) ----
    // Seeded RNG: the same trees appear in the same places on every run and every device.
    let seed=20260;const rnd=()=>{seed=(seed*1664525+1013904223)%4294967296;return seed/4294967296;};
    const stationKm=S.map(st=>turf.length(turf.lineSlice(S[0].lngLat,turf.nearestPointOnLine(line,st.lngLat,{units:'kilometers'}),line),km));
    const nearStation=d=>stationKm.some(k=>Math.abs(k-d)<0.35);   // keep clear of the hand-placed station scenery
    let alongCount=0;
    for(let d=0.3;d<total-0.3;d+=0.25){
      if(nearStation(d)) continue;
      const p0=turf.along(line,d,km).geometry.coordinates,p1=turf.along(line,d+0.02,km).geometry.coordinates;
      const hd=turf.bearing(p0,p1);
      // utility pole line on the right side, every 250m
      add('pole',turf.destination(p0,0.013,hd+90,km).geometry.coordinates,hd);alongCount++;
      // a tree cluster roughly every 500m, either side, 28-110m back from the track
      if(Math.round(d/0.25)%2===0){
        const n=1+Math.floor(rnd()*3);
        for(let k=0;k<n;k++){
          const side=rnd()<0.5?-1:1,off=0.028+rnd()*0.082,sh=(rnd()-0.5)*0.12;
          const base=turf.destination(p0,Math.abs(sh),sh>0?hd:hd+180,km).geometry.coordinates;
          add('tree',turf.destination(base,off,hd+90*side,km).geometry.coordinates,rnd()*360);alongCount++;
        }
      }
    }
    console.log('[scenery] along-route items:',alongCount);
    console.log('[scenery] features built:', sceneryFeatures.length);
    map.addSource('scenery',{type:'geojson',data:{type:'FeatureCollection',features:sceneryFeatures}});
    map.addSource('sidings',{type:'geojson',data:{type:'FeatureCollection',features:sidingLines}});
    map.addLayer({id:'siding-ballast',type:'line',source:'sidings',slot:'top',paint:{'line-color':'#453c31','line-width':4}});
    map.addLayer({id:'siding-rail-l',type:'line',source:'sidings',slot:'top',paint:{'line-color':'#c7ccd3','line-width':0.5,'line-offset':-1.2}});
    map.addLayer({id:'siding-rail-r',type:'line',source:'sidings',slot:'top',paint:{'line-color':'#c7ccd3','line-width':0.5,'line-offset':1.2}});
    // One layer per model id with a literal model-id (the pattern confirmed working on screen).
    const sceneryPaint={'model-elevation-reference':'ground','model-cast-shadows':true,'model-receive-shadows':true,'model-roughness':0.8,'model-ambient-occlusion-intensity':0.6,'model-rotation':['get','rotation']};
    IDS.forEach(n=>{
      const id='scenery-'+n;
      map.addLayer({id:id+'-layer',type:'model',source:'scenery',slot:'top',minzoom:12.5,filter:['==',['get','modelId'],id],layout:{'model-id':id,'model-allow-density-reduction':false},paint:sceneryPaint});
    });
  }catch(e){showProblem('Could not place the scenery models: '+e.message);warn('scenery layer failed: '+e.message);}
  // ---- Dense forest where the land really is forest ------------------------------------------------------------
  // Mapbox's own landcover data (mapbox-terrain-v2, class 'wood') says where forest is. A near-invisible probe layer
  // makes the map load those tiles; as the train moves, trees are scattered on a fixed grid inside the wood polygons
  // within ~2.4km of it (deterministic per grid cell, so the same spot always gets the same tree). Set
  // FOREST:false in config.js to switch it off, FOREST_SHADOWS:true for tree shadows (prettier, heavier).
  if(C.FOREST!==false){
    try{
      map.addModel('forest-a','./models/forest-a.glb');
      map.addModel('forest-b','./models/forest-b.glb');
      map.addSource('forest-lc',{type:'vector',url:'mapbox://mapbox.mapbox-terrain-v2'});
      map.addLayer({id:'forest-lc-probe',type:'fill',source:'forest-lc','source-layer':'landcover',slot:'middle',filter:['==',['get','class'],'wood'],paint:{'fill-color':'#000000','fill-opacity':0.01}});
      map.addSource('forest',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      const TIERS=[0.8,1.0,1.3],fp={'model-elevation-reference':'ground','model-cast-shadows':C.FOREST_SHADOWS===true,'model-receive-shadows':true,'model-roughness':0.9,'model-ambient-occlusion-intensity':0.5,'model-rotation':['get','rotation']};
      ['forest-a','forest-b'].forEach(id=>TIERS.forEach((sc,ti)=>{
        map.addLayer({id:id+'-t'+ti,type:'model',source:'forest',slot:'top',minzoom:12.5,filter:['all',['==',['get','modelId'],id],['==',['get','tier'],ti]],layout:{'model-id':id,'model-allow-density-reduction':false},paint:{...fp,'model-scale':[sc,sc,sc]}});
      }));
      const GRID=0.0004,RADIUS=0.022,REFRESH_KM=0.8,MAXTREES=3500;
      const hash=(ix,iy,salt)=>{let h=Math.imul(ix,73856093)^Math.imul(iy,19349663)^Math.imul(salt,83492791);h^=h>>>13;h=Math.imul(h,0x5bd1e995);h^=h>>>15;return (h>>>0)/4294967296;};
      let lastD=-1e9,busy=false;
      function refreshForest(pos,d){
        if(busy)return;busy=true;const t0=performance.now();
        try{
          if(!map.getSource('forest-lc')){busy=false;return;}
          const feats=map.querySourceFeatures('forest-lc',{sourceLayer:'landcover',filter:['==',['get','class'],'wood']});
          const local=turf.lineSliceAlong(line,Math.max(0,d-3),Math.min(total,d+3),km);
          const seen=new Set(),out=[];
          const x0=pos[0]-RADIUS,x1=pos[0]+RADIUS,y0=pos[1]-RADIUS,y1=pos[1]+RADIUS;
          for(const f of feats){
            if(!f.geometry||(f.geometry.type!=='Polygon'&&f.geometry.type!=='MultiPolygon'))continue;
            const bb=turf.bbox(f.geometry);
            if(bb[2]<x0||bb[0]>x1||bb[3]<y0||bb[1]>y1)continue;
            const ax=Math.max(bb[0],x0),bx=Math.min(bb[2],x1),ay=Math.max(bb[1],y0),by=Math.min(bb[3],y1);
            for(let ix=Math.ceil(ax/GRID);ix*GRID<=bx;ix++)for(let iy=Math.ceil(ay/GRID);iy*GRID<=by;iy++){
              const key=ix+'_'+iy;if(seen.has(key))continue;
              if(hash(ix,iy,1)>0.72)continue;
              const lng=(ix+(hash(ix,iy,2)-0.5)*0.8)*GRID,lat=(iy+(hash(ix,iy,3)-0.5)*0.8)*GRID,c=[lng,lat];
              if(!turf.booleanPointInPolygon(c,f.geometry))continue;
              seen.add(key);
              if(turf.pointToLineDistance(c,local,km)<0.03)continue;                      // keep the track corridor clear
              if(S.some(st=>Math.abs(st.lngLat[0]-lng)<0.003&&Math.abs(st.lngLat[1]-lat)<0.003))continue; // station yards
              const r=hash(ix,iy,4),north=lat>8.0;
              out.push({type:'Feature',geometry:{type:'Point',coordinates:c},properties:{modelId:(north?r<0.75:r<0.12)?'forest-b':'forest-a',tier:Math.min(2,Math.floor(hash(ix,iy,5)*3)),rotation:[0,0,hash(ix,iy,6)*360]}});
              if(out.length>=MAXTREES)break;
            }
            if(out.length>=MAXTREES)break;
          }
          map.getSource('forest').setData({type:'FeatureCollection',features:out});
          lastD=d;
          console.log('[forest] trees:',out.length,'from',feats.length,'wood features in',Math.round(performance.now()-t0),'ms @',d.toFixed(1),'km');
        }catch(e){warn('forest refresh: '+e.message);}
        busy=false;
      }
      forestTick=(pos,d)=>{if(Math.abs(d-lastD)>REFRESH_KM)refreshForest(pos,d);};
      // Tiles may still be arriving right after a seek or pause: when the map settles, refresh once for that spot
      // (settledD stops this from looping on its own setData).
      let settledD=-1e9;
      map.on('idle',()=>{if(!ready||playing)return;const dd=dOf(t);if(Math.abs(dd-settledD)>0.01&&lastTrainPosition){settledD=dd;refreshForest(lastTrainPosition,dd);}});
    }catch(e){warn('forest setup failed: '+e.message);}
  }
  // ---- Effects: swaying flags, glowing track pulse, night glow --------------------------------------------------
  // Every piece is wrapped separately: a problem in one can never stop the page from loading or the splash from
  // clearing (startup itself never waits on anything in here).
  const fx={flags:null,pulse:false,last:0};
  try{
    const flagFeats=flagF.map(f=>({type:'Feature',geometry:{type:'Point',coordinates:f.c},properties:{modelId:'scenery-'+f.id,rotation:[0,0,f.yaw]}}));
    map.addSource('flags',{type:'geojson',data:{type:'FeatureCollection',features:flagFeats}});
    ['flag','flag-grda'].forEach(n=>map.addLayer({id:'flagsrc-'+n,type:'model',source:'flags',slot:'top',minzoom:12.5,filter:['==',['get','modelId'],'scenery-'+n],layout:{'model-id':'scenery-'+n,'model-allow-density-reduction':false},paint:{'model-elevation-reference':'ground','model-cast-shadows':true,'model-receive-shadows':true,'model-roughness':0.8,'model-rotation':['get','rotation']}}));
    fx.flags={feats:flagFeats,base:flagF};
  }catch(e){warn('flags setup: '+e.message);}
  try{
    map.addSource('route-pulse',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    map.addLayer({id:'route-pulse',type:'line',source:'route-pulse',slot:'top',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':C.PULSE_COLOR||'#3dff7a','line-width':3.2,'line-blur':1.4,'line-opacity':0.95,'line-emissive-strength':1}});
    fx.pulse=C.TRACK_PULSE!==false;
  }catch(e){warn('pulse setup: '+e.message);}
  effectsTick=(pos,d)=>{
    const now=performance.now();if(now-fx.last<100)return;fx.last=now;
    try{window.__extraTick&&window.__extraTick(pos,d);}catch(e){}
    // Flags flutter only when the train is within ~3km of them (a handful of features, not the whole scenery set).
    if(fx.flags){
      const cl=Math.cos(pos[1]*Math.PI/180);let changed=false;
      fx.flags.feats.forEach((f,i)=>{
        const c=f.geometry.coordinates;
        if(Math.hypot((c[0]-pos[0])*cl,c[1]-pos[1])*111>3)return;
        const b=fx.flags.base[i];f.properties.rotation=[0,0,b.yaw+Math.sin(now/520+b.ph)*10+Math.sin(now/190+b.ph*2)*3];changed=true;
      });
      if(changed){const src=map.getSource('flags');if(src)src.setData({type:'FeatureCollection',features:fx.flags.feats});}
    }
    // Pulse of light running down the track ahead of the train (hidden in the high overview).
    if(fx.pulse){
      const src=map.getSource('route-pulse');
      if(src){
        if(camB>0.05||!playing){if(fx.pulseOn){src.setData({type:'FeatureCollection',features:[]});fx.pulseOn=false;}}
        else{
          const phase=((now/1000)*0.15)%0.35,feats=[];
          for(let k=0;k<6;k++){const a=d+0.08+phase+k*0.35,b=a+0.1;if(b>=total)break;
            try{feats.push(turf.lineSliceAlong(line,a,b,km));}catch(e){}}
          src.setData({type:'FeatureCollection',features:feats});fx.pulseOn=true;
        }
      }
    }
  };
  // Night glow: emissive strength per model layer, driven by the light preset (0 in daylight, so day is unchanged).
  const GLOW={'train-model-layer':0.3,'scenery-station-layer':0.45,'scenery-canopy-layer':0.4,'scenery-signal-layer':1,'scenery-sign-layer':0.6,'scenery-house-a-layer':0.3,'scenery-house-b-layer':0.3,'scenery-house-c-layer':0.3,'scenery-hut-layer':0.2,'scenery-person-a-layer':0.25,'scenery-person-b-layer':0.25,'scenery-person-c-layer':0.25,'flagsrc-flag':0.5,'flagsrc-flag-grda':0.5,'scenery-watertower-layer':0.2,'scenery-wagon-layer':0.2};
  window.__applyGlow=name=>{
    const m={night:1,dusk:0.45,dawn:0.3}[name]||0;
    Object.keys(GLOW).forEach(id=>{try{if(map.getLayer(id))map.setPaintProperty(id,'model-emissive-strength',GLOW[id]*m);}catch(e){}});
  };
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
  function renderAtDistance(d){t=(d/total)*C.DURATION_S;try{render(d);}catch(e){warn('prewarm render @'+d.toFixed(1)+'km: '+e.message);}}
  function prewarmRoute(done){
    // 10km steps (not 6): fewer total tile-request bursts over 765km. STEP_DELAY_MS deliberately paces those
    // bursts -- jumping the camera along the whole route as fast as 'idle' allowed was firing tile requests
    // faster than this Mapbox account's rate limit, which showed up live as ~1000 "429 Too Many Requests"
    // errors on the satellite tile API (api.mapbox.com/v4/...) and degraded/broke tile loading across the
    // whole page, not just the preload -- that, not the models, was the real cause of nothing looking right.
    // If 429s still show up in the console after this, the account's rate limit itself needs raising at
    // account.mapbox.com, which no amount of client-side pacing alone can fully work around.
    // PRELOAD_KM (config.js): how much of the route to pre-fetch behind the splash screen. The full 765km walk takes
    // minutes (77 steps, each waiting for the map to settle) -- far too long for a live presentation -- so the default is
    // just the first stretch; the rest loads on demand as the train reaches it. PRELOAD_KM:765 restores the full pass.
    const PRELOAD_KM=Math.min(total,C.PRELOAD_KM??30);
    const STEP_KM=10,STEP_DELAY_MS=450,steps=Math.max(1,Math.ceil(PRELOAD_KM/STEP_KM));
    let i=0;
    (function next(){
      if(aborted)return;
      if(i>steps){done();return;}
      renderAtDistance(Math.min(PRELOAD_KM,i*STEP_KM));
      sp(15+Math.round((i/steps)*80),'Loading terrain… '+Math.round((i/steps)*100)+'%');
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
  // Startup can finish two ways: the preload walk completes, or this hard cap (45s) fires first. Either way the splash
  // is released exactly once, so a slow connection or a stuck tile can never leave the page on the splash screen.
  let started=false,aborted=false;
  function finishStartup(reason){
    if(started)return;started=true;aborted=true;
    console.log('[startup] finished:',reason);
    // Clear camera/terrain smoothing and the train's last-drawn position so real playback starts clean from
    // Takoradi, not mid-interpolation from wherever the last preload step left off.
    t=0;sm=null;gnd=null;tg=null;lastTrainPosition=null;
    try{render();}catch(e){warn('post-preload render: '+e.message);}
    // Critical state first, BEFORE anything that could throw. Page loads paused on the stationary train.
    if(C.INTRO!==false){camB=1;}
    ready=true;last=performance.now();
    try{render();}catch(e){}
    try{window.hideSplashScreen();}catch(e){warn('hideSplashScreen: '+e.message);}
    setTimeout(()=>{try{startExtras();}catch(e){warn('extras: '+e.message);}},1500);
  }
  console.log('[startup] map load fired, preloading');
  setTimeout(()=>finishStartup('60s time cap'),C.STARTUP_CAP_MS??60000);
  // The glide from the overview down to Takoradi passes through every zoom level; if those map tiles only start
  // loading when the glide does, the picture stalls and stutters. So, while the splash is still up, step the camera
  // down that exact path once so every tile is already cached when the client presses Play.
  function warmDescent(done){
    if(C.INTRO===false||aborted){done();return;}
    const stepsB=[1,0.93,0.86,0.79,0.72,0.65,0.58,0.52,0.46,0.4,0.34,0.28,0.22,0.17,0.12,0.08,0.04,0];let i=0;
    (function next(){
      if(aborted)return;
      if(i>=stepsB.length){done();return;}
      camB=stepsB[i];t=0;sm=null;gnd=null;tg=null;
      try{render(0);}catch(e){warn('warm descent: '+e.message);}
      sp(90+Math.round((i/stepsB.length)*9),'Preparing the journey…');
      i++;
      let settled=false;const proceed=()=>{if(settled)return;settled=true;map.off('idle',onIdle);setTimeout(next,120);};
      const onIdle=()=>proceed();map.once('idle',onIdle);setTimeout(proceed,1300);
    })();
  }
  prewarmRoute(()=>warmDescent(()=>finishStartup('preload complete')));
});
function render(dForce){
  const p=t/C.DURATION_S,d=(dForce!=null)?dForce:dOf(t),pos=at(d);
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
  let camPt=turf.destination(behindPt,CAM_SIDE_M/1000,headingDeg+90,km).geometry.coordinates;
  let lookP=pos,camH=C.CAM_HEIGHT_M;
  if(camMode>0){
    const nowC=performance.now(),brg=a=>turf.bearing(at(Math.max(0,a-0.05)),at(Math.min(total,a+0.05)));
    if(camMode===1){            // fixed trackside spot just ahead of the train; moves on to the next spot once passed
      if(passAnchor==null||d>passAnchor+0.15||d<passAnchor-1.2)passAnchor=Math.min(total,d+0.32);
      camPt=turf.destination(at(passAnchor),0.022,brg(passAnchor)+90,km).geometry.coordinates;camH=4;
    }else if(camMode===2){      // slow orbit around the train
      camPt=turf.destination(pos,0.085,((nowC/1000)*0.3)*180/Math.PI,km).geometry.coordinates;camH=32;
    }else if(camMode===3){      // helicopter: high, far back, drifting side to side
      const hb=at(Math.max(0,d-0.55));
      camPt=turf.destination(hb,0.25*Math.sin(nowC/7000),headingDeg+90,km).geometry.coordinates;camH=170;
    }else if(camMode===4){      // head-on: low, just ahead of the train, looking back at it
      camPt=turf.destination(at(Math.min(total,d+0.075)),0.004,headingDeg+90,km).geometry.coordinates;camH=6;
    }
  }
  sm=sm?[sm[0]+(camPt[0]-sm[0])*.5,sm[1]+(camPt[1]-sm[1])*.5]:camPt;
  // Height relative to terrain AT THE CAMERA'S OWN POSITION, not a fixed absolute altitude -- and keep the last
  // known-good reading when a tile hasn't loaded yet instead of snapping to sea level (0).
  const g=map.queryTerrainElevation(sm);if(g!=null)gnd=gnd==null?g:gnd+(g-gnd)*.3;
  const tgRaw=map.queryTerrainElevation(pos);if(tgRaw!=null)tg=tg==null?tgRaw:tg+(tgRaw-tg)*.3;
  const camAlt=(gnd??0)+camH,trainAlt=(tg??0)+TRAIN_LOOK_LIFT_M;
  trainState.pos=pos;trainState.alt=tg??0;trainState.heading=headingDeg;trainState.d=d;
  {const nm=performance.now();if(trainState.pd!=null){const dtS=(nm-trainState.pt)/1000;
    if(dtS>0.001&&dtS<0.5){const dd=Math.abs(d-trainState.pd);trainState.speed=dd>0.3?0:trainState.speed*0.85+(dd*1000/dtS)*0.15;}}
   trainState.pd=d;trainState.pt=nm;}
  const fc=map.getFreeCameraOptions();
  const bl=camBlendNow();
  if(bl>0.0005){
    // Fly-in between the chase camera and the corridor overview. The camera keeps a fixed geometry relative to the
    // train: its distance from the train and its height both change by the SAME proportion (log-interpolated), so
    // the view always looks down at a sensible angle and the map only ever needs the tiles around the train.
    // (The earlier version slid the position linearly while the height shrank logarithmically, which left the camera
    // skimming the ground tens of km away from Takoradi -- a huge, constantly-changing set of tiles, i.e. the jerking.)
    const ovC=[(S[0].lngLat[0]+S[S.length-1].lngLat[0])/2,(S[0].lngLat[1]+S[S.length-1].lngLat[1])/2];
    const ovPos=[ovC[0],ovC[1]-4.0],ovAlt=C.OVERVIEW_ALT_M??1300000;
    const L=(a,b)=>a+(b-a)*bl;
    const M=111320,cosL=Math.cos(lookP[1]*Math.PI/180);
    const c1=[(sm[0]-lookP[0])*M*cosL,(sm[1]-lookP[1])*M],c0=[(ovPos[0]-lookP[0])*M*cosL,(ovPos[1]-lookP[1])*M];
    const r1=Math.max(30,Math.hypot(c1[0],c1[1])),r0=Math.hypot(c0[0],c0[1]);
    const th1=Math.atan2(c1[0],c1[1]),th0=Math.atan2(c0[0],c0[1]);
    let dth=th0-th1;while(dth>Math.PI)dth-=2*Math.PI;while(dth<-Math.PI)dth+=2*Math.PI;
    const r=Math.exp(L(Math.log(r1),Math.log(r0))),th=th1+dth*bl;
    const pLL=[lookP[0]+r*Math.sin(th)/(M*cosL),lookP[1]+r*Math.cos(th)/M];
    const pAlt=Math.exp(L(Math.log(camAlt),Math.log(ovAlt)));
    const g=Math.pow(bl,6);                       // the aim point only drifts to the corridor centre when we're far away
    fc.position=mapboxgl.MercatorCoordinate.fromLngLat(pLL,pAlt);
    fc.lookAtPoint({lng:lookP[0]+(ovC[0]-lookP[0])*g,lat:lookP[1]+(ovC[1]-lookP[1])*g},[0,0,1],trainAlt*(1-g));
  }else{
  fc.position=mapboxgl.MercatorCoordinate.fromLngLat(sm,camAlt);
  fc.lookAtPoint({lng:lookP[0],lat:lookP[1]},[0,0,1],trainAlt);} // look directly at the train, not behind it -- this is what leaves open track visible ahead of it on screen
  map.setFreeCameraOptions(fc);
  let i=0;while(i<S.length-1&&cum[i+1]<=d)i++;
  const nx=Math.min(i+1,S.length-1);
  txt('j-cur',S[i].name);txt('j-next',S[nx].name);
  txt('j-dist',(i===S.length-1?0:Math.max(0,cum[nx]-d)).toFixed(1)+' km');
  txt('j-rem',Math.max(0,total-d).toFixed(0)+' km');
  txt('t-el',fmt(t));txt('pct',Math.round(p*100)+'%');setWidth('prog',p*100+'%');
  const track=$('prog-track');if(track)track.setAttribute('aria-valuenow',String(Math.round(p*100)));
  const dwelling=playing&&t<C.DURATION_S&&i>0&&i<S.length-1&&Math.abs(d-cum[i])<1e-6;
  txt('o-status',p>=1?'Arrived':dwelling?'Station stop':playing?'In service':'Paused');
  try{window.__updateBanner&&window.__updateBanner(d);}catch(e){}
  if(ready&&!introHold){forestTick(pos,d);try{effectsTick(pos,d);}catch(e){}}
}
function arrive(){playing=false;if(C.INTRO!==false)camAnimate(1,OUTRO_MS);setHidden('arrive',false);txt('play','▶');}
function frame(now){const dt=(now-last)/1000;last=now;
  if(ready){if(playing&&!introHold){t=Math.min(C.DURATION_S,t+dt);if(t>=C.DURATION_S)arrive();}try{render();}catch(e){warn('render: '+e.message);}}
  requestAnimationFrame(frame);}
requestAnimationFrame(frame);
// Guard these too: same reasoning as the txt()/setHidden()/setWidth() helpers above -- a missing control
// element shouldn't be able to throw and take the rest of the page down with it.
function startDescent(){if(camB>0&&!introHold&&!(camAnim&&camAnim.to===0)){introHold=true;camAnimate(0,INTRO_MS,()=>{introHold=false;last=performance.now();try{window.__say&&window.__say('Ready at Takoradi · press Space or ▶ to start the journey');}catch(e){}});}}
function togglePlay(){
  if(t>=C.DURATION_S)return;
  if(introHold)return;                                   // camera is still gliding down: ignore presses
  if(camB>0.001&&!playing){startDescent();try{soundInit();}catch(e){}return;}   // 1st press: glide to Takoradi and WAIT
  playing=!playing;if(playing){try{soundInit();}catch(e){}}
  txt('play',playing?'❚❚':'▶');
}
if($('play'))$('play').onclick=togglePlay;
const restart=()=>{t=0;sm=null;setHidden('arrive',true);camAnim=null;introHold=false;if(camB>0.001){playing=false;txt('play','▶');startDescent();}else{playing=true;txt('play','❚❚');}};
if($('restart'))$('restart').onclick=restart;
if($('again'))$('again').onclick=restart;
const track=$('prog-track');
if(track){
  let dragging=false,resumeAfterSeek=false;
  const seekTo=(fraction)=>{
    t=Math.max(0,Math.min(1,fraction))*C.DURATION_S;
    camAnim=null;camB=0;introHold=false;
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

// ---- Presentation controls (keyboard) ----------------------------------------------------------------------------
//  P presentation mode (hides panels, cursor; mouse move brings the controls back)   Space play/pause
//  N next station   B previous station   L cycle light (day/dusk/night/dawn)   F fullscreen
//  R rain on/off   , . turn the sun   [ ] sun height   0 reset sun   C camera view   M sound on/off
const arrT=i=>i<=0?0:(segs[i-1].t0+segs[i-1].T);
function jumpToT(tt){
  t=Math.max(0,Math.min(C.DURATION_S,tt));camAnim=null;camB=0;introHold=false;sm=null;gnd=null;tg=null;
  setHidden('arrive',true);last=performance.now();
  if(ready){try{render();}catch(e){warn('jump render: '+e.message);}}
}
const PRESETS=['day','dusk','night','dawn'];let presetNow='day',rainOn=false,sunAz=210,sunPol=45;
function setPreset(name){if(name===presetNow)return;presetNow=name;try{map.setConfigProperty('basemap','lightPreset',name);}catch(e){warn('lightPreset: '+e.message);}try{window.__applyGlow&&window.__applyGlow(name);}catch(e){}}
const _tod=C.TIME_OF_DAY_JOURNEY===true;
if(_tod)setInterval(()=>{if(!ready)return;const p=t/C.DURATION_S;setPreset(p<0.08?'dawn':p<0.72?'day':'dusk');},1500);
(function(){
  const st=document.createElement('style');
  st.textContent='body.present .panel,body.present .brand,body.present .bottom{opacity:0!important;pointer-events:none!important;transition:opacity .5s ease}body.present.ui .bottom{opacity:1!important;pointer-events:auto!important}body.present{cursor:none}body.present.ui{cursor:default}#ptoast{position:fixed;left:50%;bottom:9vh;transform:translateX(-50%);z-index:30;background:rgba(5,13,19,.85);color:#fff;font:13px Inter,system-ui,sans-serif;padding:10px 18px;border-radius:10px;border:1px solid rgba(255,255,255,.14);opacity:0;pointer-events:none;transition:opacity .4s}#ptoast.on{opacity:1}';
  document.head.appendChild(st);
  const toast=document.createElement('div');toast.id='ptoast';document.body.appendChild(toast);
  let tt=null;const say=m=>{toast.textContent=m;toast.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>toast.classList.remove('on'),3500);};
  let uiT=null;
  document.addEventListener('mousemove',()=>{if(!document.body.classList.contains('present'))return;document.body.classList.add('ui');clearTimeout(uiT);uiT=setTimeout(()=>document.body.classList.remove('ui'),2500);});
  window.__say=say;
  const setPresent=on=>{document.body.classList.toggle('present',on);document.body.classList.remove('ui');if(on)say('Presentation mode · Space play/pause · N / B station · C camera · M sound · L light · R rain · , . [ ] sun · F fullscreen · P exit');};
  if(/[?&]present/.test(location.search))setPresent(true);
  document.addEventListener('keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    const tag=(e.target&&e.target.tagName)||'';if(/INPUT|TEXTAREA|SELECT/.test(tag))return;
    const k=e.key.toLowerCase();
    if(k==='p'){setPresent(!document.body.classList.contains('present'));}
    else if(k===' '&&tag!=='BUTTON'){e.preventDefault();if(ready)togglePlay();}
    else if(k==='n'||k==='b'){
      if(!ready)return;let target=-1;
      if(k==='n'){for(let i=0;i<S.length;i++)if(arrT(i)>t+0.5){target=i;break;}}
      else{for(let i=S.length-1;i>=0;i--)if(arrT(i)<t-1.5){target=i;break;}}
      if(target>=0){jumpToT(arrT(target));say((target===0?'Start: ':'Station: ')+S[target].name);}
    }
    else if(k==='l'){setPreset(PRESETS[(PRESETS.indexOf(presetNow)+1)%PRESETS.length]);say('Light: '+presetNow);}
    else if(k==='r'){rainOn=!rainOn;try{map.setRain(rainOn?{density:0.85,intensity:0.7,opacity:0.7,color:'#b9c6d4'}:null);say(rainOn?'Rain: on':'Rain: off');}catch(err){rainOn=false;say('Rain is not available here');warn('rain: '+err.message);}}
    else if(k===','||k==='.'||k==='['||k===']'){
      if(k===',')sunAz=(sunAz+335)%360;else if(k==='.')sunAz=(sunAz+25)%360;else if(k==='[')sunPol=Math.max(10,sunPol-8);else sunPol=Math.min(85,sunPol+8);
      try{map.setLights([{id:'amb',type:'ambient',properties:{color:'#ffffff',intensity:0.5}},{id:'sun',type:'directional',properties:{direction:[sunAz,sunPol],color:'#fff3df',intensity:0.8,'cast-shadows':true,'shadow-intensity':0.9}}]);say('Sun · direction '+Math.round(sunAz)+'° · height '+Math.round(90-sunPol)+'°  (0 = reset)');}catch(err){say('Sun control is not available here');warn('setLights: '+err.message);}}
    else if(k==='0'){try{map.setLights(null);map.setConfigProperty('basemap','lightPreset',presetNow);say('Sun reset');}catch(err){warn('sun reset: '+err.message);}}
    else if(k==='c'){camMode=(camMode+1)%CAM_NAMES.length;passAnchor=null;sm=null;say('Camera: '+CAM_NAMES[camMode]+(camMode?'  (C = next, cycles back to Chase)':''));}
    else if(k==='m'){const on=toggleSound();say(on?'Sound: on':'Sound: off');}
    else if(k==='f'){try{document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();}catch(_){}}
  });
})();

// =====================================================================================================================
// EXTRAS (all started AFTER the splash has cleared; every part is wrapped so a failure can never affect the page):
//   1. Smoke + wheel dust (three.js drawn inside the Mapbox map as a custom layer)
//   2. Sound (generated in the browser: rumble, rail clatter, horn, station chime)
//   3. Elevation strip + mini-map
// =====================================================================================================================
function loadScript(urls){
  return new Promise((res,rej)=>{let i=0;
    const next=()=>{if(i>=urls.length){rej(new Error('script could not be loaded'));return;}
      const sc=document.createElement('script');sc.src=urls[i++];sc.async=true;sc.onload=()=>res();sc.onerror=()=>{sc.remove();next();};document.head.appendChild(sc);};
    next();});
}
function startExtras(){
  try{startSmoke();}catch(e){warn('smoke start: '+e.message);}
  try{startProfile();}catch(e){warn('profile start: '+e.message);}
  window.__extraTick=(pos,d)=>{try{if(prof.el)drawProfile(pos,d);}catch(e){}try{soundTick(d);}catch(e){}};
}

// ---------------------------------------------------------------- 1. smoke + dust
function startSmoke(){
  if(C.DUST===false||window.__smokeStarted)return;   // this layer now draws the wheel dust (smoke is off unless SMOKE:true)window.__smokeStarted=true;
  loadScript(['https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js','https://unpkg.com/three@0.149.0/build/three.min.js']).then(()=>{
    const THREE=window.THREE;if(!THREE)throw new Error('three.js missing');
    const layer=makeSmokeLayer(THREE);
    map.addLayer(layer);
    console.log('[fx] smoke + dust layer added');
  }).catch(e=>warn('smoke/dust unavailable: '+e.message));
}
function makeSmokeLayer(THREE){
  const SMOKE_N=140,DUST_N=90;
  return {
    id:'train-fx',type:'custom',renderingMode:'3d',slot:'top',
    onAdd(m,gl){
      this.map=m;this.camera=new THREE.Camera();this.scene=new THREE.Scene();
      this.renderer=new THREE.WebGLRenderer({canvas:m.getCanvas(),context:gl,antialias:true});
      this.renderer.autoClear=false;
      const geo=new THREE.IcosahedronGeometry(1,1);
      const mk=(n,col)=>{const a=[];for(let i=0;i<n;i++){
        const mat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
        const mesh=new THREE.Mesh(geo,mat);mesh.visible=false;this.scene.add(mesh);
        a.push({mesh,mat,alive:false,age:0,life:1,vx:0,vy:0,vz:0,s0:1,s1:1,o0:.3,kind:0});}return a;};
      this.smoke=mk(SMOKE_N,0x333333);this.dust=mk(DUST_N,0xb59b78);
      this.accS=0;this.accD=0;this.prev=null;this.t0=null;
    },
    render(gl,matrix){
      const ts=trainState;const now=performance.now();
      const dt=this.t0==null?0.016:Math.min(0.1,Math.max(0.001,(now-this.t0)/1000));this.t0=now;
      const all=this.smoke.concat(this.dust);
      if(!ts.pos||camB>0.4||(C.DUST===false)){all.forEach(p=>{p.alive=false;p.mesh.visible=false;});this.prev=null;return;}
      const m0=mapboxgl.MercatorCoordinate.fromLngLat(ts.pos,ts.alt);
      const unit=m0.meterInMercatorCoordinateUnits();
      // Keep every particle fixed in the WORLD while the origin (the train) moves: shift them by minus the train's step.
      if(this.prev){
        const dx=(m0.x-this.prev.x)/unit,dy=-(m0.y-this.prev.y)/unit,dz=ts.alt-(this.prevAlt??ts.alt);
        if(Math.hypot(dx,dy)>400){all.forEach(p=>{p.alive=false;p.mesh.visible=false;});}
        else all.forEach(p=>{if(p.alive){p.mesh.position.x-=dx;p.mesh.position.y-=dy;p.mesh.position.z-=dz;}});
      }
      this.prev={x:m0.x,y:m0.y};this.prevAlt=ts.alt;
      const h=ts.heading*Math.PI/180,fx=Math.sin(h),fy=Math.cos(h),rx=Math.cos(h),ry=-Math.sin(h);
      const speed=ts.speed,moving=speed>2,night=(presetNow==='night')?0.35:(presetNow==='dusk'||presetNow==='dawn')?0.7:1;
      const rate=(C.SMOKE===true)?(C.SMOKE_RATE??(moving?22:8)):0;   // smoke removed by default
      this.accS+=rate*dt;
      while(this.accS>=1){this.accS-=1;
        const p=this.smoke.find(q=>!q.alive);if(!p)break;
        // The locomotive's exhaust sits ~4.5m behind the model origin (the nose) and ~5m up on the roof.
        p.mesh.position.set(-fx*4.5+(Math.random()-.5)*.5,-fy*4.5+(Math.random()-.5)*.5,5.1);
        p.vx=fx*speed*0.12+1.2;p.vy=fy*speed*0.12;p.vz=2.0+Math.random()*1.2;
        p.s0=0.7+Math.random()*.4;p.s1=5.5+Math.random()*2.5;p.life=4.8+Math.random()*1.6;p.o0=0.36;p.age=0;p.alive=true;p.kind=0;p.mesh.visible=true;
      }
      if(speed>12){
        this.accD+=Math.min(30,speed*0.22)*dt;
        while(this.accD>=1){this.accD-=1;
          const p=this.dust.find(q=>!q.alive);if(!p)break;
          const along=2+Math.random()*60,side=(Math.random()<.5?-1:1)*(1.3+Math.random()*.6);
          p.mesh.position.set(-fx*along+rx*side,-fy*along+ry*side,0.3);
          p.vx=rx*side*0.8;p.vy=ry*side*0.8;p.vz=0.7+Math.random()*.8;
          p.s0=0.3;p.s1=2.0+Math.random()*1.2;p.life=1.8+Math.random()*.8;p.o0=0.22;p.age=0;p.alive=true;p.kind=1;p.mesh.visible=true;
        }
      }
      for(const p of all){
        if(!p.alive)continue;
        p.age+=dt;const u=p.age/p.life;
        if(u>=1){p.alive=false;p.mesh.visible=false;continue;}
        p.mesh.position.x+=p.vx*dt;p.mesh.position.y+=p.vy*dt;p.mesh.position.z+=p.vz*dt;
        p.vz*=1-0.35*dt;p.vx*=1-0.5*dt;p.vy*=1-0.5*dt;
        const sc=p.s0+(p.s1-p.s0)*Math.pow(u,0.7);p.mesh.scale.set(sc,sc,sc);
        p.mat.opacity=p.o0*Math.pow(1-u,1.3)*(u<0.06?u/0.06:1);
        const c=p.kind===0?(0.17+0.33*u)*night:(0.72*night);
        if(p.kind===0)p.mat.color.setRGB(c,c,c);else p.mat.color.setRGB(0.71*night,0.61*night,0.47*night);
      }
      const mm=new THREE.Matrix4().fromArray(matrix);
      const l=new THREE.Matrix4().makeTranslation(m0.x,m0.y,m0.z).scale(new THREE.Vector3(unit,-unit,unit));
      this.camera.projectionMatrix=mm.multiply(l);
      if(this.renderer.resetState)this.renderer.resetState();else this.renderer.state.reset();
      this.renderer.render(this.scene,this.camera);
      this.map.triggerRepaint();
    }
  };
}

// ---------------------------------------------------------------- 2. sound (REAL recordings only)
// Put real recordings in a `sounds` folder next to index.html:
//   sounds/train-loop.mp3     a seamless loop of a train running (engine rumble + rail clatter)
//   sounds/train-horn.mp3     one locomotive horn blast (played as the train nears each station)
//   sounds/station-arrive.mp3 (optional) brake squeal / bell for the moment the train stops
// (.ogg and .wav work too; mp3/ogg are tried first.) The bundled train-loop.wav / train-horn.wav / station-arrive.wav were
// generated for this project; drop your own recordings next to them to replace them.
const SND_BASE=C.SOUND_BASE||'./sounds/';
const snd={ctx:null,on:C.SOUND!==false,n:null,bufs:{},horned:{},atSt:false};
function sndLoad(base){
  // your own mp3/ogg recordings win over the bundled .wav files
  const exts=['mp3','ogg','wav'];let i=0;
  const tryNext=()=>{
    if(i>=exts.length)return Promise.resolve(null);
    const url=SND_BASE+base+'.'+exts[i++];
    return fetch(url).then(r=>{if(!r.ok)throw new Error(String(r.status));return r.arrayBuffer();})
      .then(b=>new Promise((res,rej)=>snd.ctx.decodeAudioData(b,res,rej))).catch(()=>tryNext());
  };
  return tryNext();
}
function soundInit(){
  if(!snd.on)return;
  try{
    if(snd.ctx){if(snd.ctx.state==='suspended')snd.ctx.resume();return;}
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    const ctx=new AC();snd.ctx=ctx;
    const master=ctx.createGain();master.gain.value=0;master.connect(ctx.destination);
    snd.n={master,loopG:null,src:null};
    Promise.all([sndLoad('train-loop'),sndLoad('train-horn'),sndLoad('station-arrive')]).then(([lp,hn,ar])=>{
      snd.bufs={lp,hn,ar};
      if(lp){const src=ctx.createBufferSource();src.buffer=lp;src.loop=true;const g=ctx.createGain();g.gain.value=0;src.connect(g);g.connect(master);src.start();snd.n.src=src;snd.n.loopG=g;}
      console.log('[sound] recordings found:',[lp&&'train-loop',hn&&'train-horn',ar&&'station-arrive'].filter(Boolean).join(', ')||'none (silent)');
    }).catch(e=>warn('sound load: '+e.message));
  }catch(e){warn('sound: '+e.message);snd.ctx=null;}
}
function soundOnce(buf,gain){
  const ctx=snd.ctx;if(!ctx||!snd.n||!buf)return;
  const src=ctx.createBufferSource();src.buffer=buf;const g=ctx.createGain();g.gain.value=gain;src.connect(g);g.connect(snd.n.master);src.start();
}
function soundTick(d){
  if(!snd.ctx||!snd.n)return;
  const n=snd.n,ctx=snd.ctx,T=ctx.currentTime;
  const run=playing&&!introHold&&camB<0.6;
  const v=run?trainState.speed:0,k=Math.min(1,v/70);
  const vis=document.hidden?0:1,out=(snd.on?1:0)*vis*(camB>0.3?0.35:1);
  n.master.gain.setTargetAtTime(0.9*out,T,0.25);
  if(n.loopG){
    n.loopG.gain.setTargetAtTime(run?(0.12+0.88*k):0,T,0.35);
    n.src.playbackRate.setTargetAtTime(0.8+0.4*k,T,0.5);   // slower when pulling away / braking, faster at speed
  }
  if(!run||!snd.on)return;
  for(let i=1;i<S.length;i++){
    if(!snd.horned[i]&&d>cum[i]-0.78&&d<cum[i]-0.55){snd.horned[i]=true;soundOnce(snd.bufs.hn,0.9);}
    else if(snd.horned[i]&&d<cum[i]-1.6)snd.horned[i]=false;
  }
  let atSt=false;for(let i=1;i<S.length;i++)if(Math.abs(d-cum[i])<0.002){atSt=true;break;}
  if(atSt&&!snd.atSt)soundOnce(snd.bufs.ar,0.8);snd.atSt=atSt;
}
function toggleSound(){snd.on=!snd.on;if(snd.on)soundInit();return snd.on;}

// ---------------------------------------------------------------- 3. elevation strip + mini-map
const prof={el:null,canvas:null,ctx:null,N:200,tries:0,filled:0};
function startProfile(){
  if(C.PROFILE!==true||prof.el)return;   // elevation strip + mini-map removed by default (set PROFILE:true to bring it back)
  const st=document.createElement('style');
  st.textContent='#jprof{position:fixed;left:362px;right:18px;bottom:calc(17px + env(safe-area-inset-bottom));height:64px;z-index:15;pointer-events:none;border-radius:16px;background:rgba(5,13,19,.72);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(252,209,22,.17);overflow:hidden;opacity:0;transition:opacity .6s}#jprof.on{opacity:1}#jprof canvas{width:100%;height:100%;display:block}@media (max-width:900px){#jprof{display:none}}';
  document.head.appendChild(st);
  const box=document.createElement('div');box.id='jprof';const cv=document.createElement('canvas');box.appendChild(cv);document.body.appendChild(box);
  prof.box=box;prof.canvas=cv;prof.ctx=cv.getContext('2d');prof.el=new Array(prof.N).fill(null);
  const sample=()=>{
    let f=0;
    for(let i=0;i<prof.N;i++){
      if(prof.el[i]==null){let e=null;try{e=map.queryTerrainElevation(at(i/(prof.N-1)*total));}catch(_){}if(e!=null&&isFinite(e))prof.el[i]=e;}
      if(prof.el[i]!=null)f++;
    }
    prof.filled=f;prof.tries++;
    return f>=prof.N*0.97||prof.tries>=12;
  };
  // Terrain tiles at the high overview already cover the whole corridor, so this fills the profile within a few
  // 'idle' events; whatever is still missing is filled in as the journey passes it.
  const onIdle=()=>{if(sample())map.off('idle',onIdle);};
  map.on('idle',onIdle);setTimeout(sample,800);
}
function drawProfile(pos,d){
  const cv=prof.canvas,g=prof.ctx;if(!cv||!g)return;
  // fill in single samples as the train passes them
  {const i=Math.round(d/total*(prof.N-1));if(prof.el[i]==null&&trainState.alt!=null&&isFinite(trainState.alt)&&trainState.alt!==0)prof.el[i]=trainState.alt;}
  const vals=prof.el.filter(v=>v!=null);
  const show=vals.length>prof.N*0.4;prof.box.classList.toggle('on',show);if(!show)return;
  const dpr=window.devicePixelRatio||1,r=cv.getBoundingClientRect(),W=Math.round(r.width*dpr),H=Math.round(r.height*dpr);
  if(!W||!H)return;if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;}
  g.clearRect(0,0,W,H);
  const pad=8*dpr,mapW=H-2*pad;
  // ---- mini-map (left)
  const lo=S.map(s=>s.lngLat);let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;lo.forEach(c=>{x0=Math.min(x0,c[0]);x1=Math.max(x1,c[0]);y0=Math.min(y0,c[1]);y1=Math.max(y1,c[1]);});
  const cl=Math.cos(((y0+y1)/2)*Math.PI/180),sx=(x1-x0)*cl||1,sy=(y1-y0)||1,k=Math.min((mapW*0.7)/sx,mapW/sy);
  const ox=pad+mapW/2-(sx*k)/2,oy=pad+mapW/2+(sy*k)/2;
  const P=c=>[ox+((c[0]-x0)*cl)*k,oy-((c[1]-y0))*k];
  g.lineWidth=2*dpr;g.lineCap='round';g.lineJoin='round';
  g.strokeStyle='rgba(255,255,255,.28)';g.beginPath();lo.forEach((c,i)=>{const q=P(c);i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]);});g.stroke();
  // travelled part
  g.strokeStyle='#fcd116';g.beginPath();g.moveTo(...P(lo[0]));
  let idx=0;while(idx<S.length-1&&cum[idx+1]<=d){idx++;g.lineTo(...P(lo[idx]));}
  g.lineTo(...P(pos));g.stroke();
  lo.forEach(c=>{const q=P(c);g.fillStyle='rgba(255,255,255,.75)';g.beginPath();g.arc(q[0],q[1],1.6*dpr,0,7);g.fill();});
  {const q=P(pos),pl=(Math.sin(performance.now()/300)+1)/2;g.fillStyle='#ce1126';g.beginPath();g.arc(q[0],q[1],(3+pl)*dpr,0,7);g.fill();g.strokeStyle='#fff';g.lineWidth=1.2*dpr;g.stroke();}
  // ---- elevation profile (right)
  const px0=mapW+pad*2.5,px1=W-pad*1.5,py0=pad*1.6,py1=H-pad*1.6,pw=px1-px0,ph=py1-py0;
  const mx=Math.max(50,...vals),mn=Math.min(0,...vals);
  const X=i=>px0+(i/(prof.N-1))*pw,Y=v=>py1-((v-mn)/(mx-mn))*ph*0.92;
  const pts=[];prof.el.forEach((v,i)=>{if(v!=null)pts.push([X(i),Y(v)]);});
  const frac=d/total,cx=px0+frac*pw;
  const area=(clipTo)=>{g.beginPath();g.moveTo(pts[0][0],py1);pts.forEach(p=>g.lineTo(p[0],p[1]));g.lineTo(pts[pts.length-1][0],py1);g.closePath();};
  g.save();g.beginPath();g.rect(px0,0,pw,H);g.clip();
  area();g.fillStyle='rgba(255,255,255,.10)';g.fill();
  g.save();g.beginPath();g.rect(px0,0,cx-px0,H);g.clip();area();const gr=g.createLinearGradient(0,py0,0,py1);gr.addColorStop(0,'rgba(61,255,122,.75)');gr.addColorStop(1,'rgba(0,107,63,.35)');g.fillStyle=gr;g.fill();g.restore();
  g.strokeStyle='rgba(255,255,255,.55)';g.lineWidth=1.2*dpr;g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.stroke();
  g.restore();
  // station ticks
  S.forEach((s,i)=>{const x=px0+(cum[i]/total)*pw;g.fillStyle=i<=idx?'#fcd116':'rgba(255,255,255,.5)';g.fillRect(x-0.5*dpr,py1-4*dpr,1*dpr,4*dpr);});
  // train marker at the current elevation
  {let ei=Math.round(frac*(prof.N-1)),ev=null;for(let o=0;o<30&&ev==null;o++){ev=prof.el[Math.min(prof.N-1,ei+o)]??prof.el[Math.max(0,ei-o)];}
   const y=ev==null?py1:Y(ev);g.fillStyle='#ce1126';g.strokeStyle='#fff';g.lineWidth=1.2*dpr;g.beginPath();g.arc(cx,y,3.4*dpr,0,7);g.fill();g.stroke();
   g.fillStyle='rgba(255,255,255,.85)';g.font=(10*dpr)+'px Inter,system-ui,sans-serif';g.textBaseline='top';g.textAlign='left';
   g.fillText('ELEVATION  '+(ev==null?'':Math.round(ev)+' m'),px0,3*dpr);
   g.textAlign='right';g.fillStyle='rgba(255,255,255,.5)';g.fillText('peak '+Math.round(mx)+' m',px1,3*dpr);}
}
})();
