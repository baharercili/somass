#!/usr/bin/env python3
"""Restore only the explicitly reviewed V178 combination subset after V174.

All original models, material galleries and unreplaced combination galleries
remain in the preceding verified baseline. No pruning is performed here.
"""
import argparse,hashlib,io,json,os,re,stat,tempfile,zipfile
from pathlib import Path,PurePosixPath
MAX_ADDITIVE=20_000_000
MAX_SITE=1024*1024*1024
PREFIX='assets/product-studio-v178/'
UI={'urun.html','kombinasyonlar.html','product-gallery.js','studio-catalog-images.js','kombinasyonlar.js','inspiration-catalog.js'}
def require(ok,message):
 if not ok:raise ValueError(message)
def digest(b):return hashlib.sha256(b).hexdigest()
def name_ok(name):
 require(isinstance(name,str) and re.fullmatch(r'[A-Za-z0-9_./-]+',name),'Unsafe member name')
 p=PurePosixPath(name);require(not p.is_absolute() and p.as_posix()==name and all(x not in ('','.','..','.git') for x in name.split('/')),'Unsafe member path')
 require(name in UI or name=='catalogue-refresh-v178.js' or name==PREFIX+'gallery-index.json' or re.fullmatch(re.escape(PREFIX)+r'photos/SOM-Y\d{4}-V\d{3}/[a-z-]+-[0-9a-f]{12}\.webp',name),'Unapproved overlay destination')
 return p
def regular(path,root):
 require(path.is_file() and not path.is_symlink(),'Missing or unsafe file: '+str(path))
 require(not any(p.is_symlink() for p in [path,*path.parents] if p==root or root in p.parents),'Symlink in path')
def members_size(root):
 total=0
 for p in root.rglob('*'):
  require(not p.is_symlink(),'Symlink in assembled website')
  if p.is_file():total+=p.stat().st_size
 return total
def restore(package,site):
 regular(package/'package-manifest.json',package);m=json.loads((package/'package-manifest.json').read_text())
 require(m.get('schemaVersion')==1 and m.get('packageType')=='somass-approved-studio-v178' and m.get('releaseVersion')==181,'Wrong package')
 require(m.get('V174Protected') is True and m.get('prunePaths')==[],'Original assets must remain intact')
 require(0<len(m['parts'])<=16 and len(m['members'])==m['memberCount']<=2048,'Invalid package count')
 archive=bytearray();seen=set()
 for part in m['parts']:
  name=part['name'];require(re.fullmatch(r'part-\d{3}\.bin',name) and name not in seen,'Invalid package part');seen.add(name)
  p=package/name;regular(p,package);b=p.read_bytes();require(len(b)==part['bytes']<=2*1024*1024 and digest(b)==part['sha256'],'Part checksum differs');archive.extend(b)
 require(set(p.name for p in package.glob('part-*.bin'))==seen,'Unexpected package parts')
 require(len(archive)==m['archiveBytes']<=MAX_ADDITIVE and digest(archive)==m['archiveSHA256'],'Archive checksum differs')
 expected={}
 for member in m['members']:
  name=member['path'];name_ok(name);require(name not in expected and type(member['bytes']) is int and 0<member['bytes']<=4*1024*1024 and re.fullmatch(r'[a-f0-9]{64}',member['sha256']),'Invalid member')
  expected[name]=member
 require(UI==set(m['expectedBaseFiles']) and sum(x['bytes'] for x in expected.values())<=MAX_ADDITIVE,'Additive budget or anchor set differs')
 site=site.resolve();require(site.is_dir() and not site.is_symlink(),'Website root missing');sofa=site/'sofa';require(sofa.is_dir() and not sofa.is_symlink(),'Sofa baseline missing')
 for name,basehash in m['expectedBaseFiles'].items():
  p=sofa/name;regular(p,site);require(digest(p.read_bytes()) in (basehash,expected[name]['sha256']),'Pinned current UI baseline differs: '+name)
 before=members_size(site);delta=0
 for name,member in expected.items():
  target=sofa/name
  for parent in target.parents:
   if parent==site:break
   require(not parent.is_symlink() and (not parent.exists() or parent.is_dir()),'Unsafe target parent')
  if target.exists():
   regular(target,site)
   if name not in UI:require(digest(target.read_bytes())==member['sha256'],'New asset collides with existing content')
   delta+=member['bytes']-target.stat().st_size
  else:delta+=member['bytes']
 require(before+delta<MAX_SITE,'Assembled website would exceed Pages size guard')
 with tempfile.TemporaryDirectory(prefix='.studio-v178-',dir=site.parent) as temporary:
  stage=Path(temporary);seen=set()
  with zipfile.ZipFile(io.BytesIO(archive)) as z:
   require(len(z.infolist())==len(expected),'ZIP member count differs')
   for item in z.infolist():
    name=item.filename;name_ok(name);mode=item.external_attr>>16
    require(name in expected and name not in seen and not item.is_dir() and not stat.S_ISLNK(mode) and stat.S_IFMT(mode) in (0,stat.S_IFREG),'Unsafe ZIP member');seen.add(name)
    require(item.file_size==expected[name]['bytes'] and item.compress_type in (zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED),'ZIP member metadata differs')
    b=z.read(item);require(digest(b)==expected[name]['sha256'],'Member checksum differs: '+name)
    if name.endswith('.webp'):require(b[:4]==b'RIFF' and b[8:12]==b'WEBP' and int.from_bytes(b[4:8],'little')+8==len(b),'Invalid WebP envelope')
    else:b.decode('utf-8')
    p=stage/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
  require(seen==set(expected),'Missing ZIP members')
  index=json.loads((stage/PREFIX/'gallery-index.json').read_text());photos=[g for p in index['products'] for g in p['gallery']]
  require(index['version']==178 and index['actualPhotoCount']==index['qualityApprovedCount']==m['approvedPhotoCount']==len(photos)==len(m['photos']),'Approved photo count differs')
  approved={p['candidateId']:p for p in m['photos']};require(len(approved)==len(photos),'Duplicate approved photograph')
  for photo in photos:
   require(photo.get('qaApproved') is True and photo.get('qualityApproved') is True and photo.get('sourceRevision')=='feet-original-position-v176' and photo.get('materialSourceRevision')=='material-studio-oak-v177' and photo.get('sourceWoodId')==photo.get('woodId'),'Unapproved or mismatched source photograph')
   proof=approved[photo['candidateId']];name=photo['src'][2:];require(photo['src'].startswith('./'+PREFIX+'photos/') and expected[name]['sha256']==proof['sha256']==photo['sha256'] and proof['masterSHA256']==photo['masterSHA256'],'Photo binding differs')
   if photo['viewId']=='top':require(proof.get('viewPolicyRevision')=='orthographic-occlusion-v178','Rejected TOP method')
   if photo['viewId']=='high-front':require(proof.get('viewPolicyRevision')=='high-front-occlusion-v178','Rejected high-front method')
   if photo['viewId']=='dimensioned-top':
    dep=approved.get(proof.get('sourceTopCandidateId'));require(dep and dep['view']=='top' and dep.get('viewPolicyRevision')=='orthographic-occlusion-v178' and dep['masterSHA256']==proof.get('sourceTopMasterSHA256') and proof.get('untouchedPhotographChannelDifferences')==0 and re.fullmatch(r'[a-f0-9]{64}',proof.get('externalOverlaySHA256','')),'Dimension overlay dependency differs')
  # Put assets and modules in place before their HTML entry points.
  for name in sorted(expected,key=lambda n:(n in ('urun.html','kombinasyonlar.html'),n)):
   target=sofa/name;target.parent.mkdir(parents=True,exist_ok=True);os.replace(stage/name,target)
 after=members_size(site);require(after==before+delta and after<MAX_SITE,'Final website size differs')
 proof={'status':'pass','approvedPhotos':len(photos),'replacedVariants':m['replacedVariantCount'],'members':len(expected),'siteBytesBefore':before,'siteBytesAfter':after,'netBytesAdded':delta,'prunedFiles':0,'V174Writes':0,'packageSHA256':digest((package/'package-manifest.json').read_bytes())}
 print(json.dumps(proof,sort_keys=True));return proof
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--site',type=Path,required=True);args=p.parse_args();restore(Path(__file__).resolve().parent,args.site)
