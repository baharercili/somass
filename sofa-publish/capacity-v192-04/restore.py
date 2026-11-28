from pathlib import Path,PurePosixPath
import argparse,json,hashlib,zipfile,io,stat
ZIP='assets/zeytin-cift-acili/Studio-Zeytin-6-Ek-Aci.zip'
TEXT={'assets/product-studio-v178/gallery-index.json','assets/product-galleries/catalogue-v77.json','product-gallery.js','urun.html'}
INTEGRITY=['INTERFACE-OVERRIDES.json','VIEW-SCOPE-PUBLICATION.json','PACKAGE-MEMBERS.json']
def sha(b):return hashlib.sha256(b).hexdigest()
def compact(d):return(json.dumps(d,ensure_ascii=False,separators=(',',':'))+'\n').encode()
def integrity_result(before,content):
 audit=json.loads(before['INTERFACE-OVERRIDES.json']);scope=json.loads(before['VIEW-SCOPE-PUBLICATION.json']);inventory=json.loads(before['PACKAGE-MEMBERS.json'])
 for r in audit['files']:
  if r['path']in content:
   b=content[r['path']];r.update(sourceSHA256=r.get('sourceSHA256',r['sha256']),sourceBytes=r.get('sourceBytes',r['bytes']),sha256=sha(b),bytes=len(b))
 out={'INTERFACE-OVERRIDES.json':compact(audit),'VIEW-SCOPE-PUBLICATION.json':compact(scope)};old={r['path']:r for r in inventory['members']};assert ZIP in old
 changed={**content,**out};rows=[]
 for r in inventory['members']:
  n=r['path']
  if n==ZIP:continue
  rows.append({**r,'bytes':len(changed[n]),'sha256':sha(changed[n])}if n in changed else r)
 inventory['members']=rows;out['PACKAGE-MEMBERS.json']=compact(inventory);return out

def run(site):
 P=Path(__file__).parent;m=json.loads((P/'manifest.json').read_text());assert m['type']=='capacity-and-back-clarity-v192-04'and m['retirement']['path']==ZIP and m['retirement']['referenceAndKeeperProofsPassed'];sofa=site/'sofa';before={}
 for n,expected in m['expectedBaseFiles'].items():
  p=sofa/n;assert p.is_file()and not p.is_symlink();b=p.read_bytes();assert sha(b)==expected,n
  if n in INTEGRITY:before[n]=b
 for n,expected in m['protectedFiles'].items():assert sha((sofa/n).read_bytes())==expected,n
 retired=sofa/ZIP;assert retired.stat().st_size==3217182 and sha(retired.read_bytes())==m['retirement']['sha256']
 archive=b''
 for r in m['parts']:
  assert '/'not in r['name'];b=(P/r['name']).read_bytes();assert len(b)==r['bytes']and sha(b)==r['sha256'];archive+=b
 assert len(archive)==m['archiveBytes']and sha(archive)==m['archiveSHA256'];expected={r['path']:r for r in m['members']};assert set(expected)==TEXT;content={}
 with zipfile.ZipFile(io.BytesIO(archive))as z:
  for info in z.infolist():
   n=info.filename;assert n in TEXT and n not in content and not info.is_dir()and not stat.S_ISLNK(info.external_attr>>16);b=z.read(info);r=expected[n];assert len(b)==r['bytes']and sha(b)==r['sha256'];content[n]=b
 assert set(content)==TEXT
 for n in ['assets/product-studio-v178/gallery-index.json','assets/product-galleries/catalogue-v77.json']:assert json.loads(content[n])==json.loads((sofa/n).read_bytes()),n
 index=json.loads(content['assets/product-studio-v178/gallery-index.json']);assert len(index['products'])==319 and index['actualPhotoCount']==1443
 photos=[p for row in index['products']for p in row['gallery']];assert len(photos)==1443 and sum(p['qualityApproved']for p in photos)==75
 for p in photos:assert sha((sofa/p['src'].removeprefix('./')).read_bytes())==p['sha256']
 generated=integrity_result(before,content);assert json.loads(generated['VIEW-SCOPE-PUBLICATION.json'])==json.loads(before['VIEW-SCOPE-PUBLICATION.json'])
 for n,b in generated.items():assert sha(b)==m['resultIntegrity'][n]['sha256']and len(b)==m['resultIntegrity'][n]['bytes'],n
 delta=sum(len(b)-(sofa/n).stat().st_size for n,b in {**content,**generated}.items())-retired.stat().st_size;assert delta==m['expectedSiteByteDelta']
 actualBefore=sum(p.stat().st_size for p in site.rglob('*')if p.is_file());assert actualBefore+delta<1_000_000_000
 for n,b in {**content,**generated}.items():(sofa/n).write_bytes(b)
 retired.unlink();total=sum(p.stat().st_size for p in site.rglob('*')if p.is_file());assert total==actualBefore+delta and total<1_000_000_000
 print(json.dumps({'pass':True,'publicProducts':319,'photos':1443,'newPhotos':0,'allParsedCatalogueDataExact':True,'all1443PhotoHashesExact':True,'qualityApproved':75,'reviewPending':1368,'removedDeploymentArchiveOnly':ZIP,'retiredArchiveBytes':3217182,'primaryImagesDeleted':0,'sourceArchivesChanged':0,'actualByteDelta':delta,'actualFullSiteBytes':total}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--site',type=Path,required=True);run(p.parse_args().site.resolve())
