(function(g){'use strict';
 function init(){
  if(document.body.classList.contains('studio-enabled'))return;
  const body=document.body,$=id=>document.getElementById(id),workspace=document.querySelector('.workspace'),drawing=$('drawingPanel'),actions=document.querySelector('.easy-actions'),measure=$('measurePanel');
  if(!workspace||!drawing||!actions||!measure)return;
  body.classList.add('studio-enabled');
  const paths={menu:'M4 6h16M4 12h16M4 18h16',product:'M4 11V7h16v4M3 11h18v8H3zM7 19v2M17 19v2',wall:'M4 20V4h16v16M4 12h16M12 4v8',decor:'M12 21v-9M12 15C4 15 3 8 4 4c6 0 8 5 8 8M12 17c7 0 9-6 8-10-6 0-8 5-8 10',paint:'M5 3h14v7H5zM12 10v4h5v3h-5v5',select:'M5 3l14 9-7 1-3 7z',settings:'M4 7h16M4 17h16M8 4v6M16 14v6',search:'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12M15 15l5 5',close:'M6 6l12 12M18 6L6 18',help:'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4M12 18h.01',file:'M6 3h9l4 4v14H6zM15 3v5h4',focus:'M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5'};
  const svg=name=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+(paths[name]||paths.select)+'"/></svg>';
  const button=(id,label,icon,handler)=>{const el=document.createElement('button');el.type='button';el.id=id;el.title=label;el.setAttribute('aria-label',label);el.innerHTML=svg(icon)+'<span>'+label+'</span>';el.onclick=handler;return el;};
  const nav=document.createElement('aside');nav.id='studioNavigation';nav.className='studio-navigation';
  nav.innerHTML='<div class="studio-nav-top"></div><nav class="studio-rail" aria-label="Çalışma araçları"></nav><div class="studio-tool-panel" hidden><div class="studio-tools-heading"><div><small>ÇALIŞMA ALANI</small><h2 id="studioToolsTitle">Araçlar</h2></div><button type="button" id="studioToolsClose" aria-label="Araçları kapat">'+svg('close')+'</button></div><label class="studio-search">'+svg('search')+'<input id="studioToolSearch" type="search" placeholder="Araç veya işlem ara…" aria-label="Araç ara"></label><div class="studio-tool-content"></div><p class="studio-search-empty" hidden>Bu aramaya uygun araç bulunamadı.</p></div><div class="studio-nav-bottom"></div>';
  workspace.prepend(nav);
  const toolPanel=nav.querySelector('.studio-tool-panel'),toolContent=nav.querySelector('.studio-tool-content'),search=$('studioToolSearch');
  const dock=document.createElement('aside');dock.id='studioDock';dock.className='studio-dock';dock.hidden=true;
  dock.innerHTML='<header class="studio-dock-heading"><div><small>ÇALIŞMA ALANI</small><h2>Öğe ve ölçüler</h2></div><button type="button" id="studioDockClose" aria-label="Detayları kapat">'+svg('close')+'</button></header><div class="studio-dock-scroll"><div id="studioFormMount"></div><div id="studioInspector"></div><details id="studioProjectSettings"><summary>Plan ölçüleri ve ileri ayarlar</summary><div class="studio-settings-body"></div></details></div>';
  workspace.append(dock);dock.querySelector('.studio-settings-body').append(measure);
  let activeGroup='all',resizePending=false;
  function notifyResize(){if(resizePending)return;resizePending=true;requestAnimationFrame(()=>{resizePending=false;if(typeof resize==='function')resize();g.SOMASS_SPACE_3D?.refresh?.();g.dispatchEvent(new Event('resize'));});}
  function closeTools(){toolPanel.hidden=true;body.classList.remove('studio-tools-open');nav.querySelectorAll('[data-studio-group]').forEach(b=>b.setAttribute('aria-expanded','false'));}
  function showInspector(mode){dock.hidden=false;body.classList.add('studio-inspector-open');if(mode==='settings'){$('studioProjectSettings').open=true;}
   if(innerWidth<780)closeTools();notifyResize();
  }
  function hideInspector(){dock.hidden=true;body.classList.remove('studio-inspector-open');notifyResize();}
  function openTools(group='all'){
   const same=!toolPanel.hidden&&activeGroup===group;if(same){closeTools();return;}
   activeGroup=group;search.value='';$('studioToolsTitle').textContent={all:'Tüm araçlar',structure:'Duvar ve ölçü',decor:'Mobilya ve dekor'}[group]||'Araçlar';
   toolPanel.hidden=false;body.classList.add('studio-tools-open');filterTools();
   nav.querySelectorAll('[data-studio-group]').forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.studioGroup===group)));
  }
  function filterTools(){const query=search.value.trim().toLocaleLowerCase('tr-TR');let total=0;
   toolContent.querySelectorAll('.studio-tool-group').forEach(section=>{let count=0;section.querySelectorAll('button').forEach(b=>{const ok=(!query&&activeGroup!=='all'?section.dataset.group===activeGroup:true)&&(!query||b.textContent.toLocaleLowerCase('tr-TR').includes(query));b.hidden=!ok;if(ok)count++;});section.hidden=count===0;total+=count;});
   nav.querySelector('.studio-search-empty').hidden=total>0;
  }
  g.SOMASS_STUDIO_UI={showInspector,hideInspector,openTools,closeTools,refresh:notifyResize};
  const rail=nav.querySelector('.studio-rail');
  nav.querySelector('.studio-nav-top').append(button('studioMenu','Tüm araçlar','menu',()=>openTools('all')));
  rail.append(button('studioProducts','Ürünler','product',()=>{closeTools();$('catalogProductsButton')?.click();}));
  const structural=button('studioStructure','Duvarlar','wall',()=>openTools('structure'));structural.dataset.studioGroup='structure';structural.setAttribute('aria-expanded','false');rail.append(structural);
  const decor=button('studioDecor','Dekorasyon','decor',()=>openTools('decor'));decor.dataset.studioGroup='decor';decor.setAttribute('aria-expanded','false');rail.append(decor);
  rail.append(button('studioPaint','Boyalar','paint',()=>{closeTools();g.SOMASS_UI_PAINT?.open?.();}));
  rail.append(button('studioSelection','Seçili öğe','select',()=>{closeTools();showInspector();}));
  rail.append(button('studioSettings','Ölçüler','settings',()=>{closeTools();showInspector('settings');}));
  nav.querySelector('.studio-nav-bottom').append(button('studioHelp','Yardım','help',()=>$('easyHelp')?.click()));
  $('studioToolsClose').onclick=closeTools;$('studioDockClose').onclick=hideInspector;search.addEventListener('input',filterTools);
  const groups={structure:{title:'DUVAR VE ÖLÇÜ',ids:['toolsToggle','editOpen','partitionWallButton','openInstallations','guideOpen','openFrontageCalibration']},decor:{title:'MOBİLYA VE DEKOR',ids:['catalogProductsButton','showroomModelsButton','decorElementsButton','designAdd-wall-finish','designAdd-indoor-plant','designAdd-oak-platform']},all:{title:'GÖRÜNÜM VE HASSASİYET',ids:['precisionMoveToggle']}};
  toolContent.append(actions);actions.classList.add('studio-native-tools');
  for(const [group,config] of Object.entries(groups)){
   const section=document.createElement('section');section.className='studio-tool-group';section.dataset.group=group;section.innerHTML='<h3>'+config.title+'</h3><div></div>';actions.append(section);
   for(const id of config.ids){const el=$(id);if(el)section.lastElementChild.append(el);}
  }
  const newWall=button('studioDrawWall','Duvar çiz','wall',()=>{g.SOMASS_SPACE_3D?.setView?.('2d');document.querySelector('.toolbox [data-tool="wall"]')?.click();closeTools();});
  actions.querySelector('[data-group="structure"]>div').prepend(newWall);
  const byLength=button('studioMeasuredWall','Ölçü girerek duvar ekle','settings',()=>{closeTools();showInspector('settings');$('wallLength')?.focus();});
  newWall.after(byLength);
  const known=new Set(Object.values(groups).flatMap(x=>x.ids));
  for(const el of Array.from(actions.children)){if(el.matches('button')&&!known.has(el.id)&&el.id!=='deleteWallOpen'&&el.id!=='panPlan')actions.querySelector('[data-group="all"]>div').append(el);}
  actions.addEventListener('click',e=>{const el=e.target.closest('button');if(!el)return;requestAnimationFrame(()=>{if(el.id!=='precisionMoveToggle')closeTools();});},false);
  $('toolsToggle').addEventListener('click',()=>g.SOMASS_SPACE_3D?.setView?.('2d'),true);
  if($('editOpen'))$('editOpen').onclick=()=>{showInspector();g.SOMASS_UI_INSPECTOR?.edit?.();};
  if($('deleteWallOpen'))$('deleteWallOpen').hidden=true;
  const top=document.querySelector('.drawing-top'),history=top.querySelector('.history'),views=top.querySelector('.space-view-switch');
  if(views)top.prepend(views);
  $('planStatus')?.parentElement?.classList.add('studio-plan-status');
  const inspectButton=button('studioInspectToggle','Detaylar','settings',()=>dock.hidden?showInspector():hideInspector());history.append(inspectButton);
  if($('plannerSidebarToggle'))$('plannerSidebarToggle').hidden=true;
  if($('panPlan')){history.prepend($('panPlan'));$('panPlan').textContent='Kaydır';}
  if($('undo'))$('undo').classList.remove('labeled-undo');
  if($('undo'))Array.from($('undo').children).find(el=>el.tagName==='SPAN'&&!el.hasAttribute('data-icon')&&!el.querySelector('svg'))?.remove();
  const previousFit=$('fit')?.onclick;
  function fitView(){
   if(g.SOMASS_SPACE_3D?.isActive?.()){g.SOMASS_SPACE_3D.fit();return;}
   if(typeof model==='undefined'||typeof camera==='undefined'){previousFit?.();return;}
   const points=model.walls.flatMap(w=>[w.a,w.b]);
   for(const room of g.SOMASS_ROOMS?.roomPolygons?.(model)||[])points.push(...room.points);
   if(!points.length){previousFit?.();return;}
   const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y)),r=$('canvasWrap').getBoundingClientRect();
   camera.z=Math.min(3,Math.max(.005,Math.min((r.width-80)/Math.max(maxX-minX+36,100),(r.height-90)/Math.max(maxY-minY+36,100))));
   camera.x=(minX+maxX)/2-r.width/2/camera.z;camera.y=(minY+maxY)/2-r.height/2/camera.z;
   if(typeof render==='function')render();
  }
  if($('fit'))$('fit').onclick=fitView;
  if($('exportOpen'))$('exportOpen').lastElementChild.textContent='Çıktılar';
  if($('projectSave')){const save=$('projectSave');save.textContent='Yedekle';save.title='Güncel planı JSON dosyası olarak indir';save.onclick=()=>$('exportJson')?.click();}
  const importButton=button('studioImport','Plan aç','file',()=>$('importJson')?.click());importButton.className='button secondary studio-import';
  document.querySelector('.header-actions').insertBefore(importButton,$('projectSave'));
  const cameras=document.querySelector('.space-3d-camera-tools');
  if(cameras){
   const details=document.createElement('details');details.className='studio-camera-more';details.innerHTML='<summary>Görünüm ayarları</summary><div class="studio-camera-options"></div>';
   const destination=details.lastElementChild;
   for(const id of ['space3dDoorView','space3dCeilingView','space3dCeilingToggle','space3dPanMode','space3dPickFocus']){const el=$(id);if(el)destination.append(el);}
   if($('space3dHeightForm'))destination.append($('space3dHeightForm'));
   cameras.append(details);
  }
  const oldSidebar=g.SOMASS_PLANNER_UI?.setSidebar;
  if(oldSidebar)g.SOMASS_PLANNER_UI.setSidebar=function(show){oldSidebar.call(this,show);if(show)showInspector('settings');};
  const oldInline=g.SOMASS_INLINE_DETAILS?.open;
  if(oldInline)g.SOMASS_INLINE_DETAILS.open=function(){showInspector('settings');return oldInline.apply(this,arguments);};
  g.SOMASS_UI_INSPECTOR?.mount?.($('studioInspector'));
  $('studioInspector').addEventListener('somass:inspector-selection',e=>{if(e.detail?.selected)showInspector();});
  let formQueued=false;
  function collectForms(){formQueued=false;const target=$('studioFormMount');
   document.querySelectorAll('.decor-inline:not([hidden]),.partition-wall-inline:not([hidden])').forEach(el=>{if(!target.contains(el)){target.append(el);showInspector();}});
   const active=!!target.querySelector('.decor-inline:not([hidden]),.partition-wall-inline:not([hidden])');dock.dataset.formActive=String(active);
   if(active)$('studioProjectSettings').open=false;
  }
  new MutationObserver(()=>{if(!formQueued){formQueued=true;requestAnimationFrame(collectForms);}}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  document.addEventListener('keydown',e=>{const typing=e.target.matches('input,textarea,select,[contenteditable="true"]');
   if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openTools('all');search.focus();}
   if(e.key==='Escape'){closeTools();hideInspector();document.querySelectorAll('.studio-camera-more').forEach(d=>d.open=false);}
   if(!typing&&e.key==='?'&&!e.metaKey&&!e.ctrlKey)$('easyHelp')?.click();
  });
  document.addEventListener('pointerdown',e=>{if(!toolPanel.hidden&&!nav.contains(e.target))closeTools();});
  filterTools();collectForms();notifyResize();requestAnimationFrame(fitView);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(globalThis);
