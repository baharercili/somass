import {applyProductSEO} from './product-seo.js?v=20261123-soff-v108';
import {mountProductTeamPack} from './team-pack.js?v=20261124-reverse-v132';
const MANIFEST='./assets/product-galleries/catalogue-v77.json?v=20261124-reverse-v132';
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


const subjectBoundsCache=new Map();
const GENERAL_IMAGE_ROLES=['open-back','right-rear','right-side','front','rear','top','hero'];
/** Detail and dimension views always retain their complete original image. */
export function productImageRole(item={}){
 const kind=String(item.kind||''),id=String(item.id||''),path=String(item.src||'').split('?')[0],stem=path.split('/').pop()?.replace(/\.[^.]+$/,'')||'';
 if(/dimension|measurement/.test(kind+' '+id+' '+stem))return 'dimensioned-top';
 if(/detail/.test(kind+' '+id+' '+stem))return 'detail';
 if(/(?:^|-)high-front$/.test(id)||stem==='high-front')return null;
 if(kind==='photographic-studio')return 'hero';
 if(kind==='open-back')return 'open-back';
 const legacy={'v73-01-on':'front','v73-05-arka':'rear','v73-06-sag-arka':'right-rear','v73-07-sag-yan':'right-side','v73-08-ust':'top','open-back-quarter-v80':'open-back'};
 return legacy[id]||GENERAL_IMAGE_ROLES.find(role=>stem===role||id.endsWith('-'+role))||null;
}
const median=values=>{values.sort((a,b)=>a-b);return values[Math.floor(values.length/2)];};
/** Read a small analysis canvas only; no source or download pixels are changed. */
export function imageSubjectBounds(image,document=globalThis.document){
 if(!image.complete||image.naturalWidth<100||image.naturalHeight<70)return null;
 const source=image.currentSrc||image.src;
 if(subjectBoundsCache.has(source))return subjectBoundsCache.get(source);
 let bounds=null,cacheable=false;
 try{
  const width=Math.min(320,image.naturalWidth),height=Math.round(width*image.naturalHeight/image.naturalWidth);
  if(width<100||height<70||!image.complete)throw Error('Image not ready');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,width,height);
  const pixels=context.getImageData(0,0,width,height).data,samples=[],corners=[[],[],[],[]],edge=Math.max(3,Math.round(Math.min(width,height)*.04));
  let drawn=false;for(let at=3;at<pixels.length;at+=4)if(pixels[at]){drawn=true;break;}if(!drawn)return null;
  cacheable=true;
  for(let y=0;y<height;y+=2)for(let x=0;x<width;x+=2){
   if(x>=edge&&x<width-edge&&y>=edge&&y<height-edge)continue;
   const at=(y*width+x)*4,pixel=[pixels[at],pixels[at+1],pixels[at+2]];samples.push(pixel);
   if(x<edge&&y<edge)corners[0].push(pixel);else if(x>=width-edge&&y<edge)corners[1].push(pixel);else if(x<edge&&y>=height-edge)corners[2].push(pixel);else if(x>=width-edge&&y>=height-edge)corners[3].push(pixel);
  }
  const colour=sample=>[0,1,2].map(channel=>median(sample.map(pixel=>pixel[channel]))),background=colour(samples),delta=pixel=>Math.max(...pixel.map((value,channel)=>Math.abs(value-background[channel]))),deviations=samples.map(delta);
  if(median(deviations)>4||deviations.filter(value=>value>12).length/samples.length>.05||corners.some(corner=>!corner.length||delta(colour(corner))>12))throw Error('Unreliable background');
  let left=width,top=height,right=-1,bottom=-1,foreground=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const at=(y*width+x)*4;
   if(Math.max(Math.abs(pixels[at]-background[0]),Math.abs(pixels[at+1]-background[1]),Math.abs(pixels[at+2]-background[2]))<18)continue;
   foreground++;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  const fraction=foreground/(width*height);
  if(fraction<.025||fraction>.75||left<width*.02||right>width*.98||top<height*.02||bottom>height*.98)throw Error('Uncertain subject extent');
  const pad=Math.ceil(width*.025);
  bounds=[Math.max(0,(left-pad)/width),Math.max(0,(top-pad)/height),Math.min(1,(right+1+pad)/width),Math.min(1,(bottom+1+pad)/height)];
  if((bounds[2]-bounds[0])*(bounds[3]-bounds[1])<.08)bounds=null;
 }catch{}
 if(cacheable){if(subjectBoundsCache.size>=96)subjectBoundsCache.delete(subjectBoundsCache.keys().next().value);subjectBoundsCache.set(source,bounds);}return bounds;
}
/** Fit the padded subject while accounting for object-fit:contain letterboxing. */
export function fitImageSubject(bounds,imageWidth,imageHeight,width,height){
 if(!Array.isArray(bounds)||bounds.length!==4||!bounds.every(Number.isFinite)||![imageWidth,imageHeight,width,height].every(value=>Number.isFinite(value)&&value>0))return null;
 const [left,top,right,bottom]=bounds;if(left<0||top<0||right>1||bottom>1||right<=left||bottom<=top)return null;
 const ratio=Math.min(width/imageWidth,height/imageHeight),drawWidth=imageWidth*ratio,drawHeight=imageHeight*ratio,ox=(width-drawWidth)/2,oy=(height-drawHeight)/2,margin=.04;
 const scale=Math.min((1-margin*2)*width/((right-left)*drawWidth),(1-margin*2)*height/((bottom-top)*drawHeight),2);
 if(scale<=1.01)return null;
 const clamp=(value,a,b)=>Math.max(Math.min(a,b),Math.min(Math.max(a,b),value)),cx=ox+(left+right)/2*drawWidth,cy=oy+(top+bottom)/2*drawHeight;
 let x=width/2-scale*cx,y=height/2-scale*cy;
 x=clamp(scale*ox+x,width-scale*drawWidth,0)-scale*ox;y=clamp(scale*oy+y,height-scale*drawHeight,0)-scale*oy;
 if(scale*(ox+left*drawWidth)+x<1||scale*(oy+top*drawHeight)+y<1||scale*(ox+right*drawWidth)+x>width-1||scale*(oy+bottom*drawHeight)+y>height-1)return null;
 return{scale,x,y};
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
  if(!text(value))continue;const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;
  const materialKey=label==='Ana kumaş'?product.state?.body:label==='Yastıklar'?product.state?.accent:null;
  if(typeof materialKey==='string'&&/^[a-z0-9-]+$/.test(materialKey)){const link=document.createElement('a');link.href='./material-gallery.html?material='+encodeURIComponent(materialKey);link.textContent=text(value);link.style.textDecoration='underline';link.style.textUnderlineOffset='.2em';link.setAttribute('aria-label',text(value)+' kumaşını ve tüm görsellerini incele');dd.append(link);}else dd.textContent=text(value);row.append(dt,dd);$('product-materials').append(row);
 }
 if(Array.isArray(product.moduleBreakdown)&&product.moduleBreakdown.length){
  for(const entry of product.moduleBreakdown){const li=document.createElement('li'),name=document.createElement('strong'),details=document.createElement('span'),count=Number(entry.count);name.textContent=(Number.isFinite(count)&&count>0?`${count} × `:'')+text(entry.label);const measures=[entry.widthCm,entry.depthCm,entry.heightCm].filter(value=>Number.isFinite(Number(value))).map(value=>String(value).replace('.',','));details.textContent=(entry.approximate?'Yaklaşık ':'')+(measures.length?measures.join(' × ')+' cm':'');li.append(name,details);$('module-list').append(li);}$('module-details').hidden=false;
 }
 const main=$('main-image'),dialog=$('image-lightbox'),large=$('lightbox-image'),enlarge=$('enlarge-image'),thumbs=[];
 const largeWrap=large.parentElement;largeWrap.style.overflow='hidden';
 function resetFrame(image){image.style.transform='';image.style.transformOrigin='';}
 async function frame(image,container,item){
  resetFrame(image);const role=productImageRole(item);
  if(!GENERAL_IMAGE_ROLES.includes(role)||!image.complete||!image.naturalWidth||!container.clientWidth||!container.clientHeight)return;
  const source=image.src,revision=loadToken;try{await image.decode();}catch{return;}
  if(source!==image.src||source!==(image.currentSrc||image.src)||revision!==loadToken)return;
  const fit=fitImageSubject(imageSubjectBounds(image,document),image.naturalWidth,image.naturalHeight,container.clientWidth,container.clientHeight);
  if(fit){image.style.transformOrigin='0 0';image.style.transform=`matrix(${fit.scale},0,0,${fit.scale},${fit.x},${fit.y})`;}
 }
 const refreshFrames=()=>{if(items[current]){frame(main,enlarge,items[current]);if(dialog.open)frame(large,largeWrap,items[current]);}};
 if(typeof ResizeObserver==='function'){const observer=new ResizeObserver(refreshFrames);observer.observe(enlarge);observer.observe(largeWrap);}else globalThis.addEventListener?.('resize',refreshFrames);
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
  resetFrame(main);resetFrame(large);
  main.onload=()=>{if(token!==loadToken)return;$('gallery-stage').setAttribute('aria-busy','false');$('image-status').textContent='';enlarge.disabled=false;frame(main,enlarge,item);};
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
 enlarge.addEventListener('click',()=>{if(!items.length||enlarge.disabled)return;lastOpener=document.activeElement;large.src=items[current].fullSrc;dialog.showModal();frame(large,largeWrap,items[current]);$('lightbox-close').focus();});
 $('lightbox-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{try{lastOpener?.focus({preventScroll:true});}catch{lastOpener?.focus();}});
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
 document.addEventListener('keydown',event=>{if(!dialog.open)return;if(event.key==='ArrowLeft'){event.preventDefault();step(-1);}if(event.key==='ArrowRight'){event.preventDefault();step(1);}});
 large.onerror=()=>{$('lightbox-status').textContent='Bu büyük görsel yüklenemedi. Diğer görselleri inceleyebilirsin.';};large.onload=()=>{$('lightbox-status').textContent='';if(dialog.open)frame(large,largeWrap,items[current]);};
 $('page-status').textContent='';$('product-content').hidden=false;if(items.length)show(0);else showEmpty();
 const teamPanel=mountProductTeamPack(product);
 const teamLink=document.getElementById('product-team-link');if(teamLink)teamLink.hidden=false;
 return{product,teamPanel,get currentIndex(){return current;},get availableCount(){return available().length;},show,step};
}

if(typeof document!=='undefined')initProductGallery().catch(()=>{const status=document.getElementById('page-status');status.textContent='Sayfa yüklenemedi. ';const link=document.createElement('a');link.href=location.href;link.textContent='Yeniden dene';status.append(link);});
