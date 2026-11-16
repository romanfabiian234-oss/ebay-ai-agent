"""Check installed-layout version identity and reproducible distribution contents."""
import hashlib
import importlib.util
import json
from pathlib import Path
import runpy
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory() as directory:
    temp = Path(directory)
    (temp / 'backend').mkdir()
    (temp / 'Extension').mkdir()
    manifest = json.loads((ROOT / 'Extension/manifest.json').read_text())
    manifest['version'] = manifest['version_name'] = '99.2.3'
    (temp / 'Extension/manifest.json').write_text(json.dumps(manifest))
    (temp / 'backend/server.py').write_bytes((ROOT / 'Backend/server.py').read_bytes())
    loaded = runpy.run_path(str(temp / 'backend/server.py'))
    assert loaded['APP_VERSION'] == loaded['APP_SERVER_VERSION'] == '99.2.3'
    assert loaded['APP_DISPLAY_VERSION'] == 'V99.2.3'

    spec = importlib.util.spec_from_file_location('release_builder', ROOT / 'Tools/build_release.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    sha = 'a' * 40
    archive = module.build(temp / 'dist', sha)
    first = archive.read_bytes()
    with zipfile.ZipFile(archive) as bundle:
        names = set(bundle.namelist())
        for required in ('Backend/image_preprocess.js', 'Backend/native_host.py',
                         'Extension/manifest.json', 'START.command', 'LICENSE', 'package.json', 'package-lock.json'):
            assert required in names, required
        assert not any('__pycache__' in name or name.endswith(('.pyc','.zip')) for name in names)
        receipt = json.loads(bundle.read('BUILD.json'))
        assert receipt['source_sha'] == sha
        assert receipt['version'] == json.loads(bundle.read('Extension/manifest.json'))['version']
        assert set(receipt['sha256']) == names - {'BUILD.json'}
        for name, digest in receipt['sha256'].items():
            assert hashlib.sha256(bundle.read(name)).hexdigest() == digest, name
        assert (bundle.getinfo('START.command').external_attr >> 16) & 0o111
    assert module.build(temp / 'dist', sha).read_bytes() == first
    assert archive.with_suffix('.zip.sha256').read_text().split()[0] == hashlib.sha256(first).hexdigest()

start = (ROOT / 'START.command').read_text()
assert 'cp "$PREPROCESS_SOURCE" "$BACKEND_DIR/image_preprocess.js"' in start
assert '"$PREPROCESS_SOURCE" "$EXTENSION_SOURCE/manifest.json"' in start
assert 'APP_VERSION="$(' in start and 'echo "eBay AI Agent V$APP_VERSION"' in start
print('PASS installed version follows manifest; installer includes preprocessing; ZIP hashes and contents are reproducible')
