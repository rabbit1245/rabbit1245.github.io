"""Rebuild the explicitly reviewed 2.9 club assets from immutable source revisions."""
from pathlib import Path
import base64
import concurrent.futures
import hashlib
import json
import re
import struct
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
manifest_paths = [ROOT / p for p in sys.argv[1:]] or sorted((ROOT / 'data').glob('crest-additions-*.json'))
manifest = {'clubs': [row for path in manifest_paths for row in json.loads(path.read_text())['clubs']]}
clubs = {r[0]: r for r in json.loads((ROOT / 'src/game/catalog.json').read_text())['clubs']}
assert len({r['id'] for r in manifest['clubs']}) == len(manifest['clubs'])


def fetch(row):
    assert clubs[row['id']][2] == row['native']
    if row.get('parentId'):
        data = (ROOT / clubs[row['parentId']][7]).read_bytes()
    else:
        url = row['repository'].replace('https://github.com/', 'https://raw.githubusercontent.com/')
        url += '/' + row['revision'] + '/' + urllib.parse.quote(row['sourcePath'])
        data = urllib.request.urlopen(url, timeout=40).read()
        if row.get('sourceSha256'):
            assert hashlib.sha256(data).hexdigest() == row['sourceSha256'], row['id']
        if row.get('normalization'):
            assert row['normalization'] == 'trim-trailing-whitespace'
            data = b'\n'.join(line.rstrip(b' \t') for line in data.split(b'\n'))
        if row['sourcePath'].endswith('.png'):
            assert data.startswith(b'\x89PNG\r\n\x1a\n')
            w, h = struct.unpack('>II', data[16:24])
            payload = base64.b64encode(data).decode()
            data = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
                    f'<image width="{w}" height="{h}" href="data:image/png;base64,{payload}"/></svg>').encode()
    assert ET.fromstring(data).tag == '{http://www.w3.org/2000/svg}svg'
    assert not re.search(rb'<\s*(?:script|foreignObject|!DOCTYPE|!ENTITY)\b|(?:href|src)\s*=\s*[\'"]\s*(?:https?:|//|javascript:)|@import|url\(\s*[\'"]?\s*(?:https?:|//)', data, re.I)
    assert hashlib.sha256(data).hexdigest() == row['sha256'], row['id']
    return ROOT / f"assets/crests/{row['id']}.svg", data


with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    results = list(pool.map(fetch, manifest['clubs']))
# Do not overwrite any asset until every identity and source hash passed.
for path, data in results:
    path.write_bytes(data)
print(f'Verified {len(results)} club-specific assets (including approved shared reserve badges).')
