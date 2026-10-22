import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptTransfer, createCareer, advanceCareer, advanceHalf, dismissChoice, setTraining, startNextSeason, retireCareer, getCareerTotals, calculateTable, overall } from './engine';
import { PLAY_STYLES, FIELD_ATTRIBUTES } from './attributes';
import { getClub, CLUBS } from './data';
import { ALL_STATS } from './math';
import { nextCalendarYear, seasonDate } from './calendar';
import { processNationalWindow } from './national';
import { beginGrowthSeason } from './growth';
import { validateCareer } from './storage';
import type { Career, CreateOptions } from './types';

const options=(extra:Partial<CreateOptions>={}):CreateOptions=>({name:'연결 검증',nationality:'대한민국',age:24,height:180,weight:75,foot:'right',position:'CM',talent:'S',style:PLAY_STYLES.CM[0],clubId:'KR1_01',squad:'senior',difficulty:'realistic',seed:'systems-integration',training:['passing','vision'],...extra});
const equalTotals=(a:ReturnType<typeof getCareerTotals>,b:ReturnType<typeof getCareerTotals>)=>{for(const key of ALL_STATS)assert.ok(Math.abs((a[key]??0)-(b[key]??0))<.001,key);};

test('half-season flow fixes annual training and wage, reserving all contract choices for the end of the season',()=>{
  const initial=createCareer(options());
  const original=JSON.stringify(initial),wage=initial.player.wage;
  const first=advanceHalf(initial);
  assert.equal(JSON.stringify(initial),original);
  assert.equal(first.season.week,Math.ceil(first.season.totalWeeks/2));
  assert.equal(first.systems!.phase,'midseason');
  assert.equal(first.systems!.trainingLocked,true);
  assert.equal(first.systems!.growthReports.length,1);
  assert.equal(first.player.wage,wage,'valuation never rewrites a contract');
  assert.throws(()=>setTraining(first,['shooting'],'intense'),/시즌 중/);
  for(const key of FIELD_ATTRIBUTES)if(!initial.training.includes(key)){
    assert.equal(first.systems!.growthLedger!.byCause.training[key]??0,0,`${key}: selected training never spreads to unrelated skills`);
    assert.ok(first.player.attributes[key]!-initial.player.attributes[key]!<=3,`${key}: actual position/action learning stays bounded`);
  }
  assert.equal(first.systems!.pendingChoice,undefined);assert.deepEqual(first.offers,[]);
  const second=advanceHalf(first);
  assert.equal(second.stage,'offseason');
  assert.equal(second.systems!.growthReports.length,2);
  assert.ok(second.season.fixtures.every(f=>f.played));
  assert.equal(second.player.wage,wage);
  assert.ok(Math.abs(second.systems!.economics.salaryIncome-wage*52)<.01);
  assert.equal(second.careerIncome,Math.round((second.systems!.economics.salaryIncome+second.systems!.economics.bonusIncome)*100)/100);
  assert.equal(second.systems!.economics.totalTransferFees,0);
  assert.ok(second.offers.length>0,'annual transfer and renewal choices arrive after the full season');
  validateCareer(second);
});

test('actual promotion changes engine next-season league, opponents, schedule and club revenue',()=>{
  const club=CLUBS.find(c=>c.leagueId==='DE2')!;
  const career=createCareer(options({clubId:club.id,seed:'promotion-integration'}));
  for(const fixture of career.season.fixtures){fixture.played=true;fixture.homeGoals=fixture.homeId===club.id?4:fixture.awayId===club.id?0:1;fixture.awayGoals=fixture.awayId===club.id?4:fixture.homeId===club.id?0:1;}
  career.season.week=career.season.totalWeeks;career.season.completed=true;career.stage='offseason';career.transferDecision='stay';
  career.season.table=calculateTable(career.season.fixtures,career.season.table.map(r=>r.clubId));
  const competition=career.systems!.world.competitions.DE2;
  competition.fixtures=structuredClone(career.season.fixtures);competition.table=structuredClone(career.season.table);competition.round=competition.totalRounds;
  const oldOpponents=new Set(career.season.table.map(t=>t.clubId));
  const priorRevenue=career.systems!.world.clubs[club.id].revenue;
  const next=startNextSeason(setTraining(career,career.training,career.intensity));
  assert.equal(getClub(club.id).leagueId,'DE2','retained catalogue stays historical');
  assert.equal(next.systems!.world.clubs[club.id].leagueId,'DE1');
  assert.equal(next.season.leagueId,'DE1');
  assert.ok(next.season.table.filter(r=>r.clubId!==club.id&&!oldOpponents.has(r.clubId)).length>10);
  assert.equal(next.season.fixtures.length,next.season.table.length*(next.season.table.length-1));
  assert.ok(next.season.fixtures.every(f=>[f.homeId,f.awayId].every(id=>next.systems!.world.clubs[id].leagueId==='DE1')));
  assert.ok(next.systems!.world.clubs[club.id].revenue>priorRevenue);
  assert.equal(next.player.wage,career.player.wage);
});

test('club + actual international ledgers equal combined totals and retirement preserves every total',()=>{
  let career=createCareer(options({seed:'club-national-retire'}));
  for(const key of FIELD_ATTRIBUTES)career.player.attributes[key]=99;
  career.player.ovr=overall(career.player);career.managerTrust=95;
  career.season.attributeStart={...career.player.attributes};career.season.ovrStart=career.player.ovr;
  beginGrowthSeason(career);
  processNationalWindow(career,'first');
  assert.ok(getCareerTotals(career,'national').apps>0,'a real selected international match is required');
  career.player.injuryWeeks=0;career.player.fitness=100;
  career=advanceCareer(career,3);
  assert.ok(getCareerTotals(career,'club').apps>0);
  const club=getCareerTotals(career,'club'),national=getCareerTotals(career,'national'),combined=getCareerTotals(career);
  for(const key of ALL_STATS)assert.ok(Math.abs((combined[key]??0)-(club[key]??0)-(national[key]??0))<.001,key);
  const retired=retireCareer(career);
  equalTotals(getCareerTotals(retired),combined);
  equalTotals(getCareerTotals(retired,'club'),club);
  equalTotals(getCareerTotals(retired,'national'),national);
  assert.deepEqual(retireCareer(retired),retired);
  validateCareer(retired);
});

test('league calendars split seasons locally and cross-calendar transfers never travel backwards',()=>{
  const european=createCareer(options({clubId:CLUBS.find(c=>c.leagueId==='DE1')!.id}));
  assert.equal(new Date(seasonDate(european.season,0)).getUTCMonth(),6);
  assert.equal(nextCalendarYear(european.season,'KR1'),2028);
  const korean=createCareer(options());
  assert.equal(new Date(seasonDate(korean.season,0)).getUTCMonth(),0);
  assert.equal(nextCalendarYear(korean.season,'DE1'),2027);
  const shifted={...korean.season,year:2027,calendarYear:2028};
  assert.equal(nextCalendarYear(shifted,'KR1'),2029);
  assert.ok(new Date(seasonDate({...shifted,year:2028,calendarYear:2029},0)).getTime()>new Date(seasonDate(shifted,shifted.totalWeeks)).getTime());
});


test('an old midseason prompt clears on a command without changing wages or blocking progress',()=>{
  const c=createCareer(options());
  c.offers=[{id:'old-renewal',clubId:c.player.clubId,type:'renew',wage:c.player.wage+100,years:3,role:'주전',fee:0,reason:'이전 버전 제안',effective:'now'}];
  c.systems!.pendingChoice={kind:'renewal',offerIds:['old-renewal'],deadlineRound:0,reason:'이전 버전 응답 대기'};
  const before=JSON.stringify(c);assert.throws(()=>acceptTransfer(c,'old-renewal'),/시즌 종료/);
  const next=advanceCareer(c,1);assert.equal(next.season.week,1);assert.equal(next.systems!.pendingChoice,undefined);assert.deepEqual(next.offers,[]);assert.equal(next.player.wage,c.player.wage);assert.equal(JSON.stringify(c),before);
});
