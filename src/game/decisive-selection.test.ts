import assert from 'node:assert/strict';
import test from 'node:test';
import {FIELD_ATTRIBUTES} from './attributes';
import {processClubCompetitions} from './club-competitions';
import {getClub} from './data';
import {createCareer,overall} from './engine';
import {simulateMatch} from './match-engine';
import {processDueNationalWindows} from './national';
import type {MatchParticipant} from './revision-types';
import type {Career,Fixture,Position} from './types';

function career(seed='decisive-match-audit',clubId='ES1_02'){
 const c=createCareer({name:'결승 선발 검수',nationality:'프랑스',age:27,height:183,weight:78,foot:'right',position:'ST',talent:'SSS',style:'완성형 스트라이커',clubId,squad:'senior',difficulty:'realistic',seed,training:[]});
 c.player.attributes=Object.fromEntries(FIELD_ATTRIBUTES.map(key=>[key,95]));
 c.player.ovr=overall(c.player);c.player.form=76;c.managerTrust=74;
 c.awards.push({id:'previous-ballon',year:2025,clubId,name:'발롱도르',description:'이전 시즌 수상',category:'world',rank:1});
 return c;
}
const positions:Position[]=['GK','CB','CB','LB','RB','CDM','CM','CAM','LW','RW','ST','GK','CM','LW'];
function roster(clubId:string,striker=90):MatchParticipant[]{
 return positions.map((position,i)=>({id:`${clubId}-${i}`,name:`검수 선수 ${i}`,clubId,position,ovr:position==='ST'?striker:81}));
}
const clubFixture=(homeId:string,awayId:string,id='paired-fixture'):Fixture=>({id,homeId,awayId,round:1,played:false});

test('a fit 95 OVR first-team player gets priority in club and international finals',()=>{
 const c=career(),home=getClub(c.player.clubId),away=getClub('ES1_01'),fixture=clubFixture(home.id,away.id);
 const opts={home,away,homePlayers:roster(home.id,95),awayPlayers:roster(away.id),detailed:false};
 const final={...fixture,stage:'결승'},leagueCounts={starts:0,absent:0,full:0},finalCounts={...leagueCounts};
 for(let run=0;run<240;run++){
  c.seed=`selection-seed-${run}`;
  for(const [match,counts] of [[fixture,leagueCounts],[final,finalCounts]] as const){
   const played=simulateMatch(c,match,opts);
   counts.starts+=Number(played.playerStarted);counts.absent+=Number(!played.playerPlayed);counts.full+=Number(played.playerMinutes===90);
  }
 }
 assert.ok(finalCounts.starts>leagueCounts.starts+25);
 assert.ok(finalCounts.absent<=2&&finalCounts.full>leagueCounts.full+25);
 const france={...home,id:'NAT:프랑스:senior'},spain={...away,id:'NAT:스페인:senior'};
 const international=clubFixture(france.id,spain.id,'NAT|senior|WC:2026|final|ko:2:0');
 assert.equal(simulateMatch(c,international,{home:france,away:spain,homePlayers:[...roster(france.id,90),c.player],awayPlayers:roster(spain.id),scope:'national'}).playerStarted,true);
 assert.equal(simulateMatch({...c,player:{...c.player,fitness:24}},final,opts).playerPlayed,false);
 assert.equal(simulateMatch({...c,player:{...c.player,injuryWeeks:1}},final,opts).playerPlayed,false);
});

function recordOneWeekInjury(c:Career,date:string,opponentId:string){
 const home=getClub(c.player.clubId),away=getClub(opponentId);
 const player={...c.player,injuryWeeks:0,fitness:100,form:76};
 const match=simulateMatch({...c,player,seed:'injury-seed-52'},clubFixture(home.id,away.id,'natural-injury-match'),{home,away,homePlayers:roster(home.id,86),awayPlayers:roster(away.id),date,detailed:false});
 assert.equal(match.effects?.injuryWeeksAfter,1);
 assert.ok(match.events.some(e=>e.type==='injury'&&e.playerId===c.player.id));
 c.season.matches.push(match);
 c.player.injuryWeeks=1;c.player.fitness=match.effects!.fitnessAfter;
 return match;
}

test('the club cup scheduler checks actual recovery at kickoff before applying final lineup priority',()=>{
 const date='2026-08-20T00:00:00.000Z';
 for(const [injuryDate,appears] of [['2026-08-10',true],['2026-08-16',false]] as const){
  const c=career(),home=c.player.clubId,away='ES1_01';
  const previous=recordOneWeekInjury(c,injuryDate,away),original=structuredClone(previous);
  const competitions=c.systems!.clubCompetitions!,cup=competitions.current.find(t=>t.country==='스페인'&&t.kind==='cup')!;
  const fixture={...clubFixture(home,away,'audit-final-cup'),tieId:'audit-final',step:1,stage:'결승',leg:1,date};
  competitions.current=[{...cup,fixtures:[fixture],calendar:[date],maxSteps:1,entrants:[home,away],active:[home,away],byes:[],stage:'결승',step:0,matches:[],playerStats:{}}];
  const [played]=processClubCompetitions(c,undefined,undefined,date);
  assert.equal(played.playerPlayed,appears);
  assert.equal(played.playerStarted,appears);
  assert.deepEqual(previous,original);
 }
});

test('a dated injury expires in the actual World Cup calendar without a league round',()=>{
 const c=career('natural-final-audit-0','KR1_01');
 processDueNationalWindows(c,'2026-03-28');
 recordOneWeekInjury(c,'2026-05-29','KR1_02');
 processDueNationalWindows(c,'2026-07-19');
 const national=c.systems!.national.matches;
 const early=national.find(match=>match.date==='2026-06-02')!;
 assert.equal(early.playerPlayed,false);
 assert.match(early.nationalSelection!.reason,/회복/);
 assert.ok(national.find(match=>match.fixtureId.includes('|group|'))?.playerPlayed);
 const final=national.find(match=>match.fixtureId.includes('|final|'))!;
 assert.equal(final.playerStarted,true);
 assert.equal(final.nationalSelection?.role,'starter');
 assert.equal(c.season.week,0,'no league recovery tick was required');
});
