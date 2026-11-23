import {FABRIC_GLSL,fabricProfile} from './fabric-appearance.js?v=20261124-new-fabrics-v118';
import { loadPillowFaceRegions, repairPillowFaceRegions } from './pillow-edge-repair.js?v=20261111-pillow-face-v24';
import * as THREE from 'three';
import { backMotionProfile, backDirectionVector, ensureBackWeight } from './back-motion.js?v=20261122-open-travel-v95';
import { loadAccentMask, applyAccentMask } from './accent-mask.js?v=20261110-accent-all-exclusion-v7';

/** Retained fine-pile PBR scan with independent photo-referenced render dyes; native geometry stays intact. */
export class SofaMaterialSystem {
 constructor(renderer){this.renderer=renderer;this.records=[];this.backProgress=0;this.backMotionUniforms={uBackLift:{value:0},uBackSlide:{value:0}};this.tile=new THREE.Vector2(.2842281705,.2734999955);}
 async load(){
  const loader=new THREE.TextureLoader();
  const [albedo,normal,roughness,accentLookup,pillowFaceRegions]=await Promise.all([
   loader.loadAsync('./assets/velvet/velvet-neutral-albedo-1024.png?v=20261117-soft-velvet-v58b'),
   loader.loadAsync('./assets/velvet/velvet-normal-1024.png'),
   loader.loadAsync('./assets/velvet/velvet-roughness-1024.png'),
   loadAccentMask(),
   loadPillowFaceRegions()
  ]);
  this.accentLookup=accentLookup;this.pillowFaceRegions=pillowFaceRegions;
  albedo.colorSpace=THREE.SRGBColorSpace;normal.colorSpace=roughness.colorSpace=THREE.NoColorSpace;
  for(const t of [albedo,normal,roughness]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());}
  this.maps={albedo,normal,roughness};
  const wood={};
  for(const variant of ['natural','dark']){
   const [basecolor,norm,rough]=await Promise.all([loader.loadAsync(`./assets/wood/${variant}-basecolor.png`),loader.loadAsync(`./assets/wood/${variant}-normal.png`),loader.loadAsync(`./assets/wood/${variant}-roughness.png`)]);
   basecolor.colorSpace=THREE.SRGBColorSpace;norm.colorSpace=rough.colorSpace=THREE.NoColorSpace;
   for(const t of [basecolor,norm,rough]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());}
   wood[variant]={basecolor,normal:norm,roughness:rough};
  }
  this.maps.wood=wood;
 }
 create(original,geometry,{cap=false,backDirection=[0,0,-1]}={}){
  cap=cap||geometry.userData.sofaBackContactCapKind==='fixed';
  const m=new THREE.MeshPhysicalMaterial();THREE.MeshStandardMaterial.prototype.copy.call(m,original);
  // Interior motion closures have interpolated UVs; the original baked atlas
  // belongs only to the scanned exterior. Keep their dye mask for pillows.
  if(cap||geometry.userData.sofaBackContactCapKind){for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap'])m[key]=null;m.color.set('#ffffff');}
  if(geometry.userData.sofaBackContactCapKind==='fixed'){m.polygonOffset=true;m.polygonOffsetFactor=-1;m.polygonOffsetUnits=-16;}
  m.envMapIntensity=.78;m.sheen=0;m.userData.sourceNormal=original.normalScale?.clone()||new THREE.Vector2(1,1);
  this.prepareGeometry(geometry);
  const motionDirection=backDirectionVector(backDirection);m.userData.sofaBackDirection=motionDirection;
  const wood=this.maps.wood.natural;
  const u={...this.backMotionUniforms,uBackDirection:{value:motionDirection},uBodyFabric:{value:0},uAccentFabric:{value:0},uBody:{value:new THREE.Color('#dfd8ca')},uAccent:{value:new THREE.Color('#9e8b72')},uBase:{value:new THREE.Color('#c9ae83')},uFlags:{value:new THREE.Vector3()},uFinish:{value:0},uCap:{value:cap?1:0},uVelvetAlbedo:{value:this.maps.albedo},uVelvetNormal:{value:this.maps.normal},uVelvetRoughness:{value:this.maps.roughness},uWoodAlbedo:{value:wood.basecolor},uWoodNormal:{value:wood.normal},uWoodRoughness:{value:wood.roughness},uWoodVariant:{value:0}};
  const moraCompile=shader=>{
   Object.assign(shader.uniforms,u);
   shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
    attribute vec3 sofaOriginalPosition;
    attribute float sofaBackWeight;
    uniform float uBackLift,uBackSlide;
    uniform vec3 uBackDirection;
    attribute float sofaAccentRegion;
    attribute vec2 sofaFrameBoundary;
    varying vec2 vSofaFrameBoundary;
    varying float vSofaAccentRegion;
    varying vec3 vSofaPosition;
    varying vec3 vSurfacePosition;
    varying vec3 vSurfaceNormal;
   `).replace('#include <begin_vertex>','#include <begin_vertex>\nvSofaPosition=sofaOriginalPosition;vSofaAccentRegion=sofaAccentRegion;vSofaFrameBoundary=sofaFrameBoundary;')
   .replace('#include <morphnormal_vertex>','#include <morphnormal_vertex>\nvSurfaceNormal=objectNormal;')
   .replace('#include <morphtarget_vertex>',`#include <morphtarget_vertex>
    vSurfacePosition=transformed;
    transformed+=(vec3(0.0,uBackLift,0.0)+uBackDirection*uBackSlide)*sofaBackWeight;
   `);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    varying vec3 vSofaPosition;
    varying vec3 vSurfacePosition;
    varying vec3 vSurfaceNormal;
    varying float vSofaAccentRegion;
    varying vec2 vSofaFrameBoundary;
    uniform vec3 uBody,uAccent,uBase,uFlags;
    uniform float uFinish,uCap,uWoodVariant;
    uniform sampler2D uVelvetAlbedo,uVelvetNormal,uVelvetRoughness;
    uniform sampler2D uWoodAlbedo,uWoodNormal,uWoodRoughness;
    vec3 sofaProjectionWeights(vec3 n){
     vec3 w=pow(abs(normalize(n)),vec3(4.0));
     return w/max(dot(w,vec3(1.0)),.000001);
    }
    vec4 sofaTriSample(sampler2D tex,vec2 uvX,vec2 uvY,vec2 uvZ,vec3 weights){
     return texture2D(tex,uvX)*weights.x+texture2D(tex,uvY)*weights.y+texture2D(tex,uvZ)*weights.z;
    }
    mat3 sofaTangentFrame(vec3 eyePosition,vec3 surfaceNormal,vec2 uv,float facing){
     vec3 q0=dFdx(eyePosition),q1=dFdy(eyePosition);
     vec2 st0=dFdx(uv),st1=dFdy(uv);
     vec3 q1perp=cross(q1,surfaceNormal),q0perp=cross(surfaceNormal,q0);
     vec3 t=q1perp*st0.x+q0perp*st1.x;
     vec3 b=q1perp*st0.y+q0perp*st1.y;
     float determinant=max(dot(t,t),dot(b,b));
     float factor=determinant>1e-20?inversesqrt(determinant):0.0;
     #if defined(DOUBLE_SIDED) && !defined(FLAT_SHADED)
      factor*=facing;
     #endif
     return mat3(t*factor,b*factor,surfaceNormal);
    }
    vec3 sofaTriNormal(sampler2D tex,vec2 uvX,vec2 uvY,vec2 uvZ,vec3 weights,float strength,vec3 baseNormal,float facing){
     vec3 nX=texture2D(tex,uvX).xyz*2.0-1.0;
     vec3 nY=texture2D(tex,uvY).xyz*2.0-1.0;
     vec3 nZ=texture2D(tex,uvZ).xyz*2.0-1.0;
     nX.xy*=strength;nY.xy*=strength;nZ.xy*=strength;
     vec3 viewX=normalize(sofaTangentFrame(-vViewPosition,baseNormal,uvX,facing)*nX);
     vec3 viewY=normalize(sofaTangentFrame(-vViewPosition,baseNormal,uvY,facing)*nY);
     vec3 viewZ=normalize(sofaTangentFrame(-vViewPosition,baseNormal,uvZ,facing)*nZ);
     return normalize(viewX*weights.x+viewY*weights.y+viewZ*weights.z);
    }
   `).replace('#include <map_fragment>',`#include <map_fragment>
    vec3 projectionWeights=sofaProjectionWeights(vSurfaceNormal);
    vec3 p=vSurfacePosition;
    vec2 clothScale=vec2(1.1741223484/.2842281705,1.1741223484/.2734999955);
    vec2 clothX=p.zy*clothScale,clothY=p.xz*clothScale,clothZ=p.xy*clothScale;
    float woodScale=1.1741223484/.6;
    vec2 woodX=p.yz*woodScale,woodY=p.zx*woodScale,woodZ=p.yx*woodScale;
    vec3 sofaSource=diffuseColor.rgb;
    float sofaLum=dot(sofaSource,vec3(.2126,.7152,.0722));
    float sofaWoodHue=1.0-smoothstep(.50,.64,sofaSource.b/max(sofaSource.r,.0001));
    float woodEdge=1.0-smoothstep(-.267,-.261,vSofaPosition.y);
    float sofaBaseMask=max(woodEdge,sofaWoodHue*(1.0-smoothstep(-.20,-.16,vSofaPosition.y))*(1.0-uCap));
    sofaBaseMask=mix(sofaBaseMask,1.0-smoothstep(.1240,.1247,vSofaFrameBoundary.x),vSofaFrameBoundary.y);
    float accentAa=max(fwidth(vSofaAccentRegion)*.75,.00001);
    float sofaAccentMask=smoothstep(.5-accentAa,.5+accentAa,vSofaAccentRegion)*(1.0-uCap);
    float sofaBodyMask=(1.0-sofaAccentMask)*(1.0-sofaBaseMask);
    vec3 recolored=mix(sofaSource,uBody*clamp(sofaSource/vec3(.9131,.7913,.6584),vec3(.2),vec3(1.7)),sofaBodyMask*uFlags.x);
    recolored=mix(recolored,uAccent*clamp(sofaSource/vec3(.3231,.2346,.1559),vec3(.15),vec3(2.5)),sofaAccentMask*uFlags.y);
    recolored=mix(recolored,uBase*clamp(sofaLum/.48,.2,1.6),sofaBaseMask*uFlags.z);
    if(uCap>.5)recolored=uBody;
    if(uFinish>1.5){
     // Retain the fine-pile scan's relative nap variation, independent of photo dye values.
     float scannedDetail=sofaTriSample(uVelvetAlbedo,clothX,clothY,clothZ,projectionWeights).r/.787412;
     scannedDetail=clamp(1.0+(scannedDetail-1.0)*.55,.86,1.14);
     vec3 cloth=mix(uBody,uAccent,sofaAccentMask)*(1.0*scannedDetail);
     // Hue-preserving reflectance bound; no saturation or hue remapping.
     float clothPeak=max(max(cloth.r,cloth.g),cloth.b);
     cloth*=min(1.0,1.0/max(clothPeak,.000001));
     recolored=mix(cloth,recolored,sofaBaseMask);
    }
    if(uWoodVariant>-.5&&sofaBaseMask>.001){
     vec3 woodColour=sofaTriSample(uWoodAlbedo,woodX,woodY,woodZ,projectionWeights).rgb;
     // Black stain keeps the oak's real grain while neutralising its warm dye.
     // Normal and roughness samples below remain the unchanged oak PBR scan.
     if(uWoodVariant>1.5)woodColour=uBase*clamp(dot(woodColour,vec3(.2126,.7152,.0722))/.32,.35,1.85);
     recolored=mix(recolored,woodColour,sofaBaseMask);
    }
    diffuseColor.rgb=recolored;
   `).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
    if(uFinish>1.5){
     float scannedRoughness=sofaTriSample(uVelvetRoughness,clothX,clothY,clothZ,projectionWeights).g;
     float velvetRoughness=clamp(.82+(scannedRoughness-.7215686)*.85,.70,.94);
     roughnessFactor=mix(velvetRoughness,roughnessFactor,sofaBaseMask);
    }
    else if(uFinish>.5)roughnessFactor=mix(.91,roughnessFactor,sofaBaseMask);
    if(uWoodVariant>-.5&&sofaBaseMask>.001)roughnessFactor=mix(roughnessFactor,sofaTriSample(uWoodRoughness,woodX,woodY,woodZ,projectionWeights).g,sofaBaseMask);
   `).replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
    if(uFinish>1.5||uWoodVariant>-.5)metalnessFactor=0.0;
   `).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
    if(uFinish>1.5 && sofaBaseMask<.5){
     normal=sofaTriNormal(uVelvetNormal,clothX,clothY,clothZ,projectionWeights,.24,nonPerturbedNormal,faceDirection);
    }
    if(uWoodVariant>-.5&&sofaBaseMask>.5){
     normal=sofaTriNormal(uWoodNormal,woodX,woodY,woodZ,projectionWeights,1.0,nonPerturbedNormal,faceDirection);
    }
   `).replace('#include <lights_physical_fragment>',`#include <lights_physical_fragment>
    if(uFinish>1.5){
     // Fuzz-covered cloth has a subdued underlying dielectric reflection.
     material.specularColor*=mix(.30,1.0,sofaBaseMask);
     #ifdef USE_SHEEN
      // Keep fine-pile detail with a broad low-reflection lobe; dye selection is independent.
      material.sheenColor*=mix(uBody,uAccent,sofaAccentMask)*(1.0-sofaBaseMask);
     #endif
    }
   `);
  };
  const familyCompile=shader=>{
   Object.assign(shader.uniforms,u);
   shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
    attribute vec3 sofaOriginalPosition;
    attribute float sofaBackWeight;
    uniform float uBackLift,uBackSlide;
    uniform vec3 uBackDirection;
    attribute float sofaAccentRegion;
    attribute vec2 sofaFrameBoundary;
    varying vec2 vSofaFrameBoundary;
    varying float vSofaAccentRegion;
    varying vec3 vSofaPosition;
    varying vec3 vSurfacePosition;
    varying vec3 vSurfaceNormal;
   `).replace('#include <begin_vertex>','#include <begin_vertex>\nvSofaPosition=sofaOriginalPosition;vSofaAccentRegion=sofaAccentRegion;vSofaFrameBoundary=sofaFrameBoundary;')
   .replace('#include <morphnormal_vertex>','#include <morphnormal_vertex>\nvSurfaceNormal=objectNormal;')
   .replace('#include <morphtarget_vertex>',`#include <morphtarget_vertex>
    vSurfacePosition=transformed;
    transformed+=(vec3(0.0,uBackLift,0.0)+uBackDirection*uBackSlide)*sofaBackWeight;
   `);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    varying vec3 vSofaPosition;
    varying vec3 vSurfacePosition;
    varying vec3 vSurfaceNormal;
    varying float vSofaAccentRegion;
    varying vec2 vSofaFrameBoundary;
    uniform vec3 uBody,uAccent,uBase,uFlags;
    ${FABRIC_GLSL}
    uniform float uFinish,uCap,uWoodVariant;
    uniform sampler2D uVelvetAlbedo,uVelvetNormal,uVelvetRoughness;
    uniform sampler2D uWoodAlbedo,uWoodNormal,uWoodRoughness;
    vec3 sofaProjectionWeights(vec3 n){
     vec3 w=pow(abs(normalize(n)),vec3(4.0));
     return w/max(dot(w,vec3(1.0)),.000001);
    }
    vec4 sofaTriSample(sampler2D tex,vec2 uvX,vec2 uvY,vec2 uvZ,vec3 weights){
     return texture2D(tex,uvX)*weights.x+texture2D(tex,uvY)*weights.y+texture2D(tex,uvZ)*weights.z;
    }
    mat3 sofaTangentFrame(vec3 eyePosition,vec3 surfaceNormal,vec2 uv,float facing){
     vec3 q0=dFdx(eyePosition),q1=dFdy(eyePosition);
     vec2 st0=dFdx(uv),st1=dFdy(uv);
     vec3 q1perp=cross(q1,surfaceNormal),q0perp=cross(surfaceNormal,q0);
     vec3 t=q1perp*st0.x+q0perp*st1.x;
     vec3 b=q1perp*st0.y+q0perp*st1.y;
     float determinant=max(dot(t,t),dot(b,b));
     float factor=determinant>1e-20?inversesqrt(determinant):0.0;
     #if defined(DOUBLE_SIDED) && !defined(FLAT_SHADED)
      factor*=facing;
     #endif
     return mat3(t*factor,b*factor,surfaceNormal);
    }
    vec3 sofaTriNormal(sampler2D tex,vec2 uvX,vec2 uvY,vec2 uvZ,vec3 weights,float strength,vec3 baseNormal,float facing){
     vec3 nX=texture2D(tex,uvX).xyz*2.0-1.0;
     vec3 nY=texture2D(tex,uvY).xyz*2.0-1.0;
     vec3 nZ=texture2D(tex,uvZ).xyz*2.0-1.0;
     nX.xy*=strength;nY.xy*=strength;nZ.xy*=strength;
     vec3 viewX=normalize(sofaTangentFrame(-vViewPosition,baseNormal,uvX,facing)*nX);
     vec3 viewY=normalize(sofaTangentFrame(-vViewPosition,baseNormal,uvY,facing)*nY);
     vec3 viewZ=normalize(sofaTangentFrame(-vViewPosition,baseNormal,uvZ,facing)*nZ);
     return normalize(viewX*weights.x+viewY*weights.y+viewZ*weights.z);
    }
   `).replace('#include <map_fragment>',`#include <map_fragment>
    vec3 projectionWeights=sofaProjectionWeights(vSurfaceNormal);
    vec3 p=vSurfacePosition;
    vec2 clothScale=vec2(1.1741223484/.2842281705,1.1741223484/.2734999955);
    vec2 clothX=p.zy*clothScale,clothY=p.xz*clothScale,clothZ=p.xy*clothScale;
    float woodScale=1.1741223484/.6;
    vec2 woodX=p.yz*woodScale,woodY=p.zx*woodScale,woodZ=p.yx*woodScale;
    vec3 sofaSource=diffuseColor.rgb;
    float sofaLum=dot(sofaSource,vec3(.2126,.7152,.0722));
    float sofaWoodHue=1.0-smoothstep(.50,.64,sofaSource.b/max(sofaSource.r,.0001));
    float woodEdge=1.0-smoothstep(-.267,-.261,vSofaPosition.y);
    float sofaBaseMask=max(woodEdge,sofaWoodHue*(1.0-smoothstep(-.20,-.16,vSofaPosition.y))*(1.0-uCap));
    sofaBaseMask=mix(sofaBaseMask,1.0-smoothstep(.1240,.1247,vSofaFrameBoundary.x),vSofaFrameBoundary.y);
    float accentAa=max(fwidth(vSofaAccentRegion)*.75,.00001);
    float sofaAccentMask=smoothstep(.5-accentAa,.5+accentAa,vSofaAccentRegion)*(1.0-uCap);
    float sofaBodyMask=(1.0-sofaAccentMask)*(1.0-sofaBaseMask);
    vec3 recolored=mix(sofaSource,uBody*clamp(sofaSource/vec3(.9131,.7913,.6584),vec3(.2),vec3(1.7)),sofaBodyMask*uFlags.x);
    recolored=mix(recolored,uAccent*clamp(sofaSource/vec3(.3231,.2346,.1559),vec3(.15),vec3(2.5)),sofaAccentMask*uFlags.y);
    recolored=mix(recolored,uBase*clamp(sofaLum/.48,.2,1.6),sofaBaseMask*uFlags.z);
    if(uCap>.5)recolored=uBody;
    if(uFinish>1.5){
     // Retain the fine-pile scan's relative nap variation, independent of photo dye values.
     float scannedDetail=sofaTriSample(uVelvetAlbedo,clothX,clothY,clothZ,projectionWeights).r/.787412;
     scannedDetail=clamp(1.0+(scannedDetail-1.0)*.55,.86,1.14);
     vec3 cloth=mix(uBody,uAccent,sofaAccentMask)*(1.0*scannedDetail);
     if(uBodyFabric>.5||uAccentFabric>.5){
      vec3 bodyCloth=uBody*scannedDetail,accentCloth=uAccent*scannedDetail;
      if(uBodyFabric>.5)bodyCloth=uBody*(1.0+sofaFamilyDetail(p,projectionWeights,uBodyFabric)*(uBodyFabric<1.5?.12:(uBodyFabric<2.5?.22:.24)));
      if(uAccentFabric>.5)accentCloth=uAccent*(1.0+sofaFamilyDetail(p,projectionWeights,uAccentFabric)*(uAccentFabric<1.5?.12:(uAccentFabric<2.5?.22:.24)));
      cloth=mix(bodyCloth,accentCloth,sofaAccentMask);
     }
     // Hue-preserving reflectance bound; no saturation or hue remapping.
     float clothPeak=max(max(cloth.r,cloth.g),cloth.b);
     cloth*=min(1.0,1.0/max(clothPeak,.000001));
     recolored=mix(cloth,recolored,sofaBaseMask);
    }
    if(uWoodVariant>-.5&&sofaBaseMask>.001){
     vec3 woodColour=sofaTriSample(uWoodAlbedo,woodX,woodY,woodZ,projectionWeights).rgb;
     // Black stain keeps the oak's real grain while neutralising its warm dye.
     // Normal and roughness samples below remain the unchanged oak PBR scan.
     if(uWoodVariant>1.5)woodColour=uBase*clamp(dot(woodColour,vec3(.2126,.7152,.0722))/.32,.35,1.85);
     recolored=mix(recolored,woodColour,sofaBaseMask);
    }
    diffuseColor.rgb=recolored;
   `).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
    if(uFinish>1.5){
     float scannedRoughness=sofaTriSample(uVelvetRoughness,clothX,clothY,clothZ,projectionWeights).g;
     float velvetRoughness=clamp(.82+(scannedRoughness-.7215686)*.85,.70,.94);
     roughnessFactor=mix(velvetRoughness,roughnessFactor,sofaBaseMask);
     float family=mix(uBodyFabric,uAccentFabric,step(.5,sofaAccentMask));
     if(family>.5){float familyRoughness=family<1.5?.87:(family<2.5?.90:.88);roughnessFactor=mix(clamp(familyRoughness+sofaFamilyDetail(vSurfacePosition,sofaProjectionWeights(vSurfaceNormal),family)*.04,.78,.96),roughnessFactor,sofaBaseMask);}
    }
    else if(uFinish>.5)roughnessFactor=mix(.91,roughnessFactor,sofaBaseMask);
    if(uWoodVariant>-.5&&sofaBaseMask>.001)roughnessFactor=mix(roughnessFactor,sofaTriSample(uWoodRoughness,woodX,woodY,woodZ,projectionWeights).g,sofaBaseMask);
   `).replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
    if(uFinish>1.5||uWoodVariant>-.5)metalnessFactor=0.0;
   `).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
    if(uFinish>1.5 && sofaBaseMask<.5){
     normal=sofaTriNormal(uVelvetNormal,clothX,clothY,clothZ,projectionWeights,.24,nonPerturbedNormal,faceDirection);
     float family=mix(uBodyFabric,uAccentFabric,step(.5,sofaAccentMask));
     if(family>.5){float bump=family<1.5?.00024:(family<2.5?.00055:.00075);normal=sofaFamilyNormal(nonPerturbedNormal,sofaFamilyDetail(vSurfacePosition,projectionWeights,family)*bump);}
    }
    if(uWoodVariant>-.5&&sofaBaseMask>.5){
     normal=sofaTriNormal(uWoodNormal,woodX,woodY,woodZ,projectionWeights,1.0,nonPerturbedNormal,faceDirection);
    }
   `).replace('#include <lights_physical_fragment>',`#include <lights_physical_fragment>
    if(uFinish>1.5){
     // Fuzz-covered cloth has a subdued underlying dielectric reflection.
     float family=mix(uBodyFabric,uAccentFabric,step(.5,sofaAccentMask));
     material.specularColor*=mix(family>.5?.18:.30,1.0,sofaBaseMask);
     #ifdef USE_SHEEN
      // Keep fine-pile detail with a broad low-reflection lobe; dye selection is independent.
      material.sheenColor*=mix(uBody,uAccent,sofaAccentMask)*(1.0-sofaBaseMask);
     #endif
    }
   `);
  };
  m.onBeforeCompile=shader=>(this.useNewFabricProfiles?familyCompile:moraCompile)(shader);
  m.customProgramCacheKey=()=>this.useNewFabricProfiles?'studio-families-woven-melange-boucle-v118':'studio-photo-colors-soft-velvet-black-oak-v74';
  this.records.push({material:m,uniforms:u});return m;
 }
 setBackProgress(progress){
  const profile=backMotionProfile(progress);this.backProgress=profile.progress;
  this.backMotionUniforms.uBackLift.value=profile.liftRaw;this.backMotionUniforms.uBackSlide.value=profile.slideRaw;
  return profile;
 }
 prepareGeometry(geometry){
  ensureBackWeight(geometry);
  // Preserve native coordinates before the existing tiny pillow-edge offsets.
  if(!geometry.hasAttribute('_source_position')&&!geometry.hasAttribute('source_position')&&!geometry.hasAttribute('_SOURCE_POSITION'))geometry.setAttribute('_source_position',geometry.attributes.position.clone());
  applyAccentMask(geometry,this.accentLookup);
  repairPillowFaceRegions(geometry,this.pillowFaceRegions);
  if(!geometry.hasAttribute('sofaFrameBoundary'))geometry.setAttribute('sofaFrameBoundary',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
  const mask=geometry.getAttribute('_sofa_accent_mask')||geometry.getAttribute('_SOFA_ACCENT_MASK');
  geometry.setAttribute('sofaAccentRegion',mask||new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count),1));
  if(geometry.hasAttribute('sofaOriginalPosition'))return;
  const p=geometry.attributes.position;
  const original=geometry.getAttribute('_source_position')||geometry.getAttribute('source_position')||geometry.getAttribute('_SOURCE_POSITION')||p;
  geometry.setAttribute('sofaOriginalPosition',original);
 }
 apply(state,choices,compare=false){
  const useNew=!compare&&Boolean(fabricProfile(choices.body[state.body])||fabricProfile(choices.accent[state.accent]));
  if(this.useNewFabricProfiles!==useNew){this.useNewFabricProfiles=useNew;for(const record of this.records)record.material.needsUpdate=true;}
  const finish=compare?0:({original:0,linen:1,velvet:2}[state.finish]);
  for(const {material:m,uniforms:u} of this.records){
   u.uBodyFabric.value=compare?0:(fabricProfile(choices.body[state.body])?.id??0);u.uAccentFabric.value=compare?0:(fabricProfile(choices.accent[state.accent])?.id??0);
   u.uBody.value.set(choices.body[state.body].renderColor||choices.body[state.body].color);u.uAccent.value.set(choices.accent[state.accent].renderColor||choices.accent[state.accent].color);u.uBase.value.set(choices.base[state.base].color);
   u.uFlags.value.set(!compare&&state.body!=='ivory'?1:0,!compare&&state.accent!=='taupe'?1:0,!compare&&state.base!=='oak'?1:0);u.uFinish.value=finish;
   const wood=this.maps.wood[state.base==='dark-oak'?'dark':'natural'];u.uWoodAlbedo.value=wood.basecolor;u.uWoodNormal.value=wood.normal;u.uWoodRoughness.value=wood.roughness;u.uWoodVariant.value=compare?-1:(state.base==='black-oak'?2:state.base==='dark-oak'?1:0);
   const sheen=finish===2?.45:0;if(Boolean(m.sheen)!==Boolean(sheen))m.needsUpdate=true;m.sheen=sheen;m.sheenRoughness=.72;
   // The fragment shader tints this lobe with each semantic dye region.
   m.sheenColor.setRGB(.95,.95,.95);
   m.normalScale.copy(m.userData.sourceNormal).multiplyScalar(finish===1?1.15:1);
  }
 }
}
