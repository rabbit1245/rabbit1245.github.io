import csv, json, re, unicodedata
from pathlib import Path

ROOT = Path(".")
CSV = ROOT / "data" / "male_players.csv"
HTML = ROOT / "index.html"
OUT = ROOT / "data" / "players.min.json"

def norm(s):
    s = unicodedata.normalize("NFC", str(s or "")).lower().replace("&", "and")
    return re.sub(r"[^a-z0-9가-힣à-ž]+", "", s)

def num(v, default=0):
    try:
        s = str(v or "").strip().replace(",", "")
        return int(round(float(s))) if s else default
    except Exception:
        return default

def pos(v):
    v = str(v or "").upper().strip()
    m = {"CAM":"AM","LCM":"CM","RCM":"CM","CDM":"DM","LDM":"DM","RDM":"DM",
         "CF":"ST","LS":"ST","RS":"ST","LF":"LW","RF":"RW"}
    return m.get(v, v or "CM")

html = HTML.read_text(encoding="utf-8")
m = re.search(r"const V27_DB=(\{.*?\});\s*window\.CAREER24_CANONICAL_DB=V27_DB", html, re.S)
if not m:
    raise SystemExit("V27_DB not found")
db = json.loads(m.group(1))

clubs = {c["id"]: c for c in db["clubs"]}
aliases = {}
for c in db["clubs"]:
    for a in (c.get("native"), c.get("display")):
        if a:
            aliases[norm(a)] = c["id"]
for a, cid in (db.get("clubAliases") or {}).items():
    aliases[norm(a)] = cid

players = []
club_counts = {}
with CSV.open("r", encoding="utf-8-sig", newline="") as f:
    rd = csv.DictReader(f)
    for i, r in enumerate(rd, 1):
        name = (r.get("Name") or "").strip()
        if not name:
            continue
        native = (r.get("Team") or "Free Agent").strip()
        league = (r.get("League") or "").strip()
        cid = aliases.get(norm(native))
        rec = clubs.get(cid) if cid else None
        primary = pos(r.get("Position"))
        positions = [primary]
        for x in re.split(r"[,/;]", r.get("Alternative positions") or ""):
            p = pos(x)
            if p and p not in positions:
                positions.append(p)
        url = (r.get("url") or "").strip()
        ids = re.findall(r"(\d+)", url)
        pid = "fc25_" + (ids[-1] if ids else str(i))
        p = {
            "id": pid,
            "name": name,
            "club": rec.get("display") if rec else native,
            "clubNative": native,
            "league": league,
            "pos": primary,
            "positions": positions,
            "ovr": num(r.get("OVR"), 50),
            "potential": num(r.get("OVR"), 50),
            "age": num(r.get("Age")),
            "nation": (r.get("Nation") or "").strip(),
            "canonicalClubId": cid,
            "clubId": cid,
            "preferredFoot": (r.get("Preferred foot") or "").strip(),
            "weakFoot": num(r.get("Weak foot")),
            "skillMoves": num(r.get("Skill moves")),
            "heightCm": (r.get("Height") or "").strip(),
            "weightKg": (r.get("Weight") or "").strip(),
            "ratings": {
                "pace": num(r.get("PAC")),
                "shooting": num(r.get("SHO")),
                "passing": num(r.get("PAS")),
                "dribbling": num(r.get("DRI")),
                "defending": num(r.get("DEF")),
                "physical": num(r.get("PHY"))
            },
            "realData": True,
            "source": "EA SPORTS FC 25"
        }
        players.append(p)
        if cid:
            club_counts[cid] = club_counts.get(cid, 0) + 1

payload = {
    "version": 2,
    "count": len(players),
    "mapped": sum(1 for p in players if p["canonicalClubId"]),
    "clubs": club_counts,
    "players": players
}
OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("players", len(players), "mapped", payload["mapped"], "bytes", OUT.stat().st_size)
if len(players) < 5000:
    raise SystemExit("player db unexpectedly small")
