import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG_INFO, CLUBS, COUNTRY_FLAGS, DATA_PROVENANCE, LEAGUES, ROSTERS, getClub, getLeague,
} from './data';
import {
  ATTRIBUTE_LABELS, FIELD_ATTRIBUTES, GK_ATTRIBUTES, PLAY_STYLES, POSITION_ATTRIBUTES,
  POSITION_LABELS, TALENT_LABELS, attributeWeights, overall,
} from './attributes';
import type { AttributeKey, Attributes, Position, Talent } from './types';

const positions = Object.keys(POSITION_LABELS) as Position[];
const talents = Object.keys(TALENT_LABELS) as Talent[];
const unique = <T,>(items: T[]) => new Set(items).size === items.length;

test('catalogue preserves unique club identities and valid competition references', () => {
  assert.equal(CLUBS.length, CATALOG_INFO.clubCount);
  assert.equal(LEAGUES.length, CATALOG_INFO.playableLeagueCount);
  assert.equal(new Set(CLUBS.map(club => club.country)).size, CATALOG_INFO.countryCount);
  assert.ok(unique(CLUBS.map(club => club.id)));
  assert.ok(unique(LEAGUES.map(league => league.id)));
  const competitionCounts = new Map<string, number>();
  for (const club of CLUBS) {
    assert.equal(getClub(club.id), club);
    const league = getLeague(club.leagueId);
    assert.equal(club.country, league.country, `${club.id}: cross-country competition reference`);
    assert.ok(Number.isInteger(club.power) && club.power >= 35 && club.power <= 95, club.id);
    assert.ok(club.name.trim().length && club.nativeName.trim().length, club.id);
    assert.ok(COUNTRY_FLAGS[club.country], `${club.country}: missing country flag`);
    competitionCounts.set(league.id, (competitionCounts.get(league.id) ?? 0) + 1);
  }
  for (const league of LEAGUES) {
    assert.ok((competitionCounts.get(league.id) ?? 0) >= 2, `${league.id}: cannot schedule a competition`);
    assert.ok(Number.isInteger(league.tier) && league.tier >= 1 && league.tier <= 3);
    assert.equal(league.verified, false, 'Retained FC25 data must not claim verified 2026 regulations');
  }
  assert.throws(() => getClub('not-a-canonical-club'), /알 수 없는 구단/);
  assert.throws(() => getLeague('not-a-canonical-league'), /알 수 없는 리그/);
});

test('every roster is playable, indexed by its own club, with globally unique player IDs', () => {
  assert.deepEqual(Object.keys(ROSTERS).sort(), CLUBS.map(club => club.id).sort());
  const seen = new Set<string>();
  let realPlayers = 0;
  let generatedPlayers = 0;
  let clubsWithGeneratedPlayers = 0;
  for (const club of CLUBS) {
    const roster = ROSTERS[club.id];
    assert.ok(roster.length >= 18 && roster.length <= 25, club.id);
    assert.ok(roster.some(player => player.position === 'GK'), `${club.id}: missing goalkeeper`);
    let containsGenerated = false;
    for (const player of roster) {
      assert.equal(player.clubId, club.id);
      assert.ok(!seen.has(player.id), `Duplicate player ${player.id}`);
      seen.add(player.id);
      assert.ok(positions.includes(player.position), `${player.id}: unsupported position`);
      assert.ok(Number.isInteger(player.ovr) && player.ovr >= 1 && player.ovr <= 99);
      assert.ok(Number.isInteger(player.age) && player.age >= 14 && player.age <= 48);
      if (player.id.startsWith('sim_')) {
        generatedPlayers++;
        containsGenerated = true;
        assert.match(player.name, /\(가상\)/, 'Generated players must be identified to the player');
      } else {
        realPlayers++;
      }
    }
    if (containsGenerated) clubsWithGeneratedPlayers++;
  }
  assert.equal(realPlayers, CATALOG_INFO.retainedRealPlayers);
  assert.equal(generatedPlayers, CATALOG_INFO.generatedPlayers);
  assert.equal(clubsWithGeneratedPlayers, CATALOG_INFO.clubsWithGeneratedPlayers);
  assert.equal(CATALOG_INFO.verified2026, false);
  assert.match(DATA_PROVENANCE, /2024/);
  assert.match(DATA_PROVENANCE, /가상/);
});

test('all sixteen positions have ten distinct playable styles and valid ability profiles', () => {
  assert.equal(positions.length, 16);
  assert.equal(talents.length, 7);
  assert.equal(FIELD_ATTRIBUTES.length, 20);
  assert.equal(GK_ATTRIBUTES.length, 10);
  assert.ok(unique(FIELD_ATTRIBUTES));
  assert.ok(unique(GK_ATTRIBUTES));
  for (const position of positions) {
    const validAttributes = position === 'GK' ? GK_ATTRIBUTES : FIELD_ATTRIBUTES;
    assert.equal(PLAY_STYLES[position].length, 10, position);
    assert.ok(unique(PLAY_STYLES[position]), `${position}: duplicate style labels`);
    assert.ok(unique(POSITION_ATTRIBUTES[position]), `${position}: duplicate core attributes`);
    assert.ok(POSITION_ATTRIBUTES[position].length >= 8);
    for (const attribute of POSITION_ATTRIBUTES[position]) assert.ok(validAttributes.includes(attribute));
    for (const style of PLAY_STYLES[position]) {
      const weights = attributeWeights(position, style);
      const keys = Object.keys(weights) as AttributeKey[];
      assert.deepEqual([...keys].sort(), [...validAttributes].sort());
      assert.ok(keys.every(key => (weights[key] ?? 0) > 0 && Boolean(ATTRIBUTE_LABELS[key])));
      const total = Object.values(weights).reduce((sum, value) => sum + (value ?? 0), 0);
      assert.ok(Math.abs(total - 1) < 1e-12, `${position}/${style}: absolute OVR weights must sum to one`);
    }
  }
});

test('OVR stays on one global scale across leagues and talent, with bounded missing/invalid inputs', () => {
  const lowPowerClub = CLUBS.reduce((a, b) => a.power < b.power ? a : b);
  const eliteClub = CLUBS.reduce((a, b) => a.power > b.power ? a : b);
  assert.notEqual(lowPowerClub.id, eliteClub.id);
  for (const position of positions) {
    const keys = position === 'GK' ? GK_ATTRIBUTES : FIELD_ATTRIBUTES;
    const uniform = Object.fromEntries(keys.map(key => [key, 73])) as Attributes;
    for (const style of PLAY_STYLES[position]) {
      const subject = {position, style, attributes: uniform, clubId: lowPowerClub.id, talent: 'D' as Talent};
      assert.equal(overall(subject), 73);
      for (const talent of talents) {
        const inEliteClub = {...subject, clubId: eliteClub.id, talent};
        assert.equal(overall(inEliteClub), 73, `${position}/${style}: context changed intrinsic ability`);
      }
      const extremes = (value: number) => Object.fromEntries(keys.map(key => [key, value])) as Attributes;
      assert.equal(overall({...subject, attributes: extremes(-300)}), 1);
      assert.equal(overall({...subject, attributes: extremes(500)}), 100);
      assert.equal(overall({...subject, attributes: extremes(Number.NaN)}), 1);
      assert.equal(overall({...subject, attributes: {}}), 1);
    }
  }
});

test('specialist styles reward their relevant abilities rather than a fixed title bonus', () => {
  const attributes = Object.fromEntries(FIELD_ATTRIBUTES.map(key => [key, 55])) as Attributes;
  attributes.shooting = 95;
  attributes.positioning = 95;
  attributes.composure = 95;
  const poacher = overall({position: 'ST', style: '포처', attributes});
  const target = overall({position: 'ST', style: '타깃맨', attributes});
  assert.ok(poacher > target, 'A finishing specialist should suit the poacher profile');
  const uniform = Object.fromEntries(FIELD_ATTRIBUTES.map(key => [key, 55])) as Attributes;
  assert.equal(overall({position: 'ST', style: '포처', attributes: uniform}), overall({position: 'ST', style: '타깃맨', attributes: uniform}));
});
