import {sanitizeModuleSequence,moduleExtraCount,moduleTablePositionChoices} from './module-chain.js?v=20261124-reverse-v132';
import {sanitizeModuleOptions,planModuleChain} from './module-chain-planner.js?v=20261124-reverse-v132';
import {getTableProfile,getTablePlacement,normalizeTableDirection} from './sofa-table-profiles.js?v=20261124-reverse-v132';
import {PRODUCTION_MODULE_DIMENSIONS} from './module-dimensions.js?v=20261121-single-both-v86';
import {DEFAULT_TABLE_DESIGN} from './sofa-table-designs.js?v=20261118-wood-modules-v65';

const CORNER={width:1.18,depth:1.18,height:.82,seatHeight:.42,approximate:true};
const LAYOUTS=['straight2','straight3','corner-left','corner-right','chaise-left','chaise-right','dual-chaise','single-left','single-right','single-both'];
const normalLayout=value=>LAYOUTS.includes(value)?value:'straight2';
const extraCount=moduleExtraCount;
const rowCount=(layout,extra)=>layout.startsWith('single-')?1:extraCount(extra)+(layout==='straight3'?3:2);
const endPositions=layout=>['dual-chaise','single-both'].includes(layout)?[]:layout==='single-left'||layout==='chaise-right'?['left-end']:layout==='single-right'||layout==='chaise-left'?['right-end']:['left-end','right-end'];
const isEnd=value=>value==='left-end'||value==='right-end';

/** Gap numbers follow the main row from left to right when facing the sofa. */
export function getTablePositionChoices(requestedLayout='straight2',extra=0,options={}){
 if(sanitizeModuleSequence(options.modules).length)return moduleTablePositionChoices(options.modules);
 const layout=normalLayout(requestedLayout),count=rowCount(layout,extra);
 const choices=Array.from({length:Math.max(0,count-1)},(_,i)=>({value:i+1,label:`${layout.startsWith('corner-')?'Ana sırada ':''}${i+1}. ve ${i+2}. modül arası`}));
 if(layout.startsWith('corner-'))choices.push({value:'return',label:'Köşe dönüşündeki modül arası'});
 for(const value of endPositions(layout))choices.push({value,label:value==='left-end'?'Sol uçta · kol yerine':'Sağ uçta · kol yerine'});
 return choices;
}
function tablePosition(layout,extra,table,value){
 if(table==='none')return 0;
 if(endPositions(layout).includes(value))return value;
 if(layout.startsWith('single-'))return endPositions(layout)[0];
 if(layout.startsWith('corner-')&&value==='return')return 'return';
 const count=rowCount(layout,extra),number=typeof value==='number'?value:typeof value==='string'&&/^\d+$/.test(value)?Number(value):NaN;
 return Number.isSafeInteger(number)&&number>0?Math.min(number,count-1):Math.floor(count/2);
}

/** A requested accessory never replaces a chaise or an upholstered corner. */
function sanitizeLegacyOptions(layout,extra,options={}){
 layout=normalLayout(layout);
 if(layout==='single-both')return {table:'none',terminal:'none',tableDesign:DEFAULT_TABLE_DESIGN,tablePosition:0,tableDirection:'front',tableVariant:'standard'};
 // Legacy straight accessories retain the drawing; current straight-sided forms
 // have their own physical profiles and do not open the upholstered row.
 let table=options?.table==='straight'?'angled':['angled','square','rectangle'].includes(options?.table)?options.table:'none';
 let position=tablePosition(layout,extra,table,options?.tablePosition);
 const tableDirection=normalizeTableDirection(table,options?.tableDirection);
 // Only the inward-opening DWG wedge collides between adjacent long seats.
 if(table==='angled'&&tableDirection!=='back'&&layout==='dual-chaise'&&extraCount(extra)===0&&!isEnd(position)){table='none';position=0;}
 const tableDesign=table==='none'?DEFAULT_TABLE_DESIGN:getTableProfile(table).design,tableVariant='standard';
 return {table,terminal:'none',tableDesign,tablePosition:position,tableDirection,tableVariant};
}

const rotate=(x,z,a)=>({x:Math.cos(a)*x+Math.sin(a)*z,z:-Math.sin(a)*x+Math.cos(a)*z});
function seatSpec(type){const s=type.startsWith('corner_')?CORNER:PRODUCTION_MODULE_DIMENSIONS[type];return {type,kind:'seat',width:s.width,depth:s.depth,height:s.height,seatHeight:s.seatHeight??.42,approximate:Boolean(s.approximate)};}
function tableSpec(type,side,options={}){const key=type.replace('table_',''),profile=getTableProfile(key,options.tableDesign,options.tableVariant),s=profile.dimensions;return {type:'table_'+profile.type,kind:'table',width:s.width,depth:s.depth,height:s.height,seatHeight:0,side,tableDesign:profile.design,approximate:false,...(profile.type==='angled'?{tableVariant:profile.id}:{}),outline:profile.outline.map(([x,z])=>[x,z]),...(normalizeTableDirection(profile.type,options.tableDirection)==='back'?{tableDirection:'back'}:{})};}

function unit(type){
 const part=seatSpec(type);return {width:part.width,depth:part.depth,parts:[{...part,x:0,z:0}]};
}
function appendUnit(output,u,x,z,rotation=0,role='row'){
 for(const p of u.parts){const at=rotate(p.x,p.z,rotation);output.push({...p,x:x+at.x,z:z+at.z,rotation,role});}
}
export function compositionFootprint(part){
 const points=part.outline??[[-part.width/2,-part.depth/2],[part.width/2,-part.depth/2],[part.width/2,part.depth/2],[-part.width/2,part.depth/2]];
 return points.map(([x,z])=>{const p=rotate(x,z,part.rotation??0);return [p.x+part.x,p.z+part.z];});
}

/** The return end remains rigidly attached to the corner when the main row opens. */
function appendAttachedCornerReturn(parts,layout,returning,gap){
 const corner=parts.find(part=>part.type.startsWith('corner_')),left=layout==='corner-left',sign=left?-1:1;
 const offset=rotate(sign*(corner.width-returning.depth)/2,corner.depth/2+returning.width/2+gap,corner.rotation);
 appendUnit(parts,returning,corner.x+offset.x,corner.z+offset.z,corner.rotation+(left?Math.PI/2:-Math.PI/2),'return');
}

/** The whole main row and its corner are one rigid side of the return joint. */
function appendCornerReturnTable(parts,baseline,layout,returning,profile,table,gap){
 const left=layout==='corner-left',sign=left?-1:1,frame=left?Math.PI/2:-Math.PI/2,corner=baseline.parts.find(part=>part.type.startsWith('corner_'));
 const contact={x:corner.x+sign*(corner.width-returning.depth)/2,z:corner.z+corner.depth/2};
 const a=profile.leftAngle,b=-profile.rightAngle;
 const half=profile.placementHalfWidth??profile.dimensions.placementHalfWidth??(profile.dimensions.rearWidth+profile.dimensions.frontWidth)/4,shift=profile.frontOffset/2;
 const parentIsLeft=!left,parentAngle=parentIsLeft?a:b,returnAngle=parentIsLeft?b:a;
 const anchor=(isLeft,width,depthOffset,angle)=>{const at=rotate(0,depthOffset,angle);return {x:shift+(isLeft?-1:1)*(half+Math.cos(angle)*width/2+gap)+at.x,z:Math.sin(isLeft?angle:-angle)*width/2+at.z};};
 const parent=anchor(parentIsLeft,corner.depth,(corner.width-returning.depth)/2,parentAngle),end=anchor(!parentIsLeft,returning.width,0,returnAngle);
 for(const part of baseline.parts.filter(part=>part.role!=='return')){
  const local=rotate(part.x-corner.x,part.z-corner.z,-frame),turned=rotate(local.x,local.z,parentAngle),world=rotate(parent.x+turned.x,parent.z+turned.z,frame);
  parts.push({...part,x:contact.x+world.x,z:contact.z+world.z,rotation:part.rotation+parentAngle});
 }
 const endAt=rotate(end.x,end.z,frame);appendUnit(parts,returning,contact.x+endAt.x,contact.z+endAt.z,frame+returnAngle,'return');
 parts.push({...table,x:contact.x,z:contact.z,rotation:frame+(profile.placementRotation||0),role:'intermediate',tablePosition:'return'});
}

/** Attach the wood to the outside of a real armless seat, in that seat's frame. */
function appendTerminalTable(parts,seat,side,profile,table,gap,position){
 const sign=side==='L'?-1:1,angle=side==='L'?(profile.rightAngle||0):-(profile.leftAngle||0);
 const outline=table.outline.map(([x,z])=>rotate(x,z,angle+(profile.placementRotation||0))),xs=outline.map(p=>p.x),zs=outline.map(p=>p.z);
 const near=side==='L'?Math.max(...xs):Math.min(...xs),localX=sign*(seat.width/2+gap)-near,localZ=-seat.depth/2-Math.min(...zs);
 const offset=rotate(localX,localZ,seat.rotation);
 parts.push({...table,side,x:seat.x+offset.x,z:seat.z+offset.z,rotation:seat.rotation+angle+(profile.placementRotation||0),role:'terminal',tablePosition:position});
}

/** One shared nominal plan for rendering, dimension labels, downloads and links. */
function planLegacyComposition(requestedLayout='straight2',requestedExtra=0,requestedOptions={}){
 const layout=normalLayout(requestedLayout),extra=layout.startsWith('single-')?0:extraCount(requestedExtra),options=sanitizeLegacyOptions(layout,extra,requestedOptions),row=[];let returning=null;
 const add=key=>row.push(unit(key,options)),middles=n=>{for(let i=0;i<n;i++)add('middle');};
 if(layout.startsWith('single-'))add(layout==='single-both'?'single_both':layout==='single-left'?'end_L':'end_R');
 else if(layout==='corner-left'){add('corner_L');middles(extra);add('end_R');returning=unit('end_L',options);}
 else if(layout==='corner-right'){add('end_L');middles(extra);add('corner_R');returning=unit('end_R',options);}
 else if(layout==='dual-chaise'){add('chaise_L');middles(extra);add('chaise_R');}
 else{add(layout==='chaise-left'?'chaise_L':'end_L');middles(extra+(layout==='straight3'?1:0));add(layout==='chaise-right'?'chaise_R':'end_R');}
 const terminal=isEnd(options.tablePosition),leftEnd=options.tablePosition==='left-end';
 let terminalRole=null,terminalSide=null;
 if(terminal){
  terminalSide=leftEnd?'L':'R';
  const onReturn=returning&&((layout==='corner-left'&&leftEnd)||(layout==='corner-right'&&!leftEnd));
  if(onReturn){returning=unit('middle');terminalRole='return';}
  else{row[leftEnd?0:row.length-1]=unit('middle');terminalRole='row';}
 }
 const parts=[],gap=requestedOptions?.exploded?.075:0,split=options.tablePosition==='return'?-1:options.tablePosition||Math.floor(row.length/2),table=options.table==='none'?null:tableSpec('table_'+options.table,undefined,options),rowTable=options.tablePosition==='return'||terminal?null:table,angleSpec=getTablePlacement('angled',options.tableDirection);
 if(options.table==='angled'&&!terminal&&returning&&options.tablePosition==='return'){
  const baseline=planLegacyComposition(layout,extra,{...requestedOptions,table:'none',terminal:'none',tablePosition:0});
  appendCornerReturnTable(parts,baseline,layout,returning,angleSpec,table,gap);
 }else if(options.table==='angled'&&!terminal){
  const angle=angleSpec.leftAngle,rightAngle=-angleSpec.rightAngle,half=angleSpec.placementHalfWidth??angleSpec.dimensions.placementHalfWidth??(angleSpec.dimensions.rearWidth+angleSpec.dimensions.frontWidth)/4,shift=angleSpec.frontOffset/2;
  const left=row.slice(0,split),right=row.slice(split),leftWidth=left.reduce((s,u)=>s+u.width,0)+gap*(left.length-1),rightWidth=right.reduce((s,u)=>s+u.width,0)+gap*(right.length-1);
  const anchors=[{list:left,width:leftWidth,angle,x:-half+shift-Math.cos(angle)*leftWidth/2-gap,z:Math.sin(angle)*leftWidth/2},{list:right,width:rightWidth,angle:rightAngle,x:half+shift+Math.cos(rightAngle)*rightWidth/2+gap,z:Math.sin(-rightAngle)*rightWidth/2}];
  for(const block of anchors){let x=-block.width/2;for(const u of block.list){const offset=rotate(x+u.width/2,(u.depth-1.07)/2,block.angle);appendUnit(parts,u,block.x+offset.x,block.z+offset.z,block.angle);x+=u.width+gap;}}
  parts.push({...table,x:0,z:0,rotation:angleSpec.placementRotation,role:'intermediate',tablePosition:options.tablePosition});
  if(returning)appendAttachedCornerReturn(parts,layout,returning,gap);
 }else{
  const total=row.reduce((s,u)=>s+u.width,0)+gap*(row.length-1)+(rowTable?rowTable.width+gap:0);let x=-total/2;const centres=[];
  for(let i=0;i<row.length;i++){
   if(rowTable&&i===split){parts.push({...rowTable,x:x+rowTable.width/2,z:(rowTable.depth-1.07)/2,rotation:0,role:'intermediate',tablePosition:options.tablePosition});x+=rowTable.width+gap;}
   const u=row[i],z=(u.depth-1.07)/2;centres.push({x:x+u.width/2,z,unit:u});appendUnit(parts,u,x+u.width/2,z);x+=u.width+(i<row.length-1?gap:0);
  }
  if(returning){
   const side=layout==='corner-left'?'left':'right',corner=side==='left'?centres[0]:centres.at(-1),sign=side==='left'?-1:1,rotation=side==='left'?Math.PI/2:-Math.PI/2,returnX=corner.x+sign*(corner.unit.width-returning.depth)/2,cornerFront=corner.z+corner.unit.depth/2,returnTable=options.tablePosition==='return'?table:null;
   if(returnTable){const offset=rotate(0,(returnTable.depth-returning.depth)/2,rotation);parts.push({...returnTable,x:returnX+offset.x,z:cornerFront+gap+returnTable.width/2+offset.z,rotation,role:'intermediate',tablePosition:'return'});}
   appendUnit(parts,returning,returnX,cornerFront+(returnTable?returnTable.width+gap:0)+returning.width/2+gap,rotation,'return');
  }
 }
 if(terminal){
  const seats=parts.filter(part=>part.kind==='seat'&&part.role===terminalRole),seat=terminalRole==='return'?seats[0]:leftEnd?seats[0]:seats.at(-1);
  appendTerminalTable(parts,seat,terminalSide,getTablePlacement(options.table,options.tableDirection),table,gap,options.tablePosition);
 }
 const points=parts.flatMap(compositionFootprint),xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),bounds={minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};
 return {layout,extra,options,parts,width:bounds.maxX-bounds.minX,depth:bounds.maxZ-bounds.minZ,height:Math.max(...parts.map(p=>p.height)),seatHeight:.42,bounds,seatCount:parts.filter(p=>p.kind==='seat').length,tableCount:parts.filter(p=>p.kind==='table').length,moduleCount:parts.length,approximate:parts.some(p=>p.approximate),angle:options.table==='angled'&&!terminal?(angleSpec.leftAngle+angleSpec.rightAngle)/2:0};
}

const tableTypes=new Set(['angled','square','rectangle']);
function optionsForTables(tables){
 const first=tables[0],table=first?.type??'none';
 return {table,terminal:'none',tableDesign:first?getTableProfile(table).design:DEFAULT_TABLE_DESIGN,tablePosition:first?.position??0,tableDirection:normalizeTableDirection(first?.type,first?.direction),tableVariant:'standard',tables:tables.map(entry=>({...entry}))};
}
function entrySpec(entry){return {...tableSpec('table_'+entry.type,undefined,{tableDesign:getTableProfile(entry.type).design,tableDirection:entry.direction}),tableId:entry.id,tablePosition:entry.position};}
function finishPlan(layout,extra,options,parts,angle=0){
 const points=parts.flatMap(compositionFootprint),xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),bounds={minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};
 return {layout,extra,options,parts,width:bounds.maxX-bounds.minX,depth:bounds.maxZ-bounds.minZ,height:Math.max(...parts.map(p=>p.height)),seatHeight:.42,bounds,seatCount:parts.filter(p=>p.kind==='seat').length,tableCount:parts.filter(p=>p.kind==='table').length,moduleCount:parts.length,approximate:parts.some(p=>p.approximate),angle};
}
function transformPart(part,origin,target,angle){
 const p=rotate(part.x-origin.x,part.z-origin.z,angle);
 part.x=target.x+p.x;part.z=target.z+p.z;part.rotation+=angle;
}

/** Each occupied joint is connected before the next one opens its rigid sides. */
function planMultipleComposition(layout,extra,tables,exploded=false){
 const options=optionsForTables(tables),gap=exploded?.075:0,slots=new Map(tables.map(entry=>[entry.position,entry])),types=[];let returning=null;
 const middle=n=>{for(let i=0;i<n;i++)types.push('middle');};
 if(layout.startsWith('single-'))types.push(layout==='single-both'?'single_both':layout==='single-left'?'end_L':'end_R');
 else if(layout==='corner-left'){types.push('corner_L');middle(extra);types.push('end_R');returning=unit('end_L');}
 else if(layout==='corner-right'){types.push('end_L');middle(extra);types.push('corner_R');returning=unit('end_R');}
 else if(layout==='dual-chaise'){types.push('chaise_L');middle(extra);types.push('chaise_R');}
 else{types.push(layout==='chaise-left'?'chaise_L':'end_L');middle(extra+(layout==='straight3'?1:0));types.push(layout==='chaise-right'?'chaise_R':'end_R');}
 for(const position of ['left-end','right-end'])if(slots.has(position)){
  const left=position==='left-end',onReturn=returning&&((layout==='corner-left'&&left)||(layout==='corner-right'&&!left));
  if(onReturn)returning=unit('middle');else types[left?0:types.length-1]='middle';
 }
 const row=types.map(seatSpec),total=row.reduce((sum,seat)=>sum+seat.width,0)+gap*(row.length-1),parts=[];let x=-total/2;
 row.forEach((seat,index)=>{parts.push({...seat,x:x+seat.width/2,z:(seat.depth-1.07)/2,rotation:0,role:'row',rowIndex:index});x+=seat.width+gap;});
 const rowEntries=tables.filter(entry=>typeof entry.position==='number').sort((a,b)=>a.position-b.position);
 for(const entry of rowEntries){
  const split=entry.position,left=parts.find(part=>part.kind==='seat'&&part.rowIndex===split-1),right=parts.find(part=>part.kind==='seat'&&part.rowIndex===split),profile=getTablePlacement(entry.type,entry.direction),table=entrySpec(entry),theta=left.rotation;
  if(entry.type==='angled'){
   const a=profile.leftAngle,b=-profile.rightAngle,h=profile.placementHalfWidth??profile.dimensions.width/2;
   const edge=rotate(left.width/2,-(left.depth-1.07)/2,theta),at={x:left.x+edge.x,z:left.z+edge.z};
   const leftOffset=rotate(0,(left.depth-1.07)/2,a),rightOffset=rotate(0,(right.depth-1.07)/2,b);
   const la=rotate(-h-Math.cos(a)*left.width/2-gap+leftOffset.x,Math.sin(a)*left.width/2+leftOffset.z,theta);
   const ra=rotate(h+Math.cos(b)*right.width/2+gap+rightOffset.x,Math.sin(-b)*right.width/2+rightOffset.z,theta);
   const leftOrigin={x:left.x,z:left.z},rightOrigin={x:right.x,z:right.z};
   for(const part of parts){
    const before=part.kind==='seat'?part.rowIndex<split:part.tablePosition<split;
    transformPart(part,before?leftOrigin:rightOrigin,before?{x:at.x+la.x,z:at.z+la.z}:{x:at.x+ra.x,z:at.z+ra.z},before?a:b);
   }
   parts.push({...table,x:at.x,z:at.z,rotation:theta+(profile.placementRotation||0),role:'intermediate'});
  }else{
   const offset=rotate(left.width/2+gap+table.width/2,(table.depth-left.depth)/2,theta),at={x:left.x+offset.x,z:left.z+offset.z},shift=rotate(table.width+gap,0,theta);
   for(const part of parts)if(part.kind==='seat'?part.rowIndex>=split:part.tablePosition>=split){part.x+=shift.x;part.z+=shift.z;}
   parts.push({...table,x:at.x,z:at.z,rotation:theta+(profile.placementRotation||0),role:'intermediate'});
  }
 }
 if(returning){
  const entry=slots.get('return');
  if(entry?.type==='angled'){
   const corner=parts.find(part=>part.type.startsWith('corner_')),origin={x:corner.x,z:corner.z},theta=corner.rotation;
   const local=parts.map(part=>{const at=rotate(part.x-origin.x,part.z-origin.z,-theta);return {...part,x:at.x,z:at.z,rotation:part.rotation-theta};}),connected=[];
   appendCornerReturnTable(connected,{parts:local},layout,returning,getTablePlacement(entry.type,entry.direction),entrySpec(entry),gap);
   parts.length=0;
   for(const part of connected){const at=rotate(part.x,part.z,theta);parts.push({...part,x:origin.x+at.x,z:origin.z+at.z,rotation:part.rotation+theta});}
  }else if(entry){
   const corner=parts.find(part=>part.type.startsWith('corner_')),left=layout==='corner-left',sign=left?-1:1,frame=corner.rotation+(left?Math.PI/2:-Math.PI/2),table=entrySpec(entry);
   const contactOffset=rotate(sign*(corner.width-returning.depth)/2,corner.depth/2,corner.rotation),contact={x:corner.x+contactOffset.x,z:corner.z+contactOffset.z};
   const along=rotate(0,gap+table.width/2,corner.rotation),back=rotate(0,(table.depth-returning.depth)/2,frame),end=rotate(0,table.width+2*gap+returning.width/2,corner.rotation);
   parts.push({...table,x:contact.x+along.x+back.x,z:contact.z+along.z+back.z,rotation:frame,role:'intermediate'});
   appendUnit(parts,returning,contact.x+end.x,contact.z+end.z,frame,'return');
  }else appendAttachedCornerReturn(parts,layout,returning,gap);
 }
 for(const position of ['left-end','right-end']){
  const entry=slots.get(position);if(!entry)continue;
  const left=position==='left-end',onReturn=returning&&((layout==='corner-left'&&left)||(layout==='corner-right'&&!left)),seat=onReturn?parts.find(part=>part.kind==='seat'&&part.role==='return'):parts.find(part=>part.kind==='seat'&&part.rowIndex===(left?0:row.length-1));
  appendTerminalTable(parts,seat,left?'L':'R',getTablePlacement(entry.type,entry.direction),entrySpec(entry),gap,position);
 }
 return finishPlan(layout,extra,options,parts,tables.reduce((sum,entry)=>sum+(entry.type==='angled'&&!isEnd(entry.position)?getTablePlacement(entry.type,entry.direction).leftAngle:0),0));
}
function planAcceptedTables(layout,extra,tables,exploded=false){
 if(tables.length>1)return planMultipleComposition(layout,extra,tables,exploded);
 const options=optionsForTables(tables),plan=planLegacyComposition(layout,extra,{...options,exploded});
 return {...plan,options,parts:plan.parts.map(part=>part.kind==='table'?{...part,tableId:tables[0].id}:part)};
}
function hasOverlap(parts){
 const shapes=parts.map(compositionFootprint),bounds=shapes.map(points=>({minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minZ:Math.min(...points.map(p=>p[1])),maxZ:Math.max(...points.map(p=>p[1]))}));
 for(let i=0;i<shapes.length;i++)for(let j=i+1;j<shapes.length;j++){
  const a=bounds[i],b=bounds[j];if(Math.min(a.maxX,b.maxX)-Math.max(a.minX,b.minX)<=1e-7||Math.min(a.maxZ,b.maxZ)-Math.max(a.minZ,b.minZ)<=1e-7)continue;
  let separate=false;
  for(const polygon of[shapes[i],shapes[j]]){
   for(let k=0;k<polygon.length;k++){
    const p=polygon[k],q=polygon[(k+1)%polygon.length],length=Math.hypot(q[0]-p[0],q[1]-p[1]);if(length<1e-10)continue;
    const axis=[(q[1]-p[1])/length,(p[0]-q[0])/length],pa=shapes[i].map(v=>v[0]*axis[0]+v[1]*axis[1]),pb=shapes[j].map(v=>v[0]*axis[0]+v[1]*axis[1]);
    if(Math.min(Math.max(...pa),Math.max(...pb))-Math.max(Math.min(...pa),Math.min(...pb))<=1e-7){separate=true;break;}
   }
   if(separate)break;
  }
  if(!separate)return true;
 }
 return false;
}

/** A list is authoritative, including an empty list; earlier one-table links migrate. */
export function sanitizeCompositionOptions(requestedLayout,requestedExtra,options={}){
 if(sanitizeModuleSequence(options.modules).length)return sanitizeModuleOptions(options);
 const layout=normalLayout(requestedLayout),extra=layout.startsWith('single-')?0:extraCount(requestedExtra);
 if(!Array.isArray(options?.tables)){
  const old=sanitizeLegacyOptions(layout,extra,{...options,tableDirection:'front'}),tables=old.table==='none'?[]:[{id:'wood-1',type:old.table,position:old.tablePosition}];
  return optionsForTables(tables);
 }
 const positions=new Set(getTablePositionChoices(layout,extra).map(choice=>choice.value)),accepted=[],ids=new Set(),occupied=new Set();
 for(const [index,item]of options.tables.entries()){
  if(!item||typeof item!=='object'||Array.isArray(item))continue;
  const type=item.type==='straight'?'angled':item.type;if(!tableTypes.has(type))continue;
  let position=item.position;
  if(position===undefined||position===null||position===0||position==='0')position=tablePosition(layout,extra,type,0);
  else if(typeof position==='string'&&/^\d+$/.test(position))position=Number(position);
  if(!positions.has(position)||occupied.has(position))continue;
  const old=sanitizeLegacyOptions(layout,extra,{table:type,tablePosition:position,tableDirection:item.direction});if(old.table!==type)continue;
  let id=typeof item.id==='string'&&/^wood-[1-9]\d*$/.test(item.id)?item.id:'wood-'+(index+1);
  if(ids.has(id))continue;
  const candidate={id,type,position,...(normalizeTableDirection(type,item.direction)==='back'?{direction:'back'}:{})},next=[...accepted,candidate];
  if((next.length>1||candidate.direction==='back')&&hasOverlap(planAcceptedTables(layout,extra,next,false).parts))continue;
  accepted.push(candidate);ids.add(id);occupied.add(position);
  if(accepted.length===positions.size)break;
 }
 return optionsForTables(accepted);
}

/** Shared geometry and metadata for every independently placed wooden module. */
export function planSofaComposition(requestedLayout='straight2',requestedExtra=0,requestedOptions={}){
 if(sanitizeModuleSequence(requestedOptions.modules).length)return planModuleChain(normalLayout(requestedLayout),requestedExtra,requestedOptions);
 const layout=normalLayout(requestedLayout),extra=layout.startsWith('single-')?0:extraCount(requestedExtra),options=sanitizeCompositionOptions(layout,extra,requestedOptions);
 return planAcceptedTables(layout,extra,options.tables,Boolean(requestedOptions?.exploded));
}
