import {applyApprovedStudioRefresh} from './catalogue-refresh-v178.js?v=191-04';
import {CONFIG_STORAGE_KEY,createGalleryChoices,readGalleryState,combinationHref} from './combinations-state.js?v=180-1';
import {getInspirationCatalog} from './inspiration-catalog.js?v=191-04';
import {attachStudioImages,loadStudioImageManifest} from './studio-catalog-images.js?v=191-04';
import {groupCatalogueVariants,isListedCatalogueVariant} from './catalogue-variants.js?v=191-04';

export const CATALOGUE_PAGE_SIZE=12;
const svgNS='http://www.w3.org/2000/svg';
const FILTER_VALUES=Object.freeze({kind:['all','straight','chaise','dual','corner','single'],tone:['all','neutral','warm','green','blue','deep'],sizeBand:['all','compact','medium','large'],base:['all','oak','dark-oak','black-oak'],fabric:['all','new'],collection:['all','reverse']});

export function filterCatalogue(cards,filters={}){
 return cards.filter(card=>(filters.collection!=='reverse'||card.reverseAngle===true)&&(filters.fabric!=='new'||card.newFabric===true)&&(!filters.kind||filters.kind==='all'||card.kind===filters.kind)&&(!filters.tone||filters.tone==='all'||card.tone===filters.tone)&&(!filters.sizeBand||filters.sizeBand==='all'||card.sizeBand===filters.sizeBand)&&(!filters.base||filters.base==='all'||card.state.base===filters.base));
}
export function cataloguePage(cards,requestedPage=1,pageSize=CATALOGUE_PAGE_SIZE){
 pageSize=Number.isSafeInteger(pageSize)&&pageSize>0?Math.min(CATALOGUE_PAGE_SIZE,pageSize):CATALOGUE_PAGE_SIZE;
 const totalPages=Math.max(1,Math.ceil(cards.length/pageSize)),page=Math.max(1,Math.min(totalPages,Math.floor(Number(requestedPage)||1))),offset=(page-1)*pageSize;
 return {items:cards.slice(offset,offset+pageSize),page,totalPages,total:cards.length,start:cards.length?offset+1:0,end:Math.min(offset+pageSize,cards.length)};
}
export function planFor(card,color,woodColor,document=globalThis.document){
 const svg=document.createElementNS(svgNS,'svg'),pieces=card.modulePlan.map(module=>{
  const angle=module.rotationDegrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),width=module.widthCm,depth=module.depthCm;
  const localPoints=module.outlineCm??[[-width/2,-depth/2],[width/2,-depth/2],[width/2,depth/2],[-width/2,depth/2]],corners=localPoints.map(([x,z])=>({x:module.xCm+x*c+z*s,z:module.zCm-x*s+z*c}));
  return {...module,localPoints,corners};
 });
 const points=pieces.flatMap(piece=>piece.corners),left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.z)),right=Math.max(...points.map(p=>p.x)),bottom=Math.max(...points.map(p=>p.z));
 svg.setAttribute('viewBox',[left-12,top-12,right-left+24,bottom-top+24].join(' '));svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
 for(const piece of pieces){
  const table=piece.kind==='table',polygon=table&&piece.outlineCm,shape=document.createElementNS(svgNS,polygon?'polygon':'rect');
  const geometry=polygon?{points:piece.localPoints.map(point=>point.join(',')).join(' ')}:{x:-piece.widthCm/2,y:-piece.depthCm/2,width:piece.widthCm,height:piece.depthCm,rx:table?2:7};
  for(const[key,value]of Object.entries({...geometry,fill:table?woodColor:color,stroke:table?'#68503a':'#617153','stroke-width':1.3,'vector-effect':'non-scaling-stroke',transform:`translate(${piece.xCm} ${piece.zCm}) rotate(${-piece.rotationDegrees})`}))shape.setAttribute(key,String(value));
  svg.append(shape);
 }
 return svg;
}
/** Update one existing article. Swatch buttons stay mounted so focus and scroll remain stable. */
export function updateCatalogueCard(article,card,choices,document=article.ownerDocument){
 article.dataset.layout=card.layoutKey;article.dataset.combination=card.key;article.dataset.kind=card.kind;
 for(const [name,value]of [['layoutSku',card.layoutSKU],['variantId',card.variantID]]){if(value)article.dataset[name]=value;else delete article.dataset[name];}
 article.id=card.key;
 article.querySelector('[data-title]').textContent=card.summary.layoutLabel||card.title;
 article.querySelector('[data-dimensions]').textContent=(card.dimensions.approximate?'Yaklaşık ':'')+card.footprintLabel;
 const plan=article.querySelector('[data-plan]');plan.replaceChildren(planFor(card,choices.body[card.state.body].color,choices.base[card.state.base].color,document));
 const materialSummary=article.querySelector('[data-material-summary]');
 const materials=[['Ana',choices.body[card.state.body]],['Yastık',choices.accent[card.state.accent]],['Ahşap',choices.base[card.state.base]]];
 const backFabric=card.state.backFabric;
 if(backFabric&&backFabric!==card.state.body){const back=choices.backFabric?.[backFabric]??choices.body[backFabric];if(back)materials.push(['Sırt',back]);}
 materialSummary.replaceChildren(...materials.map(([label,choice])=>{const item=document.createElement('span'),caption=document.createElement('span');caption.className='material-caption';caption.textContent=label+' ';item.append(caption,document.createTextNode(choice.label));return item;}));
 const productHref=card.productHref??'./urun.html?model='+encodeURIComponent(card.key);
 for(const selector of ['[data-combination-link]','[data-preview-link]'])article.querySelector(selector).href=productHref;
 const link=article.querySelector('[data-combination-link]'),count=article.querySelector('[data-gallery-count]'),galleryCount=Number.isSafeInteger(card.galleryCount)&&card.galleryCount>0?card.galleryCount:0;
 count.textContent=galleryCount?galleryCount+' görsel':'';count.hidden=!galleryCount;
 link.setAttribute('aria-label',(card.summary.layoutLabel||card.title)+' ürününü incele'+(galleryCount?' · '+galleryCount+' görsel':''));
 const image=article.querySelector('[data-preview]');
 image.alt=`${card.title}; ${materials.map(([label,choice])=>label.toLocaleLowerCase('tr')+' '+choice.label).join(', ')}.`;
 if(card.studioImage){image.width=card.studioImage.width;image.height=card.studioImage.height;}
 for(const button of article.querySelectorAll('[data-variant-key]'))button.setAttribute('aria-pressed',String(button.dataset.variantKey===card.key));
 const previous=article.querySelector('[data-previous-studio]');
 if(previous)previous.hidden=!card.studioImage?.previousStudio;
 // Refresh the existing pricing badge immediately; the SKU observer handles legacy identities.
 const badge=article.querySelector('[data-sku-display]');
 if(badge&&card.layoutSKU&&card.variantID){badge.textContent=card.layoutSKU;badge.href='./pricing.html?sku='+encodeURIComponent(card.layoutSKU)+'&variant='+encodeURIComponent(card.variantID);badge.setAttribute('aria-label',card.variantID+' modüllerini ve fiyatını incele');}
 return article;
}
export function makeCatalogueCard(card,choices,index,document=globalThis.document){
 const fragment=document.querySelector('#combination-template').content.cloneNode(true),article=fragment.querySelector('article');
 if(card.variants?.length>1){
  const box=article.querySelector('[data-variants]'),options=document.createElement('div');box.hidden=false;
  options.className='card-variant-options';options.setAttribute('role','group');options.setAttribute('aria-label',card.summary.layoutLabel+' renk ve malzeme seçenekleri');
  for(const variant of card.variants){
   const button=document.createElement('button');button.type='button';button.className='card-variant';button.dataset.variantKey=variant.key;
   const body=choices.body[variant.state.body],accent=choices.accent[variant.state.accent],wood=choices.base[variant.state.base];
   const back=variant.state.backFabric&&variant.state.backFabric!==variant.state.body?(choices.backFabric?.[variant.state.backFabric]??choices.body[variant.state.backFabric]):null;
   const description=body.label+' kumaş, '+accent.label+' yastık, '+wood.label+(back?', '+back.label+' sırt':'');
   button.title=description;button.setAttribute('aria-label',description);button.setAttribute('aria-pressed',String(variant.key===card.key));
   for(const [role,choice]of [['body',body],['accent',accent],['base',wood]]){const chip=document.createElement('span');chip.className='variant-chip variant-chip-'+role;chip.style.backgroundColor=choice.color;chip.setAttribute('aria-hidden','true');if(role!=='base'&&choice.photoChip)chip.style.backgroundImage=`url("${choice.photoChip}")`;button.append(chip);}
   options.append(button);
  }
  box.append(options);
 }
 const image=article.querySelector('[data-preview]');image.loading=index<3?'eager':'lazy';image.decoding='async';
 return updateCatalogueCard(article,card,choices,document);
}
const loadPreviews=async(...args)=>{const {renderCombinationPreviews}=await import('./combination-previews.js?v=20261122-open-travel-v95');return renderCombinationPreviews(...args);};

/** Only the visible page is rendered; a preset's own state always reaches the worker. */
export function createCatalogueController({cards,choices,elements,makeCard=makeCatalogueCard,updateCard=updateCatalogueCard,renderPreviews=loadPreviews,initialPage=1,initialFabric='all',initialCollection='all',onPageChange=()=>{}}){
 cards=cards.filter(isListedCatalogueVariant);
 const filters={kind:'all',tone:'all',sizeBand:'all',base:'all',fabric:initialCollection!=='reverse'&&initialFabric==='new'?'new':'all',collection:initialCollection==='reverse'?'reverse':'all'},staticImages=new Map(cards.filter(card=>card.studioImage).map(card=>[card.key,card.studioImage]));
 const cache=new Map([...staticImages].map(([key,image])=>[key,image.src])),loadedStatic=new Set(),rejectedStatic=new Set(),failed=new Set(),indices=new Map(cards.map((card,index)=>[card.key,index]));
 const selectedVariants=new Map();
 let page=initialPage,visible=[],nodes=new Map(),revision=0,controller=null,suspended=false,previewTask=Promise.resolve(),queueEpoch=null;
 function renderPageNumbers(totalPages){
  for(const container of [elements.pageNumbers,elements.pageNumbersTop].filter(Boolean)){
   const document=container.ownerDocument,focused=container.contains(document.activeElement)?document.activeElement?.dataset.catalogPage:null;
   const fragment=document.createDocumentFragment();
   for(let number=1;number<=totalPages;number++){
    const button=document.createElement('button');button.type='button';button.dataset.catalogPage=String(number);button.textContent=String(number);button.setAttribute('aria-label',`${number}. sayfa`);
    if(number===page)button.setAttribute('aria-current','page');
    button.addEventListener('click',()=>api.goToPage(number));fragment.append(button);
   }
   container.replaceChildren(fragment);
   if(focused)container.querySelector(`[data-catalog-page="${focused}"]`)?.focus({preventScroll:true});
  }
 }
 const applyPreview=(key,src)=>{
  const node=nodes.get(key);if(!node)return;
  const image=node.querySelector('[data-preview]'),visual=node.querySelector('.combination-visual'),epoch=revision,isStatic=staticImages.get(key)?.src===src;
  const current=()=>!suspended&&epoch===revision&&nodes.get(key)===node&&cache.get(key)===src;
  image.onload=()=>{if(!current())return;image.hidden=false;image.style.opacity='';visual.classList.add('has-preview');if(isStatic)loadedStatic.add(key);updateStatus();};
  image.onerror=()=>{
   if(!current())return;
   image.onload=null;image.onerror=null;image.hidden=true;image.style.opacity='';visual.classList.remove('has-preview');cache.delete(key);loadedStatic.delete(key);
   if(isStatic&&!rejectedStatic.has(key)){rejectedStatic.add(key);failed.delete(key);updateStatus();startPreviewQueue(epoch,controller.signal);}
   else{failed.add(key);updateStatus();}
  };
  // Lazy images need a layout box to load; opacity keeps the plan visible meanwhile.
  image.hidden=false;image.style.opacity=isStatic?'0':'';image.src=src;
  if(!isStatic){image.hidden=false;visual.classList.add('has-preview');}
  else if(image.complete&&image.naturalWidth>0)image.onload();
 };
 const updateStatus=()=>{
  if(!visible.length){elements.status.textContent='';return;}
  const complete=card=>cache.has(card.key)&&(cache.get(card.key)!==staticImages.get(card.key)?.src||loadedStatic.has(card.key));
  const completed=visible.filter(complete).length,errors=visible.filter(card=>failed.has(card.key)).length;
  const native=visible.every(card=>staticImages.has(card.key)&&!rejectedStatic.has(card.key));
  elements.status.textContent=completed===visible.length?(native?'Bu sayfadaki stüdyo görselleri hazır.':'Bu sayfadaki kombinasyonlar kendi renk ve ahşap seçimleriyle gösteriliyor.'):completed+errors===visible.length?'Bazı öneriler üstten yerleşim planıyla gösteriliyor. Her kombinasyonu üç boyutta açabilirsin.':`${native?'Stüdyo görselleri yükleniyor':'Bu sayfanın önizlemeleri hazırlanıyor'} · ${completed} / ${visible.length}`;
 };
 async function previews(items,epoch,signal){
  if(!items.length||signal.aborted)return;
  // The legacy worker lacks reverse geometry and the Soft Touch chenille shader; retain the measured plan and live 3D link.
  const keepMeasuredPlan=item=>item.newStudioReplaced||item.reverseAngle||['body','accent'].some(role=>choices?.[role]?.[item.state?.[role]]?.fabricSeries==='soft-touch');
  for(const item of items)if(keepMeasuredPlan(item))failed.add(item.key);
  items=items.filter(item=>!keepMeasuredPlan(item));
  if(!items.length){updateStatus();return;}
  try{
   await renderPreviews(items,items[0].state,choices,{signal,onPreview:(key,src)=>{
    if(signal.aborted||epoch!==revision||!nodes.has(key))return;
    cache.set(key,src);failed.delete(key);applyPreview(key,src);updateStatus();
   },onError:key=>{
    if(signal.aborted||epoch!==revision||!nodes.has(key))return;
    failed.add(key);updateStatus();
   }});
   if(signal.aborted||epoch!==revision)return;
   for(const item of items)if(!cache.has(item.key))failed.add(item.key);
   updateStatus();
  }catch{
   if(signal.aborted||epoch!==revision)return;
   for(const item of items)if(!cache.has(item.key))failed.add(item.key);
   updateStatus();
  }
 }
 function startPreviewQueue(epoch,signal){
  if(suspended||signal.aborted||epoch!==revision)return Promise.resolve();
  if(queueEpoch===epoch)return previewTask;
  if(!visible.some(card=>!cache.has(card.key)&&!failed.has(card.key)))return Promise.resolve();
  queueEpoch=epoch;
  previewTask=(async()=>{
   while(!suspended&&!signal.aborted&&epoch===revision){
    const pending=visible.filter(card=>!cache.has(card.key)&&!failed.has(card.key));
    if(!pending.length)break;
    await previews(pending,epoch,signal);
   }
  })().finally(()=>{if(queueEpoch===epoch)queueEpoch=null;});
  return previewTask;
 }
 function selectVariant(groupKey,key,button){
  const offset=visible.findIndex(card=>card.variantGroupKey===groupKey),current=visible[offset];
  const variant=current?.variants?.find(candidate=>candidate.key===key),node=current&&nodes.get(current.key);
  if(!variant||!node)return;
  // Selection changes neither the grid nor the swatch nodes. In particular, never empty the grid here.
  button.focus({preventScroll:true});
  if(current.key===key)return;
  const next={...variant,variantGroupKey:groupKey,variants:current.variants};
  selectedVariants.set(groupKey,key);visible[offset]=next;nodes.delete(current.key);nodes.set(key,node);
  updateCard(node,next,choices);
  const image=node.querySelector('[data-preview]');image.onload=null;image.onerror=null;image.hidden=true;image.style.opacity='';
  node.querySelector('.combination-visual').classList.remove('has-preview');
  if(cache.has(key))applyPreview(key,cache.get(key));
  updateStatus();previewTask=startPreviewQueue(revision,controller.signal);
 }
 function render(){
  controller?.abort();controller=new AbortController();const epoch=++revision;
  const matchingVariants=filterCatalogue(cards,filters),matching=groupCatalogueVariants(matchingVariants,selectedVariants),slice=cataloguePage(matching,page);page=slice.page;visible=slice.items;nodes=new Map();elements.grid.replaceChildren();
  for(const [offset,card]of visible.entries()){
   const node=makeCard(card,choices,slice.start-1+offset);nodes.set(card.key,node);elements.grid.append(node);
   for(const button of node.querySelectorAll('[data-variant-key]'))button.addEventListener('click',()=>selectVariant(card.variantGroupKey,button.dataset.variantKey,button));
   if(cache.has(card.key))applyPreview(card.key,cache.get(card.key));
  }
  elements.count.textContent=`${matching.length} farklı yerleşim · ${matchingVariants.length} renk ve malzeme seçeneği`+(matching.length?` · ${slice.start}–${slice.end} gösteriliyor`:'');
  elements.pageStatus.textContent=`${page} / ${slice.totalPages}`;elements.previous.disabled=page<=1;elements.next.disabled=page>=slice.totalPages;elements.pagination.hidden=matching.length<=CATALOGUE_PAGE_SIZE;elements.empty.hidden=matching.length!==0;elements.grid.hidden=matching.length===0;
  if(elements.paginationTop)elements.paginationTop.hidden=elements.pagination.hidden;
  renderPageNumbers(slice.totalPages);onPageChange(page,{...filters});elements.newFabricButton?.setAttribute('aria-pressed',String(filters.fabric==='new'));elements.reverseAngleButton?.setAttribute('aria-pressed',String(filters.collection==='reverse'));
  for(const button of elements.kindButtons)button.setAttribute('aria-pressed',String(button.dataset.combinationFilter===filters.kind));
  for(const name of ['tone','sizeBand','base'])elements.selects[name].value=filters[name];
  elements.reset.hidden=Object.values(filters).every(value=>value==='all');updateStatus();
  previewTask=startPreviewQueue(epoch,controller.signal);
 }
 const api={
  setFilter(name,value){if(!FILTER_VALUES[name]?.includes(value)||filters[name]===value)return;filters[name]=value;if(name==='fabric'&&value==='new')filters.collection='all';if(name==='collection'&&value==='reverse')filters.fabric='all';page=1;render();},
  resetFilters(){for(const name of Object.keys(filters))filters[name]='all';page=1;render();},
  goToPage(value){const next=cataloguePage(groupCatalogueVariants(filterCatalogue(cards,filters),selectedVariants),value).page;if(next===page)return;page=next;render();elements.catalogue.scrollIntoView?.({block:'start'});},
  suspend(){suspended=true;revision++;controller?.abort();},
  resume(){if(!suspended)return;suspended=false;render();},
  get previewTask(){return previewTask;},
  get snapshot(){return{filters:{...filters},page,visibleKeys:visible.map(card=>card.key),cached:cache.size,failed:failed.size,studioLoaded:loadedStatic.size};}
 };
 for(const button of elements.kindButtons)button.addEventListener('click',()=>api.setFilter('kind',button.dataset.combinationFilter));
 for(const name of ['tone','sizeBand','base'])elements.selects[name].addEventListener('change',event=>api.setFilter(name,event.target.value));
 elements.previous.addEventListener('click',()=>api.goToPage(page-1));elements.next.addEventListener('click',()=>api.goToPage(page+1));
 elements.newFabricButton?.addEventListener('click',()=>api.setFilter('fabric',filters.fabric==='new'?'all':'new'));
 elements.reverseAngleButton?.addEventListener('click',()=>api.setFilter('collection',filters.collection==='reverse'?'all':'reverse'));
 for(const button of elements.resetButtons)button.addEventListener('click',()=>api.resetFilters());
 render();return api;
}

export async function initCatalogue(document=globalThis.document){
 const $=selector=>document.querySelector(selector);
 const [palette,studioManifest,legacyProductManifest]=await Promise.all([fetch('./assets/velvet/palette.json?v=20261117-soft-velvet-v58b').then(response=>{if(!response.ok)throw new Error('Palette unavailable');return response.json();}),loadStudioImageManifest(),fetch('./assets/product-galleries/catalogue-v77.json?v=191-04',{credentials:'same-origin'}).then(response=>response.ok?response.json():null).catch(()=>null)]);
 const productManifest=applyApprovedStudioRefresh(legacyProductManifest,studioManifest?.approvedStudioRefresh);
 const products=new Map((Array.isArray(productManifest?.products)?productManifest.products:[]).filter(product=>product&&typeof product.key==='string').map(product=>[product.key,product]));
 const choices=createGalleryChoices(palette),cards=attachStudioImages(getInspirationCatalog(choices,studioManifest?.approvedStudioRefresh),studioManifest,choices).map(card=>({...card,productHref:'./urun.html?model='+encodeURIComponent(card.key),galleryCount:Array.isArray(products.get(card.key)?.gallery)?products.get(card.key).gallery.length:null}));
 // The previous draft is only a return destination; it never influences the catalogue.
 let stored='{}';try{stored=localStorage.getItem(CONFIG_STORAGE_KEY)||'{}';}catch{}
 const draft=readGalleryState(location.search,stored,choices),backHref=combinationHref(draft,draft.layout,choices);
 $('#gallery-brand-link').href='./ana-sayfa.html';for(const id of ['gallery-builder-link','gallery-footer-link'])$('#'+id).href=backHref;
 const requestedPage=Number(new URLSearchParams(location.search).get('page')),initialPage=Number.isSafeInteger(requestedPage)&&requestedPage>0?requestedPage:1;
 const controller=createCatalogueController({cards,choices,initialPage,initialFabric:new URLSearchParams(location.search).get('fabric'),initialCollection:new URLSearchParams(location.search).get('collection'),onPageChange:(page,filters)=>{try{const url=new URL(location.href);if(filters.collection==='reverse')url.searchParams.set('collection','reverse');else url.searchParams.delete('collection');if(filters.fabric==='new')url.searchParams.set('fabric','new');else url.searchParams.delete('fabric');if(page===1)url.searchParams.delete('page');else url.searchParams.set('page',String(page));if(url.href!==location.href)history.replaceState(history.state,'',url.href);}catch{}},elements:{newFabricButton:$('#catalog-new-fabrics'),reverseAngleButton:$('#catalog-reverse-angles'),grid:$('#combination-grid'),count:$('#combination-count'),status:$('#gallery-preview-status'),pageStatus:$('#catalog-page-status'),pageNumbers:$('#catalog-page-numbers'),pageNumbersTop:$('#catalog-page-numbers-top'),previous:$('#catalog-previous'),next:$('#catalog-next'),pagination:$('#catalog-pagination'),paginationTop:$('#catalog-pagination-top'),empty:$('#catalog-empty'),reset:$('#catalog-reset'),catalogue:$('#catalogue-top'),kindButtons:[...document.querySelectorAll('[data-combination-filter]')],selects:{tone:$('#catalog-tone'),sizeBand:$('#catalog-size'),base:$('#catalog-wood')},resetButtons:[...document.querySelectorAll('[data-catalog-reset]')]}});
 window.addEventListener('pagehide',()=>controller.suspend());window.addEventListener('pageshow',event=>{if(event.persisted)controller.resume();});return controller;
}
if(typeof document!=='undefined')initCatalogue().catch(()=>{
 const status=document.querySelector('#gallery-preview-status');status.textContent='Renkler ve kombinasyonlar yüklenemedi. ';const reload=document.createElement('a');reload.href=location.href;reload.textContent='Sayfayı yeniden yükle';status.append(reload);
});
