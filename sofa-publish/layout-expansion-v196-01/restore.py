from pathlib import Path,PurePosixPath
import argparse,hashlib,io,json,os,re,zipfile

VIEWS={'hero','front','right-rear','high-front','dimensioned-top'}
SKUS={f'SOM-Y{i:04d}'for i in range(98,104)}
PRIMARY=['assets/product-studio-v178/gallery-index.json','assets/product-galleries/catalogue-v77.json','assets/pricing/catalogue-skus.json','assets/pricing/sku-registry.json']
DOCS=['INTERFACE-OVERRIDES.json','VIEW-SCOPE-PUBLICATION.json','PACKAGE-MEMBERS.json']
def sha(b):return hashlib.sha256(b).hexdigest()
def safe(n):
 p=PurePosixPath(n);assert n and not p.is_absolute() and p.as_posix()==n and '..'not in p.parts and '\\'not in n;return Path(*p.parts)
def total(p):return sum(f.stat().st_size for f in p.rglob('*')if f.is_file())
def photos_exact(sofa,rows):
 photos={g['src'].removeprefix('./'):g['sha256']for r in rows for g in r['gallery']};assert len(photos)==2305
 for n,h in photos.items():assert sha((sofa/safe(n)).read_bytes())==h,n
 return photos
def run(site,fixture=False):
 p=Path(__file__).resolve().parent;m=json.loads((p/'manifest.json').read_text());sofa=site/'sofa'
 assert m['type']=='additive-six-sofa-layouts-v196-01'and m['baselineCommit']=='36424935dba41fb59165b7bb311317086ffe3a13'
 assert set(m['newLayoutSKUs'])==SKUS and m['newVariants']==12 and m['newPhotos']==60
 for n,h in m['expectedBaseFiles'].items():
  f=sofa/safe(n);assert f.is_file()and not f.is_symlink();assert sha(f.read_bytes())==h,n
 for n in m['newPaths']:assert not(sofa/safe(n)).exists(),n
 for n,h in m['protectedFiles'].items():assert sha((sofa/safe(n)).read_bytes())==h,n
 before={n:json.loads((sofa/safe(n)).read_bytes())for n in PRIMARY+DOCS};oldIndex=before[PRIMARY[0]];oldCatalogue=before[PRIMARY[1]];oldPricing=before[PRIMARY[2]];oldRegistry=before[PRIMARY[3]]
 assert len(oldIndex['products'])==len(oldCatalogue['products'])==461 and oldIndex['actualPhotoCount']==2305
 assert len({r['product']['layoutSKU']for r in oldIndex['products']})==94
 oldPhotos=photos_exact(sofa,oldIndex['products']);raw=b''
 for part in m['parts']:
  n=part['name'];assert '/'not in n and n.startswith('part-');b=(p/n).read_bytes();assert len(b)==part['bytes']and sha(b)==part['sha256'];raw+=b
 assert len(raw)==m['archiveBytes']and sha(raw)==m['archiveSHA256'];content={}
 with zipfile.ZipFile(io.BytesIO(raw))as z:
  assert len(z.namelist())==len(set(z.namelist()))==len(m['members']);assert set(z.namelist())=={r['path']for r in m['members']}
  for r in m['members']:
   n=r['path'];safe(n);assert n in m['allowedPayloadPaths'];b=z.read(n);assert len(b)==r['bytes']and sha(b)==r['sha256'];content[n]=b
 allowedText=set(m['changedRootFiles'])|set(PRIMARY)|set(DOCS)|set(m.get('additionalAllowedDataFiles',[]))
 newAssetPaths={r['path']for r in m['newPhotoRecords']};assert len(newAssetPaths)==60
 for n in content:assert n in allowedText or n in newAssetPaths,n
 index=json.loads(content[PRIMARY[0]]);catalogue=json.loads(content[PRIMARY[1]]);pricing=json.loads(content[PRIMARY[2]]);registry=json.loads(content[PRIMARY[3]])
 assert index['products'][:461]==oldIndex['products']and catalogue['products'][:461]==oldCatalogue['products']
 assert len(index['products'])==len(catalogue['products'])==473 and index['actualPhotoCount']==2365 and catalogue['productCount']==473 and catalogue['imageCount']==2365
 added=index['products'][461:];addedProducts=catalogue['products'][461:];assert len(added)==12 and {r['product']['layoutSKU']for r in added}==SKUS
 assert {r['key']for r in added}==set(m['newProductKeys'])and {r['variantID']for r in added}==set(m['newVariantIDs'])
 definitions={r['key']:r for r in m['newCanonicalDefinitions']};records={r['path']:r for r in m['newPhotoRecords']}
 for row,product in zip(added,addedProducts):
  assert row['product']==product and row['key']==product['key']and row['variantID']==product['variantID']
  assert row['runtimeState']==product['state']and row['newAuthoredLayout']is True and row['readyCount']==5 and row['pendingViews']==[]
  d=definitions[product['key']]
  for field in ['layoutSKU','variantID','state','modulePlan','moduleBreakdown','dimensions','geometryKey','materials','expectedParts','layoutKey','kind']:assert product[field]==d[field],(product['key'],field)
  assert product['newAuthoredLayout']is True and len(row['gallery'])==5 and {g['viewId']for g in row['gallery']}==VIEWS and product['gallery']==row['gallery']
  for g in row['gallery']:
   n=g['src'].removeprefix('./');assert re.fullmatch(r'assets/product-studio-v178/photos/SOM-Y\d{4}-V\d{3}/(?:hero|front|right-rear|high-front|dimensioned-top)-[a-f0-9]{12}\.avif',n)
   assert n.startswith('assets/product-studio-v178/photos/'+product['variantID']+'/')and n in records and n in content and n not in oldPhotos
   assert sha(content[n])==g['sha256']==records[n]['sha256']and len(content[n])==records[n]['bytes']
   assert g['bodyMaterialId']==product['state']['body']and g['backMaterialId']==product['state']['backFabric']and g['accentMaterialId']==product['state']['accent']and g['woodId']==g['sourceWoodId']==product['woodId']
   assert g['qualityApproved']is False and g['qaApproved']is False and g['qualityReviewStatus']=='review-pending'and g['publicationAuthorized']is True and g['userRequestedBulkPublication']is True and g['sourceEligible']is True
   assert g['sourceRevision']=='feet-original-position-v176'and g['materialSourceRevision']=='material-studio-oak-v177'and g['newLayoutSource']is True and re.fullmatch('[a-f0-9]{64}',g['nativeProofSHA256'])
   assert g['newLayoutCameraContract']['method']=='new-layout-fixed-native-camera-v196'and re.fullmatch('[a-f0-9]{64}',g['newLayoutCameraContract']['sha256'])
   assert records[n]['quality']==(75 if g['viewId']=='hero'else 65)and records[n]['chromaSubsampling']=='4:4:4'
   b=content[n];at=b.find(b'av1C');assert at>=4 and ((b[at+6]>>2)&3)==0
 assert len({r['product']['layoutSKU']for r in index['products']})==100
 assert sum(g['qualityApproved']is True for r in index['products']for g in r['gallery'])==75
 assert pricing['modules']==oldPricing['modules']and pricing['placements'][:93]==oldPricing['placements']and len(pricing['placements'])==99
 assert {r['sku']for r in pricing['placements'][93:]}==SKUS and sum(len(r['variants'])for r in pricing['placements'][93:])==12
 for n in ['cardToPlacementSku','cardToVariantSku']:
  assert all(pricing[n].get(k)==v for k,v in oldPricing[n].items())and set(pricing[n])-set(oldPricing[n])==set(m['newProductKeys'])
 assert registry['moduleSkus']==oldRegistry['moduleSkus']
 for field in ['placementSkus','variantSkus']:assert all(registry[field].get(k)==v for k,v in oldRegistry[field].items())
 assert set(registry['placementSkus'].values())-set(oldRegistry['placementSkus'].values())==SKUS
 assert {r['product']['layoutSKU']for r in index['products']}.isdisjoint({'SOM-Y0083','SOM-Y0095','SOM-Y0097'})
 inventory=json.loads(content['PACKAGE-MEMBERS.json']);oldMembers={r['path']:r for r in before['PACKAGE-MEMBERS.json']['members']};members={r['path']:r for r in inventory['members']};assert set(members)==set(oldMembers)|set(m['newPaths'])
 for n,r in oldMembers.items():
  if n not in content:assert members[n]==r,n
 for n,b in content.items():
  if n!='PACKAGE-MEMBERS.json':assert members[n]['sha256']==sha(b)and members[n]['bytes']==len(b),n
 scope=json.loads(content['VIEW-SCOPE-PUBLICATION.json']);assert scope['activePublishedGalleryImages']==2365 and scope['catalogueRecords']==473 and scope['qualityApprovedImages']==75 and scope['reviewPendingImages']==2290
 delta=sum(len(b)-((sofa/safe(n)).stat().st_size if(sofa/safe(n)).exists()else 0)for n,b in content.items());assert delta==m['expectedSiteByteDelta']
 actualBefore=total(site);assert actualBefore==(m['baselineSofaBytes']if fixture else m['previousVerifiedFullSiteBytes'])
 assert m['previousVerifiedFullSiteBytes']+delta==m['predictedFullSiteBytes']<1000000000
 for n,b in content.items():
  dest=sofa/safe(n);dest.parent.mkdir(parents=True,exist_ok=True);tmp=dest.with_name(dest.name+'.v196-tmp');tmp.write_bytes(b);os.replace(tmp,dest)
 actualAfter=total(site);assert actualAfter==actualBefore+delta
 assert photos_exact(sofa,oldIndex['products'])==oldPhotos
 for n,h in m['protectedFiles'].items():assert sha((sofa/safe(n)).read_bytes())==h,n
 print(json.dumps({'pass':True,'revision':'196-01','layouts':100,'variants':473,'photos':2365,'newLayouts':6,'newVariants':12,'newPhotos':60,'old461ProductAndGalleryRowsExact':True,'old2305PhotoBytesExact':True,'old93RawPricingBOMsAnd11ModulesExact':True,'retired3LayoutsPreserved':True,'sourceModelPBRDeletionCount':0,'actualByteDelta':delta,'actualFullSiteBytes':None if fixture else actualAfter,'predictedFullSiteBytes':m['predictedFullSiteBytes'],'localSofaOnlyFixture':fixture}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--site',required=True,type=Path);p.add_argument('--local-sofa-fixture',action='store_true');a=p.parse_args();run(a.site.resolve(),a.local_sofa_fixture)
