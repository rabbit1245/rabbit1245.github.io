import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createCareer,overall,setAllAttributeLocks,manuallyInjure,startNextSeason,stayAtClub,calculateTable} from './engine';
import {FIELD_ATTRIBUTES,PLAY_STYLES} from './attributes';
import {getClub} from './data';
import {getClubWorldPower,getWorldClubPlayers,transitionWorldSeason} from './world';
import {simulateMatch} from './match-engine';
import {assessClubSeason} from './club-development';
import {activatePendingInjury,recordManualAbsences} from './manual-injury';
import {beginGrowthSeason} from './growth';
import {emptyStats} from './math';
import {exportCareer,importCareer,validateCareer} from './storage';
import {validateCareerExtensions} from './extension-validation';
import type {Career,Standing,MatchRecord} from './types';
if(!globalThis.crypto?.subtle)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
const base=createCareer({name:'윙백 팀 기여',nationality:'대한민국',age:27,height:182,weight:76,foot:'left',position:'LWB',talent:'SSS',style:PLAY_STYLES.LWB[0],clubId:'EN1_06',squad:'senior',difficulty:'realistic',seed:'pending-role-impact',training:[]});
for(const key of FIELD_ATTRIBUTES)base.player.attributes[key]=94;base.player.ovr=overall(base.player);base.systems!.leadership.trait=90;
base.season.attributeStart={...base.player.attributes};base.season.ovrStart=base.player.ovr;beginGrowthSeason(base);
base.systems!.firstHalfSnapshot={attributes:{...base.player.attributes},stats:emptyStats(),ovr:base.player.ovr,value:base.systems!.economics.marketValue,round:0};
const fixture=base.season.fixtures.find(f=>f.homeId===base.player.clubId)!;
function options(c:Career,participates=true){return {home:{...getClub(fixture.homeId),power:getClubWorldPower(c,fixture.homeId)},away:{...getClub(fixture.awayId),power:getClubWorldPower(c,fixture.awayId)},homePlayers:getWorldClubPlayers(c,fixture.homeId),awayPlayers:getWorldClubPlayers(c,fixture.awayId),userParticipates:participates,detailed:false,forceSelection:{from:0,to:90,started:true}};}
const shots=(m:ReturnType<typeof simulateMatch>,team:string)=>m.performers!.filter(p=>(p.teamId??p.clubId)===team).reduce((sum,p)=>sum+p.stats.shots,0);

test('injury absences count only the player’s actual club/national fixtures, including a transfer',()=>{
 const c=structuredClone(base);c.systems!.manualInjuries=[{id:'fixture-filter',year:2026,clubId:c.player.clubId,duration:'half',start:'2026-07-01T00:00:00.000Z',end:'2026-12-30T00:00:00.000Z',missed:[]}];
 const make=(id:string,home:string,away:string,club:string,scope:'club'|'national'='club')=>({id,fixtureId:id,homeId:home,awayId:away,playerClubId:club,scope,seasonYear:2026,date:'2026-09-01T00:00:00.000Z',playerPlayed:false}) as MatchRecord;
 c.season.matches=[make('own','EN1_06','EN1_01','EN1_06'),make('after-transfer','FR1_01','FR1_02','FR1_01'),make('unrelated-cup','EN1_01','EN1_13','EN1_06'),make('national','NAT:대한민국:senior','NAT:일본:senior','NAT:대한민국:senior','national')];
 c.systems!.clubCompetitions!.current=[];c.systems!.national.matches=[];c.systems!.national.history=[];
 recordManualAbsences(c);assert.deepEqual(c.systems!.manualInjuries[0].missed.map(m=>m.fixtureId),['own','after-transfer','national']);recordManualAbsences(c);assert.equal(c.systems!.manualInjuries[0].missed.length,3);
});

test('wingback crossing creates real additional teammate shots while preserving two centre backs',()=>{
 let lower=0,higher=0,lowGoals=0,highGoals=0;
 for(let i=0;i<240;i++){
  const run=(crossing:number)=>{const c={...base,seed:`cross-team-${i}`,player:{...base.player,attributes:{...base.player.attributes,crossing}}};return simulateMatch(c,fixture,options(c));};
  const a=run(20),b=run(99);lower+=shots(a,base.player.clubId);higher+=shots(b,base.player.clubId);lowGoals+=a.homeGoals;highGoals+=b.homeGoals;
  const own=b.performers!.filter(p=>p.teamId===base.player.clubId&&p.started);assert.equal(own.filter(p=>p.position==='CB').length,2);assert.equal(own.filter(p=>p.position==='LWB').length,1);
 }
 assert.ok(higher>lower*1.03,`${lower} → ${higher} shots`);assert.ok(highGoals>lowGoals,`${lowGoals} → ${highGoals} goals`);
});

test('appointed captain and deputy provide small action-level organization gains only while playing',()=>{
 const totals={none:{own:0,against:0},vice:{own:0,against:0},captain:{own:0,against:0}};
 for(let i=0;i<240;i++)for(const role of ['none','vice','captain'] as const){
  const c={...base,seed:`leadership-effect-${i}`,systems:{...base.systems!,leadership:{...base.systems!.leadership,clubRole:role}}};
  const m=simulateMatch(c,fixture,options(c));totals[role].own+=shots(m,fixture.homeId);totals[role].against+=shots(m,fixture.awayId);
  if(i<10){const absent=simulateMatch(c,fixture,options(c,false)),plain=simulateMatch({...c,systems:{...c.systems,leadership:{...c.systems.leadership,clubRole:'none'}}},fixture,options(c,false));assert.deepEqual(absent,plain);}
 }
 for(const role of ['vice','captain'] as const){assert.ok(totals[role].own>totals.none.own);assert.ok(totals[role].against<totals.none.against);assert.ok(totals[role].own<totals.none.own*1.06,'leadership is capped, not a guaranteed win');}
});

function middleTable(c:Career):Standing[]{return c.season.table.map((r,i)=>({...r,played:c.season.totalWeeks,won:12,drawn:9,lost:c.season.totalWeeks-21,points:45,goalsFor:50,goalsAgainst:50})).sort((a,b)=>a.clubId===c.player.clubId?1:b.clubId===c.player.clubId?-1:0).map((r,i,rows)=>i===13?rows.at(-1)!:i===rows.length-1?rows[13]:r);}
test('actual season-long elite performances unlock mid-table reinvestment; an OVR label without appearances does not',()=>{
 const c=structuredClone(base),club=c.systems!.world.clubs[c.player.clubId],table=middleTable(c);
 const noGames=assessClubSeason(c,club,table,true);assert.equal(noGames.rank,14);assert.equal(noGames.bonus,0);assert.equal(noGames.star,undefined);
 c.season.playerStats={...emptyStats(),apps:38,starts:38,minutes:3420,ratingCount:38,ratingSum:296.4,goals:5,assists:15};
 const earned=assessClubSeason(c,club,table,true);assert.ok(earned.star?.retained);assert.ok(earned.star!.influence>0);assert.ok(earned.bonus>0);
 c.season.playerStats.minutes=100;assert.equal(assessClubSeason(c,club,table,true).star,undefined);
 assert.equal(assessClubSeason(base,base.systems!.world.clubs[base.player.clubId],table,false).star,undefined);
});

test('funded core-player investment raises the club scale gradually while the locked player stays unchanged',()=>{
 const c=structuredClone(base),w=c.systems!.world,comp=w.competitions[c.season.leagueId],club=w.clubs[c.player.clubId];
 for(const f of comp.fixtures){f.played=true;f.homeGoals=1;f.awayGoals=1;}comp.table=calculateTable(comp.fixtures,comp.table.map(r=>r.clubId));comp.round=comp.totalRounds;
 c.season.playerStats={...emptyStats(),apps:38,starts:38,minutes:3420,ratingCount:38,ratingSum:296.4,goals:5,assists:15};
 const before={...c.player.attributes},power=club.power,budget=club.budget;transitionWorldSeason(c);
 const report=club.development!.history.at(-1)!;assert.ok(report.star?.retained);assert.ok(report.reinvestment>0);assert.ok(report.starBudget!>0);assert.ok(report.recruits+report.improvedPlayers>0);assert.ok(club.development!.investmentPower!>0);assert.ok(Math.abs(club.power-power)<3);assert.ok(club.budget>=0&&club.budget<budget+club.revenue);assert.deepEqual(c.player.attributes,before);
 validateCareerExtensions(c);
 const corrupted=structuredClone(c),bad=corrupted.systems!.world.clubs[c.player.clubId].development!.history.at(-1)!;
 bad.reinvestment=bad.bonus+bad.starBudget!+1;assert.throws(()=>validateCareerExtensions(corrupted),/재투자 한도/);
 bad.reinvestment=report.reinvestment;bad.starBudget=bad.revenueBasis!;assert.throws(()=>validateCareerExtensions(corrupted),/핵심 선수 예산 한도/);
});

test('all-attribute locks allow real manual injury progress and retain exact abilities and lock state',async()=>{
 const c=setAllAttributeLocks(structuredClone(base),true),before={...c.player.attributes};
 const injured=manuallyInjure(c,'half');assert.ok(injured.season.week>0);assert.equal(injured.season.playerStats.apps,0);assert.deepEqual(injured.player.attributes,before);assert.deepEqual(injured.systems!.attributeLocks,c.systems!.attributeLocks);assert.ok(injured.systems!.manualInjuries![0].missed.length>0);validateCareer(injured);
 const loaded=await importCareer(await exportCareer(injured));assert.deepEqual(loaded.systems!.attributeLocks,c.systems!.attributeLocks);
});

test('locked offseason injury queues without advancing records and activates on the destination season calendar',async()=>{
 const previous=JSON.parse(gunzipSync(readFileSync(new URL('../../tests/fixtures/v272-offseason.json.gz',import.meta.url))).toString()).career as Career;
 let c=setAllAttributeLocks(validateCareer(previous),true);
 const stats=structuredClone(c.season.playerStats),history=structuredClone(c.history.map(h=>h.stats)),attributes={...c.player.attributes};
 const queued=manuallyInjure(c,'half');assert.equal(queued.stage,'offseason');assert.ok(queued.systems!.manualInjuries!.at(-1)!.pendingNextSeason);assert.deepEqual(queued.season.playerStats,stats);assert.deepEqual(queued.player.attributes,attributes);validateCareer(queued);
 const loaded=await importCareer(await exportCareer(queued)),next=startNextSeason(stayAtClub(loaded));assert.ok(next.season.week>0);assert.equal(next.systems!.manualInjuries!.at(-1)!.pendingNextSeason,undefined);assert.equal(next.season.playerStats.apps,0);assert.deepEqual(next.player.attributes,attributes);assert.deepEqual(next.systems!.attributeLocks,queued.systems!.attributeLocks);assert.deepEqual(next.history.map(h=>h.stats),history);validateCareer(next);
 const calendar=structuredClone(queued);calendar.season.year=2028;calendar.season.calendarYear=2029;calendar.season.leagueId='KR1';calendar.player.clubId='KR1_01';activatePendingInjury(calendar);assert.equal(calendar.systems!.manualInjuries!.at(-1)!.start,'2029-01-01T00:00:00.000Z');assert.equal(calendar.systems!.manualInjuries!.at(-1)!.clubId,'KR1_01');
});
