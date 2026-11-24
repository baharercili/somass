import {mountTeamPackPanel} from './team-pack-downloads.js?v=20261121-team-pack-v79';

export function productFileStem(product){return('Studio-'+String(product.title||product.key)).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/[^a-z\d-]+/gi,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,100)||'Studio-koltuk';}
export function createTeamPackFiles(product){
 const stem=productFileStem(product),files=[
  {id:'model',kind:'model',label:'Parçaları ayrı 3D model',format:'GLB',filename:stem+'.glb',path:'Model/'+stem+'.glb'},
  {id:'dimensions-png',kind:'dimensions',label:'Ölçülü yerleşim planı',format:'PNG',filename:stem+'-Olculer.png',path:'Olculer/'+stem+'-Olculer.png'},
  {id:'dimensions-svg',kind:'dimensions',label:'Ölçülü yerleşim planı · vektör',format:'SVG',filename:stem+'-Olculer.svg',path:'Olculer/'+stem+'-Olculer.svg'},
  {id:'summary-html',kind:'summary',label:'Ürün ve malzeme özeti',format:'HTML',filename:stem+'-Urun-Ozeti.html',path:'Urun-Ozeti.html'},
  {id:'readme',kind:'summary',label:'Paket kullanım bilgisi',format:'TXT',filename:'Beni-Oku.txt',path:'Beni-Oku.txt'},
  {id:'summary-json',kind:'summary',label:'Ürün ve dosya verileri',format:'JSON',filename:stem+'-Urun-Verisi.json',path:'Urun-Verisi.json'}
 ];
 const origin=globalThis.location?.href??'https://studio.invalid/';const seen=new Set();
 for(const[itemIndex,item]of(product.gallery??[]).entries()){
  let url;try{url=new URL(item.fullSrc||item.src,origin);if(url.origin!==new URL(origin).origin||!url.pathname.startsWith(new URL('./assets/',origin).pathname)||! /\.(png|jpe?g|webp|avif)$/i.test(url.pathname))continue;}catch{continue;}
  if(seen.has(url.href))continue;seen.add(url.href);const label=item.label||'Stüdyo görünümü',suffix=productFileStem({title:label}).replace(/^Studio-/,''),ext=url.pathname.split('.').pop().toLowerCase(),filename=String(itemIndex+1).padStart(2,'0')+'-'+suffix+'.'+ext;
  files.push({id:'gallery-'+itemIndex,kind:item.kind==='dimensioned-overhead'?'dimensions':'render',label,format:ext.toUpperCase(),filename,path:(item.kind==='dimensioned-overhead'?'Olculer/':'Renderlar/')+filename,url:url.href});
 }
 return files;
}
export function mountProductTeamPack(product){
 const files=createTeamPackFiles(product),getEngine=()=>import('./team-pack-engine.js?v=20261124-realism-v128');
 return mountTeamPackPanel({product,files,packageFilename:productFileStem(product)+'-Ekip-Paketi.zip',
  downloadPackage:async options=>(await getEngine()).prepareProductPackage(options),
  downloadFile:async options=>(await getEngine()).prepareProductFile(options)
 });
}
