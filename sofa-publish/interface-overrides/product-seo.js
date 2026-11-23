import {SOFA_SITE_URL} from './sofa-site-url.js';
const SITE=SOFA_SITE_URL.href.replace(/\/$/,'');
const text=value=>typeof value==='string'?value:typeof value?.label==='string'?value.label:'';
function localImage(value){
 try{const u=new URL(value,SITE+'/');if(u.origin!==SOFA_SITE_URL.origin||!u.pathname.startsWith(new URL('./assets/',SOFA_SITE_URL).pathname)||!/\.(?:png|jpe?g|webp|avif)$/i.test(u.pathname))return null;u.search='';u.hash='';return u.href;}catch{return null;}
}

/** Product-specific metadata for every actual catalogue entry; no offers or stock claims. */
export function buildProductSEO(product,items=[]){
 if(!product||!/^[a-z\d][a-z\d_-]{0,159}$/i.test(product.key??''))throw new Error('Invalid product identity');
 const originalTitle=text(product.title)||'Modüler koltuk',title=/^SOFF(?:\s|$)/i.test(originalTitle)?originalTitle:'SOFF · '+originalTitle,description=text(product.description),canonical=SITE+'/urun.html?model='+encodeURIComponent(product.key);
 const images=[...new Set(items.map(item=>localImage(item.fullSrc||item.src)).filter(Boolean))];
 const dimensions=product.dimensions??{},materials=product.materials??{};
 const quantity=key=>Number.isFinite(Number(dimensions[key]))&&Number(dimensions[key])>0?{'@type':'QuantitativeValue',value:Number(dimensions[key]),unitCode:'CMT'}:undefined;
 const jsonLD={'@context':'https://schema.org','@type':'Product','@id':canonical+'#product',url:canonical,name:title,description,productID:product.key,brand:{'@type':'Brand',name:'Studio'},material:[materials.fabric,materials.wood].map(text).filter(Boolean).join(', '),color:text(materials.body),...(images.length?{image:images}:{}),width:quantity('widthCm'),depth:quantity('depthCm'),height:quantity('heightCm'),additionalProperty:[{'@type':'PropertyValue',name:'Ölçü türü',value:'Nominal yerleşim ölçüleri'},{'@type':'PropertyValue',name:'Yerleşim',value:text(product.layoutLabel)},{'@type':'PropertyValue',name:'Yastık rengi',value:text(materials.accent)}]};
 const meta={'og:type':'product','og:site_name':'Studio','og:title':title+' — Studio','og:description':description,'og:url':canonical,...(images.length?{'og:image':images[0],'og:image:alt':title+' · Kadife stüdyo görünümü'}:{})};
 return {title:title+' — Studio',description,canonical,meta,jsonLD};
}

export function applyProductSEO(document,product,items=[]){
 const data=buildProductSEO(product,items);document.title=data.title;
 let description=document.querySelector('meta[name="description"]');if(!description){description=document.createElement('meta');description.name='description';document.head.append(description);}description.content=data.description;
 let canonical=document.querySelector('link[rel="canonical"]');if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.append(canonical);}canonical.href=data.canonical;
 for(const property of ['og:image','og:image:alt'])if(!data.meta[property])document.querySelector(`meta[property="${property}"]`)?.remove();
 for(const[property,content]of Object.entries(data.meta)){let meta=document.querySelector(`meta[property="${property}"]`);if(!meta){meta=document.createElement('meta');meta.setAttribute('property',property);document.head.append(meta);}meta.content=content;}
 let schema=document.getElementById('product-structured-data');if(!schema){schema=document.createElement('script');schema.type='application/ld+json';schema.id='product-structured-data';document.head.append(schema);}schema.textContent=JSON.stringify(data.jsonLD);
 return data;
}
