#!/usr/bin/env python3
"""Verify a separate sofa package, then add it beside existing editor/view output."""
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import posixpath
import re
import stat
import struct
import tempfile
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET
import zipfile
import zlib

MAX_SITE_BYTES = 1024 * 1024 * 1024
INTERFACE_FILES = frozenset({'kombinasyonlar.html', 'kombinasyonlar.css', 'kombinasyonlar.js', 'urun.html',
    'index.html', 'app.js', 'product-gallery.js', 'product-seo.js',
    'pricing.html', 'pricing.js', 'pricing.css', 'sku-display.js', 'sku-display.css',
    'assets/pricing/catalogue-skus.json', 'assets/pricing/sku-registry.json',
    'assets/pricing/SOMASS-SKU-Fiyatlandirma.xlsx', 'material-gallery.html'})
MAX_INTERFACE_BYTES = 2 * 1024 * 1024
INTERFACE_FILES = INTERFACE_FILES | frozenset(['assets/product-galleries/catalogue-v77.json', 'assets/studio/catalogue-v69.json', 'catalogue-variants.js', 'combinations-state.js', 'consumer-summary.js', 'fabric-appearance.js', 'fabric-library.js', 'fabric-material.js', 'inspiration-catalog.js', 'new-fabric-variants.js', 'product-export-materials.js', 'product-glb-export.js', 'studio-catalog-images.js', 'team-pack-engine.js', 'team-pack.js'])
V118_EXISTING_ANCHORS = {'fabric-material.js': ('3f5d86520c47b73e83866a3577315150cb0c0d25775a73307212e5b8c4776e3b', 13593), 'combinations-state.js': ('2aa13955c46ac8ca0caf3be2bf58619f18a958da8f4709ba8534996c2e57ab8f', 12659), 'consumer-summary.js': ('2f8b64bd350fa92edc10690ceb31577aaf35de25dc4f2f4eb2afc42e90f4c99e', 11416), 'inspiration-catalog.js': ('4e6c5e3ca2dabefe02d865fb105a524f2530bb794c7eacabf78e60927325e3d3', 17790), 'catalogue-variants.js': ('9262570c944251b152c05f485915a4ab25c5e767d7ab5f7206fc1f70f0aa4edb', 22004), 'studio-catalog-images.js': ('ea5dfa65ff1fce414bf7dad16656199e4b9ee983b7f2a652d37cd357b2937da2', 3645), 'product-export-materials.js': ('0d94c6d00ce92013ae7b84f36dd2f37dcf74b71812b9a20c0b3111b238e81307', 12781), 'assets/studio/catalogue-v69.json': ('487990eb3ef7e1f9ada8428943a7b4cf8b3d567ca551b4badf94ecea9fc352dc', 443933), 'assets/product-galleries/catalogue-v77.json': ('f51a7cd7934d59ccb1b539a4d212b932e6834f019dbd1860d534094e8827c332', 1566629), 'product-glb-export.js': ('f73741ca5129d2cd4609a9fc57efcd12d29d3073ee52e811d76bdbea2400c6e5', 4403), 'team-pack.js': ('e8737fbc45020eaaed423a924ea0a32efa66b1f1bab5d22f657dc1317542a08e', 2645), 'team-pack-engine.js': ('6e0d64a202797e7f3069fe24e9c430c146621bdd1f827912ef7d5998f8339b63', 7041)}
V118_ADDITIONS = frozenset(['fabric-library.js', 'fabric-appearance.js', 'new-fabric-variants.js'])
MAX_OVERLAY_FILES = 1536
MAX_PRODUCT_MEDIA_BYTES = 2 * 1024 * 1024
MAX_PRODUCT_MEDIA_FILES = 913
MAX_PRODUCT_MEDIA_TOTAL_BYTES = 128 * 1024 * 1024
MAX_PRODUCT_ARCHIVE_BYTES = 128 * 1024 * 1024
MAX_PRODUCT_PART_BYTES = 2 * 1024 * 1024
MAX_PRODUCT_PARTS = 64
PRODUCT_VARIANT_KEYS = frozenset(['inspiration-fabric-v118-01-soft-touch-1351-oak', 'inspiration-fabric-v118-02-veronza-1008-dark-oak', 'inspiration-fabric-v118-03-colormax-1015-black-oak', 'inspiration-fabric-v118-04-soft-touch-1355-oak', 'inspiration-fabric-v118-05-veronza-1012-dark-oak', 'inspiration-fabric-v118-06-colormax-1017-black-oak', 'inspiration-fabric-v118-07-soft-touch-1246-oak', 'inspiration-fabric-v118-08-veronza-1030-dark-oak', 'inspiration-fabric-v118-09-soft-touch-1024-black-oak', 'inspiration-fabric-v118-10-veronza-1035-oak', 'inspiration-fabric-v118-11-soft-touch-1200-dark-oak', 'inspiration-fabric-v118-12-veronza-1031-black-oak', 'inspiration-fabric-v118-13-veronza-1041-oak', 'inspiration-fabric-v118-14-soft-touch-1351-dark-oak', 'inspiration-fabric-v118-15-veronza-1008-black-oak', 'inspiration-fabric-v118-16-colormax-1015-oak', 'inspiration-fabric-v118-17-soft-touch-1355-dark-oak', 'inspiration-fabric-v118-18-veronza-1012-black-oak', 'inspiration-fabric-v118-19-colormax-1017-oak', 'inspiration-fabric-v118-20-soft-touch-1246-dark-oak', 'inspiration-fabric-v118-21-veronza-1030-black-oak', 'inspiration-fabric-v118-22-soft-touch-1024-oak', 'inspiration-fabric-v118-23-veronza-1035-dark-oak', 'inspiration-fabric-v118-24-soft-touch-1200-black-oak', 'inspiration-fabric-v118-25-veronza-1031-oak', 'inspiration-fabric-v118-26-veronza-1041-dark-oak', 'inspiration-fabric-v118-27-soft-touch-1351-black-oak', 'inspiration-fabric-v118-28-veronza-1008-oak', 'inspiration-fabric-v118-29-colormax-1015-dark-oak', 'inspiration-fabric-v118-30-soft-touch-1355-black-oak', 'inspiration-fabric-v118-31-veronza-1012-oak', 'inspiration-fabric-v118-32-colormax-1017-dark-oak', 'inspiration-fabric-v118-33-soft-touch-1246-black-oak', 'inspiration-fabric-v118-34-veronza-1030-oak', 'inspiration-fabric-v118-35-soft-touch-1024-dark-oak', 'inspiration-fabric-v118-36-veronza-1035-black-oak', 'inspiration-fabric-v118-37-soft-touch-1200-oak', 'inspiration-fabric-v118-38-veronza-1031-dark-oak', 'inspiration-fabric-v118-39-veronza-1041-black-oak', 'inspiration-fabric-v118-40-soft-touch-1351-oak', 'inspiration-fabric-v118-41-veronza-1008-dark-oak', 'inspiration-fabric-v118-42-colormax-1015-black-oak', 'inspiration-fabric-v118-43-soft-touch-1355-oak', 'inspiration-fabric-v118-44-veronza-1012-dark-oak', 'inspiration-fabric-v118-45-colormax-1017-black-oak', 'inspiration-fabric-v118-46-soft-touch-1246-oak', 'inspiration-fabric-v118-47-veronza-1030-dark-oak', 'inspiration-fabric-v118-48-soft-touch-1024-black-oak', 'inspiration-fabric-v118-49-veronza-1035-oak', 'inspiration-fabric-v118-50-veronza-1041-dark-oak'])
PRODUCT_MEDIA_PATH = re.compile(r'assets/product-galleries/v118/([^/]+)/(hero|open-back|front|rear|right-rear|right-side|top|dimensioned-top|detail)(\.thumb)?\.webp')
APP_ORIGINAL_SHA256 = '45ed6c3305ec33d07eafec29d0900e625469ca80770e5347ac3c387fbae27d4b'
APP_ORIGINAL_BYTES = 58321
MATERIAL_MEDIA_PATH = re.compile(r'assets/material-gallery/([0-9a-f]{64})\.(jpg|jpeg|png|webp)')
MAX_MATERIAL_MEDIA_BYTES = 4 * 1024 * 1024
MAX_MATERIAL_MEDIA_FILES = 512
MAX_MATERIAL_MEDIA_TOTAL_BYTES = 128 * 1024 * 1024
MAX_INTERFACE_MANIFEST_BYTES = 768 * 1024
MAX_MATERIAL_ARCHIVE_BYTES = 128 * 1024 * 1024
MAX_MATERIAL_PART_BYTES = 2 * 1024 * 1024
MAX_MATERIAL_PARTS = 64
WORKBOOK_PATH = 'assets/pricing/SOMASS-SKU-Fiyatlandirma.xlsx'
NEW_INTERFACE_FILES = frozenset({'pricing.html', 'pricing.js', 'pricing.css', 'sku-display.js', 'sku-display.css',
    'assets/pricing/catalogue-skus.json', 'assets/pricing/sku-registry.json', WORKBOOK_PATH,
    'material-gallery.html'})
XLSX_MAX_EXPANDED_BYTES = 32 * 1024 * 1024
XLSX_MAX_MEMBERS = 1000
SHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
CONTENT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types'



def interface_limit(name):
    return 4 * 1024 * 1024 if name in {
        'assets/studio/catalogue-v69.json', 'assets/product-galleries/catalogue-v77.json'} else MAX_INTERFACE_BYTES


def product_image_match(name):
    match = PRODUCT_MEDIA_PATH.fullmatch(name) if isinstance(name, str) else None
    return match if match and match.group(1) in PRODUCT_VARIANT_KEYS else None


FABRIC_CHIPS = {'assets/fabrics/v118/soft-touch-1351.png': ('f69838a4ddfc0392c3f0496ae667e2cc8938cfc793a6467ea7e5b43631b0c853', 117849), 'assets/fabrics/v118/soft-touch-1355.png': ('323c77b25f68522cbcb8d7a140d40364f7eafde1f19c661cec312d63807fb1e1', 122580), 'assets/fabrics/v118/soft-touch-1246.png': ('1b69b2cc6c780308a629deb46cf21dfc8441a897b97b935708482ea6e8d6b9d9', 110673), 'assets/fabrics/v118/soft-touch-1024.png': ('23be439a718fa75b321c6a16ef616635fca275a1e8994d50e60784975e98da83', 181713), 'assets/fabrics/v118/soft-touch-1200.png': ('fe24a589d6396eec267ad26894ea813050b8bda54db2880243eb84992bd104a5', 120553), 'assets/fabrics/v118/veronza-1008.png': ('b1f73a888d75b6c86f64c58255f11e992573e80aed564e91c7c40a6920399f41', 142803), 'assets/fabrics/v118/veronza-1041.png': ('a9b0a288f5cee210113551c1541ed519f7743c235c66a5017ec5481d85820f39', 203347), 'assets/fabrics/v118/veronza-1035.png': ('2027208a1eb3104986aaa9fedc7491428ef3aa42a0ba4723c33ae3e8ce20a499', 179391), 'assets/fabrics/v118/veronza-1030.png': ('d38528b844ba4fcf9ee813d046c5614c61fed226816569aaa471652dfe573223', 203301), 'assets/fabrics/v118/veronza-1031.png': ('d3dcdefabeb621634209da8716505a7863748c6e5a988a6409ce95439cc5f54d', 205122), 'assets/fabrics/v118/veronza-1012.png': ('5bd7d80d60930afb5dc07329929d4a3ad667850237e5025305b96461f833343d', 204812), 'assets/fabrics/v118/colormax-1015.png': ('01221a454760a5191011fe18a2817610a1668f57f978b48d720442a365882838', 361471), 'assets/fabrics/v118/colormax-1017.png': ('4388695d27aafeede1847ac19fa28f782494757492eada7d439a2857b9a8a1d8', 441825)}
FABRIC_CHIP_DIMENSIONS = {'assets/fabrics/v118/soft-touch-1351.png': (360, 280), 'assets/fabrics/v118/soft-touch-1355.png': (360, 280), 'assets/fabrics/v118/soft-touch-1246.png': (360, 280), 'assets/fabrics/v118/soft-touch-1024.png': (360, 280), 'assets/fabrics/v118/soft-touch-1200.png': (360, 280), 'assets/fabrics/v118/veronza-1008.png': (360, 280), 'assets/fabrics/v118/veronza-1041.png': (360, 280), 'assets/fabrics/v118/veronza-1035.png': (360, 280), 'assets/fabrics/v118/veronza-1030.png': (360, 280), 'assets/fabrics/v118/veronza-1031.png': (360, 280), 'assets/fabrics/v118/veronza-1012.png': (360, 280), 'assets/fabrics/v118/colormax-1015.png': (560, 420), 'assets/fabrics/v118/colormax-1017.png': (560, 420)}



def product_media_match(name):
    return product_image_match(name) or (name in FABRIC_CHIPS if isinstance(name, str) else False)


def validate_fabric_chip(name, content):
    if name not in FABRIC_CHIPS or (sha256(content), len(content)) != FABRIC_CHIPS[name]:
        raise ValueError('Fabric chip differs from its exact original source')
    validate_material_media('assets/material-gallery/' + sha256(content) + '.png', content)
    if struct.unpack('>II', content[16:24]) != FABRIC_CHIP_DIMENSIONS[name]:
        raise ValueError('Fabric chip dimensions differ')
    cursor, saw_data = 8, False
    while cursor < len(content):
        if cursor + 12 > len(content):
            raise ValueError('Truncated fabric chip PNG')
        size = int.from_bytes(content[cursor:cursor + 4], 'big')
        kind = content[cursor + 4:cursor + 8]
        end = cursor + 12 + size
        if end > len(content) or kind in (b'acTL', b'fcTL', b'fdAT'):
            raise ValueError('Invalid or animated fabric chip PNG')
        if kind == b'IDAT': saw_data = True
        if kind == b'IEND' and end != len(content):
            raise ValueError('Fabric chip PNG has trailing content')
        cursor = end
    if not saw_data:
        raise ValueError('Fabric chip PNG image data missing')


def validate_product_media(name, content):
    """Check a still WebP at one exact authored product/view/size path."""
    if name in FABRIC_CHIPS:
        return validate_fabric_chip(name, content)
    match = product_image_match(name)
    if (not match or len(content) < 30 or content[:4] != b'RIFF' or content[8:12] != b'WEBP'
            or int.from_bytes(content[4:8], 'little') != len(content) - 8):
        raise ValueError('Product variant WebP signature or path differs')
    cursor, dimensions, frames = 12, None, 0
    while cursor < len(content):
        if cursor + 8 > len(content):
            raise ValueError('Truncated product variant WebP chunk')
        kind = content[cursor:cursor + 4]
        size = int.from_bytes(content[cursor + 4:cursor + 8], 'little')
        start, end = cursor + 8, cursor + 8 + size
        if end + (size & 1) > len(content) or kind in (b'ANIM', b'ANMF'):
            raise ValueError('Invalid or animated product variant WebP')
        data = content[start:end]
        if kind == b'VP8X':
            if len(data) != 10 or data[0] & 2:
                raise ValueError('Invalid or animated product variant WebP canvas')
            canvas = (int.from_bytes(data[4:7], 'little') + 1, int.from_bytes(data[7:10], 'little') + 1)
        elif kind == b'VP8 ':
            if len(data) < 10 or data[3:6] != b'\x9d\x01\x2a':
                raise ValueError('Invalid product variant VP8 frame')
            dimensions = (int.from_bytes(data[6:8], 'little') & 0x3fff, int.from_bytes(data[8:10], 'little') & 0x3fff)
            frames += 1
        elif kind == b'VP8L':
            if len(data) < 5 or data[0] != 0x2f:
                raise ValueError('Invalid product variant VP8L frame')
            bits = int.from_bytes(data[1:5], 'little')
            dimensions = ((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
            frames += 1
        cursor = end + (size & 1)
    expected_dimensions = (300, 200) if match.group(3) else (1536, 1024)
    if frames != 1 or dimensions != expected_dimensions or ('canvas' in locals() and canvas != dimensions):
        raise ValueError('Product variant WebP dimensions differ')


def material_media_match(name):
    return MATERIAL_MEDIA_PATH.fullmatch(name) if isinstance(name, str) else None


def validate_material_media(name, content):
    """Keep original image bytes while checking their content address and format."""
    match = material_media_match(name)
    if not match or sha256(content) != match.group(1):
        raise ValueError('Material gallery image content address differs')
    extension = match.group(2)
    if extension in ('jpg', 'jpeg'):
        if not content.startswith(b'\xff\xd8\xff') or not content.endswith(b'\xff\xd9'):
            raise ValueError('Material gallery JPEG signature differs')
        # Read only marker headers; image scan data is preserved without decoding.
        cursor, frame = 2, False
        while cursor < len(content) - 2:
            if content[cursor] != 0xff:
                raise ValueError('Invalid material gallery JPEG marker')
            while cursor < len(content) and content[cursor] == 0xff:
                cursor += 1
            if cursor >= len(content):
                break
            marker = content[cursor]
            cursor += 1
            if marker == 0x01 or 0xd0 <= marker <= 0xd7:
                continue
            if marker in (0x00, 0xd8, 0xd9) or cursor + 2 > len(content):
                raise ValueError('Invalid material gallery JPEG segment')
            size = int.from_bytes(content[cursor:cursor + 2], 'big')
            if size < 2 or cursor + size > len(content) - 2:
                raise ValueError('Invalid material gallery JPEG segment length')
            if marker in (0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf):
                if size < 8:
                    raise ValueError('Invalid material gallery JPEG frame')
                height, width = struct.unpack('>HH', content[cursor + 3:cursor + 7])
                if not (0 < width <= 32768 and 0 < height <= 32768):
                    raise ValueError('Invalid material gallery JPEG dimensions')
                frame = True
            if marker == 0xda:
                if not frame or cursor + size >= len(content) - 2:
                    raise ValueError('Material gallery JPEG scan or frame missing')
                return
            cursor += size
        raise ValueError('Material gallery JPEG scan missing')
    if extension == 'png':
        if (len(content) < 57 or not content.startswith(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR')
                or content[-12:] != b'\x00\x00\x00\x00IEND\xaeB`\x82'):
            raise ValueError('Material gallery PNG signature differs')
        width, height = struct.unpack('>II', content[16:24])
        if not (0 < width <= 32768 and 0 < height <= 32768):
            raise ValueError('Invalid material gallery PNG dimensions')
        return
    if (len(content) < 30 or content[:4] != b'RIFF' or content[8:12] != b'WEBP'
            or int.from_bytes(content[4:8], 'little') != len(content) - 8
            or content[12:16] not in (b'VP8 ', b'VP8L', b'VP8X')):
        raise ValueError('Material gallery WebP signature differs')


def relationship_target(rels_name, target):
    """Resolve an OPC part relationship without escaping the ZIP package."""
    if not isinstance(target, str) or not target or '\\' in target or '\x00' in target:
        raise ValueError('Invalid spreadsheet relationship target')
    split = urlsplit(target)
    if split.scheme or split.netloc or split.query:
        raise ValueError('Unexpected external spreadsheet relationship')
    rels = PurePosixPath(rels_name)
    base = '' if rels_name == '_rels/.rels' else str(rels.parent.parent)
    resolved = posixpath.normpath(target.lstrip('/') if target.startswith('/') else posixpath.join(base, target))
    if resolved in ('', '.', '..') or resolved.startswith('../') or resolved.startswith('/'):
        raise ValueError('Spreadsheet relationship escapes package')
    return resolved


def validate_xlsx(content):
    """Recognize a standard OOXML spreadsheet, not a renamed arbitrary binary."""
    if not content.startswith(b'PK\x03\x04'):
        raise ValueError('Spreadsheet payload is not an XLSX ZIP archive')
    required = {'[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels'}
    xml, names, total = {}, set(), 0
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as workbook:
            infos = workbook.infolist()
            if not 1 <= len(infos) <= XLSX_MAX_MEMBERS:
                raise ValueError('Unexpected spreadsheet archive size')
            for info in infos:
                name = info.filename.rstrip('/') if info.is_dir() else info.filename
                part = PurePosixPath(name)
                mode = info.external_attr >> 16
                if (not name or part.is_absolute() or part.as_posix() != name or '..' in part.parts
                        or '\\' in name or '\x00' in name or name in names
                        or stat.S_ISLNK(mode) or stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR)
                        or info.flag_bits & 1 or info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)):
                    raise ValueError('Unsafe spreadsheet archive member')
                names.add(name)
                if info.is_dir():
                    continue
                if info.file_size < 0:
                    raise ValueError('Invalid spreadsheet archive member size')
                total += info.file_size
                if total > XLSX_MAX_EXPANDED_BYTES:
                    raise ValueError('Spreadsheet archive expands beyond limit')
                data = workbook.read(info)
                if len(data) != info.file_size:
                    raise ValueError('Spreadsheet archive member length differs')
                if name.endswith(('.xml', '.rels')):
                    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
                        raise ValueError('Spreadsheet XML declarations are unsupported')
                    xml[name] = ET.fromstring(data)
                elif re.fullmatch(r'xl/media/[^/]+\.(?:png|jpe?g)', name, flags=re.I):
                    if not (data.startswith(b'\x89PNG\r\n\x1a\n') or data.startswith(b'\xff\xd8\xff')):
                        raise ValueError('Invalid spreadsheet media')
                else:
                    raise ValueError('Unexpected spreadsheet binary or macro part')
    except (zipfile.BadZipFile, ET.ParseError, RuntimeError) as error:
        raise ValueError('Invalid XLSX spreadsheet structure') from error
    if not required <= set(xml):
        raise ValueError('Spreadsheet workbook parts missing')
    content_types = xml['[Content_Types].xml']
    if content_types.tag != '{' + CONTENT_NS + '}Types':
        raise ValueError('Invalid spreadsheet content types')
    workbook_types = [item.get('ContentType') for item in content_types.findall('{' + CONTENT_NS + '}Override')
                      if item.get('PartName') == '/xl/workbook.xml']
    if not workbook_types:
        workbook_types = [item.get('ContentType') for item in content_types.findall('{' + CONTENT_NS + '}Default')
                          if item.get('Extension') == 'xml']
    if workbook_types != ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml']:
        raise ValueError('Spreadsheet must be a non-macro XLSX workbook')
    relationships = {}
    for name, root in xml.items():
        if not name.endswith('.rels'):
            continue
        if root.tag != '{' + REL_NS + '}Relationships':
            raise ValueError('Invalid spreadsheet relationship document')
        relations = {}
        for item in root:
            rid, target, kind = item.get('Id'), item.get('Target'), item.get('Type')
            if item.tag != '{' + REL_NS + '}Relationship' or not rid or rid in relations or not kind:
                raise ValueError('Invalid or duplicate spreadsheet relationship')
            if item.get('TargetMode', 'Internal') == 'External':
                scheme = urlsplit(target or '').scheme.lower()
                if kind != OFFICE_REL_NS + '/hyperlink' or scheme not in ('http', 'https', 'mailto'):
                    raise ValueError('External spreadsheet data links are unsupported')
                relations[rid] = (kind, None)
                continue
            if item.get('TargetMode', 'Internal') != 'Internal' or kind.endswith('/externalLink'):
                raise ValueError('External spreadsheet data links are unsupported')
            resolved = relationship_target(name, target)
            if resolved not in names:
                raise ValueError('Missing spreadsheet relationship part')
            relations[rid] = (kind, resolved)
        relationships[name] = relations
    package_workbooks = [target for kind, target in relationships['_rels/.rels'].values()
                         if kind == OFFICE_REL_NS + '/officeDocument']
    if package_workbooks != ['xl/workbook.xml']:
        raise ValueError('Invalid spreadsheet workbook relationship')
    document = xml['xl/workbook.xml']
    if document.tag != '{' + SHEET_NS + '}workbook':
        raise ValueError('Invalid spreadsheet workbook document')
    sheets = document.findall('{' + SHEET_NS + '}sheets/{' + SHEET_NS + '}sheet')
    if not sheets:
        raise ValueError('Spreadsheet has no worksheets')
    for sheet in sheets:
        rid = sheet.get('{' + OFFICE_REL_NS + '}id')
        kind, target = relationships['xl/_rels/workbook.xml.rels'].get(rid, (None, None))
        if (kind != OFFICE_REL_NS + '/worksheet' or target not in xml
                or xml[target].tag != '{' + SHEET_NS + '}worksheet'):
            raise ValueError('Invalid spreadsheet worksheet relationship')


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


def load_material_media_package(package_root, media_records):
    """Read a verified optional media ZIP without extracting paths into checkout."""
    folder = package_root / 'sofa-publish' / 'material-media'
    control = folder / 'material-media-manifest.json'
    if not control.exists() and not control.is_symlink():
        return {}, None
    regular_source(control, package_root)
    if not 0 < control.stat().st_size <= 64 * 1024:
        raise ValueError('Invalid material media manifest size')
    control_content = control.read_bytes()
    manifest = json.loads(control_content.decode('utf-8'))
    if (not isinstance(manifest, dict)
            or set(manifest) != {'schemaVersion', 'application', 'archiveSha256', 'archiveBytes', 'memberCount', 'parts'}
            or manifest['schemaVersion'] != 1
            or manifest['application'] != 'studio-sofa-material-media'
            or not interface_digest(manifest['archiveSha256'])
            or not interface_integer(manifest['archiveBytes'], MAX_MATERIAL_ARCHIVE_BYTES)
            or type(manifest['memberCount']) is not int
            or manifest['memberCount'] != len(media_records) or not media_records
            or not isinstance(manifest['parts'], list) or not 1 <= len(manifest['parts']) <= MAX_MATERIAL_PARTS):
        raise ValueError('Invalid material media package manifest')
    stream, whole, total = io.BytesIO(), hashlib.sha256(), 0
    for index, item in enumerate(manifest['parts'], 1):
        if (not isinstance(item, dict) or set(item) != {'name', 'bytes', 'sha256'}
                or item['name'] != f'material-media.part-{index:04d}'
                or not interface_integer(item['bytes'], MAX_MATERIAL_PART_BYTES)
                or not interface_digest(item['sha256'])):
            raise ValueError('Unexpected material media package part')
        source = folder / item['name']
        regular_source(source, package_root)
        if source.stat().st_size != item['bytes']:
            raise ValueError('Material media package part size differs')
        content = source.read_bytes()
        if len(content) != item['bytes'] or sha256(content) != item['sha256']:
            raise ValueError('Material media package part checksum differs')
        total += len(content)
        if total > manifest['archiveBytes']:
            raise ValueError('Material media package exceeds expected size')
        stream.write(content)
        whole.update(content)
    if total != manifest['archiveBytes'] or whole.hexdigest() != manifest['archiveSha256']:
        raise ValueError('Material media archive checksum differs')
    media, total_expanded = {}, 0
    try:
        with zipfile.ZipFile(stream) as archive:
            infos = archive.infolist()
            if len(infos) != manifest['memberCount']:
                raise ValueError('Material media package member count differs')
            for info in infos:
                name, mode = info.filename, info.external_attr >> 16
                if (name not in media_records or name in media or not material_media_match(name)
                        or info.is_dir() or stat.S_ISLNK(mode)
                        or stat.S_IFMT(mode) not in (0, stat.S_IFREG) or info.flag_bits & 1
                        or info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)):
                    raise ValueError('Unexpected or unsafe material media archive member')
                item = media_records[name]
                if info.file_size != item['bytes'] or not interface_integer(info.file_size, MAX_MATERIAL_MEDIA_BYTES):
                    raise ValueError('Material media package member size differs')
                total_expanded += info.file_size
                if total_expanded > MAX_MATERIAL_MEDIA_TOTAL_BYTES:
                    raise ValueError('Material media archive expands beyond limit')
                content = archive.read(info)
                if len(content) != item['bytes'] or sha256(content) != item['sha256']:
                    raise ValueError('Material media package member checksum differs')
                validate_material_media(name, content)
                media[name] = content
    except (zipfile.BadZipFile, RuntimeError, zlib.error) as error:
        raise ValueError('Invalid material media archive') from error
    if set(media) != set(media_records):
        raise ValueError('Material media archive does not cover active gallery entries')
    audit = {'manifestPath': 'sofa-publish/material-media/material-media-manifest.json',
             'manifestSha256': sha256(control_content), 'archiveSha256': manifest['archiveSha256'],
             'archiveBytes': manifest['archiveBytes'], 'memberCount': manifest['memberCount'],
             'parts': manifest['parts']}
    return media, audit


def load_product_media_package(package_root, media_records):
    """Read a verified optional media ZIP without extracting paths into checkout."""
    folder = package_root / 'sofa-publish' / 'product-variant-media'
    control = folder / 'product-variant-media-manifest.json'
    if not control.exists() and not control.is_symlink():
        return {}, None
    regular_source(control, package_root)
    if not 0 < control.stat().st_size <= 64 * 1024:
        raise ValueError('Invalid product variant media manifest size')
    control_content = control.read_bytes()
    manifest = json.loads(control_content.decode('utf-8'))
    if (not isinstance(manifest, dict)
            or set(manifest) != {'schemaVersion', 'application', 'archiveSha256', 'archiveBytes', 'memberCount', 'parts'}
            or manifest['schemaVersion'] != 1
            or manifest['application'] != 'studio-sofa-product-variant-media'
            or not interface_digest(manifest['archiveSha256'])
            or not interface_integer(manifest['archiveBytes'], MAX_PRODUCT_ARCHIVE_BYTES)
            or type(manifest['memberCount']) is not int
            or manifest['memberCount'] != len(media_records) or not media_records
            or not isinstance(manifest['parts'], list) or not 1 <= len(manifest['parts']) <= MAX_PRODUCT_PARTS):
        raise ValueError('Invalid product variant media package manifest')
    stream, whole, total = io.BytesIO(), hashlib.sha256(), 0
    for index, item in enumerate(manifest['parts'], 1):
        if (not isinstance(item, dict) or set(item) != {'name', 'bytes', 'sha256'}
                or item['name'] != f'product-variant-media.part-{index:04d}'
                or not interface_integer(item['bytes'], MAX_PRODUCT_PART_BYTES)
                or not interface_digest(item['sha256'])):
            raise ValueError('Unexpected product variant media package part')
        source = folder / item['name']
        regular_source(source, package_root)
        if source.stat().st_size != item['bytes']:
            raise ValueError('Product variant media package part size differs')
        content = source.read_bytes()
        if len(content) != item['bytes'] or sha256(content) != item['sha256']:
            raise ValueError('Product variant media package part checksum differs')
        total += len(content)
        if total > manifest['archiveBytes']:
            raise ValueError('Product variant media package exceeds expected size')
        stream.write(content)
        whole.update(content)
    if total != manifest['archiveBytes'] or whole.hexdigest() != manifest['archiveSha256']:
        raise ValueError('Product variant media archive checksum differs')
    media, total_expanded = {}, 0
    try:
        with zipfile.ZipFile(stream) as archive:
            infos = archive.infolist()
            if len(infos) != manifest['memberCount']:
                raise ValueError('Product variant media package member count differs')
            for info in infos:
                name, mode = info.filename, info.external_attr >> 16
                if (name not in media_records or name in media or not product_media_match(name)
                        or info.is_dir() or stat.S_ISLNK(mode)
                        or stat.S_IFMT(mode) not in (0, stat.S_IFREG) or info.flag_bits & 1
                        or info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)):
                    raise ValueError('Unexpected or unsafe product variant media archive member')
                item = media_records[name]
                if info.file_size != item['bytes'] or not interface_integer(info.file_size, MAX_PRODUCT_MEDIA_BYTES):
                    raise ValueError('Product variant media package member size differs')
                total_expanded += info.file_size
                if total_expanded > MAX_PRODUCT_MEDIA_TOTAL_BYTES:
                    raise ValueError('Product variant media archive expands beyond limit')
                content = archive.read(info)
                if len(content) != item['bytes'] or sha256(content) != item['sha256']:
                    raise ValueError('Product variant media package member checksum differs')
                validate_product_media(name, content)
                media[name] = content
    except (zipfile.BadZipFile, RuntimeError, zlib.error) as error:
        raise ValueError('Invalid product variant media archive') from error
    if set(media) != set(media_records):
        raise ValueError('Product variant media archive does not cover active product entries')
    audit = {'manifestPath': 'sofa-publish/product-variant-media/product-variant-media-manifest.json',
             'manifestSha256': sha256(control_content), 'archiveSha256': manifest['archiveSha256'],
             'archiveBytes': manifest['archiveBytes'], 'memberCount': manifest['memberCount'],
             'parts': manifest['parts']}
    return media, audit


def apply_interface_overrides(package_root, restored, manifest, expected):
    """Apply a small allowlisted patch only after both base and patch verify."""
    control = package_root / 'sofa-publish' / 'interface-overrides.json'
    if not control.exists() and not control.is_symlink():
        return 0
    regular_source(control, package_root)
    if not 0 < control.stat().st_size <= MAX_INTERFACE_MANIFEST_BYTES:
        raise ValueError('Invalid sofa interface manifest size')
    overlay = json.loads(control.read_bytes().decode('utf-8'))
    if (not isinstance(overlay, dict)
            or set(overlay) != {'schemaVersion', 'application', 'baseArchiveSha256', 'files'}
            or overlay['schemaVersion'] != 1
            or overlay['application'] != 'studio-sofa-interface'
            or overlay['baseArchiveSha256'] != manifest['archiveSha256']):
        raise ValueError('Sofa interface base package differs')
    files = overlay['files']
    if not isinstance(files, list) or not 1 <= len(files) <= MAX_OVERLAY_FILES:
        raise ValueError('Invalid sofa interface file list')
    changes, seen, media_count, media_bytes, media_records = [], set(), 0, 0, {}
    product_count, product_bytes, product_records = 0, 0, {}
    for item in files:
        if (not isinstance(item, dict)
                or set(item) != {'path', 'expectedBaseSha256', 'expectedBaseBytes', 'sha256', 'bytes'}):
            raise ValueError('Invalid sofa interface file record')
        name = item['path']
        media = material_media_match(name)
        product_media = product_media_match(name)
        if not isinstance(name, str) or (name not in INTERFACE_FILES and not media and not product_media) or name in seen:
            raise ValueError('Unexpected or duplicate sofa interface file')
        seen.add(name)
        maximum = MAX_MATERIAL_MEDIA_BYTES if media else (MAX_PRODUCT_MEDIA_BYTES if product_media else interface_limit(name))
        if (not interface_integer(item['bytes'], maximum)
                or not interface_digest(item['sha256'])):
            raise ValueError('Invalid sofa interface file limits')
        if name in V118_EXISTING_ANCHORS and (item['expectedBaseSha256'], item['expectedBaseBytes']) != V118_EXISTING_ANCHORS[name]:
            raise ValueError('V118 runtime patch must retain its original V2 anchor')
        if name == 'app.js' and (item['expectedBaseSha256'] != APP_ORIGINAL_SHA256
                                 or type(item['expectedBaseBytes']) is not int
                                 or item['expectedBaseBytes'] != APP_ORIGINAL_BYTES):
            raise ValueError('Configurator patch must retain the original V2 app anchor')
        if media:
            media_count += 1
            media_bytes += item['bytes']
            if media_count > MAX_MATERIAL_MEDIA_FILES or media_bytes > MAX_MATERIAL_MEDIA_TOTAL_BYTES:
                raise ValueError('Material gallery media exceeds allowed limits')
            media_records[name] = item
        if product_media:
            product_count += 1
            product_bytes += item['bytes']
            if product_count > MAX_PRODUCT_MEDIA_FILES or product_bytes > MAX_PRODUCT_MEDIA_TOTAL_BYTES:
                raise ValueError('Product variant media exceeds allowed limits')
            product_records[name] = item
    bundled_media, bundle_audit = load_material_media_package(package_root, media_records)
    product_bundle, product_audit = load_product_media_package(package_root, product_records)
    bundled_media.update(product_bundle)
    for item in files:
        name = item['path']
        media = material_media_match(name)
        product_media = product_media_match(name)
        original = expected.get(name)
        installed = restored / name
        if item['expectedBaseSha256'] is None:
            if ((name not in NEW_INTERFACE_FILES and name not in V118_ADDITIONS and not media and not product_media) or type(item['expectedBaseBytes']) is not int
                    or item['expectedBaseBytes'] != 0 or original is not None
                    or installed.exists() or installed.is_symlink()):
                raise ValueError('Sofa interface addition collides with base member: ' + name)
        else:
            if media or product_media:
                raise ValueError('Gallery media must be new additions')
            if (not interface_integer(item['expectedBaseBytes'], interface_limit(name))
                    or not interface_digest(item['expectedBaseSha256'])
                    or not original or original['bytes'] != item['expectedBaseBytes']
                    or original['sha256'] != item['expectedBaseSha256']):
                raise ValueError('Sofa interface base member differs: ' + name)
            original_content = installed.read_bytes()
            if len(original_content) != item['expectedBaseBytes'] or sha256(original_content) != item['expectedBaseSha256']:
                raise ValueError('Restored sofa interface base differs: ' + name)
        source = package_root / 'sofa-publish' / 'interface-overrides' / name
        if (media or product_media) and name in bundled_media and not source.exists() and not source.is_symlink():
            content = bundled_media[name]
        else:
            regular_source(source, package_root)
            if source.stat().st_size != item['bytes']:
                raise ValueError('Sofa interface source size differs: ' + name)
            content = source.read_bytes()
        if len(content) != item['bytes'] or sha256(content) != item['sha256']:
            raise ValueError('Sofa interface source checksum differs: ' + name)
        if media:
            validate_material_media(name, content)
        elif product_media:
            validate_product_media(name, content)
        elif name == WORKBOOK_PATH:
            validate_xlsx(content)
        else:
            text = content.decode('utf-8')
            if name.endswith('.json'):
                json.loads(text)
        changes.append((name, content, item))
    audit_name = 'INTERFACE-OVERRIDES.json'
    if audit_name in expected:
        raise ValueError('Sofa interface audit member already exists')
    # Validation above reads every payload before any patch is installed. The
    # destination is still private temporary output until restore's final rename.
    for name, content, item in changes:
        (restored / name).parent.mkdir(parents=True, exist_ok=True)
        (restored / name).write_bytes(content)
        if sha256((restored / name).read_bytes()) != item['sha256']:
            raise ValueError('Installed sofa interface checksum differs')
        expected[name] = {'path': name, 'bytes': len(content), 'sha256': item['sha256']}
    audit = {'schemaVersion': 1, 'baseArchiveSha256': manifest['archiveSha256'],
             'baseMemberIntegrity': manifest['memberIntegrity'], 'files': files}
    if bundle_audit is not None:
        audit['materialMediaPackage'] = bundle_audit
    if product_audit is not None:
        audit['productVariantMediaPackage'] = product_audit
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
