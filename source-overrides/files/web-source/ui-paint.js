/* Current-plan paint workspace. Rendering and exports never change plan data. */
(function (g) {
 'use strict';
 const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const finite = Number.isFinite;
 const color = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#9b9485';
 const fmt = value => new Intl.NumberFormat('tr-TR', {maximumFractionDigits:1}).format(value);
 const normalize = value => String(value ?? '').replace(/[øØ]/g,'o').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const rectangle = o => {
  const a=(o.rotation||0)*Math.PI/180, c=Math.cos(a),s=Math.sin(a);
  return [[-o.w/2,-o.h/2],[o.w/2,-o.h/2],[o.w/2,o.h/2],[-o.w/2,o.h/2]].map(([x,y])=>({x:o.x+x*c-y*s,y:o.y+x*s+y*c}));
 };
 const boundsOf = points => {
  const valid=points.filter(p=>finite(p?.x)&&finite(p?.y));
  if(!valid.length)return {minX:0,minY:0,maxX:100,maxY:100};
  return {minX:Math.min(...valid.map(p=>p.x)),minY:Math.min(...valid.map(p=>p.y)),maxX:Math.max(...valid.map(p=>p.x)),maxY:Math.max(...valid.map(p=>p.y))};
 };
 const padBounds = (b,pad=70) => ({minX:b.minX-pad,minY:b.minY-pad,maxX:b.maxX+pad,maxY:b.maxY+pad});

 function buildScene(plan,deps={}) {
  const D=deps.decor||g.SOMASS_DECOR, R=deps.rooms||g.SOMASS_ROOMS, W=deps.wallBody||g.SOMASS_WALL_BODY, S=deps.space||g.SOMASS_SPACE_3D;
  if(!D?.resolve||!D?.world)throw Error('Boya araçları henüz hazır değil. Birkaç saniye sonra tekrar dene.');
  const scene={name:String(plan?.name||'SOMASS'),paint:[],bodies:[],rooms:[],partitions:[],columns:[],openings:[],errors:[]};
  try { scene.bodies=(W?.drawingBodies?.(plan)||[]).filter(b=>Array.isArray(b.points)); } catch(_) {}
  try { scene.rooms=R?.roomPolygons?.(plan)||[]; } catch(_) {}
  scene.partitions=(plan.objects||[]).filter(o=>o.kind==='partition').map(o=>({id:o.id,points:rectangle(o)}));
  scene.columns=(plan.objects||[]).filter(o=>o.type==='column').map(o=>({id:o.id,points:S?.columnFootprint?.(o)||rectangle(o)}));
  try {scene.columns.push(...(R?.structuralColumnFootprints?.(plan)||[]));}catch(_){}
  for(const raw of (plan.objects||[]).filter(o=>o.kind==='wall-finish')) {
   try {
    const o=D.resolve(raw,plan),row={id:o.id,hostId:o.wallAnchor?.wallId||o.columnAnchor?.columnId||o.id,
     name:String(o.paintName||'Renk adı yok'),code:String(o.paintCode||''),color:color(o.color),width:o.w,
     side:o.wallAnchor?.side||0,edgesOnly:o.paintEdgesOnly===true,column:!!o.columnAnchor,bottom:o.bottomCm,top:o.heightCm,
     effect:o.paintEffect||'matte',segments:[],normal:{x:0,y:1},center:{x:o.x,y:o.y}};
    if(o.columnAnchor) {
     const cf=D.columnFrame(plan,o.columnAnchor.columnId);if(!cf?.points?.length)throw Error('Kolon bağlantısı bulunamadı.');
     const pts=cf.points;let area=0;for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];area+=a.x*b.y-b.x*a.y;}
     row.segments=pts.map((a,i)=>{const b=pts[(i+1)%pts.length],L=Math.hypot(b.x-a.x,b.y-a.y),sign=area>0?1:-1;return {start:a,end:b,normal:{x:sign*(b.y-a.y)/L,y:-sign*(b.x-a.x)/L}};});
     row.width=row.segments.reduce((n,e)=>n+Math.hypot(e.end.x-e.start.x,e.end.y-e.start.y),0);
    } else {
     const f=o.wallAnchor&&D.frame(plan,o.wallAnchor.wallId);if(!f)throw Error('Duvar bağlantısı bulunamadı.');
     row.normal={x:-f.uy*o.wallAnchor.side,y:f.ux*o.wallAnchor.side};
     const rects=D.panelRects(o,plan),floor=rects.filter(r=>r.b<=o.bottomCm+.01);
     row.segments=(floor.length?floor:[{l:-o.w/2,r:o.w/2}]).map(r=>({start:D.world(o,{x:r.l,y:0}),end:D.world(o,{x:r.r,y:0}),normal:row.normal}));
     row.start=D.world(o,{x:-o.w/2,y:0});row.end=D.world(o,{x:o.w/2,y:0});
    }
    if(!finite(row.width)||row.width<=0||!row.segments.every(s=>[s.start,s.end].every(p=>finite(p.x)&&finite(p.y))))throw Error('Yüz ölçüsü geçersiz.');
    row.key=row.code||row.color;scene.paint.push(row);
   } catch(error) {scene.errors.push({id:raw.id,message:String(error.message||error)});}
  }
  for(const o of plan.openings||[]) {
   const w=(plan.walls||[]).find(w=>w.id===o.wallId);if(!w)continue;
   const L=Math.hypot(w.b.x-w.a.x,w.b.y-w.a.y);if(!L)continue;
   const at=t=>({x:w.a.x+(w.b.x-w.a.x)*t/L,y:w.a.y+(w.b.y-w.a.y)*t/L});
   scene.openings.push({type:o.type,start:at(o.offset),end:at(o.offset+o.width)});
  }
  if(!scene.bodies.length)scene.lines=(plan.walls||[]).map(w=>({start:w.a,end:w.b}));
  const points=[...scene.bodies,...scene.partitions,...scene.columns,...scene.rooms].flatMap(x=>x.points||[]);
  points.push(...scene.paint.flatMap(p=>p.segments.flatMap(s=>[s.start,s.end])));
  scene.bounds=padBounds(boundsOf(points),55);
  const map=new Map();for(const p of scene.paint){if(!map.has(p.key))map.set(p.key,{key:p.key,name:p.name,code:p.code,color:p.color,count:0});map.get(p.key).count++;}
  scene.colors=Array.from(map.values());return scene;
 }

 function renderSvg(scene,options={}) {
  const width=options.width||1000,height=options.height||720,b=options.bounds||scene.bounds,pad=24;
  const k=Math.min((width-pad*2)/Math.max(b.maxX-b.minX,1),(height-pad*2)/Math.max(b.maxY-b.minY,1));
  const ox=(width-(b.maxX-b.minX)*k)/2-b.minX*k,oy=(height-(b.maxY-b.minY)*k)/2-b.minY*k;
  const xy=p=>({x:ox+p.x*k,y:oy+p.y*k}),points=pts=>pts.map(p=>{const a=xy(p);return `${a.x.toFixed(2)},${a.y.toFixed(2)}`;}).join(' ');
  const selected=new Set(options.ids||scene.paint.map(p=>p.id)),active=options.activeId;
  const visible=scene.paint.filter(p=>selected.has(p.id));let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Boyalı duvar yüzleri"><rect width="100%" height="100%" fill="#fcfcf8"/>`;
  for(const room of scene.rooms)svg+=`<polygon points="${points(room.points)}" fill="#f5f6f1" stroke="#e2e6dc" stroke-width="1"/>`;
  for(const p of [...scene.bodies,...scene.partitions,...scene.columns])svg+=`<polygon points="${points(p.points)}" fill="#d3d9cc" stroke="#8c9884" stroke-width=".8"/>`;
  for(const s of scene.lines||[]){const a=xy(s.start),c=xy(s.end);svg+=`<line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" stroke="#abb5a4" stroke-width="4"/>`;}
  for(const o of scene.openings.filter(o=>o.type==='window')){const a=xy(o.start),c=xy(o.end);svg+=`<line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" stroke="#b0c8cc" stroke-width="2"/>`;}
  for(const paint of visible) {
   const fade=options.colorKey&&options.colorKey!==paint.key?.toString()?'.16':'1';
   svg+=`<g data-paint-face="${esc(paint.id)}" role="button" tabindex="0" aria-label="${esc(paint.code+' '+paint.name+', '+fmt(paint.width)+' cm')}" opacity="${fade}" style="cursor:pointer"><title>${esc(paint.name+' · '+paint.code+' · '+fmt(paint.width)+' cm')}</title>`;
   for(const s of paint.segments){const a=xy(s.start),c=xy(s.end),n=s.normal||paint.normal,d=options.ribbonWidth||5;const quad=[a,c,{x:c.x+n.x*d,y:c.y+n.y*d},{x:a.x+n.x*d,y:a.y+n.y*d}];svg+=`<polygon points="${quad.map(p=>`${p.x},${p.y}`).join(' ')}" fill="${paint.color}" stroke="${paint.id===active?'#20291b':'#75816d'}" stroke-width="${paint.id===active?2.5:.7}"${paint.edgesOnly?' stroke-dasharray="3 2"':''}/>`;}
   svg+='</g>';
  }
  const labels=options.labels===true?visible:visible.filter(p=>p.id===active),placed=[];
  const intersects=(a,b)=>Math.min(a.r,b.r)>Math.max(a.l,b.l)&&Math.min(a.b,b.b)>Math.max(a.t,b.t);
  for(const p of labels){
   const a=xy(p.center),n=p.normal,text=p.code+' / '+fmt(p.width)+' cm';let chosen=null;
   const candidates=[];
   for(const away of [38,72,110,150,195])for(const along of [0,-42,42,-84,84,-126,126]){
    const x=Math.max(85,Math.min(width-85,a.x+n.x*away-n.y*along)),y=Math.max(25,Math.min(height-20,a.y+n.y*away+n.x*along));
    candidates.push({x,y,l:x-83,r:x+83,t:y-19,b:y+17,score:away+Math.abs(along)*.5});
   }
   candidates.sort((x,y)=>x.score-y.score);
   chosen=candidates.find(c=>!placed.some(b=>intersects(c,b)));
   if(!chosen){
    const free=[];for(let y=30;y<height-20;y+=42)for(let x=90;x<width-80;x+=174){const c={x,y,l:x-83,r:x+83,t:y-19,b:y+17,score:Math.hypot(x-a.x,y-a.y)};if(!placed.some(b=>intersects(c,b)))free.push(c);}
    free.sort((x,y)=>x.score-y.score);chosen=free[0]||candidates[0];
   }
   placed.push(chosen);const {x,y}=chosen;
   svg+=`<g pointer-events="none"><path d="M${a.x} ${a.y}L${x} ${y}" fill="none" stroke="${p.color}" stroke-width="1.2"/><rect x="${x-79}" y="${y-15}" width="158" height="28" rx="5" fill="white" stroke="${p.color}"/><text x="${x}" y="${y+4}" font-family="Arial,sans-serif" font-weight="700" text-anchor="middle" fill="#26301e" font-size="13">${esc(text)}</text></g>`;
  }
  return svg+'</svg>';
 }

 function printRegions(scene) {
  const hosts=new Map();for(const p of scene.paint){if(!hosts.has(p.hostId))hosts.set(p.hostId,[]);hosts.get(p.hostId).push(p);}
  const chunks=Array.from(hosts.values()).sort((a,b)=>a.reduce((n,p)=>n+p.center.y,0)/a.length-b.reduce((n,p)=>n+p.center.y,0)/b.length);
  const regions=[];let list=[];for(const group of chunks){if(list.length&&list.length+group.length>6){regions.push(list);list=[];}list.push(...group);}if(list.length)regions.push(list);
  return regions.map(paint=>({paint,bounds:padBounds(boundsOf(paint.flatMap(p=>p.segments.flatMap(s=>[s.start,s.end]))),100)}));
 }

 function buildPrintHtml(scene) {
  const date=new Date().toLocaleDateString('tr-TR'),regions=printRegions(scene);
  const sheets=regions.map((region,i)=>`<section class="paint-sheet"><header><strong>somass</strong><div><h1>BOYA PLANI</h1><p>${esc(scene.name)} · Bölüm ${i+1} / ${regions.length} · ${date}</p></div></header><p class="guide">Renk şeridi boyanacak yüzü gösterir. Ölçüler yalnız genişliktir.</p><div class="paint-print-body"><div class="paint-print-scene">${renderSvg(scene,{width:1050,height:720,bounds:region.bounds,ids:region.paint.map(p=>p.id),ribbonWidth:8,labels:true})}</div><div class="paint-print-cards">${region.paint.map(p=>`<article><i style="background:${p.color}"></i><div><b>${esc(p.name)}</b><strong>Boya kodu: ${esc(p.code||'Kayıt yok')}</strong><span>${p.column?'Kolon çevresi':'Genişlik'}: ${fmt(p.width)} cm</span>${p.edgesOnly?'<small>Alın / üst yüzey</small>':''}</div></article>`).join('')}</div></div><footer>Renk örnekleri plandaki tonlardır; uygulamada boya kodunu esas alın. Bu çıktı açık planın güncel kopyasından üretildi.</footer></section>`).join('');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SOMASS boya planı</title><style>*{box-sizing:border-box}body{margin:0;background:#e9ece5;color:#26301e;font-family:Arial,sans-serif}.print-actions{position:sticky;top:0;display:flex;justify-content:center;gap:16px;padding:14px;background:#fff;border-bottom:1px solid #ddd}.print-actions button{background:#4b5d3e;color:white;border:0;padding:12px 22px;border-radius:7px;font:600 15px Arial}.print-actions p{margin:10px}.paint-sheet{background:white;width:396mm;min-height:273mm;padding:8mm;margin:20px auto;break-after:page}header{display:flex;align-items:center;gap:24px;border-bottom:1px solid #cdd3c6;padding-bottom:14px}header>strong{font-size:34px}h1{font-size:24px;margin:0 0 6px}header p{font-size:13px;margin:0;color:#65745c}.guide{font-size:13px;margin:14px 0}.paint-print-body{display:grid;grid-template-columns:minmax(0,1fr) 116mm;gap:8mm;min-height:205mm}.paint-print-scene{align-self:center}.paint-print-scene svg{width:100%;height:auto}.paint-print-cards{display:flex;flex-direction:column;justify-content:space-around;gap:8px}.paint-print-cards article{display:flex;align-items:center;gap:14px;border:1px solid #cdd5c6;border-radius:8px;padding:10px;break-inside:avoid}.paint-print-cards i{width:25mm;height:25mm;border:1px solid #738168;flex:none}.paint-print-cards b,.paint-print-cards strong,.paint-print-cards span,.paint-print-cards small{display:block}.paint-print-cards b{font-size:17px;margin-bottom:7px}.paint-print-cards strong,.paint-print-cards span{font-size:14px;margin:5px 0}.paint-print-cards small{font-size:11px}footer{border-top:1px solid #d7ddcf;padding-top:12px;font-size:11px;color:#617057;margin-top:12px}@page{size:A3 landscape;margin:12mm}@media print{body{background:white}.print-actions{display:none}.paint-sheet{width:auto;min-height:0;margin:0;padding:0}.paint-sheet:last-child{break-after:auto}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}@media screen and (max-width:900px){.paint-sheet{width:100%;min-height:0}.paint-print-body{grid-template-columns:1fr}.paint-print-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.print-actions p{display:none}}</style></head><body><div class="print-actions"><button type="button" onclick="window.print()">Yazdır / PDF kaydet</button><p>Renkli baskı · A3 yatay</p></div>${sheets||'<section class="paint-sheet"><h1>Plana henüz boya eklenmedi.</h1></section>'}</body></html>`;
 }

 function openPrintableDocument(html,env=g) {
  const url=env.URL.createObjectURL(new env.Blob([html],{type:'text/html;charset=utf-8'}));
  env.setTimeout(()=>env.URL.revokeObjectURL(url),120000);
  let popup=null;
  try {popup=env.open(url,'_blank');}catch(_){}
  if(popup){try{popup.opener=null;}catch(_){}return {opened:true,downloaded:false};}
  const a=env.document.createElement('a');a.href=url;a.download='somass-boya-plani.html';env.document.body.append(a);a.click();a.remove();
  return {opened:false,downloaded:true};
 }
 const pure={buildScene,renderSvg,buildPrintHtml,printRegions,openPrintableDocument};
 if(typeof module!=='undefined'&&module.exports)module.exports=pure;
 if(!g.document)return;
 let dialog,scene,query='',colorKey='',activeId='',openingControl=null;
 const readPlan=()=>typeof model!=='undefined'?model:g.SOMASS_STUDIO_UI?.getPlan?.();
 const notice=message=>{if(typeof toast==='function')toast(message);};
 function ensureDialog(){
  if(dialog)return dialog;
  dialog=document.createElement('dialog');dialog.id='uiPaintDialog';dialog.className='ui-paint-dialog';dialog.setAttribute('aria-labelledby','uiPaintTitle');
  dialog.innerHTML='<div class="ui-paint-head"><div><span class="ui-paint-eyebrow">DUVAR RENKLERİ</span><h2 id="uiPaintTitle">Boya planı</h2><p id="uiPaintSummary"></p></div><button class="ui-paint-close" type="button" aria-label="Boya planını kapat">×</button></div><div class="ui-paint-toolbar"><button id="uiPaintAdd" type="button">+ Boya yüzü ekle</button><div class="ui-paint-export-actions"><button id="uiPaintSvg" type="button">Önizlemeyi SVG indir</button><button id="uiPaintPrint" type="button" class="ui-paint-primary">Tüm planı yazdır / PDF</button></div></div><div id="uiPaintAlert" class="ui-paint-alert" role="status" hidden></div><div class="ui-paint-layout"><section class="ui-paint-preview" aria-label="Boya planı önizlemesi"><div id="uiPaintFilters" class="ui-paint-filters" aria-label="Renge göre göster"></div><div id="uiPaintCanvas" class="ui-paint-canvas"></div><p class="ui-paint-preview-help">Bir renge veya boyalı yüze dokun. Genişlikler santimetre olarak gösterilir.</p></section><aside class="ui-paint-side"><label for="uiPaintSearch">Renk veya kod ara</label><input id="uiPaintSearch" type="search" placeholder="Coffee, 2149…" autocomplete="off"><p id="uiPaintCount" class="ui-paint-count"></p><div id="uiPaintList" class="ui-paint-list"></div></aside></div><div class="ui-paint-foot">Bu görünüm açık plandan hazırlanır. Duvar renkleri ve genişlikler gösterilir.</div>';
  document.body.append(dialog);
  dialog.querySelector('.ui-paint-close').onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>openingControl?.focus?.());
  dialog.querySelector('#uiPaintSearch').oninput=event=>{query=event.target.value;render();};
  dialog.querySelector('#uiPaintFilters').onclick=event=>{const b=event.target.closest('[data-paint-color]');if(!b)return;colorKey=b.dataset.paintColor;render();};
  const choose=event=>{const b=event.target.closest('[data-paint-face]');if(!b)return;activeId=b.dataset.paintFace;render();};
  dialog.querySelector('#uiPaintCanvas').addEventListener('click',choose);
  dialog.querySelector('#uiPaintCanvas').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose(event);}});
  dialog.querySelector('#uiPaintList').onclick=event=>{
   const action=event.target.closest('[data-paint-action]');if(action){const id=action.dataset.faceId;if(action.dataset.paintAction==='focus')focusFace(id);else{dialog.close();g.SOMASS_DESIGN_UI?.open?.('wall-finish',id);}return;}
   choose(event);
  };
  dialog.querySelector('#uiPaintAdd').onclick=()=>{dialog.close();g.SOMASS_DESIGN_UI?.open?.('wall-finish');};
  dialog.querySelector('#uiPaintSvg').onclick=()=>{
   try {const fresh=buildScene(readPlan()),svg=renderSvg(fresh,{width:1100,height:1200,colorKey,activeId}),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='somass-boya-onizleme.svg';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);notice('Boya önizlemesi indirildi.');}catch(error){notice(error.message);}
  };
  dialog.querySelector('#uiPaintPrint').onclick=()=>{
   try {
    const fresh=buildScene(readPlan());if(fresh.errors.length)throw Error('Önce bağlantısı eksik boya yüzlerini kontrol et.');
    const result=openPrintableDocument(buildPrintHtml(fresh));
    const message=result.opened?'Boya planı yeni sekmede açıldı. Oradan Yazdır / PDF kaydet’i seç.':'Yeni sekme açılamadı. Boya planı indirildi; HTML dosyasını açıp Yazdır / PDF kaydet’i seç.';
    dialog.querySelector('.ui-paint-foot').textContent=message;notice(message);
   }catch(error){notice(error.message);}
  };
  return dialog;
 }
 function render(){
  if(!dialog||!scene)return;
  const search=normalize(query),filtered=scene.paint.filter(p=>(!colorKey||p.key===colorKey)&&(!search||normalize(p.name+' '+p.code).includes(search)));
  if(activeId&&!filtered.some(p=>p.id===activeId))activeId=filtered[0]?.id||'';
  dialog.querySelector('#uiPaintSummary').textContent=`${scene.paint.length} boyalı yüz · ${scene.colors.length} renk`;
  dialog.querySelector('#uiPaintCount').textContent=`${filtered.length} yüz${colorKey||query?' · toplam '+scene.paint.length:''}`;
  dialog.querySelector('#uiPaintFilters').innerHTML=`<button type="button" data-paint-color="" aria-pressed="${!colorKey}">Tümü</button>`+scene.colors.map(p=>`<button type="button" data-paint-color="${esc(p.key)}" aria-pressed="${p.key===colorKey}"><i style="background:${p.color}"></i>${esc(p.code||p.name)}<small>${p.count}</small></button>`).join('');
  dialog.querySelector('#uiPaintCanvas').innerHTML=scene.paint.length?renderSvg(scene,{width:900,height:850,colorKey,activeId}):'<div class="ui-paint-empty"><h3>Henüz boya yüzü yok</h3><p>Duvara renk eklediğinde boya planın burada oluşur.</p></div>';
  dialog.querySelector('#uiPaintList').innerHTML=filtered.map(p=>`<article class="ui-paint-card${p.id===activeId?' is-active':''}"><button type="button" class="ui-paint-card-head" data-paint-face="${esc(p.id)}" aria-pressed="${p.id===activeId}"><i style="background:${p.color}"></i><span><strong>${esc(p.name)}</strong><b>${esc(p.code||'Kod kayıtlı değil')}</b><small>${p.column?'Kolon çevresi':'Genişlik'} ${fmt(p.width)} cm${p.edgesOnly?' · Alın yüzeyi':''}</small></span></button><div class="ui-paint-card-actions"><button type="button" data-paint-action="focus" data-face-id="${esc(p.id)}">Plana git</button><button type="button" data-paint-action="edit" data-face-id="${esc(p.id)}">Rengi düzenle</button></div></article>`).join('')||'<p class="ui-paint-no-result">Aramana uygun boyalı yüz bulunamadı.</p>';
  const alert=dialog.querySelector('#uiPaintAlert');alert.hidden=!scene.errors.length;alert.textContent=`${scene.errors.length} boya yüzünün bağlantısı kontrol edilmeli. Bu yüzler çizimde gösterilmedi.`;
  dialog.querySelector('#uiPaintPrint').disabled=!scene.paint.length||!!scene.errors.length;
  dialog.querySelector('#uiPaintSvg').disabled=!scene.paint.length;
 }
 function refresh(){if(!dialog?.open)return;try{scene=buildScene(readPlan());render();}catch(error){notice(error.message);}}
 function open(){
  try {scene=buildScene(readPlan());ensureDialog();query='';colorKey='';activeId=scene.paint.some(p=>p.id===(typeof selected!=='undefined'?selected:null))?selected:scene.paint[0]?.id||'';dialog.querySelector('#uiPaintSearch').value='';openingControl=document.activeElement;render();if(!dialog.open)dialog.showModal();dialog.querySelector('#uiPaintSearch').focus();}catch(error){notice(error.message);}
 }
 function focusFace(id){
  const row=scene?.paint.find(p=>p.id===id);if(!row)return;
  dialog.close();g.SOMASS_SPACE_3D?.setView?.('2d');
  if(g.SOMASS_3D_EDIT?.select)g.SOMASS_3D_EDIT.select(id);
  else if(typeof selected!=='undefined'){selected=id;if(typeof renderPanels==='function')renderPanels();}
  if(typeof camera!=='undefined'&&typeof width!=='undefined'&&typeof height!=='undefined') {
   const b=padBounds(boundsOf(row.segments.flatMap(s=>[s.start,s.end])),95);
   camera.z=Math.min(3,Math.max(.02,Math.min(Math.max(250,width-180)/Math.max(240,b.maxX-b.minX),Math.max(250,height-140)/Math.max(240,b.maxY-b.minY))));
   camera.x=(b.minX+b.maxX)/2-width/2/camera.z;camera.y=(b.minY+b.maxY)/2-height/2/camera.z;
   if(typeof g.render==='function')g.render();
  }
  g.SOMASS_STUDIO_UI?.showInspector?.();
 }
 g.SOMASS_UI_PAINT={...pure,open,refresh,focusFace};
})(typeof globalThis!=='undefined'?globalThis:this);
