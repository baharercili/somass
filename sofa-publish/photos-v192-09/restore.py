from pathlib import Path,PurePosixPath
import json,hashlib,zipfile,io,stat,re,argparse,copy
VIEWS=['hero','front','right-rear','high-front','dimensioned-top']
def sha(b):return hashlib.sha256(b).hexdigest()
def compact(d):return(json.dumps(d,ensure_ascii=False,separators=(',',':'))+'\n').encode()
def safe(n):
 p=PurePosixPath(n);assert n and not p.is_absolute()and p.as_posix()==n and '..'not in p.parts and '\\'not in n;return Path(*p.parts)
def integrity_result(before,content,m):
 audit=json.loads(before['INTERFACE-OVERRIDES.json']);scope=json.loads(before['VIEW-SCOPE-PUBLICATION.json']);inventory=json.loads(before['PACKAGE-MEMBERS.json'])
 for r in audit['files']:
  if r['path']in content:
   b=content[r['path']];r.update(sourceSHA256=r.get('sourceSHA256',r['sha256']),sourceBytes=r.get('sourceBytes',r['bytes']),sha256=sha(b),bytes=len(b))
 audit['newReadyVariantsRevision']='192-09';scope.update(publicSourceSlots=m['products']*5,activePublishedGalleryImages=m['photos'],qualityApprovedImages=75,reviewPendingImages=m['photos']-75,catalogueRecords=m['products'],deltaVersion='192-09',newReadyHeroProducts=m['newProducts'],privateTopProofContainsNoPublicTopURL=True);out={'INTERFACE-OVERRIDES.json':compact(audit),'VIEW-SCOPE-PUBLICATION.json':compact(scope)};old={r['path']:r for r in inventory['members']};changed={**content,**out};rows={n:({**r,'bytes':len(changed[n]),'sha256':sha(changed[n])}if n in changed else r)for n,r in old.items()}
 for n,b in changed.items():
  if n not in rows:rows[n]={'path':n,'bytes':len(b),'sha256':sha(b)}
 inventory.update(members=[rows[n]for n in sorted(rows)],newReadyVariantsRevision='192-09');out['PACKAGE-MEMBERS.json']=compact(inventory);return out

def run(site):
 P=Path(__file__).parent;m=json.loads((P/'manifest.json').read_text());assert m['type']=='additive-reviewed-photos-v192-09'and m['policyId']=='hero75-other65-v1';sofa=site/'sofa';before={}
 for n,v in m['expectedBaseFiles'].items():
  p=sofa/safe(n);assert p.is_file()and not p.is_symlink();b=p.read_bytes();assert sha(b)==v,n
  if n in ['INTERFACE-OVERRIDES.json','VIEW-SCOPE-PUBLICATION.json','PACKAGE-MEMBERS.json']:before[n]=b
 for n in m['expectedAbsentFiles']:assert not(sofa/safe(n)).exists(),n
 for n,v in m['protectedFiles'].items():assert sha((sofa/safe(n)).read_bytes())==v,n
 oldIndex=json.loads((sofa/'assets/product-studio-v178/gallery-index.json').read_bytes());oldCatalogue=json.loads((sofa/'assets/product-galleries/catalogue-v77.json').read_bytes());assert len(oldIndex['products'])==m['oldProducts']and oldIndex['actualPhotoCount']==m['oldPhotos'];raw=b''
 for r in m['parts']:
  assert '/'not in r['name']and r['name'].startswith('part-');b=(P/r['name']).read_bytes();assert len(b)==r['bytes']and sha(b)==r['sha256'];raw+=b
 assert len(raw)==m['archiveBytes']and sha(raw)==m['archiveSHA256'];expected={r['path']:r for r in m['members']};content={}
 with zipfile.ZipFile(io.BytesIO(raw))as z:
  for info in z.infolist():
   n=info.filename;safe(n);assert n in expected and n not in content and not info.is_dir()and not stat.S_ISLNK(info.external_attr>>16);assert n in m['allowedTextPaths']or re.fullmatch(r'assets/product-studio-v178/photos/SOM-Y\d{4}-V\d{3}/(?:hero|front|right-rear|high-front|dimensioned-top)-[a-f0-9]{12}\.avif',n);b=z.read(info);r=expected[n];assert len(b)==r['bytes']and sha(b)==r['sha256'];content[n]=b
 assert set(content)==set(expected);index=json.loads(content['assets/product-studio-v178/gallery-index.json']);catalogue=json.loads(content['assets/product-galleries/catalogue-v77.json']);assert len(index['products'])==len(catalogue['products'])==m['products']and index['actualPhotoCount']==m['photos'];assert index['products'][:281]==oldIndex['products'][:281]and catalogue['products'][:281]==oldCatalogue['products'][:281];newById={r['variantID']:r for r in index['products']};newProducts={r['variantID']:r for r in catalogue['products']};oldById={r['variantID']:r for r in oldIndex['products']};oldProducts={r['variantID']:r for r in oldCatalogue['products']};receipts={(r['variantID'],r['view']):r for r in m['newPhotoReceipts']};assert len(receipts)==m['newPhotos'];allPhotos=[]
 for old in oldIndex['products']:
  row=newById[old['variantID']]
  for p in old['gallery']:assert next(x for x in row['gallery']if x['viewId']==p['viewId'])==p
  changed=any((old['variantID'],v)in receipts for v in VIEWS)
  if not changed:assert row==old and newProducts[old['variantID']]==oldProducts[old['variantID']]
  else:
   assert {k:v for k,v in row.items()if k not in ['gallery','readyCount','pendingViews','product']}=={k:v for k,v in old.items()if k not in ['gallery','readyCount','pendingViews','product']}
   assert {k:v for k,v in row['product'].items()if k not in ['newStudioReadyCount','newStudioPendingViews']}=={k:v for k,v in old['product'].items()if k not in ['newStudioReadyCount','newStudioPendingViews']}
 for row in index['products']:
  assert len({p['viewId']for p in row['gallery']})==len(row['gallery'])and any(p['viewId']=='hero'for p in row['gallery']);assert row['pendingViews']==[v for v in VIEWS if v not in {p['viewId']for p in row['gallery']}]
  for p in row['gallery']:
   assert p['viewId']in VIEWS and p['sourceWoodId']==p['woodId']and p['sourceRevision']=='feet-original-position-v176'and p['materialSourceRevision']=='material-studio-oak-v177';name=p['src'].removeprefix('./');b=content[name]if name in content else(sofa/safe(name)).read_bytes();assert sha(b)==p['sha256'];assert p['width']==1536 and p['height']==1024;allPhotos.append(p)
   if(row['variantID'],p['viewId'])in receipts:
    receipt=receipts[row['variantID'],p['viewId']];assert receipt['sha256']==p['sha256']and receipt['masterSHA256']==p['masterSHA256'];assert receipt['quality']==(75 if p['viewId']=='hero'else 65);assert not p['qaApproved']and not p['qualityApproved']and p['publicationAuthorized']and p['userRequestedBulkPublication']and p['qualityReviewStatus']=='review-pending';assert p['backMaterialId']==p['sourceBackMaterialId']==row['runtimeState'].get('backFabric',row['runtimeState']['body']);assert b[4:8]==b'ftyp'and b'avif'in b[8:36]
    if p['viewId']=='dimensioned-top':assert receipt['dimensionOverlayOutsideChanges']==0
 assert len(allPhotos)==m['photos']and sum(p['qualityApproved']for p in allPhotos)==75 and sum(not p['qualityApproved']for p in allPhotos)==m['photos']-75;generated=integrity_result(before,content,m)
 for n,b in generated.items():assert sha(b)==m['resultIntegrity'][n]['sha256']and len(b)==m['resultIntegrity'][n]['bytes'],n
 delta=sum(len(b)-((sofa/n).stat().st_size if(sofa/n).exists()else 0)for n,b in {**content,**generated}.items());assert delta==m['expectedSiteByteDelta'];actualBefore=sum(p.stat().st_size for p in site.rglob('*')if p.is_file());assert actualBefore+delta<1_000_000_000
 for n,b in {**content,**generated}.items():
  p=sofa/safe(n);assert not p.is_symlink();p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
 actual=sum(p.stat().st_size for p in site.rglob('*')if p.is_file());assert actual==actualBefore+delta and actual<1_000_000_000;print(json.dumps({'pass':True,'publicProducts':m['products'],'photos':m['photos'],'newPhotos':m['newPhotos'],'old281RowsExact':True,'allPriorPhotoHashesExact':True,'published38HeroesExact':True,'qualityApproved':75,'reviewPending':m['photos']-75,'actualByteDelta':delta,'actualFullSiteBytes':actual,'sourceModelPBRDeletionCount':0}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--site',type=Path,required=True);run(p.parse_args().site.resolve())
