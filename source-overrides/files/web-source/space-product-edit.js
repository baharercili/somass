/* Ground-plane editing of native catalogue instances. Preview never changes saved data. */
(function(global){
 'use strict';
 const normalize=a=>((a%360)+360)%360;
 const editable=o=>!!o&&(!!o.catalogProduct||(o.type==='furniture'&&(o.kind==='partition'||global.SOMASS_DECOR?.isElement(o))));
 function transformPlan(plan,id,patch){
  if(global.SOMASS_DECOR?.isElement(plan.objects.find(o=>o.id===id))){const position={};for(const k of ['x','y','rotation','elevationCm'])if(k in patch)position[k]=patch[k];return global.SOMASS_DECOR.transform(plan,id,position);}
  const next=JSON.parse(JSON.stringify(plan)),object=next.objects.find(o=>o.id===id&&editable(o));
  if(!object)throw Error('Önce bir ürün veya bölücü seç.');
  for(const key of ['x','y','rotation','elevationCm'])if(key in patch){
   if(!Number.isFinite(patch[key])||Math.abs(patch[key])>1e7)throw Error('Konum ve açıyı kontrol et.');
   if(key==='elevationCm'&&(patch[key]<0||patch[key]>2000))throw Error('Yerden yüksekliği kontrol et.');object[key]=key==='rotation'?normalize(patch[key]):Math.round(patch[key]*1000)/1000;
  }
  return next;
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={transformPlan,normalize,editable};
 if(!global.document)return;
 const host=document.getElementById('space3dHost');if(!host)return;
 let context=null,gesture=null,editMode=true,step=.1,angleStep=15,frame=null,lastList='',lastSelection=null,placementPoint=null,placementGhost=null,placementSignature='',detailsVisible=false;
 const panel=document.createElement('section');panel.id='space3dProductEditor';panel.className='space-product-editor';panel.setAttribute('aria-label','3B ürün ve bölücü düzenleme');
 panel.innerHTML='<div class="space-product-mode"><button type="button" id="space3dEditMode" aria-pressed="true">Yerleşimi düzenle</button><button type="button" id="space3dCameraMode" aria-pressed="false">Kamerayı döndür</button></div><label for="space3dProductSelect">Ürünler ve bölücüler</label><select id="space3dProductSelect"><option value="">Bir öğe seç</option></select><p id="space3dProductHint" role="status">Ürüne veya bölücüye tıkla ve sürükle.</p><div id="space3dProductControls" hidden><strong id="space3dProductName"></strong><p id="space3dProductSize"></p><form id="space3dProductForm"><div class="space-product-fields"><label>X · cm<input id="space3dProductX" inputmode="decimal" aria-label="Ürün merkez X, santimetre"></label><label>Y · cm<input id="space3dProductY" inputmode="decimal" aria-label="Ürün merkez Y, santimetre"></label><label>Yerden · cm<input id="space3dProductElevation" inputmode="decimal" aria-label="Ürünün yerden yüksekliği"></label><label>Açı · °<input id="space3dProductAngle" inputmode="decimal" aria-label="Ürün dönüş açısı"></label></div><button type="submit" id="space3dApplyProduct">Konumu uygula</button></form><div class="space-product-step"><label>Taşıma adımı<select id="space3dProductStep"><option value="0.1">1 mm</option><option value="1">1 cm</option><option value="10">10 cm</option></select></label><div class="space-product-arrows"><button type="button" data-3d-move="up" aria-label="Ürünü Y eksi yönünde taşı">↑</button><button type="button" data-3d-move="left" aria-label="Ürünü X eksi yönünde taşı">←</button><button type="button" data-3d-move="down" aria-label="Ürünü Y artı yönünde taşı">↓</button><button type="button" data-3d-move="right" aria-label="Ürünü X artı yönünde taşı">→</button></div></div><div class="space-product-turn"><button type="button" id="space3dRotateLeft" aria-label="Ürünü sola döndür">↶</button><select id="space3dAngleStep" aria-label="Döndürme adımı"><option value="1">1°</option><option value="5">5°</option><option value="15" selected>15°</option><option value="90">90°</option></select><button type="button" id="space3dRotateRight" aria-label="Ürünü sağa döndür">↷</button></div><div class="space-product-actions"><button type="button" id="space3dFocusProduct">Ürüne yaklaş</button><button type="button" id="space3dTopProduct">Üstten yerleştir</button><button type="button" id="space3dDuplicateProduct">Çoğalt</button><button type="button" id="space3dDeleteProduct">Sil</button></div><p class="space-product-shortcuts">Shift + sürükle: yavaş taşı · Oklar: küçük adım<br>R: döndür · Esc: iptal · Geri al: Ctrl/⌘ Z</p></div>';
 host.append(panel);
 const dimensions=document.createElement('div');dimensions.id='space3dPartitionDimensions';dimensions.className='space-partition-fields';dimensions.hidden=true;
 dimensions.innerHTML='<label>Uzunluk · cm<input id="space3dPartitionLength" inputmode="decimal" aria-label="Bölücü uzunluğu, santimetre"></label><label>Kalınlık · cm<input id="space3dPartitionThickness" inputmode="decimal" aria-label="Bölücü kalınlığı, santimetre"></label><label>Yükseklik · cm<input id="space3dPartitionHeight" inputmode="decimal" aria-label="Bölücü yüksekliği, santimetre"></label><label>Renk<input id="space3dPartitionColor" type="color" aria-label="Bölücü rengi"></label>';
 panel.querySelector('#space3dApplyProduct').before(dimensions);
 const addPartition=document.createElement('button');addPartition.id='space3dAddPartition';addPartition.type='button';addPartition.textContent='+ Bölücü duvar';addPartition.className='space-add-partition';panel.querySelector('#space3dProductSelect').after(addPartition);
 const cancelPartition=document.createElement('button');cancelPartition.id='space3dCancelPartition';cancelPartition.type='button';cancelPartition.textContent='Yerleştirmeden vazgeç';cancelPartition.hidden=true;addPartition.after(cancelPartition);
 const addDecor=document.createElement('button');addDecor.type='button';addDecor.id='space3dAddDecor';addDecor.className='space-add-partition';addDecor.textContent='+ Perde / Separatör / Panel';cancelPartition.after(addDecor);addDecor.onclick=()=>global.SOMASS_DECOR_UI?.open();
 const label=document.createElement('div');label.id='space3dSelectedProductLabel';label.className='space-product-label';label.hidden=true;label.setAttribute('role','toolbar');label.setAttribute('aria-label','Seçili öğenin işlemleri');label.innerHTML='<span id="space3dLabelName"></span><div class="space-floating-actions"><button id="space3dFloatLeft" type="button" aria-label="Sola döndür">↶</button><form id="space3dFloatAngleForm"><input id="space3dFloatAngle" inputmode="decimal" aria-label="Seçili öğenin açısı"><span>°</span></form><button id="space3dFloatRight" type="button" aria-label="Sağa döndür">↷</button><button id="space3dFloatDuplicate" type="button">Çoğalt</button><button id="space3dFloatMirror" type="button" hidden>Simetri</button><button id="space3dFloatFocus" type="button">Yaklaş</button><button id="space3dFloatDetails" type="button">Ölçü</button><button id="space3dFloatDelete" type="button">Sil</button></div>';host.append(label);
 const grips={};for(const side of ['a','b']){const grip=document.createElement('button');grip.type='button';grip.id='space3dPartitionEnd-'+side;grip.className='space-partition-end-grip';grip.hidden=true;grip.setAttribute('aria-label',side==='a'?'Bölücü başlangıç ucunu taşı':'Bölücü bitiş ucunu taşı');grip.textContent='●';host.append(grip);grips[side]=grip;grip.addEventListener('pointerdown',event=>startResize(event,side));}
 const find=id=>document.getElementById(id);
 const object=()=>model.objects.find(o=>o.id===selected&&editable(o))||null;
 const instance=id=>global.SOMASS_CATALOG_RENDERING?.instances?.get(id)?.group||context?.getPartitionGroup?.(id);
 const picker=()=>global.SOMASS_DECOR_UI?.isPicking?.()?global.SOMASS_DECOR_UI:global.SOMASS_PARTITIONS;
 const resizable=o=>['partition','curtain','slat-divider'].includes(o?.kind);
 const active=()=>global.SOMASS_SPACE_3D?.isActive()===true;
 function setMode(edit){cancelDrag();editMode=edit;refresh();context?.requestDraw();}
 function select(id){
  cancelDrag();const item=model.objects.find(o=>o.id===id&&editable(o));if(selected!==item?.id)detailsVisible=false;selected=item?.id||null;
  if(typeof refreshEasy==='function')refreshEasy.lastObject=selected;
  global.SOMASS_PRECISION?.noteSelection('object',selected);render();renderPanels();refresh();context?.requestDraw();
 }
 function updateFields(item){
  if(!item)return;
  for(const[key,id]of [['x','space3dProductX'],['y','space3dProductY'],['rotation','space3dProductAngle'],['elevationCm','space3dProductElevation']])if(document.activeElement!==find(id))find(id).value=String(Math.round((key==='elevationCm'?(global.SOMASS_SUPPORT?.elevation(item,model)||0):item[key])*1000)/1000).replace('.',',');
 }
 function refresh(){
  const products=model.objects.filter(editable),item=object(),list=JSON.stringify(products.map(o=>[o.id,o.label]));
  if(list!==lastList){lastList=list;find('space3dProductSelect').innerHTML='<option value="">Bir öğe seç</option>'+products.map(o=>`<option value="${esc(o.id)}">${esc(o.label)}</option>`).join('');}
  find('space3dProductSelect').value=item?.id||'';
  find('space3dProductControls').hidden=!item||!detailsVisible;
  find('space3dEditMode').setAttribute('aria-pressed',String(editMode));find('space3dCameraMode').setAttribute('aria-pressed',String(!editMode));
  panel.classList.toggle('has-selection',!!item);host.classList.toggle('space-product-edit-mode',editMode);
  host.querySelector('.space-3d-help span').textContent=editMode?'Öğe: taşı · Boş alan: döndür · Sağ tuş: kaydır · Tekerlek: yaklaş':'Sürükle: döndür · Shift / sağ tuş: kaydır · Tekerlek: yaklaş';
  find('space3dProductHint').textContent=!products.length?'SOMASS ürünü veya bölücü duvar ekle.':!editMode?'Sürükle: kamerayı döndür. Taşımak için “Yerleşimi düzenle”.':item?'Seçili öğeyi zeminde sürükle. Shift ile yavaşlat.':'Ürüne veya bölücüye tıkla ve sürükle.';
  if(picker()?.isPicking?.())find('space3dProductHint').textContent=global.SOMASS_DECOR?.mounted(picker()?.getPending?.())?'Yerleştirilecek duvarın yüzüne tıkla. Esc: vazgeç.':'Elemanın merkezini zeminde işaretle. R: döndür · Esc: vazgeç.';
  cancelPartition.hidden=!picker()?.isPicking?.();
  const partition=item?.kind==='partition';find('space3dPartitionDimensions').hidden=!partition;
  if(partition)for(const[id,value]of [['space3dPartitionLength',item.w],['space3dPartitionThickness',item.h],['space3dPartitionHeight',item.heightCm],['space3dPartitionColor',item.color||'#e9e5da']])if(document.activeElement!==find(id))find(id).value=typeof value==='number'?String(Math.round(value*1000)/1000).replace('.',','):value;
  find('space3dFloatMirror').hidden=!['wood-logo','sofa-chaise'].includes(item?.kind);find('space3dFloatAngle').readOnly=global.SOMASS_DECOR?.mounted(item);for(const id of ['space3dFloatLeft','space3dFloatRight'])find(id).disabled=global.SOMASS_DECOR?.mounted(item);
  find('space3dFloatDuplicate').textContent=item?.kind==='storage-module'?'Yanına ekle':'Çoğalt';if(item){find('space3dProductName').textContent=item.label;find('space3dProductSize').textContent=global.SOMASS_DECOR?.isElement(item)?`${fmt(item.w,1)} × ${fmt(item.h,1)} × ${fmt(item.heightCm,1)} cm · ${global.SOMASS_DECOR.titles[item.kind]}`:partition?`${fmt(item.w,1)} × ${fmt(item.h,1)} × ${fmt(item.heightCm,1)} cm · bölücü`:`${fmt(item.w,1)} × ${fmt(item.h,1)} cm · katalog ölçüsü`;updateFields(gesture?.draft||item);}
  lastSelection=item?.id||null;
 }
 function preview(item){const group=instance(item.id);if(group){group.position.set(item.x,global.SOMASS_SUPPORT?.elevation(item,model)||0,item.y);group.rotation.y=-item.rotation*Math.PI/180;if(resizable(item))group.scale.x=gesture?.resize?item.w/gesture.start.w:1;group.updateMatrixWorld(true);}updateFields(item);context?.requestDraw();}
 function cancelDrag(){
  if(!gesture)return false;const old=gesture;gesture=null;global.SOMASS_SPACE_3D?.interaction?.(false);const saved=model.objects.find(o=>o.id===old.id);if(saved)preview(saved);
  if(context?.canvas.hasPointerCapture?.(old.pointerId))context.canvas.releasePointerCapture(old.pointerId);
  host.classList.remove('is-product-dragging');refresh();context?.requestDraw();return true;
 }
 function apply(patch){
  const item=object();if(!item)return false;
  try{let proposed=transformPlan(model,item.id,patch);if(patch.partitionDimensions){if(item.kind==='partition')proposed=global.SOMASS_PARTITIONS.updateDimensions(proposed,item.id,patch.partitionDimensions);else if(global.SOMASS_DECOR?.isElement(item))proposed=global.SOMASS_DECOR.update(proposed,item.id,patch.partitionDimensions);}const next=validateState(proposed);if(JSON.stringify(next)===JSON.stringify(model))return false;
   commit();model=next;changed();syncFields();refresh();context?.requestDraw();return true;
  }catch(error){toast(error.message);return false;}
 }
 function nudge(direction,event={}){const item=object();if(!item)return;const amount=global.SOMASS_PRECISION?.keyboardStep(event,step)||step,deltas={left:[-amount,0],right:[amount,0],up:[0,-amount],down:[0,amount]},d=deltas[direction];if(d)apply({x:item.x+d[0],y:item.y+d[1]});}
 function rotate(sign){const item=object();if(global.SOMASS_DECOR?.mounted(item)){toast('Ahşap panel duvara bağlıdır. Yüzünü ayrıntılardan değiştirebilirsin.');return;}if(item)apply({rotation:item.rotation+angleStep*sign});}
 function duplicate(){cancelDrag();const item=object();if(!item)return;if(item.columnAnchor){toast('Boyayı başka kolona uygulamak için kolon boya aracını kullan.');return;}try{const copy=clone(item);copy.id=uid();if(item.kind==='storage-module'){copy.x+=Math.cos(item.rotation*Math.PI/180)*item.w;copy.y+=Math.sin(item.rotation*Math.PI/180)*item.w;}else{copy.x+=30;copy.y+=30;}if(global.SOMASS_DECOR?.mounted(copy))Object.assign(copy,global.SOMASS_DECOR.attach(copy,model,copy,copy.wallAnchor.wallId));const next=clone(model);next.objects.push(copy);validateState(next);commit();model=next;selected=copy.id;if(typeof refreshEasy==='function')refreshEasy.lastObject=selected;global.SOMASS_PRECISION?.noteSelection('object',selected);changed();syncFields();refresh();context?.requestDraw();}catch(error){toast(error.message);}}
 function remove(){cancelDrag();if(!object())return;deleteSelected();refresh();context?.requestDraw();}
 function ray(event){
  const T=global.THREE,r=context.canvas.getBoundingClientRect(),caster=new T.Raycaster();
  caster.setFromCamera(new T.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1),context.camera);return caster;
 }
 function ground(caster,height=0){const T=global.THREE;if(Math.abs(caster.ray.direction.y)<.0001)return null;const p=new T.Vector3();return caster.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),-height),p)?{x:p.x,y:p.z}:null;}
 function hit(caster){
  const groups=model.objects.filter(editable).map(o=>instance(o.id)).filter(g=>g?.parent);
  const hits=caster.intersectObjects(groups,true);
  if(hits.length){
   const blockers=[];context.scene.traverse(mesh=>{if(!mesh.isMesh)return;let node=mesh,visible=true,catalogue=false;while(node){if(!node.visible)visible=false;if(groups.includes(node))catalogue=true;node=node.parent;}const opaque=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>m&&m.visible!==false&&(!m.transparent||m.opacity>=.8));if(visible&&!catalogue&&opaque)blockers.push(mesh);});
   const obstruction=caster.intersectObjects(blockers,false)[0];if(obstruction&&obstruction.distance<hits[0].distance-.5)return null;
  }
  for(const h of hits){let mesh=h.object;while(mesh){const id=mesh.userData?.catalogObjectId||mesh.userData?.partitionObjectId;if(id&&model.objects.some(o=>o.id===id&&editable(o)))return id;mesh=mesh.parent;}const group=groups.find(g=>{let p=h.object;while(p){if(p===g)return true;p=p.parent;}return false;});if(group){const item=model.objects.find(o=>instance(o.id)===group);if(item)return item.id;}}
  return null;
 }
 function placementTarget(event){
  const p=picker()?.getPending?.();if(p?.paintTarget==='column'){const meshes=[];context.scene.traverse(m=>{if(m.isMesh&&m.visible&&m.userData?.columnId)meshes.push(m);});const h=ray(event).intersectObjects(meshes,false)[0];return h?{x:h.point.x,y:h.point.z,columnId:h.object.userData.columnId}:null;}if(!global.SOMASS_DECOR?.mounted(p))return ground(ray(event));
  const known=new Set(global.SOMASS_DECOR.walls(model).map(w=>w.id)),meshes=[];context.scene.traverse(m=>{if(!m.isMesh||!m.visible)return;const id=m.userData?.wallId||m.userData?.partitionObjectId;if(known.has(id))meshes.push(m);});
  const found=ray(event).intersectObjects(meshes,false)[0];if(!found)return null;return{x:found.point.x,y:found.point.z,wallId:found.object.userData.wallId||found.object.userData.partitionObjectId};
 }
 function clearGhost(){if(!placementGhost)return;context.scene.remove(placementGhost);if(placementGhost.userData?.disposeDecor)placementGhost.userData.disposeDecor();else{placementGhost.geometry.dispose();placementGhost.material.dispose();}placementGhost=null;}
 function drawPlacement(){
  const provider=picker(),values=provider?.getPending?.();cancelPartition.hidden=!values;if(!context)return;
  if(!values||!placementPoint){if(placementGhost)placementGhost.visible=false;return;}
  const T=global.THREE,decor=!!values.kind;let item;try{item=decor?global.SOMASS_DECOR.create({...values,wallId:placementPoint.wallId,columnId:placementPoint.columnId},placementPoint,'decor-preview',model):global.SOMASS_PARTITIONS.createObject(values,placementPoint,'partition-preview');}catch(_){if(placementGhost)placementGhost.visible=false;return;}
  const signature=JSON.stringify([values,global.SOMASS_DECOR?.mounted(item)?item.columnAnchor||item.wallAnchor:null]);
  if(!placementGhost||signature!==placementSignature){clearGhost();if(decor){placementGhost=global.SOMASS_DECOR.build(T,item,model);placementGhost.traverse(m=>{if(m.isMesh){m.castShadow=false;m.material.transparent=true;m.material.opacity=Math.min(.4,m.material.opacity);m.material.depthWrite=false;}});}else placementGhost=new T.Mesh(new T.BoxGeometry(item.w,item.heightCm,item.h),new T.MeshBasicMaterial({color:item.color,transparent:true,opacity:.35,depthWrite:false}));placementGhost.renderOrder=5;context.scene.add(placementGhost);placementSignature=signature;}
  placementGhost.position.set(item.x,decor?0:item.heightCm/2,item.y);placementGhost.rotation.y=-item.rotation*Math.PI/180;placementGhost.visible=true;
 }
 function beforeDraw(){
  drawPlacement();
  if(!context)return;const item=gesture?.draft||object(),T=global.THREE;
  if(!item||!active()||!editMode){if(frame)frame.visible=false;label.hidden=true;for(const grip of Object.values(grips))grip.hidden=true;return;}
  if(!frame){const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(12),3));frame=new T.LineLoop(geometry,new T.LineBasicMaterial({color:'#af7e38',depthTest:false,transparent:true,opacity:.95}));frame.renderOrder=1000;frame.frustumCulled=false;context.scene.add(frame);}
  const w=item.w/2+3,d=item.h/2+3,outline=global.SOMASS_DECOR?.isElement(item)?global.SOMASS_DECOR.footprint(item,model).map(p=>[p.x,0,p.y]):[[-w,0,-d],[w,0,-d],[w,0,d],[-w,0,d]],array=new Float32Array(outline.flat()),positions=frame.geometry.getAttribute('position');if(positions.array.length!==array.length)frame.geometry.setAttribute('position',new T.Float32BufferAttribute(array,3));else{positions.array.set(array);positions.needsUpdate=true;}frame.geometry.computeBoundingSphere();frame.position.set(global.SOMASS_DECOR?.isElement(item)?0:item.x,(global.SOMASS_SUPPORT?.elevation(item,model)||0)+1.1,global.SOMASS_DECOR?.isElement(item)?0:item.y);frame.rotation.y=global.SOMASS_DECOR?.isElement(item)?0:-item.rotation*Math.PI/180;frame.visible=true;
  // Reapply an uncommitted preview if another view update rebuilt the scene.
  if(gesture){const group=instance(item.id);if(group){group.position.set(item.x,global.SOMASS_SUPPORT?.elevation(item,model)||0,item.y);group.rotation.y=-item.rotation*Math.PI/180;if(resizable(item))group.scale.x=gesture?.resize?item.w/gesture.start.w:1;group.updateMatrixWorld(true);}}
  const group=instance(item.id),h=global.SOMASS_DECOR?.isElement(item)?item.heightCm+(global.SOMASS_SUPPORT?.elevation(item,model)||0):group?(group.userData.plannerHeight??(group.userData.plannerHeight=new T.Box3().setFromObject(group).max.y-(global.SOMASS_SUPPORT?.elevation(item,model)||0)))+(global.SOMASS_SUPPORT?.elevation(item,model)||0):(item.catalogProduct?.heightCm||item.heightCm||50),p=new T.Vector3(item.x,h+12,item.y).project(context.camera),r=context.canvas.getBoundingClientRect(),hr=host.getBoundingClientRect();
  label.hidden=p.z< -1||p.z>1||Math.abs(p.x)>1.1||Math.abs(p.y)>1.1;
  find('space3dLabelName').textContent=item.label;label.dataset.productId=item.id;if(document.activeElement!==find('space3dFloatAngle'))find('space3dFloatAngle').value=String(round(item.rotation)).replace('.',',');
  const lx=r.left-hr.left+(p.x+1)*r.width/2,ly=r.top-hr.top+(1-p.y)*r.height/2,bw=label.offsetWidth||300,bh=label.offsetHeight||65;label.style.left=`${Math.max(bw/2+8,Math.min(hr.width-bw/2-8,lx))}px`;label.style.top=`${Math.max(bh+90,Math.min(hr.height-10,ly-10))}px`;
  const ends=resizable(item)?global.SOMASS_PARTITION_ENDS?.endpoints(item):null;
  for(const side of ['a','b']){const grip=grips[side];if(!ends||!editMode){grip.hidden=true;continue;}const v=new T.Vector3(ends[side].x,item.heightCm+2+(global.SOMASS_SUPPORT?.elevation(item,model)||0),ends[side].y).project(context.camera);grip.hidden=v.z< -1||v.z>1||Math.abs(v.x)>1||Math.abs(v.y)>1;grip.style.left=`${r.left-hr.left+(v.x+1)*r.width/2}px`;grip.style.top=`${r.top-hr.top+(1-v.y)*r.height/2}px`;}
  if(ends){const ys=Object.values(grips).filter(g=>!g.hidden).map(g=>parseFloat(g.style.top));if(ys.length){const min=Math.min(...ys),max=Math.max(...ys),above=min-bh-18>=75;label.style.top=`${Math.min(hr.height-10,above?min-18:max+bh+18)}px`;}}

 }
 function startResize(event,side){const item=object();if(!item||!resizable(item)||!context)return;cancelDrag();const p=ground(ray(event),item.heightCm);if(!p)return;event.preventDefault();event.stopImmediatePropagation();gesture={id:item.id,pointerId:event.pointerId,resize:true,side,origin:p,client:{x:event.clientX,y:event.clientY},draft:clone(item),start:clone(item),moved:false,motion:global.SOMASS_PRECISION?.createDragMotion()};context.canvas.setPointerCapture(event.pointerId);context.canvas.focus({preventScroll:true});}
 function disconnect(){
  cancelDrag();clearGhost();placementPoint=null;placementSignature='';
  if(frame){frame.removeFromParent();frame.geometry.dispose();frame.material.dispose();frame=null;}
  context=null;label.hidden=true;for(const grip of Object.values(grips))grip.hidden=true;
 }
 function connect(ctx){
  if(context?.canvas===ctx.canvas){context=ctx;return;}if(context)disconnect();context=ctx;const canvas=ctx.canvas;
  canvas.addEventListener('pointerdown',event=>{
   if(event.button===0&&picker()?.isPicking?.()){event.preventDefault();event.stopImmediatePropagation();const p=placementTarget(event);if(p){picker().placeAt(p);placementPoint=null;context.requestDraw();}return;}
   if(gesture&&gesture.pointerId!==event.pointerId){cancelDrag();event.preventDefault();event.stopImmediatePropagation();return;}
   if(!editMode||event.button!==0||global.SOMASS_SPACE_3D?.isFocusing?.()||global.SOMASS_SPACE_3D?.isPanning?.())return;
   const caster=ray(event),id=hit(caster);if(!id){select(null);return;}
   const p=ground(caster);select(id);if(!p)return;const item=object();
   global.SOMASS_SPACE_3D?.interaction?.(true);gesture={id,pointerId:event.pointerId,origin:p,client:{x:event.clientX,y:event.clientY},draft:clone(item),start:clone(item),moved:false,motion:global.SOMASS_PRECISION?.createDragMotion()};
   event.preventDefault();event.stopImmediatePropagation();canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);
  },true);
  canvas.addEventListener('pointermove',event=>{
   if(picker()?.isPicking?.()){placementPoint=placementTarget(event);context.requestDraw();return;}
   if(!gesture||gesture.pointerId!==event.pointerId)return;global.SOMASS_SPACE_3D?.interaction?.(true);event.preventDefault();event.stopImmediatePropagation();
   if(!gesture.moved&&Math.hypot(event.clientX-gesture.client.x,event.clientY-gesture.client.y)<2)return;
   const p=ground(ray(event),gesture.resize?gesture.start.heightCm:0);if(!p)return;
   const delta={x:p.x-gesture.origin.x,y:p.y-gesture.origin.y},move=global.SOMASS_PRECISION?.dragDelta(delta,event,gesture.motion)||delta;
   if(gesture.resize){const e=global.SOMASS_PARTITION_ENDS.endpoints(gesture.start)[gesture.side];try{gesture.draft=global.SOMASS_PARTITION_ENDS.resize(gesture.start,gesture.side,{x:e.x+move.x,y:e.y+move.y});gesture.moved=true;preview(gesture.draft);}catch(_){}return;}
   let point={x:round(gesture.start.x+move.x),y:round(gesture.start.y+move.y)};if(global.SOMASS_PRECISION?.shouldSnap(event))point=snapped(point);
   if(!validPoint(point))return;gesture.draft={...gesture.start,...point};if(gesture.draft.columnAnchor)gesture.draft=global.SOMASS_DECOR.resolve(gesture.draft,model);else if(global.SOMASS_DECOR?.mounted(gesture.draft))gesture.draft=global.SOMASS_DECOR.attach(gesture.draft,model,point,gesture.start.wallAnchor.wallId);gesture.moved=true;host.classList.add('is-product-dragging');preview(gesture.draft);
  },true);
  const finish=event=>{if(!gesture||gesture.pointerId!==event.pointerId)return;event.preventDefault();event.stopImmediatePropagation();const old=gesture;gesture=null;global.SOMASS_SPACE_3D?.interaction?.(false);host.classList.remove('is-product-dragging');if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);if(old.moved&&selected===old.id&&object()){if(!apply({x:old.draft.x,y:old.draft.y,...(old.resize?{rotation:old.draft.rotation,partitionDimensions:{lengthCm:old.draft.w, ...(global.SOMASS_DECOR?.isElement(old.draft)?{curveCm:old.draft.curveCm}:{})}}:{})}))preview(object());}else preview(model.objects.find(o=>o.id===old.id)||old.start);refresh();};
  canvas.addEventListener('pointerup',finish,true);
  for(const name of ['pointercancel','lostpointercapture'])canvas.addEventListener(name,event=>{if(gesture?.pointerId===event.pointerId){event.stopImmediatePropagation();cancelDrag();}},true);
  canvas.addEventListener('dblclick',event=>{if(!editMode)return;const id=hit(ray(event));if(id){event.preventDefault();event.stopImmediatePropagation();select(id);global.SOMASS_SPACE_3D.inspectCatalogProduct(id);}},true);
  canvas.addEventListener('wheel',()=>cancelDrag(),true);
  refresh();
 }
 label.addEventListener('pointerdown',event=>event.stopPropagation());
 find('space3dFloatLeft').onclick=()=>{cancelDrag();rotate(-1);};find('space3dFloatRight').onclick=()=>{cancelDrag();rotate(1);};find('space3dFloatDuplicate').onclick=duplicate;find('space3dFloatDelete').onclick=remove;
 find('space3dFloatMirror').onclick=()=>{const o=object();if(!['wood-logo','sofa-chaise'].includes(o?.kind))return;const next=validateState(global.SOMASS_DECOR.update(model,o.id,o.kind==='sofa-chaise'?{chaiseSide:o.chaiseSide==='left'?'right':'left'}:{mirrorX:!o.mirrorX}));commit();model=next;changed();syncFields();};find('space3dFloatFocus').onclick=()=>{const o=object();if(o)global.SOMASS_SPACE_3D.inspectCatalogProduct(o.id);};find('space3dFloatDetails').onclick=()=>{const o=object();if(global.SOMASS_DECOR?.isElement(o)){global.SOMASS_DECOR_UI.openEdit(o.id);return;}detailsVisible=!detailsVisible;refresh();};find('space3dFloatAngleForm').onsubmit=event=>{event.preventDefault();cancelDrag();apply({rotation:num(find('space3dFloatAngle').value)});};find('space3dFloatAngle').onchange=()=>{cancelDrag();apply({rotation:num(find('space3dFloatAngle').value)});};
 find('space3dEditMode').onclick=()=>setMode(true);find('space3dCameraMode').onclick=()=>setMode(false);
 addPartition.onclick=()=>global.SOMASS_PARTITIONS?.open();cancelPartition.onclick=()=>{picker()?.cancelPick();placementPoint=null;refresh();context?.requestDraw();};
 find('space3dProductSelect').onchange=event=>{const id=event.target.value;setMode(true);select(id);};
 find('space3dProductForm').onsubmit=event=>{event.preventDefault();cancelDrag();apply({x:num(find('space3dProductX').value),y:num(find('space3dProductY').value),rotation:num(find('space3dProductAngle').value),...(Math.abs(num(find('space3dProductElevation').value)-(global.SOMASS_SUPPORT?.elevation(object(),model)||0))>.001?{elevationCm:num(find('space3dProductElevation').value)}:{}),...(object()?.kind==='partition'?{partitionDimensions:{lengthCm:num(find('space3dPartitionLength').value),thicknessCm:num(find('space3dPartitionThickness').value),heightCm:num(find('space3dPartitionHeight').value),color:find('space3dPartitionColor').value}}:{})});};
 find('space3dProductStep').onchange=event=>{step=Number(event.target.value);};find('space3dAngleStep').onchange=event=>{angleStep=Number(event.target.value);};
 panel.querySelectorAll('[data-3d-move]').forEach(button=>button.onclick=event=>{cancelDrag();nudge(button.dataset['3dMove']||button.getAttribute('data-3d-move'),event);});
 find('space3dRotateLeft').onclick=()=>{cancelDrag();rotate(-1);};find('space3dRotateRight').onclick=()=>{cancelDrag();rotate(1);};
 find('space3dDuplicateProduct').onclick=duplicate;find('space3dDeleteProduct').onclick=remove;
 find('space3dFocusProduct').onclick=()=>{const item=object();if(item)global.SOMASS_SPACE_3D.inspectCatalogProduct(item.id);};
 find('space3dTopProduct').onclick=()=>{const item=object();if(item)global.SOMASS_SPACE_3D.inspectCatalogProduct(item.id,true);};
 document.addEventListener('keydown',event=>{
  if(!active()||event.target.closest?.('input,textarea,select,[contenteditable]')||document.querySelector('dialog[open]'))return;
  const key=event.key.toLowerCase();
  if(key==='escape'&&picker()?.isPicking?.()){event.preventDefault();event.stopImmediatePropagation();picker().cancelPick();placementPoint=null;refresh();context?.requestDraw();return;}
  if(gesture&&(key==='escape'||((event.ctrlKey||event.metaKey)&&key==='z'))){event.preventDefault();event.stopImmediatePropagation();cancelDrag();return;}
  if(key==='escape'&&object()){event.preventDefault();event.stopImmediatePropagation();select(null);return;}
  if(!editMode||!object())return;
  const direction={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'}[event.key];
  if(direction&&!event.ctrlKey&&!event.metaKey){event.preventDefault();event.stopImmediatePropagation();cancelDrag();nudge(direction,event);}
  else if(key==='r'&&!event.ctrlKey&&!event.metaKey){event.preventDefault();event.stopImmediatePropagation();cancelDrag();rotate(event.shiftKey?-1:1);}
  else if(key==='delete'||key==='backspace'){event.preventDefault();event.stopImmediatePropagation();remove();}
  else if((event.ctrlKey||event.metaKey)&&key==='d'){event.preventDefault();event.stopImmediatePropagation();duplicate();}
 },true);
 global.addEventListener('blur',cancelDrag);
 const oldPanels=renderPanels;renderPanels=function(){oldPanels();refresh();};
 global.SOMASS_3D_EDIT={connect,disconnect,beforeDraw,cancelDrag,refresh,select,transformPlan};refresh();
})(typeof globalThis!=='undefined'?globalThis:this);
