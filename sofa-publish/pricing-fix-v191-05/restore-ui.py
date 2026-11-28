from pathlib import Path
import argparse,hashlib,json,re
def sha(b):return hashlib.sha256(b).hexdigest()
def run(site):
 package=Path(__file__).parent;m=json.loads((package/'manifest.json').read_text());sofa=site/'sofa';assert m['schemaVersion']==1 and m['type']=='pricing-browser-import-map-v191-05'
 target=sofa/'pricing.html';assert sha(target.read_bytes())==m['expectedBaseSHA256']
 data=(package/'pricing.html').read_bytes();assert len(data)==m['bytes'] and sha(data)==m['sha256'];text=data.decode();pattern=r'<script\s+type="importmap">([\s\S]*?)</script>';found=re.search(pattern,text);assert found and found.start()<text.index('type="module"');mapping=json.loads(found[1])['imports'];assert mapping=={'three':'./vendor/three.module.min.js','three/addons/':'./vendor/addons/'};assert (sofa/'vendor/three.module.min.js').is_file() and (sofa/'vendor/addons').is_dir()
 for p,value in m['protectedFiles'].items():assert sha((sofa/p).read_bytes())==value,p
 gallery=json.loads((sofa/'assets/product-studio-v178/gallery-index.json').read_text());assert len(gallery['products'])==281 and gallery['actualPhotoCount']==1405 and all(len(p['gallery'])==5 and not p['pendingViews']for p in gallery['products'])
 before=sum(p.stat().st_size for p in site.rglob('*')if p.is_file());assert before+len(data)+1_000_000<1_000_000_000
 target.write_bytes(data);audit=sofa/'INTERFACE-OVERRIDES.json';doc=json.loads(audit.read_text())
 for row in doc['files']:
  if row['path']=='pricing.html':row.update(sourceSHA256=row.get('sourceSHA256',row['sha256']),sourceBytes=row.get('sourceBytes',row['bytes']),sha256=sha(data),bytes=len(data))
 doc['pricingBrowserImportMapRevision']='191-05';audit.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n')
 inventory=sofa/'PACKAGE-MEMBERS.json';rows=[]
 for p in sorted(sofa.rglob('*')):
  assert not p.is_symlink()
  if p.is_file() and p!=inventory:
   b=p.read_bytes();rows.append({'path':p.relative_to(sofa).as_posix(),'bytes':len(b),'sha256':sha(b)})
 prior=json.loads(inventory.read_text());prior.update(members=rows,pricingBrowserImportMapRevision='191-05');inventory.write_text(json.dumps(prior,indent=2)+'\n')
 total=sum(p.stat().st_size for p in site.rglob('*')if p.is_file());assert total<1_000_000_000;print(json.dumps({'pass':True,'pricingImportMapResolved':True,'publicPhotosUnchanged':1405,'catalogueVariantsUnchanged':281,'actualFullSiteBytes':total}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--site',required=True,type=Path);run(p.parse_args().site.resolve())
