import {buildArmlessChaise,createArmlessChaiseFeet,ARMLESS_CHAISE_DIMENSIONS} from './armless-chaise.js?v=20261122-module-builder-v92';
import {buildDoubleArmSingle} from './double-arm-single.js?v=20261121-single-both-v86';
import {DEFAULT_TABLE_DESIGN} from './sofa-table-designs.js?v=20261118-wood-modules-v65';
import {createSofaTable,setSofaTableFinish} from './sofa-tables.js?v=20261121-black-oak-v74';
import {planSofaComposition,sanitizeCompositionOptions} from './table-composition.js?v=20261127-configurator-v180';
import {coverChaiseArmJoin} from './chaise-arm-joint-cover.js?v=20261112-arm-detail-v36c';
import {finishClosedContactEdges} from './closed-contact-edge-finish.js?v=20261112-contact-detail-v36b';
import {repairMiddleSeatSide} from './middle-seat-side-repair.js?v=20261112-middle-sides-v34d';
import {repairMiddleBackTerminals} from './middle-back-terminal-repair.js?v=20261122-open-travel-v95';
import {finishRearCornerSeamNormals} from './rear-corner-seam-normals.js?v=20261112-rear-case-v32';
import {removeRedundantChaiseTopFills} from './chaise-top-fill-cleanup.js?v=20261112-seat-fill-v29';
import {completeGeometryDrawRanges} from './complete-geometry-draw-ranges.js?v=20261112-static-v28';
import {alignChaiseArmRearStub} from './align-chaise-arm-stub.js?v=20261113-rear-join-v39e';
import {softenChaiseInnerSide} from './soften-chaise-inner-side.js?v=20261112-static-v28';
import {straightenCalibratedChaiseSeatSide} from './chaise-seat-side-outline.js?v=20261112-static-v28';
import {rebuildContinuousOakFrame} from './continuous-oak-frame.js?v=20261121-single-both-v86';
import {alignStandardSeatFront} from './standard-seat-front-alignment.js?v=20261112-static-v28';
import {fairStandardCornerGeometry} from './standard-corner-geometry.js?v=20261111-surface-v25';
import {finishStandardCornerNormals} from './standard-corner-finish-normals.js?v=20261111-surface-v25';
import {replaceStandardFrameStrip} from './standard-frame-strip.js?v=20261111-surface-v25';
import {extendRearFrame} from './rear-frame-extension.js?v=20261111-surface-v25';
import {markStandardFrameBoundary} from './standard-frame-material-boundary.js?v=20261111-surface-v25';
import {harmonizeChaiseRearShelf} from './rear-shelf-alignment.js?v=20261112-static-v28';
import { recoverChaiseJointEnvelope } from './chaise-joint-envelope.js?v=20261112-static-v28';
import { repairChaiseJointWoodNormals } from './chaise-joint-wood-normals.js?v=20261111-joint-wood-v24';
import * as THREE from 'three';
import { GLTFLoader } from './vendor/addons/loaders/GLTFLoader.js';
import { buildCornerUnit, loadCornerPillows } from './corner-unit.js?v=20261122-open-travel-v95';
import { BackMotion } from './back-motion.js?v=20261122-open-travel-v95';
import { createSofaFeet, SOFA_BODY_LIFT } from './sofa-feet.js?v=20261121-single-both-v86';
import { buildChaiseUnit } from './chaise-unit.js?v=20261112-static-v28';
import { calibrateModuleBody, getModuleDimensions } from './module-dimensions.js?v=20261121-single-both-v86';
import { buildCornerCadProfile } from './corner-cad-profile.js?v=20261122-open-travel-v95';
import { addCornerBackPair } from './corner-back-pair.js?v=20261122-open-travel-v95';
import { hideCornerCasePartitions } from './corner-case-partitions.js?v=20261110-corner-case-v2';
import { smoothCornerFrontSurface } from './corner-front-surface.js?v=20261117-soft-velvet-v58b';
import { alignCalibratedChaiseRim } from './chaise-side-closure.js?v=20261111-chaise-side-v23c';
import { restoreFixedSeatContactSurface } from './fixed-seat-contact-surface.js?v=20261112-static-v28';
const STANDARD_DEPTH=1.07, CORNER_TARGET={width:1.18,depth:1.18,height:.82,measured:true,provisional:false};

/** Standard exteriors come from the original Meshy model. Corner/chaise are prototypes. */
export class ModularLayout {
 constructor(originalMaterial,materialSystem){this.originalMaterial=originalMaterial;this.materialSystem=materialSystem;this.root=new THREE.Group();this.prototypes={};this.moduleCount=0;this.exploded=false;}
 async load(){
  const [gltf,meta]=await Promise.all([new GLTFLoader().loadAsync('./assets/modules/modules.glb'),fetch('./assets/modules/modules.json').then(r=>r.json())]);this.meta=meta;
  this.backMotion=new BackMotion();await this.backMotion.init(gltf);
  const cornerGltf=await new GLTFLoader().loadAsync('./assets/modules/corner-transition.glb');this.cornerWalls={L:cornerGltf.scene.getObjectByName('corner_transition_L'),R:cornerGltf.scene.getObjectByName('corner_transition_R')};this.cornerUnits={};
  this.cornerPillows=await loadCornerPillows();
  for(const name of ['end_L','end_R','middle','chaise_L','chaise_R']){
   const node=gltf.scene.getObjectByName(name);if(!node)throw new Error(`Modül bulunamadı: ${name}`);
   node.traverse(o=>{if(o.isMesh){const cap=(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.name.includes('Cap_Uniform'));o.material=this.materialSystem.create(this.originalMaterial,o.geometry,{cap});if(o.userData.sofaBackContactCap)o.material.side=o.userData.sofaPhysicalBackContact?THREE.FrontSide:THREE.DoubleSide;o.castShadow=false;o.receiveShadow=false;}});
   this.prototypes[name]=node;
  }
 }
 dimensions(name){if(name==='chaise_middle')return[ARMLESS_CHAISE_DIMENSIONS.width,ARMLESS_CHAISE_DIMENSIONS.height,ARMLESS_CHAISE_DIMENSIONS.depth];return getModuleDimensions(name,name.startsWith('corner_')?CORNER_TARGET:{});}
 withFeet(body,type,width,depth){
  const wrapper=new THREE.Group();wrapper.name='Module_'+type;wrapper.userData.moduleType=type;
  body.position.y+=SOFA_BODY_LIFT;body.userData.sofaPart='upholstery_and_frame';wrapper.add(body);
  wrapper.add(type==='chaise_middle'?createArmlessChaiseFeet(createSofaFeet,{width,depth}):createSofaFeet({type,width,depth}));return wrapper;
 }
 clone(name){
  const [width,,depth]=this.dimensions(name);this.calibratedUnits??={};
  if(name==='chaise_middle'){
   if(!this.calibratedUnits.chaise_middle){
    let body=calibrateModuleBody(buildArmlessChaise(this.prototypes.chaise_L),'middle',this.meta,ARMLESS_CHAISE_DIMENSIONS);
    body=restoreFixedSeatContactSurface(body,{minimumPatchArea:.0001});
    body=rebuildContinuousOakFrame(body,'middle',{minX:-.460,maxX:.460,front:.820,standardFront:.4535});
    body=repairMiddleSeatSide(body);
    body=repairMiddleBackTerminals(body,this.prototypes,this.meta,this.materialSystem,this.originalMaterial);
    body=finishClosedContactEdges(body);body=completeGeometryDrawRanges(body);
    body.userData.dimensionCalibration.name='chaise_middle';body.userData.moduleType='chaise_middle';
    this.calibratedUnits.chaise_middle=body;
   }
   return this.withFeet(this.calibratedUnits.chaise_middle.clone(true),name,width,depth);
  }
  if(name==='single_both'){
   if(!this.calibratedUnits.single_both){
    if(!this.calibratedUnits.end_L)this.clone('end_L');if(!this.calibratedUnits.end_R)this.clone('end_R');
    const body=buildDoubleArmSingle(this.calibratedUnits.end_L,this.calibratedUnits.end_R,{capMaterialFactory:geometry=>this.materialSystem.create(this.originalMaterial,geometry,{cap:true})});
    this.calibratedUnits.single_both=rebuildContinuousOakFrame(body,'single_both',{woodSource:this.calibratedUnits.end_L,minX:-.58,maxX:.58,standardFront:.4535,outerFrontRadius:.04});
   }
   return this.withFeet(this.calibratedUnits.single_both.clone(true),name,width,depth);
  }
  if(!this.calibratedUnits[name]){
   let body=this.prototypes[name];
   if(name.startsWith('chaise_'))body=buildChaiseUnit(name.endsWith('_R')?'R':'L',body);
   body=calibrateModuleBody(body,name,this.meta);
   if(name.startsWith('chaise_')){
    const side=name.endsWith('_R')?'R':'L';
    body=repairChaiseJointWoodNormals(recoverChaiseJointEnvelope(alignCalibratedChaiseRim(body,side),side),side);
   }
   body=restoreFixedSeatContactSurface(body,{minimumPatchArea:.0001});
   if(name.startsWith('end_')){
    const side=name.endsWith('_R')?'R':'L';
    body=finishStandardCornerNormals(fairStandardCornerGeometry(replaceStandardFrameStrip(body,side),side),side);
   }
   body=alignChaiseArmRearStub(harmonizeChaiseRearShelf(body));
   body=extendRearFrame(body,name);
   if(name.startsWith('end_'))body=markStandardFrameBoundary(body,name.endsWith('_R')?'R':'L');
   body=alignStandardSeatFront(body);
   if(name.startsWith('chaise_')){const side=name.endsWith('_R')?'R':'L';body=alignCalibratedChaiseRim(straightenCalibratedChaiseSeatSide(body,side),side);}
   body=rebuildContinuousOakFrame(body,name,{standardFront:.4535,chaiseAdvance:.015,chaiseInset:.015,armFront:.1535,outerFrontRadius:.04,...(name.endsWith('_R')?{maxX:.490}:name.endsWith('_L')?{minX:-.490}:{})});
   body=softenChaiseInnerSide(body);
   body=removeRedundantChaiseTopFills(body);
   if(name.startsWith('chaise_'))body=coverChaiseArmJoin(body,name.endsWith('_R')?'R':'L');
   if(name==='middle')body=repairMiddleSeatSide(body);
   if(name==='middle')body=repairMiddleBackTerminals(body,this.prototypes,this.meta,this.materialSystem,this.originalMaterial);
   body=finishClosedContactEdges(body);
   body=completeGeometryDrawRanges(body);
   if(name==='chaise_L')body=alignChaiseArmRearStub(body,{sides:['L']});
   this.calibratedUnits[name]=body;
  }
  return this.withFeet(this.calibratedUnits[name].clone(true),name,width,depth);
 }
 corner(side){
  if(!this.cornerUnits[side]){
   const source=buildCornerUnit(side,this.prototypes,this.cornerWalls[side],this.meta,this.materialSystem,this.originalMaterial,this.cornerPillows[side]);
   const body=smoothCornerFrontSurface(calibrateModuleBody(buildCornerCadProfile(source,side),'corner_'+side,this.meta,CORNER_TARGET),side);
   const paired=addCornerBackPair(body,side,this.prototypes,this.meta,this.materialSystem,this.originalMaterial);
   const framed=rebuildContinuousOakFrame(paired,'corner_'+side,{cornerTerminalProfile:{row:{run:.065,retreat:.032},return:{run:.025,retreat:.008}}});
   this.cornerUnits[side]=finishRearCornerSeamNormals(hideCornerCasePartitions(framed,side),side);
  }
  const [width,,depth]=this.dimensions('corner_'+side);
  const group=this.withFeet(this.cornerUnits[side].clone(true),'corner_'+side,width,depth);group.userData.provisional=false;
  return {object:group,width,depth};
 }
 setTableFinish(finish='oak'){
  this.tableFinish=finish==='black-oak'?'black-oak':finish==='dark-oak'?'dark-oak':'oak';
  for(const table of Object.values(this.tableUnits||{}))setSofaTableFinish(table,this.tableFinish,this.materialSystem);
 }
 table(type,side='L',design=DEFAULT_TABLE_DESIGN,variant='standard'){
  this.tableUnits??={};const key=type+'_'+side+'_'+design+'_'+variant;
  if(!this.tableUnits[key])this.tableUnits[key]=createSofaTable(type,this.materialSystem,{finish:this.tableFinish||'oak',side,design,variant});
  return this.tableUnits[key].clone(true);
 }
 set(layout='straight2',extra=0,exploded=false,options={}){
  const chosen=sanitizeCompositionOptions(layout,extra,options);
  if(chosen.modules?.length||chosen.table!=='none'||chosen.terminal!=='none'){
   const plan=planSofaComposition(layout,extra,{...chosen,exploded});
   this.root.clear();this.root.position.set(0,0,0);this.layout=plan.layout;this.extra=plan.extra;this.exploded=exploded;this.composition=plan;
   for(const part of plan.parts){
    const object=part.kind==='table'?this.table(part.type.replace('table_',''),part.side||'L',part.tableDesign||chosen.tableDesign,part.tableVariant||'standard'):part.type.startsWith('corner_')?this.corner(part.type.endsWith('_L')?'L':'R').object:this.clone(part.type);
    object.position.set(part.x,0,part.z);object.rotation.y=part.rotation;object.userData.compositionPart={type:part.type,kind:part.kind,role:part.role,...(part.moduleId?{moduleId:part.moduleId,logicalType:part.logicalType,chainIndex:part.chainIndex}:{}),...(part.kind==='table'?{tableId:part.tableId,tablePosition:part.tablePosition}:{}),...(part.cornerConnector?{cornerConnector:true,frontAligned:true}:{})};this.root.add(object);
   }
   this.moduleCount=plan.moduleCount;this.seatCount=plan.seatCount;this.tableCount=plan.tableCount;
   this.root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(this.root,true),centre=bounds.getCenter(new THREE.Vector3());this.root.position.x-=centre.x;this.root.position.z-=centre.z;this.root.updateMatrixWorld(true);return this.root;
  }
  this.composition=null;this.tableCount=0;

  this.root.clear();this.layout=layout;this.extra=extra;this.exploded=exploded;
  const row=[];let leg=null;
  const normal=(name)=>({object:this.clone(name),width:this.dimensions(name)[0],depth:this.dimensions(name)[2]});
  const addMiddles=(n)=>{for(let i=0;i<n;i++)row.push(normal('middle'));};
  if(layout==='single-both')row.push(normal('single_both'));
  else if(layout==='single-left')row.push(normal('end_L'));
  else if(layout==='single-right')row.push(normal('end_R'));
  else if(layout==='corner-left'){
   row.push(this.corner('L'));addMiddles(extra);row.push(normal('end_R'));leg={...normal('end_L'),side:'L'};
  }else if(layout==='corner-right'){
   row.push(normal('end_L'));addMiddles(extra);row.push(this.corner('R'));leg={...normal('end_R'),side:'R'};
  }else if(layout==='dual-chaise'){
   row.push(normal('chaise_L'));addMiddles(extra);row.push(normal('chaise_R'));
  }else{
   row.push(normal(layout==='chaise-left'?'chaise_L':'end_L'));
   addMiddles(extra+(layout==='straight3'?1:0));
   row.push(normal(layout==='chaise-right'?'chaise_R':'end_R'));
  }
  const gap=exploded?.075:0;const total=row.reduce((s,p)=>s+p.width,0)+gap*(row.length-1);let x=-total/2;
  for(const part of row){part.object.position.set(x+part.width/2,0,(part.depth-STANDARD_DEPTH)/2);this.root.add(part.object);part.x=part.object.position.x;x+=part.width+gap;}
  if(leg){const corner=leg.side==='L'?row[0]:row[row.length-1];leg.object.rotation.y=leg.side==='L'?Math.PI/2:-Math.PI/2;leg.object.position.set(corner.x+(leg.side==='L'?-1:1)*(corner.width-leg.depth)/2,0,corner.object.position.z+corner.depth/2+leg.width/2+gap);this.root.add(leg.object);}
  this.moduleCount=row.length+(leg?1:0);this.seatCount=this.moduleCount;
  this.root.updateMatrixWorld(true);
  // precise=true evaluates the actual morph weight, not the union of all targets.
  const b=new THREE.Box3().setFromObject(this.root,true);const c=b.getCenter(new THREE.Vector3());
  this.root.position.x-=c.x;this.root.position.z-=c.z;this.root.updateMatrixWorld(true);
  return this.root;
 }
}

