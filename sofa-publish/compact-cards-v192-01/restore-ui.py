from pathlib import Path
import argparse,hashlib,json,re
ALLOWED={'kombinasyonlar.html','kombinasyonlar.css','kombinasyonlar.js','sku-display.js','sku-display.css'}
def sha(b):return hashlib.sha256(b).hexdigest()
def run(site):
 package=Path(__file__).parent;m=json.loads((package/'manifest.json').read_text());sofa=site/'sofa';assert m['schemaVersion']==1 and m['type']=='compact-sofa-cards-v192-01' and m['plannedProductsIncluded']==0;assert {r['path']for r in m['files']}==ALLOWED and len(m['files'])==5;content={}
 for r in m['files']:
  name=r['path'];assert sha((sofa/name).read_bytes())==r['expectedBaseSHA256'],name;b=(package/name).read_bytes();assert len(b)==r['bytes'] and sha(b)==r['sha256'];content[name]=b
 for p,value in m['protectedFiles'].items():assert sha((sofa/p).read_bytes())==value,p
 html=content['kombinasyonlar.html'].decode();assert '97 farklı yerleşim, 281 renk ve malzeme seçeneği.'in html and 'data-number'not in html
 for name in ['kombinasyonlar.css','sku-display.css','kombinasyonlar.js','sku-display.js']:assert './'+name+'?v=192-compact-1'in html
 mapping=re.search(r'<script type="importmap">([\s\S]*?)</script>',html);assert mapping and mapping.start()<html.index('type="module"');assert json.loads(mapping[1])['imports']=={'three':'./vendor/three.module.min.js','three/addons/':'./vendor/addons/'}
 gallery=json.loads((sofa/'assets/product-studio-v178/gallery-index.json').read_text());assert len(gallery['products'])==281 and gallery['actualPhotoCount']==1405 and all(len(p['gallery'])==5 and not p['pendingViews']for p in gallery['products']);assert len({p['product']['layoutSKU']for p in gallery['products']})==97
 before=sum(p.stat().st_size for p in site.rglob('*')if p.is_file());assert before+sum(len(b)for b in content.values())+1_000_000<1_000_000_000
 for name,b in content.items():(sofa/name).write_bytes(b)
 audit=sofa/'INTERFACE-OVERRIDES.json';doc=json.loads(audit.read_text())
 for row in doc['files']:
  if row['path']in content:
   b=content[row['path']];row.update(sourceSHA256=row.get('sourceSHA256',row['sha256']),sourceBytes=row.get('sourceBytes',row['bytes']),sha256=sha(b),bytes=len(b))
 doc['compactCardsRevision']='192-01';audit.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n');inventory=sofa/'PACKAGE-MEMBERS.json';rows=[]
 for p in sorted(sofa.rglob('*')):
  assert not p.is_symlink()
  if p.is_file() and p!=inventory:
   b=p.read_bytes();rows.append({'path':p.relative_to(sofa).as_posix(),'bytes':len(b),'sha256':sha(b)})
 prior=json.loads(inventory.read_text());prior.update(members=rows,compactCardsRevision='192-01');inventory.write_text(json.dumps(prior,indent=2)+'\n');total=sum(p.stat().st_size for p in site.rglob('*')if p.is_file());assert total<1_000_000_000;print(json.dumps({'pass':True,'compactCardFiles':5,'layouts':97,'variants':281,'photosUnchanged':1405,'plannedProductsIncluded':0,'actualFullSiteBytes':total}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--site',required=True,type=Path);run(p.parse_args().site.resolve())
