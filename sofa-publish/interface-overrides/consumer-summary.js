import {selectedFabricDescription} from './approved-fabrics.js?v=20261127-configurator-v180';
import {moduleExtraCount} from './module-chain.js?v=20261127-configurator-v180';
import {getTableProfile} from './sofa-table-profiles.js?v=20261124-reverse-v132';

import {planSofaComposition,getTablePositionChoices} from './table-composition.js?v=20261127-configurator-v180';

import {SOFA_TABLE_DESIGNS,normalizeTableDesign} from './sofa-table-designs.js?v=20261118-wood-modules-v65';

const LAYOUTS=Object.freeze({
 'straight2':{label:'Üçlü koltuk',kind:'straight'},
 'straight3':{label:'Dörtlü koltuk',kind:'straight'},
 'corner-left':{label:'Sol köşe',kind:'corner',side:'left'},
 'corner-right':{label:'Sağ köşe',kind:'corner',side:'right'},
 'chaise-left':{label:'Sol dinlenmeli kanepe',kind:'chaise',side:'left'},
 'chaise-right':{label:'Sağ dinlenmeli kanepe',kind:'chaise',side:'right'},
 'dual-chaise':{label:'Çift dinlenmeli kanepe',kind:'chaise',side:null},
 'single-left':{label:'Sol kollu modül',kind:'single',side:'left'},
 'single-right':{label:'Sağ kollu modül',kind:'single',side:'right'},
 'single-both':{label:'Çift kollu tekli koltuk',kind:'single',side:'both'}
});
const MODULE_LABELS=Object.freeze({
 end_L:'Sol kollu oturum modülü',end_R:'Sağ kollu oturum modülü',single_both:'Çift kollu tekli oturum modülü',
 middle:'Kolsuz ara modül',chaise_middle:'Kolsuz dinlenme modülü',chaise_both:'Çift kollu dinlenme modülü',chaise_L:'Sol kollu dinlenme modülü',chaise_R:'Sağ kollu dinlenme modülü',
 corner_L:'Köşe modülü',corner_R:'Köşe modülü',
 table_angled:'Açılı ara sehpa',table_square:'Kare ahşap modül',table_rectangle:'Dikdörtgen ahşap modül'
});
const centimetres=value=>Math.round(value*100);
const cleanText=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,160):'';
const materialLabel=(choices,group,key)=>cleanText(choices?.[group]?.[key]?.label)||'Seçilmedi';
const coordinateCm=value=>Math.round(value*1e8)/1e6||0;
function moduleFor(part){
 const key=part.type,outline=part.outline?{outlineCm:part.outline.map(([x,z])=>[coordinateCm(x),coordinateCm(z)])}:{},cm=part.kind==='table'?value=>Math.round(value*1000)/10:centimetres;return{...outline,...(part.tableId?{tableId:part.tableId}:{}),...(part.tableDirection==='back'?{tableDirection:'back'}:{}),...(part.moduleId?{moduleId:part.moduleId,logicalType:part.logicalType}:{}),key,label:part.kind==='table'?(SOFA_TABLE_DESIGNS[part.tableDesign]?.label||MODULE_LABELS[key]||'Sehpa'):MODULE_LABELS[key],kind:part.kind,widthCm:cm(part.width),depthCm:cm(part.depth),heightCm:cm(part.height),seatHeightCm:centimetres(part.seatHeight??.42),approximate:Boolean(part.approximate),role:part.role,rotationDegrees:Math.round(part.rotation*180/Math.PI*1e6)/1e6||0,xCm:coordinateCm(part.x),zCm:coordinateCm(part.z)};
}

/** Customer-facing selection data. No DOM, rendering bounds, storage or side effects. */
export function buildConsumerSummary(state={},choices={}){
 const layoutKey=Object.hasOwn(LAYOUTS,state.layout)?state.layout:'straight2',layout=LAYOUTS[layoutKey];
 const numericExtra=Number(state.extra),extra=layout.kind==='single'?0:moduleExtraCount(numericExtra);
 const plan=planSofaComposition(layoutKey,extra,state),modulePlan=plan.parts.map(moduleFor),counts=new Map();
 for(const module of modulePlan){if(!counts.has(module.key))counts.set(module.key,{key:module.key,label:module.label,kind:module.kind,count:0,widthCm:module.widthCm,depthCm:module.depthCm,heightCm:module.heightCm,approximate:module.approximate});counts.get(module.key).count++;}
 const moduleBreakdown=[...counts.values()],dimensions={widthCm:centimetres(plan.width),depthCm:centimetres(plan.depth),heightCm:Math.max(...modulePlan.map(module=>module.heightCm)),seatHeightCm:42,approximate:modulePlan.some(module=>module.approximate)};
 const seatCount=plan.seatCount,tableCount=plan.tableCount,countLabel=tableCount?`${seatCount} oturum modülü · ${tableCount} sehpa`:`${seatCount} modül`;
 const hasCornerTable=Boolean(plan.options.cornerTables?.length),table=hasCornerTable&&plan.options.table==='none'?'square':plan.options.table,terminal=plan.options.terminal,tableDesign=normalizeTableDesign(hasCornerTable&&plan.options.table==='none'?'square-shelf':plan.options.tableDesign),tableVariant='standard',tableVariantLabel='';
 const tableCm=value=>(value*100).toLocaleString('tr-TR',{maximumFractionDigits:1}),positionChoices=getTablePositionChoices(layoutKey,extra,plan.options);
 const cornerTables=plan.parts.filter(part=>part.cornerConnector).map(part=>({id:part.tableId,type:'square',position:part.tablePosition,moduleId:part.moduleId,cornerConnector:true}));
 const selectedTables=[...(plan.options.tables??(table!=='none'?[{id:'wood-1',type:table,position:plan.options.tablePosition}]:[])),...cornerTables];
 const tables=selectedTables.map(entry=>{
  const profile=getTableProfile(entry.type),dimensions=profile.dimensions,label=SOFA_TABLE_DESIGNS[profile.design]?.label||'Ahşap modül';
  return {...entry,tableDesign:profile.design,label,positionLabel:entry.cornerConnector?'Köşe dönüşünde · kare açık raflı sehpa':positionChoices.find(option=>option.value===entry.position)?.label||'',widthCm:Math.round(dimensions.width*1000)/10,depthCm:Math.round(dimensions.depth*1000)/10,heightCm:Math.round(dimensions.height*1000)/10,dimensionsLabel:`${tableCm(dimensions.width)} × ${tableCm(dimensions.depth)} × ${tableCm(dimensions.height)} cm`+(entry.type==='angled'?(entry.direction==='back'?' · 30° dışa açılım · geniş kenar önde':' · 30° açılım'):'')};
 });
 const designs=new Map();for(const entry of tables){const previous=designs.get(entry.type);if(previous)previous.count++;else designs.set(entry.type,{label:entry.label,count:1});}
 const tableDesignLabel=[...designs.values()].map(entry=>(entry.count>1?entry.count+' × ':'')+entry.label).join(' · '),compositionLabel=tableDesignLabel;
 const tablePosition=hasCornerTable&&plan.options.table==='none'?cornerTables[0].position:plan.options.tablePosition,tablePositionLabel=tables.length===1?tables[0].positionLabel:tables.map((entry,index)=>`${index+1}. modül: ${entry.positionLabel}`).join(' · ');
 const tableDirection=plan.options.tableDirection,tableDirectionLabel=tableDirection==='back'?'Geniş kenar önde':'';
 const tableVariantDimensionsLabel=tables.length===1?tables[0].dimensionsLabel:tables.map((entry,index)=>`${index+1}. ${entry.label}: ${entry.dimensionsLabel}`).join(' · '),tableDimensionsLabel=tableVariantDimensionsLabel;
 const side=layout.side==='left'?'soldadır':'sağdadır';
 const endPlacement=tables.some(entry=>['left-end','right-end'].includes(entry.position)),orientationHint=plan.custom?'Modüller sol serbest uçtan sağ serbest uca seçtiğiniz sırayla yerleşir.':layoutKey==='dual-chaise'?'Her iki yanda dinlenme bölümü bulunur.':layout.kind==='corner'?`Koltuğa karşıdan bakıldığında dönüş ${side}.`:layout.kind==='chaise'?`Koltuğa karşıdan bakıldığında dinlenme bölümü ${side}.`:layoutKey==='single-both'?'Her iki yanda kol bulunur.':layout.kind==='single'?(endPlacement?`Ahşap modül, koltuğa karşıdan bakıldığında ${tablePosition==='left-end'?'sol':'sağ'} bitiştedir.`:`Koltuğa karşıdan bakıldığında kol ${side}.`):'';
 const materials={...selectedFabricDescription(state,choices),body:materialLabel(choices,'body',state.body),accent:materialLabel(choices,'accent',state.accent),wood:materialLabel(choices,'base',state.base)};
 if(tableCount)materials.tableDesign=tableDesignLabel;
 const footprintLabel=`${dimensions.widthCm} × ${dimensions.depthCm} cm`,dimensionsLabel=`${dimensions.widthCm} × ${dimensions.depthCm} × ${dimensions.heightCm} cm`;
 const layoutLabel=hasCornerTable?`Kare sehpalı ${seatCount} modüllü ${modulePlan.some(part=>part.key.startsWith('chaise_'))?'dinlenmeli köşe':'köşe'}`:plan.custom?`${seatCount} modüllü özel kanepe`:layout.kind==='straight'?(tables.some(entry=>entry.type==='angled'&&entry.direction==='back')?(seatCount===2?'İkili koltuk':seatCount===3?'Üçlü koltuk':seatCount===4?'Dörtlü koltuk':`${seatCount} modüllü düz kanepe`):(seatCount===2?'Üçlü koltuk':seatCount===3?'Dörtlü koltuk':`${seatCount} modüllü düz kanepe`)):layoutKey==='single-both'?layout.label:layout.kind==='single'&&endPlacement?'Ahşap bitişli tek modül':layout.label;
 const summary={...(plan.custom?{modules:plan.options.modules.map(module=>({...module})),moduleRotation:plan.options.moduleRotation,conflicts:plan.conflicts.map(conflict=>({...conflict}))}:{}),layoutKey,layoutLabel,layoutKind:plan.custom?'custom':layout.kind,side:plan.custom?null:layout.side??null,additionalMiddleCount:extra,middleCount:modulePlan.filter(module=>module.key==='middle').length,moduleCount:plan.moduleCount,seatCount,tableCount,countLabel,table,tables,terminal,tableDesign,tableDesignLabel,tableVariant,tableVariantLabel,tableVariantDimensionsLabel,tableDimensionsLabel,tablePosition,tablePositionLabel,tableDirection,tableDirectionLabel,compositionLabel,modulePlan,moduleBreakdown,dimensions,footprintLabel,dimensionsLabel,dimensionOrder:'Genişlik × derinlik × yükseklik',dimensionNote:dimensions.approximate?'Köşe modülünün yaklaşık 118 × 118 cm dış ölçüsü üzerinden hesaplanır.':'Yerleşim için modüllerin dış ölçüleri esas alınır.',orientationHint,materials};
 summary.shareText=buildSelectionText(summary);
 return summary;
}

/** Plain text suitable for a downloaded selection or a copied message. */
export function buildSelectionText(summary,{url}={}){
 const lines=['Koltuk seçimim',`Yerleşim: ${cleanText(summary.layoutLabel)}`,`${summary.dimensions?.approximate?'Yaklaşık toplam ölçü':'Toplam ölçü'}: ${cleanText(summary.dimensionsLabel)} (genişlik × derinlik × yükseklik)`,`Oturum yüksekliği: ${Number(summary.dimensions?.seatHeightCm)||42} cm`];
 if(summary.orientationHint)lines.push(cleanText(summary.orientationHint));
 if(summary.compositionLabel)lines.push(`Sehpa seçimi: ${cleanText(summary.compositionLabel)}`);
 if(summary.tableDimensionsLabel)lines.push(`Sehpa ölçüleri: ${cleanText(summary.tableDimensionsLabel)}`);
 if(summary.tablePositionLabel)lines.push(`Sehpa konumu: ${cleanText(summary.tablePositionLabel)}`);
 if((summary.tables?.length??0)>1){lines.push('',`Ahşap modüller (${summary.tables.length} adet):`);for(const [index,entry]of summary.tables.entries())lines.push(`${index+1}. ${cleanText(entry.label)} · ${cleanText(entry.dimensionsLabel)} · ${cleanText(entry.positionLabel)}`);}
 const writeModules=modules=>{for(const module of modules)lines.push(`• ${Number(module.count)||0} × ${cleanText(module.label)} (${Number(module.widthCm)||0} × ${Number(module.depthCm)||0}${module.kind==='table'?' × '+module.heightCm:''} cm${module.approximate?', yaklaşık':''})`);};
 const modules=summary.moduleBreakdown??[];
 if(summary.tableCount){lines.push('',`Oturum modülleri (${Number(summary.seatCount)||0} adet):`);writeModules(modules.filter(module=>module.kind!=='table'));lines.push('',`Sehpalar (${Number(summary.tableCount)||0} adet):`);writeModules(modules.filter(module=>module.kind==='table'));}
 else{lines.push('',`Modüller (${Number(summary.moduleCount)||0} adet):`);writeModules(modules);}
 const materials=summary.materials??{};lines.push('',`Kumaş: ${cleanText(materials.fabric)||'Kadife'}`,`Ana kumaş rengi: ${cleanText(materials.body)||'Seçilmedi'}`,`Yastık rengi: ${cleanText(materials.accent)||'Seçilmedi'}`,`Ahşap: ${cleanText(materials.wood)||'Seçilmedi'}`);
 if(summary.dimensions?.approximate)lines.push('',cleanText(summary.dimensionNote));
 if(url){try{const parsed=new URL(url);if(parsed.protocol==='https:'||parsed.protocol==='http:')lines.push('',`Seçim bağlantısı: ${parsed.href}`);}catch{}}
 return lines.join('\n');
}

