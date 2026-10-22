import test from 'node:test';
import assert from 'node:assert/strict';
import { createCareer,emptyStats } from './engine';
import { PLAY_STYLES } from './attributes';
import { leagueLeaders,ownLeagueRanks } from './league-leaders';
import type { CompetitorSeason } from './revision-types';

test('league rankings use actual league ledgers and the same K1 sporting tie-break as awards',()=>{
  const c=createCareer({name:'득점 검증',nationality:'대한민국',age:24,height:180,weight:75,foot:'right',position:'ST',talent:'S',style:PLAY_STYLES.ST[0],clubId:'KR1_01',squad:'senior',difficulty:'realistic',seed:'league-leaders'});
  c.season.playerStats={...emptyStats(),apps:20,minutes:1500,goals:10,assists:4};
  const row=(id:string,leagueId:string,apps:number,goals:number):CompetitorSeason=>({playerId:id,name:id,clubId:'KR1_02',leagueId,position:'ST',nationality:'대한민국',ovr:65,stats:{...emptyStats(),apps,minutes:apps*80,goals},nationalStats:{...emptyStats(),apps:8,goals:99}});
  c.systems!.world.playerStats={best:row('best','KR1',15,10),same:row('same','KR1',20,10),foreign:row('foreign','EN1',20,100),unused:row('unused','KR1',0,90)};
  const ranked=leagueLeaders(c);assert.deepEqual(ranked.map(r=>r.playerId),['best',c.player.id,'same']);assert.deepEqual(ranked.map(r=>r.rank),[1,2,3]);assert.equal(ownLeagueRanks(c).goals,2);
  assert.ok(ranked.every(r=>r.stats.goals===10),'national goals never enter league totals');
  c.season.leagueId='EN1';c.systems!.world.playerStats.best.leagueId='EN1';c.systems!.world.playerStats.same.leagueId='EN1';delete c.systems!.world.playerStats.foreign;
  assert.deepEqual(leagueLeaders(c).map(r=>r.rank),[1,1,1],'leagues with shared scoring honors display shared ranks');
  c.season.playerStats.goals=0;assert.equal(ownLeagueRanks(c).goals,null,'zero goals are not advertised as a scoring lead');
  c.player.squad='youth';assert.deepEqual(leagueLeaders(c),[],'missing full youth individual ledgers are never fabricated');
});
