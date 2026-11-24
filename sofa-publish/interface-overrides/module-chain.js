import {planModuleChain} from './module-chain-planner.js?v=20261124-reverse-v132';
import {sanitizeCornerTables} from './corner-table-composition.js?v=20261124-reverse-v132';

export const MODULE_TYPES=Object.freeze(['seat','chaise','corner-left','corner-right']);
export const moduleExtraCount=value=>{const number=Number(value);return Number.isSafeInteger(Math.floor(number))&&number>0?Math.floor(number):0;};
export const moduleQuarterRotation=value=>Number.isSafeInteger(Number(value))?((Number(value)%4)+4)%4:0;
const validId=value=>typeof value==='string'&&/^module-[1-9]\d*$/.test(value);
const copyNode=node=>({...node});

/** IDs describe physical modules and survive additions at either end. */
export function sanitizeModuleSequence(value){
 if(!Array.isArray(value))return [];
 const used=new Set(),output=[];
 for(const [index,item] of value.entries()){
  if(!item||typeof item!=='object'||!MODULE_TYPES.includes(item.type))continue;
  let id=validId(item.id)?item.id:'module-'+(index+1);
  if(used.has(id)){let suffix=index+1;while(used.has('module-'+suffix))suffix++;id='module-'+suffix;}
  used.add(id);output.push({id,type:item.type,...(item.reversed===true&&item.type.startsWith('corner-')?{reversed:true}:{})});
 }
 return output;
}

/** Legacy contour runs from its first free end, through a corner return if any. */
export function deriveModuleSequence(state={}){
 const explicit=sanitizeModuleSequence(state.modules);if(explicit.length)return explicit;
 const layout=String(state.layout||'straight2'),extra=layout.startsWith('single-')?0:moduleExtraCount(state.extra),types=[];
 if(layout.startsWith('single-'))types.push({type:'seat'});
 else if(layout==='corner-left'){types.push({type:'seat'},{type:'corner-left',reversed:true});for(let i=0;i<extra;i++)types.push({type:'seat'});types.push({type:'seat'});}
 else if(layout==='corner-right'){types.push({type:'seat'});for(let i=0;i<extra;i++)types.push({type:'seat'});types.push({type:'corner-right'},{type:'seat'});}
 else{types.push({type:['chaise-left','dual-chaise'].includes(layout)?'chaise':'seat'});for(let i=0;i<extra+(layout==='straight3'?1:0);i++)types.push({type:'seat'});types.push({type:['chaise-right','dual-chaise'].includes(layout)?'chaise':'seat'});}
 return types.map((item,index)=>({id:'module-'+(index+1),...item}));
}
export function moduleTablePositionChoices(modules){
 const nodes=sanitizeModuleSequence(modules),choices=nodes.slice(1).map((node,index)=>({value:index+1,label:`${index+1}. ve ${index+2}. modül arası`,beforeId:nodes[index].id,afterId:node.id}));
 if(nodes.length){choices.push({value:'left-end',label:'Sol serbest uçta',beforeId:null,afterId:nodes[0].id},{value:'right-end',label:'Sağ serbest uçta',beforeId:nodes.at(-1).id,afterId:null});}
 return choices;
}
export function moduleTableAnchors(modules,position){
 if(position==='left-end')return {beforeId:null,afterId:modules[0]?.id??null};
 if(position==='right-end')return {beforeId:modules.at(-1)?.id??null,afterId:null};
 return {beforeId:modules[position-1]?.id??null,afterId:modules[position]?.id??null};
}
function oldTables(state,modules){
 const entries=Array.isArray(state.tables)?state.tables:state.table&&state.table!=='none'?[{id:'wood-1',type:state.table,position:state.tablePosition}]:[];
 const explicit=sanitizeModuleSequence(state.modules).length>0,layout=state.layout,mainCount=modules.length-(String(layout).startsWith('corner-')?1:0);
 return entries.map(entry=>{
  let position=entry.position;
  if(!explicit){if(position==='return')position=layout==='corner-left'?1:mainCount;else if(typeof position==='number'&&layout==='corner-left')position++;else if(!position)position=Math.max(1,Math.floor(mainCount/2))+(layout==='corner-left'?1:0);}
  return {...entry,position,...moduleTableAnchors(modules,position)};
 });
}
function migrated(state){const modules=deriveModuleSequence(state);return {...state,modules,moduleRotation:Array.isArray(state.modules)?moduleQuarterRotation(state.moduleRotation):state.layout==='corner-left'?1:0,tables:oldTables(state,modules)};}
function remapTables(entries,oldModules,newModules){
 const index=new Map(newModules.map((node,i)=>[node.id,i]));
 return entries.map(entry=>{
  const anchors=moduleTableAnchors(oldModules,entry.position),before=index.get(anchors.beforeId),after=index.get(anchors.afterId);let position;
  if(before!==undefined&&after!==undefined)position=after;
  else if(after!==undefined)position=after===0?'left-end':after;
  else if(before!==undefined)position=before===newModules.length-1?'right-end':before+1;
  else position=Math.min(Math.max(1,Number(entry.position)||1),newModules.length-1)||'left-end';
  return {...entry,position,...moduleTableAnchors(newModules,position)};
 });
}
function finishEdit(original,next){
 const plan=planModuleChain(next.layout,next.extra,next);
 if(plan.conflicts.length||plan.options.tables.length!==next.tables.length||plan.options.tables.some((entry,index)=>entry.id!==next.tables[index].id))return {...original,moduleBuilderError:'Bu ekleme modülleri üst üste getiriyor. Diğer ucu veya farklı bir modülü seçin.'};
 const result={...next,...plan.options,moduleBuilderError:''};
 if(Object.hasOwn(next,'cornerTables')&&!plan.options.cornerTables?.length)delete result.cornerTables;
 return result;
}
/** Includes both existing named corner layouts and a free module-chain draft. */
export function getCornerTableChoices(state={}){
 const current=migrated(state),selected=new Set((current.cornerTables??[]).map(entry=>entry.moduleId));
 return current.modules.flatMap((node,index)=>sanitizeCornerTables(current.modules,[{moduleId:node.id,type:'square'}]).length?[{moduleId:node.id,label:`${index+1}. modül · köşe dönüşü`,selected:selected.has(node.id)}]:[]);
}
/** Replace/revert a corner while retaining all stable IDs and accessory joints. */
export function setCornerTable(state={},moduleId,enabled=true){
 const current=migrated(state);
 if(!getCornerTableChoices(current).some(choice=>choice.moduleId===moduleId))return {...state,moduleBuilderError:'Kare sehpa iki oturum arasındaki iç köşe dönüşüne yerleştirilebilir.'};
 const cornerTables=(current.cornerTables??[]).filter(entry=>entry.moduleId!==moduleId);
 if(enabled)cornerTables.push({moduleId,type:'square'});
 return finishEdit(state,{...current,cornerTables});
}
/** Adds one physical module. Only a real geometric collision can reject an addition. */
export function appendModule(state={}, {side='right',type='seat'}={}){
 if(!MODULE_TYPES.includes(type)||!['left','right'].includes(side))return {...state,moduleBuilderError:'Geçerli bir modül ve uç seçin.'};
 const current=migrated(state),used=new Set(current.modules.map(node=>node.id));let suffix=current.modules.length+1;while(used.has('module-'+suffix))suffix++;
 const node={id:'module-'+suffix,type},modules=side==='left'?[node,...current.modules.map(copyNode)]:[...current.modules.map(copyNode),node];
 return finishEdit(state,{...current,modules,tables:remapTables(current.tables,current.modules,modules)});
}
/** At least one upholstered module remains; table IDs are never discarded. */
export function removeModule(state={},id){
 const current=migrated(state);if(current.modules.length<=1)return {...state,moduleBuilderError:'En az bir oturum modülü kalmalıdır.'};
 const modules=current.modules.filter(node=>node.id!==id);if(modules.length===current.modules.length)return {...state};
 const remainingCorners=(current.cornerTables??[]).filter(entry=>entry.moduleId!==id);
 if(sanitizeCornerTables(modules,remainingCorners).length!==remainingCorners.length)return {...state,moduleBuilderError:'Köşe sehpasının iki yanında birer oturum kalmalıdır. Önce köşe sehpasını kaldırabilir veya başka bir oturum ekleyebilirsiniz.'};
 const tables=remapTables(current.tables,current.modules,modules),positions=tables.map(entry=>entry.position);
 if(new Set(positions).size!==positions.length)return {...state,moduleBuilderError:'Bu modülü kaldırmadan önce yanındaki sehpalardan birini taşıyın.'};
 return finishEdit(state,{...current,modules,tables});
}
