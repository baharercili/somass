#!/usr/bin/env python3
"""Validate a V174 gallery-only package, then atomically switch its HTML.

Python standard library only. This does not restore or alter the sofa model,
the existing sofa restorer, Pages workflow, or any neighbouring application.
"""
import argparse
from collections import Counter
import hashlib
from html.parser import HTMLParser
import json
import math
import os
from pathlib import Path, PurePosixPath
import re
import stat
import struct
import tempfile
import xml.etree.ElementTree as ET
import zipfile
import zlib

PACKAGE_TYPE = 'somass-material-gallery-v174'
EXPECTED_BASE_SHA256 = 'dba95a06a6640fee4c6ad2512ba0821b27a42f1bc2df3814a6470b455d476eb9'
EXPECTED_BASE_BYTES = 339166
MAX_PACKAGE_BYTES = 250 * 1024 * 1024
MAX_SITE_BYTES = 1024 * 1024 * 1024
MAX_FILES = 1200
MAX_PARTS = 256
MAX_MANIFEST_BYTES = 2 * 1024 * 1024
MAX_TEXT_BYTES = 8 * 1024 * 1024
MAX_RASTER_PIXELS = 40_000_000
ASSET_PREFIX = 'assets/material-gallery/v174/'
HASH = re.compile(r'[0-9a-f]{64}\Z')
PART = re.compile(r'part-[0-9]{3,}\.bin\Z')
SAFE = re.compile(r'[A-Za-z0-9_./-]+\Z')
MEDIA = {'.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
         '.json': 'application/json', '.js': 'application/javascript',
         '.css': 'text/css', '.html': 'text/html'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def integer(value, label, minimum=0, maximum=MAX_PACKAGE_BYTES):
    require(type(value) is int and minimum <= value <= maximum, 'Invalid ' + label)
    return value


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_digest(path):
    h = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def checked_hash(value, label):
    require(isinstance(value, str) and HASH.fullmatch(value), 'Invalid ' + label)
    return value


def exact_keys(value, keys, label):
    require(isinstance(value, dict) and set(value) == set(keys), 'Unexpected ' + label + ' fields')


def json_no_duplicates(data):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'Duplicate JSON key: ' + str(key))
            result[key] = value
        return result
    def invalid(value):
        raise ValueError('Non-finite JSON number: ' + value)
    result = json.loads(data, object_pairs_hook=pairs, parse_constant=invalid)
    def finite(value):
        if isinstance(value, float):
            require(math.isfinite(value), 'Non-finite JSON numeric value')
        elif isinstance(value, dict):
            for item in value.values():
                finite(item)
        elif isinstance(value, list):
            for item in value:
                finite(item)
    finite(result)
    return result


def safe_member(name):
    require(isinstance(name, str) and SAFE.fullmatch(name), 'Unsafe member path')
    p = PurePosixPath(name)
    require(not p.is_absolute() and p.as_posix() == name and
            all(part not in ('', '.', '..', '.git') for part in name.split('/')),
            'Non-canonical member path: ' + name)
    require(name == 'material-gallery.html' or name.startswith(ASSET_PREFIX),
            'Outside gallery-only scope: ' + name)
    require(p.suffix in MEDIA and len(name) <= 240, 'Unsupported member extension/path')
    return p


def regular_file(path, label):
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and not stat.S_ISLNK(info.st_mode),
            'Expected regular non-symlink ' + label)
    return info


def no_symlink_chain(path, allow_missing=False):
    absolute = Path(os.path.abspath(path))
    for item in [*reversed(absolute.parents), absolute]:
        try:
            info = item.lstat()
        except FileNotFoundError:
            require(allow_missing, 'Missing target ancestor: ' + str(item))
            continue
        require(not stat.S_ISLNK(info.st_mode), 'Symlink target/ancestor: ' + str(item))
        if item != absolute:
            require(stat.S_ISDIR(info.st_mode), 'Non-directory target ancestor: ' + str(item))
    return absolute


def raster_dimensions(width, height):
    integer(width, 'raster width', 1, 8192)
    integer(height, 'raster height', 1, 8192)
    require(width * height <= MAX_RASTER_PIXELS, 'Raster pixel limit exceeded')
    return {'width': width, 'height': height}


def png_metadata(data):
    require(data.startswith(b'\x89PNG\r\n\x1a\n'), 'Invalid PNG signature')
    cursor, header, image_data, ended = 8, None, False, False
    while cursor < len(data):
        require(cursor + 12 <= len(data), 'Truncated PNG chunk')
        size, = struct.unpack_from('>I', data, cursor)
        tag = data[cursor + 4:cursor + 8]
        end = cursor + 8 + size
        require(end + 4 <= len(data), 'PNG chunk exceeds file')
        payload = data[cursor + 8:end]
        crc, = struct.unpack_from('>I', data, end)
        require(zlib.crc32(tag + payload) & 0xffffffff == crc, 'PNG CRC differs')
        require(tag not in (b'acTL', b'fcTL', b'fdAT'), 'Animated PNG not allowed')
        if header is None:
            require(tag == b'IHDR' and size == 13, 'PNG must start with one IHDR')
            w, h, bits, colour, compression, filtering, interlace = struct.unpack('>IIBBBBB', payload)
            valid_depths = {0: (1, 2, 4, 8, 16), 2: (8, 16), 3: (1, 2, 4, 8), 4: (8, 16), 6: (8, 16)}
            require(colour in valid_depths and bits in valid_depths[colour] and
                    compression == filtering == 0 and interlace in (0, 1), 'Invalid PNG IHDR')
            header = raster_dimensions(w, h)
        else:
            require(tag != b'IHDR', 'Duplicate PNG IHDR')
        if tag == b'IDAT':
            image_data = image_data or size > 0
        elif tag == b'IEND':
            require(size == 0 and end + 4 == len(data), 'PNG IEND/trailing data invalid')
            ended = True
        elif not (tag[0] & 32):
            require(tag in (b'IHDR', b'PLTE'), 'Unknown critical PNG chunk')
        cursor = end + 4
    require(header is not None and image_data and ended, 'Incomplete PNG image')
    return header


def webp_metadata(data):
    require(len(data) >= 30 and data[:4] == b'RIFF' and data[8:12] == b'WEBP' and
            int.from_bytes(data[4:8], 'little') == len(data) - 8, 'Invalid WebP RIFF')
    cursor, frames, canvas, dims = 12, 0, None, None
    while cursor < len(data):
        require(cursor + 8 <= len(data), 'Truncated WebP chunk')
        tag = data[cursor:cursor + 4]
        size = int.from_bytes(data[cursor + 4:cursor + 8], 'little')
        start, end = cursor + 8, cursor + 8 + size
        require(end + (size & 1) <= len(data) and tag not in (b'ANIM', b'ANMF'),
                'Truncated or animated WebP')
        chunk = data[start:end]
        if tag == b'VP8X':
            require(size == 10 and canvas is None and frames == 0 and not(chunk[0] & 2),
                    'Invalid WebP extended canvas')
            canvas = (int.from_bytes(chunk[4:7], 'little') + 1,
                      int.from_bytes(chunk[7:10], 'little') + 1)
        elif tag == b'VP8 ':
            require(size >= 10 and chunk[3:6] == b'\x9d\x01\x2a' and not(chunk[0] & 1),
                    'Invalid WebP VP8 key frame')
            dims = (int.from_bytes(chunk[6:8], 'little') & 0x3fff,
                    int.from_bytes(chunk[8:10], 'little') & 0x3fff)
            frames += 1
        elif tag == b'VP8L':
            require(size >= 5 and chunk[0] == 0x2f, 'Invalid lossless WebP frame')
            bits = int.from_bytes(chunk[1:5], 'little')
            require(bits >> 29 == 0, 'Unsupported lossless WebP version')
            dims = ((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
            frames += 1
        cursor = end + (size & 1)
    require(frames == 1 and dims is not None and (canvas is None or canvas == dims),
            'WebP must contain one matching still frame')
    return raster_dimensions(*dims)


def svg_metadata(text):
    require('<!DOCTYPE' not in text.upper() and '<!ENTITY' not in text.upper() and
            '<?xml-stylesheet' not in text.lower(), 'SVG DTD/entity/external stylesheet forbidden')
    root = ET.fromstring(text)
    require(root.tag.split('}')[-1] == 'svg', 'SVG root required')
    count = 0
    for node in root.iter():
        count += 1
        require(count <= 20000 and node.tag.split('}')[-1] not in ('script', 'foreignObject'),
                'Unsafe/oversized SVG element tree')
        for key, value in node.attrib.items():
            name = key.split('}')[-1].lower()
            require(not name.startswith('on'), 'SVG event handler forbidden')
            require(name != 'href' or value.startswith('#'), 'External SVG href forbidden')
            lowered = value.lower()
            require('javascript:' not in lowered and '@import' not in lowered, 'Unsafe SVG attribute')
            for url in re.findall(r'url\s*\(\s*[\"\']?([^\)\"\']+)', lowered):
                require(url.startswith('#'), 'External SVG URL forbidden')
        if node.tag.split('}')[-1] == 'style' and node.text:
            require('@import' not in node.text.lower() and 'url(' not in node.text.lower(),
                    'SVG stylesheet imports/URLs forbidden')
    def length(value):
        if value and re.fullmatch(r'[0-9]+(?:\.[0-9]+)?(?:px)?', value):
            number = float(value.removesuffix('px'))
            return int(number) if number.is_integer() else number
        return None
    w, h = length(root.get('width')), length(root.get('height'))
    if w is None or h is None:
        view = re.split(r'[ ,]+', root.get('viewBox', '').strip())
        require(len(view) == 4, 'SVG needs numeric dimensions or viewBox')
        values = [float(x) for x in view]
        require(all(math.isfinite(x) for x in values), 'Invalid SVG viewBox')
        w, h = values[2:]
    require(0 < w <= 8192 and 0 < h <= 8192, 'SVG dimensions outside limit')
    return {'width': w, 'height': h}


class GalleryHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.opened, self.closed = set(), set()
    def handle_starttag(self, tag, attrs):
        self.opened.add(tag)
    def handle_endtag(self, tag):
        self.closed.add(tag)


def inspect_media(name, data):
    """Builder may call this to obtain the exact manifest mediaType/metadata."""
    suffix = safe_member(name).suffix
    mime = MEDIA[suffix]
    if suffix == '.png':
        return mime, png_metadata(data)
    if suffix == '.webp':
        return mime, webp_metadata(data)
    require(len(data) <= MAX_TEXT_BYTES and b'\x00' not in data, 'Oversized or NUL-containing text')
    text = data.decode('utf-8')
    require(text and not text.startswith('\ufeff'), 'Text must be nonempty UTF-8 without BOM')
    if suffix == '.svg':
        return mime, svg_metadata(text)
    if suffix == '.json':
        json_no_duplicates(text)
    elif suffix == '.html':
        parser = GalleryHTMLParser()
        parser.feed(text)
        parser.close()
        require({'html', 'head', 'body'} <= parser.opened and {'html', 'head', 'body'} <= parser.closed,
                'HTML must contain complete html/head/body elements')
    return mime, {'encoding': 'utf-8'}


def validate_manifest(root):
    manifest_path = root / 'manifest.json'
    regular_file(manifest_path, 'manifest')
    require(manifest_path.stat().st_size <= MAX_MANIFEST_BYTES, 'Manifest too large')
    raw = manifest_path.read_bytes()
    data = json_no_duplicates(raw.decode('utf-8'))
    exact_keys(data, ('schemaVersion', 'packageType', 'baseGallery', 'archiveBytes',
                     'archiveSha256', 'parts', 'memberCount', 'members'), 'manifest')
    require(data['schemaVersion'] == 1 and type(data['schemaVersion']) is int and
            data['packageType'] == PACKAGE_TYPE, 'Wrong gallery package schema/type')
    exact_keys(data['baseGallery'], ('path', 'bytes', 'sha256'), 'baseGallery')
    require(data['baseGallery'] == {'path': 'material-gallery.html', 'bytes': EXPECTED_BASE_BYTES,
                                  'sha256': EXPECTED_BASE_SHA256}, 'Wrong mandatory baseline anchor')
    integer(data['archiveBytes'], 'archiveBytes', 1)
    checked_hash(data['archiveSha256'], 'archiveSha256')
    require(isinstance(data['parts'], list) and 1 <= len(data['parts']) <= MAX_PARTS, 'Bad part count')
    part_names, part_total = [], 0
    for part in data['parts']:
        exact_keys(part, ('name', 'bytes', 'sha256'), 'part')
        require(isinstance(part['name'], str) and PART.fullmatch(part['name']) and
                part['name'] not in part_names, 'Invalid/duplicate part filename')
        part_names.append(part['name'])
        part_total += integer(part['bytes'], 'part bytes', 1)
        checked_hash(part['sha256'], 'part sha256')
    require(part_total == data['archiveBytes'] and part_total <= MAX_PACKAGE_BYTES, 'Archive part total differs')
    require(set(p.name for p in root.glob('part-*.bin')) == set(part_names), 'Unexpected/missing part files')
    require(isinstance(data['members'], list) and 1 <= len(data['members']) <= MAX_FILES, 'Bad member count')
    integer(data['memberCount'], 'memberCount', 1, MAX_FILES)
    require(data['memberCount'] == len(data['members']), 'Member count differs')
    expected, insensitive, prefixes, expanded = {}, set(), {}, 0
    for member in data['members']:
        exact_keys(member, ('path', 'bytes', 'sha256', 'mediaType', 'metadata'), 'member')
        safe_member(member['path'])
        require(member['path'] not in expected and member['path'].lower() not in insensitive,
                'Duplicate/case-colliding member')
        expected[member['path']] = member
        insensitive.add(member['path'].lower())
        parts = PurePosixPath(member['path']).parts
        for index in range(1, len(parts) + 1):
            prefix = '/'.join(parts[:index])
            require(prefixes.get(prefix.lower(), prefix) == prefix, 'Case-colliding path directory')
            prefixes[prefix.lower()] = prefix
        expanded += integer(member['bytes'], 'member bytes', 1)
        checked_hash(member['sha256'], 'member sha256')
        require(member['mediaType'] == MEDIA[PurePosixPath(member['path']).suffix] and
                isinstance(member['metadata'], dict), 'Wrong member media metadata')
        if PurePosixPath(member['path']).suffix in ('.png', '.webp'):
            exact_keys(member['metadata'], ('width', 'height'), 'raster metadata')
            raster_dimensions(member['metadata']['width'], member['metadata']['height'])
        elif PurePosixPath(member['path']).suffix == '.svg':
            exact_keys(member['metadata'], ('width', 'height'), 'SVG metadata')
            require(all(type(v) in (int, float) and math.isfinite(v) and 0 < v <= 8192
                        for v in member['metadata'].values()), 'Invalid SVG metadata dimension')
        else:
            require(member['metadata'] == {'encoding': 'utf-8'}, 'Invalid text metadata')
    require(expanded <= MAX_PACKAGE_BYTES and 'material-gallery.html' in expected,
            'Expanded package too large or mandatory gallery missing')
    for name in expected:
        require(not any(parent.as_posix() in expected for parent in PurePosixPath(name).parents),
                'File/directory member path collision')
    return data, expected, expanded, digest(raw)


def verify_base(sofa):
    target = no_symlink_chain(sofa / 'material-gallery.html')
    info = regular_file(target, 'baseline gallery')
    require(info.st_size == EXPECTED_BASE_BYTES and file_digest(target) == EXPECTED_BASE_SHA256,
            'Existing gallery does not match the mandatory live baseline SHA/bytes')


def site_bytes(site):
    total = 0
    for directory, dirs, files in os.walk(site, followlinks=False):
        for name in dirs + files:
            path = Path(directory) / name
            require(not path.is_symlink(), 'Symlink in assembled Pages site: ' + str(path))
        for name in files:
            path = Path(directory) / name
            total += regular_file(path, 'Pages site file').st_size
    return total


def open_parent_fd(sofa_fd, relative, created_dirs):
    """Use directory FDs with O_NOFOLLOW; never write through a symlink."""
    parts = safe_member(relative).parts
    fd, prefix = os.dup(sofa_fd), []
    try:
        for part in parts[:-1]:
            prefix.append(part)
            try:
                child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            except FileNotFoundError:
                os.mkdir(part, 0o755, dir_fd=fd)
                created_dirs.append('/'.join(prefix))
                child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd, parts[-1]
    except BaseException:
        os.close(fd)
        raise


def validate_and_restore(site, package_root, *, verify_only=False):
    site = no_symlink_chain(site)
    package_root = no_symlink_chain(package_root)
    require(site.is_dir() and package_root.is_dir(), 'Site/package root must exist')
    sofa = no_symlink_chain(site / 'sofa')
    require(sofa.is_dir(), 'Restore the original sofa application before this gallery overlay')
    manifest, expected, expanded, manifest_sha = validate_manifest(package_root)
    verify_base(sofa)
    existing_bytes = site_bytes(site)
    existing_assets, replaced_bytes = set(), EXPECTED_BASE_BYTES
    for name, member in expected.items():
        target = no_symlink_chain(sofa / name, allow_missing=True)
        if target.exists():
            info = regular_file(target, 'overlay target')
            if name != 'material-gallery.html':
                require(info.st_size == member['bytes'] and file_digest(target) == member['sha256'],
                        'Existing V174 asset differs; refuse overwrite: ' + name)
                existing_assets.add(name)
                replaced_bytes += info.st_size
    projected_bytes = existing_bytes - replaced_bytes + expanded
    require(projected_bytes <= MAX_SITE_BYTES, 'Projected assembled Pages site exceeds1GiB: ' + str(projected_bytes))
    # Stage outside the published site but on its filesystem for atomic rename.
    with tempfile.TemporaryDirectory(prefix='.gallery-v174-stage-', dir=site.parent) as temporary:
        staging = Path(temporary)
        archive_path = staging / 'verified.zip'
        whole = hashlib.sha256()
        with archive_path.open('xb') as output:
            for part in manifest['parts']:
                path = package_root / part['name']
                regular_file(path, 'package part')
                value, count = hashlib.sha256(), 0
                with path.open('rb') as handle:
                    for block in iter(lambda: handle.read(1024 * 1024), b''):
                        count += len(block)
                        require(count <= part['bytes'], 'Part exceeds declared bytes')
                        output.write(block)
                        value.update(block)
                        whole.update(block)
                require(count == part['bytes'] and value.hexdigest() == part['sha256'], 'Part checksum/size differs: ' + part['name'])
        require(archive_path.stat().st_size == manifest['archiveBytes'] and
                whole.hexdigest() == manifest['archiveSha256'], 'Whole archive checksum/bytes differ')
        with archive_path.open('rb') as handle:
            require(manifest['archiveBytes'] >= 22, 'ZIP too short')
            handle.seek(-22, os.SEEK_END)
            end = handle.read(22)
        signature, disk, central_disk, disk_count, total_count, central_size, central_offset, comment = struct.unpack('<4s4H2IH', end)
        require(signature == b'PK\x05\x06' and disk == central_disk == comment == 0 and
                disk_count == total_count == len(expected) and central_offset + central_size == manifest['archiveBytes'] - 22,
                'ZIP must be a single non-commented archive without trailing data')
        staged = {}
        with zipfile.ZipFile(archive_path) as archive:
            infos = archive.infolist()
            require(len(infos) == len(expected), 'ZIP member count differs')
            seen = set()
            for info in infos:
                safe_member(info.filename)
                mode = info.external_attr >> 16
                require(info.filename not in seen and info.filename in expected and not info.is_dir() and
                        info.orig_filename == info.filename and
                        stat.S_IFMT(mode) in (0, stat.S_IFREG) and not(info.flag_bits & 1) and
                        info.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED), 'Unsafe/unexpected ZIP member')
                seen.add(info.filename)
                member = expected[info.filename]
                require(info.file_size == member['bytes'], 'ZIP member size differs: ' + info.filename)
                content = bytearray()
                with archive.open(info) as handle:
                    for block in iter(lambda: handle.read(1024 * 1024), b''):
                        content.extend(block)
                        require(len(content) <= member['bytes'], 'ZIP member expands beyond declaration')
                data = bytes(content)
                require(len(data) == member['bytes'] and digest(data) == member['sha256'],
                        'ZIP member checksum differs: ' + info.filename)
                mime, metadata = inspect_media(info.filename, data)
                require(mime == member['mediaType'] and metadata == member['metadata'],
                        'Decoded metadata differs: ' + info.filename)
                target = staging / ('file-' + str(len(staged)))
                target.write_bytes(data)
                target.chmod(0o644)
                staged[info.filename] = target
            require(seen == set(expected), 'ZIP member set differs')
        # No target files/directories have been written before this point.
        verify_base(sofa)
        for name in expected:
            no_symlink_chain(sofa / name, allow_missing=True)
        report = {'packageType': PACKAGE_TYPE, 'status': 'validated' if verify_only else 'restored',
                  'manifestSHA256': manifest_sha, 'validatedMembers': len(expected),
                  'archiveBytes': manifest['archiveBytes'], 'expandedBytes': expanded,
                  'siteBytesBefore': existing_bytes, 'projectedSiteBytes': projected_bytes,
                  'target': str(sofa), 'writtenFiles': 0,
                  'scope': ['material-gallery.html', ASSET_PREFIX + '**'],
                  'sourceModelsModified': False, 'allMembersValidatedBeforeTargetWrites': True}
        if verify_only:
            return report
        baseline_backup = staging / 'baseline-gallery-backup'
        baseline_data = (sofa / 'material-gallery.html').read_bytes()
        require(len(baseline_data) == EXPECTED_BASE_BYTES and digest(baseline_data) == EXPECTED_BASE_SHA256,
                'Baseline changed before commit')
        baseline_backup.write_bytes(baseline_data)
        sofa_fd = os.open(sofa, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        written, created_dirs = [], []
        try:
            # New immutable assets first; the HTML switch is the final operation.
            names = sorted(n for n in expected if n != 'material-gallery.html' and n not in existing_assets)
            names.append('material-gallery.html')
            for name in names:
                if name == 'material-gallery.html':
                    verify_base(sofa)
                fd, basename = open_parent_fd(sofa_fd, name, created_dirs)
                try:
                    try:
                        current = os.stat(basename, dir_fd=fd, follow_symlinks=False)
                    except FileNotFoundError:
                        current = None
                    require(current is None or stat.S_ISREG(current.st_mode), 'Unsafe target at commit: ' + name)
                    require(name == 'material-gallery.html' or current is None, 'Asset target appeared during commit: ' + name)
                    os.replace(staged[name], basename, dst_dir_fd=fd)
                    written.append(name)
                    os.fsync(fd)
                finally:
                    os.close(fd)
            report['writtenFiles'] = len(written)
            return report
        except BaseException:
            # The only replacement is the last HTML; earlier failures leave its
            # original bytes intact. Roll back newly installed unreferenced assets.
            if 'material-gallery.html' in written:
                os.replace(baseline_backup, 'material-gallery.html', dst_dir_fd=sofa_fd)
            for name in reversed(written):
                if name != 'material-gallery.html':
                    fd, basename = open_parent_fd(sofa_fd, name, [])
                    try:
                        os.unlink(basename, dir_fd=fd)
                    finally:
                        os.close(fd)
            for name in reversed(created_dirs):
                try:
                    (sofa / name).rmdir()
                except OSError:
                    pass
            raise
        finally:
            os.close(sofa_fd)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', type=Path, required=True, help='Assembled Pages root, e.g. _source/_site; overlay targets its sofa/ child')
    parser.add_argument('--verify-only', action='store_true', help='Validate everything and report projected bytes without changing target files')
    args = parser.parse_args()
    print(json.dumps(validate_and_restore(args.site, Path(__file__).resolve().parent,
                                          verify_only=args.verify_only), sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, zipfile.BadZipFile, ET.ParseError, UnicodeError) as exc:
        raise SystemExit('Gallery package rejected: ' + str(exc))
