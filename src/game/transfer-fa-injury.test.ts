import {leagueLeaders} from './league-leaders';
import {europeanShoePoints} from './global-honours';
import {emptyStats,sumStats} from './math';
import type {MatchRecord,PlayerStats} from './types';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,advanceHalf,advanceCareer,startNextSeason,releaseContract,acceptTransfer,manuallyInjure,setPlaySkill,configureCheats,cheatIncreaseAttribute,setAllAttributeLocks,manuallyAge,overall} from './engine';
import {trainRound,beginGrowthSeason} from './growth';
import {PLAY_STYLES} from './attributes';
import {validateCareer,exportCareer,verifySaveText} from './storage';
import {buildCareerText} from './career-text';
import {employmentLines,careerLeagueEntries} from './employment';
import {makeContractOffers,evaluateAwards} from './career-systems';
const fresh=()=>createCareer({name:'FA 부상 검수',nationality:'대한민국',age:25,height:180,weight:75,foot:'right',position:'ST',talent:'S',style:PLAY_STYLES.ST[0],clubId:'EN1_01',squad:'senior',difficulty:'realistic',seed:'fa-injury-290',training:[]});

test('skill mastery above 100 accumulates tiny gains; no automatic injury or age loss',()=>{
 let c=setPlaySkill(fresh(),'shooting',true);c=configureCheats(c,true,false);for(let i=0;i<10;i++)c=cheatIncreaseAttribute(c,'shooting',10);
 c=manuallyAge(c,10,'shooting');assert.equal(c.player.attributes.shooting,100);c.training=['shooting'];c.player.age=38;c.player.injuryWeeks=8;beginGrowthSeason(c);
 const before={...c.player.attributes};for(let i=0;i<150;i++){c.season.week=i%38+1;trainRound(c);}assert.ok(c.player.attributes.shooting!>100,`stuck ${c.player.attributes.shooting}`);
 for(const [key,n] of Object.entries(before))assert.ok(c.player.attributes[key as keyof typeof before]!>=n);
 c=setAllAttributeLocks(c,true);const locked={...c.player.attributes};trainRound(c);assert.deepEqual(c.player.attributes,locked);
});

test('FA release removes squad membership and wages, advances halves, signs instantly and survives JSON',async()=>{
 let c=releaseContract(fresh());assert.equal(c.player.clubId,'FA');assert.equal(c.player.wage,0);validateCareer(c);
 c=advanceHalf(c);assert.equal(c.season.playerStats.apps,0);assert.equal(c.careerIncome,0);assert.ok(c.offers.length===6);validateCareer(c);
 const oldRounds=c.season.week,o=c.offers[0];assert.equal(o.fee,0);assert.equal(o.effective,'now');
 c=acceptTransfer(c,o.id);assert.equal(c.player.clubId,o.clubId);assert.ok(c.season.week>0);assert.ok(Math.abs(c.season.week-oldRounds)<=6);validateCareer(c);
 c=advanceHalf(c);validateCareer(c);assert.ok(c.season.playerStats.apps>0);assert.ok(c.careerIncome>0);
 const loaded=await verifySaveText(await exportCareer(c));validateCareer(loaded);
 assert.match(buildCareerText(c),/전반기.*FA · 무소속/);
});

test('FA entire seasons preserve world simulation, year and half-year retirement records',()=>{
 let c=releaseContract(fresh());for(let i=0;i<2;i++){c=advanceHalf(c);c=advanceHalf(c);validateCareer(c);assert.equal(c.history.at(-1)!.rank,0);assert.equal(c.season.playerStats.apps,0);if(i===0)c=startNextSeason(c);}
 assert.ok(employmentLines(c,2026).some(s=>s.includes('전반기')));assert.ok(employmentLines(c,2026).some(s=>s.includes('후반기')));assert.equal(c.player.age,26);
});

for(const n of [5,10,20,'season'] as const)test(`manual injury ${n} is queued, actually excludes games and retains attributes`,()=>{
 let c=fresh();const before={...c.player.attributes};c=manuallyInjure(c,n);assert.equal(c.season.week,0);validateCareer(c);
 c=advanceHalf(c);c=advanceHalf(c);const r=c.systems!.manualInjuries![0];assert.deepEqual(c.player.attributes,before);assert.ok(r.returned);assert.equal(r.missed.filter(m=>m.scope==='club').length,n==='season'?c.season.matches.length+(c.systems!.clubCompetitions!.current.flatMap(t=>t.matches).length):n);if(n==='season')assert.equal(c.season.playerStats.apps,0);validateCareer(c);assert.match(buildCareerText(c),/확인된 결장/);
});

test('wage offers for a young first-team player are not uniformly forced 10 percent cuts',()=>{
 const c=fresh();c.stage='offseason';const offers=makeContractOffers(c,'offseason');assert.equal(offers.length,7);assert.ok(offers.filter(o=>o.wage>=c.player.wage).length>=5);assert.ok(offers.some(o=>o.wage>c.player.wage));
});

test('expiry releases automatically after the final paid season and next year starts without mandatory renewal',()=>{
 let c=fresh();c.player.contractYears=1;const e=c.systems!.economics;e.contract.expiresYear=c.season.year+1;delete e.contract.expiresDate;const t=e.contractHistory![0].current;t.expiresYear=c.season.year+1;t.years=1;delete t.expiresDate;validateCareer(c);
 c=advanceHalf(advanceHalf(c));assert.equal(c.player.clubId,'FA');assert.equal(c.history[0].clubId,'EN1_01');assert.equal(c.offers.length,7);assert.ok(c.offers.some(o=>o.clubId==='EN1_01'&&o.fee===0));assert.equal(c.transferDecision,'stay');validateCareer(c);
 c=startNextSeason(c);assert.equal(c.player.clubId,'FA');assert.equal(c.season.week,0);assert.equal(c.player.wage,0);assert.deepEqual(c.training,[]);validateCareer(c);
});

test('release after playing preserves prior match records and the former club final position',()=>{
 let c=advanceHalf(fresh());const games=JSON.stringify(c.season.matches),apps=c.season.playerStats.apps;
 c=releaseContract(c);c=advanceHalf(c);validateCareer(c);assert.equal(c.season.playerStats.apps,apps);assert.equal(JSON.stringify(c.season.matches),games);assert.ok(c.history[0].details!.employmentStandings!.some(r=>r.clubId==='EN1_01'&&r.rank>=1));assert.match(buildCareerText(c),/전반기.*아스널|아스널.*위|Arsenal/);
});


test('a midseason FA move keeps league scoring, prizes and shoe coefficients in their actual leagues',()=>{
 const c=fresh();c.player.clubId='PT1_01';c.season.leagueId='PT1';c.systems!.employment=[{year:2026,totalRounds:38,fromRound:0,toRound:19,clubId:'EN1_01',leagueId:'EN1',wage:1000,reason:'initial'},{year:2026,totalRounds:34,fromRound:17,clubId:'PT1_01',leagueId:'PT1',wage:1200,reason:'transfer'}];
 const game=(competitionId:string,playerClubId:string,goals:number)=>({competitionId,playerClubId,playerStats:{...emptyStats(),apps:1,minutes:90,goals,shots:goals,shotsOnTarget:goals,ratingCount:1,ratingSum:8}} as MatchRecord);
 c.season.matches=[game('EN1','EN1_01',5),game('PT1','PT1_01',3)];c.season.playerStats=sumStats(c.season.matches.map(m=>m.playerStats));
 const entries=careerLeagueEntries(c);assert.deepEqual(entries.map(r=>[r.leagueId,r.stats.goals]),[['EN1',5],['PT1',3]]);
 assert.equal(leagueLeaders(c).find(r=>r.playerId===c.player.id)!.stats.goals,3);
 const player={playerId:c.player.id,name:c.player.name,clubId:c.player.clubId,leagueId:'PT1',position:c.player.position,nationality:c.player.nationality,ovr:c.player.ovr,stats:c.season.playerStats,leagueSplits:entries};assert.equal(europeanShoePoints(player),14.5);
 const awards=evaluateAwards(c).filter(a=>a.category==='league');assert.ok(awards.some(a=>a.description.includes('5득점')&&a.clubId==='EN1_01'));assert.equal(awards.filter(a=>a.clubId==='PT1_01').length,0,'one match cannot earn the Portuguese best eleven; no unimplemented golden boot is fabricated');assert.ok(!awards.some(a=>a.description.includes('8득점')));
});
