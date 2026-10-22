"""Identity and missing-data safeguards, using the retained source, not invented rankings."""
import json
import runpy
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
e = runpy.run_path(str(ROOT / 'scripts/extract_kball_data.py'))
db, _ = e['source_snapshot']()
clubs = {c['id']: c for c in db['clubs']}
indexes = e['identity_index'](db)
players = json.loads((ROOT / 'data/players.min.json').read_text())['players']


class ClubIdentity(unittest.TestCase):
    def test_observed_aliases_resolve_in_the_correct_country(self):
        expected = {'SV Werder Bremen': 'DE1_09', 'VfL Bochum 1848': 'DE1_16', 'FC St. Pauli': 'DE1_17',
                    'Athletic Club': 'ES1_04', 'Atlético de Madrid': 'ES1_03', 'CD Leganés': 'ES1_18',
                    'RCD Mallorca': 'ES1_15', 'FC Barcelona': 'ES1_02', 'Milano FC': 'IT1_02'}
        for name, cid in expected.items():
            found = [p for p in players if p['clubNative'] == name]
            self.assertTrue(found, name)
            for p in found:
                self.assertEqual(e['resolve_club'](p, clubs, indexes), cid, p['id'])

    def test_continental_name_collisions_do_not_cross_countries(self):
        for name in ['Barcelona SC', 'Liverpool', 'Everton', 'Nacional']:
            found = [p for p in players if p['clubNative'] == name and p['league'] in ('Libertadores', 'Sudamericana')]
            self.assertTrue(found, name)
            for p in found:
                self.assertIsNone(e['resolve_club'](p, clubs, indexes), p['id'])

    def test_an_ambiguous_alias_is_left_unmatched(self):
        index = ({'collision': {'DE1_09', 'DE1_16'}}, {})
        self.assertIsNone(e['resolve_club']({'league': 'Bundesliga', 'clubNative': 'collision'}, clubs, index))


if __name__ == '__main__':
    unittest.main()
