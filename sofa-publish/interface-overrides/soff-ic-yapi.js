import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// CAD parts are rigid, source-derived display meshes. Cross-file placement and
// educational upholstery/foam/spring surfaces are illustrative, not factory CAD.
const canvas = document.getElementById('inside-canvas');
const status = document.getElementById('inside-status');
const heading = document.getElementById('inside-heading');
const description = document.getElementById('inside-description');
const progressInput = document.getElementById('inside-progress');
const stageButtons = [...document.querySelectorAll('[data-inside-stage]')];
const playButton = document.getElementById('inside-play');
const pauseButton = document.getElementById('inside-pause');
const resetButton = document.getElementById('inside-reset');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const stages = [
  ['Birlikte', 'Döşeme, oturum katmanları ve çizimlerden alınan iskeleti birlikte incele.'],
  ['Döşeme', 'Döşeme yüzeyi yukarı ayrılarak altındaki yapı katmanlarını görünür kılar.'],
  ['Oturum süngerleri', '32 dansite Sofa Direnç süngeri + 32 dansite konfor süngeri. Sırt minderinde silikon dolgu bulunur. Katman kalınlıkları temsili gösterilmiştir.'],
  ['Yay desteği', 'Oturumda çelik zigzag yay bulunur. Yay biçimi, iç yapıyı açıklamak için videodan örneklenmiştir.'],
  ['İskelet', 'CNC kavak kontrplak, kayın kereste ve MDF. Gövde, sırt ve sağ kolun 53 parçası kaynak çizimlerden alınmıştır.'],
  ['Ayaklar', 'Metal, Monge Bronze boya, 10 cm yükseklik. Ayak parçalarının biçimi kaynak çizimden alınmıştır.'],
];
const state = { ready: false, progress: 0, playing: false, stage: 0, frames: 0, userOrbit: false, error: null };
let renderer, scene, camera, controls, gltfRoot, environment, clock = 0, timer = 0;
let width = 0, height = 0;
const nativeGroups = {}, nativeMaterials = [], illustrationGroups = {}, movable = [];
const sourceOrigin = new THREE.Vector3(-0.52897266806, 0.06996944745, 0.40880882256);
const offsetMM = {
  frame: [0, 0, 0],
  back: [86.97266806, -179.37536, 197.33029],
  // The separate arm is placed outside the armless950mm nominal module.
  arm: [215.58046, 0, 0],
  foot: [-520.00000, -662.65117744, -69.96944745],
};
const toGL = ([x,y,z]) => new THREE.Vector3(x/1000,z/1000,-y/1000);
const smooth = (a,b,t) => { const x=THREE.MathUtils.clamp((t-a)/(b-a),0,1); return x*x*(3-2*x); };

function roundedBox(w,h,d,r,material) {
  const geometry = new THREE.BoxGeometry(w,h,d,8,6,8);
  const pos=geometry.attributes.position, inner=new THREE.Vector3(w/2-r,h/2-r,d/2-r), p=new THREE.Vector3(), q=new THREE.Vector3();
  for(let i=0;i<pos.count;i++) {
    p.fromBufferAttribute(pos,i);q.set(THREE.MathUtils.clamp(p.x,-inner.x,inner.x),THREE.MathUtils.clamp(p.y,-inner.y,inner.y),THREE.MathUtils.clamp(p.z,-inner.z,inner.z));
    p.sub(q).normalize().multiplyScalar(r).add(q);pos.setXYZ(i,p.x,p.y,p.z);
  }
  geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}
function material(color, options={}) {
  return new THREE.MeshStandardMaterial({color,roughness:0.86,metalness:0,...options});
}
function addIllustration(name,role,mesh,position) {
  let group=illustrationGroups[role];if(!group){group=new THREE.Group();group.name=role;illustrationGroups[role]=group;scene.add(group);}
  mesh.name=name;mesh.position.set(...position);mesh.userData.basePosition=mesh.position.clone();group.add(mesh);
  movable.push({mesh,role,base:mesh.position.clone()});return mesh;
}
function buildIllustrations() {
  const cloth=material('#d1c5ae',{roughness:0.96});
  const first=material('#e2cc97'), comfort=material('#f2e6c9'), fill=material('#f4f0e7');
  const metal=material('#36342e',{metalness:0.64,roughness:0.45});
  const springY=0.205;
  // Eight illustrative wires; source DWG references an unloaded external spring.
  for(let i=0;i<8;i++){
    const ps=[];
    for(let j=0;j<=112;j++){
      const t=j/112;ps.push(new THREE.Vector3(-0.35+i*0.1+Math.sin(t*Math.PI*22)*0.014,springY+Math.sin(t*Math.PI)*0.004,-0.27+t*0.58));
    }
    const mesh=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ps),112,0.0018,5,false),metal.clone());
    addIllustration('Temsili zigzag yay '+(i+1),'springs',mesh,[0,0,0]);
  }
  addIllustration('Sofa Direnç süngeri · temsili kalınlık','foam',roundedBox(0.91,0.085,0.86,0.025,first),[0,0.2575,0.005]);
  addIllustration('Konfor süngeri · temsili kalınlık','comfort',roundedBox(0.92,0.065,0.87,0.025,comfort),[0,0.3325,0.005]);
  addIllustration('Sırt minderi dolgu anlatımı','fill',roundedBox(0.91,0.28,0.13,0.05,fill),[0,0.535,-0.37]);
  addIllustration('Gövde döşemesi','cover',roundedBox(0.98,0.26,1.04,0.035,cloth.clone()),[0,0.24,0]);
  addIllustration('Oturum döşemesi','cover',roundedBox(0.96,0.15,0.94,0.055,cloth),[0,0.345,0.015]);
  const backCover=roundedBox(0.96,0.345,0.23,0.06,cloth.clone());backCover.rotation.x=-0.07;
  addIllustration('Sırt döşemesi','cover',backCover,[0,0.515,-0.425]);
  addIllustration('Kol döşemesi','cover',roundedBox(0.20,0.40,1.01,0.045,cloth.clone()),[0.555,0.405,0]);
  // Existing neutral velvet render map is used only as a fine surface detail.
  const loader=new THREE.TextureLoader();
  loader.load('./assets/velvet/mora-neutral-detail-1024.png',texture=>{
    texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(3.5,3.5);texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
    for(const item of movable.filter(x=>x.role==='cover')){item.mesh.material.map=texture;item.mesh.material.needsUpdate=true;}renderNow();
  },undefined,()=>{});
}
function setOpacity(object,opacity) {
  object.visible=opacity>=0.1;
  object.traverse(node=>{if(!node.isMesh)return;for(const m of Array.isArray(node.material)?node.material:[node.material]){const transparent=opacity<0.995;if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true;}m.opacity=opacity;m.depthWrite=opacity>0.75;}});
}
function applyPose(p) {
  const coverLift=smooth(0,0.25,p), foamLift=smooth(0.18,0.46,p), springLift=smooth(0.37,0.63,p), skeleton=smooth(0.58,0.84,p), feet=smooth(0.82,1,p);
  for(const item of movable){
    item.mesh.position.copy(item.base);
    if(item.role==='cover'){
      item.mesh.position.y+=coverLift*0.65;item.mesh.position.x+=coverLift*(item.mesh.name.startsWith('Kol')?0.25:0);
    }else if(item.role==='foam')item.mesh.position.y+=foamLift*0.30;
    else if(item.role==='comfort')item.mesh.position.y+=foamLift*0.48;
    else if(item.role==='fill')item.mesh.position.y+=foamLift*0.30;
    else if(item.role==='springs')item.mesh.position.y+=springLift*0.23;
  }
  setOpacity(illustrationGroups.cover,1-smooth(0.25,0.43,p)*0.97);
  for(const role of ['foam','comfort','fill'])setOpacity(illustrationGroups[role],1-smooth(0.49,0.65,p)*0.97);
  setOpacity(illustrationGroups.springs,1-smooth(0.72,0.89,p)*0.92);
  for(const [key,group] of Object.entries(nativeGroups)){
    group.position.copy(group.userData.assembled);
    if(key==='frame')group.position.y+=feet*0.25;
    if(key==='back'){group.position.y+=skeleton*0.14+feet*0.25;group.position.z-=skeleton*0.12;}
    if(key==='arm'){group.position.x+=skeleton*0.15;group.position.y+=feet*0.25;}
    setOpacity(group,key==='foot'?1:1-feet*0.94);
  }
}
function currentBounds() {
  const box=new THREE.Box3();
  for(const group of Object.values(nativeGroups))if(group.visible)box.union(new THREE.Box3().setFromObject(group));
  for(const group of Object.values(illustrationGroups)){
    const first=group.children[0];if(group.visible&&first?.material.opacity>=0.1)box.union(new THREE.Box3().setFromObject(group));
  }
  return box;
}
function fitCamera(resetDirection=false) {
  if(!state.ready)return;
  const box=currentBounds(),center=box.getCenter(new THREE.Vector3()),dir=resetDirection?new THREE.Vector3(1.35,1.0,1.65).normalize():camera.position.clone().sub(controls.target).normalize();
  if(dir.lengthSq()<0.9)dir.set(1.35,1,1.65).normalize();
  camera.position.copy(center).add(dir);camera.lookAt(center);camera.updateMatrixWorld();
  const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
  const tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));let distance=0;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const q=new THREE.Vector3(x,y,z).sub(center);distance=Math.max(distance,Math.abs(q.dot(right))/(tan*camera.aspect)+q.dot(dir),Math.abs(q.dot(up))/tan+q.dot(dir));
  }
  camera.position.copy(center).addScaledVector(dir,distance*1.12);controls.target.copy(center);controls.update();camera.updateMatrixWorld();
}
function renderNow() {
  if(!renderer)return;renderer.render(scene,camera);state.frames++;
}
function updateCopy() {
  const stage=Math.min(5,Math.round(state.progress*5));state.stage=stage;
  heading.textContent=stages[stage][0];description.textContent=stages[stage][1];
  stageButtons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===stage)));
  progressInput.value=String(Math.round(state.progress*100));progressInput.setAttribute('aria-valuetext',stages[stage][0]);
  playButton.disabled=!state.ready||state.playing;pauseButton.disabled=!state.playing;
  status.textContent=state.ready?'3D görünüm hazır.':'İç yapı görünümü hazırlanıyor…';
  status.hidden=state.ready;
}
function seek(p,fit=true) {
  state.progress=THREE.MathUtils.clamp(Number(p)||0,0,1);applyPose(state.progress);updateCopy();
  if(fit&&!state.userOrbit)fitCamera();renderNow();
}
function pause() {state.playing=false;clearTimeout(timer);timer=0;updateCopy();}
function step() {
  if(!state.playing)return;
  const now=performance.now(),elapsed=(now-clock)/1000;clock=now;
  if(reduced.matches){const next=Math.min(1,(Math.floor(state.progress*5+0.0001)+1)/5);seek(next);}
  else seek(state.progress+elapsed/20);
  if(state.progress>=1){pause();return;}timer=setTimeout(step,reduced.matches?1600:40);
}
function play() {
  if(!state.ready||state.playing)return;
  if(state.progress>=1)seek(0);
  state.playing=true;clock=performance.now();updateCopy();timer=setTimeout(step,reduced.matches?1600:40);
}
function resize() {
  const rect=canvas.parentElement.getBoundingClientRect();if(rect.width<1||rect.height<1)return;
  width=rect.width;height=rect.height;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();if(!state.userOrbit)fitCamera();renderNow();
}
function snapshot() {
  const gl=renderer?.getContext(),debug=gl?.getExtension('WEBGL_debug_renderer_info');
  const actualParts=[];for(const [group,root] of Object.entries(nativeGroups))root.traverse(n=>{if(n.isMesh)actualParts.push({id:n.name,group,sourceId:n.userData.sourceId,sourceHandle:n.userData.sourceHandle});});
  const ndc=[];if(state.ready){const b=currentBounds();for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])ndc.push(new THREE.Vector3(x,y,z).project(camera).toArray());}
  return {...state,reducedMotion:reduced.matches,autoPlay:false,sourceGeometry:{woodParts:actualParts.filter(p=>p.group!=='foot').length,footParts:actualParts.filter(p=>p.group==='foot').length,total:actualParts.length,assemblyVerified:false,units:'metres',parts:actualParts},illustrativeGeometry:{springs:8,foamLayers:2,backCushion:true},camera:camera?{position:camera.position.toArray(),target:controls.target.toArray(),fov:camera.fov,aspect:camera.aspect}:null,projectedBounds:ndc.length?{minX:Math.min(...ndc.map(p=>p[0])),maxX:Math.max(...ndc.map(p=>p[0])),minY:Math.min(...ndc.map(p=>p[1])),maxY:Math.max(...ndc.map(p=>p[1]))}:null,orbitControls:controls?{rotate:controls.enableRotate,zoom:controls.enableZoom,pan:controls.enablePan,oneFinger:controls.touches.ONE,twoFingers:controls.touches.TWO}:null,viewport:{width,height},GPU:gl?{contextLost:gl.isContextLost(),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)}:null,nativeGroups:Object.fromEntries(Object.entries(nativeGroups).map(([k,g])=>[k,{position:g.position.toArray(),rotation:g.rotation.toArray(),scale:g.scale.toArray(),parts:g.children.filter(x=>x.isMesh).length}])),illustrativeVisibility:Object.fromEntries(Object.entries(illustrationGroups).map(([k,g])=>[k,{visible:g.visible,opacity:g.children[0]?.material.opacity}])),bounds:state.ready?{min:currentBounds().min.toArray(),max:currentBounds().max.toArray()}:null};
}
window.__soffInside={snapshot,seek:(p)=>{pause();seek(p);},play,pause,reset:()=>{pause();state.userOrbit=false;seek(0);fitCamera(true);renderNow();},render:renderNow,capture:()=>{renderNow();return canvas.toDataURL('image/png');},
  setView:(azimuth,elevation)=>{const d=camera.position.distanceTo(controls.target),v=new THREE.Vector3(Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation),Math.cos(azimuth)*Math.cos(elevation));camera.position.copy(controls.target).addScaledVector(v,d);fitCamera();renderNow();},
  captureAt:(p,w=1280,h=720,azimuth=0.68,elevation=0.48)=>{
    pause();const saved={w:width,h:height,ratio:renderer.getPixelRatio(),progress:state.progress,orbit:state.userOrbit,position:camera.position.clone(),target:controls.target.clone()};
    renderer.setPixelRatio(1);renderer.setSize(w,h,false);width=w;height=h;camera.aspect=w/h;camera.updateProjectionMatrix();state.userOrbit=false;seek(p);window.__soffInside.setView(azimuth,elevation);renderNow();const png=canvas.toDataURL('image/png');
    renderer.setPixelRatio(saved.ratio);renderer.setSize(saved.w,saved.h,false);width=saved.w;height=saved.h;camera.aspect=width/height;camera.updateProjectionMatrix();state.userOrbit=saved.orbit;seek(saved.progress,false);camera.position.copy(saved.position);controls.target.copy(saved.target);controls.update();renderNow();return png;
  }
};

async function init() {
  stageButtons.forEach(b=>b.disabled=true);playButton.disabled=true;pauseButton.disabled=true;
  try {
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'default',preserveDrawingBuffer:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=0.9;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    scene=new THREE.Scene();scene.background=new THREE.Color('#f6f1e8');
    camera=new THREE.PerspectiveCamera(34,1,0.02,30);camera.position.set(2.6,2,3.2);
    controls=new OrbitControls(camera,canvas);controls.enableDamping=false;controls.enablePan=true;controls.minDistance=0.65;controls.maxDistance=7;controls.minPolarAngle=0.18;controls.maxPolarAngle=Math.PI*0.78;
    controls.addEventListener('start',()=>{state.userOrbit=true;pause();});controls.addEventListener('change',renderNow);
    const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();environment=pmrem.fromScene(room,0.04);scene.environment=environment.texture;room.dispose();pmrem.dispose();
    scene.add(new THREE.HemisphereLight('#fff6e9','#a1a48f',1.35));
    const key=new THREE.DirectionalLight('#fff5e4',2.0);key.position.set(-2,4,3);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-2;key.shadow.camera.right=2;key.shadow.camera.top=2;key.shadow.camera.bottom=-2;key.shadow.normalBias=0.02;scene.add(key);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(20,20),material('#f1eadf'));ground.rotation.x=-Math.PI/2;ground.position.y=-0.006;ground.receiveShadow=true;scene.add(ground);
    const gltf=await new GLTFLoader().loadAsync('./assets/inside/v128/structure.glb');gltfRoot=gltf.scene;scene.add(gltfRoot);
    for(const groupName of ['frame','back','arm','foot']){
      const group=gltfRoot.getObjectByName(groupName);if(!group)throw new Error('Source group absent: '+groupName);
      group.position.copy(sourceOrigin).add(toGL(offsetMM[groupName]));group.userData.assembled=group.position.clone();nativeGroups[groupName]=group;
      group.traverse(mesh=>{if(!mesh.isMesh)return;const isMetal=groupName==='foot';
        if(!mesh.geometry.attributes.normal)mesh.geometry.computeVertexNormals();
        mesh.material=material(isMetal?'#76543a':'#b68c5a',{metalness:isMetal?0.25:0,roughness:isMetal?0.42:0.73,side:THREE.DoubleSide,flatShading:true});
        nativeMaterials.push(mesh.material);mesh.castShadow=true;mesh.receiveShadow=true;
      });
    }
    buildIllustrations();state.ready=true;stageButtons.forEach(b=>b.disabled=false);canvas.setAttribute('aria-label','SOFF iç yapı 3D görünümü. Sürükleyerek döndür; artı ve eksi ile yakınlaştır; ok tuşlarıyla katman seç.');
    stageButtons.forEach(b=>b.addEventListener('click',()=>{pause();state.userOrbit=false;seek(Number(b.dataset.insideStage)/5);}));
    progressInput.addEventListener('input',()=>{const requested=Number(progressInput.value)/100;pause();state.userOrbit=false;seek(requested);} );
    playButton.addEventListener('click',play);pauseButton.addEventListener('click',pause);resetButton.addEventListener('click',()=>window.__soffInside.reset());
    canvas.addEventListener('keydown',e=>{
      if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();pause();state.userOrbit=false;seek(e.key==='Home'?0:e.key==='End'?1:state.progress+(e.key==='ArrowRight'?0.2:-0.2));}
      if(['+','=','-'].includes(e.key)){e.preventDefault();const v=camera.position.clone().sub(controls.target);camera.position.copy(controls.target).add(v.multiplyScalar(e.key==='-'?1.12:0.89));state.userOrbit=true;controls.update();renderNow();}
    });
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();pause();state.error='context-lost';status.hidden=false;status.textContent='3D görünümü durdu. Sayfayı yenileyerek tekrar açabilirsin.';});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.playing)pause();});
    new ResizeObserver(resize).observe(canvas.parentElement);seek(0);resize();fitCamera(true);renderNow();
  }catch(error){state.error=String(error.message||error);state.ready=false;status.textContent='Bu tarayıcıda 3D görünümü açılamadı. Malzeme ve yapı bilgilerini aşağıdan inceleyebilirsin.';console.error('SOFF inside view load failed',error);}
}
init();
