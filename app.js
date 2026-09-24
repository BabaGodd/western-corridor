(function(){
const C=window.CONFIG,S=C.STATIONS,$=id=>document.getElementById(id),sp=(p,m)=>window.setSplashProgress(p,m);
if(!/^pk\./.test(C.MAPBOX_TOKEN)){
  sp(100,'Add your public Mapbox token in config.js');
  setTimeout(()=>window.hideSplashScreen('Mapbox token required'),900);
  return;
}
mapboxgl.accessToken=C.MAPBOX_TOKEN;
const line=turf.lineString(S.map(s=>s.lngLat)),km={units:'kilometers'},total=turf.length(line,km);
const cum=S.map((s,i)=>i?turf.length(turf.lineString(S.slice(0,i+1).map(x=>x.lngLat)),km):0);
const at=d=>turf.along(line,Math.min(Math.max(d,0),total),km).geometry.coordinates;
const chaseBack=C.CHASE_BEHIND_KM; // real km, converted to phase below
const pt=c=>({type:'Feature',geometry:{type:'Point',coordinates:c}});
const mapEl=document.getElementById('map');
let mapFailed=false;
function showMapFallback(){
  if(mapFailed){return;}
  mapFailed=true;
  document.body.classList.add('map-fallback');
  if(mapEl){
    mapEl.style.background='radial-gradient(circle at 25% 20%, rgba(252,209,22,0.18), transparent 22%), linear-gradient(135deg, rgba(4,12,18,0.96), rgba(9,26,19,0.92));';
    mapEl.setAttribute('data-map-state','fallback');
  }
}
$('o-dist').textContent=Math.round(total)+' km';$('o-stops').textContent=S.length;
$('t-tot').textContent=fmt(C.DURATION_S);$('lbl-a').textContent=S[0].name;$('lbl-b').textContent=S[S.length-1].name;
function fmt(s){s=Math.round(s);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
sp(10);
const map=new mapboxgl.Map({container:'map',style:'mapbox://styles/mapbox/satellite-streets-v12',center:S[0].lngLat,zoom:12,pitch:65,antialias:true,attributionControl:false});
map.addControl(new mapboxgl.AttributionControl({compact:true}));
map.on('error',()=>showMapFallback());
setTimeout(()=>{
  if(!ready){
    showMapFallback();
  }
}, 3500);
let playing=false,t=0,last=performance.now(),sm=null,gnd=null,ready=false;
map.on('load',()=>{
  sp(45);
  map.addSource('mapbox-dem',{type:'raster-dem',url:'mapbox://mapbox.mapbox-terrain-dem-v1',tileSize:512,maxzoom:14});
  map.setTerrain({source:'mapbox-dem',exaggeration:1.3});
  map.addLayer({id:'sky',type:'sky',paint:{'sky-type':'atmosphere','sky-atmosphere-sun':[0,70],'sky-atmosphere-sun-intensity':8}});
  map.addSource('route',{type:'geojson',data:line});
  map.addLayer({id:'route-glow',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fcd116','line-width':10,'line-blur':8,'line-opacity':.45}});
  map.addLayer({id:'route',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fcd116','line-width':3.5}});
  sp(70);
  map.addSource('stations',{type:'geojson',data:{type:'FeatureCollection',features:S.map(s=>({...pt(s.lngLat),properties:{name:s.name}}))}});
  map.addLayer({id:'st-dot',type:'circle',source:'stations',paint:{'circle-radius':5,'circle-color':'#ce1126','circle-stroke-color':'#fff','circle-stroke-width':1.5}});
  map.addLayer({id:'st-lbl',type:'symbol',source:'stations',layout:{'text-field':['get','name'],'text-font':['DIN Pro Bold','Arial Unicode MS Bold'],'text-size':12,'text-offset':[0,1.3],'text-anchor':'top','text-allow-overlap':true},paint:{'text-color':'#fff','text-halo-color':'#071018','text-halo-width':1.6}});
  // Train: native GL circles fed by a GeoJSON point (no DOM marker, no sprite icons)
  map.addSource('train',{type:'geojson',data:pt(S[0].lngLat)});
  map.addLayer({id:'train-glow',type:'circle',source:'train',paint:{'circle-radius':20,'circle-color':'#fcd116','circle-opacity':.3,'circle-blur':.8,'circle-pitch-alignment':'map'}});
  map.addLayer({id:'train-ring',type:'circle',source:'train',paint:{'circle-radius':10,'circle-color':'rgba(0,0,0,0)','circle-stroke-color':'#fcd116','circle-stroke-width':2.5}});
  map.addLayer({id:'train-core',type:'circle',source:'train',paint:{'circle-radius':5,'circle-color':'#fcd116','circle-stroke-color':'#071018','circle-stroke-width':1.5}});
  ready=true;sp(90);render();
  let done=false;const go=()=>{if(done)return;done=true;window.hideSplashScreen();playing=true;last=performance.now();};
  map.once('idle',go);setTimeout(go,9000);
});
function render(){
  const p=t/C.DURATION_S,d=p*total,pos=at(d);
  map.getSource('train').setData(pt(pos));
  const phase=Math.max(0,p-chaseBack/total); // km -> phase offset
  let cam;
  if(phase>0||d>=chaseBack)cam=at(phase*total);
  else cam=turf.destination(at(0),chaseBack-d,turf.bearing(at(0),at(0.05))+180,km).geometry.coordinates;
  sm=sm?[sm[0]+(cam[0]-sm[0])*.2,sm[1]+(cam[1]-sm[1])*.2]:cam;
  const g=map.queryTerrainElevation(sm)||0;gnd=gnd==null?g:gnd+(g-gnd)*.1; // height relative to terrain at camera
  const fc=map.getFreeCameraOptions();
  fc.position=mapboxgl.MercatorCoordinate.fromLngLat(sm,gnd+C.CAM_HEIGHT_M);
  fc.lookAtPoint(pos);map.setFreeCameraOptions(fc);
  let i=0;while(i<S.length-1&&cum[i+1]<=d)i++;
  const nx=Math.min(i+1,S.length-1);
  $('j-cur').textContent=S[i].name;$('j-next').textContent=S[nx].name;
  $('j-dist').textContent=(i===S.length-1?0:Math.max(0,cum[nx]-d)).toFixed(1)+' km';
  $('j-rem').textContent=Math.max(0,total-d).toFixed(0)+' km';
  $('t-el').textContent=fmt(t);$('pct').textContent=Math.round(p*100)+'%';$('prog').style.width=p*100+'%';
  $('o-status').textContent=p>=1?'Arrived':playing?'In service':'Paused';
}
function arrive(){playing=false;$('arrive').hidden=false;$('play').textContent='▶';}
function frame(now){const dt=(now-last)/1000;last=now;
  if(ready){if(playing){t=Math.min(C.DURATION_S,t+dt);if(t>=C.DURATION_S)arrive();}render();}
  requestAnimationFrame(frame);}
requestAnimationFrame(frame);
$('play').onclick=()=>{if(t>=C.DURATION_S)return;playing=!playing;$('play').textContent=playing?'❚❚':'▶';};
const restart=()=>{t=0;sm=null;playing=true;$('arrive').hidden=true;$('play').textContent='❚❚';};
$('restart').onclick=restart;$('again').onclick=restart;
})();