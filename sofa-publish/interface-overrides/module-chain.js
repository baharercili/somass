import {planModuleChain} from './module-chain-planner.js?v=20261127-configurator-v180';
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
/** Physical joint IDs take precedence over a saved index from an earlier order. */
export function moduleTablePosition(modules,entry={}){
 const before=modules.findIndex(node=>node.id===entry.beforeId),after=modules.findIndex(node=>node.id===entry.afterId);
 if(entry.beforeId===null&&after===0)return 'left-end';
 if(entry.afterId===null&&before===modules.length-1)return 'right-end';
 if(before>=0&&after===before+1)return after;
 const position=typeof entry.position==='string'&&/^\d+$/.test(entry.position)?Number(entry.position):entry.position;
 if(position==='left-end'||position==='right-end'||Number.isInteger(position)&&position>0&&position<modules.length)return position;
 if(after>=0)return after===0?'left-end':after;
 if(before>=0)return before===modules.length-1?'right-end':before+1;
 return Math.max(1,Math.floor(modules.length/2));
}
const CHAISE_END_ERROR='Dinlenme modülleri kanepenin ilk ve son modülü olmalıdır. En fazla iki dinlenme kullanabilirsiniz; bir modülü kaldırarak yerleşimi düzeltebilirsiniz.';
/** Chaises occupy the global sofa endpoints. Keep linked table joints together where possible. */
export function normalizeModuleComposition(value,entries=[],{layout}={}){
 const original=sanitizeModuleSequence(value),tables=(Array.isArray(entries)?entries:[]).map(entry=>({...entry,position:moduleTablePosition(original,entry)})),chaises=original.filter(node=>node.type==='chaise');
 if(chaises.length>2)return {modules:original,tables:remapTables(tables,original,original),moduleBuilderError:CHAISE_END_ERROR};
 if(!chaises.length)return {modules:original,tables:remapTables(tables,original,original)};
 let leftId=null,rightId=null;
 if(chaises.length===2){leftId=chaises[0].id;rightId=chaises[1].id;}
 else{
  const index=original.findIndex(node=>node.type==='chaise');
  const left=layout==='chaise-left'?true:layout==='chaise-right'?false:index===0?true:index===original.length-1?false:index<original.length-1-index;
  if(left)leftId=chaises[0].id;else rightId=chaises[0].id;
 }
 const leftIndex=original.findIndex(node=>node.id===leftId),rightIndex=original.findIndex(node=>node.id===rightId);
 const joints=new Set(tables.filter(entry=>['straight','angled','square','rectangle'].includes(entry.type)&&Number.isInteger(entry.position)).map(entry=>entry.position));
 // A predecessor cannot remain before a global left chaise, or a successor after a right chaise.
 if(leftIndex>0)joints.delete(leftIndex);
 if(rightIndex>=0&&rightIndex<original.length-1)joints.delete(rightIndex+1);
 const blocksFor=()=>{const blocks=[];let block=[];for(let index=0;index<original.length;index++){if(index&&!joints.has(index)){blocks.push(block);block=[];}block.push(original[index]);}if(block.length)blocks.push(block);return blocks;};
 let blocks=blocksFor();
 if(leftId&&rightId){
  const linked=blocks.find(block=>block.some(node=>node.id===leftId)&&block.some(node=>node.id===rightId));
  // A single linked block cannot surround other seats. Split its most central joint,
  // retaining the table attachments beside the chaises whenever there is a choice.
  if(linked&&blocks.length>1){
   const candidates=[];for(let position=leftIndex+1;position<=rightIndex;position++)if(joints.has(position))candidates.push(position);
   const centre=(leftIndex+rightIndex+1)/2;
   candidates.sort((a,b)=>Number(a===leftIndex+1||a===rightIndex)-Number(b===leftIndex+1||b===rightIndex)||Math.abs(a-centre)-Math.abs(b-centre));
   if(candidates.length)joints.delete(candidates[0]);
   blocks=blocksFor();
  }
 }
 const leftBlock=leftId?blocks.find(block=>block.some(node=>node.id===leftId)):null,rightBlock=rightId?blocks.find(block=>block.some(node=>node.id===rightId)):null;
 const ordered=[...(leftBlock?[leftBlock]:[]),...blocks.filter(block=>block!==leftBlock&&block!==rightBlock),...(rightBlock&&rightBlock!==leftBlock?[rightBlock]:[])];
 const modules=ordered.flat().map(copyNode);
 return {modules,tables:remapTables(tables,original,modules)};
}
function oldTables(state,modules){
 const entries=Array.isArray(state.tables)?state.tables:state.table&&state.table!=='none'?[{id:'wood-1',type:state.table,position:state.tablePosition}]:[];
 const explicit=sanitizeModuleSequence(state.modules).length>0,layout=state.layout,mainCount=modules.length-(String(layout).startsWith('corner-')?1:0);
 return entries.map(entry=>{
  let position=entry.position;
  if(!explicit){if(position==='return')position=layout==='corner-left'?1:mainCount;else if(typeof position==='number'&&layout==='corner-left')position++;else if(!position)position=Math.max(1,Math.floor(mainCount/2))+(layout==='corner-left'?1:0);}
  if(explicit)position=moduleTablePosition(modules,entry);
  return {...entry,position,...moduleTableAnchors(modules,position)};
 });
}
function migrated(state){const modules=deriveModuleSequence(state),normalized=normalizeModuleComposition(modules,oldTables(state,modules),state);return {...state,...normalized,moduleBuilderError:normalized.moduleBuilderError||'',moduleRotation:Array.isArray(state.modules)?moduleQuarterRotation(state.moduleRotation):state.layout==='corner-left'?1:0};}
function remapTables(entries,oldModules,newModules){
 const index=new Map(newModules.map((node,i)=>[node.id,i])),allowed=moduleTablePositionChoices(newModules).map(choice=>choice.value),occupied=new Set(),mapped=new Map();
 const anchorsFor=entry=>moduleTableAnchors(oldModules,moduleTablePosition(oldModules,entry));
 // Reserve every surviving physical pair before repairing a seam that had to change.
 for(const [order,entry]of entries.entries()){
  const anchors=anchorsFor(entry),before=index.get(anchors.beforeId),after=index.get(anchors.afterId);
  const position=before!==undefined&&after===before+1?after:anchors.beforeId===null&&after===0?'left-end':anchors.afterId===null&&before===newModules.length-1?'right-end':null;
  if(position!==null&&!occupied.has(position)){mapped.set(order,{...entry,position,...moduleTableAnchors(newModules,position)});occupied.add(position);}
 }
 return entries.map((entry,order)=>{
  if(mapped.has(order))return mapped.get(order);
  const anchors=anchorsFor(entry),before=index.get(anchors.beforeId),after=index.get(anchors.afterId),candidates=[];
  if(after!==undefined)candidates.push(after===0?'left-end':after);
  if(before!==undefined)candidates.push(before===newModules.length-1?'right-end':before+1);
  candidates.push(entry.position,...allowed.filter(value=>typeof value==='number'),...allowed);
  const position=candidates.find(value=>allowed.includes(value)&&!occupied.has(value))??allowed[0]??'left-end';
  occupied.add(position);return {...entry,position,...moduleTableAnchors(newModules,position)};
 });
}
function finishEdit(original,next){
 const plan=planModuleChain(next.layout,next.extra,next);
 if(plan.options.moduleBuilderError)return {...original,moduleBuilderError:plan.options.moduleBuilderError};
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
 if(current.moduleBuilderError)return {...state,moduleBuilderError:current.moduleBuilderError};
 const end=current.modules[side==='left'?0:current.modules.length-1];
 if(type==='chaise'&&end?.type==='chaise')return {...state,moduleBuilderError:'Bu uçta zaten bir dinlenme modülü var. Diğer ucu seçebilir veya oturum ekleyebilirsiniz.'};
 const node={id:'module-'+suffix,type},modules=current.modules.map(copyNode);
 let index=side==='left'?(type==='seat'&&end?.type==='chaise'?1:0):(type==='seat'&&end?.type==='chaise'?modules.length-1:modules.length);
 // Place a new seat inside the entire chaise-linked table block, preserving its joints.
 if(type==='seat'&&end?.type==='chaise'){const joints=new Set(current.tables.filter(entry=>Number.isInteger(entry.position)).map(entry=>entry.position));while(joints.has(index))index+=side==='left'?1:-1;}
 modules.splice(index,0,node);
 const chaiseCount=modules.filter(module=>module.type==='chaise').length,layout=type==='chaise'?(chaiseCount===2?'dual-chaise':'chaise-'+side):current.layout;
 return finishEdit(state,{...current,layout,modules,tables:remapTables(current.tables,current.modules,modules)});
}
/** At least one upholstered module remains; table IDs are never discarded. */
export function removeModule(state={},id){
 const current=migrated(state);if(current.modules.length<=1)return {...state,moduleBuilderError:'En az bir oturum modülü kalmalıdır.'};
 const modules=current.modules.filter(node=>node.id!==id);if(modules.length===current.modules.length)return {...state};
 const remainingCorners=(current.cornerTables??[]).filter(entry=>entry.moduleId!==id);
 if(sanitizeCornerTables(modules,remainingCorners).length!==remainingCorners.length)return {...state,moduleBuilderError:'Köşe sehpasının iki yanında birer oturum kalmalıdır. Önce köşe sehpasını kaldırabilir veya başka bir oturum ekleyebilirsiniz.'};
 const tables=remapTables(current.tables,current.modules,modules),positions=tables.map(entry=>entry.position);
 if(new Set(positions).size!==positions.length)return {...state,moduleBuilderError:'Bu modülü kaldırmadan önce yanındaki sehpalardan birini taşıyın.'};
 const chaises=modules.filter(module=>module.type==='chaise'),layout=chaises.length===1?(modules[0].id===chaises[0].id?'chaise-left':'chaise-right'):current.layout;
 return finishEdit(state,{...current,layout,modules,tables});
}

