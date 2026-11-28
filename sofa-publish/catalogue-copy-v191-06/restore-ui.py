from pathlib import Path
import argparse,hashlib,json
def sha(b):return hashlib.sha256(b).hexdigest()
def run(site):
 package=Path(__file__).parent;m=json.loads((package/'manifest.json').read_text());sofa=site/'sofa';assert m['schemaVersion']==1 and m['type']=='catalogue-header-count-v191-06';target=sofa/'kombinasyonlar.html';old=target.read_bytes();assert sha(old)==m['expectedBaseSHA256'];data=(package/'kombinasyonlar.html').read_bytes();assert len(data)==m['bytes'] and sha(data)==m['sha256'];assert old.decode().count(m['oldCopy'])==1 and data.decode()==old.decode().replace(m['oldCopy'],m['newCopy'])
 for p,value in m['protectedFiles'].items():assert sha((sofa/p).read_bytes())==value,p
 gallery=json.loads((sofa/'assets/product-studio-v178/gallery-index.json').read_text());assert len(gallery['products'])==281 and len({p['product']['layoutSKU']for p in gallery['products']})==97 and gallery['actualPhotoCount']==1405 and all(len(p['gallery'])==5 for p in gallery['products']);before=sum(p.stat().st_size for p in site.rglob('*')if p.is_file());assert before+len(data)+1_000_000<1_000_000_000;target.write_bytes(data)
 audit=sofa/'INTERFACE-OVERRIDES.json';doc=json.loads(audit.read_text())
 for row in doc['files']:
  if row['path']=='kombinasyonlar.html':row.update(sourceSHA256=row.get('sourceSHA256',row['sha256']),sourceBytes=row.get('sourceBytes',row['bytes']),sha256=sha(data),bytes=len(data))
 doc['catalogueIntroCountsRevision']='191-06';audit.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n');inventory=sofa/'PACKAGE-MEMBERS.json';rows=[]
 for p in sorted(sofa.rglob('*')):
  assert not p.is_symlink()
  if p.is_file() and p!=inventory:
   b=p.read_bytes();rows.append({'path':p.relative_to(sofa).as_posix(),'bytes':len(b),'sha256':sha(b)})
 prior=json.loads(inventory.read_text());prior.update(members=rows,catalogueIntroCountsRevision='191-06');inventory.write_text(json.dumps(prior,indent=2)+'\n');total=sum(p.stat().st_size for p in site.rglob('*')if p.is_file());assert total<1_000_000_000;print(json.dumps({'pass':True,'introLayouts':97,'introVariants':281,'publicPhotosUnchanged':1405,'pricingImportMapFixPreserved':True,'actualFullSiteBytes':total}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--site',required=True,type=Path);run(p.parse_args().site.resolve())
