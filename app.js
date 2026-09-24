(function(){
const C=window.CONFIG,S=C.STATIONS,$=id=>document.getElementById(id),sp=(p,m)=>window.setSplashProgress(p,m);
if(!/^pk\./.test(C.MAPBOX_TOKEN)){sp(0,'Add your public pk. token in config.js');return;}
mapboxgl.accessToken=C.MAPBOX_TOKEN;
const line=turf.lineString(S.map(s=>s.lngLat)),km={units:'kilometers'},total=turf.length(line,km);
const cum=S.map((s,i)=>i?turf.length(turf.lineString(S.slice(0,i+1).map(x=>x.lngLat)),km):0);
const at=d=>turf.along(line,Math.min(Math.max(d,0),total),km).geometry.coordinates;
const chaseBack=C.CHASE_BEHIND_KM,AIM_BACK=C.AIM_BACK_KM??0.12,SYNC_LAG=C.SYNC_LAG_S??0.1; // real km, converted to phase below
const pt=c=>({type:'Feature',geometry:{type:'Point',coordinates:c}});
$('o-dist').textContent=Math.round(total)+' km';$('o-stops').textContent=S.length;
$('t-tot').textContent=fmt(C.DURATION_S);$('lbl-a').textContent=S[0].name;$('lbl-b').textContent=S[S.length-1].name;
function fmt(s){s=Math.round(s);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
function warn(m){console.error(m);if(!/debug/.test(location.search))return; // red banner only when the URL has ?debug
  let b=document.getElementById('dbg');if(!b){b=document.createElement('div');b.id='dbg';b.style.cssText='position:fixed;left:8px;bottom:90px;z-index:99;max-width:70vw;background:#ce1126;color:#fff;font:11px monospace;padding:6px 8px;border-radius:6px';document.body.appendChild(b);}b.textContent=String(m).slice(0,300);}
function trainIcon(){
  const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');x.scale(2,2);
  const rr=(a,b,w,h,r)=>{x.beginPath();x.roundRect(a,b,w,h,r);};
  x.beginPath();x.arc(32,32,29.5,0,7);x.fillStyle='#fcd116';x.fill();x.lineWidth=3;x.strokeStyle='#071018';x.stroke();
  x.fillStyle='#071018';rr(19,13,26,31,7);x.fill();               // carriage front
  x.fillStyle='#fcd116';rr(23,18,18,11,3);x.fill();               // windscreen
  x.beginPath();x.arc(26,37,2.4,0,7);x.arc(38,37,2.4,0,7);x.fill(); // headlights
  x.strokeStyle='#071018';x.lineWidth=3;x.lineCap='round';
  x.beginPath();x.moveTo(25,46);x.lineTo(19,54);x.moveTo(39,46);x.lineTo(45,54);x.stroke(); // rails
  return x.getImageData(0,0,128,128);
}
sp(10);
const map=new mapboxgl.Map({container:'map',style:'mapbox://styles/mapbox/satellite-streets-v12',center:S[0].lngLat,zoom:12,pitch:65,antialias:true,attributionControl:false});
map.on('error',e=>warn('map: '+((e.error&&e.error.message)||'unknown error')));
map.addControl(new mapboxgl.AttributionControl({compact:true}));
let playing=false,t=0,last=performance.now(),sm=null,gnd=null,tg=null,ready=false;
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
  map.addLayer({id:'train-glow',type:'circle',source:'train',paint:{'circle-radius':28,'circle-color':'#fcd116','circle-opacity':.3,'circle-blur':.8,'circle-pitch-alignment':'map'}});
  map.addLayer({id:'train-ring',type:'circle',source:'train',paint:{'circle-radius':21,'circle-color':'rgba(0,0,0,0)','circle-stroke-color':'#fcd116','circle-stroke-width':2.5}});
  // Train pictogram drawn on a canvas at runtime: self-contained, no external sprite
  try{
    if(!map.hasImage('train-icon'))map.addImage('train-icon',trainIcon(),{pixelRatio:2});
    map.addLayer({id:'train-core',type:'symbol',source:'train',layout:{'icon-image':'train-icon','icon-size':1,'icon-allow-overlap':true,'icon-ignore-placement':true}});
  }catch(e){warn('train icon failed, using dot: '+e.message);
    map.addLayer({id:'train-core',type:'circle',source:'train',paint:{'circle-radius':5,'circle-color':'#fcd116','circle-stroke-color':'#071018','circle-stroke-width':1.5}});}
  ready=true;sp(90);render();
  let done=false;const go=()=>{if(done)return;done=true;window.hideSplashScreen();playing=true;last=performance.now();};
  map.once('idle',go);setTimeout(go,9000);
});
function render(){
  const p=t/C.DURATION_S,d=p*total,pos=at(d);
  map.getSource('train').setData(pt(pos));
  // The train is drawn via GeoJSON (async worker), so it lands a few frames behind while moving.
  // The camera follows the same delayed position so the train stays framed identically when playing and paused.
  const dc=Math.max(0,d-SYNC_LAG*total/C.DURATION_S),back=dc-chaseBack; // real km behind, not a route fraction
  const cam=back>=0?at(back):turf.destination(at(0),-back,turf.bearing(at(0),at(0.05))+180,km).geometry.coordinates;
  sm=sm?[sm[0]+(cam[0]-sm[0])*.5,sm[1]+(cam[1]-sm[1])*.5]:cam;
  const g=map.queryTerrainElevation(sm)||0;gnd=gnd==null?g:gnd+(g-gnd)*.3; // height relative to terrain at camera
  // Aim at a point just behind the train (using real ground height) so the train sits in the upper-middle of the screen, clear of the bottom bar
  const aim=at(Math.max(0,dc-AIM_BACK)),ga=map.queryTerrainElevation(aim)||0;tg=tg==null?ga:tg+(ga-tg)*.3;
  const camAlt=gnd+C.CAM_HEIGHT_M,hd=Math.max(1,turf.distance(sm,aim,km)*1000),dz=Math.max(1,camAlt-tg);
  const fc=map.getFreeCameraOptions();
  fc.position=mapboxgl.MercatorCoordinate.fromLngLat(sm,camAlt);
  fc.setPitchBearing(Math.min(85,Math.atan2(hd,dz)*180/Math.PI),turf.bearing(sm,aim));
  map.setFreeCameraOptions(fc);
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
  if(ready){if(playing){t=Math.min(C.DURATION_S,t+dt);if(t>=C.DURATION_S)arrive();}try{render();}catch(e){warn('render: '+e.message);}}
  requestAnimationFrame(frame);}
requestAnimationFrame(frame);
$('play').onclick=()=>{if(t>=C.DURATION_S)return;playing=!playing;$('play').textContent=playing?'❚❚':'▶';};
const restart=()=>{t=0;sm=null;playing=true;$('arrive').hidden=true;$('play').textContent='❚❚';};
$('restart').onclick=restart;$('again').onclick=restart;
})();