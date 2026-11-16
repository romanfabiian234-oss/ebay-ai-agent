#!/usr/bin/env python3
"""Run all offline checks; --browser also runs Playwright DOM integrations."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--browser', action='store_true', help='Include Playwright browser tests')
args = parser.parse_args()
steps = []
for path in sorted((ROOT / 'Tests').rglob('*')):
    if path.name.endswith(('.test.js', '.test.cjs')):
        steps.append(['node', str(path.relative_to(ROOT))])
for path in sorted((ROOT / 'Tests/regression').glob('*.py')):
    if path.name == 'csp_and_control_window.py' and not args.browser:
        continue
    steps.append([sys.executable, '-B', str(path.relative_to(ROOT))])
if args.browser:
    steps.extend(['node', str(p.relative_to(ROOT))]
                 for p in sorted((ROOT / 'Tests/integration').glob('*.cjs')))
    steps.extend([sys.executable, '-B', str(p.relative_to(ROOT))]
                 for p in sorted((ROOT / 'Tests/integration').glob('*.py')))
steps.append([sys.executable, '-B', 'Tests/release/release.py'])
for command in steps:
    print('RUN', ' '.join(command), flush=True)
    result = subprocess.run(command, cwd=ROOT)
    if result.returncode:
        raise SystemExit(result.returncode)
version = json.loads((ROOT / 'Extension/manifest.json').read_text())['version']
print(f'ALL V{version} CHECKS PASSED ({len(steps)} scripts; browser={args.browser})')
