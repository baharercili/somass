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
MAX_OVERLAY_FILES = 1792  # 1640 preserved records plus 80 editorial images and one new page.

SWATCH_CARD_IDS = frozenset(['mora-S01', 'mora-S02', 'mora-S03', 'mora-S04', 'mora-S05', 'mora-S06', 'mora-S07', 'mora-S08', 'mora-S09', 'mora-S10', 'mora-S11', 'mora-S12', 'mora-S13', 'mora-S14', 'mora-S15', 'mora-S16', 'mora-R01', 'mora-R02', 'mora-R03', 'mora-R04', 'mora-R05', 'mora-R06', 'mora-R07', 'mora-R08', 'mora-R09', 'mora-R10', 'mora-R11', 'mora-R12', 'mora-R13', 'mora-R14', 'mora-R15', 'mora-R16', 'mora-R17', 'soft-touch-457623001351', 'soft-touch-457623001355', 'soft-touch-457623001246', 'soft-touch-457623001024', 'soft-touch-457623001200', 'colormax-262962001015', 'colormax-262962001017', 'veronza-263267001008', 'veronza-263267001012', 'veronza-263267001030', 'veronza-263267001031', 'veronza-263267001035', 'veronza-263267001041', 'mora-official-1023', 'mora-reference-1036', 'mora-reference-1035', 'mora-reference-1008', 'mora-reference-1025', 'mora-reference-1019', 'mora-reference-1013', 'mora-reference-1009', 'mora-reference-1016'])
SWATCH_MEDIA_PATH = re.compile(r'assets/swatch-cards/v120/([A-Za-z0-9-]+)(\.thumb)?\.webp')
MAX_SWATCH_MEDIA_BYTES = 2 * 1024 * 1024
MAX_SWATCH_MEDIA_FILES = 110
MAX_SWATCH_MEDIA_TOTAL_BYTES = 64 * 1024 * 1024
MAX_SWATCH_ARCHIVE_BYTES = 64 * 1024 * 1024
MAX_SWATCH_PART_BYTES = 2 * 1024 * 1024
MAX_SWATCH_PARTS = 32

FOLDED_SWATCH_IDS = SWATCH_CARD_IDS
FOLDED_MEDIA_PATH = re.compile(r'assets/folded-swatches/v121/([A-Za-z0-9-]+)(\.thumb)?\.webp')
MAX_FOLDED_MEDIA_BYTES = 2 * 1024 * 1024
MAX_FOLDED_MEDIA_FILES = 110
MAX_FOLDED_MEDIA_TOTAL_BYTES = 64 * 1024 * 1024
MAX_FOLDED_ARCHIVE_BYTES = 64 * 1024 * 1024
MAX_FOLDED_PART_BYTES = 2 * 1024 * 1024
MAX_FOLDED_PARTS = 32


EDITORIAL_SCENE_IDS = frozenset(['editorial-01-window-swatchbook', 'editorial-02-contrast-desk', 'editorial-03-garden-greens', 'editorial-04-library-depth', 'editorial-05-blue-hour-studio', 'editorial-06-consultation-corner', 'editorial-07-linen-light', 'editorial-08-warm-diagonal', 'editorial-09-cool-diagonal', 'editorial-10-neutral-architecture', 'editorial-11-black-oak-palette', 'editorial-12-saffron-study', 'editorial-13-overlapping-fan', 'editorial-14-two-material-conversation', 'editorial-15-gallery-wall-gesture', 'editorial-16-copper-wall-selection', 'editorial-17-monochrome-wall', 'editorial-18-soft-neutral-drape', 'editorial-19-blue-wall-rhythm', 'editorial-20-evening-material-library'])
EDITORIAL_SHARE_BOUNDS = {'editorial-01-window-swatchbook': (1440, 1080), 'editorial-02-contrast-desk': (1080, 1080), 'editorial-03-garden-greens': (1080, 1350), 'editorial-04-library-depth': (900, 1600), 'editorial-05-blue-hour-studio': (1600, 900), 'editorial-06-consultation-corner': (1440, 1080), 'editorial-07-linen-light': (1080, 1080), 'editorial-08-warm-diagonal': (1080, 1350), 'editorial-09-cool-diagonal': (900, 1600), 'editorial-10-neutral-architecture': (1600, 900), 'editorial-11-black-oak-palette': (1440, 1080), 'editorial-12-saffron-study': (1080, 1080), 'editorial-13-overlapping-fan': (1080, 1350), 'editorial-14-two-material-conversation': (900, 1600), 'editorial-15-gallery-wall-gesture': (1600, 900), 'editorial-16-copper-wall-selection': (1440, 1080), 'editorial-17-monochrome-wall': (1080, 1080), 'editorial-18-soft-neutral-drape': (1080, 1350), 'editorial-19-blue-wall-rhythm': (900, 1600), 'editorial-20-evening-material-library': (1600, 900)}
EDITORIAL_FILENAMES = frozenset({'web.webp', 'original.jpg', 'share.jpg', 'thumb.webp'})
EDITORIAL_MEDIA_PATH = re.compile(r'assets/editorial/v122/([^/]+)/(web\.webp|original\.jpg|share\.jpg|thumb\.webp)')
MAX_EDITORIAL_MEDIA_BYTES = 6 * 1024 * 1024
MAX_EDITORIAL_MEDIA_FILES = 80
MAX_EDITORIAL_MEDIA_TOTAL_BYTES = 128 * 1024 * 1024
MAX_EDITORIAL_ARCHIVE_BYTES = 128 * 1024 * 1024
MAX_EDITORIAL_PART_BYTES = 2 * 1024 * 1024
MAX_EDITORIAL_PARTS = 64

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
INTERFACE_FILES = INTERFACE_FILES | frozenset({'kumas-hikayeleri.html'})
NEW_INTERFACE_FILES = NEW_INTERFACE_FILES | frozenset({'kumas-hikayeleri.html'})
XLSX_MAX_EXPANDED_BYTES = 32 * 1024 * 1024
XLSX_MAX_MEMBERS = 1000
SHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
CONTENT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types'




def swatch_media_match(name):
    match = SWATCH_MEDIA_PATH.fullmatch(name) if isinstance(name, str) else None
    return match if match and match.group(1) in SWATCH_CARD_IDS else None


def validate_swatch_media(name, content):
    """Accept one approved still portrait WebP, at its genuine native size."""
    match = swatch_media_match(name)
    if (not match or len(content) < 30 or len(content) > MAX_SWATCH_MEDIA_BYTES
            or content[:4] != b'RIFF' or content[8:12] != b'WEBP'
            or int.from_bytes(content[4:8], 'little') != len(content) - 8):
        raise ValueError('Swatch card WebP signature or path differs')
    cursor, dimensions, canvas, frames, canvases = 12, None, None, 0, 0
    while cursor < len(content):
        if cursor + 8 > len(content):
            raise ValueError('Truncated swatch card WebP chunk')
        kind = content[cursor:cursor + 4]
        size = int.from_bytes(content[cursor + 4:cursor + 8], 'little')
        start, end = cursor + 8, cursor + 8 + size
        if end + (size & 1) > len(content) or kind in (b'ANIM', b'ANMF'):
            raise ValueError('Invalid or animated swatch card WebP')
        data = content[start:end]
        if kind == b'VP8X':
            if len(data) != 10 or data[0] & 2 or canvases or frames:
                raise ValueError('Invalid or animated swatch card WebP canvas')
            canvas = (int.from_bytes(data[4:7], 'little') + 1, int.from_bytes(data[7:10], 'little') + 1)
            canvases += 1
        elif kind == b'VP8 ':
            if len(data) < 10 or data[3:6] != b'\x9d\x01\x2a':
                raise ValueError('Invalid swatch card VP8 frame')
            dimensions = (int.from_bytes(data[6:8], 'little') & 0x3fff, int.from_bytes(data[8:10], 'little') & 0x3fff)
            frames += 1
        elif kind == b'VP8L':
            if len(data) < 5 or data[0] != 0x2f:
                raise ValueError('Invalid swatch card VP8L frame')
            bits = int.from_bytes(data[1:5], 'little')
            dimensions = ((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
            frames += 1
        cursor = end + (size & 1)
    if frames != 1 or (canvas is not None and canvas != dimensions):
        raise ValueError('Swatch card WebP frame or canvas differs')
    width, height = dimensions
    if match.group(2):
        valid = (width, height) == (300, 400)
    else:
        valid = width > 300 and height > 400 and width * 4 == height * 3 and max(width, height) <= 1600
    if not valid:
        raise ValueError('Swatch card WebP dimensions differ')


def folded_media_match(name):
    match = FOLDED_MEDIA_PATH.fullmatch(name) if isinstance(name, str) else None
    return match if match and match.group(1) in FOLDED_SWATCH_IDS else None


def validate_folded_media(name, content):
    """Accept one approved still portrait WebP, at its genuine native size."""
    match = folded_media_match(name)
    if (not match or len(content) < 30 or len(content) > MAX_FOLDED_MEDIA_BYTES
            or content[:4] != b'RIFF' or content[8:12] != b'WEBP'
            or int.from_bytes(content[4:8], 'little') != len(content) - 8):
        raise ValueError('Folded swatch WebP signature or path differs')
    cursor, dimensions, canvas, frames, canvases = 12, None, None, 0, 0
    while cursor < len(content):
        if cursor + 8 > len(content):
            raise ValueError('Truncated folded swatch WebP chunk')
        kind = content[cursor:cursor + 4]
        size = int.from_bytes(content[cursor + 4:cursor + 8], 'little')
        start, end = cursor + 8, cursor + 8 + size
        if end + (size & 1) > len(content) or kind in (b'ANIM', b'ANMF'):
            raise ValueError('Invalid or animated folded swatch WebP')
        data = content[start:end]
        if kind == b'VP8X':
            if len(data) != 10 or data[0] & 2 or canvases or frames:
                raise ValueError('Invalid or animated folded swatch WebP canvas')
            canvas = (int.from_bytes(data[4:7], 'little') + 1, int.from_bytes(data[7:10], 'little') + 1)
            canvases += 1
        elif kind == b'VP8 ':
            if len(data) < 10 or data[3:6] != b'\x9d\x01\x2a':
                raise ValueError('Invalid folded swatch VP8 frame')
            dimensions = (int.from_bytes(data[6:8], 'little') & 0x3fff, int.from_bytes(data[8:10], 'little') & 0x3fff)
            frames += 1
        elif kind == b'VP8L':
            if len(data) < 5 or data[0] != 0x2f:
                raise ValueError('Invalid folded swatch VP8L frame')
            bits = int.from_bytes(data[1:5], 'little')
            dimensions = ((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
            frames += 1
        cursor = end + (size & 1)
    if frames != 1 or (canvas is not None and canvas != dimensions):
        raise ValueError('Folded swatch WebP frame or canvas differs')
    width, height = dimensions
    if match.group(2):
        valid = (width, height) == (300, 400)
    else:
        valid = width > 300 and height > 400 and width * 4 == height * 3 and max(width, height) <= 1600
    if not valid:
        raise ValueError('Folded swatch WebP dimensions differ')




def editorial_media_match(name):
    match = EDITORIAL_MEDIA_PATH.fullmatch(name) if isinstance(name, str) else None
    return match if match and match.group(1) in EDITORIAL_SCENE_IDS else None


def editorial_jpeg_dimensions(content):
    validate_material_media('assets/material-gallery/' + sha256(content) + '.jpg', content)
    cursor, dimensions, entropy, scans = 2, None, False, 0
    while cursor < len(content):
        if entropy:
            cursor = content.find(b'\xff', cursor)
            if cursor < 0 or cursor + 1 >= len(content):
                raise ValueError('Unfinished editorial JPEG scan')
            marker = content[cursor + 1]
            if marker == 0x00 or 0xd0 <= marker <= 0xd7:
                cursor += 2
                continue
            if marker == 0xff:
                cursor += 1
                continue
            entropy = False
        if cursor >= len(content) or content[cursor] != 0xff:
            raise ValueError('Invalid editorial JPEG marker')
        while content[cursor] == 0xff:
            cursor += 1
            if cursor >= len(content):
                raise ValueError('Truncated editorial JPEG marker')
        marker = content[cursor]
        cursor += 1
        if marker == 0xd9:
            if cursor != len(content) or dimensions is None or not scans:
                raise ValueError('Editorial JPEG has trailing or missing image data')
            return dimensions
        if marker in (0x00, 0xd8):
            raise ValueError('Invalid or multiple-image editorial JPEG')
        if marker == 0x01 or 0xd0 <= marker <= 0xd7:
            continue
        if cursor + 2 > len(content):
            raise ValueError('Truncated editorial JPEG segment')
        size = int.from_bytes(content[cursor:cursor + 2], 'big')
        if size < 2 or cursor + size > len(content):
            raise ValueError('Invalid editorial JPEG segment length')
        if marker == 0xe2 and content[cursor + 2:cursor + 6] == b'MPF\0':
            raise ValueError('Multiple-picture editorial JPEG is not allowed')
        if marker in (0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf):
            if dimensions is not None:
                raise ValueError('Multiple editorial JPEG frames')
            height, width = struct.unpack('>HH', content[cursor + 3:cursor + 7])
            dimensions = (width, height)
        if marker == 0xda:
            scans += 1
            entropy = True
        cursor += size
    raise ValueError('Editorial JPEG image frame missing')


def validate_editorial_media(name, content):
    match = editorial_media_match(name)
    if not match or not 0 < len(content) <= MAX_EDITORIAL_MEDIA_BYTES:
        raise ValueError('Editorial image path or size differs')
    dimensions = editorial_jpeg_dimensions(content) if name.endswith('.jpg') else editorial_webp_dimensions(name, content)
    if (not dimensions or min(dimensions) <= 0 or max(dimensions) > 2400
            or max(dimensions) > 3 * min(dimensions)):
        raise ValueError('Editorial image dimensions exceed the approved bounds')
    return dimensions


def validate_editorial_scene_set(dimensions):
    expected = {'assets/editorial/v122/' + scene + '/' + name for scene in EDITORIAL_SCENE_IDS for name in EDITORIAL_FILENAMES}
    if set(dimensions) != expected:
        raise ValueError('Editorial package must contain all twenty scenes and four exact formats')
    for scene in EDITORIAL_SCENE_IDS:
        prefix = 'assets/editorial/v122/' + scene + '/'
        native = dimensions[prefix + 'original.jpg']
        if dimensions[prefix + 'web.webp'] != native:
            raise ValueError('Editorial WebP and original JPEG must retain the same native dimensions')
        for filename, bounds in [('share.jpg', EDITORIAL_SHARE_BOUNDS[scene]), ('thumb.webp', (320, 400))]:
            width, height = dimensions[prefix + filename]
            scale = min(1, bounds[0] / native[0], bounds[1] / native[1])
            if (width > min(native[0], bounds[0]) or height > min(native[1], bounds[1])
                    or abs(width - native[0] * scale) > 1 or abs(height - native[1] * scale) > 1):
                raise ValueError('Editorial share and thumbnail must fit down proportionally without cropping or upscaling')


def editorial_webp_dimensions(name, content):
    """Accept one approved still portrait WebP, at its genuine native size."""
    match = editorial_media_match(name)
    if (not match or len(content) < 30 or len(content) > MAX_EDITORIAL_MEDIA_BYTES
            or content[:4] != b'RIFF' or content[8:12] != b'WEBP'
            or int.from_bytes(content[4:8], 'little') != len(content) - 8):
        raise ValueError('Editorial WebP signature or path differs')
    cursor, dimensions, canvas, frames, canvases = 12, None, None, 0, 0
    while cursor < len(content):
        if cursor + 8 > len(content):
            raise ValueError('Truncated editorial WebP chunk')
        kind = content[cursor:cursor + 4]
        size = int.from_bytes(content[cursor + 4:cursor + 8], 'little')
        start, end = cursor + 8, cursor + 8 + size
        if end + (size & 1) > len(content) or kind in (b'ANIM', b'ANMF'):
            raise ValueError('Invalid or animated editorial WebP')
        data = content[start:end]
        if kind == b'VP8X':
            if len(data) != 10 or data[0] & 2 or canvases or frames:
                raise ValueError('Invalid or animated editorial WebP canvas')
            canvas = (int.from_bytes(data[4:7], 'little') + 1, int.from_bytes(data[7:10], 'little') + 1)
            canvases += 1
        elif kind == b'VP8 ':
            if len(data) < 10 or data[3:6] != b'\x9d\x01\x2a':
                raise ValueError('Invalid editorial VP8 frame')
            dimensions = (int.from_bytes(data[6:8], 'little') & 0x3fff, int.from_bytes(data[8:10], 'little') & 0x3fff)
            frames += 1
        elif kind == b'VP8L':
            if len(data) < 5 or data[0] != 0x2f:
                raise ValueError('Invalid editorial VP8L frame')
            bits = int.from_bytes(data[1:5], 'little')
            dimensions = ((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
            frames += 1
        cursor = end + (size & 1)
    if frames != 1 or (canvas is not None and canvas != dimensions):
        raise ValueError('Editorial WebP frame or canvas differs')
    return dimensions


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


def load_swatch_media_package(package_root, media_records):
    """Read a verified optional media ZIP without extracting paths into checkout."""
    folder = package_root / 'sofa-publish' / 'swatch-card-media'
    control = folder / 'swatch-card-media-manifest.json'
    if not control.exists() and not control.is_symlink():
        return {}, None
    regular_source(control, package_root)
    if not 0 < control.stat().st_size <= 64 * 1024:
        raise ValueError('Invalid swatch card media manifest size')
    control_content = control.read_bytes()
    manifest = json.loads(control_content.decode('utf-8'))
    if (not isinstance(manifest, dict)
            or set(manifest) != {'schemaVersion', 'application', 'archiveSha256', 'archiveBytes', 'memberCount', 'parts'}
            or manifest['schemaVersion'] != 1
            or manifest['application'] != 'studio-sofa-swatch-card-media'
            or not interface_digest(manifest['archiveSha256'])
            or not interface_integer(manifest['archiveBytes'], MAX_SWATCH_ARCHIVE_BYTES)
            or type(manifest['memberCount']) is not int
            or manifest['memberCount'] != len(media_records) or not media_records
            or not isinstance(manifest['parts'], list) or not 1 <= len(manifest['parts']) <= MAX_SWATCH_PARTS):
        raise ValueError('Invalid swatch card media package manifest')
    stream, whole, total = io.BytesIO(), hashlib.sha256(), 0
    for index, item in enumerate(manifest['parts'], 1):
        if (not isinstance(item, dict) or set(item) != {'name', 'bytes', 'sha256'}
                or item['name'] != f'swatch-card-media.part-{index:04d}'
                or not interface_integer(item['bytes'], MAX_SWATCH_PART_BYTES)
                or not interface_digest(item['sha256'])):
            raise ValueError('Unexpected swatch card media package part')
        source = folder / item['name']
        regular_source(source, package_root)
        if source.stat().st_size != item['bytes']:
            raise ValueError('Swatch card media package part size differs')
        content = source.read_bytes()
        if len(content) != item['bytes'] or sha256(content) != item['sha256']:
            raise ValueError('Swatch card media package part checksum differs')
        total += len(content)
        if total > manifest['archiveBytes']:
            raise ValueError('Swatch card media package exceeds expected size')
        stream.write(content)
        whole.update(content)
    if total != manifest['archiveBytes'] or whole.hexdigest() != manifest['archiveSha256']:
        raise ValueError('Swatch card media archive checksum differs')
    media, total_expanded = {}, 0
    try:
        with zipfile.ZipFile(stream) as archive:
            infos = archive.infolist()
            if len(infos) != manifest['memberCount']:
                raise ValueError('Swatch card media package member count differs')
            for info in infos:
                name, mode = info.filename, info.external_attr >> 16
                if (name not in media_records or name in media or not swatch_media_match(name)
                        or info.is_dir() or stat.S_ISLNK(mode)
                        or stat.S_IFMT(mode) not in (0, stat.S_IFREG) or info.flag_bits & 1
                        or info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)):
                    raise ValueError('Unexpected or unsafe swatch card media archive member')
                item = media_records[name]
                if info.file_size != item['bytes'] or not interface_integer(info.file_size, MAX_SWATCH_MEDIA_BYTES):
                    raise ValueError('Swatch card media package member size differs')
                total_expanded += info.file_size
                if total_expanded > MAX_SWATCH_MEDIA_TOTAL_BYTES:
                    raise ValueError('Swatch card media archive expands beyond limit')
                content = archive.read(info)
                if len(content) != item['bytes'] or sha256(content) != item['sha256']:
                    raise ValueError('Swatch card media package member checksum differs')
                validate_swatch_media(name, content)
                media[name] = content
    except (zipfile.BadZipFile, RuntimeError, zlib.error) as error:
        raise ValueError('Invalid swatch card media archive') from error
    if set(media) != set(media_records):
        raise ValueError('Swatch card media archive does not cover active swatch card entries')
    audit = {'manifestPath': 'sofa-publish/swatch-card-media/swatch-card-media-manifest.json',
             'manifestSha256': sha256(control_content), 'archiveSha256': manifest['archiveSha256'],
             'archiveBytes': manifest['archiveBytes'], 'memberCount': manifest['memberCount'],
             'parts': manifest['parts']}
    return media, audit


def load_folded_media_package(package_root, media_records):
    """Read a verified optional media ZIP without extracting paths into checkout."""
    folder = package_root / 'sofa-publish' / 'folded-swatch-media'
    control = folder / 'folded-swatch-media-manifest.json'
    if not control.exists() and not control.is_symlink():
        return {}, None
    regular_source(control, package_root)
    if not 0 < control.stat().st_size <= 64 * 1024:
        raise ValueError('Invalid folded swatch media manifest size')
    control_content = control.read_bytes()
    manifest = json.loads(control_content.decode('utf-8'))
    if (not isinstance(manifest, dict)
            or set(manifest) != {'schemaVersion', 'application', 'archiveSha256', 'archiveBytes', 'memberCount', 'parts'}
            or manifest['schemaVersion'] != 1
            or manifest['application'] != 'studio-sofa-folded-swatch-media'
            or not interface_digest(manifest['archiveSha256'])
            or not interface_integer(manifest['archiveBytes'], MAX_FOLDED_ARCHIVE_BYTES)
            or type(manifest['memberCount']) is not int
            or manifest['memberCount'] != len(media_records) or not media_records
            or not isinstance(manifest['parts'], list) or not 1 <= len(manifest['parts']) <= MAX_FOLDED_PARTS):
        raise ValueError('Invalid folded swatch media package manifest')
    stream, whole, total = io.BytesIO(), hashlib.sha256(), 0
    for index, item in enumerate(manifest['parts'], 1):
        if (not isinstance(item, dict) or set(item) != {'name', 'bytes', 'sha256'}
                or item['name'] != f'folded-swatch-media.part-{index:04d}'
                or not interface_integer(item['bytes'], MAX_FOLDED_PART_BYTES)
                or not interface_digest(item['sha256'])):
            raise ValueError('Unexpected folded swatch media package part')
        source = folder / item['name']
        regular_source(source, package_root)
        if source.stat().st_size != item['bytes']:
            raise ValueError('Folded swatch media package part size differs')
        content = source.read_bytes()
        if len(content) != item['bytes'] or sha256(content) != item['sha256']:
            raise ValueError('Folded swatch media package part checksum differs')
        total += len(content)
        if total > manifest['archiveBytes']:
            raise ValueError('Folded swatch media package exceeds expected size')
        stream.write(content)
        whole.update(content)
    if total != manifest['archiveBytes'] or whole.hexdigest() != manifest['archiveSha256']:
        raise ValueError('Folded swatch media archive checksum differs')
    media, total_expanded = {}, 0
    try:
        with zipfile.ZipFile(stream) as archive:
            infos = archive.infolist()
            if len(infos) != manifest['memberCount']:
                raise ValueError('Folded swatch media package member count differs')
            for info in infos:
                name, mode = info.filename, info.external_attr >> 16
                if (name not in media_records or name in media or not folded_media_match(name)
                        or info.is_dir() or stat.S_ISLNK(mode)
                        or stat.S_IFMT(mode) not in (0, stat.S_IFREG) or info.flag_bits & 1
                        or info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)):
                    raise ValueError('Unexpected or unsafe folded swatch media archive member')
                item = media_records[name]
                if info.file_size != item['bytes'] or not interface_integer(info.file_size, MAX_FOLDED_MEDIA_BYTES):
                    raise ValueError('Folded swatch media package member size differs')
                total_expanded += info.file_size
                if total_expanded > MAX_FOLDED_MEDIA_TOTAL_BYTES:
                    raise ValueError('Folded swatch media archive expands beyond limit')
                content = archive.read(info)
                if len(content) != item['bytes'] or sha256(content) != item['sha256']:
                    raise ValueError('Folded swatch media package member checksum differs')
                validate_folded_media(name, content)
                media[name] = content
    except (zipfile.BadZipFile, RuntimeError, zlib.error) as error:
        raise ValueError('Invalid folded swatch media archive') from error
    if set(media) != set(media_records):
        raise ValueError('Folded swatch media archive does not cover active folded swatch entries')
    audit = {'manifestPath': 'sofa-publish/folded-swatch-media/folded-swatch-media-manifest.json',
             'manifestSha256': sha256(control_content), 'archiveSha256': manifest['archiveSha256'],
             'archiveBytes': manifest['archiveBytes'], 'memberCount': manifest['memberCount'],
             'parts': manifest['parts']}
    return media, audit


def load_editorial_media_package(package_root, media_records):
    """Read a verified optional media ZIP without extracting paths into checkout."""
    folder = package_root / 'sofa-publish' / 'editorial-media'
    control = folder / 'editorial-media-manifest.json'
    if not control.exists() and not control.is_symlink():
        if media_records:
            raise ValueError('Editorial images require the exact dimensioned bundle manifest')
        return {}, None
    regular_source(control, package_root)
    if not 0 < control.stat().st_size <= 64 * 1024:
        raise ValueError('Invalid editorial media manifest size')
    control_content = control.read_bytes()
    manifest = json.loads(control_content.decode('utf-8'))
    if (not isinstance(manifest, dict)
            or set(manifest) != {'schemaVersion', 'application', 'archiveSha256', 'archiveBytes', 'memberCount', 'parts', 'images'}
            or manifest['schemaVersion'] != 1
            or manifest['application'] != 'studio-sofa-editorial-media'
            or not interface_digest(manifest['archiveSha256'])
            or not interface_integer(manifest['archiveBytes'], MAX_EDITORIAL_ARCHIVE_BYTES)
            or type(manifest['memberCount']) is not int
            or manifest['memberCount'] != len(media_records) or len(media_records) != 80
            or not isinstance(manifest['parts'], list) or not 1 <= len(manifest['parts']) <= MAX_EDITORIAL_PARTS):
        raise ValueError('Invalid editorial media package manifest')
    image_records = manifest['images']
    expected_paths = {'assets/editorial/v122/' + scene + '/' + name for scene in EDITORIAL_SCENE_IDS for name in EDITORIAL_FILENAMES}
    if (not isinstance(image_records, list) or len(image_records) != 80
            or set(media_records) != expected_paths):
        raise ValueError('Invalid editorial image dimension manifest')
    images = {}
    for image in image_records:
        if (not isinstance(image, dict) or set(image) != {'path', 'width', 'height', 'mime'}
                or not isinstance(image['path'], str) or image['path'] not in media_records or image['path'] in images
                or not interface_integer(image['width'], 2400) or not interface_integer(image['height'], 2400)
                or image['mime'] != ('image/jpeg' if image['path'].endswith('.jpg') else 'image/webp')):
            raise ValueError('Invalid or duplicate editorial image dimensions')
        images[image['path']] = image
    if set(images) != expected_paths:
        raise ValueError('Editorial dimensions do not cover active image paths')
    stream, whole, total = io.BytesIO(), hashlib.sha256(), 0
    for index, item in enumerate(manifest['parts'], 1):
        if (not isinstance(item, dict) or set(item) != {'name', 'bytes', 'sha256'}
                or item['name'] != f'editorial-media.part-{index:04d}'
                or not interface_integer(item['bytes'], MAX_EDITORIAL_PART_BYTES)
                or not interface_digest(item['sha256'])):
            raise ValueError('Unexpected editorial media package part')
        source = folder / item['name']
        regular_source(source, package_root)
        if source.stat().st_size != item['bytes']:
            raise ValueError('Editorial media package part size differs')
        content = source.read_bytes()
        if len(content) != item['bytes'] or sha256(content) != item['sha256']:
            raise ValueError('Editorial media package part checksum differs')
        total += len(content)
        if total > manifest['archiveBytes']:
            raise ValueError('Editorial media package exceeds expected size')
        stream.write(content)
        whole.update(content)
    if total != manifest['archiveBytes'] or whole.hexdigest() != manifest['archiveSha256']:
        raise ValueError('Editorial media archive checksum differs')
    media, total_expanded, image_sizes = {}, 0, {}
    try:
        with zipfile.ZipFile(stream) as archive:
            infos = archive.infolist()
            if len(infos) != manifest['memberCount']:
                raise ValueError('Editorial media package member count differs')
            for info in infos:
                name, mode = info.filename, info.external_attr >> 16
                if (name not in media_records or name in media or not editorial_media_match(name)
                        or info.is_dir() or stat.S_ISLNK(mode)
                        or stat.S_IFMT(mode) not in (0, stat.S_IFREG) or info.flag_bits & 1
                        or info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)):
                    raise ValueError('Unexpected or unsafe editorial media archive member')
                item = media_records[name]
                if info.file_size != item['bytes'] or not interface_integer(info.file_size, MAX_EDITORIAL_MEDIA_BYTES):
                    raise ValueError('Editorial media package member size differs')
                total_expanded += info.file_size
                if total_expanded > MAX_EDITORIAL_MEDIA_TOTAL_BYTES:
                    raise ValueError('Editorial media archive expands beyond limit')
                content = archive.read(info)
                if len(content) != item['bytes'] or sha256(content) != item['sha256']:
                    raise ValueError('Editorial media package member checksum differs')
                image_sizes[name] = validate_editorial_media(name, content)
                if image_sizes[name] != (images[name]['width'], images[name]['height']):
                    raise ValueError('Editorial image dimensions differ from the exact package metadata')
                media[name] = content
    except (zipfile.BadZipFile, RuntimeError, zlib.error) as error:
        raise ValueError('Invalid editorial media archive') from error
    if set(media) != set(media_records):
        raise ValueError('Editorial media archive does not cover active editorial entries')
    validate_editorial_scene_set(image_sizes)
    audit = {'manifestPath': 'sofa-publish/editorial-media/editorial-media-manifest.json',
             'manifestSha256': sha256(control_content), 'archiveSha256': manifest['archiveSha256'],
             'archiveBytes': manifest['archiveBytes'], 'memberCount': manifest['memberCount'],
             'parts': manifest['parts'], 'images': image_records}
    return media, audit



VIDEO_SCENE_IDS = frozenset(['kumas-ve-renk', 'govde-ve-yastik', 'ahsap-tonlari', 'modul-ekle', 'sirt-hareketi'])
VIDEO_FILENAMES = frozenset({'film.mp4', 'poster.webp'})
VIDEO_MEDIA_PATH = re.compile(r'assets/animations/v125/([^/]+)/(film\.mp4|poster\.webp)')
VIDEO_WIDTH, VIDEO_HEIGHT, VIDEO_FPS, VIDEO_DURATION_SECONDS, VIDEO_FRAME_COUNT = 1280, 720, 24, 12, 288
MAX_VIDEO_MP4_BYTES = 4 * 1024 * 1024
MAX_VIDEO_POSTER_BYTES = 1 * 1024 * 1024
MAX_VIDEO_MEDIA_FILES = 10
MAX_VIDEO_MEDIA_TOTAL_BYTES = 16 * 1024 * 1024
MAX_VIDEO_ARCHIVE_BYTES = 16 * 1024 * 1024
MAX_VIDEO_PART_BYTES = 2 * 1024 * 1024
MAX_VIDEO_PARTS = 8
INTERFACE_FILES = INTERFACE_FILES | frozenset({'soff-hareket-hikayeleri.html'})
NEW_INTERFACE_FILES = NEW_INTERFACE_FILES | frozenset({'soff-hareket-hikayeleri.html'})
INTERFACE_FILES = INTERFACE_FILES | frozenset({'ana-sayfa.html'})
NEW_INTERFACE_FILES = NEW_INTERFACE_FILES | frozenset({'ana-sayfa.html'})


def video_webp_dimensions(name, content):
    """Accept one approved still portrait WebP, at its genuine native size."""
    match = video_media_match(name)
    if (not match or len(content) < 30 or len(content) > MAX_VIDEO_POSTER_BYTES
            or content[:4] != b'RIFF' or content[8:12] != b'WEBP'
            or int.from_bytes(content[4:8], 'little') != len(content) - 8):
        raise ValueError('Video poster WebP signature or path differs')
    cursor, dimensions, canvas, frames, canvases = 12, None, None, 0, 0
    while cursor < len(content):
        if cursor + 8 > len(content):
            raise ValueError('Truncated video poster WebP chunk')
        kind = content[cursor:cursor + 4]
        size = int.from_bytes(content[cursor + 4:cursor + 8], 'little')
        start, end = cursor + 8, cursor + 8 + size
        if end + (size & 1) > len(content) or kind in (b'ANIM', b'ANMF'):
            raise ValueError('Invalid or animated video poster WebP')
        data = content[start:end]
        if kind == b'VP8X':
            if len(data) != 10 or data[0] & 2 or canvases or frames:
                raise ValueError('Invalid or animated video poster WebP canvas')
            canvas = (int.from_bytes(data[4:7], 'little') + 1, int.from_bytes(data[7:10], 'little') + 1)
            canvases += 1
        elif kind == b'VP8 ':
            if len(data) < 10 or data[3:6] != b'\x9d\x01\x2a':
                raise ValueError('Invalid video poster VP8 frame')
            dimensions = (int.from_bytes(data[6:8], 'little') & 0x3fff, int.from_bytes(data[8:10], 'little') & 0x3fff)
            frames += 1
        elif kind == b'VP8L':
            if len(data) < 5 or data[0] != 0x2f:
                raise ValueError('Invalid video poster VP8L frame')
            bits = int.from_bytes(data[1:5], 'little')
            dimensions = ((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
            frames += 1
        cursor = end + (size & 1)
    if frames != 1 or (canvas is not None and canvas != dimensions):
        raise ValueError('Video poster WebP frame or canvas differs')
    return dimensions

def video_media_match(name):
    match = VIDEO_MEDIA_PATH.fullmatch(name) if isinstance(name, str) else None
    return match if match and match.group(1) in VIDEO_SCENE_IDS else None


def video_media_limit(name):
    return MAX_VIDEO_MP4_BYTES if name.endswith('/film.mp4') else MAX_VIDEO_POSTER_BYTES


def video_boxes(content, start=0, end=None):
    end = len(content) if end is None else end
    result, cursor = [], start
    while cursor < end:
        if cursor + 8 > end or len(result) >= 4096:
            raise ValueError('Truncated or excessive video boxes')
        size, kind = struct.unpack('>I4s', content[cursor:cursor + 8])
        header = 8
        if size == 1:
            if cursor + 16 > end:
                raise ValueError('Truncated extended video box')
            size, header = int.from_bytes(content[cursor + 8:cursor + 16], 'big'), 16
        if size < header or cursor + size > end:
            raise ValueError('Invalid video box length')
        result.append((kind, cursor + header, cursor + size, cursor))
        cursor += size
    if cursor != end:
        raise ValueError('Unfinished video box sequence')
    return result


def video_one(boxes, kind):
    found = [box for box in boxes if box[0] == kind]
    if len(found) != 1:
        raise ValueError('Required unique video box missing: ' + repr(kind))
    return found[0]


def video_duration(content, box):
    _, start, end, _ = box
    if start + 4 > end or content[start + 1:start + 4] != b'\0\0\0':
        raise ValueError('Invalid video full box')
    version = content[start]
    scale_offset, duration_offset, size = (12, 16, 4) if version == 0 else (20, 24, 8)
    if version not in (0, 1) or start + duration_offset + size > end:
        raise ValueError('Invalid video duration record')
    scale = int.from_bytes(content[start + scale_offset:start + scale_offset + 4], 'big')
    ticks = int.from_bytes(content[start + duration_offset:start + duration_offset + size], 'big')
    if not 0 < scale <= 1000000000 or ticks != VIDEO_DURATION_SECONDS * scale:
        raise ValueError('Video must have its approved twelve-second duration')
    return scale, ticks


def video_sps_dimensions(nal):
    if len(nal) < 5 or nal[0] & 0x80 or nal[0] & 31 != 7:
        raise ValueError('Invalid H264 sequence parameter set')
    data = re.sub(b'\x00\x00\x03', b'\x00\x00', nal[1:])
    position = 0
    def bits(count):
        nonlocal position
        if count < 0 or position + count > len(data) * 8:
            raise ValueError('Truncated H264 sequence parameters')
        value = 0
        for _ in range(count):
            value = (value << 1) | ((data[position // 8] >> (7 - position % 8)) & 1)
            position += 1
        return value
    def ue():
        zeros = 0
        while not bits(1):
            zeros += 1
            if zeros > 31:
                raise ValueError('Oversized H264 sequence integer')
        return (1 << zeros) - 1 + bits(zeros)
    def se():
        value = ue()
        return (value + 1) // 2 if value & 1 else -(value // 2)
    profile = bits(8)
    bits(8);bits(8);ue()
    if profile != 100 or ue() != 1 or ue() != 0 or ue() != 0:
        raise ValueError('Video must be H264 High, eight-bit 4:2:0')
    bits(1)
    if bits(1):
        for index in range(8):
            if bits(1):
                last, next_scale = 8, 8
                for _ in range(16 if index < 6 else 64):
                    if next_scale:
                        next_scale = (last + se() + 256) % 256
                    last = next_scale or last
    ue()
    order_type = ue()
    if order_type == 0:
        ue()
    elif order_type == 1:
        bits(1);se();se();cycle = ue()
        if cycle > 255:
            raise ValueError('Excessive H264 ordering cycle')
        for _ in range(cycle):se()
    elif order_type != 2:
        raise ValueError('Invalid H264 ordering type')
    ue();bits(1)
    width, height = (ue() + 1) * 16, (ue() + 1) * 16
    if bits(1) != 1:
        raise ValueError('Interlaced video is outside the approved contract')
    bits(1)
    if bits(1):
        left, right, top, bottom = ue(), ue(), ue(), ue()
        width -= 2 * (left + right)
        height -= 2 * (top + bottom)
    if (width, height) != (VIDEO_WIDTH, VIDEO_HEIGHT):
        raise ValueError('H264 sequence dimensions differ from the approved native frames')
    if not bits(1):
        raise ValueError('H264 BT709 VUI metadata missing')
    if bits(1):
        if bits(8) == 255:bits(16);bits(16)
    if bits(1):bits(1)
    if not bits(1):
        raise ValueError('H264 video-signal metadata missing')
    bits(3);bits(1)
    if not bits(1) or (bits(8), bits(8), bits(8)) != (1, 1, 1):
        raise ValueError('H264 must declare BT709 colour primaries, transfer and matrix')
    return width, height


def video_avcc(content):
    if len(content) < 7 or content[0] != 1 or content[1] != 100 or content[4] & 3 != 3:
        raise ValueError('Video requires H264 High AVC with four-byte NAL lengths')
    cursor, dimensions = 6, []
    sps_count = content[5] & 31
    if not 1 <= sps_count <= 8:
        raise ValueError('Invalid H264 SPS count')
    for _ in range(sps_count):
        if cursor + 2 > len(content):raise ValueError('Truncated AVC parameter length')
        size = int.from_bytes(content[cursor:cursor + 2], 'big');cursor += 2
        if size == 0 or cursor + size > len(content):raise ValueError('Truncated AVC parameter set')
        dimensions.append(video_sps_dimensions(content[cursor:cursor + size]));cursor += size
    if cursor >= len(content) or not 1 <= content[cursor] <= 32:
        raise ValueError('Invalid H264 PPS count')
    pps_count = content[cursor];cursor += 1
    for _ in range(pps_count):
        if cursor + 2 > len(content):raise ValueError('Truncated AVC picture parameter length')
        size = int.from_bytes(content[cursor:cursor + 2], 'big');cursor += 2
        if size == 0 or cursor + size > len(content) or content[cursor] & 0x80 or content[cursor] & 31 != 8:
            raise ValueError('Invalid AVC picture parameter set')
        cursor += size
    if cursor < len(content):
        if (content[cursor:] != b'\xfd\xf8\xf8\x00'):
            raise ValueError('Unexpected AVC chroma/depth extension')
        cursor += 4
    if cursor != len(content) or len(set(dimensions)) != 1:
        raise ValueError('Conflicting H264 sequence dimensions')
    return dimensions[0]


def video_mp4_metadata(content):
    boxes = video_boxes(content)
    if not boxes or boxes[0][0] != b'ftyp' or any(b[0] not in (b'ftyp', b'moov', b'mdat', b'free', b'wide') for b in boxes):
        raise ValueError('Unexpected or fragmented MP4 container')
    ftyp, moov, mdat = video_one(boxes, b'ftyp'), video_one(boxes, b'moov'), video_one(boxes, b'mdat')
    brands = content[ftyp[1]:ftyp[2]]
    if len(brands) < 8 or len(brands) % 4 or brands[:4] not in (b'isom', b'mp41', b'mp42') or moov[3] > mdat[3]:
        raise ValueError('MP4 must be a self-contained faststart ISO/AVC file')
    movie = video_boxes(content, moov[1], moov[2]);video_duration(content, video_one(movie, b'mvhd'))
    track = video_one(movie, b'trak');track_boxes = video_boxes(content, track[1], track[2])
    tkhd = video_one(track_boxes, b'tkhd')
    if tkhd[2] - tkhd[1] < 84 or tuple(int.from_bytes(content[i:i + 4], 'big') for i in [tkhd[2] - 8, tkhd[2] - 4]) != (VIDEO_WIDTH << 16, VIDEO_HEIGHT << 16):
        raise ValueError('MP4 track dimensions differ from the approved native frames')
    if content[tkhd[2] - 44:tkhd[2] - 8] != struct.pack('>9I', 65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824):
        raise ValueError('MP4 track must not rotate or transform the native frames')
    mdia = video_one(track_boxes, b'mdia');media = video_boxes(content, mdia[1], mdia[2])
    scale, ticks = video_duration(content, video_one(media, b'mdhd'))
    handler = video_one(media, b'hdlr')
    if handler[1] + 12 > handler[2] or content[handler[1] + 8:handler[1] + 12] != b'vide':
        raise ValueError('Only one silent video track is permitted')
    minf = video_one(media, b'minf');minimum = video_boxes(content, minf[1], minf[2])
    dinf = video_one(minimum, b'dinf');dref = video_one(video_boxes(content, dinf[1], dinf[2]), b'dref')
    if content[dref[1]:dref[1] + 8] != b'\0\0\0\0\0\0\0\1':
        raise ValueError('Unexpected MP4 data references')
    references = video_boxes(content, dref[1] + 8, dref[2])
    if len(references) != 1:
        raise ValueError('MP4 data-reference count differs')
    reference = video_one(references, b'url ')
    if reference[2] - reference[1] != 4 or content[reference[1]:reference[2]] != b'\0\0\0\1':
        raise ValueError('External MP4 media references are forbidden')
    stbl = video_one(minimum, b'stbl');tables = video_boxes(content, stbl[1], stbl[2])
    stsd = video_one(tables, b'stsd')
    if content[stsd[1]:stsd[1] + 8] != b'\0\0\0\0\0\0\0\1':
        raise ValueError('Unexpected MP4 sample descriptions')
    descriptions = video_boxes(content, stsd[1] + 8, stsd[2]);entry = video_one(descriptions, b'avc1')
    if len(descriptions) != 1 or entry[2] - entry[1] < 78:
        raise ValueError('Only one H264 AVC video description is permitted')
    if content[entry[1] + 6:entry[1] + 8] != b'\0\1' or struct.unpack('>HH', content[entry[1] + 24:entry[1] + 28]) != (VIDEO_WIDTH, VIDEO_HEIGHT):
        raise ValueError('AVC sample dimensions or media reference differ')
    sample = video_boxes(content, entry[1] + 78, entry[2]);avcc = video_one(sample, b'avcC')
    video_avcc(content[avcc[1]:avcc[2]])
    colors = [box for box in sample if box[0] == b'colr']
    if len(colors) > 1:
        raise ValueError('Conflicting MP4 colour metadata')
    if colors:
        colr = colors[0];color = content[colr[1]:colr[2]]
        if (len(color) not in (10, 11) or color[:4] not in (b'nclx', b'nclc')
                or color[4:10] != b'\0\1\0\1\0\1'):
            raise ValueError('MP4 colour metadata conflicts with its H264 BT709 signal')
    def table(kind, width):
        box = video_one(tables, kind);start, end = box[1], box[2]
        if start + 8 > end or content[start:start + 4] != b'\0\0\0\0':raise ValueError('Invalid MP4 sample table')
        count = int.from_bytes(content[start + 4:start + 8], 'big')
        if not 1 <= count <= VIDEO_FRAME_COUNT or start + 8 + count * width != end:raise ValueError('Invalid MP4 sample table length')
        return [content[p:p + width] for p in range(start + 8, end, width)]
    timing = [struct.unpack('>II', row) for row in table(b'stts', 8)]
    if (sum(count for count, delta in timing) != VIDEO_FRAME_COUNT
            or sum(count * delta for count, delta in timing) != ticks
            or any(not count or delta * VIDEO_FPS != scale for count, delta in timing)):
        raise ValueError('MP4 must contain exactly 288 constant-rate frames at 24 fps')
    stsz = video_one(tables, b'stsz');s = content[stsz[1]:stsz[2]]
    if len(s) < 12 or s[:4] != b'\0\0\0\0' or int.from_bytes(s[8:12], 'big') != VIDEO_FRAME_COUNT:
        raise ValueError('MP4 sample count differs')
    fixed = int.from_bytes(s[4:8], 'big')
    if (fixed and len(s) != 12) or (not fixed and len(s) != 12 + VIDEO_FRAME_COUNT * 4):raise ValueError('Invalid MP4 sample size table')
    sizes = [fixed] * VIDEO_FRAME_COUNT if fixed else [int.from_bytes(s[p:p + 4], 'big') for p in range(12, len(s), 4)]
    if not all(sizes):raise ValueError('Empty MP4 sample')
    chunk_kinds = [b[0] for b in tables if b[0] in (b'stco', b'co64')]
    if len(chunk_kinds) != 1:raise ValueError('Missing or ambiguous MP4 chunk offsets')
    offsets = [int.from_bytes(row, 'big') for row in table(chunk_kinds[0], 4 if chunk_kinds[0] == b'stco' else 8)]
    mappings = [struct.unpack('>III', row) for row in table(b'stsc', 12)]
    if mappings[0][0] != 1 or any(first > len(offsets) or not count or description != 1 for first, count, description in mappings) or any(a[0] >= b[0] for a, b in zip(mappings, mappings[1:])):
        raise ValueError('Invalid MP4 sample-to-chunk mapping')
    intervals, sample_index, mapping_index, idr = [], 0, 0, False
    for chunk, offset in enumerate(offsets, 1):
        while mapping_index + 1 < len(mappings) and mappings[mapping_index + 1][0] <= chunk:mapping_index += 1
        for _ in range(mappings[mapping_index][1]):
            if sample_index >= len(sizes):raise ValueError('Excess MP4 samples')
            end = offset + sizes[sample_index]
            if offset < mdat[1] or end > mdat[2]:raise ValueError('MP4 sample points outside its own media data')
            intervals.append((offset, end));cursor, slices = offset, 0
            while cursor < end:
                if cursor + 4 > end:raise ValueError('Truncated AVC NAL length')
                size = int.from_bytes(content[cursor:cursor + 4], 'big');cursor += 4
                if not size or cursor + size > end or content[cursor] & 0x80:raise ValueError('Invalid AVC NAL payload')
                kind = content[cursor] & 31
                if kind not in (1, 5, 6, 7, 8, 9, 10, 11, 12):raise ValueError('Unexpected AVC NAL type')
                if kind in (1, 5):slices += 1
                if kind == 5:idr = True
                cursor += size
            if not slices:raise ValueError('MP4 sample has no H264 picture slice')
            sample_index += 1;offset = end
    ordered = sorted(intervals)
    if (sample_index != VIDEO_FRAME_COUNT or not idr or ordered[0][0] != mdat[1] or ordered[-1][1] != mdat[2]
            or any(a[1] != b[0] for a, b in zip(ordered, ordered[1:]))):
        raise ValueError('MP4 picture samples do not exactly cover its video data')
    return {'mime': 'video/mp4', 'width': VIDEO_WIDTH, 'height': VIDEO_HEIGHT,
            'durationMilliseconds': VIDEO_DURATION_SECONDS * 1000, 'frameRate': VIDEO_FPS,
            'frameCount': VIDEO_FRAME_COUNT, 'codec': 'H264 High', 'pixelFormat': 'yuv420p',
            'colorSpace': 'bt709', 'audio': False, 'faststart': True}


def validate_video_media(name, content):
    match = video_media_match(name)
    if not match or not 0 < len(content) <= video_media_limit(name):
        raise ValueError('Video media path or byte size differs')
    if match.group(2) == 'film.mp4':
        metadata = video_mp4_metadata(content)
    else:
        width, height = video_webp_dimensions(name, content)
        if not 320 <= width <= VIDEO_WIDTH or not 180 <= height <= VIDEO_HEIGHT or width * 9 != height * 16:
            raise ValueError('Video poster must retain a bounded native 16:9 aspect')
        metadata = {'mime': 'image/webp', 'width': width, 'height': height}
    return {'path': name, **metadata}


def load_video_media_package(package_root, media_records):
    folder = package_root / 'sofa-publish' / 'video-media'
    control = folder / 'video-media-manifest.json'
    if not control.exists() and not control.is_symlink():
        if media_records:
            raise ValueError('Animation assets require their exact verified video bundle')
        return {}, None
    regular_source(control, package_root)
    if not 0 < control.stat().st_size <= 32 * 1024:
        raise ValueError('Invalid video media manifest size')
    raw = control.read_bytes();manifest = json.loads(raw.decode('utf-8'))
    paths = {'assets/animations/v125/' + scene + '/' + name for scene in VIDEO_SCENE_IDS for name in VIDEO_FILENAMES}
    if (not isinstance(manifest, dict)
            or set(manifest) != {'schemaVersion', 'application', 'archiveSha256', 'archiveBytes', 'memberCount', 'parts', 'media'}
            or type(manifest['schemaVersion']) is not int or manifest['schemaVersion'] != 1
            or manifest['application'] != 'studio-sofa-video-media'
            or not interface_digest(manifest['archiveSha256'])
            or not interface_integer(manifest['archiveBytes'], MAX_VIDEO_ARCHIVE_BYTES)
            or type(manifest['memberCount']) is not int or manifest['memberCount'] != 10
            or set(media_records) != paths
            or not isinstance(manifest['parts'], list) or not 1 <= len(manifest['parts']) <= MAX_VIDEO_PARTS
            or not isinstance(manifest['media'], list) or len(manifest['media']) != 10):
        raise ValueError('Invalid exact five-animation package manifest')
    metadata = {}
    image_keys = {'path', 'mime', 'width', 'height'}
    video_keys = image_keys | {'durationMilliseconds', 'frameRate', 'frameCount', 'codec', 'pixelFormat', 'colorSpace', 'audio', 'faststart'}
    for record in manifest['media']:
        if (not isinstance(record, dict) or not isinstance(record.get('path'), str)
                or record['path'] not in paths or record['path'] in metadata
                or set(record) != (video_keys if record['path'].endswith('.mp4') else image_keys)):
            raise ValueError('Invalid or duplicate animation metadata')
        metadata[record['path']] = record
    if set(metadata) != paths:
        raise ValueError('Animation metadata must cover the exact ten active paths')
    stream, whole, total = io.BytesIO(), hashlib.sha256(), 0
    for index, part in enumerate(manifest['parts'], 1):
        if (not isinstance(part, dict) or set(part) != {'name', 'bytes', 'sha256'}
                or part['name'] != f'video-media.part-{index:04d}'
                or not interface_integer(part['bytes'], MAX_VIDEO_PART_BYTES)
                or not interface_digest(part['sha256'])):
            raise ValueError('Unexpected video package part')
        source = folder / part['name'];regular_source(source, package_root)
        if source.stat().st_size != part['bytes']:
            raise ValueError('Video package part size differs')
        data = source.read_bytes()
        if sha256(data) != part['sha256']:
            raise ValueError('Video package part hash differs')
        total += len(data)
        if total > manifest['archiveBytes']:
            raise ValueError('Video archive exceeds its expected size')
        whole.update(data);stream.write(data)
    if total != manifest['archiveBytes'] or whole.hexdigest() != manifest['archiveSha256']:
        raise ValueError('Video archive hash differs')
    media, expanded = {}, 0
    try:
        with zipfile.ZipFile(stream) as archive:
            if len(archive.infolist()) != 10:
                raise ValueError('Video archive member count differs')
            for info in archive.infolist():
                name, mode = info.filename, info.external_attr >> 16
                if (name not in paths or name in media or not video_media_match(name) or info.is_dir()
                        or stat.S_ISLNK(mode) or stat.S_IFMT(mode) not in (0, stat.S_IFREG)
                        or info.flag_bits & 1 or info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)):
                    raise ValueError('Unexpected or unsafe video archive member')
                record = media_records[name]
                if info.file_size != record['bytes'] or not interface_integer(info.file_size, video_media_limit(name)):
                    raise ValueError('Animation file size differs')
                expanded += info.file_size
                if expanded > MAX_VIDEO_MEDIA_TOTAL_BYTES:
                    raise ValueError('Animation package expands beyond its limit')
                data = archive.read(info)
                if len(data) != record['bytes'] or sha256(data) != record['sha256']:
                    raise ValueError('Animation file hash differs')
                actual = validate_video_media(name, data)
                if (set(actual) != set(metadata[name])
                        or any(type(metadata[name][key]) is not type(value) or metadata[name][key] != value for key, value in actual.items())):
                    raise ValueError('Animation native codec/duration/dimension metadata differs')
                media[name] = data
    except (zipfile.BadZipFile, RuntimeError, zlib.error) as error:
        raise ValueError('Invalid video package ZIP') from error
    if set(media) != paths:
        raise ValueError('Video package does not cover every approved animation and poster')
    audit = {'manifestPath': 'sofa-publish/video-media/video-media-manifest.json', 'manifestSha256': sha256(raw),
             'archiveSha256': manifest['archiveSha256'], 'archiveBytes': manifest['archiveBytes'],
             'memberCount': 10, 'parts': manifest['parts'], 'media': manifest['media']}
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
    swatch_count, swatch_bytes, swatch_records = 0, 0, {}
    folded_count, folded_bytes, folded_records = 0, 0, {}
    editorial_count, editorial_bytes, editorial_records = 0, 0, {}
    video_count, video_bytes, video_records = 0, 0, {}
    for item in files:
        if (not isinstance(item, dict)
                or set(item) != {'path', 'expectedBaseSha256', 'expectedBaseBytes', 'sha256', 'bytes'}):
            raise ValueError('Invalid sofa interface file record')
        name = item['path']
        media = material_media_match(name)
        product_media = product_media_match(name)
        swatch_media = swatch_media_match(name)
        folded_media = folded_media_match(name)
        editorial_media = editorial_media_match(name)
        video_media = video_media_match(name)
        if not isinstance(name, str) or (name not in INTERFACE_FILES and not media and not product_media and not swatch_media and not folded_media and not editorial_media and not video_media) or name in seen:
            raise ValueError('Unexpected or duplicate sofa interface file')
        seen.add(name)
        maximum = MAX_MATERIAL_MEDIA_BYTES if media else (MAX_PRODUCT_MEDIA_BYTES if product_media else (MAX_SWATCH_MEDIA_BYTES if swatch_media else (MAX_FOLDED_MEDIA_BYTES if folded_media else (MAX_EDITORIAL_MEDIA_BYTES if editorial_media else (video_media_limit(name) if video_media else interface_limit(name))))))
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
        if swatch_media:
            swatch_count += 1
            swatch_bytes += item['bytes']
            if swatch_count > MAX_SWATCH_MEDIA_FILES or swatch_bytes > MAX_SWATCH_MEDIA_TOTAL_BYTES:
                raise ValueError('Swatch card media exceeds allowed limits')
            swatch_records[name] = item
        if folded_media:
            folded_count += 1
            folded_bytes += item['bytes']
            if folded_count > MAX_FOLDED_MEDIA_FILES or folded_bytes > MAX_FOLDED_MEDIA_TOTAL_BYTES:
                raise ValueError('Folded swatch media exceeds allowed limits')
            folded_records[name] = item
        if editorial_media:
            editorial_count += 1
            editorial_bytes += item['bytes']
            if editorial_count > MAX_EDITORIAL_MEDIA_FILES or editorial_bytes > MAX_EDITORIAL_MEDIA_TOTAL_BYTES:
                raise ValueError('Editorial media exceeds allowed limits')
            editorial_records[name] = item
        if video_media:
            video_count += 1
            video_bytes += item['bytes']
            if video_count > MAX_VIDEO_MEDIA_FILES or video_bytes > MAX_VIDEO_MEDIA_TOTAL_BYTES:
                raise ValueError('Animation media exceeds allowed limits')
            video_records[name] = item
    bundled_media, bundle_audit = load_material_media_package(package_root, media_records)
    product_bundle, product_audit = load_product_media_package(package_root, product_records)
    swatch_bundle, swatch_audit = load_swatch_media_package(package_root, swatch_records)
    folded_bundle, folded_audit = load_folded_media_package(package_root, folded_records)
    editorial_bundle, editorial_audit = load_editorial_media_package(package_root, editorial_records)
    video_bundle, video_audit = load_video_media_package(package_root, video_records)
    bundled_media.update(product_bundle)
    bundled_media.update(swatch_bundle)
    bundled_media.update(folded_bundle)
    bundled_media.update(editorial_bundle)
    bundled_media.update(video_bundle)
    for item in files:
        name = item['path']
        media = material_media_match(name)
        product_media = product_media_match(name)
        swatch_media = swatch_media_match(name)
        folded_media = folded_media_match(name)
        editorial_media = editorial_media_match(name)
        video_media = video_media_match(name)
        original = expected.get(name)
        installed = restored / name
        if item['expectedBaseSha256'] is None:
            if ((name not in NEW_INTERFACE_FILES and name not in V118_ADDITIONS and not media and not product_media and not swatch_media and not folded_media and not editorial_media and not video_media) or type(item['expectedBaseBytes']) is not int
                    or item['expectedBaseBytes'] != 0 or original is not None
                    or installed.exists() or installed.is_symlink()):
                raise ValueError('Sofa interface addition collides with base member: ' + name)
        else:
            if media or product_media or swatch_media or folded_media or editorial_media or video_media:
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
        if (media or product_media or swatch_media or folded_media or editorial_media or video_media) and name in bundled_media and not source.exists() and not source.is_symlink():
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
        elif swatch_media:
            validate_swatch_media(name, content)
        elif folded_media:
            validate_folded_media(name, content)
        elif editorial_media:
            validate_editorial_media(name, content)
        elif video_media:
            validate_video_media(name, content)
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
    if swatch_audit is not None:
        audit['swatchCardMediaPackage'] = swatch_audit
    if folded_audit is not None:
        audit['foldedSwatchMediaPackage'] = folded_audit
    if editorial_audit is not None:
        audit['editorialMediaPackage'] = editorial_audit
    if video_audit is not None:
        audit['videoMediaPackage'] = video_audit
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




# V130 only: strict independent media validators.

def inside_video_duration(content, box):
    _, start, end, _ = box
    if start + 4 > end or content[start + 1:start + 4] != b'\0\0\0':
        raise ValueError('Invalid video full box')
    version = content[start]
    scale_offset, duration_offset, size = (12, 16, 4) if version == 0 else (20, 24, 8)
    if version not in (0, 1) or start + duration_offset + size > end:
        raise ValueError('Invalid video duration record')
    scale = int.from_bytes(content[start + scale_offset:start + scale_offset + 4], 'big')
    ticks = int.from_bytes(content[start + duration_offset:start + duration_offset + size], 'big')
    if not 0 < scale <= 1000000000 or ticks != INSIDE_DURATION_SECONDS * scale:
        raise ValueError('Video must have its approved twenty-second duration')
    return scale, ticks

def inside_mp4_metadata(content):
    boxes = video_boxes(content)
    if not boxes or boxes[0][0] != b'ftyp' or any(b[0] not in (b'ftyp', b'moov', b'mdat', b'free', b'wide') for b in boxes):
        raise ValueError('Unexpected or fragmented MP4 container')
    ftyp, moov, mdat = video_one(boxes, b'ftyp'), video_one(boxes, b'moov'), video_one(boxes, b'mdat')
    brands = content[ftyp[1]:ftyp[2]]
    if len(brands) < 8 or len(brands) % 4 or brands[:4] not in (b'isom', b'mp41', b'mp42'):
        raise ValueError('MP4 must be a self-contained ISO/AVC file')
    movie = video_boxes(content, moov[1], moov[2]);inside_video_duration(content, video_one(movie, b'mvhd'))
    track = video_one(movie, b'trak');track_boxes = video_boxes(content, track[1], track[2])
    tkhd = video_one(track_boxes, b'tkhd')
    if tkhd[2] - tkhd[1] < 84 or tuple(int.from_bytes(content[i:i + 4], 'big') for i in [tkhd[2] - 8, tkhd[2] - 4]) != (INSIDE_WIDTH << 16, INSIDE_HEIGHT << 16):
        raise ValueError('MP4 track dimensions differ from the approved native frames')
    if content[tkhd[2] - 44:tkhd[2] - 8] != struct.pack('>9I', 65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824):
        raise ValueError('MP4 track must not rotate or transform the native frames')
    mdia = video_one(track_boxes, b'mdia');media = video_boxes(content, mdia[1], mdia[2])
    scale, ticks = inside_video_duration(content, video_one(media, b'mdhd'))
    handler = video_one(media, b'hdlr')
    if handler[1] + 12 > handler[2] or content[handler[1] + 8:handler[1] + 12] != b'vide':
        raise ValueError('Only one silent video track is permitted')
    minf = video_one(media, b'minf');minimum = video_boxes(content, minf[1], minf[2])
    dinf = video_one(minimum, b'dinf');dref = video_one(video_boxes(content, dinf[1], dinf[2]), b'dref')
    if content[dref[1]:dref[1] + 8] != b'\0\0\0\0\0\0\0\1':
        raise ValueError('Unexpected MP4 data references')
    references = video_boxes(content, dref[1] + 8, dref[2])
    if len(references) != 1:
        raise ValueError('MP4 data-reference count differs')
    reference = video_one(references, b'url ')
    if reference[2] - reference[1] != 4 or content[reference[1]:reference[2]] != b'\0\0\0\1':
        raise ValueError('External MP4 media references are forbidden')
    stbl = video_one(minimum, b'stbl');tables = video_boxes(content, stbl[1], stbl[2])
    stsd = video_one(tables, b'stsd')
    if content[stsd[1]:stsd[1] + 8] != b'\0\0\0\0\0\0\0\1':
        raise ValueError('Unexpected MP4 sample descriptions')
    descriptions = video_boxes(content, stsd[1] + 8, stsd[2]);entry = video_one(descriptions, b'avc1')
    if len(descriptions) != 1 or entry[2] - entry[1] < 78:
        raise ValueError('Only one H264 AVC video description is permitted')
    if content[entry[1] + 6:entry[1] + 8] != b'\0\1' or struct.unpack('>HH', content[entry[1] + 24:entry[1] + 28]) != (INSIDE_WIDTH, INSIDE_HEIGHT):
        raise ValueError('AVC sample dimensions or media reference differ')
    sample = video_boxes(content, entry[1] + 78, entry[2]);avcc = video_one(sample, b'avcC')
    video_avcc(content[avcc[1]:avcc[2]])
    colors = [box for box in sample if box[0] == b'colr']
    if len(colors) > 1:
        raise ValueError('Conflicting MP4 colour metadata')
    if colors:
        colr = colors[0];color = content[colr[1]:colr[2]]
        if (len(color) not in (10, 11) or color[:4] not in (b'nclx', b'nclc')
                or color[4:10] != b'\0\1\0\1\0\1'):
            raise ValueError('MP4 colour metadata conflicts with its H264 BT709 signal')
    def table(kind, width):
        box = video_one(tables, kind);start, end = box[1], box[2]
        if start + 8 > end or content[start:start + 4] != b'\0\0\0\0':raise ValueError('Invalid MP4 sample table')
        count = int.from_bytes(content[start + 4:start + 8], 'big')
        if not 1 <= count <= INSIDE_FRAME_COUNT or start + 8 + count * width != end:raise ValueError('Invalid MP4 sample table length')
        return [content[p:p + width] for p in range(start + 8, end, width)]
    timing = [struct.unpack('>II', row) for row in table(b'stts', 8)]
    if (sum(count for count, delta in timing) != INSIDE_FRAME_COUNT
            or sum(count * delta for count, delta in timing) != ticks
            or any(not count or delta * INSIDE_FPS != scale for count, delta in timing)):
        raise ValueError('MP4 must contain exactly 480 constant-rate frames at 24 fps')
    stsz = video_one(tables, b'stsz');s = content[stsz[1]:stsz[2]]
    if len(s) < 12 or s[:4] != b'\0\0\0\0' or int.from_bytes(s[8:12], 'big') != INSIDE_FRAME_COUNT:
        raise ValueError('MP4 sample count differs')
    fixed = int.from_bytes(s[4:8], 'big')
    if (fixed and len(s) != 12) or (not fixed and len(s) != 12 + INSIDE_FRAME_COUNT * 4):raise ValueError('Invalid MP4 sample size table')
    sizes = [fixed] * INSIDE_FRAME_COUNT if fixed else [int.from_bytes(s[p:p + 4], 'big') for p in range(12, len(s), 4)]
    if not all(sizes):raise ValueError('Empty MP4 sample')
    chunk_kinds = [b[0] for b in tables if b[0] in (b'stco', b'co64')]
    if len(chunk_kinds) != 1:raise ValueError('Missing or ambiguous MP4 chunk offsets')
    offsets = [int.from_bytes(row, 'big') for row in table(chunk_kinds[0], 4 if chunk_kinds[0] == b'stco' else 8)]
    mappings = [struct.unpack('>III', row) for row in table(b'stsc', 12)]
    if mappings[0][0] != 1 or any(first > len(offsets) or not count or description != 1 for first, count, description in mappings) or any(a[0] >= b[0] for a, b in zip(mappings, mappings[1:])):
        raise ValueError('Invalid MP4 sample-to-chunk mapping')
    intervals, sample_index, mapping_index, idr = [], 0, 0, False
    for chunk, offset in enumerate(offsets, 1):
        while mapping_index + 1 < len(mappings) and mappings[mapping_index + 1][0] <= chunk:mapping_index += 1
        for _ in range(mappings[mapping_index][1]):
            if sample_index >= len(sizes):raise ValueError('Excess MP4 samples')
            end = offset + sizes[sample_index]
            if offset < mdat[1] or end > mdat[2]:raise ValueError('MP4 sample points outside its own media data')
            intervals.append((offset, end));cursor, slices = offset, 0
            while cursor < end:
                if cursor + 4 > end:raise ValueError('Truncated AVC NAL length')
                size = int.from_bytes(content[cursor:cursor + 4], 'big');cursor += 4
                if not size or cursor + size > end or content[cursor] & 0x80:raise ValueError('Invalid AVC NAL payload')
                kind = content[cursor] & 31
                if kind not in (1, 5, 6, 7, 8, 9, 10, 11, 12):raise ValueError('Unexpected AVC NAL type')
                if kind in (1, 5):slices += 1
                if kind == 5:idr = True
                cursor += size
            if not slices:raise ValueError('MP4 sample has no H264 picture slice')
            sample_index += 1;offset = end
    ordered = sorted(intervals)
    if (sample_index != INSIDE_FRAME_COUNT or not idr or ordered[0][0] != mdat[1] or ordered[-1][1] != mdat[2]
            or any(a[1] != b[0] for a, b in zip(ordered, ordered[1:]))):
        raise ValueError('MP4 picture samples do not exactly cover its video data')
    return {'mime': 'video/mp4', 'width': INSIDE_WIDTH, 'height': INSIDE_HEIGHT,
            'durationMilliseconds': INSIDE_DURATION_SECONDS * 1000, 'frameRate': INSIDE_FPS,
            'frameCount': INSIDE_FRAME_COUNT, 'codec': 'H264 High', 'pixelFormat': 'yuv420p',
            'colorSpace': 'bt709', 'audio': False, 'faststart': moov[3] < mdat[3]}

def _extension_webp_dimensions(name, content):
    """Accept one approved still portrait WebP, at its genuine native size."""
    match = _extension_media_match(name)
    if (not match or len(content) < 30 or len(content) > EXTENSION_MAX_FILE_BYTES
            or content[:4] != b'RIFF' or content[8:12] != b'WEBP'
            or int.from_bytes(content[4:8], 'little') != len(content) - 8):
        raise ValueError('Extension WebP signature or path differs')
    cursor, dimensions, canvas, frames, canvases = 12, None, None, 0, 0
    while cursor < len(content):
        if cursor + 8 > len(content):
            raise ValueError('Truncated extension WebP chunk')
        kind = content[cursor:cursor + 4]
        size = int.from_bytes(content[cursor + 4:cursor + 8], 'little')
        start, end = cursor + 8, cursor + 8 + size
        if end + (size & 1) > len(content) or kind in (b'ANIM', b'ANMF'):
            raise ValueError('Invalid or animated extension WebP')
        data = content[start:end]
        if kind == b'VP8X':
            if len(data) != 10 or data[0] & 2 or canvases or frames:
                raise ValueError('Invalid or animated extension WebP canvas')
            canvas = (int.from_bytes(data[4:7], 'little') + 1, int.from_bytes(data[7:10], 'little') + 1)
            canvases += 1
        elif kind == b'VP8 ':
            if len(data) < 10 or data[3:6] != b'\x9d\x01\x2a':
                raise ValueError('Invalid extension VP8 frame')
            dimensions = (int.from_bytes(data[6:8], 'little') & 0x3fff, int.from_bytes(data[8:10], 'little') & 0x3fff)
            frames += 1
        elif kind == b'VP8L':
            if len(data) < 5 or data[0] != 0x2f:
                raise ValueError('Invalid extension VP8L frame')
            bits = int.from_bytes(data[1:5], 'little')
            dimensions = ((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
            frames += 1
        cursor = end + (size & 1)
    if frames != 1 or (canvas is not None and canvas != dimensions):
        raise ValueError('Extension WebP frame or canvas differs')
    return dimensions

# V130 additive media support. Original V127 validators remain byte-for-byte.
import math
import os

INSIDE_DURATION_SECONDS = 20
INSIDE_FRAME_COUNT = 480
INSIDE_FPS = 24
INSIDE_WIDTH, INSIDE_HEIGHT = 1280, 720
INSIDE_PATHS = frozenset({'assets/inside/v128/structure.glb', 'assets/inside/v128/film.mp4', 'assets/inside/v128/poster.webp'})
CLOSEUP_IDS = frozenset({'mora-official-1023','mora-reference-1016','mora-reference-1036','mora-S06','mora-R04','mora-R17','mora-reference-1035','mora-reference-1008','mora-reference-1025','mora-reference-1019','mora-reference-1013','mora-reference-1009'})
CLOSEUP_PATHS = frozenset('assets/fabric-closeups/v129/' + key + suffix + '.webp' for key in CLOSEUP_IDS for suffix in ('','.thumb'))
INSIDE_STATIC_LIMITS = {'soff-ic-yapi.html': 32 * 1024, 'soff-ic-yapi.js': 64 * 1024}
INTERFACE_FILES = INTERFACE_FILES | frozenset(INSIDE_STATIC_LIMITS)
NEW_INTERFACE_FILES = NEW_INTERFACE_FILES | frozenset(INSIDE_STATIC_LIMITS)
EXTENSION_MAX_FILE_BYTES = 8 * 1024 * 1024
EXTENSION_MAX_ARCHIVE_BYTES = 16 * 1024 * 1024
EXTENSION_MAX_PART_BYTES = 2 * 1024 * 1024
EXTENSION_MAX_PARTS = 8
INSIDE_SOURCE_IDS = frozenset(['cad-05-9970', 'cad-05-9BEA', 'cad-05-9D05', 'cad-05-9D06', 'cad-07-2FC', 'cad-07-2FF', 'cad-07-302', 'cad-07-305', 'cad-07-306', 'cad-07-307', 'cad-07-30A', 'cad-07-30B', 'cad-07-30C', 'cad-07-30D', 'cad-07-30E', 'cad-07-30F', 'cad-07-310', 'cad-07-311', 'cad-07-312', 'cad-07-315', 'cad-07-318', 'cad-07-319', 'cad-07-31A', 'cad-07-31D', 'cad-07-320', 'cad-07-321', 'cad-07-322', 'cad-07-323', 'cad-07-326', 'cad-08-2F7', 'cad-08-2F9', 'cad-08-2FE', 'cad-08-2FEA', 'cad-08-2FEB', 'cad-08-3049', 'cad-08-3088', 'cad-08-30BB', 'cad-08-30BD', 'cad-08-30BE', 'cad-08-30BF', 'cad-08-30C0', 'cad-08-30C1', 'cad-08-30C2', 'cad-08-350', 'cad-10-2EB', 'cad-10-2EC', 'cad-10-2EF', 'cad-10-2F2', 'cad-10-2F5', 'cad-10-2F9', 'cad-10-2FC', 'cad-10-300', 'cad-10-301', 'cad-10-304', 'cad-10-307', 'cad-10-33A', 'cad-10-374'])


def _extension_media_match(name):
    return isinstance(name, str) and (name in INSIDE_PATHS or name in CLOSEUP_PATHS)


def inside_media_limit(name):
    if name == 'assets/inside/v128/film.mp4': return 8 * 1024 * 1024
    if name in INSIDE_PATHS: return 1024 * 1024
    if name in CLOSEUP_PATHS: return 256 * 1024 if name.endswith('.thumb.webp') else 2 * 1024 * 1024
    raise ValueError('Unexpected extension media path')


def validate_inside_glb(content):
    if len(content) < 32 or len(content) > 1024 * 1024 or struct.unpack_from('<4sII', content) != (b'glTF', 2, len(content)):
        raise ValueError('Invalid bounded native inside GLB header')
    size, kind = struct.unpack_from('<I4s', content, 12)
    if kind != b'JSON' or size % 4 or not 0 < size < len(content) - 28:
        raise ValueError('Invalid inside GLB JSON chunk')
    document = json.loads(content[20:20 + size].decode('utf-8'))
    start = 20 + size; length, kind = struct.unpack_from('<I4s', content, start)
    if kind != b'BIN\0' or length % 4 or start + 8 + length != len(content):
        raise ValueError('Inside GLB must contain one self-contained BIN chunk')
    binary = content[start + 8:]
    if (set(document) != {'asset','scene','scenes','nodes','meshes','materials','buffers','bufferViews','accessors','extras'}
            or document['asset'].get('version') != '2.0' or len(document['buffers']) != 1
            or document['buffers'][0] != {'byteLength':length}
            or len(document['meshes']) != 57 or len(document['nodes']) != 61
            or {mesh.get('name') for mesh in document['meshes']} != INSIDE_SOURCE_IDS):
        raise ValueError('Inside GLB must retain exact native 53 wood and 4 foot parts')
    if any(value in content[20:20 + size] for value in (b'"uri"', b'/Users/', b'file://', b'http://', b'https://')):
        raise ValueError('External or private inside GLB resources are forbidden')
    views, accessors = document['bufferViews'], document['accessors']
    def data(accessor_index, component, kind):
        if type(accessor_index) is not int or not 0 <= accessor_index < len(accessors): raise ValueError('Invalid GLB accessor reference')
        a = accessors[accessor_index]
        if (a.get('componentType') != component or a.get('type') != kind or 'sparse' in a or 'byteOffset' in a
                or type(a.get('count')) is not int or not 0 < a['count'] <= 200000): raise ValueError('Invalid native GLB accessor')
        index = a.get('bufferView')
        if type(index) is not int or not 0 <= index < len(views): raise ValueError('Invalid native GLB buffer view')
        v = views[index]; stride = 12 if kind == 'VEC3' else 2; offset = v.get('byteOffset',0)
        if (v.get('buffer') != 0 or 'byteStride' in v or type(offset) is not int or offset < 0 or offset % 4
                or v.get('byteLength') != stride * a['count'] or offset + v['byteLength'] > length): raise ValueError('Native GLB view bounds differ')
        return a['count'], binary[offset:offset + v['byteLength']]
    triangles = 0
    for mesh in document['meshes']:
        if len(mesh.get('primitives',[])) != 1: raise ValueError('Unexpected native GLB primitive count')
        p = mesh['primitives'][0]
        if set(p.get('attributes',{})) != {'POSITION'} or p.get('mode',4) != 4: raise ValueError('Native GLB must retain source triangle geometry')
        count, xyz = data(p['attributes']['POSITION'],5126,'VEC3'); number, ix = data(p['indices'],5123,'SCALAR')
        if number % 3: raise ValueError('Invalid native GLB triangle indices')
        positions = struct.unpack('<' + 'f' * (len(xyz)//4),xyz)
        if not all(math.isfinite(v) and abs(v) <= 10 for v in positions): raise ValueError('Invalid native GLB coordinates')
        if max(struct.unpack('<' + 'H' * number,ix)) >= count: raise ValueError('Native GLB index outside its own vertices')
        triangles += number//3
    if triangles != 29462: raise ValueError('Inside native source triangle count differs')
    return {'mime':'model/gltf-binary','nativeParts':57,'nativeWoodParts':53,'nativeFootParts':4,'triangles':triangles,'units':'metres','upAxis':'Y'}


def validate_extension_media(name, content):
    if not _extension_media_match(name) or not 0 < len(content) <= inside_media_limit(name):
        raise ValueError('Unexpected extension media path or size')
    if name.endswith('.glb'): metadata = validate_inside_glb(content)
    elif name.endswith('.mp4'): metadata = inside_mp4_metadata(content)
    else:
        width, height = _extension_webp_dimensions(name,content)
        wanted = (1280,720) if name in INSIDE_PATHS else ((360,240) if name.endswith('.thumb.webp') else (1536,1024))
        if (width,height) != wanted: raise ValueError('Extension still-image dimensions differ')
        metadata = {'mime':'image/webp','width':width,'height':height}
    return {'path':name, **metadata}


def load_extension_media_package(package_root, media_records, kind):
    if kind not in ('inside','fabric-closeup'): raise ValueError('Unexpected extension package kind')
    prefix = kind + '-media'; paths = INSIDE_PATHS if kind == 'inside' else CLOSEUP_PATHS
    folder = package_root/'sofa-publish'/prefix; control = folder/(prefix+'-manifest.json')
    if not control.exists() and not control.is_symlink():
        if media_records: raise ValueError('Extension assets require their exact verified bundle')
        return {},None
    regular_source(control,package_root)
    if not 0 < control.stat().st_size <= 64*1024: raise ValueError('Invalid extension media manifest size')
    raw=control.read_bytes();m=json.loads(raw.decode('utf-8'))
    if (not isinstance(m,dict) or set(m) != {'schemaVersion','application','archiveSha256','archiveBytes','memberCount','parts','media'}
            or type(m['schemaVersion']) is not int or m['schemaVersion'] != 1 or m['application'] != 'studio-sofa-'+prefix
            or not interface_digest(m['archiveSha256']) or not interface_integer(m['archiveBytes'],EXTENSION_MAX_ARCHIVE_BYTES)
            or type(m['memberCount']) is not int or m['memberCount'] != len(paths) or set(media_records) != paths
            or not isinstance(m['parts'],list) or not 1 <= len(m['parts']) <= EXTENSION_MAX_PARTS
            or not isinstance(m['media'],list) or len(m['media']) != len(paths)):
        raise ValueError('Invalid exact extension media manifest')
    metadata={}
    for item in m['media']:
        if not isinstance(item,dict) or item.get('path') not in paths or item['path'] in metadata: raise ValueError('Unexpected or duplicate extension metadata')
        metadata[item['path']]=item
    if set(metadata) != paths: raise ValueError('Extension metadata must cover every exact asset')
    stream=io.BytesIO();digest=hashlib.sha256();total=0
    for index,part in enumerate(m['parts'],1):
        if (not isinstance(part,dict) or set(part) != {'name','bytes','sha256'} or part['name'] != f'{prefix}.part-{index:04d}'
                or not interface_integer(part['bytes'],EXTENSION_MAX_PART_BYTES) or not interface_digest(part['sha256'])):
            raise ValueError('Unexpected extension package part')
        f=folder/part['name'];regular_source(f,package_root)
        if f.stat().st_size != part['bytes']: raise ValueError('Extension package part size differs')
        b=f.read_bytes();total+=len(b)
        if sha256(b) != part['sha256'] or total > m['archiveBytes']: raise ValueError('Extension package part hash or total differs')
        digest.update(b);stream.write(b)
    if total != m['archiveBytes'] or digest.hexdigest() != m['archiveSha256']: raise ValueError('Extension archive checksum differs')
    media={};expanded=0
    try:
        with zipfile.ZipFile(stream) as archive:
            if len(archive.infolist()) != len(paths): raise ValueError('Extension archive member count differs')
            for info in archive.infolist():
                name,mode=info.filename,info.external_attr>>16
                if (name not in paths or name in media or info.is_dir() or stat.S_ISLNK(mode) or stat.S_IFMT(mode) not in (0,stat.S_IFREG)
                        or info.flag_bits&1 or info.compress_type not in (zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED)):
                    raise ValueError('Unsafe or unexpected extension archive member')
                row=media_records[name]
                if not interface_integer(info.file_size,inside_media_limit(name)) or info.file_size != row['bytes']: raise ValueError('Extension asset size differs')
                expanded+=info.file_size
                if expanded > EXTENSION_MAX_ARCHIVE_BYTES: raise ValueError('Extension media expands beyond its own limit')
                b=archive.read(info)
                if len(b) != row['bytes'] or sha256(b) != row['sha256']: raise ValueError('Extension asset checksum differs')
                actual=validate_extension_media(name,b)
                if set(actual) != set(metadata[name]) or any(type(metadata[name][k]) is not type(v) or metadata[name][k] != v for k,v in actual.items()):
                    raise ValueError('Extension native header or media metadata differs')
                media[name]=b
    except (zipfile.BadZipFile,RuntimeError,zlib.error) as error: raise ValueError('Invalid extension ZIP') from error
    if set(media) != paths: raise ValueError('Extension archive must cover every approved asset')
    return media,{'manifestPath':'sofa-publish/'+prefix+'/'+prefix+'-manifest.json','manifestSha256':sha256(raw),'archiveSha256':m['archiveSha256'],'archiveBytes':m['archiveBytes'],'memberCount':len(paths),'parts':m['parts'],'media':m['media']}


def load_inside_media_package(package_root, media_records):
    return load_extension_media_package(package_root,media_records,'inside')


def load_fabric_closeup_media_package(package_root, media_records):
    return load_extension_media_package(package_root,media_records,'fabric-closeup')


_apply_interface_overrides_before_v130 = apply_interface_overrides


def apply_v130_interface_overrides(package_root, restored, manifest, expected):
    """Add two exact media namespaces without rewriting any legacy validator."""
    control=package_root/'sofa-publish/interface-overrides.json'
    if not control.exists() and not control.is_symlink(): return _apply_interface_overrides_before_v130(package_root,restored,manifest,expected)
    regular_source(control,package_root)
    if not 0 < control.stat().st_size <= MAX_INTERFACE_MANIFEST_BYTES: raise ValueError('Invalid full extension interface manifest size')
    overlay=json.loads(control.read_text('utf-8'));files=overlay.get('files') if isinstance(overlay,dict) else None
    if not isinstance(files,list) or not 1 <= len(files) <= MAX_OVERLAY_FILES: raise ValueError('Invalid full extension interface file count')
    rows={};new={}
    for row in files:
        if not isinstance(row,dict) or set(row) != {'path','expectedBaseSha256','expectedBaseBytes','sha256','bytes'} or not isinstance(row.get('path'),str) or row['path'] in rows:
            raise ValueError('Invalid or duplicate full interface record')
        name=row['path'];rows[name]=row
        if _extension_media_match(name):
            if (row['expectedBaseSha256'] is not None or type(row['expectedBaseBytes']) is not int or row['expectedBaseBytes'] != 0
                    or not interface_digest(row['sha256']) or not interface_integer(row['bytes'],inside_media_limit(name))
                    or name in expected or (restored/name).exists() or (restored/name).is_symlink()):
                raise ValueError('Extension addition collides with an original source member')
            new[name]=row
        if name in INSIDE_STATIC_LIMITS and not interface_integer(row['bytes'],INSIDE_STATIC_LIMITS[name]): raise ValueError('Inside runtime exceeds its own narrow byte limit')
    inside,inside_audit=load_inside_media_package(package_root,{k:v for k,v in new.items() if k in INSIDE_PATHS})
    closeups,closeup_audit=load_fabric_closeup_media_package(package_root,{k:v for k,v in new.items() if k in CLOSEUP_PATHS})
    if not new: return _apply_interface_overrides_before_v130(package_root,restored,manifest,expected)
    # Present legacy validators with a read-only hardlinked payload view. Only
    # its separate manifest copy omits the27 newly classified binary records.
    # No116 source parts, cached archives or original manifests are rewritten.
    with tempfile.TemporaryDirectory(prefix='.sofa-v130-legacy-view-',dir=restored.parent) as temporary:
        filtered=Path(temporary);source=package_root/'sofa-publish'
        for f in source.rglob('*'):
            if f.is_symlink(): raise ValueError('Symlink in extension publication source')
            if not f.is_file() or f==control: continue
            regular_source(f,package_root);target=filtered/'sofa-publish'/f.relative_to(source);target.parent.mkdir(parents=True,exist_ok=True);os.link(f,target)
        subset=dict(overlay);subset['files']=[row for row in files if row['path'] not in new]
        target=filtered/'sofa-publish/interface-overrides.json';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(subset,ensure_ascii=False,indent=2)+'\n','utf-8')
        count=_apply_interface_overrides_before_v130(filtered,restored,manifest,expected)
    combined={**inside,**closeups}
    for name,b in combined.items():
        f=restored/safe_name(name)
        if name in expected or f.exists() or f.is_symlink(): raise ValueError('Verified extension installation collides with another member')
        f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(b)
        if sha256(f.read_bytes()) != new[name]['sha256']: raise ValueError('Installed extension checksum differs')
        expected[name]={'path':name,'bytes':len(b),'sha256':new[name]['sha256']}
    audit_name='INTERFACE-OVERRIDES.json';audit=json.loads((restored/audit_name).read_text('utf-8'));audit['files']=files
    if inside_audit is not None: audit['insideMediaPackage']=inside_audit
    if closeup_audit is not None: audit['fabricCloseupMediaPackage']=closeup_audit
    b=(json.dumps(audit,ensure_ascii=False,indent=2)+'\n').encode();(restored/audit_name).write_bytes(b);expected[audit_name]={'path':audit_name,'bytes':len(b),'sha256':sha256(b)}
    integrity='PACKAGE-MEMBERS.json';details={'schemaVersion':1,'members':sorted((row for name,row in expected.items() if name != integrity),key=lambda row:row['path'])}
    b=(json.dumps(details,ensure_ascii=False,indent=2)+'\n').encode()
    if sum(row['bytes'] for name,row in expected.items() if name != integrity)+len(b)>MAX_SITE_BYTES: raise ValueError('Full extended publication exceeds its original total site limit')
    (restored/integrity).write_bytes(b);expected[integrity]={'path':integrity,'bytes':len(b),'sha256':sha256(b)}
    return count+len(new)


apply_interface_overrides = apply_v130_interface_overrides


# V132 adds one exact ten-layout media package and exact original-source patches.
# The public inventory limit is derived from the actual sparse union. Legacy validators retain1792.
V132_FULL_OVERLAY_LIMIT = 1951
V132_LEGACY_OVERLAY_RECORDS = 1771
REVERSE_VARIANT_KEYS = frozenset(["inspiration-reverse-v132-01-soft-touch-1246-oak", "inspiration-reverse-v132-02-veronza-1008-dark-oak", "inspiration-reverse-v132-03-card-bordo-black-oak", "inspiration-reverse-v132-04-soft-touch-1351-oak", "inspiration-reverse-v132-05-veronza-1012-dark-oak", "inspiration-reverse-v132-06-colormax-1015-black-oak", "inspiration-reverse-v132-07-veronza-1031-oak", "inspiration-reverse-v132-08-veronza-1035-dark-oak", "inspiration-reverse-v132-09-veronza-1041-black-oak", "inspiration-reverse-v132-10-card-bal-oak"])
REVERSE_VIEWS = ('hero','open-back','front','rear','right-rear','right-side','top','dimensioned-top','detail')
REVERSE_MEDIA_PATHS = frozenset('assets/product-galleries/v132/'+key+'/'+view+suffix+'.webp'
                              for key in REVERSE_VARIANT_KEYS for view in REVERSE_VIEWS for suffix in ('','.thumb'))
REVERSE_ORIGINAL_ANCHORS = {"configuration-guide.js": ["d63d983cb7e85ec0ef5f5180963b6a6da51c6eb0edc2dd7824a21ccb5fa52bbf", 8661], "corner-table-composition.js": ["47bc317e0e3e1ad6e3f37fdce3a0d29428c2ef9c104f10acf10f126b88323934", 2067], "modular-layout.js": ["2429e45ab7968fac16ae06b3b676f8d5cea8839b911fc80010463ca95aebab7f", 14400], "module-chain-planner.js": ["0477bfe258b80958661358f634ab294184a6e455da4b971379daaf31b25c06b4", 9687], "module-chain.js": ["e18b94c1091df53414173052a4399c34ce5d4e5dd29ee5802cf1b08a07a43a79", 8120], "product-pack-documents.js": ["f5527f6bafec57a688116a9407db5d0b3df50c91a7ddf2173b4eb370da6c523b", 13894], "sofa-table-profiles.js": ["ae4485e3db3c09241de557cba63c2a927f059671c1a3c84cf9d4624a8de074db", 964], "table-composition.js": ["2cea73b71dcc4cdefabd563fdf52527d8b75b23215da3038fcbc82c40170d285", 23679], "workspace-history.js": ["c38eb1366805433985817968e6ad344bc51e3a9b174b0e60f17dc2ea7c5fa5bd", 2586]}
INTERFACE_FILES = INTERFACE_FILES | frozenset(REVERSE_ORIGINAL_ANCHORS)
REVERSE_MAX_ARCHIVE_BYTES = 64 * 1024 * 1024
REVERSE_MAX_PART_BYTES = 2 * 1024 * 1024
REVERSE_MAX_PARTS = 32


def reverse_media_limit(name):
    if name not in REVERSE_MEDIA_PATHS: raise ValueError('Unexpected reverse-table media path')
    return 256 * 1024 if name.endswith('.thumb.webp') else 2 * 1024 * 1024


def validate_reverse_media(name, content):
    if (name not in REVERSE_MEDIA_PATHS or not 30 <= len(content) <= reverse_media_limit(name)
            or content[:4] != b'RIFF' or content[8:12] != b'WEBP'
            or int.from_bytes(content[4:8],'little') != len(content)-8):
        raise ValueError('Invalid bounded reverse-table WebP signature')
    cursor,canvas,dimensions,canvases,frames = 12,None,None,0,0
    while cursor < len(content):
        if cursor+8 > len(content): raise ValueError('Truncated reverse-table WebP chunk')
        kind=content[cursor:cursor+4];size=int.from_bytes(content[cursor+4:cursor+8],'little')
        start=cursor+8;end=start+size
        if end+(size&1) > len(content) or kind in (b'ANIM',b'ANMF'): raise ValueError('Invalid or animated reverse-table WebP')
        data=content[start:end]
        if kind == b'VP8X':
            if len(data) != 10 or data[0]&2 or canvases or frames: raise ValueError('Invalid reverse-table WebP canvas')
            canvas=(int.from_bytes(data[4:7],'little')+1,int.from_bytes(data[7:10],'little')+1);canvases+=1
        elif kind == b'VP8 ':
            if len(data)<10 or data[3:6] != b'\x9d\x01\x2a': raise ValueError('Invalid reverse-table VP8 frame')
            dimensions=(int.from_bytes(data[6:8],'little')&0x3fff,int.from_bytes(data[8:10],'little')&0x3fff);frames+=1
        elif kind == b'VP8L':
            if len(data)<5 or data[0] != 0x2f: raise ValueError('Invalid reverse-table VP8L frame')
            bits=int.from_bytes(data[1:5],'little');dimensions=((bits&0x3fff)+1,((bits>>14)&0x3fff)+1);frames+=1
        cursor=end+(size&1)
    expected_dimensions=(300,200) if name.endswith('.thumb.webp') else (1536,1024)
    if frames != 1 or (canvas is not None and canvas != dimensions) or dimensions != expected_dimensions:
        raise ValueError('Reverse-table native WebP dimensions differ')
    return {'path':name,'width':dimensions[0],'height':dimensions[1],'mime':'image/webp'}


def load_reverse_media_package(package_root, media_records):
    prefix='reverse-table-media';folder=package_root/'sofa-publish'/prefix;control=folder/(prefix+'-manifest.json')
    if not control.exists() and not control.is_symlink():
        if media_records: raise ValueError('Reverse-table assets require their exact verified bundle')
        return {},None
    regular_source(control,package_root)
    if not 0 < control.stat().st_size <= 64*1024: raise ValueError('Invalid reverse-table package control size')
    raw=control.read_bytes();m=json.loads(raw.decode('utf-8'))
    if (not isinstance(m,dict) or set(m) != {'schemaVersion','application','archiveSha256','archiveBytes','memberCount','parts','media'}
            or type(m['schemaVersion']) is not int or m['schemaVersion'] != 1 or m['application'] != 'studio-sofa-reverse-table-media'
            or not interface_digest(m['archiveSha256']) or not interface_integer(m['archiveBytes'],REVERSE_MAX_ARCHIVE_BYTES)
            or type(m['memberCount']) is not int or m['memberCount'] != 180 or set(media_records) != REVERSE_MEDIA_PATHS
            or not isinstance(m['parts'],list) or not 1 <= len(m['parts']) <= REVERSE_MAX_PARTS
            or not isinstance(m['media'],list) or len(m['media']) != 180):
        raise ValueError('Invalid exact reverse-table media manifest')
    metadata={}
    for row in m['media']:
        if (not isinstance(row,dict) or set(row) != {'path','width','height','mime'}
                or row.get('path') not in REVERSE_MEDIA_PATHS or row['path'] in metadata):
            raise ValueError('Unexpected or duplicate reverse-table metadata')
        metadata[row['path']]=row
    if set(metadata) != REVERSE_MEDIA_PATHS: raise ValueError('Reverse-table metadata coverage differs')
    stream=io.BytesIO();digest=hashlib.sha256();total=0
    for index,part in enumerate(m['parts'],1):
        if (not isinstance(part,dict) or set(part) != {'name','bytes','sha256'}
                or part['name'] != f'{prefix}.part-{index:04d}'
                or not interface_integer(part['bytes'],REVERSE_MAX_PART_BYTES) or not interface_digest(part['sha256'])):
            raise ValueError('Unexpected reverse-table package part')
        source=folder/part['name'];regular_source(source,package_root)
        if source.stat().st_size != part['bytes']: raise ValueError('Reverse-table part size differs')
        b=source.read_bytes();total+=len(b)
        if sha256(b) != part['sha256'] or total > m['archiveBytes']: raise ValueError('Reverse-table part checksum or total differs')
        digest.update(b);stream.write(b)
    if total != m['archiveBytes'] or digest.hexdigest() != m['archiveSha256']: raise ValueError('Reverse-table archive checksum differs')
    media={};expanded=0
    try:
        with zipfile.ZipFile(stream) as archive:
            if len(archive.infolist()) != 180: raise ValueError('Reverse-table archive member count differs')
            for info in archive.infolist():
                name,mode=info.filename,info.external_attr>>16
                if (name not in REVERSE_MEDIA_PATHS or name in media or info.is_dir() or stat.S_ISLNK(mode)
                        or stat.S_IFMT(mode) not in (0,stat.S_IFREG) or info.flag_bits&1
                        or info.compress_type not in (zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED)):
                    raise ValueError('Unsafe or unexpected reverse-table archive member')
                row=media_records[name]
                if not interface_integer(info.file_size,reverse_media_limit(name)) or info.file_size != row['bytes']:
                    raise ValueError('Reverse-table asset size differs')
                expanded+=info.file_size
                if expanded > REVERSE_MAX_ARCHIVE_BYTES: raise ValueError('Reverse-table expanded package limit exceeded')
                b=archive.read(info)
                if len(b) != row['bytes'] or sha256(b) != row['sha256']: raise ValueError('Reverse-table asset checksum differs')
                actual=validate_reverse_media(name,b)
                if any(type(metadata[name][key]) is not type(value) or metadata[name][key] != value for key,value in actual.items()):
                    raise ValueError('Reverse-table media metadata differs from native header')
                media[name]=b
    except (zipfile.BadZipFile,RuntimeError,zlib.error) as error: raise ValueError('Invalid reverse-table ZIP') from error
    if set(media) != REVERSE_MEDIA_PATHS: raise ValueError('Reverse-table archive exact coverage differs')
    return media,{'manifestPath':'sofa-publish/'+prefix+'/'+prefix+'-manifest.json','manifestSha256':sha256(raw),
                  'archiveSha256':m['archiveSha256'],'archiveBytes':m['archiveBytes'],'memberCount':180,'parts':m['parts'],'media':m['media']}


def validate_v132_overlay_records(overlay, manifest, expected, restored):
    if (not isinstance(overlay,dict) or set(overlay) != {'schemaVersion','application','baseArchiveSha256','files'}
            or type(overlay['schemaVersion']) is not int or overlay['schemaVersion'] != 1
            or overlay['application'] != 'studio-sofa-interface' or overlay['baseArchiveSha256'] != manifest['archiveSha256']):
        raise ValueError('V132 full interface base package differs')
    files=overlay['files']
    if not isinstance(files,list) or not 1 <= len(files) <= V132_FULL_OVERLAY_LIMIT: raise ValueError('V132 full interface count exceeds its explicit derived limit')
    rows={};new={}
    for row in files:
        if (not isinstance(row,dict) or set(row) != {'path','expectedBaseSha256','expectedBaseBytes','sha256','bytes'}
                or not isinstance(row.get('path'),str) or row['path'] in rows or not interface_digest(row['sha256'])):
            raise ValueError('Invalid or duplicate V132 full interface record')
        name=row['path'];rows[name]=row
        if name.startswith('assets/product-galleries/v132/') and name not in REVERSE_MEDIA_PATHS:
            raise ValueError('Unapproved V132 media path')
        if name in REVERSE_ORIGINAL_ANCHORS and (row['expectedBaseSha256'],row['expectedBaseBytes']) != tuple(REVERSE_ORIGINAL_ANCHORS[name]):
            raise ValueError('V132 original source anchor differs')
        if name in REVERSE_MEDIA_PATHS:
            if (row['expectedBaseSha256'] is not None or type(row['expectedBaseBytes']) is not int or row['expectedBaseBytes'] != 0
                    or not interface_integer(row['bytes'],reverse_media_limit(name)) or name in expected
                    or (restored/name).exists() or (restored/name).is_symlink()):
                raise ValueError('Reverse-table addition collides with an original member')
            new[name]=row
    if new and (set(new) != REVERSE_MEDIA_PATHS or len(files) != V132_FULL_OVERLAY_LIMIT
                or not set(REVERSE_ORIGINAL_ANCHORS).issubset(rows)):
        raise ValueError('V132 requires its exact full record count and180 approved media records')
    return files,new


_apply_interface_overrides_before_v132 = apply_interface_overrides


def apply_v132_interface_overrides(package_root, restored, manifest, expected):
    control=package_root/'sofa-publish/interface-overrides.json'
    if not control.exists() and not control.is_symlink(): return _apply_interface_overrides_before_v132(package_root,restored,manifest,expected)
    regular_source(control,package_root)
    if not 0 < control.stat().st_size <= MAX_INTERFACE_MANIFEST_BYTES: raise ValueError('Invalid V132 full control size')
    overlay=json.loads(control.read_text('utf-8'))
    files,new=validate_v132_overlay_records(overlay,manifest,expected,restored)
    media,package_audit=load_reverse_media_package(package_root,new)
    if not new: return _apply_interface_overrides_before_v132(package_root,restored,manifest,expected)
    # The actual full manifest remains complete. A separate read-only
    # compatibility view delegates the explicit legacy/source subset.
    with tempfile.TemporaryDirectory(prefix='.sofa-v132-legacy-view-',dir=restored.parent) as temporary:
        filtered=Path(temporary);source=package_root/'sofa-publish'
        for f in source.rglob('*'):
            if f.is_symlink(): raise ValueError('Symlink in V132 publication source')
            if not f.is_file() or f==control: continue
            regular_source(f,package_root);target=filtered/'sofa-publish'/f.relative_to(source)
            target.parent.mkdir(parents=True,exist_ok=True);os.link(f,target)
        subset=dict(overlay);subset['files']=[row for row in files if row['path'] not in new]
        if len(subset['files']) != V132_LEGACY_OVERLAY_RECORDS: raise ValueError('V132 compatibility view count differs')
        target=filtered/'sofa-publish/interface-overrides.json';target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text(json.dumps(subset,ensure_ascii=False,indent=2)+'\n','utf-8')
        count=_apply_interface_overrides_before_v132(filtered,restored,manifest,expected)
    for name,b in media.items():
        target=restored/safe_name(name)
        if name in expected or target.exists() or target.is_symlink(): raise ValueError('Verified reverse-table installation collides')
        target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b)
        if sha256(target.read_bytes()) != new[name]['sha256']: raise ValueError('Installed reverse-table checksum differs')
        expected[name]={'path':name,'bytes':len(b),'sha256':new[name]['sha256']}
    audit_name='INTERFACE-OVERRIDES.json';audit=json.loads((restored/audit_name).read_text('utf-8'))
    audit.update({'files':files,'fullOverlayLimit':V132_FULL_OVERLAY_LIMIT,'fullOverlayRecords':len(files),
                  'legacyOverlayRecordCount':count,'reverseTableMediaRecordCount':len(new),'reverseTableMediaPackage':package_audit})
    b=(json.dumps(audit,ensure_ascii=False,indent=2)+'\n').encode();(restored/audit_name).write_bytes(b)
    expected[audit_name]={'path':audit_name,'bytes':len(b),'sha256':sha256(b)}
    integrity='PACKAGE-MEMBERS.json';details={'schemaVersion':1,'members':sorted((r for name,r in expected.items() if name != integrity),key=lambda r:r['path'])}
    b=(json.dumps(details,ensure_ascii=False,indent=2)+'\n').encode()
    if sum(row['bytes'] for name,row in expected.items() if name != integrity)+len(b) > MAX_SITE_BYTES:
        raise ValueError('Full V132 publication exceeds its preserved site limit')
    (restored/integrity).write_bytes(b);expected[integrity]={'path':integrity,'bytes':len(b),'sha256':sha256(b)}
    return count+len(new)


apply_interface_overrides = apply_v132_interface_overrides



# V180: one approved material catalogue module is added to the preserved
# legacy patch chain. Every earlier media/restoration gate remains active.
V180_CONFIG_PINS = {'app.js': {'sha256': '9e061c52852390617e598e3438f918a15b3c638dbbaab4b8e1b36571533ce785', 'bytes': 65493}, 'approved-fabrics.js': {'sha256': '7d64ad58ae4dbf44bca3ac7d6af26ded0977deeb7e799da37070d19de91b9687', 'bytes': 29278}, 'combinations-state.js': {'sha256': '50e9dfdec219c75f2c9f76711bf7d5eb8672442fcc434a25b08d67c1a91fb477', 'bytes': 12033}, 'configuration-guide.js': {'sha256': 'e0ffc3bd94490897441af91150619424154d28a19ef43e4510bc7d598de17602', 'bytes': 8937}, 'consumer-summary.js': {'sha256': '9dbee829e75c3481354537a2c9f81036e6152fb676f97cffb5327abae03e3ecd', 'bytes': 11917}, 'index.html': {'sha256': '51be834ee5ac8065262bb7066b4f06b15bd6909ba20074f59df6f9a145389290', 'bytes': 30737}, 'modular-layout.js': {'sha256': '463eea4f89c8c1b5c08d029adb120cf9a094c619bd09d68893341263a466e9e1', 'bytes': 14402}, 'module-chain-planner.js': {'sha256': '183bb573956d8f3960f1d7991627be10ca3ac45a08bf04430f08df69bbe1a43c', 'bytes': 10375}, 'module-chain.js': {'sha256': '826fd8ea89544807da3f440bc6051a84dca10f7d36f38a958d4942f0a046fc28', 'bytes': 14328}, 'table-composition.js': {'sha256': 'b2c1270f97b678181d9e944a024ce96bb7bcadc8ccb486eec5326dbbd0b1255f', 'bytes': 24415}}
_apply_interface_overrides_before_v180 = apply_interface_overrides

def apply_v180_interface_overrides(package_root, restored, manifest, expected):
    control=package_root/'sofa-publish/interface-overrides.json'
    if not control.exists() and not control.is_symlink():
        return _apply_interface_overrides_before_v180(package_root,restored,manifest,expected)
    regular_source(control,package_root)
    overlay=json.loads(control.read_text('utf-8'));files=overlay.get('files',[])
    additions=[r for r in files if r.get('path')=='approved-fabrics.js']
    if not additions:
        return _apply_interface_overrides_before_v180(package_root,restored,manifest,expected)
    if len(additions)!=1 or len(files)!=V132_FULL_OVERLAY_LIMIT+1:
        raise ValueError('V180 requires exactly one catalogue addition')
    rows={r.get('path'):r for r in files}
    if len(rows)!=len(files):raise ValueError('Duplicate V180 control paths')
    for name,pin in V180_CONFIG_PINS.items():
        row=rows.get(name)
        if not row or row.get('sha256')!=pin['sha256'] or row.get('bytes')!=pin['bytes']:
            raise ValueError('V180 approved configurator content differs: '+name)
    row=additions[0];name=row['path']
    if (row.get('expectedBaseSha256') is not None or row.get('expectedBaseBytes')!=0
            or name in expected or (restored/name).exists() or (restored/name).is_symlink()):
        raise ValueError('V180 catalogue addition collides with original source')
    source=package_root/'sofa-publish/interface-overrides'/name
    regular_source(source,package_root);body=source.read_bytes()
    if len(body)!=row['bytes'] or sha256(body)!=row['sha256']:
        raise ValueError('V180 catalogue source checksum differs')
    body.decode('utf-8')
    with tempfile.TemporaryDirectory(prefix='.sofa-v180-legacy-view-',dir=restored.parent) as temporary:
        filtered=Path(temporary);folder=package_root/'sofa-publish'
        for f in folder.rglob('*'):
            if f.is_symlink():raise ValueError('Symlink in V180 publication source')
            if not f.is_file() or f==control:continue
            regular_source(f,package_root);target=filtered/'sofa-publish'/f.relative_to(folder)
            target.parent.mkdir(parents=True,exist_ok=True);os.link(f,target)
        subset=dict(overlay);subset['files']=[r for r in files if r['path']!=name]
        target=filtered/'sofa-publish/interface-overrides.json';target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text(json.dumps(subset,ensure_ascii=False,indent=2)+'\n','utf-8')
        count=_apply_interface_overrides_before_v180(filtered,restored,manifest,expected)
    target=restored/name;target.write_bytes(body)
    expected[name]={'path':name,'bytes':len(body),'sha256':sha256(body)}
    audit_name='INTERFACE-OVERRIDES.json';audit=json.loads((restored/audit_name).read_text('utf-8'))
    audit.update({'files':files,'legacyFullOverlayLimit':V132_FULL_OVERLAY_LIMIT,
                  'fullOverlayLimit':V132_FULL_OVERLAY_LIMIT+1,'fullOverlayRecords':len(files),
                  'v180ConfiguratorFiles':V180_CONFIG_PINS,'v180AdditionalFileCount':1})
    b=(json.dumps(audit,ensure_ascii=False,indent=2)+'\n').encode();(restored/audit_name).write_bytes(b)
    expected[audit_name]={'path':audit_name,'bytes':len(b),'sha256':sha256(b)}
    integrity='PACKAGE-MEMBERS.json';details={'schemaVersion':1,'members':sorted((r for n,r in expected.items() if n!=integrity),key=lambda r:r['path'])}
    b=(json.dumps(details,ensure_ascii=False,indent=2)+'\n').encode()
    if sum(r['bytes'] for n,r in expected.items() if n!=integrity)+len(b)>MAX_SITE_BYTES:
        raise ValueError('V180 configurator publication exceeds preserved site limit')
    (restored/integrity).write_bytes(b);expected[integrity]={'path':integrity,'bytes':len(b),'sha256':sha256(b)}
    return count+1

apply_interface_overrides = apply_v180_interface_overrides

if __name__ == '__main__':
    main()
