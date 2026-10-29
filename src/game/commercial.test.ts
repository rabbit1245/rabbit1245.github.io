import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,overall} from './engine';
import {FIELD_ATTRIBUTES,PLAY_STYLES} from './attributes';
import {allocateUnits,settleShirtMarket,shirtSalesAwards,shirtSalesSeason,ensureCommercial} from './commercial';
import {validateCommercial} from './commercial-validation';
import {marketEstimate,makeContractOffers,ensureEconomicMarket} from './career-systems';
import {copySystems} from './snapshot';
import {emptyStats} from './math';
import {buildCareerText} from './career-text';
import type {Career} from './types';
function fresh(clubId='ES1_07',age=18,ovr=80):Career{
 const c=createCareer({name:'유망주 시장 검수',nationality:'대한민국',age,height:180,weight:75,foot:'right',position:'LW',talent:'SS',style:PLAY_STYLES.LW[0],clubId,squad:'senior',difficulty:'realistic',seed:'commercial-market-unit',training:[]});
 for(const k of FIELD_ATTRIBUTES)c.player.attributes[k]=ovr;c.player.ovr=overall(c.player);c.player.potential=95;
 return c;
}
function proof(c:Career,goals=15,assists=10){c.season.week=c.season.totalWeeks;c.season.playerStats={...emptyStats(),apps:34,starts:32,minutes:2700,goals,assists,ratingSum:34*7.5,ratingCount:34};}
function finish(c:Career){c.season.week=c.season.totalWeeks;c.season.completed=true;c.stage='offseason';return settleShirtMarket(c)!;}

test('shirt allocation conserves finite integer supply, including very small and zero markets',()=>{
 for(const total of [0,1,2,17,100003])for(const weights of [[1],[1,1,1],[.1,.2,8,0],[0,0]]){const units=allocateUnits(total,weights);assert.equal(units.reduce((a,b)=>a+b,0),total);assert.ok(units.every(n=>Number.isSafeInteger(n)&&n>=0));}
});
test('the complete world market reconciles club pools, own clubs and player ranks; settling twice is inert',()=>{
 const c=fresh('ES1_01',25,95),s=finish(c);validateCommercial(c);
 assert.ok(s.candidateCount>10000&&s.marketTotal>10000000);assert.equal(s.clubs.reduce((n,r)=>n+r.total,0),s.marketTotal);
 assert.equal(s.playerClubs.reduce((n,r)=>n+r.units,0),s.playerUnits);assert.equal(settleShirtMarket(c),s);assert.equal(c.systems!.commercial!.seasons.length,1);
 const broken=structuredClone(c);broken.systems!.commercial!.seasons[0].playerUnits++;assert.throws(()=>validateCommercial(broken),/판매량/);
});
test('stardom changes competitive shirt demand without changing ability or match statistics',()=>{
 const a=fresh('ES1_01',25,90),b=structuredClone(a);a.systems!.personality={leadership:5,stardom:1,fairPlay:5,clutch:5,winning:5};b.systems!.personality={...a.systems!.personality,stardom:10};
 const lo=finish(a),hi=finish(b);assert.ok(hi.playerUnits>lo.playerUnits*1.5,`${lo.playerUnits} → ${hi.playerUnits}`);assert.equal(lo.marketTotal,hi.marketTotal);assert.deepEqual(a.player.attributes,b.player.attributes);assert.deepEqual(a.season.playerStats,b.season.playerStats);
});
test('club growth and earned results build persistent popularity without rewriting an earlier season',()=>{
 const c=fresh(),club=c.systems!.world.clubs[c.player.clubId],competition=c.systems!.world.competitions[club.leagueId];
 const own=competition.table.find(r=>r.clubId===club.id)!;competition.table=[own,...competition.table.filter(r=>r!==own)];club.power+=5;
 const s=finish(c),saved=JSON.stringify(s),pop=s.playerClubs[0].clubPopularity;assert.ok(pop>1);
 const next={...c,season:{...c.season,year:c.season.year+1},systems:copySystems(c.systems!)};finish(next);assert.equal(JSON.stringify(s),saved);assert.ok(next.systems!.commercial!.clubs[club.id].popularity>pop);assert.equal(c.systems!.commercial!.seasons.length,1);
});
test('sales medals are global places 1, 2 and 3 only, and are actual individual honours',()=>{
 const c=fresh('ES1_01',25,95),s=finish(c);s.playerUnits=100;
 for(const rank of [1,2,3,4,null]){s.playerRank=rank;const medals=shirtSalesAwards(c);assert.equal(medals.length,rank&&rank<=3?1:0);if(medals.length){assert.equal(medals[0].category,'commercial-individual');assert.equal(medals[0].rank,rank);}}
 s.completed=false;s.playerRank=1;assert.deepEqual(shirtSalesAwards(c),[]);
});
test('new market data survive JSON and appear in Korean year records; old sales are not fabricated',()=>{
 const c=fresh(),s=finish(c),loaded=JSON.parse(JSON.stringify(c));validateCommercial(loaded);assert.deepEqual(shirtSalesSeason(loaded,s.year),s);
 assert.ok(buildCareerText(loaded).includes(`유니폼 판매: ${s.playerUnits.toLocaleString('ko-KR')}장`));
 const old=fresh();delete old.systems!.commercial;assert.ok(buildCareerText(old).includes('유니폼 판매: 시즌 종료 후 집계'));assert.equal(old.systems!.commercial,undefined);
});
test('an 18–19 year old with a proven La Liga 15G/10A breakout is valued above an unproven peer',t=>{
 const rows=[];for(const age of [18,19]){const c=fresh('ES1_07',age),unproven=marketEstimate(c);proof(c);const value=marketEstimate(c);assert.ok(value>=65000000&&value<=180000000,`${age}: ${value}`);assert.ok(value>unproven*2);rows.push({age,ability:c.player.ovr,goals:15,assists:10,minutes:2700,valueEUR:value,unprovenEUR:unproven});}t.diagnostic(JSON.stringify(rows));
});
test('a handful of matches cannot earn the same breakout valuation as a full proven season',()=>{
 const c=fresh();proof(c);const proven=marketEstimate(c);c.season.playerStats={...c.season.playerStats,apps:4,minutes:320,goals:3,assists:2};assert.ok(marketEstimate(c)<proven*.65);
});
test('new proposals use modern weekly wage ratios within real club funding; existing wages stay fixed',t=>{
 const c=fresh('ES1_01',19);proof(c);c.stage='offseason';const oldWage=c.player.wage;const offers=makeContractOffers(c,'offseason'),renewal=offers.find(o=>o.clubId===c.player.clubId)!;
 assert.ok(renewal.wage>=50000&&renewal.wage<=350000,JSON.stringify(renewal));assert.equal(c.player.wage,oldWage);assert.ok(renewal.wage<=c.systems!.world.clubs[c.player.clubId].wageBudget/52*.14);t.diagnostic(JSON.stringify({wageEUR:renewal.wage,oldWageEUR:oldWage}));
});
test('valuation migration preserves historical values and the signed wage',()=>{
 const c=fresh();proof(c);const e=c.systems!.economics;delete e.valuationVersion;const wage=c.player.wage,contract=structuredClone(e.contract),before=structuredClone(e.valueHistory);
 ensureEconomicMarket(c);assert.deepEqual(e.contract,contract);assert.equal(c.player.wage,wage);assert.deepEqual(e.valueHistory.slice(0,-1),before);const once=structuredClone(e);ensureEconomicMarket(c);assert.deepEqual(e,once);
});
test('choosing a celebrity display name does not grant the user a celebrity fanbase',()=>{
 const a=fresh('ES1_01',25,90),b=structuredClone(a);b.player.name='Lionel Messi';assert.equal(finish(a).playerUnits,finish(b).playerUnits);
});
test('a whole FA season has zero club shirt sales and no sales medal',()=>{
 const c=fresh();c.player.clubId='FA';const s=finish(c);assert.equal(s.playerUnits,0);assert.equal(s.playerRank,null);assert.deepEqual(s.playerClubs,[]);assert.deepEqual(shirtSalesAwards(c),[]);validateCommercial(c);
});
test('legacy honours and funded club growth seed existing popularity, without inventing past sales',()=>{
 const c=fresh();delete c.systems!.commercial;c.stage='offseason';c.awards=[{id:'known-world-award',year:c.season.year-1,name:'발롱도르',clubId:c.player.clubId,category:'world',description:'기존 확정 기록'}];
 const d=c.systems!.world.clubs[c.player.clubId].development!;d.investmentPower=10;d.prestige=d.basePower+5;
 const state=ensureCommercial(c)!;assert.ok(state.reputation[c.player.id]>.8);assert.ok(state.clubs[c.player.clubId].popularity>1.4);assert.equal(state.firstYear,c.season.year+1);assert.deepEqual(state.seasons,[]);validateCommercial(c);
});
