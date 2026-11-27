(() => {
  'use strict';
  const data=JSON.parse(document.getElementById('material-data').textContent);
  const byId=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize=value=>String(value??'').toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
  const familyMap=new Map(data.families.map(f=>[f.id,f]));
  const fabricGuideMap=new Map(data.fabricGuide.families.map(f=>[f.id,f]));
  const guideFor=family=>fabricGuideMap.get(family);
  const consumerTitle=family=>guideFor(family)?.consumerTitle||familyMap.get(family).name;
  const consumerComposition=material=>guideFor(material.family)?.compositionDisplay||material.composition||familyMap.get(material.family).composition;
  const consumerSearch=family=>{const guide=guideFor(family);return guide?[guide.consumerTitle,guide.consumerType,guide.compositionDisplay,data.fabricEvidence.surfaceStructure[family]?.text,...guide.traits.flatMap(t=>[t.label,t.text])].join(' '):'';};
  function traitsHTML(family){const guide=guideFor(family);return guide?`<ul class="material-traits" aria-label="Kumaş özellikleri">${guide.cardTraits.map(trait=>`<li data-trait-id="${esc(trait.id)}" aria-label="${esc(trait.description)}" title="${esc(trait.description)}">${esc(trait.label)}</li>`).join('')}</ul>`:'';}
  function renderFabricGuide(){
    byId('fabric-guide-options').innerHTML=data.fabricGuide.families.map(guide=>`<button type="button" class="fabric-guide-choice" data-guide-family="${esc(guide.id)}" aria-pressed="false" aria-controls="material-grid" aria-label="${esc(guide.consumerTitle)} · ${materials.filter(material=>material.family===guide.id).length} numuneyi gör"><span class="fabric-guide-texture" aria-hidden="true">${imageHTML(familyMap.get(guide.id).cover,'','eager',true)}</span><span class="fabric-guide-type">${esc(guide.consumerTitle)}</span><span class="fabric-guide-count">${materials.filter(material=>material.family===guide.id).length} numune</span></button>`).join('');
    byId('fabric-guide-table').innerHTML=data.fabricGuide.families.map(guide=>`<article class="fabric-guide-column"><h3>${esc(guide.consumerTitle)}</h3><p>${esc(guide.shortDescription)}</p><ul>${guide.traits.slice(0,2).map(trait=>`<li>${esc(trait.label)}</li>`).join('')}</ul><h4>İçerik</h4><p>${esc(guide.compositionDisplay)}</p><h4>Seçim için</h4><p>${esc(guide.selectionTip)}</p></article>`).join('');
    byId('fabric-guide-rpet-note').textContent=data.fabricGuide.sharedCopy.rpetExplanation;
    byId('fabric-guide-care-note').textContent=data.fabricGuide.sharedCopy.careNote;
  }
  function syncGuideChoices(){for(const button of byId('fabric-guide-options').querySelectorAll('[data-guide-family]'))button.setAttribute('aria-pressed',String(filters.families.size===1&&filters.families.has(button.dataset.guideFamily)));}
  const familyContent=new Map(data.content.families.map(f=>[f.id,f]));
  function iconSVG(id){const icon=data.content.icons[id];return icon?`<svg viewBox="${esc(icon.viewBox)}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${icon.strokeWidth||1.25}" stroke-linecap="round" stroke-linejoin="round">${icon.paths.map(d=>`<path d="${esc(d)}"/>`).join('')}</svg>`:'';}
  const evidenceLabel=source=>source==='userProductBrief'?'Ürün bilgisi':'Kumaş yüzeyi';
  function featureIconsHTML(f){
    const texture=f.featureIds.filter(id=>!['recycled-polyester','fiber-content','snagging','abrasion'].includes(id)).map(id=>({id,label:data.content.icons[id].label,description:id==='directional-sheen'?'Havın yatışı ve ışığın yönü, yüzeyde açık ve koyu ton geçişleri oluşturur.':f.summaryTR,source:'surfaceDescription'}));
    const brief=(f.productBriefFeatures||[]).map(x=>({id:x.iconId,label:x.labelTR,description:x.labelTR+' · Koleksiyonun ürün bilgisi.',source:'userProductBrief'}));
    return [...texture,...brief].map(x=>`<details class="feature-icon" data-feature="${esc(x.id)}" data-evidence-class="${esc(x.source)}"><summary title="${esc(x.description)}">${iconSVG(x.id)}<span>${esc(x.label)}</span></summary><p>${esc(x.description)}<br><small>${evidenceLabel(x.source)}</small></p></details>`).join('');
  }
  function factValue(fact){
    let value=String(fact.value).replace(/warpway:|warp:/g,'Çözgü:').replace(/weftway:|weft:/g,'Atkı:').replace(/length:/g,'Boy:').replace(/width:/g,'En:');
    if(fact.id==='weightGsm')value+=' g/m²';
    if(fact.id==='widthCm')value+=' cm';
    if(fact.id.startsWith('martindale-')&&['martindale-pile-loss','martindale-yarn-break'].includes(fact.id))value=Number(fact.value).toLocaleString('tr-TR')+' devir';
    if(fact.id==='snagging')value+=' · 600 devir';
    if(fact.id==='pilling')value+=' / 5 · 5.000 devir';
    if(fact.id==='seam-slippage')value+=' mm';
    if(['tear-strength','tensile-strength'].includes(fact.id))value+=' N';
    return value;
  }
  function renderConsumerDetails(material){
    const f=familyContent.get(material.family),facts=f.technicalFacts||[];
    byId('detail-feature-icons').innerHTML=featureIconsHTML(f);
    const keyIDs=['weightGsm','widthCm','martindale-yarn-break','pilling'];
    const keyFacts=keyIDs.map(id=>facts.find(t=>t.id===id)).filter(Boolean);
    const certification=(f.certificationBriefOnly||[]).map(name=>`<span class="product-certification" data-evidence-class="userProductBrief" title="Koleksiyon ürün bilgisi">${esc(name)} sertifikalı</span>`).join('');
    byId('detail-badges').insertAdjacentHTML('beforeend',certification);
    byId('consumer-fabric-details').innerHTML=`
      <section><h4>Doku ve görünüm</h4><p>${esc(f.descriptionTR)}</p><p>${esc(f.weaveExplanationTR)}</p>${f.upholsteryDirectionTR?`<p>${esc(f.upholsteryDirectionTR)}</p>`:''}</section>
      <section><h4>İçerik</h4><p class="composition-text">${esc(f.compositionTR)}</p></section>
      ${keyFacts.length?`<dl class="technical-summary">${keyFacts.map(t=>`<div data-fact-id="${esc(t.id)}"><dt>${esc(t.id==='martindale-yarn-break'?'Aşınma dayanımı':t.labelTR)}</dt><dd>${esc(factValue(t))}</dd></div>`).join('')}</dl>`:''}
      ${facts.length?`<details class="technical-details"><summary>Teknik özellikler ve testler</summary><table class="technical-table"><tbody>${facts.map(t=>`<tr data-fact-id="${esc(t.id)}" data-evidence-class="producerPDF"><th scope="row">${esc(t.labelTR)}</th><td>${esc(factValue(t))}${t.standard?`<small>${esc(t.standard)}</small>`:''}<small>Teknik föy · s. ${esc(t.evidence.page)}</small></td></tr>`).join('')}</tbody></table></details>`:''}
      ${(f.careTR||[]).length?`<section><h4>Bakım</h4><ul>${f.careTR.map(line=>`<li>${esc(line)}</li>`).join('')}</ul></section>`:''}
      ${material.sourceQuality?.lowFocus?'<p class="source-focus-note">Bu rengin gerçek numune fotoğrafında netlik sınırlıdır. İnce lif ayrıntıları için fiziksel numuneyi inceleyin.</p>':''}`;
  }

  const materials=data.materials;
  const sampleCards=new Map((data.sampleCards||[]).map(photo=>[photo.materialId,photo]));
  
  const assetSlots=new Map((data.assetSlots||[]).map(entry=>[entry.materialId,entry]));
  const requiredAssetViews=data.assetSlotContract?.requiredViews||['sphere','metre-horizontal','metre-vertical','lighting'];
  const sharedAssetsReady=materials.every(m=>requiredAssetViews.every(slot=>(assetSlots.get(m.id)?.photos||[]).some(p=>p.slot===slot)));
  const unboundReferences=data.moraActualReferences.filter(r=>!r.galleryId&&!materials.some(m=>m.artCode===r.artCode));
  const referenceMaterials=[];
  const allMaterials=new Map([...materials,...referenceMaterials].map(m=>[m.id,m]));
  const profileFilters=[...document.querySelectorAll('#soft-touch-tone-defs filter, #veronza-tone-defs filter')];
  const toneProfiles=Object.fromEntries(profileFilters.map(f=>[f.getAttribute('data-tone'),{id:f.id,matrix:f.querySelector('feColorMatrix').getAttribute('values').trim().split(/\s+/).map(Number)}]));
  const selectionKey='somass-material-compare-v117',limit=10;
  let storageAvailable=true,selection=[];
  try{selection=[...new Set(JSON.parse(localStorage.getItem(selectionKey)||'[]'))].filter(id=>allMaterials.has(id)).slice(0,limit);}catch{storageAvailable=false;}
  const filters={query:'',families:new Set(),colors:new Set()};
  let visible=[],statusTimer,currentMaterial=null,currentImages=[],currentImage=0,detailOpener=null,compareOpener=null;
  let downloadRevision=0,toneDownloadURL=null;
  const detail=byId('material-detail'),compare=byId('compare-dialog'),filterDialog=byId('filter-dialog'),large=byId('large'),save=byId('save');

  function applyToneMatrix(pixels, matrix, metrics) {
  if (!pixels || pixels.length % 4 || !Array.isArray(matrix) || matrix.length !== 20 || matrix.some(value => !Number.isFinite(value))) throw new Error('Invalid tone transform');
  if (metrics) Object.assign(metrics, {pixels:pixels.length/4, clippedLowChannels:0, clippedHighChannels:0, clippedPixels:0});
  for (let index=0; index<pixels.length; index+=4) {
    const r=pixels[index]/255, g=pixels[index+1]/255, b=pixels[index+2]/255, a=pixels[index+3]/255;
    const red=matrix[0]*r+matrix[1]*g+matrix[2]*b+matrix[3]*a+matrix[4];
    const green=matrix[5]*r+matrix[6]*g+matrix[7]*b+matrix[8]*a+matrix[9];
    const blue=matrix[10]*r+matrix[11]*g+matrix[12]*b+matrix[13]*a+matrix[14];
    if (metrics) {
      metrics.clippedLowChannels+=(red<0)+(green<0)+(blue<0);
      metrics.clippedHighChannels+=(red>1)+(green>1)+(blue>1);
      metrics.clippedPixels+=(red<0||red>1||green<0||green>1||blue<0||blue>1)?1:0;
    }
    pixels[index]=Math.min(1,Math.max(0,red))*255;
    pixels[index+1]=Math.min(1,Math.max(0,green))*255;
    pixels[index+2]=Math.min(1,Math.max(0,blue))*255;
    pixels[index+3]=Math.min(1,Math.max(0,matrix[15]*r+matrix[16]*g+matrix[17]*b+matrix[18]*a+matrix[19]))*255;
  }
  return pixels;
}

async function createToneJpeg(source, matrix, isCurrent=()=>true) {
  const image=new Image();
  image.decoding='async';
  await new Promise((resolve,reject)=>{
    image.onload=resolve;
    image.onerror=()=>reject(new Error('Source image could not load'));
    image.src=source;
    if(image.complete&&image.naturalWidth>0) resolve();
  });
  if(!isCurrent()) return null;
  const width=image.naturalWidth, height=image.naturalHeight;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1) throw new Error('Source dimensions unavailable');
  const canvas=document.createElement('canvas');
  canvas.width=width; canvas.height=height;
  try {
    const context=canvas.getContext('2d',{willReadFrequently:true,colorSpace:'srgb'});
    if(!context) throw new Error('Image export unavailable');
    context.drawImage(image,0,0);
    const pixels=context.getImageData(0,0,width,height);
    applyToneMatrix(pixels.data,matrix);
    context.putImageData(pixels,0,0);
    if(!isCurrent()) return null;
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value&&value.type==='image/jpeg'?resolve(value):reject(new Error('JPEG export failed')),'image/jpeg',.96));
    return isCurrent()?blob:null;
  } finally {
    canvas.width=0; canvas.height=0;
  }
}

  const primaryPhoto=material=>material.photos.find(p=>p.id===material.browsePhotoId)||material.photos.find(p=>p.id==='studio-02')||material.photos[0];
  const colourPhoto=material=>assetSlots.get(material.id)?.swatch||material.photos.find(p=>p.id===material.swatchPhotoId)||primaryPhoto(material);
  const resolveMaterialKey=key=>allMaterials.get(key)||materials.find(m=>(m.code&&m.family+'-'+m.code===key)||(m.paletteId&&'card-'+m.paletteId===key));
  const codeLabel=material=>material.artCode?'ArtCode '+material.artCode:material.code?'Kod '+material.code:material.galleryId?'Kartela '+material.galleryId:'Kodlu numune';
  const titleLabel=material=>data.colourNames?.[material.id]?.primary||material.name;
  const secondaryName=material=>data.colourNames?.[material.id]?.secondary||'';
  const secondaryNameHTML=material=>secondaryName(material)?`<p class="colour-name-secondary">${esc(secondaryName(material))}</p>`:'';
  function imageHTML(photo,extra='',loading='lazy',thumbnail=false){
    if(photo.roi){
      const [x1,y1,x2,y2]=photo.roi,width=x2-x1,height=y2-y1;
      return `<span class="source-roi" role="img" aria-label="${esc(photo.alt||photo.name||'Gerçek kartela numunesi')}" style="aspect-ratio:${width}/${height};background-image:url('${esc(photo.src)}');background-size:${photo.sourceWidth/width*100}% ${photo.sourceHeight/height*100}%;background-position:${x1/(photo.sourceWidth-width)*100}% ${y1/(photo.sourceHeight-height)*100}%"><img src="${esc(photo.src)}" alt="" aria-hidden="true" width="${photo.sourceWidth}" height="${photo.sourceHeight}" loading="eager" decoding="async" style="width:1px;height:1px;opacity:0"${extra}></span>`;
    }
    return `<img src="${esc(thumbnail&&photo.thumbnailSrc?photo.thumbnailSrc:photo.src)}" alt="${esc(photo.alt||photo.name||photo.shot||'Kumaş numunesi')}" loading="${loading}" decoding="async"${photo.tone?` data-tone="${esc(photo.tone)}"`:''}${extra}>`;
  }
  function badgesHTML(){return '';}
  function announce(message){clearTimeout(statusTimer);byId('global-status').textContent=message;statusTimer=setTimeout(()=>{byId('global-status').textContent='';},4200);}
  function persistSelection(){try{localStorage.setItem(selectionKey,JSON.stringify(selection));}catch{storageAvailable=false;}}
  function filterMaterials(){
    const query=normalize(filters.query);
    return materials.filter(m=>{
      if(filters.families.size&&!filters.families.has(m.family))return false;
      if(filters.colors.size&&!filters.colors.has(m.colorFamily))return false;
      return !query||normalize([m.name,m.editorialName,titleLabel(m),secondaryName(m),m.code,m.artCode,m.galleryId,m.paletteId,...(m.aliases||[]),m.composition,familyMap.get(m.family).name,consumerSearch(m.family)].join(' ')).includes(query);
    });
  }
  const colors=Object.fromEntries([...new Set(materials.map(m=>m.colorFamily))].map(name=>{const m=materials.find(m=>m.colorFamily===name);return[name,m.colorFilterHex||'rgb('+m.targetRGB.join(',')+')'];}));
  function buildFilters(container){
    const families=data.families.map(f=>`<label class="filter-option"><input type="checkbox" data-filter="family" value="${esc(f.id)}"><span class="family-icon">${imageHTML(f.cover,'','lazy',true)}</span><span class="filter-family-label"><strong>${esc(consumerTitle(f.id))}</strong></span><span class="filter-count">${materials.filter(m=>m.family===f.id).length}</span></label>`).join('');
    const colorOptions=Object.entries(colors).filter(([name])=>materials.some(m=>m.colorFamily===name)).map(([name,color])=>`<label class="filter-option"><input type="checkbox" data-filter="color" value="${esc(name)}"><span class="filter-colour-dot" style="background:${color}"></span><span>${esc(name)}</span></label>`).join('');
    container.innerHTML=`<div class="filter-title"><h2>Filtreler</h2><button type="button" class="text-button" data-clear>Temizle</button></div><fieldset class="filter-group"><legend>Kumaş türü</legend>${families}</fieldset><fieldset class="filter-group"><legend>Renk</legend>${colorOptions}</fieldset>`;
  }
  function syncFilterInputs(){
    for(const input of document.querySelectorAll('input[data-filter]')){
      const type=input.dataset.filter;
      input.checked=type==='family'?filters.families.has(input.value):filters.colors.has(input.value);
    }
  }
  function renderActiveFilters(){
    const entries=[...filters.families].map(v=>({type:'family',value:v,label:consumerTitle(v)}));
    entries.push(...[...filters.colors].map(v=>({type:'color',value:v,label:v})));
    byId('active-filters').innerHTML=entries.map(e=>`<span class="filter-chip">${esc(e.label)}<button type="button" data-remove-filter="${e.type}" data-value="${esc(e.value)}" aria-label="${esc(e.label)} filtresini kaldır">×</button></span>`).join('');
  }
  function renderCards(){
    visible=filterMaterials();
    const oneFamily=filters.families.size===1?familyMap.get([...filters.families][0]):null;
    byId('results-title').textContent=oneFamily?consumerTitle(oneFamily.id):'Tüm kumaşlar';
    byId('results-count').textContent=visible.length+(data.standaloneFeaturedCodes?.length?' numune':' renk');
    byId('mobile-filter-count').textContent='Filtreler'+(filters.families.size||filters.colors.size?' · seçili':'');
    byId('filter-apply').textContent=visible.length+(data.standaloneFeaturedCodes?.length?' numuneyi göster':' rengi göster');
    byId('material-grid').innerHTML=visible.map(material=>{
      const photo=primaryPhoto(material),selected=selection.includes(material.id),family=familyMap.get(material.family);
      const card=photo.kind==='sample-card';return `<article class="material-card" data-material="${esc(material.id)}"><button type="button" class="card-photo${card?' sample-card-photo':''}" data-open="${esc(material.id)}" aria-label="${esc(consumerTitle(material.family)+' · '+titleLabel(material))} ayrıntılarını aç">${imageHTML(photo,'','lazy',card)}${card?'':`<span class="photo-kind">${photo.kind==='studio'?'Stüdyo':'Numune fotoğrafı'}</span>`}</button><div class="card-caption">${card?'<p class="sample-card-caption">Numune görselleştirmesi</p>':''}<p class="card-fabric-type">${esc(consumerTitle(material.family))}</p><h3 class="card-title"><button type="button" data-open="${esc(material.id)}">${esc(titleLabel(material))}</button></h3>${secondaryNameHTML(material)}${traitsHTML(material.family)}${badgesHTML(material)}<button type="button" class="card-select" data-select="${esc(material.id)}" aria-pressed="${selected}">${selected?'Seçildi · kaldır':'Karşılaştırmaya ekle'}</button></div></article>`;
    }).join('');
    byId('empty-results').hidden=visible.length>0;
    const showReferences=data.moraActualReferences.length>0&&(filters.families.size===0||filters.families.has('mora'));
    byId('unmapped-references').hidden=!showReferences;byId('coded-reference-link').hidden=!showReferences;
    const references=renderReferenceCards(),extraCodeMatches=normalize(filters.query)&&showReferences?references.filter(reference=>!visible.some(material=>material.artCode===reference.artCode)):[];
    if(extraCodeMatches.length){const count=(visible.length?visible.length+' numune · ':'')+extraCodeMatches.length+' kodlu numune';byId('results-count').textContent=count;byId('filter-apply').textContent=count+'yi göster';byId('empty-results').hidden=true;byId('coded-reference-link').textContent=extraCodeMatches.length+' kodlu numune bulundu · göster';}
    renderActiveFilters();syncFilterInputs();syncGuideChoices();
    document.documentElement.dataset.visibleMaterialCount=String(visible.length);
  }
  function clearFilters(){filters.query='';filters.families.clear();filters.colors.clear();byId('material-search').value='';history.replaceState(null,'',location.pathname+location.search+'#malzemeler');renderCards();}
  function applyHash(){
    let raw='';try{raw=decodeURIComponent(location.hash.slice(1));}catch{}const family=data.hashAliases[raw];
    filters.families.clear();if(family)filters.families.add(family);
    if(detail.open)detail.close();renderCards();
  }
  function renderReferenceCards(){
    const query=normalize(filters.query),references=data.moraActualReferences.filter(r=>!query||normalize([r.code,r.artCode,r.name,'Durable Velvet',consumerSearch('mora')].join(' ')).includes(query));
    byId('unmapped-title').textContent='Durable Velvet numuneleri · '+references.length;
    byId('coded-reference-link').textContent='Kodlu numuneler ('+data.moraActualReferences.length+')';
    byId('reference-grid').innerHTML=references.map(r=>{const m=materials.find(m=>m.artCode===r.artCode)||referenceMaterials.find(m=>m.artCode===r.artCode),photo=primaryPhoto(m),card=photo.kind==='sample-card';return `<article class="reference-card${card?' sample-card-reference':''}"><button type="button" data-open="${esc(m.id)}">${imageHTML(photo,'','lazy',card)}<span><strong>${esc(r.name)}</strong>Kod ${esc(r.code)}<br>Doğrulanmış numune kodu${card?'<br>Numune görselleştirmesi':''}</span></button><p class="card-fabric-type">${esc(consumerTitle(m.family))}</p>${traitsHTML(m.family)}${badgesHTML(m)}</article>`;}).join('');
    if(query&&references.length)byId('unmapped-references').open=true;
    return references;
  }
  function updateSelectionButtons(){
    for(const button of document.querySelectorAll('[data-select]')){
      if(button.classList.contains('tray-remove'))continue;
      const chosen=selection.includes(button.dataset.select);button.setAttribute('aria-pressed',String(chosen));button.textContent=chosen?'Seçildi · kaldır':'Karşılaştırmaya ekle';
    }
  }
  function renderTray(){
    byId('compare-tray').hidden=!selection.length;
    for(const count of document.querySelectorAll('[data-selection-count]'))count.textContent=String(selection.length);
    byId('tray-items').innerHTML=selection.map(id=>{const m=allMaterials.get(id);return `<div class="tray-item" title="${esc(titleLabel(m))}">${imageHTML(primaryPhoto(m),'','eager',true)}<button type="button" class="tray-remove" data-select="${esc(id)}" aria-label="${esc(titleLabel(m))} karşılaştırmadan kaldır">×</button></div>`;}).join('');
    updateSelectionButtons();
  }
  function toggleSelection(id){
    if(!allMaterials.has(id))return false;
    if(selection.includes(id))selection=selection.filter(value=>value!==id);
    else{if(selection.length>=limit){announce('En fazla 10 renk karşılaştırabilirsin. Yeni bir renk eklemek için seçtiklerinden birini kaldır.');return false;}selection.push(id);}
    persistSelection();renderTray();if(compare.open)renderCompare();return true;
  }
  function invalidateDownload(){downloadRevision++;if(toneDownloadURL){URL.revokeObjectURL(toneDownloadURL);toneDownloadURL=null;}}
  function prepareDownload(photo){
    invalidateDownload();const revision=downloadRevision,profile=toneProfiles[photo.tone];
    save.textContent=/\.png$/i.test(photo.file)?'PNG indir':'JPG indir';save.removeAttribute('aria-busy');byId('download-status').textContent='';
    large.onerror=()=>{byId('download-status').textContent='Görsel yüklenemedi. Başka bir görsel seçip yeniden deneyin.';};
    if(!profile){large.removeAttribute('data-tone');save.textContent='Görseli indir';save.href=photo.src;save.download=photo.file;save.removeAttribute('aria-disabled');if(photo.kind==='actual-roi'){save.textContent=/\.png$/i.test(photo.file)?'Kartela PNG indir':'Kartela JPG indir';byId('download-status').textContent='İndirilen dosya tam kartela fotoğrafıdır.';}return;}
    large.setAttribute('data-tone',photo.tone);save.removeAttribute('href');save.setAttribute('aria-disabled','true');save.setAttribute('aria-busy','true');byId('download-status').textContent='JPG hazırlanıyor…';
    const isCurrent=()=>revision===downloadRevision;
    large.onerror=()=>{if(!isCurrent())return;invalidateDownload();save.removeAttribute('href');save.removeAttribute('aria-busy');save.setAttribute('aria-disabled','true');byId('download-status').textContent='Görsel yüklenemedi. Yeniden açıp tekrar deneyin.';};
    createToneJpeg(photo.src,profile.matrix,isCurrent).then(blob=>{
      if(!blob||!isCurrent())return;toneDownloadURL=URL.createObjectURL(blob);save.href=toneDownloadURL;save.download=photo.file.replace(/\.jpe?g$/i,'')+'-soft.jpg';save.removeAttribute('aria-disabled');save.removeAttribute('aria-busy');byId('download-status').textContent='';
    }).catch(()=>{if(!isCurrent())return;save.removeAttribute('href');save.removeAttribute('aria-busy');save.setAttribute('aria-disabled','true');byId('download-status').textContent='JPG oluşturulamadı. Görseli yeniden açıp tekrar deneyin.';});
  }
  function showImage(index){
    if(!currentImages.length)return;currentImage=(index+currentImages.length)%currentImages.length;
    const photo=currentImages[currentImage];byId('detail-stage').classList.remove('zoomed');byId('zoom-image').setAttribute('aria-pressed','false');
    large.src=photo.src;large.alt=photo.alt||[familyMap.get(currentMaterial.family).name,photo.name,photo.shot].filter(Boolean).join(' · ');
    byId('photo-id').textContent=photo.label||photo.shot||'Numune fotoğrafı';byId('photo-note').textContent=photo.collection==='staticAndLightingPilots'?(photo.kind.includes('lighting')?'Işık tonları yaklaşık bir görsel karşılaştırmadır; spektral olarak kalibre edilmiş ölçüm değildir.':photo.kind.includes('metre')?'Ölçüler nominal kumaş boyutunu gösterir.':'Kumaş yüzeyini gösteren sabit görselleştirme.') :photo.collection==='textureDetails'?'Doku yakın planı · Stüdyo görselleştirmesi':'';byId('photo-kind').textContent=photo.kind==='sample-card'?(photo.containsPhysicalSamplePhoto?'Gerçek kumaş fotoğrafından numune kartı':photo.isPhysicalSample?'Gerçek numune fotoğrafı':'Numune kartı görselleştirmesi'):photo.kind==='folded-swatch'?'Kıvrımlı numune görselleştirmesi':photo.kind==='studio'?'Stüdyo görselleştirmesi':photo.collection==='staticAndLightingPilots'?'Kumaş ve ışık çalışması':photo.collection==='textureDetails'?'Doku ayrıntısı':photo.kind==='label'?'Etiket fotoğrafı':photo.kind==='chart'||photo.kind==='actual-roi'?'Gerçek kartela fotoğrafı':'Gerçek numune fotoğrafı';
    byId('material-image-counter').textContent=(currentImage+1)+' / '+currentImages.length+' görsel';
    byId('prev').disabled=byId('next').disabled=currentImages.length<2;
    for(const thumb of document.querySelectorAll('[data-photo-index]'))thumb.setAttribute('aria-pressed',String(Number(thumb.dataset.photoIndex)===currentImage));
    prepareDownload(photo);
    if(photo.kind==='sample-card'||photo.kind==='folded-swatch')save.textContent='WEBP indir';
    document.documentElement.dataset.currentMaterialImage=String(currentImage);
  }
  function placeColourSelector(){const mobile=matchMedia('(max-width:850px)').matches,colours=byId('material-colours');if(mobile)byId('mobile-material-colours').append(colours);else byId('detail-description').before(colours);}
  function renderDetail(material,preferredPhoto=null){
    const family=familyMap.get(material.family),card=sampleCards.get(material.id);currentImages=[...(card?[card]:[]),...material.photos,...(sharedAssetsReady?(assetSlots.get(material.id)?.photos||[]):[])];
    byId('detail-current-selection').textContent=consumerTitle(material.family)+' · '+titleLabel(material);byId('detail-family').textContent=consumerTitle(material.family);byId('detail-title').textContent=titleLabel(material);byId('detail-colour-secondary').textContent=secondaryName(material);byId('detail-colour-secondary').hidden=!secondaryName(material);byId('detail-badges').innerHTML=badgesHTML(material);
    byId('detail-description').textContent=familyContent.get(material.family).summaryTR;
    renderConsumerDetails(material);
    const siblings=materials.filter(m=>m.family===material.family);if(!siblings.some(m=>m.id===material.id))siblings.unshift(material);
    byId('material-colours-count').textContent='('+siblings.length+')';byId('detail-colour-active').textContent='Seçili renk: '+titleLabel(material);
    byId('detail-colour-chips').innerHTML=siblings.map(m=>`<button type="button" class="material-colour-chip" data-material-colour="${esc(m.id)}" aria-label="${esc(family.name+' · '+titleLabel(m))}" aria-pressed="${m.id===material.id}" title="${esc(titleLabel(m))}">${imageHTML(colourPhoto(m),'','lazy',true)}<span>${esc(titleLabel(m))}</span></button>`).join('');
    placeColourSelector();
    byId('detail-select').dataset.select=material.id;
    const thumb=(p,index,number='')=>`<button type="button" class="image-thumb" data-photo-index="${index}" aria-label="${esc(p.label||p.shot||'Numune fotoğrafı')} görselini göster" aria-pressed="false">${imageHTML(p,'','lazy',true)}${number?`<span class="thumb-number" aria-hidden="true">${number}</span>`:''}</button>`;
    const studio=currentImages.map((p,index)=>({p,index})).filter(({p})=>p.kind==='studio');
    byId('sample-card-thumbs').innerHTML=card?thumb(card,currentImages.indexOf(card),card.isPhysicalSample?'Numune':'Kart'):'';byId('studio-heading').classList.toggle('has-sample-card',Boolean(card));
    byId('studio-details').hidden=!studio.length&&!card;byId('studio-summary').textContent=studio.length?studio.length+' stüdyo görseli':'';byId('studio-thumbs').innerHTML=studio.map(({p,index},ordinal)=>thumb(p,index,ordinal+1)).join('');
    byId('studio-tone-note').textContent=studio.length?'Aynı kumaşın sekiz farklı görünümü. Renk, ışığın ve havın yönüne göre değişebilir.':'';
    const detailPhotos=currentImages.map((p,index)=>({p,index})).filter(({p})=>p.collection==='textureDetails');
    const testPhotos=currentImages.map((p,index)=>({p,index})).filter(({p})=>p.collection==='staticAndLightingPilots');
    byId('texture-details-group').hidden=!detailPhotos.length;byId('texture-detail-thumbs').innerHTML=detailPhotos.map(({p,index},n)=>thumb(p,index,n+1)).join('');
    byId('static-tests-group').hidden=!testPhotos.length;byId('static-test-thumbs').innerHTML=testPhotos.map(({p,index},n)=>thumb(p,index,p.slot==='sphere'?'Küre':p.slot==='metre-horizontal'?'Yatay':p.slot==='metre-vertical'?'Dikey':p.kind==='lighting-comparison'?'Tümü':(p.label.match(/(?:5600|4000|6500) K/)||[])[0]||n+1)).join('');
    byId('chart-links').innerHTML=currentImages.map((p,index)=>({p,index})).filter(({p})=>p.kind==='chart').map(({p,index})=>`<button type="button" class="text-button" data-photo-index="${index}">${esc(p.shot||'Kartelayı aç')}</button>`).join('');
    const preferred=preferredPhoto?currentImages.filter(p=>p.kind===preferredPhoto.kind)[preferredPhoto.position]:null;
    updateSelectionButtons();showImage(Math.max(0,currentImages.indexOf(preferred||primaryPhoto(material))));
  }
  function openMaterial(id,opener,preferredPhoto=null){
    const material=allMaterials.get(id);if(!material)return;
    detailOpener=opener||document.activeElement;currentMaterial=material;renderDetail(material,preferredPhoto);if(!detail.open)detail.showModal();
    document.documentElement.dataset.currentMaterial=id;
  }
  function renderCompare(){
    byId('compare-empty').hidden=selection.length>0;
    byId('compare-grid').innerHTML=selection.map(id=>{const m=allMaterials.get(id),family=familyMap.get(m.family),photo=primaryPhoto(m);return `<article class="compare-card${photo.kind==='sample-card'?' sample-card-comparison':''}">${imageHTML(photo,'','eager',true)}${photo.kind==='sample-card'?'<p class="sample-card-caption">Numune görselleştirmesi</p>':''}<p class="card-fabric-type">${esc(consumerTitle(m.family))}</p><h3>${esc(titleLabel(m))}</h3>${secondaryNameHTML(m)}${traitsHTML(m.family)}${badgesHTML(m)}<p>${esc(consumerComposition(m))}</p><button type="button" class="text-button" data-open="${esc(id)}">Ayrıntıları aç</button><br><button type="button" class="text-button" data-select="${esc(id)}">Seçimden kaldır</button></article>`;}).join('');
    byId('copy-selection').disabled=byId('download-selection').disabled=!selection.length;
    byId('compare-title').textContent='Renkleri karşılaştır · '+selection.length;
  }
  function openCompare(opener){compareOpener=opener||document.activeElement;renderCompare();if(!compare.open)compare.showModal();}
  function selectionRows(){return selection.map(id=>{const m=allMaterials.get(id);return{id:m.id,family:consumerTitle(m.family),name:titleLabel(m),turkishColorName:secondaryName(m),composition:consumerComposition(m),photo:primaryPhoto(m).src};});}
  async function copySelection(){
    const text=selectionRows().map(m=>[m.family,m.name,m.turkishColorName].filter(Boolean).join(' · ')).join('\n');
    let copied=false;try{await navigator.clipboard.writeText(text);copied=true;}catch{
      const area=document.createElement('textarea'),previous=document.activeElement;area.value=text;area.style.position='fixed';area.style.opacity='0';compare.append(area);area.select();try{copied=document.execCommand('copy');}catch{}area.remove();previous?.focus?.({preventScroll:true});
    }
    byId('compare-status').textContent=copied?'Seçim listesi kopyalandı.':'Kopyalama bu pencerede kullanılamıyor. Listeyi indirebilirsin.';
  }
  function downloadSelection(){
    const blob=new Blob([JSON.stringify({collection:'SOMASS SOFF malzeme seçimi',exportedAt:new Date().toISOString(),materials:selectionRows()},null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='SOMASS-Malzeme-Secimi.json';compare.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
  }
  function toggleZoom(){const zoomed=byId('detail-stage').classList.toggle('zoomed');byId('zoom-image').setAttribute('aria-pressed',String(zoomed));}
  renderFabricGuide();
  for(const container of document.querySelectorAll('[data-filter-form]'))buildFilters(container);
  document.addEventListener('change',event=>{
    const input=event.target.closest('input[data-filter]');if(!input)return;
    const type=input.dataset.filter,set=type==='family'?filters.families:filters.colors;
    if(input.checked)set.add(input.value);else set.delete(input.value);
    renderCards();
  });
  document.addEventListener('click',event=>{
    const familyChoice=event.target.closest('[data-guide-family]');if(familyChoice){filters.families.clear();if(familyChoice.dataset.guideFamily)filters.families.add(familyChoice.dataset.guideFamily);renderCards();if(familyChoice.dataset.guideFamily)byId('results-title').scrollIntoView({block:'start',behavior:'auto'});return;}
    const colour=event.target.closest('[data-material-colour]');if(colour){const previous=currentImages[currentImage],preferred=previous?{kind:previous.kind,position:currentImages.filter(p=>p.kind===previous.kind).indexOf(previous)}:null,id=colour.dataset.materialColour,opener=[...document.querySelectorAll('#material-grid [data-open]')].find(b=>b.dataset.open===id)||detailOpener;openMaterial(id,opener,preferred);[...byId('detail-colour-chips').querySelectorAll('button')].find(b=>b.dataset.materialColour===id)?.focus({preventScroll:true});return;}
    const open=event.target.closest('[data-open]');if(open){openMaterial(open.dataset.open,open);return;}
    const chosen=event.target.closest('[data-select]');if(chosen){toggleSelection(chosen.dataset.select);return;}
    const photo=event.target.closest('[data-photo-index]');if(photo){showImage(Number(photo.dataset.photoIndex));return;}
    const clear=event.target.closest('[data-clear]');if(clear){clearFilters();return;}
    const removed=event.target.closest('[data-remove-filter]');if(removed){const type=removed.dataset.removeFilter;(type==='family'?filters.families:filters.colors).delete(removed.dataset.value);renderCards();return;}
    const action=event.target.closest('[data-action]')?.dataset.action;
    if(action==='open-compare')openCompare(event.target.closest('button'));
    else if(action==='clear-selection'){selection=[];persistSelection();renderTray();if(compare.open)renderCompare();}
  });
  byId('material-search').addEventListener('input',event=>{filters.query=event.target.value;renderCards();});
  byId('open-filters').onclick=()=>filterDialog.showModal();byId('close-filters').onclick=()=>filterDialog.close();byId('filter-apply').onclick=()=>filterDialog.close();
  byId('coded-reference-link').onclick=event=>{event.preventDefault();byId('unmapped-references').open=true;byId('unmapped-references').scrollIntoView({behavior:'smooth',block:'start'});};
  byId('close-detail').onclick=()=>detail.close();byId('close-compare').onclick=()=>compare.close();
  byId('prev').onclick=()=>showImage(currentImage-1);byId('next').onclick=()=>showImage(currentImage+1);byId('zoom-image').onclick=toggleZoom;large.onclick=toggleZoom;
  save.onclick=event=>{if(save.getAttribute('aria-disabled')==='true')event.preventDefault();};
  byId('copy-selection').onclick=copySelection;byId('download-selection').onclick=downloadSelection;
  detail.addEventListener('keydown',event=>{if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();showImage(currentImage+(event.key==='ArrowLeft'?-1:1));}});
  detail.addEventListener('close',()=>{if(detail.open)return;invalidateDownload();large.removeAttribute('data-tone');large.removeAttribute('src');large.onerror=null;byId('download-status').textContent='';if(detailOpener?.isConnected)detailOpener.focus({preventScroll:true});});
  compare.addEventListener('close',()=>{if(compare.open)return;if(compareOpener?.isConnected)compareOpener.focus({preventScroll:true});});
  for(const dialog of[detail,compare,filterDialog]){
    dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close();});
    dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dialog.close();}});
  }
  let touchStart=null;large.addEventListener('touchstart',event=>{touchStart=event.touches.length===1?event.touches[0]:null;},{passive:true});large.addEventListener('touchcancel',()=>{touchStart=null;});large.addEventListener('touchend',event=>{const first=touchStart;touchStart=null;if(!first||event.touches.length||byId('detail-stage').classList.contains('zoomed'))return;const last=[...event.changedTouches].find(p=>p.identifier===first.identifier);if(last&&Math.abs(last.clientX-first.clientX)>45&&Math.abs(last.clientX-first.clientX)>Math.abs(last.clientY-first.clientY)*1.4)showImage(currentImage+(last.clientX<first.clientX?1:-1));});
  matchMedia('(max-width:850px)').addEventListener('change',placeColourSelector);
  window.addEventListener('hashchange',()=>{applyHash();window.scrollTo(0,0);});window.addEventListener('pagehide',invalidateDownload);
  window.addEventListener('load',()=>{if(data.hashAliases[location.hash.slice(1)])window.scrollTo(0,0);},{once:true});
  renderReferenceCards();applyHash();renderTray();
  const linkedKey=new URL(location.href).searchParams.get('material'),linked=linkedKey?resolveMaterialKey(linkedKey):null;if(linked){filters.families=new Set([linked.family]);renderCards();openMaterial(linked.id,[...document.querySelectorAll('#material-grid [data-open]')].find(button=>button.dataset.open===linked.id));}

  window.materialGallery={get counts(){return{all:materials.length,visible:visible.length,selected:selection.length};},get visibleIds(){return visible.map(m=>m.id);},get selectedIds(){return[...selection];},get current(){return currentMaterial?{id:currentMaterial.id,image:currentImage,photo:currentImages[currentImage]}:null;},get images(){return [...currentImages];},get storageAvailable(){return storageAvailable;},open:openMaterial,showImage,toggleSelection,openCompare,clearFilters,filter(values={}){if('query'in values){filters.query=values.query;byId('material-search').value=values.query;}for(const[name,key]of[['families','families'],['colors','colors']])if(name in values)filters[key]=new Set(values[name]);renderCards();},get selectionRows(){return selectionRows();}};
  document.documentElement.dataset.materialGalleryReady='true';
})();
