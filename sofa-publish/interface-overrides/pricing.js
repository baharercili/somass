export const SKU_CATALOGUE_URL='./assets/pricing/catalogue-skus.json?v=20261124-reverse-v132';
export const PRICE_STORAGE_KEY='studio-sofa-module-prices-v108';
const money=new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});
const normalise=value=>String(value??'').toLocaleLowerCase('tr-TR').replace(/ı/g,'i').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const label=value=>typeof value==='string'?value:typeof value?.label==='string'?value.label:'';
// Round decimal digits before multiplication, so a half-cent never depends on binary floats.
const decimalCents=text=>{const [whole,fraction='']=text.split('.');return Number(BigInt(whole)*100n+BigInt((fraction+'00').slice(0,2))+(fraction[2]>='5'?1n:0n));};
const cents=value=>decimalCents(String(value));
export function parseUnitPrice(value){
 if(value===null||value===undefined||String(value).trim()==='')return null;
 if(typeof value==='number'){if(!Number.isFinite(value)||value<0||value>1000000000)return NaN;return value<.005?0:cents(value)/100;}
 let text=String(value).trim().replace(/[\s\u00a0]/g,'');
 if(text.length>64||!/^\d[\d.,]*$/.test(text))return NaN;
 const comma=text.lastIndexOf(','),dot=text.lastIndexOf('.');
 if(comma>=0&&dot>=0){if(comma>dot){if(!/^\d{1,3}(?:\.\d{3})*,\d+$/.test(text))return NaN;text=text.replace(/\./g,'').replace(',','.');}else{if(!/^\d{1,3}(?:,\d{3})*\.\d+$/.test(text))return NaN;text=text.replace(/,/g,'');}}
 else if(comma>=0){if(!/^\d+,\d+$/.test(text))return NaN;text=text.replace(',','.');}
 else if(dot>=0){if(/^[1-9]\d{0,2}(?:\.\d{3})+$/.test(text))text=text.replace(/\./g,'');else if(!/^\d+\.\d+$/.test(text))return NaN;}
 const number=Number(text);return Number.isFinite(number)&&number>=0&&number<=1000000000?cents(number)/100:NaN;
}
export function validateCatalogue(data){
 if(!Array.isArray(data?.modules)||!data.modules.length||!Array.isArray(data?.placements)||!data.placements.length)throw new Error('SKU listesi eksik.');
 const moduleSkus=new Set(),placementSkus=new Set(),variantSkus=new Set();
 for(const module of data.modules){if(!/^SOM-M\d{3,}$/.test(module.sku)||moduleSkus.has(module.sku))throw new Error('Modül SKU listesi geçersiz.');moduleSkus.add(module.sku);}
 for(const placement of data.placements){
  if(!/^SOM-Y\d{4,}$/.test(placement.sku)||placementSkus.has(placement.sku)||!Array.isArray(placement.bom)||!placement.bom.length||!Array.isArray(placement.variants)||!placement.variants.length)throw new Error('Yerleşim listesi geçersiz.');placementSkus.add(placement.sku);
  for(const line of placement.bom)if(!moduleSkus.has(line.moduleSku)||!Number.isSafeInteger(line.quantity)||line.quantity<1)throw new Error('Modül adetleri geçersiz.');
  for(const variant of placement.variants){if(!variant.sku?.startsWith(placement.sku+'-V')||variantSkus.has(variant.sku))throw new Error('Varyant SKU listesi geçersiz.');variantSkus.add(variant.sku);}
 }
 return data;
}
export function calculatePlacement(placement,prices={}){
 let totalCents=0,missing=0;
 const lines=placement.bom.map(line=>{
  const parsed=parseUnitPrice(prices[line.moduleSku]),unitPrice=Number.isFinite(parsed)?parsed:null;
  const lineCents=unitPrice===null?null:cents(unitPrice)*line.quantity;
  if(lineCents===null)missing++;else totalCents+=lineCents;
  return {...line,unitPrice,lineTotal:lineCents===null?null:lineCents/100};
 });
 return {lines,missing,total:missing?null:totalCents/100};
}
export function loadSavedPrices(storage,modules){
 const allowed=new Set(modules.map(module=>module.sku));let saved;
 try{saved=JSON.parse(storage?.getItem(PRICE_STORAGE_KEY)||'{}');}catch{return {};}
 if(saved?.version!==108||saved.currency!=='TRY'||!saved.prices||Array.isArray(saved.prices))return {};
 return Object.fromEntries(Object.entries(saved.prices).filter(([sku,value])=>allowed.has(sku)&&typeof value==='number'&&Number.isFinite(parseUnitPrice(value))));
}
export function searchPlacements(placements,query){const search=normalise(query).trim();return placements.filter(p=>!search||normalise(p.sku+' '+p.label+' '+p.variants.map(v=>v.sku).join(' ')).includes(search));}
const dimensions=value=>value?(value.approximate?'Yaklaşık ':'')+['widthCm','depthCm','heightCm'].map(key=>Number(value[key])).filter(Number.isFinite).map(n=>String(n).replace('.',',')).join(' × ')+' cm':'';
export function safeProductHref(value,base=globalThis.location?.href??'https://baharercili.github.io/somass/sofa/pricing.html'){
 try{const root=new URL(base),url=new URL(value,root),directory=root.pathname.slice(0,root.pathname.lastIndexOf('/')+1);return url.origin===root.origin&&url.pathname===directory+'urun.html'&&/^[a-z\d_-]+$/i.test(url.searchParams.get('model')??'')?url.href:'./kombinasyonlar.html';}catch{return './kombinasyonlar.html';}
}

export async function initPricing(document=globalThis.document,options={}){
 const $=id=>document.getElementById(id),fetcher=options.fetcher??globalThis.fetch;
 let catalogue;
 try{const response=await fetcher(SKU_CATALOGUE_URL,{credentials:'same-origin'});if(!response.ok)throw new Error();catalogue=validateCatalogue(await response.json());}
 catch{$('pricing-status').textContent='SKU listesi şu anda yüklenemedi. Sayfayı yenileyebilir veya Excel dosyasını indirebilirsin.';return null;}
 let storage=options.storage;try{storage??=globalThis.localStorage;}catch{}
 let prices=loadSavedPrices(storage,catalogue.modules),selected,selectedVariant;
 const modules=new Map(catalogue.modules.map(module=>[module.sku,module])),placementRows=new Map(),priceInputs=new Map();
 let query='';
 let params;try{params=new URL(options.pageURL??globalThis.location.href).searchParams;}catch{params=new URLSearchParams();}
 selected=catalogue.placements.find(p=>p.sku===params.get('sku'))??catalogue.placements[0];
 selectedVariant=selected.variants.find(v=>v.sku===params.get('variant'))??selected.variants[0];
 const moneyText=value=>value===null?'Fiyat bekleniyor':money.format(value);
 function save(){
  try{if(!storage)throw new Error();storage.setItem(PRICE_STORAGE_KEY,JSON.stringify({version:108,currency:'TRY',prices}));$('price-save-status').textContent='Fiyatlar bu tarayıcıda kaydedildi.';}
  catch{$('price-save-status').textContent='Bu tarayıcı kayda izin vermiyor. Fiyatlar sayfa açıkken kullanılabilir.';}
 }
 function updateURL(){try{const url=new URL(options.pageURL??globalThis.location.href);url.searchParams.set('sku',selected.sku);url.searchParams.set('variant',selectedVariant.sku);globalThis.history?.replaceState(null,'',url.href);}catch{}}
 function updateTotals(){
  for(const placement of catalogue.placements){const row=placementRows.get(placement.sku),result=calculatePlacement(placement,prices);row.querySelector('[data-placement-total]').textContent=moneyText(result.total);row.querySelector('[data-placement-total]').classList.toggle('pending-price',result.total===null);}
  renderDetail();
 }
 function renderDetail(){
  $('selected-sku').textContent=selected.sku;$('selected-title').textContent=selected.label;
  $('selected-dimensions').textContent=dimensions(selected.dimensions);
  const variants=$('variant-select');variants.replaceChildren();
  for(const variant of selected.variants){const option=document.createElement('option');option.value=variant.sku;option.textContent=variant.label||variant.sku;option.selected=variant.sku===selectedVariant.sku;variants.append(option);}
  $('selected-variant-sku').textContent='Varyant SKU: '+selectedVariant.sku;
  const material=selectedVariant.materials??{};$('selected-materials').textContent=[label(material.fabric),label(material.body),label(material.accent),label(material.wood)].filter(Boolean).join(' · ');
  $('selected-product-link').href=safeProductHref(selectedVariant.productHref,options.pageURL??globalThis.location?.href);
  const result=calculatePlacement(selected,prices),rows=$('bom-rows');rows.replaceChildren();
  for(const line of result.lines){
   const tr=document.createElement('tr'),name=document.createElement('td'),code=document.createElement('span');name.textContent=line.label||modules.get(line.moduleSku)?.label||modules.get(line.moduleSku)?.name||line.moduleSku;code.className='module-code';code.textContent=line.moduleSku;name.append(code);tr.append(name);
   for(const value of [String(line.quantity),line.unitPrice===null?'—':money.format(line.unitPrice),line.lineTotal===null?'—':money.format(line.lineTotal)]){const td=document.createElement('td');td.className='numeric';td.textContent=value;tr.append(td);}rows.append(tr);
  }
  $('selected-total').textContent=result.total===null?'Fiyat bekleniyor':money.format(result.total)+' TL';$('selected-total').classList.toggle('pending-price',result.total===null);
  $('selected-price-note').textContent=result.missing?`${result.missing} modül türünün birim fiyatını girince toplam hesaplanır.`:'Girilen modül birim fiyatlarının toplamı. KDV, indirim ve kumaş farkı ayrıca eklenmedi.';
  for(const [sku,row]of placementRows){row.classList.toggle('is-selected',sku===selected.sku);row.querySelector('button').setAttribute('aria-pressed',String(sku===selected.sku));}
 }
 for(const module of catalogue.modules){
  const tr=document.createElement('tr');
  for(const text of [module.sku,module.label||module.name,dimensions(module)]){const td=document.createElement('td');td.textContent=text;tr.append(td);}
  const cell=document.createElement('td'),input=document.createElement('input'),error=document.createElement('span');input.type='text';input.inputMode='decimal';input.autocomplete='off';input.className='price-input';input.id='price-'+module.sku;input.setAttribute('aria-label',(module.label||module.name)+' birim fiyatı, TL');input.setAttribute('aria-describedby','price-error-'+module.sku);input.placeholder='Fiyat gir';input.value=prices[module.sku]===undefined?'':money.format(prices[module.sku]);error.id='price-error-'+module.sku;error.className='input-error';error.hidden=true;
  input.addEventListener('input',()=>{const parsed=parseUnitPrice(input.value),valid=parsed===null||Number.isFinite(parsed);input.setAttribute('aria-invalid',String(!valid));error.hidden=valid;error.textContent=valid?'':'0 veya daha büyük bir fiyat gir. Örn. 1250,50';if(valid&&parsed!==null)prices[module.sku]=parsed;else delete prices[module.sku];save();updateTotals();});
  input.addEventListener('blur',()=>{if(Number.isFinite(parseUnitPrice(input.value)))input.value=money.format(parseUnitPrice(input.value));});
  input.addEventListener('keydown',event=>{if(!['ArrowDown','ArrowUp','Enter'].includes(event.key))return;const entries=[...priceInputs.values()],index=entries.indexOf(input),next=entries[index+(event.key==='ArrowUp'?-1:1)];if(next){event.preventDefault();next.focus();next.select();}});
  priceInputs.set(module.sku,input);cell.append(input,error);tr.append(cell);$('module-price-rows').append(tr);
 }
 for(const placement of catalogue.placements){
  const tr=document.createElement('tr'),sku=document.createElement('td'),button=document.createElement('button');button.type='button';button.className='sku-button';button.textContent=placement.sku;button.setAttribute('aria-label',placement.sku+' '+placement.label+' modüllerini göster');button.addEventListener('click',()=>{selected=placement;selectedVariant=placement.variants[0];renderDetail();updateURL();$('selected-placement').focus({preventScroll:true});});sku.append(button);tr.append(sku);
  for(const value of [placement.label,String(placement.bom.reduce((sum,line)=>sum+line.quantity,0)),'Fiyat bekleniyor']){const td=document.createElement('td');td.textContent=value;if(tr.children.length>1)td.className='numeric';if(tr.children.length===3)td.dataset.placementTotal='';tr.append(td);}
  placementRows.set(placement.sku,tr);$('placement-rows').append(tr);
 }
 function filterRows(){const visible=new Set(searchPlacements(catalogue.placements,query).map(p=>p.sku));for(const [sku,row]of placementRows)row.hidden=!visible.has(sku);$('placement-count').textContent=visible.size+' / '+catalogue.placements.length;$('sku-empty').hidden=visible.size!==0;}
 $('sku-search').addEventListener('input',event=>{query=event.target.value;filterRows();});
 $('variant-select').addEventListener('change',event=>{selectedVariant=selected.variants.find(v=>v.sku===event.target.value)??selected.variants[0];renderDetail();updateURL();});
 $('reset-prices').addEventListener('click',()=>{prices={};for(const input of priceInputs.values()){input.value='';input.setAttribute('aria-invalid','false');input.nextElementSibling.hidden=true;}save();updateTotals();});
 $('price-save-status').textContent=Object.keys(prices).length?'Kayıtlı birim fiyatlar yüklendi.':'Birim fiyatlar boş başlar. Ücretsiz modüller için 0 girebilirsin.';
 filterRows();updateTotals();$('pricing-status').textContent='';$('pricing-content').hidden=false;
 return {catalogue,get selectedSku(){return selected.sku;},get prices(){return {...prices};},selectSKU(sku){placementRows.get(sku)?.querySelector('button').click();},get totals(){return Object.fromEntries(catalogue.placements.map(p=>[p.sku,calculatePlacement(p,prices)]));}};
}
if(typeof document!=='undefined')initPricing();
