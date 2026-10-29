import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createCareer,advanceCareer,startNextSeason,setTraining,manuallyAge,setAttributeLock,cheatIncreaseAttribute,configureCheats,manuallyInjure,overall} from './engine';
import {trainRound,applyMatchExperience} from './growth';
import {emptyStats} from './math';
import {exportCareer,importCareer,validateCareer} from './storage';
import {getClub,CLUBS} from './data';
import {PLAY_STYLES} from './attributes';
import {cupLedger,initializeClubCompetitions,processClubCompetitions,europeanEntries} from './club-competitions';
import {makeContractOffers} from './career-systems';
import {EXTRA_HONOUR_KINDS,evaluateExtraHonours} from './extra-honours';
import {reviewK3Promotion} from './korean-promotion';
import {internationalEntries,internationalPlans,continent,clubWorldHost,clubCountry} from './international-competitions';
import {money,compactMoney,krw,currencyText} from './currency';
import {seasonHonours} from './honours';
import {buildCareerText} from './career-text';
import {copySystems} from './snapshot';
import type {Career,AttributeKey} from './types';
if(!globalThis.crypto?.subtle)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
const fresh=(position:'ST'|'GK'='ST')=>createCareer({name:'신규 개선 검증',nationality:'대한민국',age:23,height:183,weight:78,foot:'right',position,talent:'SSS',style:PLAY_STYLES[position][0],clubId:'KR1_01',squad:'senior',difficulty:'realistic',seed:`p27-new-${position}`});
test('inline aging alters one field/GK attribute even while locked; locks still cover automatic changes and cheats',async()=>{
 for(const pos of ['ST','GK'] as const){let c=fresh(pos);const key:AttributeKey=pos==='ST'?'shooting':'gkReflexes',before={...c.player.attributes};
  c=manuallyAge(c,5,key);for(const [k,v]of Object.entries(before))assert.equal(c.player.attributes[k as AttributeKey],k===key?Math.max(0,v!-5):v);assert.equal(c.player.ovr,overall(c.player));
  c=setAttributeLock(c,key,true);const originalLocked=c.player.attributes[key];c=manuallyAge(c,1,key);const locked=c.player.attributes[key];assert.equal(locked,Math.max(0,originalLocked!-1));assert.ok(c.systems!.attributeLocks!.includes(key));
  c=configureCheats(c,true,false);c=cheatIncreaseAttribute(c,key,10);assert.equal(c.player.attributes[key],locked);
  c.training=[key];c.player.injuryWeeks=10;c.season.week=1;trainRound(c);const stats={...emptyStats(),apps:1,starts:1,minutes:90,ratingCount:1,ratingSum:9,shotsOnTarget:4,saves:8};applyMatchExperience(c,stats);assert.equal(c.player.attributes[key],locked);
  c.season.week=0; // This isolated unit exercise is not a fabricated persisted fixture.
  const saved=setAttributeLock(fresh(pos),key,true),loaded=await importCareer(await exportCareer(saved));assert.deepEqual(loaded.systems!.attributeLocks,[key]);const unlocked=setAttributeLock(loaded,key,false);assert.equal(unlocked.player.attributes[key],saved.player.attributes[key]);assert.equal(manuallyAge(unlocked,1,key).player.attributes[key],saved.player.attributes[key]!-1);
 }
});
test('light snapshots share immutable world/history but isolate every mutated attribute and ledger',()=>{
 const c=fresh(),before=JSON.stringify(c),next=manuallyAge(c,10,'speed');assert.equal(JSON.stringify(c),before);assert.equal(next.systems!.world,c.systems!.world);assert.notEqual(next.systems!.growthLedger,c.systems!.growthLedger);validateCareer(next);
 const full=copySystems(c.systems!);assert.notEqual(full.world,c.systems!.world);assert.notEqual(full.national.matches,c.systems!.national.matches);assert.notEqual(full.clubCompetitions!.current[0].fixtures,c.systems!.clubCompetitions!.current[0].fixtures);
});
test('ages 16 through 48 have no negative age-based training or experience path',()=>{
 for(const age of [16,20,28,32,36,40,44,48]){const c=fresh();c.player.age=age;const before={...c.player.attributes};for(let round=1;round<=5;round++){c.season.week=round;trainRound(c);applyMatchExperience(c,{...emptyStats(),apps:1,minutes:90,ratingCount:1,ratingSum:8});}for(const [key,v]of Object.entries(before))assert.ok(c.player.attributes[key as AttributeKey]!>=v!,`${age} ${key}`);assert.deepEqual(c.systems!.growthLedger!.byCause.aging,{});}
});
test('every market contains six unique external real clubs in the requested 3/1/1/1 bands, under actual budgets',()=>{
 for(const ability of [30,55,75,88,99])for(let year=2026;year<2034;year++){
  const c=fresh();c.player.ovr=ability;c.season.year=year;c.stage='offseason';c.systems!.economics.marketValue=ability===99?200000000:2000000;c.systems!.economics.contract.expiresYear=year+3;
  const offers=makeContractOffers(c,'offseason'),external=offers.filter(o=>o.type==='transfer');assert.equal(external.length,6);assert.equal(new Set(external.map(o=>o.clubId)).size,6);assert.ok(external.every(o=>o.clubId!==c.player.clubId&&CLUBS.some(x=>x.id===o.clubId)));
  for(const [band,count]of [['similar',3],['lower',1],['higher',1],['wild',1]])assert.equal(external.filter(o=>o.band===band).length,count);
  for(const o of external){const club=c.systems!.world.clubs[o.clubId];assert.ok(o.fee<=club.budget);assert.ok(o.wage<=club.wageBudget/52*.14+1);assert.doesNotMatch(o.reason,/€/);}
  assert.ok(new Set(external.map(o=>getClub(o.clubId).country)).size>=3);
 }
});
test('KRW is a fixed display conversion; full integers and Korean units preserve underlying EUR',()=>{
 const euros=150397200;assert.equal(krw(euros),225595800000);assert.equal(money(euros),'225,595,800,000원');assert.equal(compactMoney(euros),'2,255억 9,580만 원');assert.match(currencyText('주급 €1,000'),/1,500,000원/);assert.equal(euros,150397200);
});
test('extra honours require observed games, correct positions/ages and actual debut/transfer evidence',()=>{
 const c=fresh();assert.equal(EXTRA_HONOUR_KINDS.length,22);assert.deepEqual(evaluateExtraHonours(c),[]);
 const world=c.systems!.world,p=c.player,own={playerId:p.id,name:p.name,clubId:p.clubId,leagueId:c.season.leagueId,position:p.position,nationality:p.nationality,ovr:p.ovr,stats:{...emptyStats(),apps:30,starts:30,minutes:2700,goals:35,assists:12,ratingSum:270,ratingCount:30,mom:10}};world.playerStats[p.id]=own;c.season.playerStats={...own.stats};
 const won=evaluateExtraHonours(c);assert.ok(won.some(a=>a.name.includes('구단 올해의 선수')));assert.ok(!won.some(a=>a.category==='commercial'),'popularity-only sales awards are replaced by the world sales ledger');c.awards=won;const summary=seasonHonours(c,c.season.year);assert.equal(summary.commercial.length,0);assert.ok(summary.personal.every(a=>a.category!=='commercial'));c.awards=[];assert.ok(won.every(a=>!a.official&&a.verification==='game-model'));assert.ok(!won.some(a=>/올해의 (수비수|골키퍼|미드필더)|올해의 영입/.test(a.name)));assert.ok(won.some(a=>a.name.includes('유망주')));
 c.player.age=24;assert.ok(!evaluateExtraHonours(c).some(a=>a.name.includes('유망주')));
 const peer={...own,playerId:'actual-peer',name:'실제 비교 선수',stats:{...own.stats,goals:60,assists:30,ratingSum:297,mom:25}};world.playerStats[peer.playerId]=peer;assert.ok(!evaluateExtraHonours(c).some(a=>a.name.endsWith('구단 올해의 선수')));
});
test('K3 titles require verified annual license evidence and a real decided match, never automatic promotion',()=>{
 const c=fresh(),champion=c.systems!.world.competitions.KR3.table[0].clubId;
 const missing=reviewK3Promotion(c)!;assert.equal(missing.status,'unverified');assert.equal(missing.matches.length,0);
 const edition={year:2026,approvedClubIds:[],sourceUrl:'https://www.kleague.com/',verifiedAt:'2026-10-24',legs:2 as const};assert.equal(reviewK3Promotion(c,edition)!.status,'ineligible');
 const actual=reviewK3Promotion(c,{...edition,approvedClubIds:[champion]})!;assert.equal(actual.status,'played');assert.equal(actual.matches.length,2);assert.equal(typeof actual.promoted,'boolean');c.systems!.world.promotionReviews=[actual];validateCareer(c);assert.ok(actual.matches.every(m=>m.events.filter(e=>e.type==='goal').length===m.homeGoals+m.awayGoals));
});
test('new continental fields preserve region, actual unique entrants and group opponent rules',()=>{
 const c=fresh(),entries=internationalEntries(c),plans=internationalPlans(c,entries);assert.ok(plans.some(t=>t.code==='AFC_ELITE'));assert.ok(plans.some(t=>t.code==='CAF_CL'));assert.ok(plans.some(t=>t.code==='OFC_CL'));assert.ok(!plans.some(t=>t.code==='INTERCONTINENTAL'||t.code==='CLUB_WORLD_CUP'));
 assert.equal(clubWorldHost(c,{'RANK:대한민국':['KR1_01','KR1_02']},['KR1_01'],2029)?.clubId,'KR1_02','host champion already qualified passes the host berth to the next actually ranked team');
 const canadian=CLUBS.find(r=>r.name.includes('토론토'))!;assert.equal(clubCountry(canadian.id),'캐나다');assert.equal(clubWorldHost(c,{'RANK:미국':[canadian.id,'US1_01']},[],2029)?.clubId,'US1_01','Canadian MLS clubs cannot take a US host berth');
 const afc=cupLedger(c).find(t=>t.id.startsWith('AFC_ELITE:'))!;for(const id of afc.entrants){const games=afc.fixtures.filter(f=>[f.homeId,f.awayId].includes(id));assert.equal(games.length,8);assert.equal(new Set(games.map(f=>f.homeId===id?f.awayId:f.homeId)).size,8);assert.equal(games.filter(f=>f.homeId===id).length,4);assert.equal(continent(id),'AFC');}
});
test('season injury queues at the half boundary, excludes all remaining games and ends with that season',()=>{
 let c=fresh();c=advanceCareer(c,c.systems!.halfRound);const oldApps=c.season.playerStats.apps,oldGoals=c.season.playerStats.goals;
 const prior=JSON.stringify(c);let injured=manuallyInjure(c,'season');assert.equal(JSON.stringify(c),prior);assert.equal(injured.season.week,c.season.week);injured=advanceCareer(injured,120);
 assert.equal(injured.stage,'offseason');assert.equal(injured.season.playerStats.apps,oldApps);assert.equal(injured.season.playerStats.goals,oldGoals);assert.ok(injured.season.table.every(r=>r.played===injured.season.totalWeeks));
 const injury=injured.systems!.manualInjuries![0];assert.ok(injury.missed.length>0);assert.ok(injury.returned);validateCareer(injured);
 c=startNextSeason(setTraining(injured,injured.training,injured.intensity));assert.equal(c.season.week,0);assert.equal(c.player.injuryWeeks,0);c=advanceCareer(c,4);validateCareer(c);assert.ok(c.season.playerStats.apps>0);
 assert.match(buildCareerText(c),/부상 유무: 부상 있음/);assert.match(buildCareerText(c),/확인된 결장 \d+경기/);assert.doesNotMatch(buildCareerText(c),/€|"missed"/);
});
