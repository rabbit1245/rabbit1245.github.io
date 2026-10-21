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
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src/game/catalog.json"
POSITIONS = {"GK", "CB", "LB", "RB", "LWB", "RWB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "CF", "SS", "ST"}
PALETTE = ["#E83E45", "#4389ED", "#1FA87A", "#F3B93D", "#9D71E8", "#EF7E3C", "#2DAAB3", "#D9507A", "#566CD6", "#A57A48"]


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
    mapped = collections.defaultdict(list)
    seen = set()
    unmatched = 0
    for player in source_players:
        player_id = str(player["id"])
        if player_id in seen:
            continue
        seen.add(player_id)
        club_id = player.get("canonicalClubId") or player.get("clubId")
        if club_id not in source_clubs:
            club_id = aliases.get(norm(player.get("clubNative"))) or aliases.get(norm(player.get("club")))
        if club_id not in source_clubs:
            unmatched += 1
            continue
        position = {"DM": "CDM", "AM": "CAM"}.get(player["pos"], player["pos"])
        if position not in POSITIONS:
            position = "CM"
        mapped[club_id].append([player_id, str(player["name"]), position, max(1, min(99, round(float(player["ovr"])))), max(14, min(48, int(player.get("age") or 24)))])
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
    clubs, rosters = [], {}
    generated_count = real_count = 0
    needs_roster = []
    priorities = ["GK", "GK", "CB", "CB", "CB", "LB", "RB", "CDM", "CM", "CM", "CAM", "LW", "RW", "ST", "ST", "CM", "LW", "ST"]
    for club in db["clubs"]:
        league = original_leagues[club["leagueId"]]
        league_id = group_ids.get((club["leagueId"], club.get("groupId")), club["leagueId"])
        if league_id not in {row[0] for row in leagues}:
            raise SystemExit(f"Missing group for {club['id']}: {club.get('groupId')}")
        power = manual_power.get(norm(club["display"]), manual_power.get(norm(club["native"])))
        if power is None:
            power = int(league["strength"]) + stable(club["id"], -4, 4)
        power = max(35, min(95, power))
        color = PALETTE[stable(club["id"], 0, len(PALETTE) - 1)]
        crest = crests.get(club["id"])
        if crest and not (ROOT / crest).is_file():
            crest = None
        clubs.append([club["id"], club["display"], club["native"], club["country"], league_id, power, color, crest])
        rows = sorted(mapped[club["id"]], key=lambda p: (-p[3], p[0]))
        keepers = [row for row in rows if row[2] == "GK"][:2]
        selected = keepers + [row for row in rows if row not in keepers][:25 - len(keepers)]
        real_count += len(selected)
        if len(selected) < 18:
            needs_roster.append(club["id"])
        position_counts = collections.Counter(row[2] for row in selected)
        for index in range(18 - len(selected)):
            position = next((p for p in priorities if position_counts[p] < priorities.count(p)), priorities[index % len(priorities)])
            position_counts[position] += 1
            number = index + 1
            player_id = f"sim_{club['id']}_{number:02d}"
            player_power = max(30, min(91, power - 3 + stable(player_id, -7, 4)))
            selected.append([player_id, f"선수 {number:02d} (가상)", position, player_power, stable(player_id + "age", 18, 32)])
            generated_count += 1
        selected.sort(key=lambda p: (-p[3], p[0]))
        rosters[club["id"]] = selected
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
        "leagues": leagues, "clubs": clubs, "rosters": rosters,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(catalogue, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps(catalogue["metadata"], ensure_ascii=False))
    print(f"Compact catalogue: {OUT.relative_to(ROOT)} ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
