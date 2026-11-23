#!/usr/bin/env python3
"""Verify a separate sofa package, then add it beside existing editor/view output."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import tempfile
import zipfile

MAX_SITE_BYTES = 1024 * 1024 * 1024
INTERFACE_FILES = frozenset({'kombinasyonlar.html', 'kombinasyonlar.css', 'kombinasyonlar.js'})
MAX_INTERFACE_BYTES = 2 * 1024 * 1024


def regular_source(path, root):
    """Overlay sources must stay within the checkout without following symlinks."""
    relative = path.relative_to(root)
    current = root
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError('Symlink in sofa interface source')
    if not path.is_file():
        raise ValueError('Missing sofa interface source')


def interface_integer(value, maximum):
    return type(value) is int and 0 < value <= maximum


def interface_digest(value):
    return isinstance(value, str) and re.fullmatch(r'[0-9a-f]{64}', value) is not None


def apply_interface_overrides(package_root, restored, manifest, expected):
    """Apply a small allowlisted patch only after both base and patch verify."""
    control = package_root / 'sofa-publish' / 'interface-overrides.json'
    if not control.exists() and not control.is_symlink():
        return 0
    regular_source(control, package_root)
    if not 0 < control.stat().st_size <= 64 * 1024:
        raise ValueError('Invalid sofa interface manifest size')
    overlay = json.loads(control.read_bytes().decode('utf-8'))
    if (not isinstance(overlay, dict)
            or set(overlay) != {'schemaVersion', 'application', 'baseArchiveSha256', 'files'}
            or overlay['schemaVersion'] != 1
            or overlay['application'] != 'studio-sofa-interface'
            or overlay['baseArchiveSha256'] != manifest['archiveSha256']):
        raise ValueError('Sofa interface base package differs')
    files = overlay['files']
    if not isinstance(files, list) or not 1 <= len(files) <= len(INTERFACE_FILES):
        raise ValueError('Invalid sofa interface file list')
    changes, seen = [], set()
    for item in files:
        if (not isinstance(item, dict)
                or set(item) != {'path', 'expectedBaseSha256', 'expectedBaseBytes', 'sha256', 'bytes'}):
            raise ValueError('Invalid sofa interface file record')
        name = item['path']
        if not isinstance(name, str) or name not in INTERFACE_FILES or name in seen:
            raise ValueError('Unexpected or duplicate sofa interface file')
        seen.add(name)
        if (not interface_integer(item['expectedBaseBytes'], MAX_INTERFACE_BYTES)
                or not interface_integer(item['bytes'], MAX_INTERFACE_BYTES)
                or not interface_digest(item['expectedBaseSha256'])
                or not interface_digest(item['sha256'])):
            raise ValueError('Invalid sofa interface file limits')
        original = expected.get(name)
        if (not original or original['bytes'] != item['expectedBaseBytes']
                or original['sha256'] != item['expectedBaseSha256']):
            raise ValueError('Sofa interface base member differs: ' + name)
        installed = restored / name
        original_content = installed.read_bytes()
        if len(original_content) != item['expectedBaseBytes'] or sha256(original_content) != item['expectedBaseSha256']:
            raise ValueError('Restored sofa interface base differs: ' + name)
        source = package_root / 'sofa-publish' / 'interface-overrides' / name
        regular_source(source, package_root)
        if source.stat().st_size != item['bytes']:
            raise ValueError('Sofa interface source size differs: ' + name)
        content = source.read_bytes()
        content.decode('utf-8')
        if len(content) != item['bytes'] or sha256(content) != item['sha256']:
            raise ValueError('Sofa interface source checksum differs: ' + name)
        changes.append((name, content, item))
    audit_name = 'INTERFACE-OVERRIDES.json'
    if audit_name in expected:
        raise ValueError('Sofa interface audit member already exists')
    # Validation above reads every payload before any patch is installed. The
    # destination is still private temporary output until restore's final rename.
    for name, content, item in changes:
        (restored / name).write_bytes(content)
        if sha256((restored / name).read_bytes()) != item['sha256']:
            raise ValueError('Installed sofa interface checksum differs')
        expected[name] = {'path': name, 'bytes': len(content), 'sha256': item['sha256']}
    audit = {'schemaVersion': 1, 'baseArchiveSha256': manifest['archiveSha256'],
             'baseMemberIntegrity': manifest['memberIntegrity'], 'files': files}
    audit_content = (json.dumps(audit, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    (restored / audit_name).write_bytes(audit_content)
    expected[audit_name] = {'path': audit_name, 'bytes': len(audit_content), 'sha256': sha256(audit_content)}
    integrity_name = 'PACKAGE-MEMBERS.json'
    installed_details = {'schemaVersion': 1, 'members': sorted(
        (item for name, item in expected.items() if name != integrity_name), key=lambda item: item['path'])}
    integrity_content = (json.dumps(installed_details, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    if sum(item['bytes'] for name, item in expected.items() if name != integrity_name) + len(integrity_content) > MAX_SITE_BYTES:
        raise ValueError('Patched sofa website exceeds allowed size')
    (restored / integrity_name).write_bytes(integrity_content)
    expected[integrity_name] = {'path': integrity_name, 'bytes': len(integrity_content), 'sha256': sha256(integrity_content)}
    return len(changes)


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
        interface_count = apply_interface_overrides(package_root, restored, manifest, expected)
        restored.rename(destination)
    result = {'destination': str(destination), 'verifiedFiles': len(expected), 'archiveSha256': whole.hexdigest()}
    if interface_count:
        result['interfaceOverrides'] = interface_count
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package-root', type=Path, default=Path.cwd())
    parser.add_argument('--site', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(restore(args.package_root, args.site)))


if __name__ == '__main__':
    main()
