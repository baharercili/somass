/** Selection history stores only configuration values; cameras and panels are transient. */
const KEYS=['body','accent','base','finish','scene','layout','extra','back','table','terminal','tableDesign','tableVariant','tablePosition','tableDirection','tables','modules','moduleRotation','cornerTables'];
const labels={body:'Ana kumaş rengi',accent:'Yastık rengi',base:'Ahşap rengi',scene:'Stüdyo görünümü',layout:'Yerleşim',extra:'Ara modül sayısı',table:'Ahşap modüller',terminal:'Kol bitişi',tableDesign:'Sehpa tasarımı',tableVariant:'Sehpa formu',tablePosition:'Sehpa konumu',tableDirection:'Sehpa yönü',tables:'Ahşap modüller',modules:'Koltuk modülleri',moduleRotation:'Yerleşim yönü',cornerTables:'Köşe sehpası'};
const cloneTables=tables=>Array.isArray(tables)?tables.map(entry=>({id:entry.id,type:entry.type,position:entry.position,...(entry.type==='angled'&&entry.direction==='back'?{direction:'back'}:{}),...(Object.hasOwn(entry,'beforeId')?{beforeId:entry.beforeId}:{}),...(Object.hasOwn(entry,'afterId')?{afterId:entry.afterId}:{})})):tables;
const cloneModules=modules=>Array.isArray(modules)?modules.map(entry=>({...entry})):modules;
const copy=value=>Object.fromEntries(KEYS.filter(key=>Object.hasOwn(value,key)).map(key=>[key,key==='tables'?cloneTables(value[key]):key==='modules'||key==='cornerTables'?cloneModules(value[key]):value[key]]));
const sameValue=(a,b,key)=>key==='tables'||key==='modules'||key==='cornerTables'?JSON.stringify(a[key])===JSON.stringify(b[key]):a[key]===b[key];
const equal=(a,b)=>KEYS.every(key=>sameValue(a,b,key));
export function createSelectionHistory(initial,{limit=60}={}){
 let entries=[{state:copy(initial),label:'Başlangıç seçimi'}],cursor=0;
 return {
  record(value){const next=copy(value),previous=entries[cursor].state;if(equal(previous,next))return false;const changed=KEYS.filter(key=>!sameValue(previous,next,key)),key=changed.includes('layout')?'layout':changed.includes('modules')?'modules':changed.includes('tables')?'tables':changed[0];entries.splice(cursor+1);entries.push({state:next,label:labels[key]||'Seçim'});if(entries.length>limit)entries.shift();cursor=entries.length-1;return true;},
  undo(){if(cursor===0)return null;cursor--;return copy(entries[cursor].state);},
  redo(){if(cursor>=entries.length-1)return null;cursor++;return copy(entries[cursor].state);},
  get canUndo(){return cursor>0;},get canRedo(){return cursor<entries.length-1;},
  get undoLabel(){return cursor>0?entries[cursor].label:'';},get redoLabel(){return entries[cursor+1]?.label||'';},
  get current(){return copy(entries[cursor].state);},get length(){return entries.length;}
 };
}
