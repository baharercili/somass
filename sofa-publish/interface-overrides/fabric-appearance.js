/** Family-specific native visual approximations; not measured material scans. */
export const FABRIC_PROFILES=Object.freeze({
 'soft-touch':Object.freeze({id:1,label:'Soft Touch',roughness:.87,detailAmplitude:.12,bumpMetres:.00024}),
 veronza:Object.freeze({id:2,label:'Veronza',roughness:.90,detailAmplitude:.22,bumpMetres:.00055}),
 colormax:Object.freeze({id:3,label:'Colormax',roughness:.88,detailAmplitude:.24,bumpMetres:.00075})
});
export const fabricProfile=choice=>FABRIC_PROFILES[choice?.fabricSeries]??null;
export const FABRIC_GLSL=`
 uniform float uBodyFabric,uAccentFabric;
 float sofaFiberHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
 float sofaFiberNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(sofaFiberHash(i),sofaFiberHash(i+vec2(1,0)),f.x),mix(sofaFiberHash(i+vec2(0,1)),sofaFiberHash(i+vec2(1,1)),f.x),f.y);}
 float sofaFamilyYarn(vec2 point,float profile){
  float frequency=profile<1.5?390.0:(profile<2.5?185.0:130.0);
  vec2 p=point*frequency,cell=floor(p),f=fract(p)-.5;
  float seed=sofaFiberHash(cell),grain=sofaFiberNoise(p*2.7);
  if(profile<1.5){
   float warp=.5+.5*cos((p.x+.20*sin(p.y*3.14159265))*6.2831853);
   float weft=.5+.5*cos((p.y+.15*sin(p.x*3.14159265))*6.2831853);
   float attenuation=1.0-smoothstep(.35,1.2,max(fwidth(p.x),fwidth(p.y)));
   return mix((grain-.5)*.25,(warp+weft-1.0)*.45+(grain-.5)*.18,attenuation);
  }
  vec2 offset=vec2(sofaFiberHash(cell+13.0),sofaFiberHash(cell+29.0))-.5;
  vec2 q=(f-offset*.2)*vec2(1.0,profile<2.5?1.30:1.1);
  float ring=exp(-pow((length(q)-(.24+.06*seed))*12.0,2.0));
  float attenuation=1.0-smoothstep(.4,1.3,max(fwidth(p.x),fwidth(p.y)));
  return mix((sofaFiberNoise(p*.45)-.5)*.5,(ring-.45)*.9+(seed-.5)*.35+(grain-.5)*.15,attenuation);
 }
 float sofaFamilyDetail(vec3 p,vec3 weights,float profile){return sofaFamilyYarn(p.zy,profile)*weights.x+sofaFamilyYarn(p.xz,profile)*weights.y+sofaFamilyYarn(p.xy,profile)*weights.z;}
 vec3 sofaFamilyNormal(vec3 baseNormal,float height){
  vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition),r1=cross(dy,baseNormal),r2=cross(baseNormal,dx);
  float determinant=dot(dx,r1);vec3 gradient=sign(determinant)*(dFdx(height)*r1+dFdy(height)*r2);
  return normalize(abs(determinant)*baseNormal-gradient);
 }
`;

/** Ordinary PBR maps for glTF's fixed UV material model; no source image edits. */
export function portableFabricMaps(THREE,choice,dye){
 const profile=fabricProfile(choice);if(!profile)return null;
 const size=512,canvases=Array.from({length:3},()=>{const c=document.createElement('canvas');c.width=c.height=size;return c;}),contexts=canvases.map(c=>c.getContext('2d')),images=contexts.map(c=>c.createImageData(size,size));
 const fract=x=>x-Math.floor(x),hash=(x,y)=>fract(Math.sin(x*127.1+y*311.7)*43758.5453123),mix=(a,b,t)=>a+(b-a)*t;
 const noise=(x,y)=>{let ix=Math.floor(x),iy=Math.floor(y),fx=fract(x),fy=fract(y);fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);return mix(mix(hash(ix,iy),hash(ix+1,iy),fx),mix(hash(ix,iy+1),hash(ix+1,iy+1),fx),fy);};
 const frequency=profile.id===1?390:profile.id===2?185:130,cx=1.1741223484/.2842281705,cy=1.1741223484/.2734999955;
 function yarn(x,y){x*=frequency;y*=frequency;const ix=Math.floor(x),iy=Math.floor(y),seed=hash(ix,iy),grain=noise(x*2.7,y*2.7);if(profile.id===1){const warp=.5+.5*Math.cos((x+.20*Math.sin(y*Math.PI))*Math.PI*2),weft=.5+.5*Math.cos((y+.15*Math.sin(x*Math.PI))*Math.PI*2);return(warp+weft-1)*.45+(grain-.5)*.18;}const qx=fract(x)-.5-(hash(ix+13,iy+13)-.5)*.2,qy=(fract(y)-.5-(hash(ix+29,iy+29)-.5)*.2)*(profile.id===2?1.3:1.1),ring=Math.exp(-Math.pow((Math.hypot(qx,qy)-(.24+.06*seed))*12,2));return(ring-.45)*.9+(seed-.5)*.35+(grain-.5)*.15;}
 const encode=v=>Math.round(Math.max(0,Math.min(1,v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055))*255),dx=1/(size*cx),dy=1/(size*cy);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const px=(x+.5)/(size*cx),py=(y+.5)/(size*cy),h=yarn(px,py),at=(y*size+x)*4,detail=1+h*profile.detailAmplitude;
  for(let channel=0;channel<3;channel++)images[0].data[at+channel]=encode(dye[['r','g','b'][channel]]*detail);images[0].data[at+3]=255;
  let nx=-(yarn(px+dx,py)-h)*profile.bumpMetres/dx,ny=-(yarn(px,py+dy)-h)*profile.bumpMetres/dy,nz=1,length=Math.hypot(nx,ny,nz);for(const[channel,value]of[[0,nx],[1,ny],[2,nz]])images[1].data[at+channel]=Math.round((value/length*.5+.5)*255);images[1].data[at+3]=255;
  const roughness=Math.max(.78,Math.min(.96,profile.roughness+h*.04));images[2].data[at]=255;images[2].data[at+1]=Math.round(roughness*255);images[2].data[at+2]=0;images[2].data[at+3]=255;
 }
 return canvases.map((canvas,index)=>{contexts[index].putImageData(images[index],0,0);const map=new THREE.CanvasTexture(canvas);map.name=choice.fabricSeries+'_'+choice.shortCode+'_'+['albedo','normal','roughness'][index];map.colorSpace=index===0?THREE.SRGBColorSpace:THREE.NoColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.flipY=false;return map;});
}
