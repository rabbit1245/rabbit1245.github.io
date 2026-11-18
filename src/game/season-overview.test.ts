import test from 'node:test';
import assert from 'node:assert/strict';
import { createCareer, emptyStats } from './engine';
import { PLAY_STYLES } from './attributes';
import type { MatchRecord } from './types';
import type { ClubTournament } from './revision-types';
import { ALL_STATS, sumStats } from './math';
import { nationalMatchLedger, newestMatchFirst, seasonClubId, seasonOverview } from './season-overview';

const match = (id: string, date?: string): MatchRecord => ({
  id, fixtureId:id, round:1, seasonYear:2026, homeId:'KR1_01', awayId:'KR1_02', homeGoals:1, awayGoals:0,
  events:[], playerClubId:'KR1_01', playerPlayed:true, playerStarted:true, playerMinutes:90, playerRating:7,
  playerStats:{...emptyStats(),apps:1,starts:1,minutes:90,goals:1,ratingCount:1,ratingSum:7}, seed:id, date,
});

test('home projections preserve legacy totals, exclude other seasons and share the deduplicated national ledger', () => {
  const c = createCareer({name:'통합 화면',nationality:'대한민국',age:24,height:180,weight:75,foot:'right',position:'CAM',talent:'S',style:PLAY_STYLES.CAM[0],clubId:'KR1_01',squad:'senior',difficulty:'realistic',seed:'overview-v25'});
  const old = match('old'), club = {...match('club','2026-05-01'),metricsVersion:2 as const};
  c.season.matches=[old,club]; c.season.playerStats=sumStats([old.playerStats,club.playerStats]);
  const national = {...match('nat','2026-06-01'),scope:'national' as const,metricsVersion:2 as const,playerClubId:'NAT:대한민국:senior'};
  const prior = {...match('prior'),seasonYear:2025};
  c.systems!.national.history=[{year:2026,squad:'senior',competitionId:'WC:2026',competitionName:'월드컵',stats:national.playerStats,matches:[national],result:'조별리그',qualified:false}];
  c.systems!.national.matches=[{...national,id:'same-fixture-in-current-window'},prior];
  const before=JSON.stringify(c),view=seasonOverview(c);
  assert.equal(view.combined.apps,3); assert.equal(view.national.apps,1); assert.equal(view.detailed.apps,2);
  assert.deepEqual(view.matches.map(m=>m.id),['nat','club','old']);
  for(const key of ALL_STATS)assert.equal(view.combined[key],sumStats([c.season.playerStats,national.playerStats])[key],key);
  assert.equal(nationalMatchLedger(c).length,2,'one fixture is counted once even with two stored IDs');
  c.player.clubId='EN1_01';assert.equal(seasonClubId(c),'KR1_01','an offseason contract cannot relabel completed league records');
  c.player.clubId='KR1_01';assert.equal(JSON.stringify(c),before,'viewing and expanding must not edit a save');
});

test('combined club and national match lists follow actual dates instead of incomparable round numbers', () => {
  const early={...match('club','2026-03-01'),round:15},later={...match('national','2026-06-01'),round:1};
  const archived={...match('older','2025-12-01'),seasonYear:2025};
  const undated={...match('legacy'),round:30};
  assert.deepEqual([early,archived,undated,later].sort(newestMatchFirst).map(m=>m.id),['national','club','legacy','older']);
  assert.deepEqual([{...undated,round:1},undated].sort(newestMatchFirst).map(m=>m.round),[30,1]);
});

test('competition rows reconcile this season across league changes, cups and national stages', () => {
  const c = createCareer({name:'대회별 검수',nationality:'대한민국',age:24,height:180,weight:75,foot:'right',
    position:'CAM',talent:'S',style:PLAY_STYLES.CAM[0],clubId:'KR1_01',squad:'senior',difficulty:'realistic',seed:'competition-breakdown'});
  const league = match('legacy-league');
  const otherLeague = {...match('other-league'), competitionId:'KR2', playerClubId:'KR2_01'};
  c.season.matches = [league, otherLeague];
  c.season.playerStats = sumStats(c.season.matches.map(row => row.playerStats));

  const cup = (id: string, name: string, year: number, matches: MatchRecord[]): ClubTournament => ({
    id, name, year, matches, kind:'cup', entrants:[], basis:'', rules:'', phase:'knockout', step:1,
    leagueRounds:0, stage:'첫 라운드', active:[], byes:[], fixtures:[], table:[], startedAtRound:0,
  });
  const cupMatch = {...match('domestic'), competitionId:'CUP:KOR:2026'};
  const internationalClubMatch = {...match('continental'), competitionId:'AFC_ELITE:2026'};
  c.systems!.clubCompetitions = {version:1, year:2026,
    current:[
      cup('CUP:KOR:2026','코리아컵',2026,[cupMatch]),
      cup('AFC_ELITE:2026','AFC 챔피언스리그 엘리트',2026,[internationalClubMatch]),
      cup('UCL:2026','예정된 대회',2026,[]),
    ],
    history:[cup('CUP:KOR:2025','지난 시즌 컵',2025,[{...cupMatch, seasonYear:2025}])],
  };

  const international = (id: string, stage: string, squad = 'senior') => ({
    ...match(id), fixtureId:`NAT|${squad}|${id}|${stage}|match`, competitionId:id, scope:'national' as const,
    playerClubId:`NAT:대한민국:${squad}`,
  });
  const qualifying = international('WC:2026','qualifying');
  const final = international('WC:2026','final');
  const friendly = international('FRIENDLIES:2027','friendly');
  const youth = international('FRIENDLIES:2027','friendly','U20');
  const bench = {...international('AFC:2027','qualifying'), playerPlayed:false, playerStats:emptyStats()};
  const n = c.systems!.national;
  n.matches = [{...qualifying,id:'duplicate'},final,friendly,youth,bench,{...international('WC:2022','final'),seasonYear:2025}];
  n.history = [{year:2026,squad:'senior',competitionId:'WC:2026',competitionName:'2026 FIFA 월드컵',
    stats:qualifying.playerStats,matches:[qualifying],result:'예선 통과',qualified:true}];
  n.teamResults = [international('AFC:2027','final')];

  const view = seasonOverview(c);
  assert.deepEqual(view.nationalCompetitions.map(row => row.name), [
    '2026 FIFA 월드컵 · 예선','2026 FIFA 월드컵 · 본선','2027 국제친선','2027 국제친선 · U20',
  ]);
  assert.deepEqual(view.clubCompetitions.map(row => row.name), [
    'K리그1','K리그2','코리아컵','AFC 챔피언스리그 엘리트',
  ]);
  assert.deepEqual(sumStats(view.nationalCompetitions.map(row => row.stats)),view.national);
  assert.deepEqual(sumStats(view.clubCompetitions.map(row => row.stats)),view.club);
  assert.equal(view.combined.apps,8);
});
