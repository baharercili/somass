from pathlib import Path,PurePosixPath
import hashlib,json,argparse,zipfile,io,stat,re
def sha(b):return hashlib.sha256(b).hexdigest()
def safe(n):
 p=PurePosixPath(n);assert n and not p.is_absolute()and p.as_posix()==n and '..'not in p.parts and '\\'not in n;return Path(*p.parts)
def run(site):
 package=Path(__file__).parent;m=json.loads((package/'manifest.json').read_text());assert m['schemaVersion']==1 and m['type']=='review-pending-avif-heroes-v192-02';sofa=site/'sofa'
 for n,v in m['expectedBaseFiles'].items():assert sha((sofa/safe(n)).read_bytes())==v,n
 for n in m['expectedAbsentFiles']:assert not(sofa/safe(n)).exists(),n
 for n,v in m['protectedFiles'].items():assert sha((sofa/safe(n)).read_bytes())==v,n
 old_index=json.loads((sofa/'assets/product-studio-v178/gallery-index.json').read_text());old_catalogue=json.loads((sofa/'assets/product-galleries/catalogue-v77.json').read_text());assert len(old_index['products'])==len(old_catalogue['products'])==281 and old_index['actualPhotoCount']==1405
 chunks=[]
 for r in m['parts']:
  assert '/'not in r['name']and r['name'].startswith('part-');b=(package/r['name']).read_bytes();assert len(b)==r['bytes']and sha(b)==r['sha256'];chunks.append(b)
 raw=b''.join(chunks);assert len(raw)==m['archiveBytes']and sha(raw)==m['archiveSHA256'];expected={r['path']:r for r in m['members']};assert len(expected)==len(m['members']);content={}
 with zipfile.ZipFile(io.BytesIO(raw))as z:
  for info in z.infolist():
   n=info.filename;safe(n);assert n in expected and n not in content and not info.is_dir()and not stat.S_ISLNK(info.external_attr>>16);assert n in m['allowedTextPaths']or re.fullmatch(r'assets/product-studio-v178/photos/SOM-Y\d{4}-V\d{3}/(?:hero|front|right-rear|high-front|dimensioned-top)-[a-f0-9]{12}\.avif',n);b=z.read(info);r=expected[n];assert len(b)==r['bytes']and sha(b)==r['sha256'];content[n]=b
 assert set(content)==set(expected);index=json.loads(content['assets/product-studio-v178/gallery-index.json']);catalogue=json.loads(content['assets/product-galleries/catalogue-v77.json']);assert index['products'][:281]==old_index['products']and catalogue['products'][:281]==old_catalogue['products'];assert len(index['products'])==len(catalogue['products'])==292 and index['actualPhotoCount']==1416 and index['scopeViewSlots']==1460
 all_photos=[];old_ids=set(m['oldVariantIDs']);new=index['products'][281:];assert len(new)==11
 for row in index['products']:
  for p in row['gallery']:
   assert p['viewId']in m['allowedViews']and p['sourceWoodId']==p['woodId']and p['sourceRevision']=='feet-original-position-v176'and p['materialSourceRevision']=='material-studio-oak-v177';name=p['src'].removeprefix('./');safe(name);b=content[name]if name in content else(sofa/name).read_bytes();assert sha(b)==p['sha256'];assert p['width']==1536 and p['height']==1024;all_photos.append(p)
 for row in new:
  assert row['runtimeState'].get('backFabric',row['runtimeState']['body'])==row['runtimeState']['body'] and row['variantID']not in ['SOM-Y0001-V006','SOM-Y0002-V005']
  assert row['variantID']not in old_ids and row['product']['sourceProductKey']in {r['key']for r in old_index['products']};assert len(row['gallery'])==1 and row['gallery'][0]['viewId']=='hero';p=row['gallery'][0];assert not p['qaApproved']and not p['qualityApproved']and p['qualityReviewStatus']=='review-pending'and p['publicationAuthorized']and p['userRequestedBulkPublication'];assert p['backMaterialId']==p['sourceBackMaterialId']==row['runtimeState'].get('backFabric',row['runtimeState']['body']);b=content[p['src'].removeprefix('./')];assert b[4:8]==b'ftyp'and b'avif'in b[8:36]
 assert len(all_photos)==1416 and sum(p['qualityApproved']for p in all_photos)==75 and sum(not p['qualityApproved']for p in all_photos)==1341
 before=sum(p.stat().st_size for p in site.rglob('*')if p.is_file());extra=sum(len(b)-((sofa/n).stat().st_size if(sofa/n).exists()else 0)for n,b in content.items());assert before+extra+5_000_000<1_000_000_000
 for n,b in content.items():
  target=sofa/safe(n);assert not target.is_symlink();target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b)
 scope=json.loads((sofa/'VIEW-SCOPE-PUBLICATION.json').read_text());scope.update(publicSourceSlots=1460,activePublishedGalleryImages=1416,qualityApprovedImages=75,reviewPendingImages=1341,catalogueRecords=292,deltaVersion='192-02',newReadyHeroProducts=11,privateTopProofContainsNoPublicTopURL=True);(sofa/'VIEW-SCOPE-PUBLICATION.json').write_text(json.dumps(scope,indent=2)+'\n')
 audit=sofa/'INTERFACE-OVERRIDES.json';doc=json.loads(audit.read_text())
 for r in doc['files']:
  if r['path']in content:
   b=content[r['path']];r.update(sourceSHA256=r.get('sourceSHA256',r['sha256']),sourceBytes=r.get('sourceBytes',r['bytes']),sha256=sha(b),bytes=len(b))
 doc['newReadyVariantsRevision']='192-02';audit.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n');inventory=sofa/'PACKAGE-MEMBERS.json';rows=[]
 for p in sorted(sofa.rglob('*')):
  assert not p.is_symlink()
  if p.is_file()and p!=inventory:
   b=p.read_bytes();rows.append({'path':p.relative_to(sofa).as_posix(),'bytes':len(b),'sha256':sha(b)})
 prior=json.loads(inventory.read_text());prior.update(members=rows,newReadyVariantsRevision='192-02');inventory.write_text(json.dumps(prior,indent=2)+'\n');total=sum(p.stat().st_size for p in site.rglob('*')if p.is_file());assert total<1_000_000_000;print(json.dumps({'pass':True,'publicProducts':292,'photos':1416,'newHeroProducts':11,'old281RowsExact':True,'old1405PhotoHashesExact':True,'qualityApproved':75,'reviewPending':1341,'sourceModelPBRDeletionCount':0,'actualFullSiteBytes':total}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--site',type=Path,required=True);run(p.parse_args().site.resolve())
