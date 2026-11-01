import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,overall} from './engine';
import {FIELD_ATTRIBUTES} from './attributes';
import {assessmentNow,marketDeclineEvidence} from './market-value';
import {makeContractOffers,updateMarketValue,needsContractOfferRefresh} from './career-systems';
import {ensureCommercial,settleShirtMarket} from './commercial';
import {validateCommercial} from './commercial-validation';
import {emptyStats} from './math';
import {getClub} from './data';
import type {Career,SeasonSummary} from './types';

function fresh(clubId='ES1_01',age=27):Career{
 const c=createCareer({name:'지속 기량·개인 팬 검수',nationality:'대한민국',age:Math.min(age,35),height:180,weight:76,foot:'right',position:'ST',talent:'SSS',style:'포처',clubId,squad:'senior',difficulty:'realistic',seed:'economy-fans-2116',training:[]});c.player.age=age;
 ability(c,100);c.season.ovrStart=100;c.player.wage=500000;
 const e=c.systems!.economics;e.marketValue=350000000;e.peakValue=e.marketValue;e.assessment=assessmentNow(c);e.contract={...e.contract,wageAtSigning:500000,expiresYear:c.season.year+5};
 c.systems!.personality={leadership:5,stardom:10,fairPlay:5,clutch:5,winning:5};return c;
}
function ability(c:Career,n:number){for(const k of FIELD_ATTRIBUTES)c.player.attributes[k]=n;c.player.ovr=overall(c.player);}
function archive(c:Career,end:number){
 // Controlled economic evidence, not a simulated or save-valid match history.
 c.history.push({year:c.season.year,age:c.player.age,clubId:c.player.clubId,clubName:getClub(c.player.clubId).name,leagueId:c.season.leagueId,competitionName:c.season.competitionName,position:c.player.position,squad:'senior',rank:8,ovrStart:c.season.ovrStart,ovrEnd:end,stats:{...c.season.playerStats},matches:Array.from({length:c.season.totalWeeks},()=>({})) as SeasonSummary['matches'],awards:[],attributeGrowth:{},income:0,completed:true});
}
function nextYear(c:Career){c.season.year++;c.player.age++;c.season.week=0;c.season.ovrStart=c.player.ovr;c.season.playerStats=emptyStats();c.season.completed=false;c.stage='season';updateMarketValue(c,'다음 시즌');}
function poorYear(c:Career){
 c.season.playerStats={...emptyStats(),apps:18,starts:8,minutes:1000,goals:2,assists:1,ratingCount:18,ratingSum:18*6.1};
 for(const f of [.5,1]){c.season.week=Math.floor(c.season.totalWeeks*f);c.season.completed=f===1;c.stage=f===1?'offseason':'season';updateMarketValue(c,'새 기간 평가');}
}
function famous(c:Career,star=10){
 ability(c,95);c.systems!.personality!.stardom=star;ensureCommercial(c)!.reputation[c.player.id]=.98;
 c.season.playerStats={...emptyStats(),apps:36,starts:34,minutes:3000,goals:35,assists:15,ratingCount:36,ratingSum:36*8};
 // Equal recorded production isolates market allocation from match randomness.
 c.season.matches=[{playerClubId:c.player.clubId,playerStats:{...c.season.playerStats}}] as Career['season']['matches'];
 c.season.week=c.season.totalWeeks;c.season.completed=true;c.stage='offseason';return c;
}

test('100→50 sustained for three years reprices new wages and fees at any age, while the signed contract stays fixed',()=>{
 for(const age of [27,39]){
  const c=fresh('ES1_01',age),e=c.systems!.economics,contract=structuredClone(e.contract);c.season.year--;archive(c,100);c.season.year++;
  ability(c,50);updateMarketValue(c,'경기 없는 수동 감소');assert.equal(e.marketValue,350000000);
  const proposals=[];
  for(let i=0;i<3;i++){
   poorYear(c);const offers=makeContractOffers(c,'offseason'),renew=offers.find(o=>o.type==='renew')!;
   proposals.push(renew.wage);assert.equal(c.player.wage,500000);assert.deepEqual(e.contract,contract);
   if(i===2){assert.ok(e.marketValue<10000000,`${age}: ${e.marketValue}`);assert.ok(renew.wage<25000,`${age}: ${renew.wage}`);assert.ok(offers.filter(o=>o.type==='transfer').every(o=>o.fee<10000000));assert.ok(renew.reason.includes('지속된 기량 저하'));}
   archive(c,50);nextYear(c);
  }
  assert.ok(proposals[2]<proposals[0]*.1);assert.equal(marketDeclineEvidence(c).seasons,3);
 }
});
test('retained class after a quiet season keeps salary support; recovery removes sustained decline pressure',()=>{
 const c=fresh();poorYear(c);const e=c.systems!.economics,before=e.marketValue;
 assert.equal(marketDeclineEvidence(c).pressure,0);assert.ok(makeContractOffers(c,'offseason').find(o=>o.type==='renew')!.wage>=500000);
 archive(c,100);nextYear(c);ability(c,50);poorYear(c);archive(c,50);nextYear(c);poorYear(c);assert.ok(marketDeclineEvidence(c).pressure>0);
 ability(c,100);assert.equal(marketDeclineEvidence(c).pressure,0);assert.ok(makeContractOffers(c,'offseason').find(o=>o.type==='renew')!.wage>=500000);assert.ok(before>=350000000*.88);
});
test('repeated same-point revaluations and offer refreshes do not change quotes, signed wages or past records',()=>{
 const c=fresh();archive(c,100);c.history[0].year--;ability(c,50);poorYear(c);
 const before=JSON.stringify({value:c.systems!.economics.marketValue,contract:c.systems!.economics.contract,history:c.history,attrs:c.player.attributes});
 c.offers=makeContractOffers(c,'offseason');assert.equal(needsContractOfferRefresh(c),false);c.offers[0].id='old-pending-offer';assert.equal(needsContractOfferRefresh(c),true);
 for(let i=0;i<8;i++){updateMarketValue(c,'동일 시점');makeContractOffers(c,'offseason');}
 assert.equal(JSON.stringify({value:c.systems!.economics.marketValue,contract:c.systems!.economics.contract,history:c.history,attrs:c.player.attributes}),before);
});
test('established personal fans follow a high-star player to smaller clubs, with a finite common world market',()=>{
 const rows=['ES1_01','US1_12','KR1_04','KR2_03'].map(id=>{const c=famous(fresh(id)),s=settleShirtMarket(c)!;validateCommercial(c);return {c,s};});
 const big=rows[0].s;
 for(const {s}of rows.slice(1)){assert.equal(s.marketTotal,big.marketTotal);assert.ok(s.playerUnits>big.playerUnits*.5);assert.ok(s.playerUnits<big.playerUnits);assert.ok(s.playerPersonalUnits!>s.playerUnits*.8);}
 for(const {s}of rows){assert.equal(s.clubs.reduce((n,r)=>n+r.personal!,0),s.personalMarket);assert.ok(s.personalMarket!<=s.marketTotal*.35+1);assert.equal(s.playerClubs.reduce((n,r)=>n+r.personalUnits!,0),s.playerPersonalUnits);}
});
test('stardom increases portable demand; an unknown high-star name does not inherit a legend fanbase',()=>{
 const low=famous(fresh('KR2_03'),1),high=famous(structuredClone(low),10),unknown=structuredClone(high);ensureCommercial(unknown)!.reputation[unknown.player.id]=0;unknown.player.name='Cristiano Ronaldo';
 const lo=settleShirtMarket(low)!,hi=settleShirtMarket(high)!,rookie=settleShirtMarket(unknown)!;
 assert.ok(hi.playerUnits>lo.playerUnits*3);assert.ok(hi.playerPersonalUnits!>lo.playerPersonalUnits!*3);assert.ok(rookie.playerUnits<hi.playerUnits*.1);assert.equal(hi.marketTotal,lo.marketTotal);
 assert.deepEqual(low.player.attributes,high.player.attributes);assert.deepEqual(low.season.playerStats,high.season.playerStats);
});
test('one fanbase is split across midseason clubs instead of duplicated, and both ledgers reconcile',()=>{
 const one=famous(fresh()),two=structuredClone(one),minutes=one.season.playerStats.minutes;
 two.season.matches=[{playerClubId:'ES1_01',playerStats:{...one.season.playerStats,minutes:minutes/2}},{playerClubId:'US1_12',playerStats:{...one.season.playerStats,minutes:minutes/2}}] as Career['season']['matches'];two.player.clubId='US1_12';
 const single=settleShirtMarket(one)!,split=settleShirtMarket(two)!;validateCommercial(two);
 assert.equal(split.playerClubs.length,2);assert.ok(split.playerPersonalUnits!<=single.playerPersonalUnits!*1.05);assert.ok(split.playerPersonalUnits!>=single.playerPersonalUnits!*.8);
 assert.equal(split.playerClubs.reduce((n,r)=>n+r.units,0),split.playerUnits);
});
test('old sales stay immutable and save-compatible; new optional fan accounting survives JSON and rejects tampering',()=>{
 const c=famous(fresh()),first=settleShirtMarket(c)!;delete first.modelVersion;delete first.personalMarket;delete first.playerPersonalUnits;for(const r of first.clubs)delete r.personal;for(const r of first.playerClubs)delete r.personalUnits;
 const old=JSON.stringify(first);validateCommercial(c);nextYear(c);famous(c);settleShirtMarket(c);validateCommercial(c);
 const loaded=JSON.parse(JSON.stringify(c)) as Career;validateCommercial(loaded);assert.equal(JSON.stringify(loaded.systems!.commercial!.seasons[0]),old);
 loaded.systems!.commercial!.seasons[1].playerPersonalUnits!++;assert.throws(()=>validateCommercial(loaded),/개인 팬/);
});
