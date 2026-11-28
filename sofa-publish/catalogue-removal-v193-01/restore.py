from pathlib import Path, PurePosixPath
import argparse, copy, hashlib, io, json, os, re, zipfile

VIEWS=['hero','front','right-rear','high-front','dimensioned-top']
LAYOUTS=['SOM-Y0083','SOM-Y0095','SOM-Y0097']
def sha(b):return hashlib.sha256(b).hexdigest()
def compact(d):return (json.dumps(d,ensure_ascii=False,separators=(',',':'))+'\n').encode()
def safe(n):
 p=PurePosixPath(n);assert n and not p.is_absolute() and p.as_posix()==n and '..'not in p.parts and '\\'not in n;return Path(*p.parts)
def integrity_result(before,content,m):
 audit=json.loads(before['INTERFACE-OVERRIDES.json']);scope=json.loads(before['VIEW-SCOPE-PUBLICATION.json']);inventory=json.loads(before['PACKAGE-MEMBERS.json']);retired={r['path']for r in m['retirements']}
 audit['files']=[r for r in audit['files']if r['path']not in retired]
 known={r['path']for r in audit['files']}
 for r in audit['files']:
  if r['path']in content:
   b=content[r['path']];r.update(sourceSHA256=r.get('sourceSHA256',r['sha256']),sourceBytes=r.get('sourceBytes',r['bytes']),sha256=sha(b),bytes=len(b))
 for n in m['newPaths']:
  if n not in known:audit['files'].append({'path':n,'sha256':sha(content[n]),'bytes':len(content[n]),'revision':'193-01'})
 audit.update(activePublishedRecords=len(audit['files']),catalogueRemovalRevision='193-01',removedLayoutSKUs=LAYOUTS,removedCatalogueVariants=14)
 scope.update(publicSourceSlots=2305,activePublishedGalleryImages=2305,qualityApprovedImages=m['qualityApproved'],reviewPendingImages=2305-m['qualityApproved'],catalogueRecords=461,deltaVersion='193-01',deltaNewPhotos=0,newReadyHeroProducts=0,removedLayoutSKUs=LAYOUTS,removedCatalogueVariants=14,removedExclusivePhotoFiles=70,sourceMasterModelFabricDeletionCount=0,privateTopProofContainsNoPublicTopURL=True)
 out={'INTERFACE-OVERRIDES.json':compact(audit),'VIEW-SCOPE-PUBLICATION.json':compact(scope)}
 old={r['path']:r for r in inventory['members']};changed={**content,**out};rows={n:({**r,'bytes':len(changed[n]),'sha256':sha(changed[n])}if n in changed else r)for n,r in old.items()if n not in retired}
 for n,b in changed.items():
  if n not in rows:rows[n]={'path':n,'bytes':len(b),'sha256':sha(b)}
 inventory.update(members=[rows[n]for n in sorted(rows)],catalogueRemovalRevision='193-01',removedLayoutSKUs=LAYOUTS)
 out['PACKAGE-MEMBERS.json']=compact(inventory);return out
def run(site):
 p=Path(__file__).resolve().parent;m=json.loads((p/'manifest.json').read_text());sofa=site/'sofa'
 assert m['type']=='reversible-catalogue-layout-removal-v193-01' and m['removedLayoutSKUs']==LAYOUTS
 before={}
 for n,h in m['expectedBaseFiles'].items():
  f=sofa/safe(n);assert f.is_file()and not f.is_symlink();b=f.read_bytes();assert sha(b)==h,n
  if n in ['INTERFACE-OVERRIDES.json','VIEW-SCOPE-PUBLICATION.json','PACKAGE-MEMBERS.json']:before[n]=b
 for n in m['newPaths']:assert not(sofa/safe(n)).exists(),n
 for n,h in m['protectedFiles'].items():assert sha((sofa/safe(n)).read_bytes())==h,n
 oldIndex=json.loads((sofa/'assets/product-studio-v178/gallery-index.json').read_bytes());oldCatalogue=json.loads((sofa/'assets/product-galleries/catalogue-v77.json').read_bytes());oldPricing=json.loads((sofa/'assets/pricing/catalogue-skus.json').read_bytes())
 assert len(oldIndex['products'])==475 and oldIndex['actualPhotoCount']==2375
 removed=[r for r in oldIndex['products']if r['product']['layoutSKU']in LAYOUTS];kept=[r for r in oldIndex['products']if r['product']['layoutSKU']not in LAYOUTS];keys={r['key']for r in removed};ids={r['variantID']for r in removed}
 assert len(removed)==14 and len(kept)==461 and keys==set(m['removedKeys'])and ids==set(m['removedVariantIDs'])
 retired={r['path']:r for r in m['retirements']};expectedRetired={g['src'].removeprefix('./'):g['sha256']for r in removed for g in r['gallery']};assert len(retired)==70 and set(retired)==set(expectedRetired)
 for n,r in retired.items():
  assert re.fullmatch(r'assets/product-studio-v178/photos/SOM-Y\d{4}-V\d{3}/(?:hero|front|right-rear|high-front|dimensioned-top)-[a-f0-9]{12}\.(?:avif|webp)',n)
  f=sofa/safe(n);assert f.is_file()and not f.is_symlink();b=f.read_bytes();assert len(b)==r['bytes']and sha(b)==r['sha256']==expectedRetired[n]
 keptPhotos={g['src'].removeprefix('./'):g['sha256']for r in kept for g in r['gallery']};assert len(keptPhotos)==2305 and not set(keptPhotos)&set(retired)
 for n,h in keptPhotos.items():assert sha((sofa/safe(n)).read_bytes())==h,n
 raw=b''
 for part in m['parts']:
  n=part['name'];assert '/'not in n and n.startswith('part-');b=(p/n).read_bytes();assert len(b)==part['bytes']and sha(b)==part['sha256'];raw+=b
 assert len(raw)==m['archiveBytes']and sha(raw)==m['archiveSHA256'];content={}
 with zipfile.ZipFile(io.BytesIO(raw))as z:
  assert len(z.namelist())==len(set(z.namelist()))==len(m['members']);assert set(z.namelist())=={r['path']for r in m['members']}
  for r in m['members']:
   n=r['path'];safe(n);assert n in m['allowedPayloadPaths'];b=z.read(n);assert len(b)==r['bytes']and sha(b)==r['sha256'];content[n]=b
 index=json.loads(content['assets/product-studio-v178/gallery-index.json']);catalogue=json.loads(content['assets/product-galleries/catalogue-v77.json']);pricing=json.loads(content['assets/pricing/catalogue-skus.json'])
 assert index['products']==kept and index['actualPhotoCount']==2305
 assert catalogue['products']==[r for r in oldCatalogue['products']if r['layoutSKU']not in LAYOUTS]and catalogue['productCount']==461 and catalogue['imageCount']==2305
 assert len({r['product']['layoutSKU']for r in kept})==94
 assert all(len(r['gallery'])==5 and {g['viewId']for g in r['gallery']}==set(VIEWS)and r['pendingViews']==[]for r in kept)
 assert sum(g['qualityApproved']is True for r in kept for g in r['gallery'])==m['qualityApproved']==index['qualityApprovedCount']
 assert pricing['modules']==oldPricing['modules'];oldBOM={r['sku']:r['bom']for r in oldPricing['placements']}
 assert pricing['placements']==[r for r in oldPricing['placements']if r['sku']not in LAYOUTS]
 for r in pricing['placements']:assert r['bom']==oldBOM[r['sku']]
 generated=integrity_result(before,content,m)
 for n,r in m['resultIntegrity'].items():assert len(generated[n])==r['bytes']and sha(generated[n])==r['sha256'],n
 delta=sum(len(b)-(sofa/safe(n)).stat().st_size if(sofa/safe(n)).exists()else len(b)for n,b in {**content,**generated}.items())-sum(r['bytes']for r in retired.values());assert delta==m['expectedSiteByteDelta']
 actualBefore=sum(f.stat().st_size for f in site.rglob('*')if f.is_file());assert actualBefore+delta<1000000000
 for n,b in {**content,**generated}.items():
  dest=sofa/safe(n);dest.parent.mkdir(parents=True,exist_ok=True);tmp=dest.with_name(dest.name+'.v193-tmp');tmp.write_bytes(b);os.replace(tmp,dest)
 for n in retired:(sofa/safe(n)).unlink()
 actualAfter=sum(f.stat().st_size for f in site.rglob('*')if f.is_file());assert actualAfter==actualBefore+delta
 for n,h in keptPhotos.items():assert sha((sofa/safe(n)).read_bytes())==h,n
 for n,h in m['protectedFiles'].items():assert sha((sofa/safe(n)).read_bytes())==h,n
 print(json.dumps({'pass':True,'revision':'193-01','removedLayouts':3,'removedVariants':14,'removedExclusivePhotoFiles':70,'layouts':94,'variants':461,'photos':2305,'qualityApproved':m['qualityApproved'],'reviewPending':2305-m['qualityApproved'],'all461RetainedProductAndPhotoObjectsExact':True,'all2305RetainedPhotoFilesExact':True,'allOriginalModelsMaterialsAndBOMsPreserved':True,'sourceMastersDeleted':0,'actualByteDelta':delta,'actualFullSiteBytes':actualAfter}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--site',required=True,type=Path);run(p.parse_args().site.resolve())
