#!/usr/bin/env python3
"""Package the static sofa app without changing its source or editor geometry."""
import argparse
import difflib
import hashlib
import json
from pathlib import Path
import tempfile
import zipfile

from portability import DEFAULT_PUBLIC_URL, adapt, checked_public_url, overlay_files, patches

INTEGRITY = 'PACKAGE-MEMBERS.json'


def digest(value):
    return hashlib.sha256(value).hexdigest()


def git_blob(value):
    return hashlib.sha1(b'blob ' + str(len(value)).encode() + b'\0' + value).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--public-url', default=DEFAULT_PUBLIC_URL)
    parser.add_argument('--part-bytes', type=int, default=20 * 1024 * 1024)
    args = parser.parse_args()
    source, output = args.source.resolve(), args.output.resolve()
    public_url = checked_public_url(args.public_url)
    if not source.is_dir() or source.is_symlink() or source == output or source in output.parents:
        raise ValueError('Use a separate output directory outside the application source')
    if not 1024 * 1024 <= args.part_bytes <= 50 * 1024 * 1024:
        raise ValueError('Part size must be between 1 MiB and 50 MiB')
    if output.exists() and any(output.iterdir()):
        raise ValueError('Package output must be empty')
    source_files = sorted(source.rglob('*'))
    if any(path.is_symlink() for path in source_files):
        raise ValueError('Symlinks are not accepted in the static application')
    source_files = [path for path in source_files if path.is_file()]
    names = {path.relative_to(source).as_posix() for path in source_files}
    if not set(patches(public_url)) <= names or INTEGRITY in names or set(overlay_files(public_url)) & names:
        raise ValueError('Source does not match the reviewed application layout')
    if any(any(part.startswith('.') for part in Path(name).parts) for name in names):
        raise ValueError('Hidden files must not be included in the publication')
    output.mkdir(parents=True, exist_ok=True)
    members, changed, diff, snapshots = [], [], [], {}
    with tempfile.TemporaryDirectory(prefix='.sofa-package-', dir=output) as temporary:
        archive = Path(temporary) / 'sofa-source.zip'
        with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as package:
            for path in source_files:
                name = path.relative_to(source).as_posix()
                before_stat = path.stat()
                original = path.read_bytes()
                after_stat = path.stat()
                signature = (after_stat.st_size, after_stat.st_mtime_ns)
                if signature != (before_stat.st_size, before_stat.st_mtime_ns):
                    raise ValueError('Source changed while packaging: ' + name)
                snapshots[name] = signature
                content = adapt(name, original, public_url)
                info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                package.writestr(info, content)
                members.append({'path': name, 'bytes': len(content), 'sha256': digest(content)})
                if content != original:
                    changed.append({'path': name, 'sourceSha256': digest(original), 'publishedSha256': digest(content)})
                    diff.extend(difflib.unified_diff(original.decode().splitlines(True), content.decode().splitlines(True), fromfile='a/' + name, tofile='b/' + name))
            for name, content in overlay_files(public_url).items():
                info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                package.writestr(info, content)
                members.append({'path': name, 'bytes': len(content), 'sha256': digest(content)})
                changed.append({'path': name, 'sourceSha256': None, 'publishedSha256': digest(content)})
            integrity_bytes = json_bytes({'schemaVersion': 1, 'members': sorted(members, key=lambda item: item['path'])})
            info = zipfile.ZipInfo(INTEGRITY, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            package.writestr(info, integrity_bytes)
        for name, signature in snapshots.items():
            current = (source / name).stat()
            if signature != (current.st_size, current.st_mtime_ns):
                raise ValueError('Source changed before package completed: ' + name)
        whole, total, parts = hashlib.sha256(), 0, []
        with archive.open('rb') as handle:
            for index in range(1, 10000):
                block = handle.read(args.part_bytes)
                if not block:
                    break
                name = f'sofa-source.part-{index:04d}'
                with (output / name).open('xb') as target:
                    target.write(block)
                total += len(block)
                whole.update(block)
                parts.append({'name': name, 'bytes': len(block), 'sha256': digest(block), 'gitBlobSha1': git_blob(block)})
            else:
                raise ValueError('Too many package parts')
    catalogue = json.loads((source / 'assets/product-galleries/catalogue-v77.json').read_text())
    product_count = len(catalogue['products'])
    gallery_count = sum(len(product.get('gallery', [])) for product in catalogue['products'])
    manifest = {
        'schemaVersion': 1, 'application': 'studio-sofa', 'publicUrl': public_url,
        'archiveBytes': total, 'archiveSha256': whole.hexdigest(), 'partBytes': args.part_bytes,
        'parts': parts, 'memberCount': len(members) + 1,
        'memberIntegrity': {'path': INTEGRITY, 'bytes': len(integrity_bytes), 'sha256': digest(integrity_bytes)},
        'build': {'kind': 'verified-static-app', 'destination': '_source/_site/sofa',
                  'productCount': product_count, 'galleryEntryCount': gallery_count,
                  'sourceFiles': len(source_files), 'siteFiles': len(members),
                  'siteBytes': sum(item['bytes'] for item in members)},
    }
    (output / 'sofa-source-manifest.json').write_bytes(json_bytes(manifest))
    report = {'schemaVersion': 1, 'publicUrl': public_url, 'sourceFileCount': len(source_files),
              'unchangedFileCount': len(source_files) - len(patches(public_url)),
              'sourceFilesModified': len(patches(public_url)), 'addedFileCount': len(overlay_files(public_url)),
              'changes': changed, 'productCount': product_count, 'galleryEntryCount': gallery_count,
              'archiveSha256': whole.hexdigest(), 'archiveBytes': total, 'partCount': len(parts)}
    (output / 'sofa-portability-report.json').write_bytes(json_bytes(report))
    (output / 'sofa-portability.patch').write_text(''.join(diff))
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
