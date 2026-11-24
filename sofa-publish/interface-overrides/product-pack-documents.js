import {planSofaComposition,compositionFootprint} from './table-composition.js?v=20261124-reverse-v132';

import {SOFA_SITE_URL} from './sofa-site-url.js';
const SITE=SOFA_SITE_URL.href.replace(/\/$/,'');
const MODULE_NAMES={single_both:'Çift kollu tekli koltuk',end_L:'Sol kollu oturum modülü',end_R:'Sağ kollu oturum modülü',middle:'Kolsuz ara modül',chaise_middle:'Kolsuz dinlenme modülü',chaise_L:'Sol kollu dinlenme modülü',chaise_R:'Sağ kollu dinlenme modülü',corner_L:'Köşe modülü',corner_R:'Köşe modülü',table_angled:'Açılı ara sehpa',table_square:'Kare ahşap modül',table_rectangle:'Dikdörtgen ahşap modül'};
const STATE_FIELDS=['body','accent','base','finish','scene','layout','extra','back','table','terminal','tableDesign','tableVariant','tablePosition','tableDirection','tables','modules','moduleRotation','cornerTables'];
const clean=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
const esc=value=>clean(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite=(value,label)=>{const n=Number(value);if(!Number.isFinite(n))throw new Error('Geçersiz ölçü: '+label);return n;};
const num=value=>String(Math.round(finite(value,'koordinat')*1000)/1000||0);
const round=value=>Math.round(value*1e6)/1e6||0;
const cm=value=>new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1}).format(finite(value,'cm'));
const dimsText=dimensions=>[dimensions.widthCm,dimensions.depthCm,dimensions.heightCm].map(cm).join(' × ')+' cm';
function absoluteEditor(value){try{const u=new URL(value,SITE+'/');return u.origin===SOFA_SITE_URL.origin&&[SOFA_SITE_URL.pathname,new URL('./index.html',SOFA_SITE_URL).pathname].includes(u.pathname)?u.href:null;}catch{return null;}}
function labelFor(product,part){return clean(product.moduleBreakdown?.find(entry=>entry.key===part.type)?.label)||MODULE_NAMES[part.type]||'Modül';}
function positionLabel(value){return typeof value==='number'?`${value}. ve ${value+1}. modül arası`:value==='return'?'Köşe dönüşünde':value==='left-end'?'Sol uçta':value==='right-end'?'Sağ uçta':'';}
function geometryFor(product){
 const state=product?.state;if(!state||typeof state!=='object')throw new Error('Ürün yerleşimi bulunamadı.');
 const plan=planSofaComposition(state.layout,state.extra,state),raw=product.dimensions??{};
 const dimensions=Object.fromEntries(['widthCm','depthCm','heightCm','seatHeightCm'].map(key=>[key,finite(raw[key],key)]));
 if(Object.values(dimensions).some(value=>value<=0))throw new Error('Ürün ölçüleri pozitif olmalı.');
 if(Math.round(plan.width*100)!==dimensions.widthCm||Math.round(plan.depth*100)!==dimensions.depthCm||Math.round(plan.height*100)!==dimensions.heightCm)throw new Error('Ürün ölçüleri yerleşim planıyla uyuşmuyor.');
 dimensions.approximate=Boolean(raw.approximate||plan.approximate);
 let seat=0,table=0;
 const parts=plan.parts.map(part=>{
  const footprint=compositionFootprint(part).map(([x,z])=>[finite(x,'x')*100,finite(z,'z')*100]);
  if(footprint.length<3)throw new Error('Modül planı kapalı bir alan olmalı.');
  return {id:part.kind==='table'?'S'+(++table):'O'+(++seat),key:part.type,label:labelFor(product,part),kind:part.kind,role:part.role,widthCm:round(part.width*100),depthCm:round(part.depth*100),heightCm:round(part.height*100),seatHeightCm:part.kind==='seat'?round((part.seatHeight??plan.seatHeight)*100):null,rotationDegrees:round((part.rotation??0)*180/Math.PI),xCm:round(part.x*100),zCm:round(part.z*100),approximate:Boolean(part.approximate),...(part.tablePosition!==undefined?{position:part.tablePosition,positionLabel:positionLabel(part.tablePosition)}:{}),footprintCm:footprint.map(point=>point.map(round))};
 });
 const points=parts.flatMap(part=>part.footprintCm),bounds={minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minZ:Math.min(...points.map(p=>p[1])),maxZ:Math.max(...points.map(p=>p[1]))};
 return {plan,parts,dimensions,bounds,seatCount:seat,tableCount:table};
}
function centroid(points){
 let area=0,x=0,y=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],c=a[0]*b[1]-b[0]*a[1];area+=c;x+=(a[0]+b[0])*c;y+=(a[1]+b[1])*c;}
 return Math.abs(area)<1e-8?[points.reduce((s,p)=>s+p[0],0)/points.length,points.reduce((s,p)=>s+p[1],0)/points.length]:[x/(3*area),y/(3*area)];
}
function noteFor(approximate){return approximate?'Nominal yerleşim ölçüleri. Köşe modülü yaklaşık 118 × 118 cm kabul edilir. Ölçüler yerleşim içindir; üretim çizimi değildir.':'Nominal yerleşim ölçüleri. Döşeme toleransları nedeniyle gerçek ölçüler değişebilir. Ölçüler yerleşim içindir; üretim çizimi değildir.';}

/** JSON-safe customer specification. No source, workstation or staging paths. */
export function buildProductMetadata(product){
 const {parts,dimensions,bounds,seatCount,tableCount}=geometryFor(product),state={};
 for(const key of STATE_FIELDS)if(product.state[key]!==undefined)state[key]=JSON.parse(JSON.stringify(product.state[key]));
 const materials=Object.fromEntries(Object.entries(product.materials??{}).map(([key,value])=>[key,clean(typeof value==='object'?value?.label:value)]));
 return {version:1,productKey:clean(product.key),title:clean(product.title),description:clean(product.description),layout:clean(product.layoutLabel),unit:'cm',measurementType:'nominal',dimensionOrder:'Genişlik × derinlik × yükseklik',dimensions,dimensionsLabel:dimsText(dimensions),footprintLabel:`${cm(dimensions.widthCm)} × ${cm(dimensions.depthCm)} cm`,seatCount,tableCount,moduleCount:parts.length,materials,modules:parts,planBoundsCm:Object.fromEntries(Object.entries(bounds).map(([key,value])=>[key,round(value)])),configuration:state,productUrl:SITE+'/urun.html?model='+encodeURIComponent(clean(product.key)),editorUrl:absoluteEditor(product.editorHref),measurementNote:noteFor(dimensions.approximate)};
}

/** A labelled orthographic plan from the actual measured composition polygons. */
export function buildDimensionSVG(product){
 const data=buildProductMetadata(product),parts=data.modules,b=data.planBoundsCm,width=1600,height=1000;
 const plot={x:115,y:150,width:1235,height:650},worldW=b.maxX-b.minX,worldD=b.maxZ-b.minZ,scale=Math.min(plot.width/worldW,plot.height/worldD);
 if(!(scale>0&&Number.isFinite(scale)))throw new Error('Yerleşim sınırları geçersiz.');
 const ox=plot.x+(plot.width-worldW*scale)/2,oy=plot.y+(plot.height-worldD*scale)/2;
 const xy=([x,z])=>[ox+(x-b.minX)*scale,oy+(z-b.minZ)*scale],left=ox,right=ox+worldW*scale,top=oy,bottom=oy+worldD*scale,dimensionY=95,dimensionX=1450;
 const wood=data.configuration.base==='black-oak'?'#303537':data.configuration.base==='dark-oak'?'#765d4b':'#c1a27d';
 const symbols=parts.map(part=>{
  const points=part.footprintCm.map(xy),seat=part.kind==='seat';
  return `<g data-module="${esc(part.id)}" data-kind="${esc(part.kind)}" data-width-cm="${num(part.widthCm)}" data-depth-cm="${num(part.depthCm)}"><title>${esc(part.label+' · '+dimsText(part))}</title><polygon points="${points.map(point=>point.map(num).join(',')).join(' ')}" fill="${seat?'#e5eae5':wood}" stroke="${seat?'#516452':'#574738'}" stroke-width="2.4" stroke-linejoin="round"/></g>`;
 }).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(clean(product.title)+' nominal ölçü planı')}" data-width-cm="${num(data.dimensions.widthCm)}" data-depth-cm="${num(data.dimensions.depthCm)}" data-height-cm="${num(data.dimensions.heightCm)}" data-seat-height-cm="${num(data.dimensions.seatHeightCm)}" data-measurement="nominal"><title>${esc(clean(product.title)+' · Nominal ölçü planı')}</title><desc>${esc(data.measurementNote)}</desc><defs><marker id="dimension-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#516452"/></marker></defs><style>text{font-family:Arial,Helvetica,sans-serif;fill:#28332f}.dimension{font-size:30px;font-weight:600;text-anchor:middle}.axis{stroke:#516452;stroke-width:1.7;marker-start:url(#dimension-arrow);marker-end:url(#dimension-arrow)}.extension{stroke:#a8b1a4;stroke-width:1.2;stroke-dasharray:5 5}</style><rect width="100%" height="100%" fill="#fffdf8"/><line x1="${num(left)}" y1="${dimensionY}" x2="${num(right)}" y2="${dimensionY}" class="axis"/><line x1="${num(left)}" y1="${dimensionY-8}" x2="${num(left)}" y2="${num(top)}" class="extension"/><line x1="${num(right)}" y1="${dimensionY-8}" x2="${num(right)}" y2="${num(top)}" class="extension"/><text x="${num((left+right)/2)}" y="${dimensionY-18}" class="dimension">${esc(cm(data.dimensions.widthCm)+' cm')}</text><line x1="${dimensionX}" y1="${num(top)}" x2="${dimensionX}" y2="${num(bottom)}" class="axis"/><line x1="${num(right)}" y1="${num(top)}" x2="${dimensionX+8}" y2="${num(top)}" class="extension"/><line x1="${num(right)}" y1="${num(bottom)}" x2="${dimensionX+8}" y2="${num(bottom)}" class="extension"/><text x="${dimensionX+42}" y="${num((top+bottom)/2)}" transform="rotate(90 ${dimensionX+42} ${num((top+bottom)/2)})" class="dimension">${esc(cm(data.dimensions.depthCm)+' cm')}</text>${symbols}</svg>`;
}

function packageEntries(packageFiles){
 const items=Array.isArray(packageFiles)?packageFiles:Object.entries(packageFiles??{}).map(([label,path])=>typeof path==='string'?{label,path}:path);
 return items.flatMap(item=>{
  const path=typeof item==='string'?item:item?.path??item?.name??item?.filename,label=typeof item==='string'?item:typeof item?.label==='string'?item.label:path;
  if(typeof path!=='string'||!path||path.startsWith('/')||path.includes('\\')||path.split('/').includes('..')||/^[a-z]+:|[\u0000-\u001f]/i.test(path))return[];
  return[{path,label:clean(label)}];
 });
}

/** Standalone offline summary with an inline plan and relative package links. */
export function buildProductSummaryHTML(product,{packageFiles=[]}={}){
 const data=buildProductMetadata(product),files=packageEntries(packageFiles),svg=buildDimensionSVG(product);
 const materials=[['Kumaş',data.materials.fabric],['Ana kumaş',data.materials.body],['Yastıklar',data.materials.accent],['Ahşap',data.materials.wood],['Ahşap modül',data.materials.tableDesign]].filter(([,value])=>value);
 const modules=data.modules.map(part=>`<tr><th scope="row">${esc(part.id)}</th><td>${esc(part.label)}${part.positionLabel?'<span>'+esc(part.positionLabel)+'</span>':''}</td><td>${esc(dimsText(part))}${part.approximate?' · yaklaşık':''}</td></tr>`).join('');
 const links=files.length?`<section><h2>Paket dosyaları</h2><ul class="files">${files.map(file=>'<li><a href="'+esc(file.path)+'" download>'+esc(file.label)+'</a></li>').join('')}</ul></section>`:'';
 return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(data.title)} · Studio ürün özeti</title><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f6f4ef;color:#28332f;font:16px/1.6 Arial,Helvetica,sans-serif}main{max-width:1120px;margin:auto;padding:42px 28px 60px}.eyebrow{letter-spacing:.12em;font-size:14px;color:#657066}h1{font:40px/1.2 Georgia,serif;margin:10px 0 16px}h2{font-size:22px;margin:28px 0 12px}p{margin:10px 0}.muted,small{color:#657066}.facts{display:flex;gap:16px;flex-wrap:wrap;margin:24px 0}.fact{background:#fffdf8;border:1px solid #d8ddd3;border-radius:9px;padding:14px 20px}.fact strong{display:block;font-size:24px}.fact span{font-size:14px;color:#657066}dl{display:grid;grid-template-columns:max-content 1fr;gap:8px 24px}dt{color:#657066}dd{margin:0}figure{margin:24px 0;background:#fffdf8;border:1px solid #d8ddd3;border-radius:12px;overflow:hidden}figure svg{display:block;width:100%;height:auto}figcaption{padding:10px 20px;color:#657066;font-size:14px}table{width:100%;border-collapse:collapse;background:#fffdf8}th,td{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid #d8ddd3}td span{display:block;font-size:14px;color:#657066}a{color:#516452;text-underline-offset:3px}.files{padding-left:22px}.files li{margin:8px 0}footer{margin-top:34px;border-top:1px solid #d8ddd3;padding-top:18px;font-size:14px}@media(max-width:600px){main{padding:26px 18px}h1{font-size:32px}.fact{flex:1}th,td{padding:10px 6px;font-size:14px}}@media print{body{background:white}main{padding:0}.files{display:none}figure{break-inside:avoid}a{color:inherit}h2{break-after:avoid}table{font-size:12px}tr{break-inside:avoid}}</style></head><body><main><p class="eyebrow">STUDIO · EKİP PAYLAŞIM PAKETİ</p><h1>${esc(data.title)}</h1><p>${esc(data.description)}</p><p class="muted">${esc(data.layout)} · ${data.seatCount} oturum modülü${data.tableCount?' · '+data.tableCount+' sehpa':''}</p><div class="facts"><div class="fact"><strong>${data.dimensions.approximate?'Yaklaşık ':''}${esc(data.dimensionsLabel)}</strong><span>Genişlik × derinlik × yükseklik</span></div><div class="fact"><strong>${esc(cm(data.dimensions.seatHeightCm))} cm</strong><span>Oturum yüksekliği</span></div></div><section><h2>Malzemeler</h2><dl>${materials.map(([label,value])=>'<dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd>').join('')}</dl></section><figure>${svg}<figcaption>Nominal ölçüler, seçilen modüllerin üstten yerleşiminden hesaplanır.</figcaption></figure><section><h2>Modül ölçüleri</h2><table><thead><tr><th>Plan</th><th>Modül</th><th>Genişlik × derinlik × yükseklik</th></tr></thead><tbody>${modules}</tbody></table><p class="muted">${esc(data.measurementNote)}</p></section>${links}<footer><a href="${esc(data.productUrl)}">Ürünü sitede incele</a>${data.editorUrl?' · <a href="'+esc(data.editorUrl)+'">Kombinasyonu düzenle</a>':''}</footer></main></body></html>`;
}
