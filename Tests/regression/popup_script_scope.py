#!/usr/bin/env python3
from html.parser import HTMLParser
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
POPUP_DIR = ROOT / 'Extension/ui/popup'
HTML = (POPUP_DIR / 'popup.html').read_text()

class Scripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources = []
    def handle_starttag(self, tag, attrs):
        if tag.lower() != 'script':
            return
        src = dict(attrs).get('src')
        if src:
            self.sources.append(src)

parser = Scripts()
parser.feed(HTML)
assert parser.sources, 'popup script list is empty'
assert parser.sources[0] == '../registry/registry.js', parser.sources[:3]
assert parser.sources[-1] == 'popup.js', parser.sources[-3:]

parts = []
for src in parser.sources:
    path = (POPUP_DIR / src).resolve()
    assert path.is_file(), f'popup script missing: {src}'
    parts.append(f'\n// ---- {src} ----\n{path.read_text()}')

# Separate classic scripts share a global lexical environment. Concatenating them
# catches redeclared const/let/function scope problems that per-file syntax checks miss.
with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as handle:
    handle.write(''.join(parts))
    combined = Path(handle.name)
try:
    result = subprocess.run(['node', '--check', str(combined)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
finally:
    combined.unlink(missing_ok=True)

print(f'PASS V8.23.21 popup container scope: {len(parser.sources)} classic scripts preserve one valid lexical scope in HTML load order')
