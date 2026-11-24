import * as THREE from 'three';
import {GLTFLoader} from './vendor/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from './vendor/addons/exporters/GLTFExporter.js';
import {SofaMaterialSystem} from './fabric-material.js?v=20261124-realism-v128';
import {ModularLayout} from './modular-layout.js?v=20261123-square-corner-v2';
import {createGalleryChoices,readGalleryState} from './combinations-state.js?v=20261124-new-fabrics-v118';
import {buildConsumerSummary} from './consumer-summary.js?v=20261124-new-fabrics-v118';
import {createExportMaterialAdapter} from './product-export-materials.js?v=20261124-realism-v128';

let resourcesPromise,exportQueue=Promise.resolve();
const abort=signal=>{if(signal?.aborted)throw new DOMException('İndirme iptal edildi.','AbortError');};
function waitForResources(promise,signal){
 if(!signal)return promise;abort(signal);
 return new Promise((resolve,reject)=>{const cancelled=()=>reject(new DOMException('İndirme iptal edildi.','AbortError'));signal.addEventListener('abort',cancelled,{once:true});promise.then(value=>{signal.removeEventListener('abort',cancelled);resolve(value);},error=>{signal.removeEventListener('abort',cancelled);reject(error);});});
}
async function resources(){
 if(!resourcesPromise)resourcesPromise=(async()=>{
  const [gltf,palette]=await Promise.all([new GLTFLoader().loadAsync('./assets/sofa.glb'),fetch('./assets/velvet/palette.json?v=20261117-soft-velvet-v58b',{credentials:'same-origin'}).then(response=>{if(!response.ok)throw new Error('Kumaş kartelası yüklenemedi.');return response.json();})]);
  let original;gltf.scene.traverse(node=>{if(node.isMesh&&!original)original=Array.isArray(node.material)?node.material[0]:node.material;});if(!original)throw new Error('Kaynak model okunamadı.');
  const materials=new SofaMaterialSystem({capabilities:{getMaxAnisotropy:()=>1}});await materials.load();const layout=new ModularLayout(original,materials);await layout.load();
  return {materials,layout,choices:createGalleryChoices(palette)};
 })().catch(error=>{resourcesPromise=null;throw error;});
 return resourcesPromise;
}

/** Build an export clone only. Never attach it to, or mutate, the live editor. */
export async function buildProductExportModel(product,{signal,onProgress}={}){
 abort(signal);onProgress?.({stage:'loading',progress:.05,message:'Ürün modeli hazırlanıyor…'});const {materials,layout,choices}=await waitForResources(resources(),signal);abort(signal);
 const state=readGalleryState('',product.state,choices);layout.setTableFinish(state.base);
 layout.set(state.layout,state.extra,false,{...state,tables:state.tables});materials.setBackProgress(0);materials.apply(state,choices);layout.setTableFinish(state.base);layout.root.updateMatrixWorld(true);
 onProgress?.({stage:'materials',progress:.35,message:'Malzemeler ve parçalar hazırlanıyor…'});abort(signal);
 const adapter=createExportMaterialAdapter(materials,choices,state);
 try{
  const result=await adapter.cloneModel(layout.root,{signal,onProgress});abort(signal);
  result.root.name='STUDIO_'+String(product.key||'Sofa').replace(/[^a-z\d_-]/gi,'_');
  const summary=buildConsumerSummary(state,choices);result.root.userData={units:'metres',productKey:product.key||null,title:product.title||summary.layoutLabel,configuration:state,dimensionsCm:summary.dimensions,materialProjection:result.metadata.projection};
  return {...result,state,summary,dispose:()=>adapter.dispose()};
 }catch(error){adapter.dispose();throw error;}
}

/** Lazy, serial browser export. Returns one GLB ArrayBuffer, in metres. */
export function exportProductGLB(product,options={}){
 const run=async()=>{
  const {signal,onProgress}=options;abort(signal);let model;
  try{
   model=await buildProductExportModel(product,options);abort(signal);onProgress?.({stage:'glb',progress:.72,message:'3D dosyası oluşturuluyor…'});
   const result=await new GLTFExporter().parseAsync(model.root,{binary:true,onlyVisible:true,trs:false,maxTextureSize:1024});abort(signal);
   if(!(result instanceof ArrayBuffer))throw new Error('3D dosyası oluşturulamadı.');
   onProgress?.({stage:'complete',progress:1,message:'3D dosyası hazır.',report:{...model.stats,bytes:result.byteLength,units:'metres',materialNote:model.metadata.projection}});return result;
  }finally{model?.dispose();}
 };
 const task=exportQueue.catch(()=>{}).then(run);exportQueue=task.catch(()=>{});return task;
}
