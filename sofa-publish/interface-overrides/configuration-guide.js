import {compositionFootprint,getTablePositionChoices,planSofaComposition,sanitizeCompositionOptions} from './table-composition.js?v=20261127-configurator-v180';

const LAYOUTS=new Set(['straight2','straight3','corner-left','corner-right','chaise-left','chaise-right','dual-chaise','single-left','single-right','single-both']);
const validLayout=value=>LAYOUTS.has(value)?value:'straight2';
const svgNS='http://www.w3.org/2000/svg';
const safeColor=(value,fallback)=>/^#[a-f\d]{6}$/i.test(value||'')?value:fallback;

/** Families keep the initial decision separate from the sofa's handedness. */
export function layoutFamily(layout){
 const value=validLayout(layout);
 if(value==='dual-chaise')return 'dual';
 if(value.startsWith('corner-'))return 'corner';
 if(value.startsWith('chaise-'))return 'chaise';
 if(value.startsWith('single-'))return 'single';
 return 'straight';
}
export const layoutSide=layout=>validLayout(layout)==='single-both'?'both':validLayout(layout).endsWith('-right')?'right':'left';
export function layoutForFamily(family,currentLayout='straight2'){
 const current=validLayout(currentLayout),side=layoutSide(current)==='right'?'right':'left';
 if(family==='straight')return current==='straight3'?'straight3':'straight2';
 if(family==='dual')return 'dual-chaise';
 if(family==='single')return layoutFamily(current)==='single'?current:'single-both';
 if(['corner','chaise'].includes(family))return family+'-'+side;
 return current;
}
export function layoutForSide(layout,side){
 const current=validLayout(layout),family=layoutFamily(current);
 if(!['corner','chaise','single'].includes(family)||!(family==='single'?['left','right','both']:['left','right']).includes(side))return current;
 return family+'-'+side;
}

export function shortPosition(value){
 if(value==='left-end')return 'Sol bitiş';
 if(value==='right-end')return 'Sağ bitiş';
 if(value==='return')return 'Köşe dönüşü';
 return `${value}–${value+1} arası`;
}
export function positionWoodModule(entry,position){const {beforeId,afterId,...rest}=entry;return {...rest,position};}
export const sameWoodModules=(expected,actual)=>Array.isArray(actual)&&actual.length===expected.length&&expected.every(entry=>actual.some(item=>item.id===entry.id&&item.type===entry.type&&item.position===entry.position&&(item.direction??'front')===(entry.direction??'front')));
export const nextWoodId=entries=>'wood-'+(Math.max(0,...entries.map(entry=>Number(String(entry.id).split('-')[1])||0))+1);
export function validWoodModules(state,entries){
 const candidate=sanitizeCompositionOptions(state.layout,state.extra,{...state,tables:entries});
 return !candidate.moduleBuilderError&&sameWoodModules(entries,candidate.tables)?candidate:null;
}
export function findWoodModuleSlot(state,type='rectangle',id=nextWoodId(state.tables||[])){
 const entries=state.tables||[],occupied=new Set(entries.map(entry=>entry.position));
 for(const choice of getTablePositionChoices(state.layout,state.extra,state)){
  if(occupied.has(choice.value))continue;
  const next=[...entries,{id,type,position:choice.value}],candidate=validWoodModules(state,next);
  if(candidate)return {entry:candidate.tables.find(entry=>entry.id===id),options:candidate};
 }
 return null;
}
/** Keep existing slots first; move only modules whose old slot no longer exists. */
export function reflowWoodModules(state,entries=state.tables||[]){
 const slots=getTablePositionChoices(state.layout,state.extra,state).map(choice=>choice.value),reserved=new Map(),accepted=[],moved=[],removed=[];
 for(const entry of entries)if(slots.includes(entry.position)&&!reserved.has(entry.position))reserved.set(entry.position,entry.id);
 for(const entry of entries){
  const opposite=entry.position==='left-end'?'right-end':entry.position==='right-end'?'left-end':null;
  const positions=[entry.position,opposite,...slots].filter((position,index,list)=>position!==null&&slots.includes(position)&&list.indexOf(position)===index);
  let placed=false;
  for(const position of positions){
   if(accepted.some(other=>other.position===position)||(reserved.has(position)&&reserved.get(position)!==entry.id))continue;
   const next=[...accepted,positionWoodModule(entry,position)],candidate=validWoodModules(state,next);
   if(!candidate)continue;
   accepted.push(candidate.tables.find(item=>item.id===entry.id));if(position!==entry.position)moved.push(entry.id);placed=true;break;
  }
  if(!placed){removed.push(entry.id);if(reserved.get(entry.position)===entry.id)reserved.delete(entry.position);}
 }
 return {tables:accepted,moved,removed};
}
function makePlan(document,plan,wood,activeId){
 const svg=document.createElementNS(svgNS,'svg'),allPoints=plan.parts.flatMap(compositionFootprint),xs=allPoints.map(p=>p[0]),zs=allPoints.map(p=>p[1]);
 const minX=Math.min(...xs),minZ=Math.min(...zs),width=Math.max(...xs)-minX,depth=Math.max(...zs)-minZ,padding=.10;
 svg.classList.add('placement-plan');svg.setAttribute('viewBox',`${minX-padding} ${minZ-padding} ${width+padding*2} ${depth+padding*2}`);svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
 for(const part of plan.parts){
  const table=part.kind==='table',shape=document.createElementNS(svgNS,table&&part.outline?'polygon':'rect');
  if(table&&part.outline)shape.setAttribute('points',part.outline.map(p=>p.join(',')).join(' '));
  else for(const[key,value]of Object.entries({x:-part.width/2,y:-part.depth/2,width:part.width,height:part.depth,rx:.065}))shape.setAttribute(key,String(value));
  const active=table&&part.tableId===activeId;
  for(const[key,value]of Object.entries({fill:table?(active?wood:'#bcb7aa'):'#e5e8de',stroke:table?(active?'#513b26':'#8c877a'):'#849079','stroke-width':active?2:1,'vector-effect':'non-scaling-stroke',transform:`translate(${part.x} ${part.z}) rotate(${-part.rotation*180/Math.PI})`}))shape.setAttribute(key,String(value));
  shape.dataset.moduleType=part.type;shape.dataset.kind=part.kind;if(table)shape.dataset.tableId=part.tableId;svg.append(shape);
 }
 return svg;
}

/** Native buttons use the app's existing composition event handler. */
export function createPlacementGuide(container){
 let signature='',cards=[];
 return {update(state={},choices={},activeId){
  if(!container)return;
  const normalized=sanitizeCompositionOptions(state.layout,state.extra,state),entries=normalized.tables||[],active=entries.find(entry=>entry.id===activeId)||entries[0];
  if(!active){if(signature!=='none'){container.replaceChildren();cards=[];signature='none';}return;}
  activeId=active.id;
  const wood=safeColor(choices.base?.[state.base]?.color,'#bc8f62'),positions=getTablePositionChoices(state.layout,state.extra,{...state,...normalized}).filter(option=>{
   if(entries.some(entry=>entry.id!==active.id&&entry.position===option.value))return false;
   return Boolean(validWoodModules(state,entries.map(entry=>entry.id===active.id?positionWoodModule(entry,option.value):entry)));
  });
  // A selection-only change updates pressed states without replacing focusable nodes.
  const nextSignature=JSON.stringify([state.layout,state.extra,state.modules,state.moduleRotation,active.id,wood,entries.map(entry=>[entry.id,entry.type,entry.id===active.id?null:entry.position,...(entry.direction==='back'?['back']:[])]),positions.map(option=>[option.value,option.label])]);
  if(nextSignature!==signature){
   const previousPosition=container.contains(container.ownerDocument.activeElement)?container.ownerDocument.activeElement.closest('[data-composition-value]')?.dataset.compositionValue:null;
   const document=container.ownerDocument,fragment=document.createDocumentFragment();cards=[];
   for(const option of positions){
    const candidate=validWoodModules(state,entries.map(entry=>entry.id===active.id?positionWoodModule(entry,option.value):entry));
    const button=document.createElement('button'),label=document.createElement('span'),check=document.createElement('span'),plan=planSofaComposition(state.layout,state.extra,{...state,...candidate});
    button.type='button';button.className='placement-card';button.dataset.compositionGroup='tablePosition';button.dataset.compositionValue=String(option.value);button.setAttribute('aria-label',option.label);button.title=option.label;
    label.className='placement-card-label';label.textContent=shortPosition(option.value);
    check.className='placement-card-check';check.textContent='✓';check.setAttribute('aria-hidden','true');
    button.append(makePlan(document,plan,wood,active.id),label,check);cards.push({button,value:option.value});fragment.append(button);
   }
   container.replaceChildren(fragment);signature=nextSignature;
   if(previousPosition!==null)cards.find(card=>String(card.value)===previousPosition)?.button.focus({preventScroll:true});
  }
  for(const {button,value}of cards){const selected=value===active.position;button.setAttribute('aria-pressed',String(selected));button.classList.toggle('is-active',selected);}
 }};
}

