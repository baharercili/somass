import {loadApprovedStudioRefresh,approvedStudioProduct} from './catalogue-refresh-v178.js?v=191-04';
const SKU_DATA='./assets/pricing/catalogue-skus.json?v=191-04';
export function skuForProduct(product){
 const sku=product?.layoutSKU,variantSku=product?.variantID;
 return /^SOM-Y\d{4,}$/.test(sku??'')&&new RegExp('^'+sku+'-V\\d{3,}$').test(variantSku??'')?{sku,variantSku}:null;
}
export function skuForCard(data,key,refresh=null){
 const current=skuForProduct(approvedStudioProduct(key,refresh)?.product);if(current)return current;
 return skuForProduct({layoutSKU:data?.cardToPlacementSku?.[key],variantID:data?.cardToVariantSku?.[key]});
}
export function pricingHref({sku,variantSku}){return './pricing.html?sku='+encodeURIComponent(sku)+'&variant='+encodeURIComponent(variantSku);}
export async function initSKUDisplay(document=globalThis.document,options={}){
 const fetcher=options.fetcher??globalThis.fetch;
 const [data,refresh]=await Promise.all([
  (async()=>{try{const response=await fetcher(SKU_DATA,{credentials:'same-origin'});return response.ok?await response.json():null;}catch{return null;}})(),
  loadApprovedStudioRefresh(fetcher)
 ]);
 function showCard(article){
  const identity=skuForProduct({layoutSKU:article.dataset.layoutSku,variantID:article.dataset.variantId})??skuForCard(data,article.dataset.combination,refresh),container=article.querySelector('.combination-visual');if(!container)return;
  let badge=article.querySelector('[data-sku-display]');
  if(!identity){badge?.remove();return;}
  if(!badge){badge=document.createElement('a');badge.className='catalogue-sku';badge.dataset.skuDisplay='';container.append(badge);}
  if(badge.textContent!==identity.sku)badge.textContent=identity.sku;if(badge.getAttribute('href')!==pricingHref(identity))badge.href=pricingHref(identity);badge.title='Modüller ve fiyat';badge.setAttribute('aria-label',identity.variantSku+' modüllerini ve fiyatını incele');
 }
 const grid=document.getElementById('combination-grid');
 if(grid){const render=()=>grid.querySelectorAll('article[data-combination]').forEach(showCard);render();const Observer=options.MutationObserver??globalThis.MutationObserver;if(Observer)new Observer(render).observe(grid,{childList:true,subtree:true,attributes:true,attributeFilter:['data-combination','data-layout-sku','data-variant-id']});}
 let key;try{key=new URL(options.pageURL??globalThis.location.href).searchParams.get('model');}catch{}
 const identity=skuForCard(data,key,refresh),heading=document.getElementById('product-title');
 if(identity&&heading&&!document.querySelector('[data-product-sku]')){
  const box=document.createElement('div'),sku=document.createElement('p'),variant=document.createElement('p'),link=document.createElement('a');box.className='product-sku';box.dataset.productSku='';sku.className='product-placement-sku';sku.textContent='Yerleşim SKU · '+identity.sku;variant.className='product-variant-sku';variant.textContent='Varyant SKU · '+identity.variantSku;link.textContent='Modül listesi ve fiyat hesaplama →';link.href=pricingHref(identity);box.append(sku,variant,link);heading.after(box);
 }
 return data;
}
if(typeof document!=='undefined')initSKUDisplay();
