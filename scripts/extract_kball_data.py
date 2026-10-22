#!/usr/bin/env python3
"""Build K볼's compact, deterministic catalogue from the retained FC25 snapshot.

This only writes src/game/catalog.json. Source data and the legacy game stay unchanged.
It does not download or claim to verify 2026/27 memberships or competition regulations.
"""
from __future__ import annotations

import collections
import hashlib
import json
import re
import statistics
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src/game/catalog.json"
POSITIONS = {"GK", "CB", "LB", "RB", "LWB", "RWB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "CF", "SS", "ST"}
PALETTE = ["#E83E45", "#4389ED", "#1FA87A", "#F3B93D", "#9D71E8", "#EF7E3C", "#2DAAB3", "#D9507A", "#566CD6", "#A57A48"]

# Source competition is part of identity. E.g. Athletic Club (Spain) is not
# Athletic Club (Brazil), and Liverpool (Uruguay) is not Liverpool (England).
SOURCE_COUNTRIES = {
    "LALIGA EA SPORTS": "스페인", "LALIGA HYPERMOTION": "스페인",
    "Premier League": "영국", "EFL Championship": "영국", "EFL League One": "영국", "EFL League Two": "영국",
    "Bundesliga": "독일", "Bundesliga 2": "독일", "3. Liga": "독일",
    "Ligue 1 McDonald's": "프랑스", "Ligue 2 BKT": "프랑스",
    "Serie A Enilive": "이탈리아", "Serie BKT": "이탈리아",
    "Liga Portugal": "포르투갈", "1A Pro League": "벨기에", "Eredivisie": "네덜란드",
    "Trendyol Süper Lig": "튀르키예", "MLS": "미국", "K League 1": "대한민국", "CSL": "중국",
}
# Observed FC25 display names, including licensed substitutes. These express
# identity only: no ratings or preferred table positions are assigned here.
SOURCE_ALIASES = {
    "Atlético de Madrid": "ES1_03", "Athletic Club": "ES1_04", "RC Celta": "ES1_11",
    "D. Alavés": "ES1_14", "R. Valladolid CF": "ES1_20",
    "Paris SG": "FR1_01", "OM": "FR1_03", "OL": "FR1_05", "LOSC Lille": "FR1_04",
    "Stade Brestois 29": "FR1_09", "Stade Rennais FC": "FR1_12", "Angers SCO": "FR1_14",
    "Havre AC": "FR1_16", "Stade de Reims": "FR1_15",
    "Lombardia FC": "IT1_01", "Milano FC": "IT1_02", "Bergamo Calcio": "IT1_04", "Latium": "IT1_07",
    "SSC Napoli": "IT1_09", "Vitória SC": "PT1_05", "Estrela Amadora": "PT1_14", "AVS Futebol SAD": "PT1_18",
    "R. Union St.-G.": "BE1_09", "STVV": "BE1_12", "K. Beerschot VA": "BE1_13", "FCV Dender EH": "BE1_16",
    "KAA Gent": "BE1_05", "KRC Genk": "BE1_03", "KVC Westerlo": "BE1_14", "Sp. Charleroi": "BE1_08",
    "N.E.C. Nijmegen": "NL1_07", "Beijing FC": "CN1_04", "Rongcheng FC": "CN1_03",
    "Tianjin JMT FC": "CN1_06", "Zhejiang Pro": "CN1_07", "Qingdao W. Coast": "CN1_10",
    "Cangzhou FC": "CN1_13", "SZ Peng City": "CN1_15",
    "AS Roma": "IT1_06", "Man Utd": "EN1_14", "Spurs": "EN1_18", "Newcastle Utd": "EN1_15",
    "West Ham": "EN1_19", "Brighton": "EN1_05", "Nott'm Forest": "EN1_16", "Ipswich": "EN1_10",
    "SL Benfica": "PT1_02", "Estoril Praia": "PT1_13", "PSV": "NL1_01",
    "AS Monaco": "FR1_02", "OGC Nice": "FR1_06", "AS Saint-Étienne": "FR1_17", "AJ Auxerre": "FR1_11",
    "Royal Antwerp FC": "BE1_06", "1. FSV Mainz 05": "DE1_13", "Daejeon": "KR1_08",
    "LAFC": "US1_14", "Red Bulls": "US1_19", "New England": "US1_17", "Whitecaps FC": "US1_29",
    "Sounders FC": "US1_25", "Philadelphia": "US1_21", "SJ Earthquakes": "US1_24", "Sporting KC": "US1_26",
    "Başakşehir": "TR1_05", "Kasımpaşa": "TR1_14", "Sheffield Utd": "EN2_18", "Sheffield Wed": "EN2_19",
    "QPR": "EN2_17", "Norwich": "EN2_12", "West Brom": "EN2_24", "Preston": "EN2_16",
    "R. Oviedo": "ES2_17", "R. Sporting": "ES2_20", "RC Deportivo": "ES2_08", "R. Racing Club": "ES2_19",
    "SD Eibar": "ES2_09", "Racing de Ferrol": "ES2_18", "SD Huesca": "ES2_13", "Albacete BP": "ES2_01",
    "Clermont Foot 63": "FR2_15", "SM Caen": "FR2_17", "Grenoble Foot 38": "FR2_09",
    "USL Dunkerque": "FR2_04", "Laval MFC": "FR2_07", "ESTAC Troyes": "FR2_10",
    "En Avant Guingamp": "FR2_05", "Rodez AF": "FR2_13",
    "Düsseldorf": "DE2_04", "Braunschweig": "DE2_02", "Fürth": "DE2_06", "SC Paderborn 07": "DE2_15",
    "SV Waldhof": "DE3_18", "1860 München": "DE3_19", "B. Dortmund II": "DE3_06", "Aleman. Aachen": "DE3_01",
    "Unterhaching": "DE3_14", "Huddersfield": "EN3_03", "Bolton": "EN3_02", "Charlton Ath": "EN3_04",
    "Rotherham Utd": "EN3_11", "Wycombe": "EN3_21", "Peterborough": "EN3_12", "Northampton": "EN3_18",
    "Cambridge Utd": "EN3_17", "Stockport": "EN3_10", "Shrewsbury": "EN3_20",
    "Carrarese Calcio": "IT2_03", "SS Juve Stabia": "IT2_10",
}
CLUB_WORDS = {"fc", "sv", "sc", "vfl", "vfb", "afc", "cf", "ac", "fk", "bk", "ik", "sk", "kv", "rc", "ud", "cd", "ad", "rcd", "ca", "rsc"}


def signature(value: str) -> str:
    text = "".join(c for c in unicodedata.normalize("NFKD", str(value or "")).casefold() if not unicodedata.combining(c))
    words = re.findall(r"[a-z0-9가-힣]+", text)
    return "".join(w for w in words if w not in CLUB_WORDS and w != "1" and not re.fullmatch(r"(?:18|19|20)\d{2}", w))


def identity_index(db: dict) -> tuple[dict, dict]:
    exact, shortened = collections.defaultdict(set), collections.defaultdict(set)
    ids = {c["id"] for c in db["clubs"]}
    names = [(name, c["id"]) for c in db["clubs"] for name in (c["native"], c["display"])]
    names += [(name, cid) for name, cid in db.get("clubAliases", {}).items() if cid in ids]
    names += list(SOURCE_ALIASES.items())
    for name, cid in names:
        exact[norm(name)].add(cid)
        shortened[signature(name)].add(cid)
    return exact, shortened


def resolve_club(player: dict, clubs: dict, indexes: tuple[dict, dict]) -> str | None:
    country = SOURCE_COUNTRIES.get(player.get("league"))
    if country is None:
        return None  # Unsupported countries/continental name collisions stay unmatched.
    def eligible(ids):
        return {cid for cid in ids if cid in clubs and clubs[cid]["country"] == country}
    direct = eligible([player.get("canonicalClubId"), player.get("clubId")])
    if len(direct) == 1:
        return next(iter(direct))
    for index, normalize in zip(indexes, (norm, signature)):
        candidates = eligible(set().union(*(index.get(normalize(player.get(k)), set()) for k in ("clubNative", "club"))))
        if len(candidates) == 1:
            return next(iter(candidates))
        if len(candidates) > 1:
            return None
    return None


def roster_power(rows: list) -> float:
    values = sorted((p[3] for p in rows), reverse=True)
    def average(n):
        return sum(values[:n]) / max(1, min(n, len(values)))
    return round(average(11) * .82 + average(18) * .18, 2)


def select_real(rows: list) -> list:
    rows = sorted(rows, key=lambda p: (-p[3], p[0]))
    keepers = [row for row in rows if row[2] == "GK"][:2]
    return keepers + [row for row in rows if row not in keepers][:25 - len(keepers)]


def norm(value: str) -> str:
    text = unicodedata.normalize("NFC", str(value or "")).lower().replace("&", "and")
    return re.sub(r"[^a-z0-9가-힣à-ž]+", "", text)


def stable(value: str, minimum: int, maximum: int) -> int:
    return minimum + int.from_bytes(hashlib.sha256(value.encode()).digest()[:4], "big") % (maximum - minimum + 1)


def source_snapshot() -> tuple[dict, str]:
    for candidate in ("legacy.html", "public/legacy.html", "index.html"):
        path = ROOT / candidate
        if path.is_file():
            html = path.read_text(encoding="utf-8")
            match = re.search(r"const V27_DB=(\{.*?\});\s*window\.CAREER24_CANONICAL_DB=V27_DB", html, re.S)
            if match:
                return json.loads(match.group(1)), html
    raise SystemExit("Retained legacy canonical DB not found; preserve the source snapshot before rebuilding.")


def main() -> None:
    db, html = source_snapshot()
    source_players = json.loads((ROOT / "data/players.min.json").read_text(encoding="utf-8"))["players"]
    original_leagues = {league["id"]: league for league in db["leagues"]}
    source_clubs = {club["id"]: club for club in db["clubs"]}
    aliases = {}
    for club in db["clubs"]:
        for name in (club["native"], club["display"]):
            aliases[norm(name)] = club["id"]
    for alias, club_id in db.get("clubAliases", {}).items():
        if club_id in source_clubs:
            aliases[norm(alias)] = club_id
    manual_power = {norm(name): round(float(power)) for name, power in re.findall(r"C\('((?:\\.|[^'])*)','[^']*',(\d+(?:\.\d+)?)", html)}
    indexes = identity_index(db)
    mapped, legacy_mapped = collections.defaultdict(list), collections.defaultdict(list)
    seen = set()
    unmatched = 0
    for player in source_players:
        player_id = str(player["id"])
        if player_id in seen:
            continue
        seen.add(player_id)
        position = {"DM": "CDM", "AM": "CAM"}.get(player["pos"], player["pos"])
        if position not in POSITIONS:
            position = "CM"
        row = [player_id, str(player["name"]), position, max(1, min(99, round(float(player["ovr"])))), max(14, min(48, int(player.get("age") or 24)))]
        old_id = player.get("canonicalClubId") or player.get("clubId")
        if old_id not in source_clubs:
            old_id = aliases.get(norm(player.get("clubNative"))) or aliases.get(norm(player.get("club")))
        if old_id in source_clubs:
            legacy_mapped[old_id].append(row)
        club_id = resolve_club(player, source_clubs, indexes)
        if club_id:
            mapped[club_id].append(row)
        else:
            unmatched += 1

    # Player OVR is its own scale. Legacy competition strength (e.g. 91 for
    # LaLiga) must never be interpreted as a missing club's player ability.
    observed = collections.defaultdict(list)
    for cid, rows in mapped.items():
        if len(rows) >= 18 and any(p[2] == "GK" for p in rows):
            observed[source_clubs[cid]["leagueId"]].append(roster_power(select_real(rows)))
    baselines = {lid: statistics.median(values) for lid, values in observed.items() if len(values) >= 3}
    # No Japanese/Brazilian domestic squads exist in this source snapshot.
    # Explicit peer estimates, not claims about real current squad ratings.
    country_estimates = {"일본": baselines.get("KR1", 66) + 2, "브라질": baselines.get("PT1", 72) + 1}
    for league in db["leagues"]:
        lid = league["id"]
        if lid in baselines:
            continue
        peers = [other for other in db["leagues"] if other["country"] == league["country"] and other["id"] in observed and len(observed[other["id"]]) >= 3]
        if peers:
            nearest = min(peers, key=lambda other: abs(other["tier"] - league["tier"]))
            base = statistics.median(observed[nearest["id"]]) - (league["tier"] - nearest["tier"]) * 7
        else:
            base = country_estimates.get(league["country"], 66) - (league["tier"] - 1) * 7
        baselines[lid] = round(max(35, min(84, base)), 2)
    leagues = []
    group_ids = {}
    for league in db["leagues"]:
        groups = db.get("leagueGroups", {}).get(league["id"])
        if groups:
            for index, group in enumerate(groups):
                league_id = league["id"] + "__" + chr(65 + index)
                group_ids[(league["id"], group["id"])] = league_id
                leagues.append([league_id, league["name"] + " · " + group["id"], league["country"], int(league["tier"]), False])
        else:
            leagues.append([league["id"], league["name"], league["country"], int(league["tier"]), False])
    crests = json.loads((ROOT / "data/canonical-logos.json").read_text(encoding="utf-8"))
    clubs, rosters, legacy_power = [], {}, {}
    generated_count = real_count = 0
    needs_roster = []
    priorities = ["GK", "GK", "CB", "CB", "CB", "LB", "RB", "CDM", "CM", "CM", "CAM", "LW", "RW", "ST", "ST", "CM", "LW", "ST"]
    for club in db["clubs"]:
        league = original_leagues[club["leagueId"]]
        league_id = group_ids.get((club["leagueId"], club.get("groupId")), club["leagueId"])
        if league_id not in {row[0] for row in leagues}:
            raise SystemExit(f"Missing group for {club['id']}: {club.get('groupId')}")
        # Reproduce the old input once as a deterministic save-repair reference.
        old_power = manual_power.get(norm(club["display"]), manual_power.get(norm(club["native"])))
        if old_power is None:
            old_power = int(league["strength"]) + stable(club["id"], -4, 4)
        old_power = max(35, min(95, old_power))
        old_rows = select_real(legacy_mapped[club["id"]])
        for index in range(18 - len(old_rows)):
            pid = f"sim_{club['id']}_{index + 1:02d}"
            old_rows.append([pid, "", "CM", max(30, min(91, old_power - 3 + stable(pid, -7, 4))), 24])
        legacy_power[club["id"]] = roster_power(old_rows)

        rows = select_real(mapped[club["id"]])
        power = roster_power(rows) if len(rows) >= 11 else baselines[club["leagueId"]] + stable(club["id"] + "fallback", -20, 20) / 10
        color = PALETTE[stable(club["id"], 0, len(PALETTE) - 1)]
        crest = crests.get(club["id"])
        if crest and not (ROOT / crest).is_file():
            crest = None
        selected = rows[:]
        real_count += len(selected)
        if len(selected) < 18:
            needs_roster.append(club["id"])
        position_counts = collections.Counter(row[2] for row in selected)
        for index in range(18 - len(selected)):
            position = next((p for p in priorities if position_counts[p] < priorities.count(p)), priorities[index % len(priorities)])
            position_counts[position] += 1
            number = index + 1
            player_id = f"sim_{club['id']}_{number:02d}"
            # Fill depth below the observed first team; a missing roster gets
            # a modest spread around the empirically calibrated league scale.
            player_power = max(30, min(88, round(power - (5 if rows else 2) + stable(player_id, -5, 2))))
            selected.append([player_id, f"선수 {number:02d} (가상)", position, player_power, stable(player_id + "age", 18, 32)])
            generated_count += 1
        selected.sort(key=lambda p: (-p[3], p[0]))
        rosters[club["id"]] = selected
        clubs.append([club["id"], club["display"], club["native"], club["country"], league_id, max(35, min(95, round(roster_power(selected)))), color, crest])
    club_counts = collections.Counter(row[4] for row in clubs)
    if len(clubs) != len(source_clubs) or len({row[0] for row in clubs}) != len(clubs):
        raise SystemExit("Canonical club count / identity mismatch")
    if any(club_counts[league[0]] < 2 for league in leagues):
        raise SystemExit("Every playable league must contain at least two clubs")
    for club_id, players in rosters.items():
        if not 18 <= len(players) <= 25 or len({p[0] for p in players}) != len(players):
            raise SystemExit(f"Invalid roster for {club_id}")
    catalogue = {
        "metadata": {"sourceVersion": db["version"], "sourceSeason": "2024 / FC25", "originalLeagueCount": len(db["leagues"]), "playableLeagueCount": len(leagues), "clubCount": len(clubs), "countryCount": len(db["countries"]), "sourcePlayers": len(source_players), "mappedRealPlayers": sum(len(rows) for rows in mapped.values()), "retainedRealPlayers": real_count, "generatedPlayers": generated_count, "clubsWithGeneratedPlayers": len(needs_roster), "unmatchedSourcePlayers": unmatched, "verified2026": False},
        "calibration": {"version": 2, "legacyPower": legacy_power, "leagueBaselines": baselines},
        "leagues": leagues, "clubs": clubs, "rosters": rosters,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(catalogue, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps(catalogue["metadata"], ensure_ascii=False))
    print(f"Compact catalogue: {OUT.relative_to(ROOT)} ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
