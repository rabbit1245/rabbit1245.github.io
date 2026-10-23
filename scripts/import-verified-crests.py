"""Import only explicitly reviewed canonical club IDs from a pinned source revision."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
manifest_path = ROOT / "data/crest-sources.json"
manifest = json.loads(manifest_path.read_text())
catalog_path = ROOT / "src/game/catalog.json"
catalog = json.loads(catalog_path.read_text())
clubs = {row[0]: row for row in catalog["clubs"]}
mapping_path = ROOT / "data/canonical-logos.json"
mapping = json.loads(mapping_path.read_text())
diagnostic_path = ROOT / "data/crest-diagnostics.json"
diagnostics = json.loads(diagnostic_path.read_text())
by_id = {row["id"]: row for row in diagnostics}
assert len({r["id"] for r in manifest["clubs"]}) == len(manifest["clubs"])


def fetch(row):
    club = clubs[row["id"]]
    assert club[2] == row["native"], f"Club identity changed: {row['id']}"
    source = row["sourcePath"]
    assert source.startswith("logos/") and source.endswith(".svg") and ".." not in Path(source).parts
    url = f"{manifest['repository'].replace('https://github.com/', 'https://raw.githubusercontent.com/')}/{manifest['revision']}/{urllib.parse.quote(source)}"
    with urllib.request.urlopen(url, timeout=40) as response:
        svg = response.read()
    text = svg.decode("utf-8")
    assert ET.fromstring(text).tag == "{http://www.w3.org/2000/svg}svg", source
    assert not re.search(r"<\s*(?:script|foreignObject|!DOCTYPE|!ENTITY)\b|(?:href|src)\s*=\s*['\"]\s*(?:https?:|//|javascript:)|@import|url\(\s*['\"]?\s*(?:https?:|//)", text, re.I), source
    sha = hashlib.sha256(svg).hexdigest()
    assert not row.get("sha256") or row["sha256"] == sha, f"Source hash changed: {source}"
    return row, svg, sha, url


# Validate every response before changing the catalogue or installing any asset.
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
    fetched = list(executor.map(fetch, manifest["clubs"]))
for row, svg, sha, url in fetched:
    id = row["id"]
    asset = f"assets/crests/{id}.svg"
    (ROOT / asset).write_bytes(svg)
    clubs[id][7] = mapping[id] = asset
    row["sha256"] = sha
    diagnostic = by_id.get(id)
    if diagnostic is None:
        club = clubs[id]
        diagnostic = {"id": id, "native": club[2], "display": club[1],
                      "country": club[3], "tier": int(re.search(r"\d+", club[4])[0])}
        diagnostics.append(diagnostic)
        by_id[id] = diagnostic
    diagnostic.update(source=Path(row["sourcePath"]).name, sourceURL=url,
                      method=row["method"], confidence=1.0, sha256=sha)
catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")))
for path, data in [(mapping_path, mapping), (diagnostic_path, diagnostics)]:
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(f"Installed {len(fetched)} verified club-ID crest mappings.")
