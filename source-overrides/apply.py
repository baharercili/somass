#!/usr/bin/env python3
"""Apply a verified, small UI overlay to the immutable SOMASS source package."""
from pathlib import Path, PurePosixPath
import argparse, copy, hashlib, json, re

MAX_FILE_BYTES = 1_048_576
MAX_TOTAL_BYTES = 4_194_304
FORBIDDEN = ('web-source/view/', 'web-source/vendor/', 'web-source/somass-catalog/', 'web-source/zara-rugs/')
FIXED = {'web-source/initial-plan.js', 'web-source/static-site-config.js', 'web-source/native-file-codec.js', 'web-source/native-file-transport.js'}

def digest(value):
    return hashlib.sha256(value).hexdigest()

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()

def definition(full):
    return {key: value for key, value in full.items() if key != 'siteFiles'}

def read_json(path):
    return json.loads(path.read_text())

def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def safe_path(name):
    item = PurePosixPath(name)
    if not name or not re.fullmatch(r'[A-Za-z0-9._/-]+', name) or item.is_absolute() or item.as_posix() != name or '..' in item.parts or '.git' in item.parts:
        raise ValueError('Unsafe override path: ' + name)
    return Path(*item.parts)

def allowed(name, protected):
    safe_path(name)
    if not name.startswith('web-source/') or name in protected or name in FIXED or name.startswith(FORBIDDEN) or PurePosixPath(name).suffix not in {'.js', '.css', '.html', '.svg', '.json'}:
        raise ValueError('Only interface text sources may be overridden: ' + name)

def assert_no_symlinks(root, relative):
    current = root
    for segment in safe_path(relative).parts:
        current = current / segment
        if current.is_symlink():
            raise ValueError('Override symlink is not allowed: ' + relative)

def apply(source, manifest_path, package_path):
    source, manifest_path, package_path = source.resolve(), manifest_path.resolve(), package_path.resolve()
    overlay, package = read_json(manifest_path), read_json(package_path)
    if overlay.get('schemaVersion') != 1 or overlay['baseArchiveSha256'] != package['archiveSha256']:
        raise ValueError('Override base source package differs')
    integrity = package['memberIntegrity']
    package_members = source / safe_path(integrity['path'])
    if package_members.is_symlink() or digest(package_members.read_bytes()) != integrity['sha256']:
        raise ValueError('Original package member manifest differs')
    base = {entry['path']: entry for entry in read_json(package_members)['members']}
    full = read_json(source / 'full-project-manifest.json')
    summary = read_json(source / 'SOURCE-MANIFEST.json')
    if full['sourcePlanSha256'] != overlay['sourcePlanSha256'] or full['sourcePlanObjects'] != 204 or full['sourcePlanWalls'] != 27 or full['catalogueProducts'] != 309:
        raise ValueError('Plan or catalogue identity differs')
    if digest(canonical(full['protectedCustomerFiles'])) != overlay['protectedCustomerFilesSha256']:
        raise ValueError('Protected customer file identity differs')
    if digest(canonical(definition(full))) != overlay['projectDefinitionSha256']:
        raise ValueError('Immutable project definition differs')
    for name, original in base.items():
        if name.startswith(('editor.assets/', 'web-source/')) or name in {'full-project-manifest.json', 'SOURCE-MANIFEST.json'}:
            continue
        file = source / safe_path(name)
        if file.is_symlink() or digest(file.read_bytes()) != original['sha256']:
            raise ValueError('An immutable source dependency changed: ' + name)
    protected = {'web-source/' + item['path'] for item in full['protectedCustomerFiles']}
    entries, total, payloads = {}, 0, {}
    for entry in overlay['files']:
        name = entry['path']
        allowed(name, protected)
        if name in entries:
            raise ValueError('Duplicate override: ' + name)
        original = base.get(name)
        if entry.get('baseSha256') != (original['sha256'] if original else None):
            raise ValueError('Override original checksum differs: ' + name)
        assert_no_symlinks(manifest_path.parent / 'files', name)
        payload = manifest_path.parent / 'files' / safe_path(name)
        value = payload.read_bytes()
        value.decode('utf-8')
        if b'\0' in value or len(value) > MAX_FILE_BYTES or len(value) != entry['bytes'] or digest(value) != entry['sha256']:
            raise ValueError('Override payload differs or is too large: ' + name)
        total += len(value)
        entries[name], payloads[name] = entry, value
    if total > MAX_TOTAL_BYTES:
        raise ValueError('Interface overlay exceeds four MiB')
    # Check the complete source surface before writing; unlisted edits cannot bypass strict mode.
    web = source / 'web-source'
    current = {}
    for file in web.rglob('*'):
        if file.is_symlink():
            raise ValueError('Source symlink is not allowed')
        if not file.is_file():
            continue
        name = file.relative_to(source).as_posix()
        current[name] = file.read_bytes()
        wanted = entries.get(name)
        original = base.get(name)
        accepted = {wanted['sha256']} if wanted else set()
        if original:
            accepted.add(original['sha256'])
        if digest(current[name]) not in accepted:
            raise ValueError('Unlisted or stale source edit: ' + name)
    if any(name.startswith('web-source/') and name not in current for name in base):
        raise ValueError('An original interface source was deleted')
    for name, value in payloads.items():
        assert_no_symlinks(source, name)
        target = source / safe_path(name)
        target.parent.mkdir(parents=True, exist_ok=True)
        if current.get(name) != value:
            # A replacement avoids changing any immutable file that has other hardlinks.
            temporary = target.with_name(target.name + '.override-new')
            if temporary.exists() or temporary.is_symlink():
                raise ValueError('Override temporary path already exists')
            temporary.write_bytes(value)
            temporary.replace(target)
        current[name] = value
    previous_web = {item['path'] for item in summary['readableSourceFiles'] if item['path'].startswith('web-source/')}
    source_paths = previous_web | {name for name in base if name.startswith('web-source/')} | set(current)
    output_paths = {name.removeprefix('web-source/') for name in source_paths}
    full['siteFiles'] = [item for item in full['siteFiles'] if item['path'] not in output_paths]
    full['siteFiles'].extend({'path': name.removeprefix('web-source/'), 'bytes': len(value), 'sha256': digest(value)} for name, value in current.items())
    full['siteFiles'].sort(key=lambda item: item['path'])
    write_json(source / 'full-project-manifest.json', full)
    readable = {item['path']: item for item in summary['readableSourceFiles'] if item['path'] not in previous_web}
    for name, value in current.items():
        readable[name] = {'path': name, 'bytes': len(value), 'sha256': digest(value)}
    # Refresh every tracked readable record, including the updated full site manifest.
    for name, item in readable.items():
        value = (source / safe_path(name)).read_bytes()
        item.update(bytes=len(value), sha256=digest(value))
    summary['readableSourceFiles'] = sorted(readable.values(), key=lambda item: item['path'])
    summary['allPublishedSiteFiles'] = copy.deepcopy(full['siteFiles'])
    write_json(source / 'SOURCE-MANIFEST.json', summary)
    print(f'Applied {len(entries)} verified UI override(s), {total:,} bytes; 204 objects, 27 walls, 309 products preserved.')
    return len(entries)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path('_source'))
    parser.add_argument('--manifest', type=Path, default=Path(__file__).with_name('manifest.json'))
    parser.add_argument('--package-manifest', type=Path, default=Path('somass-source-manifest.json'))
    args = parser.parse_args()
    apply(args.source, args.manifest, args.package_manifest)
