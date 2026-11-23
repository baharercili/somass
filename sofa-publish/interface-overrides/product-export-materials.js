import {fabricProfile,portableFabricMaps} from './fabric-appearance.js?v=20261124-new-fabrics-v118';
import * as THREE from 'three';

// Portable glTF has no onBeforeCompile/triplanar shader. This adapter preserves
// triangle surfaces and semantic dyes, then approximates the scan with a
// per-triangle dominant-axis UV projection and ordinary PBR maps.
const C=.787412,CSX=1.1741223484/.2842281705,CSY=1.1741223484/.2734999955,WS=1.1741223484/.6;
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const toLinear=x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
const toSRGB=x=>x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055;
const byte=x=>Math.round(Math.max(0,Math.min(1,x))*255);
const abort=signal=>{if(signal?.aborted)throw new DOMException('İndirme iptal edildi.','AbortError');};
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
const keptExtras=node=>({...(node.userData.moduleType?{moduleType:node.userData.moduleType}:{}),...(node.userData.compositionPart?{compositionPart:{...node.userData.compositionPart}}:{}),...(node.userData.tablePart?{tablePart:node.userData.tablePart}:{}),...(node.userData.footRole?{footRole:node.userData.footRole}:{})});
function transform(out,input){out.name=input.name;out.position.copy(input.position);out.quaternion.copy(input.quaternion);out.scale.copy(input.scale);out.matrix.copy(input.matrix);out.matrixAutoUpdate=input.matrixAutoUpdate;out.userData=keptExtras(input);return out;}

export function createExportMaterialAdapter(system,choices,state){
 const uniforms=new Map(system.records.map(record=>[record.material,record.uniforms]));
 const pixelCache=new WeakMap(),directMaterials=new WeakMap(),geometryCache=new WeakMap(),ownedTextures=new Set(),ownedMaterials=new Set(),sidedMaterials=new Map(),sampleUV=new THREE.Vector2();
 const dye=group=>new THREE.Color(choices[group][state[group]].renderColor||choices[group][state[group]].color);
 const dyes={body:dye('body'),accent:dye('accent'),wood:dye('base')};
 function pixels(texture){
  if(pixelCache.has(texture))return pixelCache.get(texture);
  const image=texture.image;if(!image)throw new Error('Model dokusu yüklenemedi.');
  const width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
  if(!(width&&height))throw new Error('Model dokusu okunamadı.');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,width,height);
  texture.updateMatrix();const result={data:ctx.getImageData(0,0,width,height).data,width,height};pixelCache.set(texture,result);return result;
 }
 function madeTexture(source,edit,name){
  const {data,width,height}=pixels(source),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d'),image=ctx.createImageData(width,height);
  for(let i=0;i<data.length;i+=4)edit(data,image.data,i);
  ctx.putImageData(image,0,0);const map=new THREE.CanvasTexture(canvas);map.name=name;map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.flipY=source.flipY;map.needsUpdate=true;ownedTextures.add(map);return map;
 }
 const velvetMap=role=>madeTexture(system.maps.albedo,(src,dst,i)=>{
  const detail=Math.max(.86,Math.min(1.14,1+(toLinear(src[i]/255)/C-1)*.55)),d=dyes[role];
  dst[i]=byte(toSRGB(Math.min(1,d.r*detail)));dst[i+1]=byte(toSRGB(Math.min(1,d.g*detail)));dst[i+2]=byte(toSRGB(Math.min(1,d.b*detail)));dst[i+3]=255;
 },'Mora_'+role+'_photographed_dye');
 const roughnessMap=madeTexture(system.maps.roughness,(src,dst,i)=>{const r=Math.max(.70,Math.min(.94,.82+(src[i+1]/255-.7215686)*.85));dst[i]=255;dst[i+1]=byte(r);dst[i+2]=0;dst[i+3]=255;},'Mora_portable_roughness');roughnessMap.colorSpace=THREE.NoColorSpace;
 const woodSource=system.maps.wood[state.base==='dark-oak'?'dark':'natural'];
 const blackMap=state.base==='black-oak'?madeTexture(woodSource.basecolor,(src,dst,i)=>{
  const grain=Math.max(.35,Math.min(1.85,(.2126*toLinear(src[i]/255)+.7152*toLinear(src[i+1]/255)+.0722*toLinear(src[i+2]/255))/.32)),d=dyes.wood;
  dst[i]=byte(toSRGB(d.r*grain));dst[i+1]=byte(toSRGB(d.g*grain));dst[i+2]=byte(toSRGB(d.b*grain));dst[i+3]=255;
 },'Black_stained_oak_grain'):null;
 const materials={};
 for(const role of ['body','accent']){
  const profile=fabricProfile(choices[role][state[role]]),familyMaps=profile?portableFabricMaps(THREE,choices[role][state[role]],dyes[role]):null;
  if(familyMaps)for(const texture of familyMaps)ownedTextures.add(texture);
  const material=new THREE.MeshPhysicalMaterial({color:0xffffff,map:familyMaps?.[0]||velvetMap(role),normalMap:familyMaps?.[1]||system.maps.normal,normalScale:new THREE.Vector2(familyMaps?1:.24,familyMaps?1:.24),roughness:1,roughnessMap:familyMaps?.[2]||roughnessMap,metalness:0,sheen:.45,sheenRoughness:.72,sheenColor:dyes[role],specularIntensity:familyMaps?.18:.30});
  material.name=profile?choices[role][state[role]].familyLabel+'_'+choices[role][state[role]].shortCode+'_'+role:(role==='body'?'Mora_Main_Upholstery':'Mora_Accent_Cushions');material.userData={role,finish:profile?choices[role][state[role]].familyLabel:'Mora velvet',...(profile?{fabricSeries:choices[role][state[role]].fabricSeries,artCode:choices[role][state[role]].artCode}:{}),colour:choices[role][state[role]].label,portablePBR:true};materials[role]=material;ownedMaterials.add(material);
 }
 const wood=new THREE.MeshPhysicalMaterial({color:0xffffff,map:blackMap||woodSource.basecolor,normalMap:woodSource.normal,roughnessMap:woodSource.roughness,roughness:1,metalness:0,specularIntensity:.42});wood.name='Oak_Frame_'+state.base;wood.userData={role:'wood',finish:state.base,portablePBR:true};materials.wood=wood;ownedMaterials.add(wood);
 function roleMaterial(role,side){if(side===materials[role].side)return materials[role];const key=role+':'+side;if(!sidedMaterials.has(key)){const m=materials[role].clone();m.side=side;ownedMaterials.add(m);sidedMaterials.set(key,m);}return sidedMaterials.get(key);}
 function directMaterial(source){
  if(directMaterials.has(source))return directMaterials.get(source);
  const material=source.clone();material.onBeforeCompile=()=>{};material.customProgramCacheKey=()=>'';material.userData={role:source.userData.isSofaTableWood?'wood':source.userData.isSofaFoot||source.userData.isSofaTableBronze?'bronze':'part',portablePBR:true};
  if(source.userData.isSofaTableWood){material.map=blackMap||source.map;material.color.set(0xffffff);}
  material.envMap=null;ownedMaterials.add(material);directMaterials.set(source,material);return material;
 }
 function materialClass(mesh,sourceMaterial,index){
  const u=uniforms.get(sourceMaterial),g=mesh.geometry,cap=u?.uCap?.value||0;
  const original=g.getAttribute('sofaOriginalPosition')||g.getAttribute('_source_position')||g.attributes.position;
  const marker=g.getAttribute('sofaFrameBoundary'),y=original.getY(index);
  let base=1-smooth(-.267,-.261,y);
  if(!cap&&sourceMaterial.map&&g.attributes.uv){
   const map=sourceMaterial.map,{data,width,height}=pixels(map),uv=sampleUV.fromBufferAttribute(g.attributes.uv,index);map.transformUv(uv);
   const at=(Math.min(height-1,Math.max(0,Math.floor(uv.y*height)))*width+Math.min(width-1,Math.max(0,Math.floor(uv.x*width))))*4;
   const r=toLinear(data[at]/255)*sourceMaterial.color.r,b=toLinear(data[at+2]/255)*sourceMaterial.color.b;
   base=Math.max(base,(1-smooth(.50,.64,b/Math.max(r,.0001)))*(1-smooth(-.20,-.16,y)));
  }
  if(marker){const weight=marker.getY(index);base=base*(1-weight)+(1-smooth(.1240,.1247,marker.getX(index)))*weight;}
  const accent=(g.getAttribute('sofaAccentRegion')?.getX(index)||0)*(1-cap);
  return [base,accent];
 }
 const metadata={projection:'Portable glTF approximates the web triplanar material using dominant-axis UVs. Geometry and semantic colours are preserved; fine textile sheen and multi-axis normal blending differ between renderers.',unit:'metre'};
 async function splitGeometry(mesh,signal){
  const source=mesh.geometry,sourceMaterial=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
  let cached=geometryCache.get(source);if(cached)return cached;
  const positions=source.attributes.position,normals=source.attributes.normal,index=source.index,count=index?index.count:positions.count;
  const start=Math.max(0,Math.floor((source.drawRange.start||0)/3)*3),end=Math.min(count,Number.isFinite(source.drawRange.count)?start+source.drawRange.count:count);
  const mask=new Float32Array(positions.count*2);
  for(let i=0;i<positions.count;i++){const m=materialClass(mesh,sourceMaterial,i);mask[i*2]=m[0];mask[i*2+1]=m[1];if(i%32768===0){abort(signal);await pause();}}
  const builders=new Map(),v=new THREE.Vector3();
  const morphing=mesh.morphTargetInfluences?.some(x=>x!==0);
  const position=id=>{if(morphing)return mesh.getVertexPosition(id,v).toArray();return [positions.getX(id),positions.getY(id),positions.getZ(id)];};
  let triangles=0;
  for(let at=start;at+2<end;at+=3){
   const ids=[0,1,2].map(k=>index?index.getX(at+k):at+k),base=ids.reduce((s,id)=>s+mask[id*2],0)/3,accent=ids.reduce((s,id)=>s+mask[id*2+1],0)/3;
   const role=base>.5?'wood':accent>.5?'accent':'body';let b=builders.get(role);if(!b){b={role,position:[],normal:[],uv:[],index:[],vertices:new Map()};builders.set(role,b);}
   const n=normals?ids.reduce((a,id)=>[a[0]+normals.getX(id),a[1]+normals.getY(id),a[2]+normals.getZ(id)],[0,0,0]):[0,1,0];
   const axis=Math.abs(n[0])>=Math.abs(n[1])&&Math.abs(n[0])>=Math.abs(n[2])?0:Math.abs(n[1])>=Math.abs(n[2])?1:2;
   for(const id of ids){const key=id+':'+axis;let next=b.vertices.get(key);if(next===undefined){next=b.vertices.size;b.vertices.set(key,next);const p=position(id);b.position.push(...p);b.normal.push(normals?normals.getX(id):0,normals?normals.getY(id):1,normals?normals.getZ(id):0);
     const uv=role==='wood'?(axis===0?[p[1]*WS,p[2]*WS]:axis===1?[p[2]*WS,p[0]*WS]:[p[1]*WS,p[0]*WS]):axis===0?[p[2]*CSX,p[1]*CSY]:axis===1?[p[0]*CSX,p[2]*CSY]:[p[0]*CSX,p[1]*CSY];b.uv.push(...uv);}
    b.index.push(next);
   }
   triangles++;if(triangles%32768===0){abort(signal);await pause();}
  }
  cached={triangles,parts:[...builders.values()].map(b=>{const g=new THREE.BufferGeometry();g.name=(source.name||mesh.name)+'_'+b.role;g.setAttribute('position',new THREE.Float32BufferAttribute(b.position,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(b.normal,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));g.setIndex(b.index);return {geometry:g,role:b.role};})};geometryCache.set(source,cached);return cached;
 }
 function directGeometry(source){
  let cached=geometryCache.get(source);if(cached?.direct)return cached.direct;
  const g=new THREE.BufferGeometry();for(const key of ['position','normal','uv','uv1','color','tangent'])if(source.attributes[key])g.setAttribute(key,source.attributes[key]);if(source.index)g.setIndex(source.index);for(const group of source.groups)g.addGroup(group.start,group.count,group.materialIndex);g.setDrawRange(source.drawRange.start,source.drawRange.count);g.name=source.name;
  geometryCache.set(source,{direct:g});return g;
 }
 async function cloneModel(model,{signal,onProgress}={}){
  const stats={moduleCount:model.children.length,sourceMeshes:0,exportMeshes:0,sourceTriangles:0,exportTriangles:0,excludedShadowMeshes:0,semanticParts:{body:0,accent:0,wood:0,other:0}};
  async function visit(node){
   abort(signal);if(node.visible===false)return null;
   if(node.userData.isSofaFootShadow||node.material?.name==='Foot_contact_shadow'){stats.excludedShadowMeshes++;return null;}
   let out;
   const material=Array.isArray(node.material)?node.material[0]:node.material;
   if(node.isMesh){stats.sourceMeshes++;
    if(uniforms.has(material)){
     out=transform(new THREE.Group(),node);const split=await splitGeometry(node,signal);stats.sourceTriangles+=split.triangles;
     for(const {geometry,role}of split.parts){const child=new THREE.Mesh(geometry,roleMaterial(role,material.side));child.name=(node.name||'Surface')+'__'+({body:'Main_Upholstery',accent:'Accent_Cushions',wood:'Oak_Frame'}[role]);child.userData={partRole:role};out.add(child);stats.exportMeshes++;stats.semanticParts[role]++;stats.exportTriangles+=geometry.index.count/3;}
    }else{
     const ms=Array.isArray(node.material)?node.material.map(directMaterial):directMaterial(node.material);out=transform(new THREE.Mesh(directGeometry(node.geometry),ms),node);stats.exportMeshes++;stats.semanticParts.other++;
     const total=node.geometry.index?.count||node.geometry.attributes.position.count,triangles=Math.max(0,Math.min(total-(node.geometry.drawRange.start||0),Number.isFinite(node.geometry.drawRange.count)?node.geometry.drawRange.count:total))/3;stats.sourceTriangles+=triangles;stats.exportTriangles+=triangles;
    }
   }else out=transform(new THREE.Group(),node);
   for(const child of node.children){const cloned=await visit(child);if(cloned)out.add(cloned);}
   return out;
  }
  const root=await visit(model);if(stats.sourceTriangles!==stats.exportTriangles)throw new Error('Model yüzey sayısı doğrulanamadı.');stats.meshCount=stats.exportMeshes;root.updateMatrixWorld(true);onProgress?.({stage:'geometry-ready',report:stats});return {root,stats,metadata};
 }
 function dispose(){for(const material of ownedMaterials)material.dispose();for(const texture of ownedTextures){texture.dispose();texture.image=null;}}
 return {cloneModel,dispose,metadata};
}
