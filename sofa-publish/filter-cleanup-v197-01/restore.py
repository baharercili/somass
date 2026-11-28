from pathlib import Path, PurePosixPath
import argparse, hashlib, io, json, os, zipfile

REVISION='197-01'
INTEGRITY=['INTERFACE-OVERRIDES.json','VIEW-SCOPE-PUBLICATION.json','PACKAGE-MEMBERS.json']
VIEWS={'hero','front','right-rear','high-front','dimensioned-top'}
def sha(b):return hashlib.sha256(b).hexdigest()
def compact(d):return (json.dumps(d,ensure_ascii=False,separators=(',',':'))+'\n').encode()
def safe(n):
 p=PurePosixPath(n);assert n and not p.is_absolute() and p.as_posix()==n and '..'not in p.parts and '\\'not in n;return Path(*p.parts)
def integrity_result(before,content,m):
 audit=json.loads(before[INTEGRITY[0]]);scope=json.loads(before[INTEGRITY[1]]);inventory=json.loads(before[INTEGRITY[2]])
 rows={r['path']:r for r in audit['files']}
 for n,b in content.items():
  if n in rows:
   r=rows[n];r.update(sourceSHA256=r.get('sourceSHA256',r['sha256']),sourceBytes=r.get('sourceBytes',r['bytes']),sha256=sha(b),bytes=len(b))
  else:rows[n]={'path':n,'sha256':sha(b),'bytes':len(b),'revision':REVISION}
 audit.update(files=list(rows.values()),activePublishedRecords=len(rows),catalogueFilterCleanupRevision=REVISION)
 scope.update(catalogueFilterCleanupRevision=REVISION,deltaVersion=REVISION,deltaNewPhotos=0,newReadyHeroProducts=0,newPhysicalLayouts=0)
 out={INTEGRITY[0]:compact(audit),INTEGRITY[1]:compact(scope)}
 rows={r['path']:r for r in inventory['members']}
 for n,b in {**content,**out}.items():rows[n]={**rows.get(n,{}),'path':n,'sha256':sha(b),'bytes':len(b)}
 inventory.update(members=[rows[n]for n in sorted(rows)],catalogueFilterCleanupRevision=REVISION)
 out[INTEGRITY[2]]=compact(inventory);return out
def validate_products(sofa,m):
 for n,h in m['protectedFiles'].items():assert sha((sofa/safe(n)).read_bytes())==h,n
 index=json.loads((sofa/'assets/product-studio-v178/gallery-index.json').read_bytes())
 rows=index['products'];assert len(rows)==473 and index['actualPhotoCount']==2365
 assert len({r['product']['layoutSKU']for r in rows})==100
 assert all(r['product']['layoutSKU']not in ['SOM-Y0083','SOM-Y0095','SOM-Y0097']for r in rows)
 photos={g['src'].removeprefix('./'):g['sha256']for r in rows for g in r['gallery']}
 assert len(photos)==2365 and all(len(r['gallery'])==5 and {g['viewId']for g in r['gallery']}==VIEWS for r in rows)
 assert sum(g['qualityApproved']is True for r in rows for g in r['gallery'])==75
 for n,h in photos.items():assert sha((sofa/safe(n)).read_bytes())==h,n
 return photos
def run(site,fixture=False):
 p=Path(__file__).resolve().parent;m=json.loads((p/'manifest.json').read_text());sofa=site/'sofa'
 assert m['type']=='catalogue-filter-cleanup-v197-01' and m['baselineCommit']=='0ee04051ac95b5d6e818a0b3ded902fc673d7a68'
 assert m['products']==473 and m['photos']==2365 and m['layouts']==100
 before={}
 for n,h in m['expectedBaseFiles'].items():
  f=sofa/safe(n);assert f.is_file()and not f.is_symlink();b=f.read_bytes();assert sha(b)==h,n
  if n in INTEGRITY:before[n]=b
 for n in m['newPaths']:assert not(sofa/safe(n)).exists(),n
 photos=validate_products(sofa,m);raw=b''
 for part in m['parts']:
  n=part['name'];assert '/'not in n and n.startswith('part-');b=(p/n).read_bytes();assert len(b)==part['bytes']and sha(b)==part['sha256'];raw+=b
 assert len(raw)==m['archiveBytes']and sha(raw)==m['archiveSHA256'];content={}
 with zipfile.ZipFile(io.BytesIO(raw))as z:
  assert len(z.namelist())==len(set(z.namelist()))==len(m['members']);assert set(z.namelist())=={r['path']for r in m['members']}
  for r in m['members']:
   n=r['path'];safe(n);assert n in m['allowedPayloadPaths'] and '/'not in n and Path(n).suffix in ['.js','.css','.html'];b=z.read(n);assert len(b)==r['bytes']and sha(b)==r['sha256'];content[n]=b
 generated=integrity_result(before,content,m)
 for n,r in m['resultIntegrity'].items():assert len(generated[n])==r['bytes']and sha(generated[n])==r['sha256'],n
 delta=sum(len(b)-((sofa/safe(n)).stat().st_size if(sofa/safe(n)).exists()else 0)for n,b in {**content,**generated}.items());assert delta==m['expectedSiteByteDelta']
 actualBefore=sum(f.stat().st_size for f in site.rglob('*')if f.is_file());assert actualBefore==(m['baselineSofaBytes']if fixture else m['previousVerifiedFullSiteBytes']);assert m['previousVerifiedFullSiteBytes']+delta==m['predictedFullSiteBytes']<1000000000
 for n,b in {**content,**generated}.items():
  dest=sofa/safe(n);dest.parent.mkdir(parents=True,exist_ok=True);tmp=dest.with_name(dest.name+'.v197-tmp');tmp.write_bytes(b);os.replace(tmp,dest)
 actualAfter=sum(f.stat().st_size for f in site.rglob('*')if f.is_file());assert actualAfter==actualBefore+delta
 assert validate_products(sofa,m)==photos
 print(json.dumps({'pass':True,'revision':REVISION,'layouts':100,'variants':473,'photos':2365,'all2365PhotoBytesExact':True,'allProductPricingAndRemovalDataExact':True,'sourceMastersChanged':0,'photosRepacked':0,'actualByteDelta':delta,'actualFullSiteBytes':None if fixture else actualAfter,'predictedFullSiteBytes':m['predictedFullSiteBytes'],'localSofaOnlyFixture':fixture}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--site',required=True,type=Path);p.add_argument('--local-sofa-fixture',action='store_true');a=p.parse_args();run(a.site.resolve(),a.local_sofa_fixture)
