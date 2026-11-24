import {addNewFabricChoices} from './fabric-library.js?v=20261124-new-fabrics-v118';
import {sanitizeModuleSequence,moduleExtraCount,moduleQuarterRotation} from './module-chain.js?v=20261124-reverse-v132';
import {buildConsumerSummary} from './consumer-summary.js?v=20261124-reverse-v132';

import {sanitizeCompositionOptions} from './table-composition.js?v=20261124-reverse-v132';
import {sanitizeCornerTables} from './corner-table-composition.js?v=20261124-reverse-v132';

import {DEFAULT_TABLE_DESIGN,TABLE_DESIGN_IDS,normalizeTableDesign} from './sofa-table-designs.js?v=20261118-wood-modules-v65';

export const CONFIG_STORAGE_KEY='studio-sofa-config-v2';
export const TABLE_DESIGNS=TABLE_DESIGN_IDS;
export const COMBINATION_LAYOUTS=Object.freeze(['straight2','straight3','corner-left','corner-right','chaise-left','chaise-right','dual-chaise']);
const ALL_LAYOUTS=[...COMBINATION_LAYOUTS,'single-left','single-right','single-both'];
const MATERIAL_KEYS=['body','accent','base','finish','scene'];
const TABLE_TYPES=['none','straight','angled','square','rectangle'];
const NAMED_TABLE_POSITIONS=['return','left-end','right-end'];
export const DEFAULT_GALLERY_STATE=Object.freeze({body:'card-inci',accent:'card-bej',base:'oak',finish:'velvet',scene:'warm',layout:'straight2',extra:0,back:'closed',table:'none',terminal:'none',tableDesign:DEFAULT_TABLE_DESIGN,tableVariant:'standard',tablePosition:0,tableDirection:'front'});
const owns=(object,key)=>object!=null&&typeof key==='string'&&Object.hasOwn(object,key);
const clampExtra=moduleExtraCount;
const tableEntries=value=>Array.isArray(value)?value.filter(entry=>entry&&typeof entry==='object'&&!Array.isArray(entry)).map(entry=>({id:entry.id,type:entry.type,position:entry.position,...(entry.type==='angled'&&entry.direction==='back'?{direction:'back'}:{}),...(Object.hasOwn(entry,'beforeId')?{beforeId:entry.beforeId}:{}),...(Object.hasOwn(entry,'afterId')?{afterId:entry.afterId}:{})})):[];

/** The same legacy identifiers used by the configurator remain valid on shared links. */
export function createGalleryChoices(palette=[]){
 const choices={
  body:{ivory:{label:'Fildişi',color:'#dfd8ca'},sand:{label:'Kum',color:'#b7a18a'},sage:{label:'Adaçayı',color:'#7b8975'},terracotta:{label:'Kiremit',color:'#a4654f'},charcoal:{label:'Antrasit',color:'#41464a'},'card-inci':{label:'İnci',color:'#dfd8ca'}},
  accent:{taupe:{label:'Vizon',color:'#9e8b72'},cocoa:{label:'Kakao',color:'#604736'},olive:{label:'Zeytin',color:'#62694c'},ink:{label:'Gece',color:'#263646'},rust:{label:'Tarçın',color:'#a85f40'},'card-bej':{label:'Bej',color:'#cab99e'}},
  base:{oak:{label:'Naturel meşe',color:'#bc8f62'},'dark-oak':{label:'Koyu meşe',color:'#493324'},'black-oak':{label:'Siyah ahşap',color:'#242526'}},
  finish:{velvet:{label:'Mora kadife'}},
  scene:{warm:{label:'Sıcak stüdyo',color:'#e8e4dc'},light:{label:'Aydınlık',color:'#f1f2ef'},dark:{label:'Koyu stüdyo',color:'#343a3b'}}
 };
 const swatches=Array.isArray(palette)?palette:palette?.swatches;
 for(const swatch of Array.isArray(swatches)?swatches:[]){
  if(!swatch||typeof swatch.id!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(swatch.id)||typeof swatch.label!=='string'||!/^#[a-f0-9]{6}$/i.test(swatch.hex))continue;
  const entry={label:swatch.label.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,80),color:swatch.hex,renderColor:/^#[a-f0-9]{6}$/i.test(swatch.render_hex||'')?swatch.render_hex:swatch.hex,photoChip:swatch.photo_chip};
  choices.body['card-'+swatch.id]=entry;choices.accent['card-'+swatch.id]=entry;
 }
 return addNewFabricChoices(choices);
}

/** URL values override valid stored values, matching the existing configurator. */
export function readGalleryState(query='',storageSerialized='{}',choices=createGalleryChoices()){
 const state={...DEFAULT_GALLERY_STATE};let stored={};
 try{const value=typeof storageSerialized==='string'?JSON.parse(storageSerialized):storageSerialized;if(value&&typeof value==='object'&&!Array.isArray(value))stored=value;}catch{}
 for(const key of MATERIAL_KEYS)if(owns(choices[key],stored[key]))state[key]=stored[key];
 if(ALL_LAYOUTS.includes(stored.layout))state.layout=stored.layout;
 if(Number.isInteger(stored.extra))state.extra=clampExtra(stored.extra);
 if(TABLE_TYPES.includes(stored.table))state.table=stored.table;
 state.tableDesign=normalizeTableDesign(stored.tableDesign);
 state.tableVariant='standard';
 if(Number.isInteger(stored.tablePosition)||NAMED_TABLE_POSITIONS.includes(stored.tablePosition))state.tablePosition=stored.tablePosition;
 if(Array.isArray(stored.tables))state.tables=tableEntries(stored.tables);
 const storedModules=sanitizeModuleSequence(stored.modules);if(storedModules.length){state.modules=storedModules;state.moduleRotation=moduleQuarterRotation(stored.moduleRotation);}
 const storedCornerTables=sanitizeCornerTables(storedModules,stored.cornerTables);if(storedCornerTables.length)state.cornerTables=storedCornerTables;
 const params=new URLSearchParams(query);
 for(const key of MATERIAL_KEYS){const value=params.get(key);if(owns(choices[key],value))state[key]=value;}
 if(ALL_LAYOUTS.includes(params.get('layout')))state.layout=params.get('layout');
 if(params.has('extra')){const value=Number(params.get('extra'));state.extra=Number.isFinite(value)?clampExtra(value):0;}
 // A legacy shared layout opens with its original upholstered ends and no tables.
 if(params.has('table'))state.table=TABLE_TYPES.includes(params.get('table'))?params.get('table'):'none';
 else if(params.has('layout'))state.table='none';
 // An explicit collection wins, including an empty collection. Earlier shared
 // layouts remain independent of a newer multi-module draft on this device.
 if(params.has('tables')){
  const serialized=params.get('tables');let entries=[];
  try{entries=JSON.parse(serialized);}catch{}
  state.tables=tableEntries(entries);
 }else if(params.has('layout')||params.has('table'))delete state.tables;
 if(params.has('modules')){
  let modules=[];try{modules=sanitizeModuleSequence(JSON.parse(params.get('modules')));}catch{}
  if(modules.length){state.modules=modules;state.moduleRotation=moduleQuarterRotation(params.get('moduleRotation'));}else{delete state.modules;delete state.moduleRotation;}
 }else if(params.has('layout')){delete state.modules;delete state.moduleRotation;}
 else if(params.has('moduleRotation')&&state.modules)state.moduleRotation=moduleQuarterRotation(params.get('moduleRotation'));
 if(params.has('cornerTables')){
  let entries=[];try{entries=JSON.parse(params.get('cornerTables'));}catch{}
  const cornerTables=sanitizeCornerTables(state.modules??[],entries);if(cornerTables.length)state.cornerTables=cornerTables;else delete state.cornerTables;
 }else if(params.has('layout')||params.has('modules'))delete state.cornerTables;
 state.terminal='none';
 // Earlier links use the current default construction when no design was specified.
 if(params.has('tableDesign'))state.tableDesign=normalizeTableDesign(params.get('tableDesign'));
 else if(params.size)state.tableDesign=DEFAULT_TABLE_DESIGN;
 // Each construction has one current form; old variant names are retired.
 state.tableVariant='standard';
 // Earlier shared URLs retain their centre gap rather than the viewer's stored position.
 if(params.has('tablePosition')){const value=params.get('tablePosition');state.tablePosition=NAMED_TABLE_POSITIONS.includes(value)?value:/^\d+$/.test(value)?Number(value):0;}
 else if(params.size)state.tablePosition=0;
 // Earlier reverse selections use the single normal orientation.
 state.tableDirection='front';
 if(state.layout.startsWith('single-'))state.extra=0;
 Object.assign(state,sanitizeCompositionOptions(state.layout,state.extra,state));
 state.finish='velvet';state.back='closed';
 return state;
}

function queryFor(state,choices){
 const clean=readGalleryState('',state,choices),params=new URLSearchParams();
 for(const key of MATERIAL_KEYS)params.set(key,clean[key]);
 params.set('layout',clean.layout);params.set('extra',String(clean.extra));params.set('table',clean.table);params.set('terminal',clean.terminal);params.set('tableDesign',clean.tableDesign);params.set('tableVariant',clean.tableVariant);params.set('tablePosition',String(clean.tablePosition));params.set('tableDirection',clean.tableDirection);params.set('tables',JSON.stringify(clean.tables??[]));if(clean.modules){params.set('modules',JSON.stringify(clean.modules));params.set('moduleRotation',String(clean.moduleRotation));}if(clean.cornerTables?.length)params.set('cornerTables',JSON.stringify(clean.cornerTables));return params.toString();
}

/** Fixed relative destinations; caller input can never choose another origin or protocol. */
export function combinationHref(state,layout=state?.layout,choices=createGalleryChoices()){
 const clean=readGalleryState('',state,choices);
 if(ALL_LAYOUTS.includes(layout)){if(layout!==clean.layout){delete clean.modules;delete clean.moduleRotation;delete clean.cornerTables;}clean.layout=layout;}
 if(clean.layout.startsWith('single-'))clean.extra=0;
 return './index.html?'+queryFor(clean,choices);
}
export function galleryHref(state,choices=createGalleryChoices()){
 return './kombinasyonlar.html?'+queryFor(state,choices);
}

/** Apply a construction while keeping the current sofa, finishes and placement. */
export function tableDesignHref(state,tableDesign,choices=createGalleryChoices()){
 const design=normalizeTableDesign(tableDesign),table=design==='square-shelf'?'square':design==='half-shelf'?'rectangle':'angled';
 const chosen={...readGalleryState('',state,choices),tableDesign:design,table};
 const tables=(chosen.tables??[]).map(entry=>({...entry}));
 if(tables.length)tables[0].type=table;
 else tables.push({id:'wood-1',type:table,position:chosen.tablePosition});
 chosen.tables=tables;
 return combinationHref(chosen,chosen.layout,choices);
}

/** Each spec is one physical arrangement; handedness is an option within a card. */
export const GALLERY_COMBINATION_SPECS=Object.freeze([
 {layout:'straight2',extra:0},
 {layout:'straight3',extra:0},
 {layout:'chaise-left',extra:0},
 {layout:'corner-left',extra:0},
 {layout:'straight3',extra:1},
 {layout:'straight3',extra:2},
 {layout:'chaise-left',extra:1},
 {layout:'chaise-left',extra:2},
 {layout:'corner-left',extra:1},
 {layout:'corner-left',extra:2},
 {layout:'corner-left',extra:3},
 {layout:'dual-chaise',extra:0},
 {layout:'dual-chaise',extra:1},
 {layout:'dual-chaise',extra:2}
].map(spec=>Object.freeze(spec)));

function legacyCardState(state){const {modules,moduleRotation,...legacy}=state;return legacy;}
function arrangementFamily(layout){
 if(layout==='dual-chaise')return 'dual-chaise';
 if(layout==='straight2'||layout==='straight3')return 'straight';
 if(layout.startsWith('corner-'))return 'corner';
 if(layout.startsWith('chaise-'))return 'chaise';
 return 'single';
}

/** Dimensions and module positions have one source of truth: the selection summary. */
export function getGalleryCombinations(state={},choices=createGalleryChoices()){
 const current=readGalleryState('',state,choices),cardBase=legacyCardState(current),currentSummary=buildConsumerSummary(current,choices);
 const currentFamily=arrangementFamily(current.layout),previewSide=current.layout.endsWith('-right')?'right':'left';
 return GALLERY_COMBINATION_SPECS.map(spec=>{
  const family=arrangementFamily(spec.layout),hasDirection=family==='corner'||family==='chaise';
  const layoutKey=hasDirection?`${family}-${previewSide}`:spec.layout;
  const cardState=readGalleryState('',{...cardBase,layout:layoutKey,extra:spec.extra},choices),summary=buildConsumerSummary(cardState,choices);
  const count=summary.seatCount;
  const title=family==='straight'?summary.layoutLabel:family==='corner'?`${count} modüllü köşe`:family==='dual-chaise'?`${count} modüllü çift dinlenmeli kanepe`:`${count} modüllü dinlenmeli kanepe`;
  const directionOptions=hasDirection?[
   {label:'Sol',layoutKey:`${family}-left`,href:combinationHref({...cardBase,extra:spec.extra},`${family}-left`,choices)},
   {label:'Sağ',layoutKey:`${family}-right`,href:combinationHref({...cardBase,extra:spec.extra},`${family}-right`,choices)}
  ]:[];
  return{key:`${family}-${count}`,layoutKey,title,label:summary.layoutLabel,kind:summary.layoutKind,side:summary.side,additionalMiddleCount:spec.extra,isCurrent:!current.modules&&currentFamily===family&&currentSummary.seatCount===count,state:cardState,href:combinationHref(cardState,layoutKey,choices),summary,dimensions:summary.dimensions,footprintLabel:summary.footprintLabel,moduleCount:summary.moduleCount,seatCount:summary.seatCount,tableCount:summary.tableCount,tableDesign:summary.tableDesign,tableVariant:summary.tableVariant,tablePosition:summary.tablePosition,tableDirection:summary.tableDirection,modulePlan:summary.modulePlan,directionOptions};
 });
}
