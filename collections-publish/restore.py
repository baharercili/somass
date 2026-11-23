"""Verify and add the collection review beside existing Pages applications."""
from pathlib import Path,PurePosixPath
import argparse,hashlib,json,shutil,stat,tempfile,zipfile

parser=argparse.ArgumentParser();parser.add_argument('--site',required=True);parser.add_argument('--root',default='.')
args=parser.parse_args();root=Path(args.root).resolve();site=Path(args.site).resolve()
manifest=json.loads((root/'collections-web-manifest.json').read_text())
assert manifest['schemaVersion']==1
destination=site/'koleksiyonlar'
if destination.exists():raise ValueError('Collection output already exists; refusing to overwrite it')
def safe(name):
    p=PurePosixPath(name)
    if not name or p.is_absolute()or p.as_posix()!=name or '..'in p.parts or '\\'in name or '.git'in p.parts:
        raise ValueError('Unsafe collection path')
    return Path(*p.parts)
with tempfile.TemporaryDirectory(prefix='collections-')as work:
    archive=Path(work)/'collections.zip';whole=hashlib.sha256();total=0;seen=set()
    with archive.open('wb')as out:
        for part in manifest['parts']:
            name=part['name']
            if '/'in name or not name.startswith('collections-web.part-')or name in seen:raise ValueError('Unexpected part')
            seen.add(name);p=root/safe(name)
            if p.is_symlink():raise ValueError('Part is symlink')
            b=p.read_bytes()
            if len(b)!=part['bytes']or hashlib.sha256(b).hexdigest()!=part['sha256']:raise ValueError('Part checksum differs')
            out.write(b);whole.update(b);total+=len(b)
    if total!=manifest['archiveBytes']or whole.hexdigest()!=manifest['archiveSHA256']:raise ValueError('Archive checksum differs')
    expected={m['path']:m for m in manifest['members']}
    if len(expected)!=len(manifest['members'])or 'index.html'not in expected:raise ValueError('Invalid members')
    target=Path(work)/'site';target.mkdir();seen=set()
    with zipfile.ZipFile(archive)as z:
        for info in z.infolist():
            relative=safe(info.filename);mode=info.external_attr>>16
            if info.filename in seen or info.filename not in expected or info.is_dir()or stat.S_ISLNK(mode):raise ValueError('Unexpected archive member')
            if stat.S_IFMT(mode)not in(0,stat.S_IFREG):raise ValueError('Non-file member')
            seen.add(info.filename);m=expected[info.filename];b=z.read(info)
            if len(b)!=m['bytes']or hashlib.sha256(b).hexdigest()!=m['sha256']:raise ValueError('Member checksum differs')
            p=target/relative;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
    if seen!=set(expected):raise ValueError('Missing archive member')
    site.mkdir(parents=True,exist_ok=True);shutil.copytree(target,destination)
print('Verified and restored collection review:',len(expected),'files; existing applications preserved.')
