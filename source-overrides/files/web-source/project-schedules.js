/* Read-only quantities from the open project. No saved model or storage is changed. */
(function (g) {
  'use strict';
  const NAMES = {
    'partition':'Bölücü duvar','curtain':'Bölücü perde','slat-divider':'Çıtalı separatör',
    'wall-panel':'Ahşap duvar paneli','wall-finish':'Duvar / kolon boyası','oak-platform':'Meşe platform',
    'indoor-plant':'İç mekân bitkisi','sofa-three':'Üçlü koltuk','sofa-chaise':'Dinlenmeli köşe koltuk',
    'sofa-corner':'Köşe modüllü L koltuk','art-frame':'Çerçeveli tablo','wall-text':'Kabartma manifesto',
    'wood-logo':'Ahşap SO.MASS logo','reception-desk':'Banko','fabric-display':'Kumaş numune askısı',
    'wall-fabric-rack':'Duvara bağlı kumaş numune askılığı',
    'display-podium':'Tüllü yuvarlak teşhir','printed-screen':'Baskılı tül separatör',
    'folding-screen':'Katlanır kumaş separatör','fabric-panel':'Asılı kumaş panel',
    'display-board':'Ayaklı pano','storage-module':'Raf ve dolap modülü'
  };
  const CATEGORIES = {bed:'Karyola',night:'Komodin',dresser:'Şifonyer',bench:'Bench',vanity:'Makyaj masası',
    wardrobe:'Gardırop',shelf:'Kitaplık / raf',rug:'Halı',coffee:'Sehpa',console:'Konsol',
    sideboard:'TV ünitesi / büfe',armchair:'Berjer',table:'Masa',mirror:'Ayna',chair:'Sandalye',desk:'Çalışma masası',coat:'Askılık'};
  const GROUPS = [
    {key:'furniture',label:'Mobilyalar',prefix:'F'},
    {key:'accessories',label:'Aksesuarlar',prefix:'A'},
    {key:'display',label:'Teşhir / separatör / platform',prefix:'T'},
    {key:'finishes',label:'Panel ve boya',prefix:'Y'}
  ];
  const DISPLAY = new Set(['curtain','slat-divider','oak-platform','reception-desk','fabric-display','display-podium',
    'printed-screen','folding-screen','fabric-panel','display-board','storage-module','wall-fabric-rack']);
  const ACCESSORIES = new Set(['indoor-plant','art-frame','wall-text','wood-logo']);
  const STYLES = ['color','materialOverrides','fabricFinish','pantryExteriorColor','palette','paintCode','paintName',
    'paintEffect','effectStrength','matColor','plantKey','chaiseSide','panelCount','foldAngle','sampleCount',
    'curveCm','moduleWidthCm','slatWidthCm','gapCm','pleatCm','opacity','artLayout','letterSizeCm','casegoodsPresentation',
    'rackBoardHeightCm','rackFabricLengthCm','rackPegColor'];
  function meaningfulStyle(o,key) {
    if(['color','materialOverrides','pantryExteriorColor','casegoodsPresentation'].includes(key))return true;
    if(key==='fabricFinish')return ['sofa-three','sofa-chaise','sofa-corner'].includes(o.kind);
    if(key==='chaiseSide')return o.kind==='sofa-chaise';
    if(key==='palette')return ['printed-screen','wall-fabric-rack'].includes(o.kind);
    if(['paintCode','paintName','paintEffect','effectStrength'].includes(key))return o.kind==='wall-finish';
    if(key==='plantKey')return o.kind==='indoor-plant';
    if(['panelCount','foldAngle'].includes(key))return ['printed-screen','folding-screen'].includes(o.kind);
    if(key==='sampleCount')return ['fabric-display','wall-fabric-rack'].includes(o.kind);
    if(['rackBoardHeightCm','rackFabricLengthCm','rackPegColor'].includes(key))return o.kind==='wall-fabric-rack';
    if(key==='curveCm')return ['curtain','slat-divider'].includes(o.kind);
    if(key==='moduleWidthCm')return ['wall-panel','oak-platform'].includes(o.kind);
    if(['slatWidthCm','gapCm'].includes(key))return o.kind==='slat-divider';
    if(['pleatCm','opacity'].includes(key))return o.kind==='curtain';
    if(['artLayout','matColor'].includes(key))return o.kind==='art-frame';
    if(key==='letterSizeCm')return o.kind==='wall-text';
    return false;
  }
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const num = v => finite(v) ? v : null;
  const positive = v => finite(v) && v > 0 ? v : null;
  const round = n => finite(n) ? Math.round(n * 1e6) / 1e6 : null;
  const clone = v => v === undefined ? null : JSON.parse(JSON.stringify(v));
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = v => finite(v) ? new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2}).format(v) : '—';
  const stable = v => JSON.stringify(v, function (_,value) { return value && !Array.isArray(value) && typeof value==='object' ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])) : value; });
  function hash(text) { let n=2166136261;for(const c of String(text)){n^=c.codePointAt(0);n=Math.imul(n,16777619);}return (n>>>0).toString(16).toUpperCase().padStart(8,'0'); }
  function code(prefix,value,used) {let out=prefix+'-'+hash(value);if(used.has(out)&&used.get(out)!==value)out+='-'+hash('extra:'+value);used.set(out,value);return out;}
  function kindGroup(o) {
    if(o.type==='column')return 'columns';
    if(o.kind==='partition')return 'partitions';
    if(['wall-panel','wall-finish'].includes(o.kind))return 'finishes';
    if(DISPLAY.has(o.kind))return 'display';
    if(ACCESSORIES.has(o.kind)||['rug','mirror'].includes(o.catalogProduct?.category))return 'accessories';
    if(o.catalogProduct||o.type==='furniture')return 'furniture';
    return 'other';
  }
  function dims(o) {
    let height=o.catalogProduct?positive(o.catalogProduct.heightCm):positive(o.heightCm),upper=null;
    if(o.kind==='art-frame'){height=positive(o.artHeightCm);upper=num(o.heightCm);}
    if(['wood-logo','wall-text'].includes(o.kind)){height=null;upper=num(o.heightCm);}
    if(['curtain','wall-panel','wall-finish','oak-platform'].includes(o.kind)) {
      upper=num(o.heightCm);height=finite(o.heightCm)&&finite(o.bottomCm)?positive(o.heightCm-o.bottomCm):null;
    }
    if(o.kind==='display-podium')height=positive(o.platformHeightCm);
    if(o.kind==='wall-fabric-rack'){const board=positive(o.rackBoardHeightCm),fabric=positive(o.rackFabricLengthCm);upper=num(o.heightCm);height=board!==null&&fabric!==null?Math.max(board,board/2+fabric):null;}
    return {widthCm:positive(o.w),depthCm:positive(o.h),heightCm:height,upperElevationCm:upper,
      suspendedHeightCm:o.kind==='display-podium'?positive(o.heightCm):null};
  }
  function finishText(o) {
    const parts=[];if(o.kind==='wall-finish'&&(o.paintCode||o.paintName))parts.push([o.paintCode,o.paintName].filter(Boolean).join(' '));
    const sofa=['sofa-three','sofa-chaise','sofa-corner'].includes(o.kind),colors={'#d8cfbb':'Krem bej','#493027':'Koyu kahve','#747052':'Haki'};
    if(o.color)parts.push((sofa&&colors[String(o.color).toLowerCase()]?colors[String(o.color).toLowerCase()]+' · ':'')+o.color);
    if(sofa&&o.fabricFinish)parts.push(o.fabricFinish==='velvet'?'kadife':o.fabricFinish==='woven'?'dokuma':o.fabricFinish);
    if(o.kind==='wall-finish'&&o.paintEffect)parts.push(o.paintEffect==='limewash'?'limewash':o.paintEffect==='matte'?'mat':o.paintEffect);
    for(const [k,v] of Object.entries(o.materialOverrides||{}))if(v)parts.push((({wood:'ahşap',fabric:'döşeme',body:'gövde'})[k]||k)+' '+v);
    if(o.pantryExteriorColor)parts.push('dış gövde '+o.pantryExteriorColor);
    if(['printed-screen','wall-fabric-rack'].includes(o.kind)&&o.palette)parts.push('palet '+({sage:'Adaçayı / terrakota / krem',blue:'Mürekkep / kum / açık mavi',clay:'Kil / tütün / keten',rose:'Pudra / mürdüm / zeytin'}[o.palette]||o.palette));
    if(o.kind==='wall-fabric-rack'&&o.rackPegColor)parts.push('meşe düğmeler '+o.rackPegColor);
    if(!o.color&&!Object.values(o.materialOverrides||{}).some(Boolean)&&o.catalogProduct){
      const sourceName=String(o.catalogProduct.name||o.label||''),match=sourceName.match(/koyu\s+meşe|açık\s+meşe|naturel\s+meşe|doğal\s+meşe|natural\s+oak|dark\s+oak|light\s+oak|ceviz|walnut/i);
      if(match)parts.push(match[0]+' (ürün adı)');
    }
    return parts.join(' · ')||'Kayıtlı renk bilgisi yok';
  }
  function dimensionsText(d) {
    let value=[d.widthCm,d.depthCm,d.heightCm].map(fmt).join(' × ')+' cm';
    if(d.upperElevationCm!==null)value+=' · üst kot '+fmt(d.upperElevationCm)+' cm';
    if(d.suspendedHeightCm!==null)value+=' · üst teşhir '+fmt(d.suspendedHeightCm)+' cm';
    return value;
  }
  function specificationText(row) {
    const s=row.specification,parts=[];
    if(s.curveCm)parts.push('yay derinliği '+fmt(s.curveCm)+' cm');
    if(finite(s.arcLengthCm)&&s.curveCm)parts.push('hat uzunluğu '+fmt(s.arcLengthCm)+' cm');
    if(finite(s.sampleCount))parts.push(s.sampleCount+' numune');
    if(finite(s.rackBoardHeightCm))parts.push('pano boyu '+fmt(s.rackBoardHeightCm)+' cm');
    if(finite(s.rackFabricLengthCm))parts.push('kumaş sarkması '+fmt(s.rackFabricLengthCm)+' cm');
    if(finite(s.panelCount))parts.push(s.panelCount+' kanat');
    if(s.chaiseSide)parts.push('dinlenme '+(s.chaiseSide==='left'?'sol':'sağ'));
    return parts.join(' · ');
  }
  function unionArea(rects) {
    const xs=[...new Set(rects.flatMap(r=>[r.x1,r.x2]))].sort((a,b)=>a-b);let area=0;
    for(let i=1;i<xs.length;i++) {const mid=(xs[i-1]+xs[i])/2,ys=rects.filter(r=>r.x1<mid&&r.x2>mid).map(r=>[r.y1,r.y2]).sort((a,b)=>a[0]-b[0]);let span=0,end=-Infinity;
      for(const [a,b] of ys){span+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}area+=(xs[i]-xs[i-1])*span;}
    return area;
  }
  function openingRect(o,length,height,settings) {
    let oh=positive(o.heightCm),heightSource=oh?'açıklık kaydı':null;
    if(oh===null){const field=o.type==='window'||o.heightMode==='glazing'?'glazingHeightCm':'doorHeightCm';oh=positive(settings?.[field]);if(oh!==null)heightSource='proje ayarı';}
    const bottom=finite(o.bottomCm)?o.bottomCm:finite(o.sillHeightCm)?o.sillHeightCm:o.type==='door'||o.heightMode==='glazing'?0:null;
    const offset=num(o.offset),width=positive(o.width);
    const valid=length!==null&&height!==null&&offset!==null&&width!==null&&oh!==null&&bottom!==null&&offset>=0&&bottom>=0;
    const rect=valid?{x1:Math.max(0,offset),x2:Math.min(length,offset+width),y1:Math.max(0,bottom),y2:Math.min(height,bottom+oh)}:null;
    const clipped=rect&&rect.x2>rect.x1&&rect.y2>rect.y1?rect:null;
    return {originalId:o.id,type:o.type,doorSystem:o.doorSystem||null,widthCm:width,offsetCm:offset,
      heightCm:oh,bottomCm:bottom,heightSource,rect:clipped,areaM2:clipped?round((clipped.x2-clipped.x1)*(clipped.y2-clipped.y1)/10000):valid?0:null,
      complete:!!valid,outside:!!valid&&(offset+width>length+.01||bottom+oh>height+.01)};
  }
  function divider(o,plan,used) {
    const length=positive(o.w),height=positive(o.heightCm),thickness=positive(o.h);
    const openings=(plan.openings||[]).filter(p=>p.wallId===o.id).map(p=>openingRect(p,length,height,plan.spaceSettings));
    const gross=length!==null&&height!==null?length*height/10000:null;
    const known=gross!==null&&openings.every(p=>p.complete),cut=known?unionArea(openings.map(p=>p.rect).filter(Boolean))/10000:null;
    const net=known?Math.max(0,gross-cut):null,rotation=num(o.rotation);
    const endpoints=finite(o.x)&&finite(o.y)&&rotation!==null&&length!==null?(()=>{const a=rotation*Math.PI/180,dx=Math.cos(a)*length/2,dy=Math.sin(a)*length/2;return {a:{x:round(o.x-dx),y:round(o.y-dy)},b:{x:round(o.x+dx),y:round(o.y+dy)}};})():null;
    const existingCode=typeof o.code==='string'&&/^[A-Za-z0-9_-]{1,24}$/.test(o.code)&&!used.has(o.code)?o.code:null;if(existingCode)used.set(existingCode,String(o.id));
    return {code:existingCode||code('B',String(o.id),used),originalId:o.id,name:o.label||NAMES.partition,lengthCm:length,thicknessCm:thickness,heightCm:height,
      center:{x:num(o.x),y:num(o.y)},rotationDeg:rotation,endpoints,color:o.color||null,openings,
      grossOneFaceM2:round(gross),grossTwoFacesM2:round(gross===null?null:gross*2),
      openingAreaOneFaceM2:round(cut),netOneFaceM2:round(net),netTwoFacesM2:round(net===null?null:net*2),
      material:o.material||null,constructionType:o.constructionType||null,
      materialStatus:o.material==='plasterboard'||String(o.constructionType||'').includes('plasterboard')?'Alçıpan olarak kayıtlı':'Bölücü; duvar sistemi belirtilmemiş',
      notes:[...(openings.some(p=>!p.complete)?['Açıklık yüksekliği / alt kotu eksik; net alan hesaplanmadı.']:[]),...(openings.some(p=>p.outside)?['Açıklık sınırı duvar yüzüne kırpıldı; ölçüyü denetle.']:[])]};
  }
  function totals(rows) {
    const sum=key=>({value:round(rows.reduce((s,r)=>s+(finite(r[key])?r[key]:0),0)),unknown:rows.filter(r=>!finite(r[key])).length});
    return {count:rows.length,lengthCm:sum('lengthCm'),grossOneFaceM2:sum('grossOneFaceM2'),grossTwoFacesM2:sum('grossTwoFacesM2'),netOneFaceM2:sum('netOneFaceM2'),netTwoFacesM2:sum('netTwoFacesM2')};
  }
  function extract(plan,options={}) {
    if(!plan||!Array.isArray(plan.objects))throw Error('Açık planın öğe listesi bulunamadı.');
    const used=new Map(),seen=new Set(),maps=Object.fromEntries(GROUPS.map(g=>[g.key,new Map()])),partitions=[],excluded=[],warnings=[];
    for(const input of [...plan.objects].sort((a,b)=>String(a.id).localeCompare(String(b.id)))) {
      if(!input||typeof input.id!=='string'||seen.has(input.id))throw Error('Öğe kimlikleri eksik veya tekrarlı.');seen.add(input.id);
      let o=input;try{if(options.resolveObject)o=options.resolveObject(input,plan)||input;}catch(_){warnings.push((input.label||input.id)+': duvar bağlantısı çözülemedi; kayıtlı ölçü gösterildi.');}
      const group=kindGroup(o);
      if(group==='partitions'){partitions.push(divider(o,plan,used));continue;}
      if(!maps[group]){excluded.push({originalId:o.id,kind:o.kind||null,type:o.type||null,name:o.label||NAMES[o.kind]||o.kind||o.type});continue;}
      const dimensions=dims(o),style=Object.fromEntries(STYLES.filter(k=>o[k]!==undefined&&meaningfulStyle(o,k)).map(k=>[k,clone(o[k])])),catalog=o.catalogProduct;
      const name=catalog?.name||o.label||NAMES[o.kind]||o.kind||'Mobilya';
      const category=catalog?.category||o.kind||'furniture',categoryName=CATEGORIES[category]||NAMES[o.kind]||category;
      const key=stable({product:catalog?.id||null,kind:o.kind||null,category,name,dimensions,style});
      const map=maps[group];if(!map.has(key))map.set(key,{code:code(GROUPS.find(g=>g.key===group).prefix,key,used),name,category,categoryName,kind:o.kind||null,
        productId:catalog?.id||null,sourceProductId:catalog?.sourceProductId||null,quantity:0,dimensions,finish:style,finishText:finishText(o),
        specification:{...(['curtain','slat-divider'].includes(o.kind)&&finite(o.curveCm)?{curveCm:o.curveCm}:{}),...(['curtain','slat-divider'].includes(o.kind)&&positive(o.w)&&finite(o.curveCm)?{arcLengthCm:round(Math.abs(o.curveCm)<.0001?o.w:(()=>{const a=2*Math.atan(2*Math.abs(o.curveCm)/o.w);return o.w*a/Math.sin(a);})())}:{}),...(['fabric-display','wall-fabric-rack'].includes(o.kind)&&finite(o.sampleCount)?{sampleCount:o.sampleCount}:{}),...(o.kind==='wall-fabric-rack'?{rackBoardHeightCm:num(o.rackBoardHeightCm),rackFabricLengthCm:num(o.rackFabricLengthCm)}:{}),...(['printed-screen','folding-screen'].includes(o.kind)&&finite(o.panelCount)?{panelCount:o.panelCount}:{}),...(o.kind==='sofa-chaise'&&o.chaiseSide?{chaiseSide:o.chaiseSide}:{})},sourceIds:[]});
      const row=map.get(key);row.quantity++;row.sourceIds.push(o.id);
    }
    const groups=Object.fromEntries(GROUPS.map(g=>[g.key,[...maps[g.key].values()].sort((a,b)=>a.categoryName.localeCompare(b.categoryName,'tr')||a.name.localeCompare(b.name,'tr')||a.code.localeCompare(b.code))]));
    const quantities=Object.fromEntries(GROUPS.map(g=>[g.key,groups[g.key].reduce((n,r)=>n+r.quantity,0)]));
    const count=Object.values(quantities).reduce((s,n)=>s+n,0)+partitions.length+excluded.length;
    if(count!==plan.objects.length)throw Error('Liste toplamı plan öğeleriyle eşleşmedi.');
    return {schemaVersion:1,projectName:plan.name||'SOMASS mağaza planı',projectUpdatedAt:plan.projectUpdatedAt||null,generatedAt:options.now||new Date().toISOString(),
      units:'cm / m²',...groups,partitions,dividerTotals:totals(partitions),
      existingBulkheads:(plan.walls||[]).filter(w=>w.material==='plasterboard'||String(w.constructionType||'').includes('plasterboard')).map(w=>({originalId:w.id,label:w.label||null,material:w.material||null,constructionType:w.constructionType||null,a:clone(w.a),b:clone(w.b)})),
      excluded,warnings,validation:{sourceObjectCount:plan.objects.length,classifiedCount:count,quantities,partitionCount:partitions.length,excludedCount:excluded.length,conserved:true},
      notes:['Listeler yalnız açık planda bulunan öğeleri sayar; katalogdaki tüm ürünleri saymaz.',
        'Ölçüler cm, alanlar m². — işareti kayıtlı bilginin bulunmadığını gösterir.',
        'Bölücü brüt alanı uzunluk × yüksekliktir. Net alan kayıtlı açıklıkların birleşik alanı düşülerek hesaplanır; iki yüz toplamı ayrıca gösterilir.',
        'Uç yüzler, fire, levha kat sayısı, karkas, yalıtım ve bağlantı elemanları bu metraja dahil değildir. Sistem bilgisi olmayan bölücü alçıpan kabul edilmez.',
        'Mevcut alçıpan şişirmeleri yeni bölücü toplamına katılmaz.']};
  }
  function openingText(row) {return row.openings.length?row.openings.map(o=>(o.type==='door'?'Kapı':'Açıklık')+' '+fmt(o.widthCm)+' × '+fmt(o.heightCm)+' cm'+(o.heightSource==='proje ayarı'?' (proje ayarı)':'')).join('; '):'Yok';}
  function toCSV(report,key) {
    let cells;if(key==='partitions')cells=[['Kod','Ad','Uzunluk cm','Kalınlık cm','Yükseklik cm','Açıklıklar','Brüt tek yüz m2','Net tek yüz m2','Brüt iki yüz m2','Net iki yüz m2','Sistem','Kaynak kimlik'],...report.partitions.map(r=>[r.code,r.name,r.lengthCm,r.thicknessCm,r.heightCm,openingText(r),r.grossOneFaceM2,r.netOneFaceM2,r.grossTwoFacesM2,r.netTwoFacesM2,r.materialStatus,r.originalId])];
    else{if(!GROUPS.some(g=>g.key===key))throw Error('Liste türünü seç.');cells=[['Kod','Kategori','Ürün / eleman','Adet','En cm','Derinlik cm','Yükseklik cm','Üst kot cm','Üst teşhir cm','Renk / doku','Detaylar','Kaynak kimlikler'],...report[key].map(r=>[r.code,r.categoryName,r.name,r.quantity,r.dimensions.widthCm,r.dimensions.depthCm,r.dimensions.heightCm,r.dimensions.upperElevationCm,r.dimensions.suspendedHeightCm,r.finishText,specificationText(r),r.sourceIds.join(' | ')])];}
    return '\uFEFF'+cells.map(row=>row.map(value=>{let s=value===null||value===undefined?'':String(value);if(/^[=+@\-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(';')).join('\r\n');
  }
  function table(headers,rows) {return '<div class="schedule-table-scroll"><table><thead><tr>'+headers.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
  function groupSection(report,spec) {
    const rows=report[spec.key],quantity=rows.reduce((n,r)=>n+r.quantity,0);
    return '<section class="schedule-section" data-schedule-section="'+spec.key+'"><div class="schedule-section-title"><h3>'+esc(spec.label)+' <small>'+rows.length+' kalem · '+quantity+' adet</small></h3><button type="button" data-schedule-csv="'+spec.key+'">CSV indir</button></div>'+
      (rows.length?table(['Kod','Ürün / eleman','Adet','En × derinlik × yükseklik','Renk / doku'],rows.map(r=>['<span title="'+esc(r.sourceIds.join(', '))+'">'+esc(r.code)+'</span>','<strong>'+esc(r.name)+'</strong><small>'+esc(r.categoryName)+'</small>',esc(r.quantity),esc(dimensionsText(r.dimensions))+(specificationText(r)?'<small>'+esc(specificationText(r))+'</small>':''),esc(r.finishText)])):'<p class="schedule-empty">Bu grupta plana yerleştirilmiş öğe yok.</p>')+'</section>';
  }
  function totalText(t) {return fmt(t.value)+(t.unknown?' + '+t.unknown+' ölçüsü eksik':'');}
  function dividerSection(report) {
    const t=report.dividerTotals;
    return '<section class="schedule-section" data-schedule-section="partitions"><div class="schedule-section-title"><h3>Bölücü metrajı <small>'+report.partitions.length+' bölücü</small></h3><button type="button" data-schedule-csv="partitions">CSV indir</button></div><p class="schedule-method">Brüt / net tek yüz ve iki yüz toplamı ayrı gösterilir. Sistem bilgisi olmayan eleman alçıpan olarak onaylanmış değildir.</p>'+
      (report.partitions.length?table(['Kod / ad','Uzunluk','Kalınlık','Yükseklik','Kapı / açıklık','Brüt tek yüz','Net tek yüz','Brüt iki yüz','Net iki yüz'],report.partitions.map(r=>[
        '<strong title="'+esc(r.originalId)+'">'+esc(r.code)+'</strong><small>'+esc(r.name)+'</small><small>'+esc(r.materialStatus)+'</small>',fmt(r.lengthCm)+' cm',fmt(r.thicknessCm)+' cm',fmt(r.heightCm)+' cm',esc(openingText(r)),fmt(r.grossOneFaceM2)+' m²',fmt(r.netOneFaceM2)+' m²',fmt(r.grossTwoFacesM2)+' m²',fmt(r.netTwoFacesM2)+' m²'])):'<p class="schedule-empty">Planda bağımsız bölücü duvar kaydı yok.</p>')+
      '<div class="schedule-totals"><strong>Uzunluk: '+fmt(t.lengthCm.value/100)+' m'+(t.lengthCm.unknown?' + eksik ölçüler':'')+'</strong><span>Brüt tek yüz: '+totalText(t.grossOneFaceM2)+' m²</span><span>Net tek yüz: '+totalText(t.netOneFaceM2)+' m²</span><span>Brüt iki yüz: '+totalText(t.grossTwoFacesM2)+' m²</span><strong>Net iki yüz: '+totalText(t.netTwoFacesM2)+' m²</strong></div>'+
      (report.existingBulkheads.length?'<p class="schedule-method">'+report.existingBulkheads.length+' mevcut alçıpan şişirme duvarı bu yeni bölücü toplamına dahil edilmedi.</p>':'')+
      report.partitions.filter(r=>r.notes.length).map(r=>'<p class="schedule-warning">'+esc(r.code+' · '+r.notes.join(' '))+'</p>').join('')+'</section>';
  }
  function html(report) {return '<header class="schedule-report-header"><p class="schedule-eyebrow">SOMASS · PROJE LİSTELERİ</p><h2>'+esc(report.projectName)+'</h2><p>'+esc(new Date(report.generatedAt).toLocaleString('tr-TR'))+' · Açık yerleşimden üretildi · '+report.validation.sourceObjectCount+' plan öğesi</p></header>'+GROUPS.slice(0,3).map(s=>groupSection(report,s)).join('')+dividerSection(report)+groupSection(report,GROUPS[3])+
      '<section class="schedule-section schedule-notes"><h3>Metraj ve liste notları</h3><ul>'+report.notes.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul>'+(report.excluded.length?'<p>'+report.excluded.length+' kolon / diğer plan öğesi ürün listesi dışında tutuldu.</p>':'')+report.warnings.map(w=>'<p class="schedule-warning">'+esc(w)+'</p>').join('')+'</section>';}
  const api={extract,toCSV,html,dimensionsText,openingText,unionArea};g.SOMASS_PROJECT_SCHEDULES=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(!g.document)return;
  const d=g.document,exportDialog=d.getElementById('exportDialog'),exportOptions=exportDialog?.querySelector('.export-options');if(!exportOptions)return;
  const entry=d.createElement('button');entry.id='projectSchedulesOpen';entry.type='button';entry.innerHTML='<span>≡</span><div><strong>Listeler ve bölücü metrajı</strong><small>Mobilya · aksesuar · teşhir · m²</small></div><span>↗</span>';exportOptions.append(entry);
  const dialog=d.createElement('dialog');dialog.id='projectSchedulesDialog';dialog.className='project-schedules-dialog';dialog.setAttribute('aria-labelledby','projectSchedulesTitle');
  dialog.innerHTML='<div class="schedule-dialog-head"><div><p class="schedule-eyebrow">GÜNCEL YERLEŞİM</p><h2 id="projectSchedulesTitle">Listeler ve bölücü metrajı</h2></div><button type="button" id="projectSchedulesClose" aria-label="Listeleri kapat">×</button></div><div class="schedule-actions"><button type="button" id="projectSchedulesRefresh">Listeyi yenile</button><button type="button" id="projectSchedulesPrint">A3 yazdır / PDF</button><span id="projectSchedulesStatus" role="status"></span></div><div id="projectSchedulesReport"></div>';
  d.body.append(dialog);let current=null;
  function readLive() {if(typeof model==='undefined')throw Error('Açık plan bulunamadı.');return model;}
  function refresh() {try{current=extract(readLive(),{resolveObject:(o,p)=>g.SOMASS_DECOR?.isElement?.(o)?g.SOMASS_DECOR.resolve(o,p):o});d.getElementById('projectSchedulesReport').innerHTML=html(current);d.getElementById('projectSchedulesStatus').textContent='Güncel · '+Object.values(current.validation.quantities).reduce((s,n)=>s+n,0)+' ürün / eleman · '+current.partitions.length+' bölücü';return current;}catch(e){d.getElementById('projectSchedulesStatus').textContent=e.message;return null;}}
  function saveCSV(key) {if(!refresh())return;const blob=new Blob([toCSV(current,key)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=d.createElement('a');a.href=url;a.download='somass-'+key+'-'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
  entry.onclick=()=>{exportDialog.close();refresh();dialog.showModal();};d.getElementById('projectSchedulesClose').onclick=()=>dialog.close();d.getElementById('projectSchedulesRefresh').onclick=refresh;
  dialog.addEventListener('click',e=>{const button=e.target.closest('[data-schedule-csv]');if(button)saveCSV(button.dataset.scheduleCsv);});
  d.getElementById('projectSchedulesPrint').onclick=()=>{if(!refresh())return;const sheet=d.getElementById('printSheet');if(!sheet)return;sheet.innerHTML='<div class="schedule-print-report">'+html(current)+'</div>';let page=d.getElementById('printPageStyle');if(!page){page=d.createElement('style');page.id='printPageStyle';d.head.append(page);}page.textContent='@media print{@page{size:A3 landscape;margin:12mm}#printSheet{width:auto!important;height:auto!important;overflow:visible!important;break-inside:auto!important}#printSheet .schedule-print-report{width:auto;max-width:none}#printSheet .schedule-table-scroll{overflow:visible}#printSheet .schedule-section{break-inside:auto}#printSheet tr{break-inside:avoid}#printSheet thead{display:table-header-group}#printSheet button{display:none!important}#printSheet .schedule-section-title{break-after:avoid}#printSheet .schedule-report-header{break-after:avoid}#printSheet .schedule-print-report table{font-size:9pt}#printSheet .schedule-print-report th,#printSheet .schedule-print-report td{padding:6pt}#printSheet .schedule-print-report h2{font-size:20pt}#printSheet .schedule-print-report h3{font-size:14pt}#printSheet .schedule-section{margin:0 0 18pt}#printSheet .schedule-table-scroll table{min-width:0!important}}';dialog.close();g.print();};
  api.open=()=>{if(exportDialog.open)exportDialog.close();refresh();if(!dialog.open)dialog.showModal();};api.refresh=refresh;
})(globalThis);
