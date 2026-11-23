const SKU_DATA='./assets/pricing/catalogue-skus.json?v=20261123-sku-v108';
export function skuForCard(data,key){
 const sku=data?.cardToPlacementSku?.[key],variantSku=data?.cardToVariantSku?.[key];
 return /^SOM-Y\d{4,}$/.test(sku??'')&&variantSku?.startsWith(sku+'-V')?{sku,variantSku}:null;
}
export function pricingHref({sku,variantSku}){return './pricing.html?sku='+encodeURIComponent(sku)+'&variant='+encodeURIComponent(variantSku);}
export async function initSKUDisplay(document=globalThis.document,options={}){
 const fetcher=options.fetcher??globalThis.fetch;let data;
 try{const response=await fetcher(SKU_DATA,{credentials:'same-origin'});if(!response.ok)return null;data=await response.json();}catch{return null;}
 function showCard(article){
  const identity=skuForCard(data,article.dataset.combination),container=article.querySelector('.combination-card-copy');if(!identity||!container||article.querySelector('[data-sku-display]'))return;
  const row=document.createElement('div'),sku=document.createElement('span'),link=document.createElement('a');row.className='catalogue-sku';row.dataset.skuDisplay='';sku.textContent=identity.sku;sku.setAttribute('aria-label','Yerleşim SKU '+identity.sku);link.textContent='Modüller ve fiyat';link.href=pricingHref(identity);link.setAttribute('aria-label',identity.sku+' modüllerini ve fiyatını incele');row.append(sku,link);container.querySelector('[data-layout-label]')?.after(row);
 }
 const grid=document.getElementById('combination-grid');
 if(grid){const render=()=>grid.querySelectorAll('article[data-combination]').forEach(showCard);render();const Observer=options.MutationObserver??globalThis.MutationObserver;if(Observer)new Observer(render).observe(grid,{childList:true,subtree:true});}
 let key;try{key=new URL(options.pageURL??globalThis.location.href).searchParams.get('model');}catch{}
 const identity=skuForCard(data,key),heading=document.getElementById('product-title');
 if(identity&&heading&&!document.querySelector('[data-product-sku]')){
  const box=document.createElement('div'),sku=document.createElement('p'),variant=document.createElement('p'),link=document.createElement('a');box.className='product-sku';box.dataset.productSku='';sku.className='product-placement-sku';sku.textContent='Yerleşim SKU · '+identity.sku;variant.className='product-variant-sku';variant.textContent='Varyant SKU · '+identity.variantSku;link.textContent='Modül listesi ve fiyat hesaplama →';link.href=pricingHref(identity);box.append(sku,variant,link);heading.after(box);
 }
 return data;
}
if(typeof document!=='undefined')initSKUDisplay();
