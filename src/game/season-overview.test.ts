import test from 'node:test';
import assert from 'node:assert/strict';
import { createCareer, emptyStats } from './engine';
import { PLAY_STYLES } from './attributes';
import type { MatchRecord } from './types';
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
