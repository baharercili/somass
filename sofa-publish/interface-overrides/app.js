import {NEW_FABRICS,addNewFabricChoices} from './fabric-library.js?v=20261124-new-fabrics-v118';
import {getTableProfile} from './sofa-table-profiles.js?v=20261118-wood-modules-v65';
import {createSelectionHistory} from './workspace-history.js?v=20261123-square-corner-v2';
import {galleryHref,readGalleryState,CONFIG_STORAGE_KEY} from './combinations-state.js?v=20261124-new-fabrics-v118';
import {sanitizeCompositionOptions,getTablePositionChoices} from './table-composition.js?v=20261123-square-corner-v2';
import {DEFAULT_TABLE_DESIGN} from './sofa-table-designs.js?v=20261118-wood-modules-v65';
import * as THREE from 'three';
import { GLTFLoader } from './vendor/addons/loaders/GLTFLoader.js';
import { OrbitControls } from './vendor/addons/controls/OrbitControls.js';
import { RoomEnvironment } from './vendor/addons/environments/RoomEnvironment.js';
import { SofaMaterialSystem } from './fabric-material.js?v=20261124-realism-v128';
import { ModularLayout } from './modular-layout.js?v=20261123-square-corner-v2';
import { evaluateBackBounds } from './back-motion.js?v=20261122-open-travel-v95';
import { buildConsumerSummary, buildSelectionText } from './consumer-summary.js?v=20261124-new-fabrics-v118';
import {layoutFamily,layoutSide,layoutForFamily,layoutForSide,createPlacementGuide,shortPosition,validWoodModules,findWoodModuleSlot,reflowWoodModules} from './configuration-guide.js?v=20261123-square-corner-v2';
import {deriveModuleSequence,appendModule,removeModule,getCornerTableChoices,setCornerTable} from './module-chain.js?v=20261123-square-corner-v2';

const $ = (s) => document.querySelector(s);
const defaults = {body:'card-inci',accent:'card-bej',base:'oak',finish:'velvet',scene:'warm'};
const choices = {
 body:{ivory:{label:'Fildişi',color:'#dfd8ca'},sand:{label:'Kum',color:'#b7a18a'},sage:{label:'Adaçayı',color:'#7b8975'},terracotta:{label:'Kiremit',color:'#a4654f'},charcoal:{label:'Antrasit',color:'#41464a'}},
 accent:{taupe:{label:'Vizon',color:'#9e8b72'},cocoa:{label:'Kakao',color:'#604736'},olive:{label:'Zeytin',color:'#62694c'},ink:{label:'Gece',color:'#263646'},rust:{label:'Tarçın',color:'#a85f40'}},
 base:{oak:{label:'Naturel meşe',color:'#bc8f62'},'dark-oak':{label:'Koyu meşe',color:'#493324'},'black-oak':{label:'Siyah ahşap',color:'#242526'}},
 finish:{velvet:{label:'Mora kadife'}},
 scene:{warm:{label:'Sıcak stüdyo',color:'#e8e4dc'},light:{label:'Aydınlık',color:'#f1f2ef'},dark:{label:'Koyu stüdyo',color:'#343a3b'}}
};

const paletteData=await fetch('./assets/velvet/palette.json?v=20261117-soft-velvet-v58b').then(r=>r.json());
const cardSwatches=[...paletteData.swatches,...NEW_FABRICS.map(f=>({id:f.key,key:f.key,label:f.label,hex:f.hex,render_hex:f.renderHex,photo_chip:f.photoChip}))];
for(const swatch of cardSwatches){const entry={label:swatch.label,color:swatch.hex,renderColor:swatch.render_hex||swatch.hex,photoChip:swatch.photo_chip};const key=swatch.key||'card-'+swatch.id;choices.body[key]=entry;choices.accent[key]=entry;}
addNewFabricChoices(choices);
const layoutKeys=['straight2','straight3','corner-left','corner-right','chaise-left','chaise-right','single-left','single-right','single-both','dual-chaise'];

let storedConfig='{}';try{storedConfig=localStorage.getItem(CONFIG_STORAGE_KEY)||'{}';}catch{}
const state=readGalleryState(location.search,storedConfig,choices);
let activeTableId=state.tables?.[0]?.id||null;
let activeSeatId=null,appendType='seat',cornerDirection='left',moduleBuilderMessage='';
let model,box,size,center,controls,renderer,scene,camera,dimensionsGroup,shadow,environment;
let rendererInitialized=false,rendererResources=null,rendererProfile=null;
let ready=false,autoRotate=false,dimensionsVisible=false,toastTimer,initAttempt=0,exploded=false,currentView='quarter';
let materialSystem,modularLayout,sourceMaterial,paletteTarget='body',paletteFamily='all';
let currentStep='layout',layoutBusy=false,layoutRevision=0,reviewReturnFocus=null;
const selectionHistory=createSelectionHistory(state);
let restoringHistory=false,localSaveOK=false;
const stepOrder=['layout','tables','colors','wood'];
const workspaceCopy={layout:['Yerleşimini oluştur','Bir modül seç, sol veya sağ uca ekle.'],tables:['Ahşap modüllerini yerleştir','Modül ekle; her birinin formunu ve yerini ayrı seç.'],colors:['Kumaşını seç','Ana döşeme ve yastıklara ayrı renkler verebilirsin.'],wood:['Ahşap rengini seç','Alt kasa ve ahşap modülleri birlikte tamamla.']};
const nextStepLabels=['Ahşap modüle geç','Kumaşı seç','Ahşap rengini seç','Kaydet ve paylaş'];
const placementGuide=createPlacementGuide($('#table-placement-guide'));
const backProgress=0;
const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
const stage=$('#viewport');
const compactInterface=window.matchMedia('(max-width: 979px)');
function isCompactView(){return compactInterface.matches&&!document.fullscreenElement;}
function toast(message){const inReview=$('#selection-dialog')?.open,el=$(inReview?'#review-status':'#toast');if(!el)return;for(const other of document.querySelectorAll('#toast,#review-status'))other.classList.remove('visible');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3500);}
function setBusy(value){document.documentElement.dataset.modelReady=String(!value);if($('#loading'))$('#loading').hidden=!value;$('#loading')?.classList.toggle('hidden',!value);syncAvailability();}
function color(s){return new THREE.Color(s);}
const setText=(selector,value)=>{const el=$(selector);if(el&&el.textContent!==String(value))el.textContent=value;};
const selection=()=>buildConsumerSummary(state,choices);
function syncDimensionVisibility(){
 const visible=ready&&dimensionsVisible&&!exploded&&!layoutBusy;
 if(dimensionsGroup)dimensionsGroup.visible=visible;
 if($('#dimensions-note'))$('#dimensions-note').hidden=!visible;
 document.querySelectorAll('.dimension-label').forEach(el=>el.classList.toggle('hidden',!visible));
 syncToggle('#toggle-dimensions',dimensionsVisible&&!exploded);
}
function syncAvailability(){
 const available=ready&&!layoutBusy;
 for(const id of ['zoom-in','zoom-out','save-image','auto-rotate','explode-modules','reset-view','view-front','view-quarter','view-back','fullscreen'])if($('#'+id))$('#'+id).disabled=!available;
 if($('#toggle-dimensions'))$('#toggle-dimensions').disabled=!available||exploded;
 for(const id of ['continue-step','previous-step','open-review','share-config','download-selection','review-share'])if($('#'+id))$('#'+id).disabled=false;
 if($('#config-busy'))$('#config-busy').hidden=!layoutBusy;
 stage?.setAttribute('aria-busy',String(!ready||layoutBusy));
 document.documentElement.dataset.layoutBusy=String(layoutBusy);
 if(controls)controls.enabled=available;
 syncDimensionVisibility();syncWorkspace();
}
function setLayoutBusy(value){layoutBusy=value;syncAvailability();}
const paintBeforeLayout=()=>new Promise(resolve=>{
 let firstFrame,secondFrame,timer,finished=false;
 const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);if(firstFrame!==undefined)cancelAnimationFrame(firstFrame);if(secondFrame!==undefined)cancelAnimationFrame(secondFrame);resolve();};
 timer=setTimeout(finish,200);
 firstFrame=requestAnimationFrame(()=>{if(!finished)secondFrame=requestAnimationFrame(finish);});
});
function setStep(step,{focus=false}={}){
 if(!Object.hasOwn(workspaceCopy,step))return;const changed=currentStep!==step;currentStep=step;document.body.dataset.workspaceTool=step;
 document.querySelectorAll('[data-step-panel]').forEach(panel=>panel.hidden=panel.dataset.stepPanel!==step);
 const index=stepOrder.indexOf(step);
 document.querySelectorAll('[data-step]').forEach(button=>{const active=button.dataset.step===step;button.classList.toggle('is-active',active);button.classList.toggle('is-past',stepOrder.indexOf(button.dataset.step)<index);if(active)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
 setText('#continue-label',nextStepLabels[index]);setText('#step-progress',`${index+1} / ${stepOrder.length}`);setText('#workspace-title',workspaceCopy[step][0]);setText('#workspace-subtitle',workspaceCopy[step][1]);
 if($('#previous-step'))$('#previous-step').hidden=index===0;
 const scroll=$('#controls-scroll');if(scroll&&changed)scroll.scrollTo({top:0,behavior:'instant'});
 if(focus){const heading=$(`[data-step-panel="${step}"] h2`);if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}}
 syncAvailability();
}

function syncWorkspace(){
 const available=!layoutBusy,summary=selection();
 syncModuleBuilderAvailability();
 for(const [id,direction]of [['undo-config','undo'],['redo-config','redo']]){const button=$('#'+id);if(!button)continue;const can=direction==='undo'?selectionHistory.canUndo:selectionHistory.canRedo,label=direction==='undo'?selectionHistory.undoLabel:selectionHistory.redoLabel,verb=direction==='undo'?'Geri al':'Yeniden yap';button.disabled=!available||!can;button.title=verb+(label?': '+label:'')+' ('+(navigator.platform?.includes('Mac')?'⌘':'Ctrl')+(direction==='redo'?'⇧':'')+'Z)';button.setAttribute('aria-label',verb+(label?': '+label:''));}
 setText('#save-status',localSaveOK?'Bu cihazda kaydedildi':'Bağlantında korunuyor');
 document.dispatchEvent(new CustomEvent('studio:selection-change',{detail:{state:stateSnapshot(),ready,busy:layoutBusy,tool:currentStep,history:{canUndo:selectionHistory.canUndo,canRedo:selectionHistory.canRedo}}}));
}
async function travelHistory(direction){
 if(layoutBusy)return;const snapshot=direction==='undo'?selectionHistory.undo():selectionHistory.redo();if(!snapshot)return;
 restoringHistory=true;replaceSelection(readGalleryState('',snapshot,choices));moduleBuilderMessage='';exploded=false;applyState();restoringHistory=false;
 await refreshLayout();toast(direction==='undo'?'Son seçim geri alındı.':'Seçim yeniden uygulandı.');
}
function installCanvasSelection(canvas){
 const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let start=null;
 canvas.addEventListener('pointerdown',event=>{start=event.isPrimary&&event.button===0?{x:event.clientX,y:event.clientY,time:performance.now()}:null;});
 canvas.addEventListener('pointercancel',()=>{start=null;});
 canvas.addEventListener('pointerup',event=>{
  const down=start;start=null;if(!down||!ready||layoutBusy||document.fullscreenElement||Math.hypot(event.clientX-down.x,event.clientY-down.y)>6||performance.now()-down.time>650)return;
  const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
  const hit=raycaster.intersectObjects(model.children,true).find(item=>{if(item.object.userData.isSofaFootShadow)return false;let node=item.object;while(node){if(node.visible===false)return false;if(node===model)break;node=node.parent;}return true;});if(!hit||hit.object.userData.isSofaFoot)return;
  let table=hit.object;while(table&&table!==model&&!table.userData.isSofaTable)table=table.parent;
  if(table?.userData.isSofaTable){setStep('tables');let node=hit.object;while(node&&node!==model){const part=node.userData.compositionPart;if(part?.cornerConnector){selectSeatModule(part.moduleId);$('#corner-table-options')?.querySelector(`[data-corner-table-id="${part.moduleId}"]`)?.focus({preventScroll:true});break;}if(part?.tableId){selectWoodModule(part.tableId);break;}node=node.parent;}return;}
  if(hit.object.userData.continuousOakFrame||hit.object.userData.continuousFrameUnderside||hit.object.userData.standardFrameStrip||hit.object.userData.rearFrameExtension){setStep('wood');return;}
  const mask=hit.object.geometry?.getAttribute('sofaAccentRegion'),ids=hit.face?[hit.face.a,hit.face.b,hit.face.c]:[];
  paletteTarget=mask&&ids.length&&ids.reduce((sum,id)=>sum+mask.getX(id),0)/3>.5?'accent':'body';renderPalette();applyState();setStep('colors');
 });
}

function populateReview(summary=selection()){
 setText('#review-layout',summary.layoutLabel);setText('#review-size',(summary.dimensions.approximate?'Yaklaşık ':'')+summary.dimensionsLabel);
 const orientation=$('#review-orientation');if(orientation){orientation.textContent=summary.orientationHint;orientation.hidden=!summary.orientationHint;}
 const materials=$('#review-materials');if(materials){materials.replaceChildren();const rows=[['Kumaş',summary.materials.fabric],['Ana renk',summary.materials.body],['Küçük yastıklar',summary.materials.accent],['Ahşap',summary.materials.wood]];if(summary.tableCount)rows.push([summary.tableCount>1?'Ahşap modüller':'Ahşap modül',summary.tableDimensionsLabel]);if(summary.tablePositionLabel)rows.push(['Sehpa konumu',summary.tablePositionLabel]);for(const[label,value]of rows){const pair=document.createElement('div'),term=document.createElement('dt'),description=document.createElement('dd');term.textContent=label;description.textContent=value;pair.append(term,description);materials.append(pair);}}
 const modules=$('#review-modules');if(modules){modules.replaceChildren();for(const module of summary.moduleBreakdown){const item=document.createElement('li'),copy=document.createElement('div'),label=document.createElement('strong'),dimensions=document.createElement('small'),count=document.createElement('span');copy.className='module-review-copy';label.textContent=module.label;dimensions.textContent=`${module.approximate?'Yaklaşık ':''}${module.widthCm} × ${module.depthCm}${module.kind==='table'?' × '+module.heightCm:''} cm`;count.className='module-review-count';count.textContent=`${module.count} adet`;copy.append(label,dimensions);item.append(copy,count);modules.append(item);}}
 setText('#review-count',summary.countLabel);
 setText('#review-dimension-note',`${summary.dimensionOrder}. ${summary.dimensionNote}`);
}
function openReview(){
 const dialog=$('#selection-dialog');if(!dialog)return;populateReview();reviewReturnFocus=document.activeElement instanceof HTMLElement?document.activeElement:$('#continue-step');if($('#view-settings'))$('#view-settings').open=false;
 if(!dialog.open)dialog.showModal();
}
function closeReview(){const dialog=$('#selection-dialog');if(dialog?.open)dialog.close();}
function configUrl(){const url=new URL(location.href);url.search='';url.hash='';for(const key in defaults)url.searchParams.set(key,state[key]);url.searchParams.set('layout',state.layout);url.searchParams.set('extra',String(selection().additionalMiddleCount));url.searchParams.set('table',state.table);url.searchParams.set('terminal',state.terminal);url.searchParams.set('tableDesign',state.tableDesign);url.searchParams.set('tableVariant',state.tableVariant);url.searchParams.set('tablePosition',String(state.tablePosition));url.searchParams.set('tableDirection',state.tableDirection);url.searchParams.set('tables',JSON.stringify(woodEntries()));if(hasCustomModules()){url.searchParams.set('modules',JSON.stringify(state.modules));url.searchParams.set('moduleRotation',String(state.moduleRotation??0));}if(state.cornerTables?.length)url.searchParams.set('cornerTables',JSON.stringify(state.cornerTables));return url;}
function downloadSelection(){
 const summary=selection(),blob=new Blob([buildSelectionText(summary,{url:configUrl().href})],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='Koltuk-secimim.txt';document.body.append(link);link.click();link.remove();requestAnimationFrame(()=>URL.revokeObjectURL(url));toast('Seçim özeti kaydedildi.');
}

const rendererProfiles=[{id:'primary',antialias:true,powerPreference:'high-performance',pixelRatioCap:1.75},{id:'compatible',antialias:false,powerPreference:'low-power',pixelRatioCap:1.25}];
const rendererPixelRatio=profile=>Math.min(devicePixelRatio,profile.pixelRatioCap,isCompactView()?1.5:1.75);
function releaseRendererResources(owned){
 if(!owned)return;
 const safely=action=>{try{action();}catch{}};
 safely(()=>owned.renderer?.setAnimationLoop(null));safely(()=>owned.observer?.disconnect());safely(()=>owned.controls?.dispose());
 for(const resource of [owned.room,owned.pmrem,owned.environmentTarget,owned.shadowGeometry,owned.shadowMaterial,owned.shadowTexture])safely(()=>resource?.dispose());
 safely(()=>owned.renderer?.dispose());
 safely(()=>{if(owned.renderer)owned.renderer.forceContextLoss();else owned.canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();});
 safely(()=>owned.canvas?.remove());
}
function resetRendererResources(){
 const owned=rendererResources;rendererInitialized=false;rendererResources=null;rendererProfile=null;
 renderer=controls=scene=camera=shadow=environment=materialSystem=undefined;
 releaseRendererResources(owned);
}
function buildRendererResources(profile){
 const owned={profile};
 try{
  owned.canvas=document.createElement('canvas');
  owned.renderer=new THREE.WebGLRenderer({canvas:owned.canvas,antialias:profile.antialias,alpha:false,preserveDrawingBuffer:true,powerPreference:profile.powerPreference});
  const r=owned.renderer;r.setPixelRatio(rendererPixelRatio(profile));r.outputColorSpace=THREE.SRGBColorSpace;
  r.toneMapping=THREE.NeutralToneMapping;r.toneMappingExposure=.95;r.shadowMap.enabled=true;r.shadowMap.type=THREE.PCFSoftShadowMap;
  owned.canvas.setAttribute('aria-label','Kanepeyi sürükleyerek döndürün, tekerlek veya iki parmakla yakınlaştırın.');owned.canvas.setAttribute('role','img');owned.canvas.tabIndex=0;
  owned.materialSystem=new SofaMaterialSystem(r);owned.scene=new THREE.Scene();owned.camera=new THREE.PerspectiveCamera(34,1,.01,100);
  owned.controls=new OrbitControls(owned.camera,owned.canvas);const c=owned.controls;c.enableDamping=true;c.dampingFactor=.07;c.enablePan=false;c.minPolarAngle=.18;c.maxPolarAngle=Math.PI*.49;c.autoRotateSpeed=.65;
  c.addEventListener('start',()=>{if(rendererResources!==owned)return;if(autoRotate){autoRotate=false;c.autoRotate=false;syncToggle('#auto-rotate',false);}});
  owned.pmrem=new THREE.PMREMGenerator(r);owned.room=new RoomEnvironment();owned.environmentTarget=owned.pmrem.fromScene(owned.room,.04);owned.environment=owned.environmentTarget.texture;
  owned.scene.environment=owned.environment;owned.scene.environmentIntensity=.55;owned.room.dispose();owned.room=null;owned.pmrem.dispose();owned.pmrem=null;
  owned.scene.add(new THREE.HemisphereLight('#ffffff','#929292',.35));
  const key=new THREE.DirectionalLight('#ffffff',1.55);key.position.set(-3.5,4.5,3.5);key.castShadow=false;key.shadow.mapSize.set(2048,2048);key.shadow.normalBias=.003;key.shadow.bias=-.0001;
  Object.assign(key.shadow.camera,{left:-2,right:2,top:2,bottom:-2,near:.1,far:12});owned.scene.add(key);
  const fill=new THREE.DirectionalLight('#ffffff',.45);fill.position.set(3.5,2,-3);owned.scene.add(fill);
  const contactCanvas=document.createElement('canvas');contactCanvas.width=contactCanvas.height=256;const ctx=contactCanvas.getContext('2d');
  if(!ctx)throw new Error('Contact-shadow canvas unavailable');
  const gradient=ctx.createRadialGradient(128,128,0,128,128,128);gradient.addColorStop(0,'rgba(255,255,255,1)');gradient.addColorStop(.55,'rgba(255,255,255,.75)');gradient.addColorStop(.8,'rgba(255,255,255,.2)');gradient.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,256,256);
  owned.shadowTexture=new THREE.CanvasTexture(contactCanvas);owned.shadowGeometry=new THREE.PlaneGeometry(1,1);owned.shadowMaterial=new THREE.MeshBasicMaterial({color:'#514d45',map:owned.shadowTexture,opacity:.24,transparent:true,depthWrite:false});
  owned.shadow=new THREE.Mesh(owned.shadowGeometry,owned.shadowMaterial);owned.shadow.rotation.x=-Math.PI/2;owned.shadow.position.y=-.002;owned.scene.add(owned.shadow);
  const w=Math.max(1,Math.round(stage.clientWidth)),h=Math.max(1,Math.round(stage.clientHeight));r.setSize(w,h);owned.camera.aspect=w/h;owned.camera.updateProjectionMatrix();
  owned.observer=new ResizeObserver(()=>{if(rendererResources===owned&&rendererInitialized)resize();});owned.observer.observe(stage);
  r.setAnimationLoop(()=>{if(rendererResources!==owned||!ready)return;c.update();if(dimensionsVisible)updateDimensionLabels();r.render(owned.scene,owned.camera);});
  installCanvasSelection(owned.canvas);
  owned.canvas.addEventListener('webglcontextlost',event=>{
   if(rendererResources!==owned||!rendererInitialized)return;event.preventDefault();++initAttempt;++layoutRevision;ready=false;rendererInitialized=false;layoutBusy=false;
   setBusy(false);document.documentElement.dataset.modelReady='false';showLoadFailure('renderer');
  });
  owned.canvas.addEventListener('keydown',event=>{if(rendererResources!==owned||!ready)return;const t=.12;switch(event.key){case'ArrowLeft':orbit(-t);break;case'ArrowRight':orbit(t);break;case'+':case'=':zoom(.88);break;case'-':zoom(1.12);break;case'Home':setView('quarter');break;default:return;}event.preventDefault();});
  stage.prepend(owned.canvas);
  if(r.getContext().isContextLost())throw new Error('3D context lost during initialization');
  return owned;
 }catch(error){releaseRendererResources(owned);throw error;}
}
function createRenderer(){
 if(rendererInitialized)return;
 resetRendererResources();const failures=[];
 for(const profile of rendererProfiles){
  try{
   const owned=buildRendererResources(profile);
   rendererResources=owned;rendererProfile=profile;renderer=owned.renderer;controls=owned.controls;scene=owned.scene;camera=owned.camera;shadow=owned.shadow;environment=owned.environment;materialSystem=owned.materialSystem;
   document.documentElement.dataset.rendererProfile=profile.id;document.documentElement.dataset.interface=compactInterface.matches?'mobile':'desktop';
   rendererInitialized=true;return;
  }catch(error){failures.push(error);console.warn('Renderer initialization failed',profile.id,error);}
 }
 const error=new Error('3D renderer initialization failed',{cause:failures.at(-1)});error.initializationErrors=failures;throw error;
}
function orbit(a){const v=camera.position.clone().sub(controls.target);v.applyAxisAngle(new THREE.Vector3(0,1,0),a);camera.position.copy(controls.target).add(v);controls.update();}
function zoom(mult){const v=camera.position.clone().sub(controls.target).multiplyScalar(mult);v.clampLength(controls.minDistance,controls.maxDistance);camera.position.copy(controls.target).add(v);controls.update();}
function resize(){
 if(!renderer)return;
 const view=captureCameraView();
 const w=Math.max(1,Math.round(stage.clientWidth)),h=Math.max(1,Math.round(stage.clientHeight));
 document.documentElement.dataset.interface=compactInterface.matches?'mobile':'desktop';
 renderer.setPixelRatio(rendererPixelRatio(rendererProfile));
 renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();
 if(ready)restoreCameraView(view);
}
function installMaterial(original,geometry,options={}){return materialSystem.create(original,geometry,options);}
const withLoadPhase=(phase,run)=>Promise.resolve().then(run).catch(cause=>{const error=new Error('View loading failed during '+phase,{cause});error.loadPhase=phase;throw error;});
function showLoadFailure(phase){
 const graphics=phase==='renderer'||phase==='first-render',resource=phase==='model-resource'||phase==='fabric-resource'||phase==='modules';
 document.documentElement.dataset.modelErrorPhase=phase;
 setText('#load-error-title',graphics?'3B görünüm başlatılamadı':'Görünüm yüklenemedi');
 setText('#load-error-message',graphics?'Seçimlerin korundu. 3B görüntü bu pencerede başlatılamadı. Bağlantıyı Safari/Chrome’da açabilirsin.':resource?'Seçimlerin korundu. Görünüm dosyalarından biri yüklenemedi. Yeniden deneyebilirsin.':'Seçimlerin korundu. Yerleşimin görünümü hazırlanamadı. Yeniden deneyebilirsin.');
 if($('#load-browser-help'))$('#load-browser-help').hidden=!graphics;
 setText('#load-browser-status','');
 if($('#load-error'))$('#load-error').hidden=false;$('#load-error')?.classList.remove('hidden');
 syncAvailability();
}
async function loadModel(){
 const attempt=++initAttempt,previousModel=model;let phase='renderer';
 const enterPhase=value=>{phase=value;document.documentElement.dataset.modelLoadPhase=value;};
 ready=false;++layoutRevision;setLayoutBusy(false);setBusy(true);if($('#load-error'))$('#load-error').hidden=true;$('#load-error')?.classList.add('hidden');
 if($('#load-browser-help'))$('#load-browser-help').hidden=true;setText('#load-browser-status','');delete document.documentElement.dataset.modelErrorPhase;
 document.documentElement.dataset.modelLoadAttempt=String(attempt);enterPhase('renderer');
 try{
  if(!rendererInitialized)createRenderer();
  const activeMaterials=materialSystem;enterPhase('resources');
  const modelLoad=withLoadPhase('model-resource',()=>new GLTFLoader().loadAsync('./assets/sofa.glb',event=>{
   if(attempt!==initAttempt)return;const progress=event.total?Math.min(99,Math.round(event.loaded/event.total*100)):Math.min(95,Math.round(event.loaded/14218668*100));
   if($('#loading-progress')){$('#loading-progress').style.width=progress+'%';$('#loading-progress').setAttribute('aria-valuenow',progress);}setText('#loading-label',progress<98?`Model yükleniyor · %${progress}`:'Dokular hazırlanıyor…');
  }));
  const fabricLoad=withLoadPhase('fabric-resource',()=>activeMaterials.maps?.wood?undefined:activeMaterials.load());
  const [gltf]=await Promise.all([modelLoad,fabricLoad]);
  if(attempt!==initAttempt)return;
  const originalScene=gltf.scene;originalScene.traverse(o=>{if(o.isMesh&&!sourceMaterial)sourceMaterial=Array.isArray(o.material)?o.material[0]:o.material;});
  enterPhase('modules');const nextLayout=new ModularLayout(sourceMaterial,activeMaterials);await nextLayout.load();
  if(attempt!==initAttempt)return;
  enterPhase('layout');setText('#loading-label','Yerleşimin hazırlanıyor…');await paintBeforeLayout();if(attempt!==initAttempt)return;
  nextLayout.set(state.layout,state.extra,false,stateSnapshot());modularLayout=nextLayout;model=nextLayout.root;model.name='Preserved_Meshy_Modular_Sofa';
  /* Original visual master is available for verification; the library uses its unchanged outer surfaces. */
  if(previousModel&&previousModel!==model)scene.remove(previousModel);scene.add(model);
  activeMaterials.setBackProgress(backProgress);enterPhase('view');
  ready=true;updateModelBounds(evaluatePoseBounds(backProgress));setView('quarter');applyState();
  enterPhase('first-render');renderer.render(scene,camera);setBusy(false);document.documentElement.dataset.modelReady='true';enterPhase('ready');
  window.studioConfigurator={get state(){return stateSnapshot();},get ready(){return ready;},scene,model,renderer,camera,controls,get interfaceMode(){return compactInterface.matches?'mobile':'desktop';},setView,setOption,setCompositionOption,setCornerTable:changeCornerTable,addWoodModule,removeWoodModule,selectWoodModule,setLayout,setStep,addSeatModule,selectSeatModule,removeSeatModule:id=>{if(!deriveModuleSequence(state).some(module=>module.id===id))return false;selectSeatModule(id);return removeSelectedSeat();},undo:()=>travelHistory('undo'),redo:()=>travelHistory('redo'),get selectionHistory(){return {canUndo:selectionHistory.canUndo,canRedo:selectionHistory.canRedo,length:selectionHistory.length};},reset:resetConfig,get backProgress(){return backProgress;},get backMotion(){return {state:state.back,progress:backProgress,animating:false};},get originalGeometry(){return model.children;},get bounds(){return {width:size.x,depth:size.z,height:size.y};},get materialInfo(){return {pbrMaps:!!materialSystem.maps,finish:state.finish};}};
 }catch(error){
  if(attempt!==initAttempt)return;ready=false;const failedPhase=error.loadPhase||phase;
  console.error('Model load failed',failedPhase,error);if(failedPhase==='first-render')resetRendererResources();
  setBusy(false);document.documentElement.dataset.modelReady='false';showLoadFailure(failedPhase);
 }
}
function setView(view){
 if(!ready)return;currentView=view;controls.target.copy(center);controls.target.y=center.y-.015;let direction;
 const compact=isCompactView(),cameraSide=state.layout==='corner-right'?-1:1;
 if(view==='front')direction=new THREE.Vector3(0,compact?.20:.24,1);
 else if(view==='back')direction=compact?new THREE.Vector3(-.45*cameraSide,.40,-1):new THREE.Vector3(-.52*cameraSide,.48,-1);
 else direction=compact?new THREE.Vector3(.45*cameraSide,.34,1):new THREE.Vector3(.55*cameraSide,.40,1);
 direction.normalize();const distance=cameraFitDistance(direction);controls.maxDistance=Math.max(controls.maxDistance,distance*2);camera.position.copy(controls.target).add(direction.multiplyScalar(distance));controls.update();
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
 for(const [id,key] of [['#view-front','front'],['#view-quarter','quarter'],['#view-back','back']]){syncToggle(id,view===key);$(id)?.classList.toggle('is-active',view===key);}
}
function cameraFitDistance(direction){
 const right=new THREE.Vector3().crossVectors(camera.up,direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right).normalize();
 const tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanH=tanV*camera.aspect;let distance=0;
 for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z]){const v=new THREE.Vector3(x,y,z).sub(controls.target);distance=Math.max(distance,v.dot(direction)+Math.abs(v.dot(right))/tanH,v.dot(direction)+Math.abs(v.dot(up))/tanV);}
 return Math.max(.01,distance*1.12);
}
function captureCameraView(){
 if(!ready||!camera||!controls||!box)return null;
 const offset=camera.position.clone().sub(controls.target),distance=offset.length(),direction=offset.normalize();
 return {direction,zoom:distance/cameraFitDistance(direction)};
}
function restoreCameraView(view){
 if(!view){setView(currentView);return;}
 controls.target.copy(center);controls.target.y=center.y-.015;
 const fit=cameraFitDistance(view.direction),distance=Math.max(controls.minDistance,fit*view.zoom);
 controls.maxDistance=Math.max(controls.maxDistance,distance*1.2);camera.position.copy(controls.target).add(view.direction.clone().multiplyScalar(distance));controls.update();
}
function syncToggle(selector,on){const b=$(selector);if(b)b.setAttribute('aria-pressed',String(on));}
function applyState(){
 state.finish='velvet';Object.assign(state,sanitizeCompositionOptions(state.layout,state.extra,state));const summary=selection();state.extra=summary.additionalMiddleCount;
 for(const id of ['browse-combinations','review-combinations'])if($('#'+id))$('#'+id).href=galleryHref(state,choices);
 materialSystem?.apply(state,choices,false);
 modularLayout?.setTableFinish(state.base);
 if(scene){scene.background=color(choices.scene[state.scene].color);shadow.material.opacity=state.scene==='dark'?.45:.24;}
 document.querySelectorAll('[data-group][data-value]').forEach(b=>{const active=state[b.dataset.group]===b.dataset.value;b.setAttribute('aria-pressed',String(active));b.classList.toggle('is-active',active);b.classList.toggle('active',active);});
 document.querySelectorAll('[data-group-label]').forEach(el=>el.textContent=choices[el.dataset.groupLabel]?.[state[el.dataset.groupLabel]]?.label||'');
 const activeFabric=choices[paletteTarget][state[paletteTarget]],activeFamily=activeFabric.fabricSeries||'mora-f-evo',activeFamilyLabel=activeFabric.familyLabel||'Mora kadife',familyCount=cardSwatches.filter(swatch=>(choices.body[swatch.key||'card-'+swatch.id].fabricSeries||'mora-f-evo')===activeFamily).length;
 if($('#active-material'))$('#active-material').textContent=activeFamilyLabel;
 setText('#fabric-series-note',familyCount+' renk · 4 seride '+cardSwatches.length+' renk');
 const fabricAvatar=$('.fabric-note .fabric-texture');if(fabricAvatar){fabricAvatar.style.backgroundColor=activeFabric.color;fabricAvatar.style.backgroundImage=activeFabric.photoChip?`url("${activeFabric.photoChip}")`:'none';fabricAvatar.style.backgroundSize='cover';fabricAvatar.style.backgroundPosition='center';fabricAvatar.dataset.materialKey=state[paletteTarget];}
 if($('#selected-material-gallery'))$('#selected-material-gallery').href='./material-gallery.html?material='+encodeURIComponent(state[paletteTarget]);
 if($('#selection-summary'))$('#selection-summary').textContent=`${choices.body[state.body].label} · ${choices.accent[state.accent].label} · ${choices.base[state.base].label}`;
 syncLayoutControls(summary);
 syncCompositionControls(summary);
 setText('#layout-summary',`${summary.layoutLabel} · ${summary.countLabel}`);
 setText('#stage-layout-label',summary.tableCount?`${summary.layoutLabel} · ${summary.seatCount} modül · ${summary.tableCount} sehpa`:summary.layoutLabel);setText('#layout-footprint',summary.footprintLabel);setText('#layout-module-count',summary.countLabel);
 setText('#measure-label',summary.dimensions.approximate?'Yaklaşık toplam dış ölçü':'Toplam dış ölçü');
 setText('#layout-detail',`Yükseklik ${summary.dimensions.heightCm} cm · Oturum yüksekliği ${summary.dimensions.seatHeightCm} cm${summary.orientationHint?' · '+summary.orientationHint:''}`);
 setText('#footer-layout',summary.layoutLabel);setText('#footer-size',(summary.dimensions.approximate?'≈ ':'')+summary.footprintLabel);
 setText('#dimension-note-title',summary.dimensions.approximate?'Yaklaşık toplam dış ölçü':'Toplam dış ölçü');setText('#dimension-note-value',summary.footprintLabel);
 for(const[group,prefix]of [['body','body'],['accent','accent']]){const chosen=choices[group][state[group]];setText(`#${prefix}-color-name`,chosen.label);const dot=$(`#${prefix}-color-dot`);if(dot){dot.style.backgroundColor=chosen.color;dot.style.backgroundImage=chosen.photoChip?`url("${chosen.photoChip}")`:'';dot.style.backgroundSize='cover';dot.style.setProperty('--swatch',chosen.color);}}
 setText('#stage-hint span',exploded?'Modüller inceleme için ayrı gösteriliyor.':compactInterface.matches?'Sürükle, döndür · Dokun, seçenekleri aç':'Sürükle, döndür · Parçaya tıkla, seçenekleri aç');
 syncToggle('#explode-modules',exploded);
 document.querySelectorAll('[data-palette-target]').forEach(b=>{const active=b.dataset.paletteTarget===paletteTarget;b.setAttribute('aria-pressed',String(active));b.classList.toggle('is-active',active);});
 if($('#selection-dialog')?.open)populateReview(summary);
 localSaveOK=false;try{localStorage.setItem(CONFIG_STORAGE_KEY,JSON.stringify(state));localSaveOK=true;}catch{}
 if(!restoringHistory)selectionHistory.record(state);
 try{const url=configUrl();if(url.href!==location.href)history.replaceState(null,'',url.href);}catch{}
 syncAvailability();
}
function compositionControlValue(group,value){return group==='tablePosition'?(['return','left-end','right-end'].includes(value)?value:Number(value)):value;}
function syncLayoutControls(summary=selection()){
 const family=layoutFamily(state.layout),side=layoutSide(state.layout),custom=hasCustomModules(),single=family==='single'&&!custom;
 for(const button of document.querySelectorAll('[data-layout-family]')){const active=!custom&&button.dataset.layoutFamily===family;button.setAttribute('aria-pressed',String(active));button.classList.toggle('is-active',active);}
 for(const button of document.querySelectorAll('[data-layout-side]')){const active=button.dataset.layoutSide===side;button.hidden=button.dataset.layoutSide==='both'&&!single;button.textContent=button.dataset.layoutSide==='both'?'Çift kol':button.dataset.layoutSide==='left'?(single?'Sol kol':'Sol'):(single?'Sağ kol':'Sağ');button.setAttribute('aria-pressed',String(active));button.classList.toggle('is-active',active);}
 for(const button of document.querySelectorAll('[data-layout]')){const active=!custom&&family==='straight'&&summary.seatCount===(button.dataset.layout==='straight2'?2:3);button.setAttribute('aria-pressed',String(active));button.classList.toggle('is-active',active);}
 if($('#layout-side-control'))$('#layout-side-control').hidden=custom||!['corner','chaise','single'].includes(family);
 setText('#layout-side-heading',single?'Kol seçimi':'Hangi yönde olsun?');
 const sideOptions=$('#layout-side-options');if(sideOptions){sideOptions.setAttribute('aria-label',single?'Kol seçenekleri':'Koltuk yönü');sideOptions.style.gridTemplateColumns=single?'repeat(3,minmax(0,1fr))':'';}
 if($('#straight-size-control'))$('#straight-size-control').hidden=custom||family!=='straight';
 if($('#preset-reset-note'))$('#preset-reset-note').hidden=!custom;
 syncModuleBuilder();
}
function hasCustomModules(){return Array.isArray(state.modules)&&state.modules.length>0;}
function replaceSelection(next){for(const key of Object.keys(state))if(!Object.hasOwn(next,key))delete state[key];Object.assign(state,next);delete state.moduleBuilderError;}
function stateSnapshot(){return {...state,...(Array.isArray(state.modules)?{modules:state.modules.map(module=>({...module}))}:{}),...(Array.isArray(state.cornerTables)?{cornerTables:state.cornerTables.map(entry=>({...entry}))}:{}),tables:woodEntries()};}
function seatModuleLabel(type){return type==='chaise'?'Dinlenme':type==='corner-left'?'Sola dönen köşe':type==='corner-right'?'Sağa dönen köşe':'Oturum';}
function syncModuleBuilderAvailability(){
 for(const button of document.querySelectorAll('[data-add-seat],[data-corner-table-id]'))button.disabled=layoutBusy;
 if($('#remove-selected-module'))$('#remove-selected-module').disabled=layoutBusy||deriveModuleSequence(state).length<=1;
}
function syncModuleBuilder(){
 const modules=deriveModuleSequence(state),list=$('#seat-module-list');
 const cornerIds=new Set((state.cornerTables??[]).map(entry=>entry.moduleId)),labelFor=module=>cornerIds.has(module.id)?'Kare sehpalı köşe':seatModuleLabel(module.type);
 if(!modules.some(module=>module.id===activeSeatId))activeSeatId=modules[0]?.id||null;
 setText('#seat-module-count',`${modules.length} modül`);setText('#module-builder-status',moduleBuilderMessage);
 for(const button of document.querySelectorAll('[data-append-type]'))button.setAttribute('aria-pressed',String(button.dataset.appendType===appendType));
 for(const button of document.querySelectorAll('[data-corner-direction]'))button.setAttribute('aria-pressed',String(button.dataset.cornerDirection===cornerDirection));
 if($('#module-corner-direction'))$('#module-corner-direction').hidden=appendType!=='corner';
 const type=appendType==='corner'?'corner-'+cornerDirection:appendType;
 for(const button of document.querySelectorAll('[data-add-seat]'))button.setAttribute('aria-label',`${seatModuleLabel(type)} modülünü ${button.dataset.addSeat==='left'?'sol':'sağ'} uca ekle`);
 if(list){
  const signature=JSON.stringify([modules,[...cornerIds]]);
  if(list.dataset.signature!==signature){
   const focused=list.contains(document.activeElement)?document.activeElement.closest('[data-seat-id]')?.dataset.seatId:null,fragment=document.createDocumentFragment();
   modules.forEach((module,index)=>{
    const item=document.createElement('li'),button=document.createElement('button'),number=document.createElement('span'),copy=document.createElement('span'),label=document.createElement('strong'),position=document.createElement('small');
    button.type='button';button.className='seat-module-choice';button.dataset.seatId=module.id;button.setAttribute('aria-label',`${index+1}. modül: ${labelFor(module)} seç`);number.className='seat-module-number';number.textContent=String(index+1);copy.className='seat-module-copy';label.textContent=labelFor(module);position.textContent=modules.length===1?'Tek modül':index===0?'Sol uç':index===modules.length-1?'Sağ uç':'Ara modül';copy.append(label,position);button.append(number,copy);item.append(button);fragment.append(item);
   });
   list.replaceChildren(fragment);list.dataset.signature=signature;
   if(focused)list.querySelector(`[data-seat-id="${focused}"]`)?.focus({preventScroll:true});
  }
  for(const button of list.querySelectorAll('[data-seat-id]'))button.setAttribute('aria-pressed',String(button.dataset.seatId===activeSeatId));
 }
 const active=modules.find(module=>module.id===activeSeatId),index=modules.findIndex(module=>module.id===activeSeatId);
 setText('#selected-seat-label',active?`${index+1}. modül · ${labelFor(active)}`:'Bir modül seç');
 if($('#remove-selected-module'))$('#remove-selected-module').setAttribute('aria-label',active?`${index+1}. ${seatModuleLabel(active.type)} modülünü kaldır`:'Seçili modülü kaldır');
 syncModuleBuilderAvailability();
}
function selectSeatModule(id){if(!deriveModuleSequence(state).some(module=>module.id===id))return;activeSeatId=id;moduleBuilderMessage='';syncModuleBuilder();}
function commitModuleEdit(next,{activeId=activeSeatId,message='',focus=false}={}){
 if(next.moduleBuilderError){moduleBuilderMessage=next.moduleBuilderError;syncModuleBuilder();return false;}
 replaceSelection(next);activeSeatId=activeId;activeWoodModule();moduleBuilderMessage=message;exploded=false;applyState();void refreshLayout();
 if(focus)$('#seat-module-list')?.querySelector(`[data-seat-id="${activeSeatId}"]`)?.focus({preventScroll:true});
 return true;
}
function addSeatModule(side,type=appendType==='corner'?'corner-'+cornerDirection:appendType){
 if(layoutBusy)return false;const before=new Set(deriveModuleSequence(state).map(module=>module.id)),next=appendModule(stateSnapshot(),{side,type}),added=next.modules?.find(module=>!before.has(module.id));
 return commitModuleEdit(next,{activeId:added?.id??activeSeatId,message:`${seatModuleLabel(type)} ${side==='left'?'sol':'sağ'} uca eklendi.`});
}
function removeSelectedSeat(){
 if(layoutBusy)return false;const previous=deriveModuleSequence(state),index=previous.findIndex(module=>module.id===activeSeatId),next=removeModule(stateSnapshot(),activeSeatId),remaining=next.modules||previous;
 return commitModuleEdit(next,{activeId:remaining[Math.min(Math.max(0,index),remaining.length-1)]?.id,message:'Seçili modül kaldırıldı.',focus:true});
}
function woodEntries(){return (state.tables||[]).map(entry=>({...entry}));}
function activeWoodModule(){
 const entries=state.tables||[];
 if(!entries.some(entry=>entry.id===activeTableId))activeTableId=entries[0]?.id||null;
 return entries.find(entry=>entry.id===activeTableId)||null;
}
function woodLabel(entry){return getTableProfile(entry.type).label||'Ahşap modül';}
function commitWoodEntries(entries,{activeId=activeTableId}={}){
 const next=validWoodModules(state,entries);
 if(!next){toast('Bu değişiklik diğer ahşap modüllerle çakışıyor. Başka bir konum seçebilirsin.');return false;}
 Object.assign(state,next);activeTableId=activeId;activeWoodModule();exploded=false;applyState();void refreshLayout();return true;
}
function addWoodModule(type='rectangle'){
 const available=findWoodModuleSlot(state,type);
 if(!available){toast(state.layout==='single-both'&&!hasCustomModules()?'Çift kollu tekli koltukta iki kol da korunur. Kumaş seçimine geçebilirsin.':'Bu form için boş ve uygun konum kalmadı. Bir modülü kaldırabilir veya oturum ekleyebilirsin.');return false;}
 const changed=commitWoodEntries(available.options.tables,{activeId:available.entry.id});
 if(changed)$('#wood-module-editor')?.scrollIntoView?.({block:'start',behavior:reducedMotion?'instant':'smooth'});
 return changed;
}
function selectWoodModule(id){
 if(!(state.tables||[]).some(entry=>entry.id===id))return;
 activeTableId=id;syncCompositionControls();
 $('#wood-module-editor')?.scrollIntoView?.({block:'start',behavior:reducedMotion?'instant':'smooth'});
}
function removeWoodModule(id=activeTableId){
 const entries=woodEntries(),index=entries.findIndex(entry=>entry.id===id);if(index<0)return false;
 const fromList=$('#wood-module-list')?.contains(document.activeElement),remaining=entries.filter(entry=>entry.id!==id);
 const nextActive=activeTableId===id?remaining[Math.min(index,remaining.length-1)]?.id||null:activeTableId;
 const changed=commitWoodEntries(remaining,{activeId:nextActive});
 if(changed&&fromList){const next=$('#wood-module-list')?.querySelector(`[data-wood-id="${activeTableId}"]`)||$('#add-wood-module');next?.focus({preventScroll:true});}
 return changed;
}
function syncWoodModuleList(entries,active){
 const list=$('#wood-module-list');if(!list)return;
 const signature=JSON.stringify(entries.map(entry=>[entry.id,entry.type,entry.position]));
 if(list.dataset.signature!==signature){
  const fragment=document.createDocumentFragment();
  entries.forEach((entry,index)=>{
   const row=document.createElement('div'),select=document.createElement('button'),number=document.createElement('span'),copy=document.createElement('span'),label=document.createElement('strong'),position=document.createElement('small'),remove=document.createElement('button');
   row.className='wood-module-row';row.setAttribute('role','listitem');
   select.type='button';select.className='wood-module-select';select.dataset.woodId=entry.id;select.setAttribute('aria-controls','wood-module-editor');
   number.className='wood-module-number';number.textContent=String(index+1);copy.className='wood-module-copy';label.textContent=woodLabel(entry);position.textContent=shortPosition(entry.position);copy.append(label,position);select.append(number,copy);
   remove.type='button';remove.className='wood-module-remove';remove.dataset.removeWood=entry.id;remove.textContent='Kaldır';remove.setAttribute('aria-label',`${index+1}. ${woodLabel(entry)} seçimini kaldır`);
   row.append(select,remove);fragment.append(row);
  });
  list.replaceChildren(fragment);list.dataset.signature=signature;
 }
 for(const button of list.querySelectorAll('[data-wood-id]')){const selected=button.dataset.woodId===active?.id;button.setAttribute('aria-pressed',String(selected));button.classList.toggle('is-active',selected);}
}
function syncCompositionControls(summary=selection()){
 const entries=woodEntries(),active=activeWoodModule(),index=entries.findIndex(entry=>entry.id===active?.id),available=findWoodModuleSlot(state,'rectangle');
 syncCornerTableControls();
 syncWoodModuleList(entries,active);
 setText('#wood-module-count',`${entries.length+(state.cornerTables?.length??0)} ahşap modül`);
 if($('#wood-modules-empty'))$('#wood-modules-empty').hidden=entries.length>0||(state.cornerTables?.length??0)>0;
 if($('#wood-module-editor'))$('#wood-module-editor').hidden=!active;
 if($('#add-wood-module'))$('#add-wood-module').disabled=!available;
 setText('#wood-module-availability',state.layout==='single-both'&&!hasCustomModules()?'Çift kollu tekli koltukta iki kol da korunur; ara sehpa eklenmez. Kumaş seçimine geçebilirsin.':available?'Her modülün formunu ve konumunu ayrı ayrı değiştirebilirsin.':'Bu yerleşimde boş ve uygun konum kalmadı. Bir modülü kaldırabilir veya oturum ekleyebilirsin.');
 setText('#wood-editor-heading',active?`${index+1}. ahşap modülü düzenle`:'Ahşap modül');
 const modelInfo=$('#table-model-info');if(modelInfo)modelInfo.hidden=!active;
 const positionPicker=$('#table-position-picker');if(positionPicker)positionPicker.hidden=!active;
 placementGuide.update(state,choices,active?.id);
 if(!active){setText('#composition-availability-note',state.layout==='single-both'&&!hasCustomModules()?'Bu yerleşim tek oturum ve iki koldan oluşur.':'Bir koltukta birden fazla ahşap modül kullanabilirsin. Ekleyerek başla.');return;}
 const profile=getTableProfile(active.type),d=profile.dimensions,cm=value=>(value*100).toLocaleString('tr-TR',{maximumFractionDigits:1});
 setText('#table-model-title',woodLabel(active));
 setText('#table-model-dimensions',`${active.type==='angled'?'En geniş yer':'Genişlik'} ${cm(d.width)} · Derinlik ${cm(d.depth)} · Yükseklik ${cm(d.height)} cm`+(active.type==='angled'?' · 30° açılım':''));
 setText('#table-model-finish',choices.base[state.base].label+' · Bazayla aynı meşe rengi');
 const positionLabel=summary.tables?.find(entry=>entry.id===active.id)?.positionLabel||getTablePositionChoices(state.layout,state.extra,state).find(option=>option.value===active.position)?.label||'';
 setText('#table-position-current',positionLabel);
 for(const button of document.querySelectorAll('[data-composition-group][data-composition-value]')){
  const group=button.dataset.compositionGroup,value=compositionControlValue(group,button.dataset.compositionValue),selected=group==='table'?active.type===value:active.position===value;
  const candidate=entries.map(entry=>entry.id===active.id?{...entry,[group==='table'?'type':'position']:value}:entry);
  button.disabled=!validWoodModules(state,candidate);button.setAttribute('aria-pressed',String(selected));button.classList.toggle('is-active',selected);
 }
 setText('#composition-availability-note',['left-end','right-end'].includes(active.position)?'Seçili ahşap modül, kolsuz oturumun yanında kol görevi görür. Diğer ahşap modüllerin yerleri korunur.':'Çizimlerde koyu görünen parça seçili ahşap modüldür. Diğer modüller yerlerinde kalır.');
}
function syncCornerTableControls(){
 const section=$('#corner-table-section'),list=$('#corner-table-options'),options=getCornerTableChoices(state);
 if(!section||!list)return;section.hidden=options.length===0;
 const signature=JSON.stringify(options);
 if(list.dataset.signature!==signature){
  const focused=document.activeElement?.dataset.cornerTableId,focusedValue=document.activeElement?.dataset.cornerTableValue,fragment=document.createDocumentFragment();
  for(const option of options){
   const row=document.createElement('div'),label=document.createElement('p'),group=document.createElement('div');row.className='corner-table-choice';label.textContent=option.label;group.className='segmented-options';group.setAttribute('role','group');group.setAttribute('aria-label',option.label+' için modül');
   for(const [value,text]of [['seat','Döşemeli köşe'],['square','Kare ahşap sehpa']]){const button=document.createElement('button');button.type='button';button.dataset.cornerTableId=option.moduleId;button.dataset.cornerTableValue=value;button.textContent=text;button.setAttribute('aria-pressed',String(option.selected===(value==='square')));group.append(button);}
   row.append(label,group);fragment.append(row);
  }
  list.replaceChildren(fragment);list.dataset.signature=signature;
  if(focused)list.querySelector(`[data-corner-table-id="${focused}"][data-corner-table-value="${focusedValue}"]`)?.focus({preventScroll:true});
 }
 for(const button of list.querySelectorAll('button'))button.disabled=layoutBusy;
}
function changeCornerTable(moduleId,enabled){
 if(layoutBusy)return false;
 return commitModuleEdit(setCornerTable(stateSnapshot(),moduleId,enabled),{activeId:moduleId,message:enabled?'Köşe dönüşüne 95 × 95 cm kare ahşap sehpa yerleştirildi.':'Döşemeli köşe modülü yerleştirildi.'});
}
function setCompositionOption(group,value){
 if(!['table','tablePosition'].includes(group))return false;
 value=compositionControlValue(group,value);const active=activeWoodModule();
 if(group==='table'&&value==='none')return removeWoodModule();
 if(group==='table'&&!['angled','square','rectangle'].includes(value))return false;
 if(!active)return group==='table'?addWoodModule(value):false;
 if((group==='table'?active.type:active.position)===value)return true;
 const entries=woodEntries().map(entry=>entry.id===active.id?{...entry,[group==='table'?'type':'position']:value}:entry);
 return commitWoodEntries(entries);
}
function setOption(group,value){if(!choices[group]?.[value])return;state[group]=value;applyState();}
function resetConfig(){replaceSelection({...defaults,layout:'straight2',extra:0,back:'closed',table:'none',terminal:'none',tableDesign:DEFAULT_TABLE_DESIGN,tableVariant:'standard',tablePosition:0,tableDirection:'front',tables:[]});activeTableId=null;activeSeatId=null;moduleBuilderMessage='';exploded=false;materialSystem?.setBackProgress(0);setStep('layout',{focus:true});applyState();void refreshLayout();toast('Başlangıç seçimine dönüldü.');}
function arrangeWoodAfterLayout(entries){
 const result=reflowWoodModules(state,entries);Object.assign(state,sanitizeCompositionOptions(state.layout,state.extra,{...state,tables:result.tables}));
 return result;
}
function announceWoodReflow(result){
 if(result.removed.length)toast(`Yeni yerleşimde uygun konum kalmadığı için ${result.removed.length} ahşap modül kaldırıldı. Geri al ile önceki seçime dönebilirsin.`);
 else if(result.moved.length)toast('Ahşap modüllerin konumları yeni yerleşime uyarlandı.');
}
function setLayout(layout,{resetSize=false}={}){
 if(!layoutKeys.includes(layout))return;const custom=hasCustomModules();if(state.layout===layout&&!resetSize&&!custom)return;
 const entries=woodEntries();delete state.modules;delete state.moduleRotation;delete state.cornerTables;state.layout=layout;if(layout.startsWith('single')||resetSize||custom)state.extra=0;activeSeatId=null;moduleBuilderMessage='';
 const result=arrangeWoodAfterLayout(entries);exploded=false;applyState();void refreshLayout();announceWoodReflow(result);
}
function navigateStep(change){
 const index=stepOrder.indexOf(currentStep),next=index+change;
 if(next>=stepOrder.length){openReview();return;}
 if(next>=0)setStep(stepOrder[next],{focus:true});
}
async function refreshLayout(){
 const revision=++layoutRevision;if(!ready||!modularLayout)return;setLayoutBusy(true);
 await paintBeforeLayout();if(revision!==layoutRevision)return;
 try{
  const view=captureCameraView();
  modularLayout.set(state.layout,state.extra,exploded,stateSnapshot());materialSystem.setBackProgress(backProgress);
  updateModelBounds(evaluatePoseBounds(backProgress));restoreCameraView(view);applyState();renderer.render(scene,camera);
 }catch(error){console.error('Layout update failed',error);toast('Yerleşim güncellenemedi. Başka bir yerleşim seçerek yeniden deneyebilirsin.');}
 finally{if(revision===layoutRevision)setLayoutBusy(false);}
}
function evaluatePoseBounds(progress=backProgress){
 // CPU evaluator follows current morphs and the same weighted shader displacement.
 const bounds=evaluateBackBounds(model,progress);
 return bounds.isEmpty()?new THREE.Box3().setFromObject(model,true):bounds;
}
function updateModelBounds(next,{dimensions=true}={}){
 box=next.clone();size=box.getSize(new THREE.Vector3());center=box.getCenter(new THREE.Vector3());
 shadow.scale.set(size.x*1.25,size.z*1.3,1);shadow.position.set(center.x,-.002,center.z);
 const width=Math.max(size.x,size.z);controls.minDistance=width*.5;controls.maxDistance=width*3.2;
 if(dimensions)createDimensions();
}
function renderPalette(){
 const grid=$('#photo-palette');if(!grid)return;grid.replaceChildren();
 for(const swatch of cardSwatches){
  const b=document.createElement('button'),sample=document.createElement('span'),label=document.createElement('span'),check=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS('http://www.w3.org/2000/svg','use');
  const fabric=choices.body[swatch.key||'card-'+swatch.id];b.dataset.fabricFamily=fabric.fabricSeries||'mora-f-evo';b.dataset.fabricSearch=[swatch.label,fabric.familyLabel||'Mora kadife',fabric.shortCode,fabric.artCode].filter(Boolean).join(' ');b.type='button';b.dataset.group=paletteTarget;b.dataset.value=swatch.key||'card-'+swatch.id;b.style.setProperty('--swatch',swatch.hex);b.title=swatch.label;b.setAttribute('aria-label',swatch.label);b.setAttribute('aria-pressed',String(state[paletteTarget]===b.dataset.value));
  const rgb=swatch.hex.slice(1).match(/.{2}/g).map(value=>parseInt(value,16)/255),linear=rgb.map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4),luminance=linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
  b.style.setProperty('--check-color',luminance>.24?'#263126':'#ffffff');sample.className='palette-color-sample';if(swatch.photo_chip)sample.style.backgroundImage=`url("${swatch.photo_chip}")`;sample.style.color=luminance>.24?'#263126':'#ffffff';check.classList.add('icon');check.setAttribute('aria-hidden','true');use.setAttribute('href','#i-check');check.append(use);sample.append(check);label.className='palette-color-name';label.textContent=swatch.label;b.append(sample,label);grid.append(b);
 }
 if($('#palette-target'))$('#palette-target').textContent=paletteTarget==='body'?'Ana kumaş':'Kontrast yastıklar';
 filterPalette();
}
function filterPalette(){
 const normalize=value=>String(value).toLocaleLowerCase('tr-TR').replace(/ı/g,'i').normalize('NFD').replace(/[\u0300-\u036f]/g,''),query=normalize($('#palette-search')?.value||'').trim();let count=0;
 for(const button of document.querySelectorAll('#photo-palette button')){const visible=(paletteFamily==='all'||button.dataset.fabricFamily===paletteFamily)&&(!query||normalize(button.dataset.fabricSearch||button.getAttribute('aria-label')).includes(query));button.hidden=!visible;if(visible)count++;}
 for(const button of document.querySelectorAll('.palette-family-filters [data-fabric-family]'))button.setAttribute('aria-pressed',String(button.dataset.fabricFamily===paletteFamily));
 setText('#palette-count',query||paletteFamily!=='all'?`${count} / ${cardSwatches.length} renk`:`${cardSwatches.length} renk`);if($('#palette-empty'))$('#palette-empty').hidden=count!==0;
}
document.addEventListener('input',event=>{if(event.target.id==='palette-search')filterPalette();});
function dimensionAnchors(){const dimensions=selection().dimensions,cx=center?.x??0,cz=center?.z??0;return{...dimensions,minX:cx-dimensions.widthCm/200,maxX:cx+dimensions.widthCm/200,minZ:cz-dimensions.depthCm/200,maxZ:cz+dimensions.depthCm/200};}
function createDimensions(){
 if(dimensionsGroup){scene.remove(dimensionsGroup);dimensionsGroup.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}document.querySelectorAll('.dimension-label').forEach(el=>el.remove());
 dimensionsGroup=new THREE.Group();scene.add(dimensionsGroup);const nominal=dimensionAnchors();
 const lineMaterial=new THREE.LineBasicMaterial({color:'#8f8170',transparent:true,opacity:.7,depthTest:false});
 const y=.008,z=nominal.maxZ+.13,x=nominal.maxX+.14;
 const points=[new THREE.Vector3(nominal.minX,y,z),new THREE.Vector3(nominal.maxX,y,z),new THREE.Vector3(x,y,nominal.maxZ),new THREE.Vector3(x,y,nominal.minZ)];
 const geo=new THREE.BufferGeometry().setFromPoints(points);dimensionsGroup.add(new THREE.LineSegments(geo,lineMaterial));
 for(const [key,text] of [['width',`${nominal.widthCm} cm`],['depth',`${nominal.depthCm} cm`]]){const el=document.createElement('span');el.className='dimension-label';el.dataset.dimension=key;el.textContent=text;stage.append(el);}syncDimensionVisibility();
}
function updateDimensionLabels(){
 const nominal=dimensionAnchors();for(const [key,pos] of [['width',new THREE.Vector3((nominal.minX+nominal.maxX)/2,.01,nominal.maxZ+.14)],['depth',new THREE.Vector3(nominal.maxX+.15,.01,(nominal.minZ+nominal.maxZ)/2)]]){const v=pos.project(camera);const el=$(`[data-dimension="${key}"]`);if(el){el.style.left=(v.x*.5+.5)*stage.clientWidth+'px';el.style.top=(-v.y*.5+.5)*stage.clientHeight+'px';}}
}
async function saveImage(){if(!ready||layoutBusy){toast('Koltuğun hazırlanıyor…');return;}const dims=dimensionsGroup.visible;dimensionsGroup.visible=false;renderer.render(scene,camera);const a=document.createElement('a');a.download='Koltuk-secimim.png';a.href=renderer.domElement.toDataURL('image/png');a.click();dimensionsGroup.visible=dims;toast('Görsel kaydedildi.');}
async function shareConfig(){const url=configUrl();try{await navigator.clipboard.writeText(url.href);toast('Seçim bağlantısı kopyalandı.');}catch{const t=document.createElement('textarea'),previous=document.activeElement,dialog=$('#selection-dialog');t.value=url.href;t.style.position='fixed';t.style.opacity='0';(dialog?.open?dialog:document.body).append(t);t.select();const ok=document.execCommand('copy');t.remove();previous?.focus?.({preventScroll:true});toast(ok?'Seçim bağlantısı kopyalandı.':'Seçim bağlantısı adres çubuğuna eklendi.');if(!ok)history.replaceState(null,'',url);}}
async function copyBrowserLink(){
 const url=configUrl().href;let copied=false;
 try{await navigator.clipboard.writeText(url);copied=true;}catch{
  const field=document.createElement('textarea'),previous=document.activeElement;field.value=url;field.style.position='fixed';field.style.opacity='0';
  try{document.body.append(field);field.select();copied=document.execCommand('copy');}catch{}finally{field.remove();previous?.focus?.({preventScroll:true});}
 }
 if(!copied)history.replaceState(null,'',url);
 setText('#load-browser-status',copied?'Bağlantı kopyalandı.':'Seçim bağlantısı adres çubuğunda. Oradan kopyalayabilirsin.');
}

document.addEventListener('click',e=>{
 const settings=$('#view-settings');if(settings?.open&&!settings.contains(e.target))settings.open=false;
 const step=e.target.closest('[data-step]');if(step){setStep(step.dataset.step);return;}
 const family=e.target.closest('[data-layout-family]');if(family){setLayout(layoutForFamily(family.dataset.layoutFamily,state.layout));return;}
 const side=e.target.closest('[data-layout-side]');if(side){setLayout(layoutForSide(state.layout,side.dataset.layoutSide));return;}
 const layout=e.target.closest('[data-layout]');if(layout){setLayout(layout.dataset.layout,{resetSize:true});return;}
 const appendChoice=e.target.closest('[data-append-type]');if(appendChoice){appendType=appendChoice.dataset.appendType;moduleBuilderMessage='';syncModuleBuilder();return;}
 const cornerChoice=e.target.closest('[data-corner-direction]');if(cornerChoice){cornerDirection=cornerChoice.dataset.cornerDirection;moduleBuilderMessage='';syncModuleBuilder();return;}
 const addSeat=e.target.closest('[data-add-seat]');if(addSeat&&!addSeat.disabled){addSeatModule(addSeat.dataset.addSeat);return;}
 const selectedSeat=e.target.closest('[data-seat-id]');if(selectedSeat){selectSeatModule(selectedSeat.dataset.seatId);return;}
 const cornerTable=e.target.closest('[data-corner-table-id]');if(cornerTable&&!cornerTable.disabled){changeCornerTable(cornerTable.dataset.cornerTableId,cornerTable.dataset.cornerTableValue==='square');return;}
 const removeWood=e.target.closest('[data-remove-wood]');if(removeWood){removeWoodModule(removeWood.dataset.removeWood);return;}
 const selectedWood=e.target.closest('[data-wood-id]');if(selectedWood){selectWoodModule(selectedWood.dataset.woodId);return;}
 const composition=e.target.closest('[data-composition-group][data-composition-value]');if(composition&&!composition.disabled){setCompositionOption(composition.dataset.compositionGroup,composition.dataset.compositionValue);return;}
 const fabricFamily=e.target.closest('.palette-family-filters [data-fabric-family]');if(fabricFamily){paletteFamily=fabricFamily.dataset.fabricFamily;filterPalette();return;}
 const target=e.target.closest('[data-palette-target]');if(target){paletteTarget=target.dataset.paletteTarget;if($('#palette-search'))$('#palette-search').value='';renderPalette();applyState();return;}
 const option=e.target.closest('[data-group][data-value]');if(option){setOption(option.dataset.group,option.dataset.value);return;}
 const b=e.target.closest('button');if(!b)return;
 switch(b.id){
  case'view-front':setView('front');break;case'view-quarter':case'reset-view':setView('quarter');break;case'view-back':setView('back');break;
  case'add-wood-module':addWoodModule();break;
  case'remove-selected-module':removeSelectedSeat();break;
  case'explode-modules':if(ready&&!layoutBusy){exploded=!exploded;applyState();void refreshLayout();}break;
  case'auto-rotate':if(ready){autoRotate=!autoRotate;controls.autoRotate=autoRotate;syncToggle('#auto-rotate',autoRotate);}break;
  case'toggle-dimensions':if(ready&&!layoutBusy&&!exploded){dimensionsVisible=!dimensionsVisible;syncDimensionVisibility();if(dimensionsVisible)toast(selection().dimensions.approximate?'Yaklaşık toplam dış ölçüler gösteriliyor.':'Toplam dış ölçüler gösteriliyor.');}break;
  case'fullscreen':{const container=stage.closest('.stage')||stage;const action=document.fullscreenElement?document.exitFullscreen?.():container.requestFullscreen?.();if(action?.catch)action.catch(()=>toast('Bu tarayıcıda tam ekran açılamadı.'));else if(!action)toast('Bu tarayıcıda tam ekran desteklenmiyor.');break;}
  case'continue-step':navigateStep(1);break;case'previous-step':navigateStep(-1);break;case'open-review':openReview();break;
  case'undo-config':void travelHistory('undo');break;case'redo-config':void travelHistory('redo');break;
  case'zoom-in':if(ready&&!layoutBusy)zoom(.85);break;case'zoom-out':if(ready&&!layoutBusy)zoom(1/.85);break;
  case'close-review':case'edit-selection':closeReview();break;case'download-selection':downloadSelection();break;case'review-share':shareConfig();break;
  case'save-image':saveImage();break;case'share-config':shareConfig();break;case'reset-config':resetConfig();break;case'retry-load':loadModel();break;case'copy-browser-link':void copyBrowserLink();break;
 }
});
document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&!event.altKey&&!event.target.closest('input,textarea,select,[contenteditable=true]')&&!$('#selection-dialog')?.open){const key=event.key.toLowerCase();if(key==='z'||(key==='y'&&!event.metaKey)){event.preventDefault();void travelHistory(key==='y'||event.shiftKey?'redo':'undo');return;}}if(event.key==='Escape'&&!$('#selection-dialog')?.open&&$('#view-settings')?.open){$('#view-settings').open=false;$('#view-settings summary')?.focus();}});
const reviewDialog=$('#selection-dialog');
reviewDialog?.addEventListener('click',event=>{if(event.target!==reviewDialog)return;const box=reviewDialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)closeReview();});
reviewDialog?.addEventListener('close',()=>{if(reviewReturnFocus?.isConnected)reviewReturnFocus.focus({preventScroll:true});});
document.addEventListener('fullscreenchange',()=>requestAnimationFrame(resize));
compactInterface.addEventListener?.('change',()=>{applyState();resize();});
window.addEventListener('beforeunload',()=>renderer?.setAnimationLoop(null));
renderPalette();setStep('layout');applyState();loadModel();
