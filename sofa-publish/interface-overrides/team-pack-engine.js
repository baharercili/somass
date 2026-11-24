import {makeProductZip,checkAbort,yieldToPage} from './team-pack-zip.js?v=20261121-team-pack-v79';
import {productFileStem,createTeamPackFiles} from './team-pack.js?v=20261124-soft-touch-lines-v134-v05';

let cachedKey='',generated=new Map();
function productCache(product){if(cachedKey!==product.key){cachedKey=product.key;generated=new Map();}return generated;}
const textBlob=(value,type='text/plain')=>new Blob([value],{type:type+';charset=utf-8'});
async function documents(){return import('./product-pack-documents.js?v=20261124-reverse-v132');}
function readme(product,files){return `${product.title} — STUDIO ÜRÜN PAKETİ\n\nBu paket ${product.key} kombinasyonuna aittir.\n\nModel/ : Parçaları ve modülleri ayrı GLB. Birim metre; dikey eksen Y.\nOlculer/ : Toplam dış ölçüleri ve modülleri gösteren PNG ve vektör SVG plan.\nRenderlar/ : Bu ürün sayfasındaki mevcut stüdyo görselleri, tam dosya boyutunda.\nUrun-Ozeti.html : Tarayıcıda çevrimdışı açılabilen malzeme ve ölçü özeti.\nUrun-Verisi.json : Seçimler, ölçüler, dosya listesi ve paket dosyalarının SHA-256 değerleri.\n\nToplam dış ölçü: ${product.dimensionsLabel||product.footprintLabel}\n\nGLB mevcut konfigüratör geometrisini korur; yeniden modellenmiş üretim CAD dosyası değildir. Parçalar birleştirilmez. Kumaş, ahşap ve metal standart PBR malzemeleriyle aktarılır. Tarayıcıya özel kadife ve üç eksenli doku karışımının görünümü farklı 3D programlarda bir miktar değişebilir.\n\nÖlçü planı santimetredir. Planlanan dış ölçüler yuvarlanmıştır; döşemenin yumuşak konturu ölçü zarfından farklı olabilir. Uygulama/üretim öncesi teknik ölçüler ayrıca doğrulanmalıdır.\n\n${files.filter(file=>file.kind==='render').length} mevcut stüdyo görseli bu pakete dahildir. ${files.some(file=>file.kind==='render')?'':'Bu kombinasyon için henüz stüdyo görseli yoktur; model, ölçü planı ve özet dahildir.'}\n\nÜrün sayfası: ${new URL('./urun.html?model='+encodeURIComponent(product.key),location.href).href}\nKonfigüratör: ${new URL(product.editorHref,location.href).href}\n`;} 
async function pngFromSVG(svg,signal){
 checkAbort(signal);const url=URL.createObjectURL(textBlob(svg,'image/svg+xml')),image=new Image();
 try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Ölçü planı görüntülenemedi.'));image.src=url;});checkAbort(signal);const canvas=document.createElement('canvas');canvas.width=2400;canvas.height=Math.round(2400*(image.naturalHeight||image.height)/(image.naturalWidth||image.width));const context=canvas.getContext('2d');if(!context)throw new Error('Ölçü görseli hazırlanamadı.');context.drawImage(image,0,0,canvas.width,canvas.height);return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Ölçü görseli kaydedilemedi.')),'image/png'));}finally{URL.revokeObjectURL(url);}
}
async function assetBlob(file,signal){
 const url=new URL(file.url,location.href);if(url.origin!==location.origin||!url.pathname.startsWith(new URL('./assets/',location.href).pathname)||! /\.(png|jpe?g|webp|avif)$/i.test(url.pathname))throw new Error('Görsel adresi geçersiz.');
 const response=await fetch(url,{credentials:'same-origin',signal});if(!response.ok)throw new Error('Görsel yüklenemedi.');const blob=await response.blob();if(!blob.size||!/^image\//i.test(blob.type))throw new Error('Görsel dosyası geçersiz.');return blob;
}
export async function prepareProductFile({product,file,files=[],signal,onProgress}={}){
 checkAbort(signal);if(!files.length)files=createTeamPackFiles(product);const cache=productCache(product);const cacheable=file.id==='model'||file.id.startsWith('dimensions-');if(cacheable&&cache.has(file.id))return{blob:cache.get(file.id),filename:file.filename};let blob;
 if(file.url){blob=await assetBlob(file,signal);return{blob,filename:file.filename};}
 if(file.id==='model'){
  onProgress?.({phase:'model',label:'Modüller ve malzemeler yükleniyor…'});await yieldToPage();const{exportProductGLB}=await import('./product-glb-export.js?v=20261124-soft-touch-lines-v134-v05');const result=await exportProductGLB(product,{signal,onProgress:update=>onProgress?.({phase:"model",label:update.message||"Modelin parçaları hazırlanıyor…",...(Number.isFinite(update.progress)?{percent:Math.round(update.progress*100)}:{})})});blob=result instanceof Blob?result:new Blob([result],{type:'model/gltf-binary'});
 }else if(file.id.startsWith('dimensions-')){
  onProgress?.({phase:'dimensions'});const{buildDimensionSVG}=await documents();const svg=buildDimensionSVG(product);blob=file.id==='dimensions-svg'?textBlob(svg,'image/svg+xml'):await pngFromSVG(svg,signal);
 }else if(file.id==='summary-html'){
  onProgress?.({phase:'summary'});const{buildProductSummaryHTML}=await documents();blob=textBlob(buildProductSummaryHTML(product,{packageFiles:files}),'text/html');
 }else if(file.id==='summary-json'){
  const{buildProductMetadata}=await documents();blob=textBlob(JSON.stringify(buildProductMetadata(product),null,2),'application/json');
 }else if(file.id==='readme')blob=textBlob(readme(product,files));
 else throw new Error('Dosya türü bulunamadı.');
 checkAbort(signal);if(cacheable)cache.set(file.id,blob);return{blob,filename:file.filename};
}
export async function prepareProductPackage({product,files,signal,onProgress}={}){
 checkAbort(signal);if(!product?.key||!Array.isArray(files)||!files.length)throw new Error('Ürün dosyaları bulunamadı.');
 const entries=[],folder=productFileStem(product),checks=[];const ordered=[...files.filter(file=>file.id!=='summary-json')];let rendered=0;
 for(const file of ordered){
  checkAbort(signal);if(file.url)onProgress?.({phase:'renders',label:'Ürünün görselleri ekleniyor…',completed:++rendered,total:ordered.filter(item=>item.url).length});
  const{blob}=await prepareProductFile({product,file,files,signal,onProgress});checkAbort(signal);const bytes=await blob.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes),sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  entries.push({path:folder+'/'+file.path,blob});checks.push({path:file.path,label:file.label,format:file.format,bytes:blob.size,sha256});await yieldToPage();
 }
 const{buildProductMetadata}=await documents(),metadata={...buildProductMetadata(product),package:{format:'ZIP',modelUnits:'metres',measurementUnits:'centimetres',files:checks,checksumNote:'Bu JSON dosyasının kendisi sağlama listesine dahil değildir.'}};
 const metadataFile=files.find(file=>file.id==='summary-json');if(!metadataFile)throw new Error('Ürün verisi eksik.');entries.push({path:folder+'/'+metadataFile.path,blob:textBlob(JSON.stringify(metadata,null,2),'application/json')});
 onProgress?.({phase:'archive',label:'Dosyalar tek pakette toplanıyor…'});const blob=await makeProductZip(entries,{signal,onProgress});checkAbort(signal);return{blob,filename:folder+'-Ekip-Paketi.zip'};
}
