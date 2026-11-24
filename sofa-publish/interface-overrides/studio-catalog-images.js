/** Exact preset identity for studio images; editor-only wood IDs are excluded. */
export function studioImageSignature(card,choices){
 const state=card.state??{},summary=card.summary??card,dimensions=card.dimensions??summary.dimensions??{},modules=card.modulePlan??summary.modulePlan??[];
 const dye=(group,key)=>choices?.[group]?.[key]?.renderColor??choices?.[group]?.[key]?.color??null;
 const tables=Array.isArray(state.tables)?state.tables.map(entry=>[entry.type,entry.position,...(entry.type==='angled'&&entry.direction==='back'?['back']:[])]):state.table&&state.table!=='none'?[[state.table,state.tablePosition]]:[];
 return JSON.stringify({
  version:1,state:[state.body,state.accent,state.base,state.finish??'velvet',state.scene??'warm',state.layout,Number(state.extra)||0,state.back??'closed',state.tableDirection??'front'],
  tables,colors:[dye('body',state.body),dye('accent',state.accent),dye('base',state.base)],
  dimensions:[dimensions.widthCm,dimensions.depthCm,dimensions.heightCm],
  modules:modules.map(module=>[module.key,module.kind,module.widthCm,module.depthCm,module.heightCm,module.role,module.rotationDegrees,module.xCm,module.zCm,module.outlineCm??null])
 });
}

function localStudioSource(card,source){
 if(typeof source!=='string'||!/^inspiration-[a-z\d-]{1,80}$/.test(card.key??''))return false;
 const parts=source.split('?');
 const sourceKey=card.key.startsWith('inspiration-angled-v72-')?card.key.slice('inspiration-'.length):null;
 const exactAsset=parts[0]===`./assets/product-galleries/v132/${card.key}/hero.webp`||parts[0]===`./assets/product-galleries/v118/${card.key}/hero.webp`||parts[0]===`./assets/product-galleries/v102/${card.key}/hero.webp`||parts[0]===`./assets/product-galleries/all-v96/${card.key}/studio.webp`||parts[0]===`./assets/product-galleries/flat-v94/${card.key}.webp`||parts[0]===`./assets/studio/${card.key}.webp`||parts[0]===`./assets/product-galleries/cd-v71/${card.key}.webp`||(card.key==='inspiration-zeytin-double-angle'&&parts[0]==='./assets/product-galleries/angled-v72/angled-v72-s03-zeytin-oak.webp')||(card.key==='inspiration-single-both-zeytin'&&parts[0]==='./assets/product-galleries/single-both-v86/cift-kollu-tekli-zeytin.webp')||(sourceKey&&parts[0]===`./assets/product-galleries/angled-v72/${sourceKey}.webp`);
 return parts.length<=2&&exactAsset&&(parts.length===1||/^v=[a-z\d._-]{1,100}$/i.test(parts[1]));
}

/** Only an exact local image matching the current geometry and dyes may be used. */
export function matchingStudioImage(card,manifest,choices){
 const entries=manifest?.entries;
 if(!entries||typeof entries!=='object'||Array.isArray(entries)||!Object.hasOwn(entries,card.key))return null;
 const entry=entries[card.key];
 if(!entry||typeof entry!=='object'||Array.isArray(entry)||!localStudioSource(card,entry.src))return null;
 if(!Number.isInteger(entry.width)||!Number.isInteger(entry.height)||entry.width<320||entry.height<200||entry.width>4096||entry.height>4096)return null;
 if(typeof entry.signature!=='string'||entry.signature!==studioImageSignature(card,choices))return null;
 return {src:entry.src,width:entry.width,height:entry.height};
}

export function attachStudioImages(cards,manifest,choices){
 return cards.map(card=>{
  const studioImage=matchingStudioImage(card,manifest,choices);
  return studioImage?{...card,studioImage}:{...card,studioImage:null};
 });
}

/** Missing images never prevent the measured catalogue and live fallback from opening. */
export async function loadStudioImageManifest(fetcher=globalThis.fetch){
 try{
  const response=await fetcher('./assets/studio/catalogue-v69.json?v=20261124-reverse-v132',{credentials:'same-origin'});
  if(!response.ok)return null;
  const manifest=await response.json();
  return manifest&&typeof manifest==='object'&&!Array.isArray(manifest)?manifest:null;
 }catch{return null;}
}
