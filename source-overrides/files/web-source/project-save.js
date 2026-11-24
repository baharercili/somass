/* Static web editor: browser storage plus an explicit portable JSON backup. */
(function(g){'use strict';
 if(!g.SOMASS_STATIC_SITE?.enabled)throw Error('Statik site ayarı bulunamadı.');
 const button=document.createElement('button');button.id='projectSave';button.className='button secondary';button.textContent='Projeyi kaydet';
 const label=document.createElement('span');label.id='projectSaveStatus';label.className='project-save-status';label.setAttribute('role','status');
 document.querySelector('.header-actions').prepend(label,button);
 let localSaved=!!g.SOMASS_RESTORED_FROM_STORAGE&&!g.SOMASS_STORAGE_UNAVAILABLE;
 function status(){label.textContent=g.SOMASS_RESTORE_FAILED?'Önceki taslak korunuyor':localSaved?'Bu tarayıcıda kayıtlı':'JSON yedeği gerekli';label.classList.toggle('save-error',!!g.SOMASS_RESTORE_FAILED||!localSaved);label.title='Bu cihazda otomatik kayıt tutulur. Başka cihazda devam etmek için Bulut hesabına giriş yapabilir veya JSON yedeğini açabilirsin.';}
 const previousPersist=persist;persist=function(){model.projectUpdatedAt=new Date().toISOString();const ok=previousPersist();localSaved=ok===true;status();return ok;};
 async function save(){
  if(button.disabled)return false;button.disabled=true;
  try{
   if(g.SOMASS_RESTORE_FAILED)throw Error('Önceki taslak okunamadı. JSON yedeğini açarak devam et.');
   const next=validateState(model);const browserSaved=persist();
   next.projectUpdatedAt=model.projectUpdatedAt;const payload=JSON.stringify(next,null,2),stamp=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19),filename='somass-proje-'+stamp+'.json';
   if(typeof g.showSaveFilePicker==='function'){
    const handle=await g.showSaveFilePicker({suggestedName:filename,types:[{description:'Düzenlenebilir SOMASS planı',accept:{'application/json':['.json']}}]});
    const writer=await handle.createWritable();try{await writer.write(payload);await writer.close();}catch(error){try{await writer.abort();}catch(_){}throw error;}
    const file=await handle.getFile();if(file.size!==new TextEncoder().encode(payload).byteLength)throw Error('Kaydedilen dosyanın boyutu doğrulanamadı.');
    label.textContent=browserSaved?'Tarayıcıda kayıtlı · JSON yedeği kaydedildi':'JSON yedeği kaydedildi · tarayıcı kaydı yok';toast(browserSaved?'Güncel plan ve JSON yedeği kaydedildi.':'JSON yedeği kaydedildi. Bu tarayıcı kayıt tutamıyor.');
   }else{download(payload,filename,'application/json');label.textContent=browserSaved?'Tarayıcıda kayıtlı · JSON indirme başlatıldı':'JSON indirme başlatıldı · tarayıcı kaydı yok';toast(browserSaved?'Güncel plan tarayıcıda kayıtlı. JSON yedeği indirmesi başlatıldı.':'JSON yedeği indirmesi başlatıldı. Bu tarayıcı kayıt tutamıyor.');}
   return true;
  }catch(error){if(error.name==='AbortError'){status();toast('Dosya penceresi kapatıldı. Plan bu sekmede açık.');}else{label.textContent='JSON yedeği kaydedilemedi';label.classList.add('save-error');toast(error.message);}return false;}
  finally{button.disabled=false;}
 }
 button.onclick=save;g.SOMASS_PROJECT_SAVE={save,ready:async()=>!g.SOMASS_RESTORE_FAILED};status();render();renderPanels();
})(globalThis);
