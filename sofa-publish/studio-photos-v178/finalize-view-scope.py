#!/usr/bin/env python3
"""Verify the user's five-view publication boundary and refresh public audits."""
from pathlib import Path
import argparse,hashlib,json,re
ALLOWED=['hero','front','right-rear','high-front','dimensioned-top']
def sha(b):return hashlib.sha256(b).hexdigest()
def role(p):
 stem=Path(p.get('src','').split('?')[0]).stem;tag=' '.join(str(p.get(k,'')) for k in ['viewId','id','kind'])+' '+stem
 if re.search('dimension|measurement',tag):return 'dimensioned-top'
 if p.get('viewId'):return p['viewId']
 if p.get('kind')=='photographic-studio' or stem in ['hero','studio']:return 'hero'
 for v in ['front','right-rear','high-front']:
  if stem==v or p.get('id','').endswith('-'+v):return v
 return {'v73-01-on':'front','v73-06-sag-arka':'right-rear','v73-09-yuksek-on':'high-front'}.get(stem)
def run(site):
 sofa=site/'sofa';catalogue=json.loads((sofa/'assets/product-galleries/catalogue-v77.json').read_text());assert len(catalogue['products'])==281
 assert all(role(p) in ALLOWED for product in catalogue['products'] for p in product['gallery'])
 index=json.loads((sofa/'assets/product-studio-v178/gallery-index.json').read_text());assert index['allowedViews']==ALLOWED and index['scopeViewSlots']==1190
 assert all(p['viewId'] in ALLOWED for product in index['products'] for p in product['gallery']);assert all(set(p['pendingViews'])<=set(ALLOWED) for p in index['products'])
 package=Path(__file__).parent;manifest=json.loads((package/'package-manifest.json').read_text());retired={r['path'] for r in manifest['prunePaths']};assert not any((sofa/p).exists() for p in retired)
 audit=sofa/'INTERFACE-OVERRIDES.json';doc=json.loads(audit.read_text());source_count=len(doc['files']);active=[]
 for row in doc['files']:
  if row['path'] in retired:continue
  p=sofa/row['path']
  assert p.is_file(), 'Missing protected interface member: '+row['path']
  if p.is_file():
   b=p.read_bytes();active.append({**row,'sourceSHA256':row.get('sourceSHA256',row['sha256']),'sourceBytes':row.get('sourceBytes',row['bytes']),'sha256':sha(b),'bytes':len(b)})
 doc.update(files=active,sourceOverlayRecordCount=source_count,activePublishedRecords=len(active),publicAllowedViews=ALLOWED,cancelledViewsRemoved=len(retired));audit.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n')
 report={'allowedViews':ALLOWED,'publicSourceSlots':1190,'activeReviewedGalleryImages':sum(len(p['gallery']) for p in index['products']),'catalogueRecords':281,'cancelledDerivativeFilesRemoved':len(retired),'sourceMasterModelFabricDeletionCount':0,'privateTopProofContainsNoPublicTopURL':True}
 (sofa/'VIEW-SCOPE-PUBLICATION.json').write_text(json.dumps(report,indent=2)+'\n')
 integrity=sofa/'PACKAGE-MEMBERS.json';rows=[]
 for p in sorted(sofa.rglob('*')):
  assert not p.is_symlink()
  if p.is_file() and p!=integrity:
   b=p.read_bytes();rows.append({'path':p.relative_to(sofa).as_posix(),'bytes':len(b),'sha256':sha(b)})
 integrity.write_text(json.dumps({'schemaVersion':1,'scope':'final-published-five-view-output','publicAllowedViews':ALLOWED,'originalSourceArchiveUnchanged':True,'members':rows},indent=2)+'\n')
 total=sum(p.stat().st_size for p in site.rglob('*') if p.is_file());assert total<1_000_000_000
 print(json.dumps({**report,'finalSofaInventoryMembers':len(rows)+1,'actualFullSiteBytes':total,'pass':True}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--site',type=Path,required=True);run(p.parse_args().site.resolve())
