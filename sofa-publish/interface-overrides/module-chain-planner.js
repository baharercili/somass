import {getTableProfile,getTablePlacement,normalizeTableDirection} from './sofa-table-profiles.js?v=20261124-reverse-v132';
import {DEFAULT_TABLE_DESIGN} from './sofa-table-designs.js?v=20261118-wood-modules-v65';
import {sanitizeModuleSequence,moduleQuarterRotation,moduleTablePositionChoices,moduleTableAnchors,moduleTablePosition,normalizeModuleComposition,moduleExtraCount} from './module-chain.js?v=20261127-configurator-v180';
import {sanitizeCornerTables,createCornerTablePart} from './corner-table-composition.js?v=20261124-reverse-v132';
const STANDARD_DEPTH=1.07;
const rotate=(x,z,a)=>({x:Math.cos(a)*x+Math.sin(a)*z,z:-Math.sin(a)*x+Math.cos(a)*z});
const world=(origin,x,z,a)=>{const offset=rotate(x,z,a);return {x:origin.x+offset.x,z:origin.z+offset.z};};
const types=new Set(['angled','square','rectangle']);
export function sanitizeModuleTables(modules,options={}){
 const choices=moduleTablePositionChoices(modules),positions=new Set(choices.map(choice=>choice.value)),occupied=new Set(),ids=new Set(),result=[];
 const entries=Array.isArray(options.tables)?options.tables:options.table&&options.table!=='none'?[{id:'wood-1',type:options.table,position:options.tablePosition}]:[];
 for(const [index,item]of entries.entries()){
  if(!item||typeof item!=='object')continue;const type=item.type==='straight'?'angled':item.type;if(!types.has(type))continue;
  let position=moduleTablePosition(modules,item);
  if(!positions.has(position)){
   const before=modules.findIndex(node=>node.id===item.beforeId),after=modules.findIndex(node=>node.id===item.afterId);
   position=after===0&&item.beforeId==null?'left-end':before===modules.length-1&&item.afterId==null?'right-end':after>0&&before===after-1?after:Math.max(1,Math.floor(modules.length/2));
  }
  if(!positions.has(position)||occupied.has(position))continue;
  const id=typeof item.id==='string'&&/^wood-[1-9]\d*$/.test(item.id)?item.id:'wood-'+(index+1);if(ids.has(id))continue;
  result.push({id,type,position,...moduleTableAnchors(modules,position),...(normalizeTableDirection(type,item.direction)==='back'?{direction:'back'}:{})});ids.add(id);occupied.add(position);
 }
 return result;
}
export function sanitizeModuleOptions(options={},validateTables=true){
 const original=sanitizeModuleSequence(options.modules),normalized=normalizeModuleComposition(original,sanitizeModuleTables(original,options),options),modules=normalized.modules,cornerTables=sanitizeCornerTables(modules,options.cornerTables),requested=sanitizeModuleTables(modules,{tables:normalized.tables}),moduleRotation=moduleQuarterRotation(options.moduleRotation);let tables=requested;
 if(validateTables&&requested.length){
  tables=[];
  for(const entry of requested){const next=[...tables,entry];if(!planModuleChain('straight2',0,{modules,moduleRotation,tables:next,...(cornerTables.length?{cornerTables}:{})},false).conflicts.length)tables.push(entry);}
 }
 const first=tables[0],table=first?.type??'none';
 return {table,terminal:'none',tableDesign:first?getTableProfile(table).design:DEFAULT_TABLE_DESIGN,tablePosition:first?.position??0,tableDirection:normalizeTableDirection(first?.type,first?.direction),tableVariant:'standard',tables,modules,moduleRotation,...(cornerTables.length?{cornerTables}:{}),...(normalized.moduleBuilderError?{moduleBuilderError:normalized.moduleBuilderError}:{})};
}
function tablePart(entry){const profile=getTableProfile(entry.type),d=profile.dimensions;return {type:'table_'+entry.type,kind:'table',tableId:entry.id,tablePosition:entry.position,tableDesign:profile.design,tableVariant:'standard',width:d.width,depth:d.depth,height:d.height,seatHeight:0,approximate:false,outline:profile.outline.map(point=>[...point]),...(normalizeTableDirection(entry.type,entry.direction)==='back'?{tableDirection:'back'}:{})};}
function transform(part,origin,target,angle){
 const at=world(target,part.x-origin.x,part.z-origin.z,angle);part.x=at.x;part.z=at.z;part.rotation+=angle;
 for(const key of ['entry','exit'])if(part[key])part[key]=world(target,part[key].x-origin.x,part[key].z-origin.z,angle);
 for(const key of ['entryTheta','exitTheta'])if(Number.isFinite(part[key]))part[key]+=angle;
}
function footprint(part){return (part.outline??[[-part.width/2,-part.depth/2],[part.width/2,-part.depth/2],[part.width/2,part.depth/2],[-part.width/2,part.depth/2]]).map(([x,z])=>{const p=world(part,x,z,part.rotation);return [p.x,p.z];});}
function overlap(a,b){
 for(const polygon of[a,b])for(let i=0;i<polygon.length;i++){
  const p=polygon[i],q=polygon[(i+1)%polygon.length],axis=[q[1]-p[1],p[0]-q[0]],aa=a.map(v=>v[0]*axis[0]+v[1]*axis[1]),bb=b.map(v=>v[0]*axis[0]+v[1]*axis[1]);
  if(Math.min(Math.max(...aa),Math.max(...bb))-Math.max(Math.min(...aa),Math.min(...bb))<=1e-7*Math.hypot(...axis))return false;
 }
 return true;
}
export function planModuleChain(layout='straight2',extra=0,requested={},validateTables=true){
 const options=sanitizeModuleOptions({...requested,layout:requested.layout??layout},validateTables),modules=options.modules.length?options.modules:[{id:'module-1',type:'seat'}],gap=requested.exploded?.075:0,parts=[],slots=new Map(options.tables.map(entry=>[entry.position,entry])),cornerIds=new Set((options.cornerTables??[]).map(entry=>entry.moduleId));
 let contact={x:0,z:0},theta=options.moduleRotation*Math.PI/2;
 for(const [index,node]of modules.entries()){
  if(cornerIds.has(node.id)){
   const part=createCornerTablePart(node,contact,theta,{beforeDepth:modules[index-1]?.type==='chaise'?1.67:STANDARD_DEPTH,afterDepth:modules[index+1]?.type==='chaise'?1.67:STANDARD_DEPTH});parts.push({...part,chainIndex:index});
   contact=world(part.exit,gap,0,part.exitTheta);theta=part.exitTheta;continue;
  }
  const first=index===0,last=index===modules.length-1,leftArm=first&&!slots.has('left-end'),rightArm=last&&!slots.has('right-end');
  let type,width,depth,rotation=theta,centre,exit,exitTheta=theta;
  if(node.type.startsWith('corner-')){
   const left=node.type==='corner-left',reversed=node.reversed===true;type=left?'corner_L':'corner_R';width=depth=1.18;
   const offset=(1.18-STANDARD_DEPTH)/2,entryLocal=reversed?[left?-offset:offset,.59]:[left?.59:-.59,-offset],exitLocal=reversed?[left?.59:-.59,-offset]:[left?-offset:offset,.59];
   rotation=theta+(left?(reversed?-Math.PI/2:Math.PI):(reversed?Math.PI/2:0));
   const entryOffset=rotate(...entryLocal,rotation);centre={x:contact.x-entryOffset.x,z:contact.z-entryOffset.z};exit=world(centre,...exitLocal,rotation);exitTheta=theta+(left!==reversed?Math.PI/2:-Math.PI/2);
  }else{
   const chaise=node.type==='chaise';type=chaise?(leftArm?'chaise_L':rightArm?'chaise_R':'chaise_middle'):(leftArm&&rightArm?'single_both':leftArm?'end_L':rightArm?'end_R':'middle');
   width=chaise?.95+((leftArm||rightArm)?.18:0):.95+(leftArm?.18:0)+(rightArm?.18:0);depth=chaise?1.67:STANDARD_DEPTH;centre=world(contact,width/2,(depth-STANDARD_DEPTH)/2,theta);exit=world(contact,width,0,theta);
  }
  parts.push({type,kind:'seat',moduleId:node.id,logicalType:node.type,chainIndex:index,width,depth,height:.82,seatHeight:.42,approximate:node.type.startsWith('corner-'),x:centre.x,z:centre.z,rotation,role:'chain',entry:{...contact},exit,entryTheta:theta,exitTheta});
  contact=world(exit,gap,0,exitTheta);theta=exitTheta;
 }
 for(const entry of options.tables.filter(item=>typeof item.position==='number').sort((a,b)=>a.position-b.position)){
  const split=entry.position,left=parts.find(part=>part.chainIndex===split-1),right=parts.find(part=>part.chainIndex===split),profile=getTablePlacement(entry.type,entry.direction),table=tablePart(entry),origin={...left.exit},frame=left.exitTheta;
  if(entry.type==='angled'){
   const half=profile.placementHalfWidth??profile.dimensions.placementHalfWidth??profile.dimensions.width/2,shift=(profile.frontOffset||0)/2,a=profile.leftAngle,b=-profile.rightAngle;
   const leftTarget=world(origin,-half+shift-gap,0,frame),rightTarget=world(origin,half+shift+gap,0,frame),rightOrigin={...right.entry};
   for(const part of parts){const before=Number.isInteger(part.chainIndex)?part.chainIndex<split:part.tablePosition<split;transform(part,before?origin:rightOrigin,before?leftTarget:rightTarget,before?a:b);}
   parts.push({...table,x:origin.x,z:origin.z,rotation:frame+(profile.placementRotation||0),role:'intermediate'});
  }else{
   const at=world(origin,gap+table.width/2,(table.depth-STANDARD_DEPTH)/2,frame),shift=rotate(table.width+gap,0,frame);
   for(const part of parts)if(Number.isInteger(part.chainIndex)?part.chainIndex>=split:part.tablePosition>=split)transform(part,{x:0,z:0},shift,0);
   parts.push({...table,x:at.x,z:at.z,rotation:frame+(profile.placementRotation||0),role:'intermediate'});
  }
 }
 for(const [position,left]of [['left-end',true],['right-end',false]]){
  const entry=slots.get(position);if(!entry)continue;const seat=parts.find(part=>part.kind==='seat'&&part.chainIndex===(left?0:modules.length-1)),profile=getTablePlacement(entry.type,entry.direction),table=tablePart(entry),frame=left?seat.entryTheta:seat.exitTheta,origin=left?seat.entry:seat.exit,angle=left?profile.rightAngle:-profile.leftAngle,shape=table.outline.map(([x,z])=>rotate(x,z,angle+(profile.placementRotation||0)));
  const xs=shape.map(p=>p.x),zs=shape.map(p=>p.z),x=left?-gap-Math.max(...xs):gap-Math.min(...xs),z=-STANDARD_DEPTH/2-Math.min(...zs),at=world(origin,x,z,frame);
  parts.push({...table,side:left?'L':'R',x:at.x,z:at.z,rotation:frame+angle+(profile.placementRotation||0),role:'terminal'});
 }
 const polygons=parts.map(footprint),conflicts=[];
 for(let i=0;i<parts.length;i++)for(let j=i+1;j<parts.length;j++)if(overlap(polygons[i],polygons[j]))conflicts.push({a:parts[i].moduleId??parts[i].tableId,b:parts[j].moduleId??parts[j].tableId});
 const points=polygons.flat(),xs=points.map(point=>point[0]),zs=points.map(point=>point[1]),bounds={minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};
 return {layout,extra:moduleExtraCount(extra),options,parts,width:bounds.maxX-bounds.minX,depth:bounds.maxZ-bounds.minZ,height:.82,seatHeight:.42,bounds,seatCount:modules.length-cornerIds.size,tableCount:options.tables.length+cornerIds.size,moduleCount:parts.length,approximate:parts.some(part=>part.approximate),angle:options.tables.reduce((sum,item)=>sum+(item.type==='angled'?getTablePlacement(item.type,item.direction).leftAngle:0),0),custom:true,conflicts};
}

