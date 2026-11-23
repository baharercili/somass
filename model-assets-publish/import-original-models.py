#!/usr/bin/env python3
"""Restore byte-identical collection assets from the pinned release archives."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import zipfile


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def safe_path(name):
    p = PurePosixPath(name)
    if (p.is_absolute() or len(p.parts) != 2 or p.parts[0] != 'models'
            or '..' in p.parts or '\\' in name
            or not all(c in '0123456789abcdef-.glbin' for c in p.name)):
        raise ValueError('Unexpected asset path: ' + name)
    return p


def run(checkout, *args):
    subprocess.run(['git', '-C', str(checkout), *args], check=True)


def download(url, path, spec):
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'SOMASS-model-integrity-import'})
            with urllib.request.urlopen(request, timeout=180) as response, path.open('wb') as out:
                shutil.copyfileobj(response, out, 1024 * 1024)
            if path.stat().st_size != spec['bytes'] or digest(path) != spec['sha256']:
                raise ValueError('Archive integrity check failed: ' + spec['name'])
            return
        except (OSError, urllib.error.URLError):
            if attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--checkout', required=True, type=Path)
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    data = json.loads(args.manifest.read_text())
    assert data['repository'] == 'baharercili/somass'
    assert data['assetBranch'] == 'collection-model-assets'
    assert data['releaseTag'] == 'collection-models-original-20261123'
    assert data['sourceGeometryAndTexturesUnchanged'] is True
    assert len(data['files']) == 195 and len(data['models']) == 139
    expected = {f['path']: f for f in data['files']}
    assert len(expected) == len(data['files'])
    for name in expected:
        safe_path(name)
    all_members = [m['path'] for a in data['archives'] for m in a['members']]
    assert len(all_members) == len(set(all_members)) == len(expected)
    assert set(all_members) == set(expected)
    checkout = args.checkout.resolve()

    def matches(spec):
        path = checkout / spec['path']
        return path.is_file() and path.stat().st_size == spec['bytes'] and digest(path) == spec['sha256']

    if not args.verify_only:
        run(checkout, 'config', 'user.name', 'github-actions[bot]')
        run(checkout, 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
        with tempfile.TemporaryDirectory(prefix='somass-originals-') as temp:
            for archive in data['archives']:
                members = archive['members']
                assert all(expected[m['path']] == m for m in members)
                if all(matches(m) for m in members):
                    print('Already verified:', archive['collection'], flush=True)
                    continue
                assert '/' not in archive['name'] and archive['name'].endswith('-original-models.zip')
                path = Path(temp) / archive['name']
                url = ('https://github.com/baharercili/somass/releases/download/'
                       + data['releaseTag'] + '/' + archive['name'])
                download(url, path, archive)
                with zipfile.ZipFile(path) as z:
                    assert set(z.namelist()) == {m['path'] for m in members}
                    assert len(z.infolist()) == len(members)
                    for member in members:
                        name = member['path']
                        info = z.getinfo(name)
                        assert info.file_size == member['bytes']
                        assert (info.external_attr >> 16) & 0o170000 != 0o120000
                        dest = checkout / str(safe_path(name))
                        dest.parent.mkdir(parents=True, exist_ok=True)
                        tmp = dest.with_name(dest.name + '.incoming')
                        with z.open(info) as src, tmp.open('wb') as out:
                            shutil.copyfileobj(src, out, 1024 * 1024)
                        assert tmp.stat().st_size == member['bytes'] and digest(tmp) == member['sha256']
                        os.replace(tmp, dest)
                path.unlink()
                run(checkout, 'add', '--', *[m['path'] for m in members])
                changed = subprocess.run(['git', '-C', str(checkout), 'diff', '--cached', '--quiet']).returncode
                if changed:
                    run(checkout, 'commit', '-m', 'Import byte-identical original models: ' + archive['collection'])
                    run(checkout, 'push', 'origin', 'HEAD:collection-model-assets')
                print('Verified and saved:', archive['collection'], len(members), flush=True)
    for spec in data['files']:
        assert matches(spec), 'Missing or changed: ' + spec['path']
    for name, model in data['models'].items():
        h = hashlib.sha256()
        size = 0
        for part in model['parts']:
            with (checkout / str(safe_path(part['src']))).open('rb') as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b''):
                    h.update(chunk)
                    size += len(chunk)
        assert size == model['bytes'] and h.hexdigest() == model['sha256'], name
    print('Verified 195 transport files and 139 byte-identical original GLBs.', flush=True)


if __name__ == '__main__':
    main()
