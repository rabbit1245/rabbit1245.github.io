#!/usr/bin/env python3
"""Regenerate every retained FC25 nationality, including subsequently matched club records."""
import json
from collections import defaultdict
from pathlib import Path
root=Path(__file__).resolve().parents[1]
players=json.loads((root/'data/players.min.json').read_text())['players']
aliases=json.loads((root/'data/national-country-aliases.json').read_text())
groups=defaultdict(list)
for row in players:
    if row.get('nation') and row['id'].startswith('fc25_'):
        groups[aliases.get(row['nation'],row['nation'])].append(row['id'].removeprefix('fc25_'))
(root/'src/game/national-index.json').write_text(json.dumps({key:','.join(sorted(set(ids),key=int)) for key,ids in sorted(groups.items())},ensure_ascii=False,indent=2)+'\n')
print(f'Indexed {sum(len(set(ids)) for ids in groups.values())} players from {len(groups)} nationalities')
