#!/usr/bin/env python3
"""Build an auditable source distribution without old ZIPs or runtime data."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def build(output, source_sha=None):
    if source_sha and not re.fullmatch(r'[0-9a-f]{40}', source_sha):
        raise ValueError('Source SHA must be a full 40-character commit SHA')
    version = json.loads((ROOT / 'Extension/manifest.json').read_text())['version']
    if not re.fullmatch(r'[0-9]+(?:\.[0-9]+){0,3}', version):
        raise ValueError('Invalid manifest version')
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f'ebay-ai-agent-v{version}.zip'
    paths = [ROOT / p for p in ('START.command', 'START_HERE.txt', 'README.md', 'LICENSE', 'requirements-dev.txt', 'package.json', 'package-lock.json')]
    for directory in ('Backend', 'Extension', 'Docs', 'Tests', 'Tools'):
        paths.extend(p for p in (ROOT / directory).rglob('*') if p.is_file())
    entries = {}
    for path in sorted(paths):
        rel = path.relative_to(ROOT)
        if path.is_symlink():
            raise ValueError(f'Symlinks may not ship: {rel}')
        if '__pycache__' in rel.parts or path.name.startswith('.') or path.suffix in ('.pyc', '.zip'):
            continue
        if path.name == 'hub-bootstrap.json':
            raise ValueError('Legacy credentials may not ship')
        entries[str(rel)] = path.read_bytes()
    receipt = {'version': version, 'source_sha': source_sha,
               'sha256': {name: hashlib.sha256(data).hexdigest() for name, data in entries.items()}}
    entries['BUILD.json'] = (json.dumps(receipt, indent=2) + '\n').encode()
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as bundle:
        for name, data in sorted(entries.items()):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            mode = 0o755 if name.endswith('.command') else 0o644
            info.external_attr = (0o100000 | mode) << 16
            bundle.writestr(info, data)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix('.zip.sha256').write_text(f'{digest}  {archive.name}\n')
    return archive


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    parser.add_argument('--source-sha', default=os.environ.get('GITHUB_SHA'))
    args = parser.parse_args()
    print(build(args.output, args.source_sha))
