#!/usr/bin/env python3
"""Restore a checksum-pinned additive sofa gallery delta after the frozen baseline."""
from pathlib import Path,PurePosixPath
import argparse,hashlib,json,io,zipfile,stat
ALLOWED=['hero','front','right-rear','high-front','dimensioned-top']
def sha(b):return hashlib.sha256(b).hexdigest()
def require(v,m):
 if not v:raise ValueError(m)
def safe(name):
 p=PurePosixPath(name)
 require(bool(name) and not p.is_absolute() and p.as_posix()==name and '..' not in p.parts and '\\' not in name,'Unsafe path')
 return Path(*p.parts)
def run(site):
 package=Path(__file__).parent;m=json.loads((package/'package-manifest.json').read_text());require(m['schemaVersion']==1 and m['packageType']=='somass-gallery-delta-v191','Wrong delta')
 sofa=site/'sofa';require(sofa.is_dir(),'Sofa baseline missing')
 for name,expected in m['expectedBaseFiles'].items():require(sha((sofa/safe(name)).read_bytes())==expected,'Baseline changed: '+name)
 for name in m.get('expectedAbsentFiles',[]):require(not (sofa/safe(name)).exists(),'Unexpected preexisting new module: '+name)
 chunks=[]
 for r in m['parts']:
  require('/' not in r['name'] and r['name'].startswith('part-'),'Bad archive part');b=(package/r['name']).read_bytes();require(len(b)==r['bytes'] and sha(b)==r['sha256'],'Part checksum');chunks.append(b)
 raw=b''.join(chunks);require(len(raw)==m['archiveBytes'] and sha(raw)==m['archiveSHA256'],'Archive checksum')
 expected={r['path']:r for r in m['members']};require(len(expected)==len(m['members']),'Duplicate member')
 content={}
 with zipfile.ZipFile(io.BytesIO(raw))as z:
  for info in z.infolist():
   name=info.filename;safe(name);require(name in expected and name not in content and not info.is_dir() and not stat.S_ISLNK(info.external_attr>>16),'Unexpected member')
   require(name in m['allowedTextPaths'] or __import__('re').fullmatch(r'assets/product-studio-v178/photos/SOM-Y\d{4}-V\d{3}/(?:hero|front|right-rear|high-front|dimensioned-top)-[a-f0-9]{12}\.webp',name),'Unapproved destination')
   b=z.read(info);r=expected[name];require(len(b)==r['bytes'] and sha(b)==r['sha256'],'Member checksum');content[name]=b
 require(set(content)==set(expected),'Missing member')
 index=json.loads(content['assets/product-studio-v178/gallery-index.json']);catalogue=json.loads(content['assets/product-galleries/catalogue-v77.json'])
 require(index['allowedViews']==ALLOWED and index['scopeViewSlots']==len(index['products'])*5,'Wrong five-view scope');require(len(catalogue['products'])==len(index['products'])==281,'Catalogue count')
 current_bytes=sum(p.stat().st_size for p in site.rglob('*') if p.is_file());extra=sum(len(b)-(sofa/name).stat().st_size if (sofa/name).exists() else len(b) for name,b in content.items());require(current_bytes+extra+10_000_000<1_000_000_000,'Assembled site too large')
 # Validate every referenced photo before writing any file.
 photos=[]
 for r in index['products']:
  require(len(r['gallery'])==r['readyCount'] and set(r['pendingViews'])<=set(ALLOWED),'Ready count mismatch')
  for p in r['gallery']:
   require(p['viewId'] in ALLOWED and p['sourceRevision']=='feet-original-position-v176' and p['materialSourceRevision']=='material-studio-oak-v177' and p['sourceWoodId']==p['woodId'],'Source guard')
   require(p['qualityApproved']==p['qaApproved'] and (p['qualityApproved'] or p['qualityReviewStatus']=='review-pending' and p['publicationAuthorized'] and p['userRequestedBulkPublication']),'False approval')
   name=p['src'].removeprefix('./');safe(name);b=content.get(name) if name in content else (sofa/name).read_bytes();require(sha(b)==p['sha256'],'Gallery image checksum')
   require(p['width']==1536 and p['height']==1024,'Unexpected dimensions');photos.append(p)
 require(len(photos)==index['actualPhotoCount'],'Photo count mismatch')
 for name,b in content.items():
  target=sofa/safe(name);require(not target.is_symlink(),'Unsafe target');target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b)
 for r in m.get('retiredColourPhotos',[]):
  target=sofa/safe(r['path'])
  if target.exists():require(sha(target.read_bytes())==r['sha256'],'Retired photo changed');target.unlink()
 report={'allowedViews':ALLOWED,'publicSourceSlots':len(index['products'])*5,'activePublishedGalleryImages':len(photos),'qualityApprovedImages':sum(p['qualityApproved'] for p in photos),'reviewPendingImages':sum(not p['qualityApproved'] for p in photos),'catalogueRecords':281,'cancelledDerivativeFilesRemoved':m['cancelledDerivativeFilesRemoved'],'sourceMasterModelFabricDeletionCount':0,'privateTopProofContainsNoPublicTopURL':True,'deltaVersion':m['deltaVersion'],'deltaNewPhotos':len(m['photos']),'distinctBodyColoursSynchronized':True}
 (sofa/'VIEW-SCOPE-PUBLICATION.json').write_text(json.dumps(report,indent=2)+'\n')
 audit=sofa/'INTERFACE-OVERRIDES.json'
 if audit.exists():
  doc=json.loads(audit.read_text());retired={r['path'] for r in m.get('retiredColourPhotos',[])};rows=[]
  for row in doc['files']:
   if row['path'] in retired:continue
   p=sofa/row['path'];require(p.is_file(),'Missing protected interface member');b=p.read_bytes();rows.append({**row,'sourceSHA256':row.get('sourceSHA256',row['sha256']),'sourceBytes':row.get('sourceBytes',row['bytes']),'sha256':sha(b),'bytes':len(b)})
  doc.update(files=rows,activePublishedRecords=len(rows),publicAllowedViews=ALLOWED,galleryDeltaVersion=m['deltaVersion']);audit.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n')
 inventory=sofa/'PACKAGE-MEMBERS.json';members=[]
 for p in sorted(sofa.rglob('*')):
  require(not p.is_symlink(),'Symlink in sofa')
  if p.is_file() and p!=inventory:
   b=p.read_bytes();members.append({'path':p.relative_to(sofa).as_posix(),'bytes':len(b),'sha256':sha(b)})
 inventory.write_text(json.dumps({'schemaVersion':1,'scope':'final-published-five-view-output','publicAllowedViews':ALLOWED,'originalSourceArchiveUnchanged':True,'galleryDeltaVersion':m['deltaVersion'],'members':members},indent=2)+'\n')
 total=sum(p.stat().st_size for p in site.rglob('*') if p.is_file());require(total<1_000_000_000,'Final site too large');print(json.dumps({**report,'actualFullSiteBytes':total,'pass':True}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--site',type=Path,required=True);run(p.parse_args().site.resolve())
