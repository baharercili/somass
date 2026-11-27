#!/usr/bin/env python3
"""Switch the five gallery interface files after the immutable archive is live."""
from pathlib import Path
from urllib.request import Request,urlopen
import argparse,hashlib,json,os,tempfile,re
MAX_SITE=1_000_000_000
TARGETS={'material-gallery.html','assets/material-gallery/v179/gallery.js','assets/material-gallery/v179/gallery.css','assets/material-gallery/v179/metadata.json','assets/material-gallery/v179/manifest.json'}
ARCHIVE_URL='https://baharercili.github.io/somass-room-planner/material-gallery-v179-cfd55e91db46/asset-manifest.json'
ARCHIVE_SHA='42fd76888e1c1dbfebf2ef7968522a43dab8e8e07453af076080bf129892b35b'
PREFIX='/somass-room-planner/material-gallery-v179-cfd55e91db46/'
def require(ok,message):
 if not ok:raise ValueError(message)
def sha(b):return hashlib.sha256(b).hexdigest()
def regular(path):
 require(path.is_file() and not path.is_symlink() and not any(p.is_symlink() for p in path.parents),'Missing or symlinked file: '+str(path))
def verify_files(sofa,records):
 for row in records:
  p=sofa/row['path'];regular(p);b=p.read_bytes();require(len(b)==row['bytes'] and sha(b)==row['sha256'],'Preserved member differs: '+row['path'])
def bytes_in(site):
 total=0
 for p in site.rglob('*'):
  require(not p.is_symlink(),'Symlink in website')
  if p.is_file():total+=p.stat().st_size
 return total
def restore(package,site,asset_loader=None):
 package=package.resolve();site=site.resolve();sofa=site/'sofa';require(sofa.is_dir(),'Restore the existing complete site first')
 control=package/'ui-manifest.json';regular(control);m=json.loads(control.read_text());require(m['format']=='somass-material-gallery-v179-ui-v1' and m['assetManifestURL']==ARCHIVE_URL and m['assetManifestSHA256']==ARCHIVE_SHA,'Gallery identity differs')
 files=m['files'];require(len(files)==5 and {r['path'] for r in files}==TARGETS,'Only the approved five interface files may be written')
 staged={}
 for row in files:
  source=package/'files'/row['path'];regular(source);b=source.read_bytes();require(len(b)==row['bytes'] and sha(b)==row['sha256'],'Gallery source checksum differs');b.decode('utf-8');staged[row['path']]=b
 metadata=json.loads(staged['assets/material-gallery/v179/metadata.json']);embedded=re.search(r'<script[^>]*id=["\']material-data["\'][^>]*>(.*?)</script>',staged['material-gallery.html'].decode(),re.S)
 require(embedded and json.loads(embedded.group(1))==metadata,'Embedded and standalone metadata differ')
 require(len(metadata['materials'])==37 and len({r['id'] for r in metadata['materials']})==37 and len(metadata['families'])==4,'Material catalogue count differs')
 cards={r['materialId']:r for r in metadata['sampleCards']};slots={r['materialId']:r for r in metadata['assetSlots']}
 for material in metadata['materials']:
  images=material['photos']+[cards[material['id']]]+slots[material['id']]['photos'];require(len(images)==31 and len({p['src'] for p in images})==31,'Each material must retain31 genuine distinct views')
 v174=package.parent/'material-gallery-v174/manifest.json';regular(v174);raw=v174.read_bytes();require(sha(raw)=='5b9867ec0e7e73d7902abc8364739df4012620d6b732531a2db54c960a7ab292','V174 source inventory differs')
 protected=[r for r in json.loads(raw)['members'] if r['path']!='material-gallery.html']
 photos=package.parent/'studio-photos-v178/package-manifest.json';regular(photos);photo_manifest=json.loads(photos.read_text());require(photo_manifest['packageType']=='somass-approved-studio-v178','Current sofa photo inventory differs');protected+=photo_manifest['members'];require(not ({p['path'] for p in protected}&TARGETS),'Target would replace a protected asset');verify_files(sofa,protected)
 baseline=sofa/'material-gallery.html';regular(baseline);basebytes=baseline.read_bytes();require(sha(basebytes) in (m['expectedBaseGallery']['sha256'],sha(staged['material-gallery.html'])),'Current published gallery baseline differs')
 if asset_loader:archive_bytes=asset_loader(ARCHIVE_URL)
 else:
  with urlopen(Request(ARCHIVE_URL,headers={'Cache-Control':'no-cache'}),timeout=45) as response:require(response.status==200,'Asset archive unavailable');archive_bytes=response.read()
 require(sha(archive_bytes)==ARCHIVE_SHA,'Live immutable asset archive differs')
 archive=json.loads(archive_bytes);require(archive['immutableAssetSetSHA256']==m['immutableAssetSetSHA256'] and archive['fileCount']==1537 and archive['publicPrefix']==PREFIX,'Live archive identity differs')
 archived={r['path'] for r in archive['files']}|{'material-gallery-v179-cfd55e91db46/asset-manifest.json'};old={r['path'] for r in protected if r['path'].startswith('assets/material-gallery/v174/')}
 def check_refs(value):
  if isinstance(value,dict):
   for v in value.values():check_refs(v)
  elif isinstance(value,list):
   for v in value:check_refs(v)
  elif isinstance(value,str):
   if value.startswith(PREFIX):require(value.removeprefix('/somass-room-planner/') in archived,'Unbound new gallery asset')
   elif value.startswith('assets/material-gallery/v174/'):require(value in old,'Unbound retained V174 asset')
 check_refs(metadata)
 before=bytes_in(site);delta=0
 for row in files:
  target=sofa/row['path']
  for p in target.parents:require(not p.is_symlink(),'Symlinked gallery target parent')
  if target.exists():
   regular(target)
   if row['path']!='material-gallery.html':require(sha(target.read_bytes())==row['sha256'],'New gallery asset collision')
   delta+=row['bytes']-target.stat().st_size
  else:delta+=row['bytes']
 require(before+delta<MAX_SITE,'Assembled website exceeds its byte guard')
 with tempfile.TemporaryDirectory(prefix='.gallery-v179-',dir=site.parent) as temp:
  stage=Path(temp)
  for name,b in staged.items():p=stage/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
  for name in sorted(staged,key=lambda n:(n=='material-gallery.html',n)):
   target=sofa/name;target.parent.mkdir(parents=True,exist_ok=True);os.replace(stage/name,target)
 verify_files(sofa,protected);after=bytes_in(site);require(after==before+delta and after<MAX_SITE,'Final website size differs')
 proof={'pass':True,'writtenInterfaceFiles':5,'materials':37,'viewsPerMaterial':31,'totalGalleryViews':1147,'liveAssetManifestSHA256':ARCHIVE_SHA,'originalV174MembersPreserved':1106,'currentPhotoImagesPreserved':photo_manifest['approvedPhotoCount'],'protectedMembersHashVerifiedBeforeAndAfter':len(protected),'sourceOrModelWrites':0,'deletedFiles':0,'siteBytesBefore':before,'siteBytesAfter':after,'netBytesAdded':delta}
 print(json.dumps(proof,sort_keys=True));return proof
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--site',type=Path,required=True);a=p.parse_args();restore(Path(__file__).resolve().parent,a.site)
