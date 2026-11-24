import {NEW_FABRIC_VARIANTS} from './new-fabric-variants.js?v=20261124-new-fabrics-v118';
import {applyCatalogueCopy} from './catalogue-copy.js?v=20261122-content-v96';
import {createGalleryChoices,readGalleryState,combinationHref} from './combinations-state.js?v=20261124-reverse-v132';
import {buildConsumerSummary} from './consumer-summary.js?v=20261124-reverse-v132';
import {GALLERY_COMBINATION_RECIPES} from './gallery-combinations.js?v=20261121-product-galleries-v77';
import {V2_COMBINATION_RECIPES} from './v2-combinations.js?v=20261123-square-corner-v102';

// Each palette is an authored pairing from the photographed Mora card. No viewer
// selection is accepted here: every suggestion carries its own complete finish.
const PALETTES=Object.freeze([
 ['inci','bej','oak','neutral'],
 ['bej','karamel','dark-oak','neutral'],
 ['krem','tas','oak','neutral'],
 ['kum-gri','orman','dark-oak','neutral'],
 ['sedef','arduvaz','oak','neutral'],
 ['tas','inci','dark-oak','neutral'],
 ['denim','lacivert','oak','blue'],
 ['lacivert','bej','dark-oak','blue'],
 ['sis','denim','oak','blue'],
 ['gok','porselen','dark-oak','blue'],
 ['buz-mavi','arduvaz','oak','blue'],
 ['porselen','lacivert','dark-oak','blue'],
 ['karamel','krem','oak','warm'],
 ['kiremit','bej','dark-oak','warm'],
 ['mercan','karamel','oak','warm'],
 ['somon','cikolata','dark-oak','warm'],
 ['bal','bej','oak','warm'],
 ['hardal','inci','dark-oak','warm'],
 ['tutun','krem','oak','warm'],
 ['kehribar','cikolata','dark-oak','warm'],
 ['zeytin','bej','oak','green'],
 ['ada-cayi','krem','dark-oak','green'],
 ['orman','inci','oak','green'],
 ['antrasit','bej','oak','deep'],
 ['fume','sis','dark-oak','deep'],
 ['cikolata','karamel','oak','deep'],
 ['bordo','bej','dark-oak','deep'],
 ['siyah','tas','dark-oak','deep'],
 ['kirmizi','krem','oak','deep'],
 ['ates','bej','dark-oak','warm']
].map((entry,index)=>Object.freeze({id:index,body:'card-'+entry[0],accent:'card-'+entry[1],base:entry[2],tone:entry[3]})));

// Finish lists are chosen per arrangement rather than a palette Cartesian
// product. They span compact everyday sofas, lounge settings and larger rooms.
// Mirroring a composition is not used to inflate the catalogue count.
const RECIPES=Object.freeze([
 ['s01','straight2',0,'none',0,'Üçlü koltuk','İki oturum modülüyle sade ve kompakt düz yerleşim.',[0,6,20,23]],
 ['s02','straight3',0,'none',0,'Dörtlü koltuk','Ortadaki kolsuz oturumla genişleyen üç modüllü düz yerleşim.',[1,8,12,21]],
 ['s03','straight3',1,'none',0,'Geniş düz kanepe','Dört oturum modülünü tek sırada bir araya getiren geniş düzen.',[3,7,24]],
 ['s04','straight2',0,'rectangle',1,'Üçlü · ara raf','İki oturum arasında yarı genişlikte dikdörtgen ahşap raf.',[2,13,22]],
 ['s05','straight2',0,'square',1,'Üçlü · kare ara modül','İki oturumun arasında 95 × 95 cm kare ahşap modül.',[4,14,25]],
 ['s06','straight2',0,'angled',1,'Üçlü · açılı yerleşim','Açılı rafın iki oturumu birbirine doğru çevirdiği sohbet düzeni.',[5,16,26]],
 ['s07','straight3',0,'rectangle',2,'Dörtlü · ara raf','Üç oturumla birlikte sağdaki aralığa yerleşen dikdörtgen raf.',[10,17,27]],
 ['s08','straight3',0,'angled',2,'Dörtlü · açılı yerleşim','Açılı ara sehpayla hafifçe kırılan üç oturumlu yerleşim.',[11,18,28]],
 ['s09','straight2',0,'rectangle','right-end','Üçlü · ahşap bitiş','Kolsuz oturumun yanında kol yerine kullanılan dikdörtgen bitiş.',[9,15,19]],
 ['s10','straight3',0,'square','right-end','Dörtlü · kare bitiş','Üç oturumun sağında geniş kullanım yüzeyi sunan kare bitiş.',[0,7,20]],
 ['c01','chaise-left',0,'none',0,'Sol dinlenmeli','Solda uzanma alanı ve yanında standart oturumla kompakt dinlenmeli düzen.',[1,6,21,25]],
 ['c02','chaise-right',1,'none',0,'Sağ dinlenmeli · üç modül','Sağdaki dinlenme bölümünü bir ara oturumla genişleten yerleşim.',[2,8,13]],
 ['c03','chaise-left',2,'none',0,'Geniş sol dinlenmeli','Dinlenme bölümüyle birlikte dört oturum modülüne yayılan geniş düzen.',[3,12,22]],
 ['c04','chaise-right',0,'rectangle',1,'Dinlenmeli · ara raf','Standart oturumla sağ dinlenme modülü arasında dikdörtgen açık raf.',[4,14,23]],
 ['c05','chaise-left',0,'square','right-end','Dinlenmeli · kare bitiş','Solda dinlenme bölümü; sağdaki kolsuz oturumun yanında kare ahşap yüzey.',[5,16,24]],
 ['c06','chaise-left',1,'angled',1,'Dinlenmeli · açılı yerleşim','Dinlenme bölümü, ara oturum ve açılı rafı birleştiren açık yerleşim.',[9,17,26]],
 ['c07','chaise-left',0,'rectangle','right-end','Dinlenmeli · ahşap bitiş','Solda dinlenme alanı; sağdaki kolsuz oturumun yanında dikdörtgen bitiş.',[10,18,27]],
 ['c08','chaise-right',1,'square','left-end','Geniş dinlenmeli · kare bitiş','Sağ dinlenme bölümünü soldaki kare ahşap bitişle dengeleyen üç oturumlu düzen.',[11,15,28]],
 ['k01','corner-left',0,'none',0,'Sol köşe','İki yöne devam eden, üç oturum modüllü kompakt köşe yerleşimi.',[0,7,20,29]],
 ['k02','corner-right',1,'none',0,'Sağ köşe · dört modül','Ana sıradaki ek oturumla genişleyen sağ köşe yerleşimi.',[1,8,12]],
 ['k03','corner-left',2,'none',0,'Geniş sol köşe','Beş oturum modülüyle geniş bir oturma alanı oluşturan köşe düzeni.',[2,13,21]],
 ['k04','corner-left',0,'rectangle','return','Köşe · dönüşte ara raf','Köşe dönüşündeki oturumların arasında dikdörtgen açık raf.',[3,14,22]],
 ['k05','corner-right',0,'square',1,'Köşe · kare ara modül','Sağ köşenin ana sırasında kare ahşap modülle ayrılan oturumlar.',[4,16,23]],
 ['k06','corner-left',1,'angled','return','Köşe · açılı dönüş','Köşe dönüşündeki açılı rafla daha açık bir oturma açısı kazanan düzen.',[5,17,24]],
 ['k07','corner-left',0,'rectangle','left-end','Köşe · ahşap bitiş','Sol dönüşün ucundaki kolsuz oturumun yanında dikdörtgen bitiş.',[9,18,25]],
 ['k08','corner-right',1,'square','left-end','Köşe · kare bitiş','Sağ köşe düzeninin ana sıradaki sol ucunda geniş kare bitiş.',[10,15,26]],
 ['d01','dual-chaise',0,'none',0,'Çift dinlenmeli','İki uçta uzanma alanı sunan iki modüllü düzen.',[0,6,20]],
 ['d02','dual-chaise',1,'none',0,'Çift dinlenmeli · üç modül','İki dinlenme bölümünün ortasında bir ara oturum.',[1,8,21]],
 ['d03','dual-chaise',2,'none',0,'Geniş çift dinlenmeli','İki dinlenme bölümü ve iki ara oturumdan oluşan geniş düzen.',[2,12,22]],
 ['d04','dual-chaise',0,'rectangle',1,'Çift dinlenmeli · ara raf','İki dinlenme modülünü ayıran yarı genişlikte dikdörtgen raf.',[3,13,23]],
 ['d05','dual-chaise',0,'square',1,'Çift dinlenmeli · kare modül','İki dinlenme alanının arasında 95 × 95 cm kare ahşap modül.',[4,16,24]],
 ['d06','dual-chaise',1,'angled',1,'Çift dinlenmeli · açılı','Bir ara oturumla birlikte iki dinlenme bölümü ve açılı ara sehpa.',[5,17,25]]
].map(([id,layout,extra,table,tablePosition,label,description,palettes])=>Object.freeze({id,layout,extra,table,tablePosition,label,description,palettes:Object.freeze(palettes)})));

const family=layout=>layout==='dual-chaise'?'dual':layout.startsWith('corner-')?'corner':layout.startsWith('chaise-')?'chaise':layout.startsWith('single-')?'single':'straight';
const sizeBand=width=>width<=270?'compact':width<=360?'medium':'large';
const PRESENTATION_ORDER=Object.freeze([0,10,18,26,1,11,19,27,3,13,21,29,5,15,23,31,8,16,24,28,4,14,22,30,2,12,20,6,17,25,7,9]);

// These eight angled arrangements retain the module placements from the v72
// selection. Four simpler layouts complete the black wood collection.
const BLACK_WOOD_RECIPES=Object.freeze([
 ['b01','inci','bej','neutral','straight2',0,[['angled',1],['rectangle','right-end']],'Açılı üçlü · raf bitişli','Açılı ara rafla açılan iki oturum; sağ uçta kol yerine ahşap bitiş.'],
 ['b02','denim','lacivert','blue','straight2',1,[['angled',1],['angled',2]],'Çift açılı sohbet','Üç oturumu iki açılı rafla birbirine yönelten açık sohbet düzeni.'],
 ['b03','ada-cayi','krem','green','chaise-left',0,[['angled',1],['rectangle','right-end']],'Dinlenmeli · açı ve raf bitiş','Solda dinlenme alanı, arada açılı raf ve sağ uçta ahşap bitiş.'],
 ['b04','kiremit','bej','warm','chaise-left',1,[['rectangle',1],['angled',2]],'Dinlenmeli · ara raf ve açı','Dinlenme bölümünü açık raf ve açılı sehpayla genişleten üç oturumlu düzen.'],
 ['b05','sedef','arduvaz','neutral','corner-left',0,[['angled','return']],'Köşe · açılı dönüş','Kompakt köşenin dönüşündeki açılı rafla daha açık bir oturma düzeni.'],
 ['b06','karamel','krem','warm','corner-left',1,[['angled',1],['angled','return']],'Köşe · iki yönde açılı','Ana sırada ve köşe dönüşünde birer açılı rafla genişleyen dört oturum.'],
 ['b07','orman','inci','green','dual-chaise',1,[['rectangle',1],['angled',2]],'Çift dinlenmeli · raf ve açı','İki dinlenme bölümü, ara oturum, açık raf ve açılı sehpa bir arada.'],
 ['b08','bordo','bej','deep','dual-chaise',2,[['angled',1],['angled',2]],'Çift dinlenmeli · kademeli açı','Dört oturum ve iki açılı rafla kademeli açılan geniş dinlenme düzeni.'],
 ['b09','inci','bej','neutral','straight3',0,[],'Dörtlü koltuk','İnci kadifenin açık tonunu siyah ahşap kasayla tamamlayan üç modüllü düz yerleşim.'],
 ['b10','kum-gri','orman','neutral','chaise-right',1,[],'Sağ dinlenmeli · üç modül','Siyah ahşap kasa üzerinde sağda dinlenme alanı ve bir ara oturum.'],
 ['b11','denim','lacivert','blue','corner-left',0,[],'Sol köşe','Denim kadife ve siyah ahşabı birleştiren kompakt köşe yerleşimi.'],
 ['b12','kiremit','bej','warm','dual-chaise',0,[],'Çift dinlenmeli','Sıcak kiremit kadifeyi siyah ahşap kasayla dengeleyen iki dinlenme modülü.']
].map(([id,body,accent,tone,layout,extra,tables,label,description])=>Object.freeze({id,body:'card-'+body,accent:'card-'+accent,tone,layout,extra,tables:Object.freeze(tables.map(([type,position],index)=>Object.freeze({id:'wood-'+(index+1),type,position}))),label,description})));

/** Independent catalogue; only original colour metadata is supplied by caller. */
const REVERSE_ANGLE_RECIPES=Object.freeze([{"key":"inspiration-reverse-v132-01-soft-touch-1246-oak","title":"Arada sehpalı ikili","description":"İki oturum, aralarındaki ters açılı sehpayla dışa yönlenen bir hat oluşturur. Soft Touch İnce Dokuma Pietra gövde, Mora Kadife Inchiostro yastıklar ve naturel meşe.","layoutLabel":"Arada sehpalı ikili","state":{"body":"soft-touch-1246","accent":"card-siyah","base":"oak","finish":"velvet","scene":"warm","layout":"straight2","extra":0,"back":"closed","table":"angled","terminal":"none","tableDesign":"dwg-angled","tableVariant":"standard","tablePosition":1,"tableDirection":"back","tables":[{"id":"wood-1","type":"angled","position":1,"direction":"back"}]},"geometryGroupKey":"5d49d66e32332b86a979460a285fe18ff6d06f4db03dc097309f80da54b17088"},{"key":"inspiration-reverse-v132-02-veronza-1008-dark-oak","title":"Sol dinlenmeli ikili","description":"Sol dinlenme modülü ile sağ oturum arasındaki ters sehpa, iki parçayı dışa açılan bir bağlantıyla ayırır. Veronza Bukle Ekru gövde, Soft Touch İnce Dokuma Salvia yastıklar ve koyu meşe.","layoutLabel":"Sol dinlenmeli ikili","state":{"body":"veronza-1008","accent":"soft-touch-1355","base":"dark-oak","finish":"velvet","scene":"warm","layout":"chaise-left","extra":0,"back":"closed","table":"angled","terminal":"none","tableDesign":"dwg-angled","tableVariant":"standard","tablePosition":1,"tableDirection":"back","tables":[{"id":"wood-1","type":"angled","position":1,"direction":"back"}]},"geometryGroupKey":"62c6e118b2dc62e5a8eb05c27f3c6a5c1c9334faae022e0f525629c655faa70e"},{"key":"inspiration-reverse-v132-03-card-bordo-black-oak","title":"Sol sehpalı sağ dinlenme","description":"Sağ dinlenmeli iki oturumun arasında ters açılı sehpa, sol uçta dikdörtgen ahşap yüzey bulunur. Mora Kadife Amarena gövde, Soft Touch İnce Dokuma Sabbia yastıklar ve siyah ahşap.","layoutLabel":"Sol sehpalı sağ dinlenme","state":{"body":"card-bordo","accent":"soft-touch-1200","base":"black-oak","finish":"velvet","scene":"warm","layout":"chaise-right","extra":0,"back":"closed","table":"angled","terminal":"none","tableDesign":"dwg-angled","tableVariant":"standard","tablePosition":1,"tableDirection":"back","tables":[{"id":"wood-1","type":"angled","position":1,"direction":"back"},{"id":"wood-2","type":"rectangle","position":"left-end"}]},"geometryGroupKey":"6864c65299a61a7435a18ce1f5c0198fcfbd69e98d123bcfbc0f02e85aab7d82"},{"key":"inspiration-reverse-v132-04-soft-touch-1351-oak","title":"Çift açılı üçlü","description":"Üç oturum, ilk arada ters ve ikinci arada standart açılı sehpayla kademeli bir sıraya dönüşür. Soft Touch İnce Dokuma Ardesia gövde, Colormax Melanj Mimosa yastıklar ve naturel meşe.","layoutLabel":"Çift açılı üçlü","state":{"body":"soft-touch-1351","accent":"colormax-1017","base":"oak","finish":"velvet","scene":"warm","layout":"straight3","extra":0,"back":"closed","table":"angled","terminal":"none","tableDesign":"dwg-angled","tableVariant":"standard","tablePosition":1,"tableDirection":"back","tables":[{"id":"wood-1","type":"angled","position":1,"direction":"back"},{"id":"wood-2","type":"angled","position":2}]},"geometryGroupKey":"2defba862d5886e714ef56544b962f3f58157d97557ac5125a878a8250401711"},{"key":"inspiration-reverse-v132-05-veronza-1012-dark-oak","title":"Ara sehpalı sağ dinlenme","description":"Sağ dinlenmeli üç oturumun ilk aralığında dikdörtgen yüzey, ikinci aralığında ters açılı sehpa yer alır. Veronza Bukle Bakır melanj gövde, Soft Touch İnce Dokuma Oliva yastıklar ve koyu meşe.","layoutLabel":"Ara sehpalı sağ dinlenme","state":{"body":"veronza-1012","accent":"soft-touch-1024","base":"dark-oak","finish":"velvet","scene":"warm","layout":"chaise-right","extra":1,"back":"closed","table":"rectangle","terminal":"none","tableDesign":"half-shelf","tableVariant":"standard","tablePosition":1,"tableDirection":"front","tables":[{"id":"wood-1","type":"rectangle","position":1},{"id":"wood-2","type":"angled","position":2,"direction":"back"}]},"geometryGroupKey":"df2503900eaa86c3a6a95d2ea216c2b3d32461c44fee997bcec0558b604e6762"},{"key":"inspiration-reverse-v132-06-colormax-1015-black-oak","title":"İki açılı sol köşe","description":"Üç oturumlu sol köşe, ana sırada standart açı ve dönüş kolunda ters açı taşır. Colormax Melanj Ecrù gövde, Veronza Bukle Zeytin yeşili yastıklar ve siyah ahşap.","layoutLabel":"İki açılı sol köşe","state":{"body":"colormax-1015","accent":"veronza-1030","base":"black-oak","finish":"velvet","scene":"warm","layout":"corner-left","extra":0,"back":"closed","table":"angled","terminal":"none","tableDesign":"dwg-angled","tableVariant":"standard","tablePosition":1,"tableDirection":"front","tables":[{"id":"wood-1","type":"angled","position":1},{"id":"wood-2","type":"angled","position":"return","direction":"back"}]},"geometryGroupKey":"c624bd83d1fee91be3c545194046cba0de0b5cf2213990d9f27fd0fe7c2cc1fc"},{"key":"inspiration-reverse-v132-07-veronza-1031-oak","title":"Ara sehpalı çift dinlenme","description":"İki dinlenme modülü arasındaki ara oturum, bir yanda dikdörtgen ve diğer yanda ters açılı sehpayla bağlanır. Veronza Bukle Haki melanj gövde, Mora Kadife Cotto yastıklar ve naturel meşe.","layoutLabel":"Ara sehpalı çift dinlenme","state":{"body":"veronza-1031","accent":"card-kiremit","base":"oak","finish":"velvet","scene":"warm","layout":"dual-chaise","extra":1,"back":"closed","table":"rectangle","terminal":"none","tableDesign":"half-shelf","tableVariant":"standard","tablePosition":1,"tableDirection":"front","tables":[{"id":"wood-1","type":"rectangle","position":1},{"id":"wood-2","type":"angled","position":2,"direction":"back"}]},"geometryGroupKey":"604a994fe79e5b3a04053daa6f4c9a92f5d1fe44baa1f0d66b5fef44e3823aca"},{"key":"inspiration-reverse-v132-08-veronza-1035-dark-oak","title":"İki ucu dinlenmeli dörtlü","description":"Dört oturumlu çift dinlenmede ilk ara bağlantı ters, son ara bağlantı standart açılı sehpa taşır. Veronza Bukle Koyu kahve gövde, Mora Kadife Inchiostro yastıklar ve koyu meşe.","layoutLabel":"İki ucu dinlenmeli dörtlü","state":{"body":"veronza-1035","accent":"card-siyah","base":"dark-oak","finish":"velvet","scene":"warm","layout":"dual-chaise","extra":2,"back":"closed","table":"angled","terminal":"none","tableDesign":"dwg-angled","tableVariant":"standard","tablePosition":1,"tableDirection":"back","tables":[{"id":"wood-1","type":"angled","position":1,"direction":"back"},{"id":"wood-2","type":"angled","position":3}]},"geometryGroupKey":"227138d9ecb3cc7ec18e3ba81edb6d4c425999c2e5512c3420e24bb4efeef811"},{"key":"inspiration-reverse-v132-09-veronza-1041-black-oak","title":"Ahşap aralıklı sağ köşe","description":"Dört oturumlu sağ köşenin ikinci aralığında dikdörtgen yüzey, dönüş kolunda ters açılı sehpa bulunur. Veronza Bukle Kahve melanj gövde, Soft Touch İnce Dokuma Pietra yastıklar ve siyah ahşap.","layoutLabel":"Ahşap aralıklı sağ köşe","state":{"body":"veronza-1041","accent":"soft-touch-1246","base":"black-oak","finish":"velvet","scene":"warm","layout":"corner-right","extra":1,"back":"closed","table":"rectangle","terminal":"none","tableDesign":"half-shelf","tableVariant":"standard","tablePosition":2,"tableDirection":"front","tables":[{"id":"wood-1","type":"rectangle","position":2},{"id":"wood-2","type":"angled","position":"return","direction":"back"}]},"geometryGroupKey":"e20c4d40e3a864e56a0257a917fcf786381d0cb5cd35d6721a70e3cf9ff46786"},{"key":"inspiration-reverse-v132-10-card-bal-oak","title":"İki ters açılı dörtlü","description":"Dört oturum, ilk ve son ara bağlantılarındaki iki ters açılı sehpayla dışa açılan geniş bir hat kurar. Mora Kadife Cammello gövde, Mora Kadife Cotto yastıklar ve naturel meşe.","layoutLabel":"İki ters açılı dörtlü","state":{"body":"card-bal","accent":"card-kiremit","base":"oak","finish":"velvet","scene":"warm","layout":"straight3","extra":1,"back":"closed","table":"angled","terminal":"none","tableDesign":"dwg-angled","tableVariant":"standard","tablePosition":1,"tableDirection":"back","tables":[{"id":"wood-1","type":"angled","position":1,"direction":"back"},{"id":"wood-2","type":"angled","position":3,"direction":"back"}]},"geometryGroupKey":"e1f7e564a5881ee17cb4403a2f1ec7887d154791625b549953ec95fe4b2b6e85"}].map(Object.freeze));

export function getInspirationCatalog(choices=createGalleryChoices()){
 const required=[...PALETTES,...BLACK_WOOD_RECIPES].flatMap(palette=>[['body',palette.body],['accent',palette.accent]]);
 required.push(['base','black-oak']);
 if(required.some(([group,key])=>!choices[group]?.[key]))throw new Error('Kombinasyon kartelası yüklenemedi.');
 const cards=[];
 // Round-robin presentation keeps the first page varied in size and layout.
 for(let round=0;round<4;round++)for(const [slot,index]of PRESENTATION_ORDER.entries()){
  const recipe=RECIPES[index];
  if(round>=recipe.palettes.length)continue;
  const palette=PALETTES[recipe.palettes[(round+slot%3)%recipe.palettes.length]],state=readGalleryState('',{
   body:palette.body,accent:palette.accent,base:palette.base,finish:'velvet',scene:'warm',
   layout:recipe.layout,extra:recipe.extra,back:'closed',table:recipe.table,terminal:'none',
   tableDesign:recipe.table==='square'?'square-shelf':recipe.table==='rectangle'?'half-shelf':'dwg-angled',
   tableVariant:'standard',tablePosition:recipe.tablePosition,tableDirection:'front'
  },choices),summary=buildConsumerSummary(state,choices);
  if(state.table!==recipe.table||state.tablePosition!==recipe.tablePosition)throw new Error('Geçersiz kombinasyon: '+recipe.id);
  cards.push({
   key:'inspiration-'+recipe.id+'-'+palette.id,title:choices.body[state.body].label+' · '+recipe.label,
   description:recipe.description,layoutKey:state.layout,kind:family(state.layout),tone:palette.tone,
   sizeBand:sizeBand(summary.dimensions.widthCm),state,href:combinationHref(state,state.layout,choices),summary,
   dimensions:summary.dimensions,footprintLabel:summary.footprintLabel,modulePlan:summary.modulePlan,
   seatCount:summary.seatCount,tableCount:summary.tableCount,moduleCount:summary.moduleCount,
   additionalMiddleCount:summary.additionalMiddleCount
  });
 }
 for(const recipe of BLACK_WOOD_RECIPES){
  const firstTable=recipe.tables[0],state=readGalleryState('',{
   body:recipe.body,accent:recipe.accent,base:'black-oak',finish:'velvet',scene:'warm',
   layout:recipe.layout,extra:recipe.extra,back:'closed',table:firstTable?.type??'none',terminal:'none',
   tableDesign:firstTable?.type==='square'?'square-shelf':firstTable?.type==='rectangle'?'half-shelf':'dwg-angled',
   tableVariant:'standard',tablePosition:firstTable?.position??0,tableDirection:'front',tables:recipe.tables
  },choices),summary=buildConsumerSummary(state,choices);
  if(JSON.stringify(state.tables)!==JSON.stringify(recipe.tables))throw new Error('Geçersiz siyah ahşap kombinasyonu: '+recipe.id);
  cards.push({
   key:'inspiration-black-'+recipe.id,title:choices.body[state.body].label+' · '+recipe.label,
   description:recipe.description,layoutKey:state.layout,kind:family(state.layout),tone:recipe.tone,
   sizeBand:sizeBand(summary.dimensions.widthCm),state,href:combinationHref(state,state.layout,choices),summary,
   dimensions:summary.dimensions,footprintLabel:summary.footprintLabel,modulePlan:summary.modulePlan,
   seatCount:summary.seatCount,tableCount:summary.tableCount,moduleCount:summary.moduleCount,
   additionalMiddleCount:summary.additionalMiddleCount
  });
 }
 const conversationState=readGalleryState('',{
  body:'card-zeytin',accent:'card-bej',base:'oak',finish:'velvet',scene:'warm',
  layout:'straight2',extra:1,back:'closed',table:'angled',terminal:'none',
  tableDesign:'dwg-angled',tableVariant:'standard',tablePosition:1,tableDirection:'front',
  tables:[{id:'wood-1',type:'angled',position:1},{id:'wood-2',type:'angled',position:2}]
 },choices),conversationSummary=buildConsumerSummary(conversationState,choices);
 cards.unshift({
  key:'inspiration-zeytin-double-angle',title:'Sehpalı Modüler Koltuk – Zeytin Yeşili Kadife',
  description:'Zeytin yeşili Mora kadife döşemeli sehpalı modüler koltuk. İki naturel meşe ara sehpa, açılabilir sırt ve 428 × 167 cm ölçüleriyle inceleyin.',
  layoutKey:conversationState.layout,kind:family(conversationState.layout),tone:'green',
  sizeBand:sizeBand(conversationSummary.dimensions.widthCm),state:conversationState,
  href:combinationHref(conversationState,conversationState.layout,choices),viewsHref:'./zeytin-cift-acili.html',
  summary:conversationSummary,dimensions:conversationSummary.dimensions,footprintLabel:conversationSummary.footprintLabel,
  modulePlan:conversationSummary.modulePlan,seatCount:conversationSummary.seatCount,
  tableCount:conversationSummary.tableCount,moduleCount:conversationSummary.moduleCount,
  additionalMiddleCount:conversationSummary.additionalMiddleCount
 });
 const keys=new Set(cards.map(card=>card.key));
 for(const recipe of GALLERY_COMBINATION_RECIPES){
  const state=readGalleryState('',recipe.state,choices),summary=buildConsumerSummary(state,choices);
  if(keys.has(recipe.key)||Object.keys(recipe.state).some(key=>JSON.stringify(state[key])!==JSON.stringify(recipe.state[key])))throw new Error('Geçersiz galeri kombinasyonu: '+recipe.key);
  keys.add(recipe.key);
  cards.push({
   key:recipe.key,title:recipe.title,description:recipe.description,
   layoutKey:state.layout,kind:family(state.layout),tone:recipe.tone,
   sizeBand:sizeBand(summary.dimensions.widthCm),state,href:combinationHref(state,state.layout,choices),summary,
   dimensions:summary.dimensions,footprintLabel:summary.footprintLabel,modulePlan:summary.modulePlan,
   seatCount:summary.seatCount,tableCount:summary.tableCount,moduleCount:summary.moduleCount,
   additionalMiddleCount:summary.additionalMiddleCount
  });
 }
 const singleState=readGalleryState('',{
  body:'card-zeytin',accent:'card-bej',base:'oak',finish:'velvet',scene:'warm',
  layout:'single-both',extra:0,back:'closed',table:'none',terminal:'none',
  tableDesign:'dwg-angled',tableVariant:'standard',tablePosition:0,tableDirection:'front',tables:[]
 },choices),singleSummary=buildConsumerSummary(singleState,choices);
 cards.push({
  key:'inspiration-single-both-zeytin',title:'Çift Kollu Tekli Koltuk – Zeytin Yeşili Kadife',
  description:'Zeytin yeşili Mora kadife, iki kol ve naturel meşe kasayla tamamlanan tek oturumlu koltuk. Kumaşını ve ahşap rengini kendi alanına göre seç.',
  layoutKey:singleState.layout,kind:'single',tone:'green',
  sizeBand:sizeBand(singleSummary.dimensions.widthCm),state:singleState,
  href:combinationHref(singleState,singleState.layout,choices),summary:singleSummary,
  dimensions:singleSummary.dimensions,footprintLabel:singleSummary.footprintLabel,modulePlan:singleSummary.modulePlan,
  seatCount:singleSummary.seatCount,tableCount:singleSummary.tableCount,moduleCount:singleSummary.moduleCount,
  additionalMiddleCount:singleSummary.additionalMiddleCount
 });
 for(const recipe of V2_COMBINATION_RECIPES){
  const state=readGalleryState('',recipe.state,choices),summary=buildConsumerSummary(state,choices);
  if(keys.has(recipe.key)||Object.keys(recipe.state).some(key=>JSON.stringify(state[key])!==JSON.stringify(recipe.state[key])))throw new Error('Geçersiz V2 kombinasyonu: '+recipe.key);
  keys.add(recipe.key);
  cards.push({
   key:recipe.key,title:recipe.title,description:recipe.description,
   layoutKey:state.layout,kind:family(state.layout),tone:recipe.tone,
   sizeBand:sizeBand(summary.dimensions.widthCm),state,href:combinationHref(state,state.layout,choices),summary,
   dimensions:summary.dimensions,footprintLabel:summary.footprintLabel,modulePlan:summary.modulePlan,
   seatCount:summary.seatCount,tableCount:summary.tableCount,moduleCount:summary.moduleCount,
   additionalMiddleCount:summary.additionalMiddleCount
  });
 }
 for(const recipe of NEW_FABRIC_VARIANTS){
  const source=cards.find(card=>card.key===recipe.templateKey);if(!source)throw new Error('Yeni kumaş yerleşimi bulunamadı.');
  const state=readGalleryState('',recipe.state,choices),summary=buildConsumerSummary(state,choices);
  if(JSON.stringify(summary.modulePlan)!==JSON.stringify(source.modulePlan)||JSON.stringify(summary.dimensions)!==JSON.stringify(source.dimensions))throw new Error('Yeni kumaş yerleşiminin ölçüleri doğrulanamadı.');
  cards.push({...source,key:recipe.key,title:recipe.title,description:recipe.description,state,summary,href:combinationHref(state,state.layout,choices),modulePlan:summary.modulePlan,geometryGroupKey:recipe.geometryGroupKey,sourceVariantGroupKey:recipe.geometryGroupKey,sourceCardKey:recipe.templateKey,newFabric:true,tone:choices.body[state.body].tone,materials:summary.materials});
 }
 for(const recipe of REVERSE_ANGLE_RECIPES){
  const state=readGalleryState('',recipe.state,choices),nativeSummary=buildConsumerSummary(state,choices);
  if(Object.keys(recipe.state).some(key=>JSON.stringify(state[key])!==JSON.stringify(recipe.state[key])))throw new Error('Ters açılı yerleşimin yönü doğrulanamadı.');
  const summary={...nativeSummary,layoutLabel:recipe.layoutLabel,shareText:nativeSummary.shareText.replace('Yerleşim: '+nativeSummary.layoutLabel,'Yerleşim: '+recipe.layoutLabel)};
  cards.push({key:recipe.key,title:recipe.title,description:recipe.description,layoutKey:state.layout,kind:family(state.layout),tone:choices.body[state.body].tone,sizeBand:sizeBand(summary.dimensions.widthCm),state,href:combinationHref(state,state.layout,choices),summary,dimensions:summary.dimensions,footprintLabel:summary.footprintLabel,modulePlan:summary.modulePlan,seatCount:summary.seatCount,tableCount:summary.tableCount,moduleCount:summary.moduleCount,additionalMiddleCount:summary.additionalMiddleCount,geometryGroupKey:recipe.geometryGroupKey,reverseAngle:true,newFabric:false,materials:summary.materials});
 }
 return applyCatalogueCopy(cards);
}
