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
function trainCanvas(){ // train pictogram + soft halo, drawn at runtime (self-contained, no external sprite)
  const c=document.createElement('canvas');c.width=c.height=192;const x=c.getContext('2d');
  const h=x.createRadialGradient(96,96,20,96,96,96);h.addColorStop(0,'rgba(252,209,22,.45)');h.addColorStop(1,'rgba(252,209,22,0)');x.fillStyle=h;x.fillRect(0,0,192,192);
  x.translate(32,32);x.scale(2,2);
  const rr=(a,b,w,h,r)=>{x.beginPath();x.moveTo(a+r,b);x.arcTo(a+w,b,a+w,b+h,r);x.arcTo(a+w,b+h,a,b+h,r);x.arcTo(a,b+h,a,b,r);x.arcTo(a,b,a+w,b,r);x.closePath();};
  x.beginPath();x.arc(32,32,29.5,0,7);x.fillStyle='#fcd116';x.fill();x.lineWidth=3;x.strokeStyle='#071018';x.stroke();
  x.fillStyle='#071018';rr(19,13,26,31,7);x.fill();
  x.fillStyle='#fcd116';rr(23,18,18,11,3);x.fill();
  x.beginPath();x.arc(26,37,2.4,0,7);x.arc(38,37,2.4,0,7);x.fill();
  x.strokeStyle='#071018';x.lineWidth=3;x.lineCap='round';
  x.beginPath();x.moveTo(25,46);x.lineTo(19,54);x.moveTo(39,46);x.lineTo(45,54);x.stroke();
  return c;
}
// Train as a native GL custom layer: position is read from a JS variable at draw time, so there is zero
// worker/GeoJSON latency (the cause of the train vanishing while playing on phones). Flat billboard, not a 3D model.
const trainLayer={id:'train-gl',type:'custom',renderingMode:'3d',ok:false,pos:null,
  onAdd(m,gl){
    this.map=m;
    const sh=(t,src)=>{const o=gl.createShader(t);gl.shaderSource(o,src);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(o));return o;};
    const pr=gl.createProgram();
    gl.attachShader(pr,sh(gl.VERTEX_SHADER,'uniform mat4 u_m;uniform vec3 u_p;uniform vec2 u_s;attribute vec2 a_c;varying vec2 v;void main(){vec4 c=u_m*vec4(u_p,1.0);c.xy+=a_c*u_s*c.w;v=vec2(a_c.x*.5+.5,.5-a_c.y*.5);gl_Position=c;}'));
    gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,'precision mediump float;uniform sampler2D u_t;varying vec2 v;void main(){gl_FragColor=texture2D(u_t,v);}'));
    gl.linkProgram(pr);if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw new Error('train shader link failed');
    this.pr=pr;this.u={m:gl.getUniformLocation(pr,'u_m'),p:gl.getUniformLocation(pr,'u_p'),s:gl.getUniformLocation(pr,'u_s'),t:gl.getUniformLocation(pr,'u_t')};this.a=gl.getAttribLocation(pr,'a_c');
    this.buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    this.tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,trainCanvas());gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]].forEach(q=>gl.texParameteri(gl.TEXTURE_2D,q[0],q[1]));
    this.ok=true;
  },
  render(gl,matrix){
    if(!this.ok||!this.pos)return;
    const cv=this.map.getCanvas(),sz=cv.clientWidth<600?84:104; // on-screen size in CSS px
    gl.useProgram(this.pr);gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix4fv(this.u.m,false,matrix);gl.uniform3f(this.u.p,this.pos[0],this.pos[1],this.pos[2]);gl.uniform2f(this.u.s,sz/cv.clientWidth,sz/cv.clientHeight);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.uniform1i(this.u.t,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.buf);gl.enableVertexAttribArray(this.a);gl.vertexAttribPointer(this.a,2,gl.FLOAT,false,0,0);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);gl.disableVertexAttribArray(this.a);
  }};
sp(10);
const map=new mapboxgl.Map({container:'map',style:'mapbox://styles/mapbox/satellite-streets-v12',center:S[0].lngLat,zoom:12,pitch:65,projection:'mercator',antialias:true,attributionControl:false});
map.on('error',e=>warn('map: '+((e.error&&e.error.message)||'unknown error')));
map.addControl(new mapboxgl.AttributionControl({compact:true}));
let playing=false,t=0,last=performance.now(),sm=null,gnd=null,tg=null,tz=0,useGL=false,ready=false;
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
  try{map.addLayer(trainLayer);useGL=trainLayer.ok;}catch(e){warn('train GL layer failed, using fallback: '+e.message);}
  if(!useGL){ // fallback: GeoJSON point + circles + icon (updates a few frames late)
    if(map.getLayer('train-gl'))map.removeLayer('train-gl');
    map.addSource('train',{type:'geojson',data:pt(S[0].lngLat)});
    map.addLayer({id:'train-glow',type:'circle',source:'train',paint:{'circle-radius':28,'circle-color':'#fcd116','circle-opacity':.3,'circle-blur':.8}});
    try{map.addImage('train-icon',trainCanvas().getContext('2d').getImageData(0,0,192,192),{pixelRatio:2});
      map.addLayer({id:'train-core',type:'symbol',source:'train',layout:{'icon-image':'train-icon','icon-allow-overlap':true,'icon-ignore-placement':true}});
    }catch(e){map.addLayer({id:'train-core',type:'circle',source:'train',paint:{'circle-radius':6,'circle-color':'#fcd116','circle-stroke-color':'#071018','circle-stroke-width':1.5}});}
  }
  ready=true;sp(90);render();
  let done=false;const go=()=>{if(done)return;done=true;window.hideSplashScreen();playing=true;last=performance.now();};
  map.once('idle',go);setTimeout(go,9000);
});
function render(){
  const p=t/C.DURATION_S,d=p*total,pos=at(d);
  if(useGL){const gt=map.queryTerrainElevation(pos);if(gt!=null)tz=gt;const mc=mapboxgl.MercatorCoordinate.fromLngLat(pos,tz+2);trainLayer.pos=[mc.x,mc.y,mc.z];map.triggerRepaint();}
  else map.getSource('train').setData(pt(pos));
  const dc=Math.max(0,d-(useGL?0:SYNC_LAG)*total/C.DURATION_S),back=dc-chaseBack; // real km behind, not a route fraction
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