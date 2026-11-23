import {applyProductSEO} from './product-seo.js?v=20261123-soff-v108';
import {mountProductTeamPack} from './team-pack.js?v=20261124-new-fabrics-v118';
const MANIFEST='./assets/product-galleries/catalogue-v77.json?v=20261124-new-fabrics-v118';
const text=value=>typeof value==='string'?value:typeof value?.label==='string'?value.label:'';

/** Only local image assets and the measured editor destination may be opened. */
export function safeAssetURL(value,base=globalThis.location?.href){
 if(typeof value!=='string'||!value||!base)return null;
 try{const root=new URL(base),url=new URL(value,root);if(url.origin!==root.origin||!['http:','https:'].includes(url.protocol)||!url.pathname.startsWith(new URL('./assets/',root).pathname)||! /\.(?:png|jpe?g|webp|avif)$/i.test(url.pathname))return null;return url.href;}catch{return null;}
}
export function safeEditorURL(value,base=globalThis.location?.href){
 if(typeof value!=='string'||!base)return null;
 try{const root=new URL(base),url=new URL(value,root);return url.origin===root.origin&&['http:','https:'].includes(url.protocol)&&[new URL('./',root).pathname,new URL('./index.html',root).pathname].includes(url.pathname)?url.href:null;}catch{return null;}
}
export function findProduct(manifest,key){
 if(!/^[a-z\d][a-z\d_-]{0,159}$/i.test(key??'')||!Array.isArray(manifest?.products))return null;
 const matches=manifest.products.filter(product=>product&&product.key===key);return matches.length===1?matches[0]:null;
}
export function galleryItems(product,base=globalThis.location?.href){
 if(!Array.isArray(product?.gallery))return[];
 const seen=new Set();return product.gallery.flatMap((item,index)=>{
  const src=safeAssetURL(item?.src,base),fullSrc=safeAssetURL(item?.fullSrc??item?.src,base);
  if(!src||!fullSrc||seen.has(fullSrc))return[];seen.add(fullSrc);
  return[{...item,src,fullSrc,thumbSrc:safeAssetURL(item?.thumbSrc??item?.src,base)??src,label:text(item.label)||`Stüdyo görünümü ${index+1}`,alt:text(item.alt)||`${text(product.title)} · ${text(item.label)||'Stüdyo görünümü'}`}];
 });
}

export async function initProductGallery(document=globalThis.document,options={}){
 const $=id=>document.getElementById(id),pageURL=options.pageURL??globalThis.location?.href,fetcher=options.fetcher??globalThis.fetch;
 const fail=(title,message)=>{$('page-status').textContent='';$('product-content').hidden=true;$('error-title').textContent=title;$('error-message').textContent=message;$('product-error').hidden=false;};
 let manifest;
 try{const response=await fetcher(MANIFEST,{credentials:'same-origin'});if(!response.ok)throw new Error('Catalogue unavailable');manifest=await response.json();}
 catch{fail('Kombinasyon yüklenemedi.','Biraz sonra yeniden deneyebilir veya diğer kombinasyonları inceleyebilirsin.');return null;}
 const key=new URL(pageURL).searchParams.get('model'),product=findProduct(manifest,key),editorHref=safeEditorURL(product?.editorHref,pageURL);
 if(!product||!editorHref){fail('Kombinasyon bulunamadı.','Diğer yerleşimleri inceleyerek koltuğunu oluşturabilirsin.');return null;}
 const originalTitle=text(product.title)||'Koltuk kombinasyonu',title=/^SOFF(?:\s|$)/i.test(originalTitle)?originalTitle:'SOFF · '+originalTitle,items=galleryItems(product,pageURL),failed=new Set();let current=0,loadToken=0,lastOpener=null;
 document.title=`${title} — Studio`;
 document.querySelector('meta[name="description"]').content=text(product.description)||`${title} kombinasyonunu stüdyo görselleri, ölçüleri ve malzemeleriyle incele.`;
 applyProductSEO(document,product,items);

 $('product-title').textContent=title;$('product-description').textContent=text(product.description);$('product-layout-label').textContent='SOFF · '+(text(product.layoutLabel)||'Modüler koltuk');
 $('product-dimensions').textContent=text(product.dimensionsLabel)||text(product.footprintLabel);$('product-count').textContent=text(product.moduleCountLabel);
 const order=document.querySelector('.dimension-order');order.textContent=text(product.dimensionsOrder)||((text(product.dimensionsLabel).match(/[×x]/g)||[]).length>=2?'Genişlik × derinlik × yükseklik':'Genişlik × derinlik');
 for(const id of ['product-editor-link','empty-editor-link'])$(id).href=editorHref;
 const materials=product.materials??{};
 for(const[label,value]of[['Kumaş',materials.fabric],['Ana kumaş',materials.body],['Yastıklar',materials.accent],['Ahşap',materials.wood]]){
  if(!text(value))continue;const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=text(value);row.append(dt,dd);$('product-materials').append(row);
 }
 if(Array.isArray(product.moduleBreakdown)&&product.moduleBreakdown.length){
  for(const entry of product.moduleBreakdown){const li=document.createElement('li'),name=document.createElement('strong'),details=document.createElement('span'),count=Number(entry.count);name.textContent=(Number.isFinite(count)&&count>0?`${count} × `:'')+text(entry.label);const measures=[entry.widthCm,entry.depthCm,entry.heightCm].filter(value=>Number.isFinite(Number(value))).map(value=>String(value).replace('.',','));details.textContent=(entry.approximate?'Yaklaşık ':'')+(measures.length?measures.join(' × ')+' cm':'');li.append(name,details);$('module-list').append(li);}$('module-details').hidden=false;
 }
 const main=$('main-image'),dialog=$('image-lightbox'),large=$('lightbox-image'),enlarge=$('enlarge-image'),thumbs=[];
 const available=()=>items.map((_,index)=>index).filter(index=>!failed.has(index));
 function showEmpty(unavailable=false){
  enlarge.hidden=true;$('gallery-empty').hidden=false;$('gallery-navigation').hidden=true;$('gallery-thumbnails').hidden=true;$('gallery-stage').setAttribute('aria-busy','false');$('image-status').textContent='';
  if(unavailable){$('gallery-empty').querySelector('h2').textContent='Kombinasyonu 3D incele.';$('gallery-empty').querySelector('p:not(.eyebrow)').textContent='Görseller şu anda yüklenemiyor. Koltuğunu üç boyutta incelemeye devam edebilirsin.';}
 }
 function navigation(){
  const indices=available(),position=indices.indexOf(current),counter=`${position+1} / ${indices.length}`;
  $('image-counter').textContent=counter;$('lightbox-counter').textContent=counter;
  for(const id of ['gallery-previous','gallery-next','lightbox-previous','lightbox-next'])$(id).disabled=indices.length<2;
  for(const[ordinal,button]of thumbs.entries()){button.setAttribute('aria-pressed',String(ordinal===current));button.disabled=failed.has(ordinal);}
  const active=thumbs[current],strip=$('gallery-thumbnails');
  if(active){const offset=active.getBoundingClientRect().left-strip.getBoundingClientRect().left+strip.scrollLeft;strip.scrollLeft=Math.max(0,offset-(strip.clientWidth-active.offsetWidth)/2);}
 }
 function show(index){
  const indices=available();if(!indices.length){if(dialog.open)dialog.close();showEmpty(true);return;}
  current=indices.includes(index)?index:indices[0];const item=items[current],token=++loadToken;
  $('gallery-empty').hidden=true;enlarge.hidden=false;$('gallery-navigation').hidden=false;$('gallery-thumbnails').hidden=items.length<2;
  $('gallery-stage').setAttribute('aria-busy','true');enlarge.disabled=true;$('image-status').textContent='Görsel yükleniyor…';$('image-label').textContent=item.label;
  main.onload=()=>{if(token!==loadToken)return;$('gallery-stage').setAttribute('aria-busy','false');$('image-status').textContent='';enlarge.disabled=false;};
  main.onerror=()=>{if(token!==loadToken)return;failed.add(current);show(available()[0]);};
  main.alt=item.alt;main.width=Number(item.width)||1536;main.height=Number(item.height)||1024;main.src=item.src;
  if(main.complete&&main.naturalWidth>0)main.onload();
  $('lightbox-title').textContent=`${title} · ${item.label}`;large.alt=item.alt;if(dialog.open)large.src=item.fullSrc;
  $('lightbox-download').href=item.fullSrc;$('lightbox-download').download=(item.fullSrc.split('/').pop()||'studio-gorseli.png').split('?')[0];$('lightbox-status').textContent='';navigation();
 }
 function step(direction){const indices=available(),position=indices.indexOf(current);if(indices.length)show(indices[(position+direction+indices.length)%indices.length]);}
 for(const[itemIndex,item]of items.entries()){
  const button=document.createElement('button'),image=document.createElement('img'),label=document.createElement('span');button.type='button';button.className='thumbnail-button';button.setAttribute('aria-label',`${item.label}, ${itemIndex+1}. görseli göster`);button.setAttribute('aria-pressed','false');image.alt='';image.loading=itemIndex<4?'eager':'lazy';image.decoding='async';image.width=156;image.height=104;image.src=item.thumbSrc;label.textContent=item.label;image.onerror=()=>{button.classList.add('is-unavailable');button.setAttribute('aria-label',`${item.label}, görseli aç`);};button.append(image,label);button.addEventListener('click',()=>show(itemIndex));thumbs.push(button);$('gallery-thumbnails').append(button);
 }
 $('gallery-previous').addEventListener('click',()=>step(-1));$('gallery-next').addEventListener('click',()=>step(1));$('lightbox-previous').addEventListener('click',()=>step(-1));$('lightbox-next').addEventListener('click',()=>step(1));
 enlarge.addEventListener('click',()=>{if(!items.length||enlarge.disabled)return;lastOpener=document.activeElement;large.src=items[current].fullSrc;dialog.showModal();$('lightbox-close').focus();});
 $('lightbox-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{try{lastOpener?.focus({preventScroll:true});}catch{lastOpener?.focus();}});
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
 document.addEventListener('keydown',event=>{if(!dialog.open)return;if(event.key==='ArrowLeft'){event.preventDefault();step(-1);}if(event.key==='ArrowRight'){event.preventDefault();step(1);}});
 large.onerror=()=>{$('lightbox-status').textContent='Bu büyük görsel yüklenemedi. Diğer görselleri inceleyebilirsin.';};large.onload=()=>{$('lightbox-status').textContent='';};
 $('page-status').textContent='';$('product-content').hidden=false;if(items.length)show(0);else showEmpty();
 const teamPanel=mountProductTeamPack(product);
 const teamLink=document.getElementById('product-team-link');if(teamLink)teamLink.hidden=false;
 return{product,teamPanel,get currentIndex(){return current;},get availableCount(){return available().length;},show,step};
}

if(typeof document!=='undefined')initProductGallery().catch(()=>{const status=document.getElementById('page-status');status.textContent='Sayfa yüklenemedi. ';const link=document.createElement('a');link.href=location.href;link.textContent='Yeniden dene';status.append(link);});
