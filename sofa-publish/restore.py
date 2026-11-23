#!/usr/bin/env python3
"""Verify a separate sofa package, then add it beside existing editor/view output."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import tempfile
import zipfile

MAX_SITE_BYTES = 1024 * 1024 * 1024


def safe_name(name):
    if not isinstance(name, str):
        raise ValueError('Invalid member path type')
    path = PurePosixPath(name)
    if (not name or path.is_absolute() or path.as_posix() != name or '..' in path.parts
            or '\\' in name or any(part.startswith('.') for part in path.parts)):
        raise ValueError('Unsafe sofa package path')
    return Path(*path.parts)


def sha256(value):
    return hashlib.sha256(value).hexdigest()


def restore(package_root, site):
    package_root, site = Path(package_root).resolve(), Path(site)
    if any(path.is_symlink() for path in [site, *site.parents]):
        raise ValueError('Website destination must not contain symlinks')
    site = site.resolve()
    if not site.is_dir():
        raise ValueError('Existing editor/view site output is required')
    destination = site / 'sofa'
    if destination.exists() or destination.is_symlink():
        raise ValueError('Refusing to replace an existing sofa publication')
    manifest = json.loads((package_root / 'sofa-source-manifest.json').read_text())
    if manifest.get('schemaVersion') != 1 or manifest.get('application') != 'studio-sofa':
        raise ValueError('Unsupported sofa package manifest')
    if manifest.get('build', {}).get('destination') != '_source/_site/sofa':
        raise ValueError('Unexpected sofa application destination')
    if (not isinstance(manifest.get('archiveBytes'), int) or not 0 < manifest['archiveBytes'] <= MAX_SITE_BYTES
            or not isinstance(manifest.get('memberCount'), int) or not 1 < manifest['memberCount'] <= 30000):
        raise ValueError('Invalid sofa package limits')
    with tempfile.TemporaryDirectory(prefix='.sofa-restore-', dir=site.parent) as temporary:
        work = Path(temporary)
        archive, restored = work / 'sofa-source.zip', work / 'sofa'
        whole, total = hashlib.sha256(), 0
        with archive.open('xb') as output:
            if not isinstance(manifest.get('parts'), list) or not manifest['parts']:
                raise ValueError('Missing sofa package parts')
            for index, item in enumerate(manifest['parts'], 1):
                name = item['name']
                if name != f'sofa-source.part-{index:04d}':
                    raise ValueError('Unexpected or duplicate sofa source part')
                part = package_root / name
                if part.is_symlink() or not part.is_file():
                    raise ValueError('Missing sofa source part')
                digest, size = hashlib.sha256(), 0
                with part.open('rb') as handle:
                    for block in iter(lambda: handle.read(1024 * 1024), b''):
                        output.write(block)
                        digest.update(block)
                        whole.update(block)
                        size += len(block)
                        total += len(block)
                        if total > manifest['archiveBytes']:
                            raise ValueError('Sofa archive exceeds expected size')
                if size != item['bytes'] or digest.hexdigest() != item['sha256']:
                    raise ValueError('Sofa part checksum differs: ' + name)
        if total != manifest['archiveBytes'] or whole.hexdigest() != manifest['archiveSha256']:
            raise ValueError('Sofa archive checksum differs')
        with zipfile.ZipFile(archive) as package:
            integrity = manifest['memberIntegrity']
            if integrity['path'] != 'PACKAGE-MEMBERS.json' or not 0 < integrity['bytes'] <= 20 * 1024 * 1024:
                raise ValueError('Invalid member integrity manifest')
            integrity_bytes = package.read(integrity['path'])
            if len(integrity_bytes) != integrity['bytes'] or sha256(integrity_bytes) != integrity['sha256']:
                raise ValueError('Sofa member integrity manifest differs')
            details = json.loads(integrity_bytes)
            if details.get('schemaVersion') != 1:
                raise ValueError('Unsupported sofa member manifest')
            expected = {item['path']: item for item in details['members']}
            if len(expected) != len(details['members']) or integrity['path'] in expected:
                raise ValueError('Duplicate sofa member integrity records')
            expected[integrity['path']] = integrity
            if len(expected) != manifest['memberCount']:
                raise ValueError('Sofa member count differs')
            if sum(item['bytes'] for item in expected.values()) > MAX_SITE_BYTES:
                raise ValueError('Sofa website exceeds allowed size')
            seen = set()
            restored.mkdir()
            for info in package.infolist():
                name, path, mode = info.filename, safe_name(info.filename), info.external_attr >> 16
                if (name in seen or name not in expected or info.is_dir() or stat.S_ISLNK(mode)
                        or stat.S_IFMT(mode) not in (0, stat.S_IFREG) or info.flag_bits & 1):
                    raise ValueError('Unexpected or unsafe sofa archive member')
                seen.add(name)
                item = expected[name]
                if info.file_size != item['bytes']:
                    raise ValueError('Sofa member size differs: ' + name)
                target, digest = restored / path, hashlib.sha256()
                target.parent.mkdir(parents=True, exist_ok=True)
                with package.open(info) as source, target.open('xb') as output:
                    for block in iter(lambda: source.read(1024 * 1024), b''):
                        digest.update(block)
                        output.write(block)
                if digest.hexdigest() != item['sha256']:
                    raise ValueError('Sofa member checksum differs: ' + name)
            if seen != set(expected):
                raise ValueError('Sofa package members missing')
            for name in ['index.html', 'urun.html', 'kombinasyonlar.html', 'assets/sofa.glb', 'assets/product-galleries/catalogue-v77.json']:
                if name not in seen:
                    raise ValueError('Required sofa application file missing: ' + name)
        restored.rename(destination)
    return {'destination': str(destination), 'verifiedFiles': len(expected), 'archiveSha256': whole.hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package-root', type=Path, default=Path.cwd())
    parser.add_argument('--site', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(restore(args.package_root, args.site)))


if __name__ == '__main__':
    main()
