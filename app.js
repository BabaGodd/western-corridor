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
// Cinematic camera: camB 0 = normal chase camera, 1 = high overview of the whole corridor. The page opens on the
// overview; the first Play descends to the chase view (train waits), and arriving at Hamile pulls back out.
let camB=0,camAnim=null,introHold=false;
const INTRO_MS=C.INTRO_MS??7000,OUTRO_MS=C.OUTRO_MS??7000;
const easeIO=u=>u<.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2;
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
      add('flag',at(o,hd,16,-5),hd);
      add('flag-grda',at(o,hd,16,5),hd);
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
      map.addLayer({id:id+'-layer',type:'model',source:'scenery',slot:'top',minzoom:11,filter:['==',['get','modelId'],id],layout:{'model-id':id,'model-allow-density-reduction':false},paint:sceneryPaint});
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
        map.addLayer({id:id+'-t'+ti,type:'model',source:'forest',slot:'top',minzoom:11,filter:['all',['==',['get','modelId'],id],['==',['get','tier'],ti]],layout:{'model-id':id,'model-allow-density-reduction':false},paint:{...fp,'model-scale':[sc,sc,sc]}});
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
    const PRELOAD_KM=Math.min(total,C.PRELOAD_KM??60);
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
  }
  console.log('[startup] map load fired, preloading');
  setTimeout(()=>finishStartup('45s time cap'),C.STARTUP_CAP_MS??45000);
  prewarmRoute(()=>finishStartup('preload complete'));
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
  const camPt=turf.destination(behindPt,CAM_SIDE_M/1000,headingDeg+90,km).geometry.coordinates;
  sm=sm?[sm[0]+(camPt[0]-sm[0])*.5,sm[1]+(camPt[1]-sm[1])*.5]:camPt;
  // Height relative to terrain AT THE CAMERA'S OWN POSITION, not a fixed absolute altitude -- and keep the last
  // known-good reading when a tile hasn't loaded yet instead of snapping to sea level (0).
  const g=map.queryTerrainElevation(sm);if(g!=null)gnd=gnd==null?g:gnd+(g-gnd)*.3;
  const tgRaw=map.queryTerrainElevation(pos);if(tgRaw!=null)tg=tg==null?tgRaw:tg+(tgRaw-tg)*.3;
  const camAlt=(gnd??0)+C.CAM_HEIGHT_M,trainAlt=(tg??0)+TRAIN_LOOK_LIFT_M;
  const fc=map.getFreeCameraOptions();
  const bl=camBlendNow();
  if(bl>0.0005){
    // Blend chase camera -> corridor overview: lng/lat linear, altitude log-interpolated so the descent feels natural.
    const ovC=[(S[0].lngLat[0]+S[S.length-1].lngLat[0])/2,(S[0].lngLat[1]+S[S.length-1].lngLat[1])/2];
    const ovPos=[ovC[0],ovC[1]-4.0],ovAlt=C.OVERVIEW_ALT_M??1300000;
    const L=(a,b)=>a+(b-a)*bl;
    const pLL=[L(sm[0],ovPos[0]),L(sm[1],ovPos[1])],pAlt=Math.exp(L(Math.log(camAlt),Math.log(ovAlt)));
    fc.position=mapboxgl.MercatorCoordinate.fromLngLat(pLL,pAlt);
    fc.lookAtPoint({lng:L(pos[0],ovC[0]),lat:L(pos[1],ovC[1]),},[0,0,1],L(trainAlt,0));
  }else{
  fc.position=mapboxgl.MercatorCoordinate.fromLngLat(sm,camAlt);
  fc.lookAtPoint({lng:pos[0],lat:pos[1]},[0,0,1],trainAlt);} // look directly at the train, not behind it -- this is what leaves open track visible ahead of it on screen
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
  if(ready)forestTick(pos,d);
}
function arrive(){playing=false;if(C.INTRO!==false)camAnimate(1,OUTRO_MS);setHidden('arrive',false);txt('play','▶');}
function frame(now){const dt=(now-last)/1000;last=now;
  if(ready){if(playing&&!introHold){t=Math.min(C.DURATION_S,t+dt);if(t>=C.DURATION_S)arrive();}try{render();}catch(e){warn('render: '+e.message);}}
  requestAnimationFrame(frame);}
requestAnimationFrame(frame);
// Guard these too: same reasoning as the txt()/setHidden()/setWidth() helpers above -- a missing control
// element shouldn't be able to throw and take the rest of the page down with it.
function startDescent(){if(camB>0&&!introHold&&!(camAnim&&camAnim.to===0)){introHold=true;camAnimate(0,INTRO_MS,()=>{introHold=false;last=performance.now();});}}
function togglePlay(){if(t>=C.DURATION_S)return;playing=!playing;if(playing)startDescent();txt('play',playing?'❚❚':'▶');}
if($('play'))$('play').onclick=togglePlay;
const restart=()=>{t=0;sm=null;playing=true;setHidden('arrive',true);txt('play','❚❚');camAnim=null;introHold=false;if(camB>0)startDescent();};
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
const arrT=i=>i<=0?0:(segs[i-1].t0+segs[i-1].T);
function jumpToT(tt){
  t=Math.max(0,Math.min(C.DURATION_S,tt));camAnim=null;camB=0;introHold=false;sm=null;gnd=null;tg=null;
  setHidden('arrive',true);last=performance.now();
  if(ready){try{render();}catch(e){warn('jump render: '+e.message);}}
}
const PRESETS=['day','dusk','night','dawn'];let presetNow='day';
function setPreset(name){if(name===presetNow)return;presetNow=name;try{map.setConfigProperty('basemap','lightPreset',name);}catch(e){warn('lightPreset: '+e.message);}}
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
  const setPresent=on=>{document.body.classList.toggle('present',on);document.body.classList.remove('ui');if(on)say('Presentation mode · Space play/pause · N / B next / previous station · L light · F fullscreen · P exit');};
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
    else if(k==='f'){try{document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();}catch(_){}}
  });
})();
})();
