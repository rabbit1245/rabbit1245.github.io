import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUBS } from './data';
import { emptyStats } from './math';
import { applyContract, awardPositionGroup, createEconomics, createLeadership, beginEconomicSeason, ensureEconomicHistory, getPreviousContractWage, answerCaptainOffer, evaluateAwards, getClubTopScorer, makeContractOffers, payBonus, paySalary, performanceScore, updateLeadership, updateMarketValue } from './career-systems';
import type { Career, MatchRecord, PlayerStats, Position } from './types';
import type { CompetitorSeason } from './revision-types';

const clubs = CLUBS.filter(c => c.leagueId === 'EN1').slice(0, 4);
const statistics = (extra: Partial<PlayerStats> = {}): PlayerStats => ({ ...emptyStats(), apps: 30, starts: 30, minutes: 2700, ratingCount: 30, ratingSum: 225, passes: 1000, passesCompleted: 860, ...extra });
function makeCareer(): Career {
  const career: Career = {
    schemaVersion: 1, id: 'career', seed: 'economy-test', revision: 0, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
    player: { id: 'user', name: '김선수', nationality: '대한민국', age: 24, height: 180, weight: 75, foot: 'right', position: 'ST', secondaryPositions: [], talent: 'A', style: '공격수', attributes: { teamwork: 80, composure: 80, concentration: 80, decisions: 80 }, clubId: clubs[0].id, squad: 'senior', fitness: 100, morale: 70, form: 70, injuryWeeks: 0, ovr: 75, potential: 87, wage: 2_000, contractYears: 2 },
    season: { year: 2026, index: 0, week: 38, totalWeeks: 38, leagueId: 'EN1', competitionName: '프리미어리그', fixtures: [], table: [], matches: [], playerStats: statistics({ goals: 8, assists: 5 }), ovrStart: 75, attributeStart: {}, completed: true },
    history: [], news: [], training: ['shooting'], intensity: 'balanced', transfers: [], offers: [], stage: 'offseason', managerTrust: 90, careerIncome: 0, awards: [], difficulty: 'realistic', processedCommands: [],
  };
  career.systems = {
    version: 2, phase: 'review', halfRound: 19, trainingLocked: false, growthReports: [], rankings: [], events: [],
    world: { year: 2026, players: {}, clubs: Object.fromEntries(clubs.map(c => [c.id, { id: c.id, leagueId: 'EN1', power: 75, depth: 70, averageAge: 26, injuryImpact: 0, budget: 100_000_000, wageBudget: 52_000_000, revenue: 150_000_000, rosterIds: [], changes: [] }])), playerStats: {}, movements: [], competitions: { EN1: { leagueId: 'EN1', fixtures: [], round: 38, totalRounds: 38, table: clubs.map((c,i) => ({ clubId: c.id, played: 38, won: 25-i, drawn: 8, lost: 5+i, goalsFor: 80-i, goalsAgainst: 25+i, points: 83-i*3 })) } } },
    national: { country: '대한민국', squad: 'senior', status: 'unselected', reason: '', competitionId: '', competitionName: '', phase: 'friendlies', points: 0, rank: 0, qualified: false, fatigue: 0, reputation: 50, matches: [], history: [], processedWindows: [] },
    economics: {} as ReturnType<typeof createEconomics>, leadership: {} as ReturnType<typeof createLeadership>,
  };
  career.systems.economics = createEconomics(career);
  career.systems.leadership = createLeadership(career);
  return career;
}
function competitor(career: Career, id: string, position: Position, extra: Partial<PlayerStats> = {}, clubId = clubs[0].id): CompetitorSeason {
  const row: CompetitorSeason = { playerId: id, name: id, clubId, leagueId: 'EN1', position, nationality: '영국', ovr: 70, stats: statistics(extra) };
  career.systems!.world.playerStats[id] = row;
  return row;
}
function match(career: Career, round: number): MatchRecord {
  return { id: `match-${round}`, fixtureId: `f-${round}`, round, seasonYear: career.season.year, homeId: clubs[0].id, awayId: clubs[1].id, homeGoals: 1, awayGoals: 0, events: [], playerClubId: career.player.clubId, playerPlayed: true, playerStarted: true, playerMinutes: 90, playerRating: 7, playerStats: statistics({ apps: 1, starts: 1, minutes: 90, ratingCount: 1, ratingSum: 7 }), seed: 'seed', scope: 'club' };
}

test('market valuation reflects performance, age and injury while contract wage stays fixed', () => {
  const c = makeCareer(), e = c.systems!.economics, initial = e.marketValue;
  c.season.playerStats.goals = 32; c.season.playerStats.ratingSum = 270;
  updateMarketValue(c, '시즌 활약');
  assert.ok(e.marketValue > initial);
  assert.equal(e.previousValue, initial); assert.equal(e.peakValue, e.marketValue);
  assert.equal(c.player.wage, 2_000); assert.equal(e.contract.wageAtSigning, 2_000);
  const fitValue = e.marketValue;
  c.player.injuryWeeks = 12; updateMarketValue(c, '장기 부상'); assert.ok(e.marketValue < fitValue);
  assert.equal(e.peakValue, fitValue); assert.equal(e.valueHistory.length, 3);
});

test('52 weeks of fixed salary are paid across a 38-round season; club transfer fees are separate', () => {
  const c = makeCareer();
  for (let r = 0; r < 38; r++) paySalary(c, 52 / 38);
  assert.ok(Math.abs(c.careerIncome - 104_000) < .001);
  assert.ok(Math.abs(c.systems!.economics.salaryIncome - 104_000) < .001);
  payBonus(c, 500); assert.equal(c.systems!.economics.bonusIncome, 500);
  assert.ok(Math.abs(c.careerIncome - 104_500) < .001);
  const offer = makeContractOffers(c, 'offseason').find(o => o.type === 'transfer')!;
  assert.ok(offer && offer.fee > 0);
  const oldIncome = c.careerIncome, oldBudget = c.systems!.world.clubs[offer.clubId].budget;
  applyContract(c, offer);
  assert.equal(c.careerIncome, oldIncome);
  assert.equal(c.systems!.economics.totalTransferFees, offer.fee);
  assert.equal(c.systems!.world.clubs[offer.clubId].budget, oldBudget-offer.fee);
  assert.equal(c.player.wage, offer.wage);
  assert.equal(c.transfers[0].year, 2027);
  assert.equal(c.systems!.economics.contract.signedYear, 2027);
  assert.equal(c.systems!.economics.contract.expiresYear, 2027+offer.years);
  assert.equal(c.systems!.leadership.clubSinceYear, 2027);
  assert.equal(c.systems!.leadership.clubRole, 'none');
});

test('contracts are offered only after the full season and obey actual club budgets', () => {
  const c=makeCareer();c.season.week=19;c.stage='season';
  assert.deepEqual(makeContractOffers(c,'midseason'),[]);assert.deepEqual(makeContractOffers(c,'offseason'),[]);
  c.stage='offseason';c.season.week=c.season.totalWeeks;
  const renewal=makeContractOffers(c,'offseason').find(o=>o.type==='renew')!;
  assert.ok(renewal);assert.equal(renewal.effective,'nextSeason');
  for(const club of Object.values(c.systems!.world.clubs))if(club.id!==c.player.clubId)club.budget=1;
  assert.equal(makeContractOffers(c,'offseason').filter(o=>o.type==='transfer').length,0);
  assert.throws(()=>applyContract(c,{...renewal,wage:1_000_000_000}),/예산/);
});

test('an expired expensive legacy contract can renew on the actual affordable wage', () => {
  const c = makeCareer();
  c.player.wage = 500_000; c.systems!.economics.contract.wageAtSigning = 500_000;
  c.systems!.economics.contract.expiresYear = c.season.year;
  const offer = makeContractOffers(c, 'offseason').find(o => o.type === 'renew')!;
  assert.ok(offer && offer.wage < c.player.wage);
  applyContract(c, offer);
  assert.equal(c.player.wage, offer.wage);
});

test('a highly rated new signing does not become captain; tenure and actual appearances matter', () => {
  const c = makeCareer(); c.player.ovr = 99; c.player.age = 29; c.systems!.leadership.trait = 95;
  c.season.matches = Array.from({ length: 42 }, (_,i) => match(c,i+1));
  updateLeadership(c, 'club', true);
  assert.equal(c.systems!.leadership.clubRole, 'none');
  c.season.year = 2028; c.season.matches.forEach(m => m.seasonYear = 2028);
  c.season.week = 42;
  updateLeadership(c, 'club', true);
  assert.equal(c.systems!.leadership.clubRole, 'none','a proposal is not an automatic appointment');
  const proposal=c.systems!.leadership.offers!.find(o=>o.status==='pending')!;assert.equal(proposal.role,'captain');answerCaptainOffer(c,proposal.id,true);
  assert.equal(c.systems!.leadership.clubRole,'captain');
  assert.equal(c.systems!.leadership.clubMatches, 42);
  assert.equal(c.systems!.leadership.terms[0].apps, 0, 'new appointment does not count earlier appearances as captain');
  c.season.matches.push(match(c,43)); c.season.week = 43;
  updateLeadership(c, 'club');
  assert.equal(c.systems!.leadership.terms[0].apps, 1);
  assert.equal(c.systems!.leadership.nationalRole, 'none');
});

test('eight goals cannot beat an actual teammate with fifteen; awards are idempotent and contain no invented growth trophies', () => {
  const c = makeCareer(); competitor(c, 'teammate', 'ST', { goals: 15 });
  assert.equal(getClubTopScorer(c)?.playerId, 'teammate');
  const awards = evaluateAwards(c);
  assert.ok(!awards.some(a => /골든 부트|성장상|라이징|시즌 베스트/.test(a.name)));
  assert.deepEqual(evaluateAwards(c), awards);
  assert.equal(c.systems!.rankings.length, 1);
  assert.equal(c.awards.length, awards.length);
});

test('Ballon d’Or has thirty unique candidates and World11 has goalkeeper plus required position groups', () => {
  const c = makeCareer();
  const positions: Position[] = ['GK','CB','CM','ST'];
  for (let i=0;i<60;i++) competitor(c, `p${i}`, positions[i%4], { goals: i%4 === 3 ? 30-i%8 : 3, assists: 8, ratingSum: 225+i/3, saves: i%4 === 0 ? 110 : 0, shotsFaced: i%4 === 0 ? 145 : 0, cleanSheets: 14, tackles: 70, interceptions: 45, aerialWon: 55, keyPasses: 40, dribblesCompleted: 40 }, clubs[i%clubs.length].id);
  evaluateAwards(c);
  const ranking = c.systems!.rankings[0];
  assert.equal(ranking.candidates.length, 30);
  assert.equal(new Set(ranking.candidates.map(r => r.playerId)).size, 30);
  assert.ok(ranking.candidates.every((r,i,a) => r.rank === i+1 && (!i || a[i-1].score >= r.score)));
  assert.equal(ranking.world11.length, 11);
  const groups = ranking.world11.map(r => awardPositionGroup(r.position));
  assert.equal(groups.filter(g => g === 'GK').length, 1);
  for (const g of ['DEF','MID','FWD']) assert.ok(groups.filter(v => v === g).length >= 3);
  const nominated = ranking.candidates.some(r => r.playerId === c.player.id);
  assert.equal(ranking.playerRank !== null, nominated);
});

test('award comparison uses performance instead of OVR and league medals require appearances', () => {
  const c = makeCareer(); const good = competitor(c, 'good', 'ST', { goals: 30, ratingSum: 255 });
  const weak = { ...good, ovr: 99, stats: statistics({ goals: 1, ratingSum: 180 }) };
  good.ovr = 50;
  assert.ok(performanceScore(good,c,true) > performanceScore(weak,c,true));
  c.season.playerStats.apps = 4;
  assert.ok(!evaluateAwards(c).some(a => /우승 메달/.test(a.name)));
  const played = makeCareer(); played.season.playerStats.apps = 5;
  assert.ok(evaluateAwards(played).some(a => /우승 메달/.test(a.name)));
});


test('offseason expiration uses the next-season effective year for free transfers and affordable renewal',()=>{
  const c=makeCareer();
  c.player.wage=500_000;c.player.contractYears=0;
  c.systems!.economics.contract.wageAtSigning=500_000;
  c.systems!.economics.contract.expiresYear=c.season.year+1;
  const offers=makeContractOffers(c,'offseason'),renewal=offers.find(o=>o.type==='renew');
  assert.ok(renewal&&renewal.wage<c.player.wage,'expired contract must not block affordable renewal');
  assert.ok(offers.filter(o=>o.type==='transfer').length>0);
  assert.ok(offers.filter(o=>o.type==='transfer').every(o=>o.fee===0),'expired contracts have no club transfer fee');
});

test('captain proposals emit one reasoned event and acceptance records the term exactly once',()=>{
  const c=makeCareer();c.player.age=29;c.systems!.leadership.trait=95;
  c.season.year=2028;c.season.week=42;c.season.matches=Array.from({length:42},(_,i)=>match(c,i+1));
  updateLeadership(c,'club',true);updateLeadership(c,'club',true);
  const proposals=c.systems!.events.filter(e=>e.type==='captain');
  assert.equal(proposals.length,1);assert.match(proposals[0].title,/주장 제의/);
  assert.match(proposals[0].body,/리더십.*근속/);assert.equal(c.systems!.leadership.terms.length,0);
  answerCaptainOffer(c,c.systems!.leadership.offers![0].id,true);
  assert.equal(c.systems!.leadership.terms.length,1);assert.equal(c.systems!.leadership.clubRole,'captain');
  updateLeadership(c,'club',true);assert.equal(c.systems!.leadership.offers!.length,1);
});

test('youth development goals are excluded from the senior club top-scorer record',()=>{
  const c=makeCareer();c.player.squad='youth';c.season.playerStats.goals=90;
  competitor(c,'senior-teammate','ST',{goals:15});
  assert.equal(getClubTopScorer(c),null);
});

test('a youth starter develops leadership through mental ability, age and actual appearances with annual command-independent growth',()=>{
  const makeYoung=()=>{
    const c=makeCareer();c.seed='young-leadership-career';c.player.age=14;
    c.player.attributes={teamwork:45,decisions:45,composure:45,concentration:45};
    c.season.week=0;c.season.index=1;c.season.matches=[];c.season.playerStats=emptyStats();
    c.stage='season';c.systems!.leadership=createLeadership(c);
    for(const [i,leadership] of [72,75,78,80].entries()){
      const id=`established-${i}`;
      c.systems!.world.players[id]={id,name:id,clubId:c.player.clubId,position:'CM',age:32,ovr:75,potential:75,injuryWeeks:0,nationality:'대한민국',leadership};
    }
    return c;
  };
  const annual=makeYoung(),weekly=structuredClone(annual),base=annual.systems!.leadership.trait;
  assert.ok(base<60);
  let eligibleByThirty=false;
  for(let year=0;year<16;year++){
    for(const c of [annual,weekly]){
      c.season.week=35;c.season.matches=Array.from({length:35},(_,i)=>({...match(c,i+1),id:`${c.season.year}:${i+1}`,fixtureId:`${c.season.year}:fixture:${i+1}`}));
      c.season.playerStats=statistics({apps:35,starts:35,minutes:3150,ratingCount:35,ratingSum:245});
      c.history.push({year:c.season.year,clubId:c.player.clubId,clubName:'test',leagueId:'EN1',competitionName:'test',age:c.player.age,position:c.player.position,squad:'senior',rank:3,ovrStart:60,ovrEnd:60,stats:c.season.playerStats,matches:c.season.matches,awards:[],attributeGrowth:{},income:0,completed:true});
      c.season.year++;c.season.index++;c.player.age++;c.season.week=0;c.season.matches=[];c.season.playerStats=emptyStats();
      updateLeadership(c,'club',true);
      const offer=c.systems!.leadership.offers?.find(o=>o.status==='pending');if(offer)answerCaptainOffer(c,offer.id,true);
    }
    for(let command=0;command<36;command++)updateLeadership(weekly,'club');
    assert.equal(weekly.systems!.leadership.trait,annual.systems!.leadership.trait,'command count must not train leadership');
    assert.deepEqual(weekly.systems!.leadership.terms,annual.systems!.leadership.terms);
    assert.ok(annual.systems!.leadership.trait<=base+(year+1)*2.5+.01,'growth cannot exceed the annual cap');
    if(annual.player.age>=25&&annual.systems!.leadership.clubRole!=='none')eligibleByThirty=true;
  }
  assert.ok(eligibleByThirty,'established good performers should compete for leadership between age25 and30');
  assert.ok(annual.systems!.leadership.trait>=70);
  assert.equal(annual.systems!.leadership.baseTrait,base,'original temperament is retained');
  assert.ok(['vice','captain'].includes(annual.systems!.leadership.clubRole),'proven performance competes with senior leadership without an age veto');
  const newSigning=structuredClone(annual);newSigning.systems!.leadership.clubSinceYear=newSigning.season.year;newSigning.systems!.leadership.clubRole='none';newSigning.player.ovr=99;
  updateLeadership(newSigning,'club',true);assert.equal(newSigning.systems!.leadership.clubRole,'none');
});

test('national captain competition normalizes nationality aliases',()=>{
  const c=makeCareer();c.player.nationality='영국';c.player.age=29;c.systems!.national.country='잉글랜드';c.systems!.national.reputation=90;
  c.season.year=2028;c.systems!.leadership.trait=75;c.systems!.leadership.baseTrait=75;c.systems!.leadership.traitUpdatedYear=2028;
  const id='NAT:잉글랜드:senior';
  c.systems!.national.matches=Array.from({length:20},(_,i)=>({...match(c,i+1),id:`national-${i}`,homeId:id,awayId:'NAT:프랑스:senior',playerClubId:id,scope:'national' as const,seasonYear:i<10?2027:2028}));
  for(let i=0;i<4;i++)c.systems!.world.players[`leader-${i}`]={id:`leader-${i}`,name:'leader',clubId:c.player.clubId,position:'CM',age:35,ovr:90,potential:90,injuryWeeks:0,nationality:'잉글랜드',leadership:95};
  updateLeadership(c,'national',true);
  assert.equal(c.systems!.leadership.nationalRole,'none','English aliases must not erase established captain competitors');
});

test('initial contracts and every renewal preserve previous terms and actual signing/expiry dates',()=>{
  const c=makeCareer();c.stage='season';c.season.week=0;
  c.systems!.economics=createEconomics(c);
  const e=c.systems!.economics,initial=structuredClone(e.contractHistory![0]);
  assert.equal(initial.type,'initial');assert.equal(initial.previous,undefined);
  assert.equal(initial.current.signedDate,'2026-07-01');assert.equal(initial.current.expiresDate,'2028-06-30');
  assert.equal(getPreviousContractWage(c),undefined);
  c.season.week=12;
  const renewal={id:'known-old-renewal',clubId:c.player.clubId,type:'renew' as const,wage:c.player.wage+100,years:3,role:'주전',fee:0,reason:'기존 재계약 원장 검증',effective:'now' as const};
  assert.ok(renewal&&renewal.type==='renew');
  const oldWage=c.player.wage,oldIncome=c.careerIncome;
  applyContract(c,renewal);
  assert.equal(e.contractHistory!.length,2);
  assert.deepEqual(e.contractHistory![0],initial,'signing a new contract never rewrites a previous contract');
  const signed=e.contractHistory![1];
  assert.equal(signed.type,'renew');assert.equal(signed.year,2026);assert.equal(signed.round,12);
  assert.deepEqual(signed.previous,initial.current);
  assert.equal(signed.current.wage,renewal.wage);assert.equal(signed.current.clubId,c.player.clubId);
  assert.equal(getPreviousContractWage(c),oldWage);assert.equal(e.contract.previousWage,oldWage);
  assert.ok(signed.current.signedDate!>'2026-07-01');
  assert.equal(e.contract.signedDate,signed.current.signedDate);assert.equal(e.contract.expiresDate,signed.current.expiresDate);
  assert.equal(c.careerIncome,oldIncome);assert.equal(e.totalTransferFees,0);
  const snapshot=JSON.stringify(e.contractHistory);
  applyContract(c,renewal);
  assert.equal(JSON.stringify(e.contractHistory),snapshot,'a repeated accepted offer cannot duplicate contract history');
});

test('successive contracts retain renewal and transfer changes while fees remain club transactions',()=>{
  const c=makeCareer();c.stage='season';c.season.week=10;
  const renewal={id:'known-old-renewal',clubId:c.player.clubId,type:'renew' as const,wage:c.player.wage+100,years:3,role:'주전',fee:0,reason:'기존 재계약 원장 검증',effective:'now' as const};applyContract(c,renewal);
  const e=c.systems!.economics,renewed=structuredClone(e.contractHistory!.at(-1)!.current);
  c.stage='offseason';c.season.week=c.season.totalWeeks;
  const offer=makeContractOffers(c,'offseason').find(row=>row.type==='transfer')!;
  const income=c.careerIncome;applyContract(c,offer);
  assert.equal(e.contractHistory!.length,3);
  const moved=e.contractHistory!.at(-1)!;
  assert.equal(moved.type,'transfer');assert.equal(moved.effective,'nextSeason');assert.equal(moved.year,2026);
  assert.equal(moved.current.signedYear,2027);assert.deepEqual(moved.previous,renewed);
  assert.equal(moved.fee,offer.fee);assert.equal(e.totalTransferFees,offer.fee);assert.equal(c.careerIncome,income);
  const endYear=2027+offer.years;
  assert.equal(moved.current.expiresDate,`${endYear}-06-30`);
  assert.equal(getPreviousContractWage(c),renewed.wage);
});

test('legacy economic upgrades preserve known values and never invent old renewals or a missing season opening value',()=>{
  const c=makeCareer(),e=c.systems!.economics;
  delete e.contractHistory;delete e.seasonStartValue;delete e.seasonStartYear;
  delete e.contract.signedDate;delete e.contract.expiresDate;
  e.valueHistory=[{year:c.season.year,round:12,value:e.marketValue,reason:'기존중간평가'}];
  const wage=c.player.wage,contract=structuredClone(e.contract),value=e.marketValue;
  ensureEconomicHistory(c);ensureEconomicHistory(c);
  assert.equal(e.contractHistory!.length,1);assert.equal(e.contractHistory![0].type,'legacy');
  assert.equal(e.contractHistory![0].previous,undefined);assert.equal(e.contractHistory![0].current.signedDate,undefined);
  assert.deepEqual(e.contract,contract);assert.equal(c.player.wage,wage);assert.equal(e.marketValue,value);
  assert.equal(e.seasonStartValue,undefined);assert.equal(e.seasonStartYear,undefined);assert.equal(getPreviousContractWage(c),undefined);
});

test('opening market value uses recorded round-zero data and stays fixed through later valuations',()=>{
  const c=makeCareer(),e=c.systems!.economics;
  delete e.seasonStartValue;delete e.seasonStartYear;
  const opening=1_234_000;e.valueHistory.unshift({year:c.season.year,round:0,value:opening,reason:'시즌개막'});
  ensureEconomicHistory(c);assert.equal(e.seasonStartValue,opening);assert.equal(e.seasonStartYear,2026);
  c.season.playerStats.goals=40;updateMarketValue(c,'중간성적');
  assert.equal(e.seasonStartValue,opening);
  c.season.year++;c.season.week=0;c.stage='season';
  updateMarketValue(c,'새시즌개막');beginEconomicSeason(c);
  const nextOpening=e.marketValue;
  assert.equal(e.seasonStartValue,nextOpening);assert.equal(e.seasonStartYear,2027);
  c.player.injuryWeeks=12;updateMarketValue(c,'부상');beginEconomicSeason(c);
  assert.equal(e.seasonStartValue,nextOpening,'opening value is not overwritten by later round-zero actions');
});

test('cross-calendar transfer dates use the next real local season while logical contract years remain stable',()=>{
  const c=makeCareer();const target=CLUBS.find(club=>club.leagueId==='KR1')!;
  c.systems!.world.clubs[target.id]={id:target.id,leagueId:'KR1',power:75,depth:70,averageAge:25,injuryImpact:0,budget:100_000_000,wageBudget:52_000_000,revenue:100_000_000,rosterIds:[],changes:[]};
  const offer={id:'calendar-test',clubId:target.id,wage:3000,years:3,role:'주전',fee:1_000_000,reason:'달력전환',type:'transfer' as const,effective:'nextSeason' as const};
  applyContract(c,offer);
  assert.equal(c.systems!.economics.contract.signedYear,2027);
  assert.equal(c.systems!.economics.contract.expiresYear,2030);
  assert.equal(c.systems!.economics.contract.expiresDate,'2030-12-31','a January season cannot start before the European June finish');
});

test('opening a new season carries the last completed performance instead of resetting a proven player to zero games',()=>{
  const c=makeCareer(),e=c.systems!.economics;
  c.season.playerStats=statistics({goals:32,assists:14,ratingSum:270});
  c.season.matches=Array.from({length:38},(_,i)=>match(c,i+1));
  updateMarketValue(c,'완료시즌활약');const provenValue=e.marketValue,wage=c.player.wage;
  c.history.push({year:c.season.year,clubId:c.player.clubId,clubName:'test',leagueId:c.season.leagueId,competitionName:'test',age:c.player.age,position:c.player.position,squad:'senior',rank:1,ovrStart:c.player.ovr,ovrEnd:c.player.ovr,stats:structuredClone(c.season.playerStats),matches:c.season.matches,awards:[],attributeGrowth:{},income:0,completed:true});
  c.season.year++;c.season.week=0;c.stage='season';c.season.playerStats=emptyStats();c.season.matches=[];
  updateMarketValue(c,'새시즌개막');beginEconomicSeason(c);
  assert.equal(e.marketValue,provenValue,'the empty current season must not erase the last completed performance');
  assert.equal(e.seasonStartValue,provenValue);assert.equal(c.player.wage,wage);
  c.season.week=10;updateMarketValue(c,'현시즌미출전');
  assert.ok(e.marketValue<provenValue,'once the season progresses, a lack of current minutes is relevant');
  assert.equal(e.seasonStartValue,provenValue);
});

test('legacy baselines retain an expired contract or already-agreed next-season timing without inventing a renewal',()=>{
  const c=makeCareer(),e=c.systems!.economics;
  e.contract.signedYear=c.season.year+1;e.contract.expiresYear=c.season.year+4;delete e.contractHistory;
  ensureEconomicHistory(c);
  assert.equal(e.contractHistory![0].type,'legacy');assert.equal(e.contractHistory![0].effective,'nextSeason');
  assert.equal(e.contractHistory![0].current.signedYear,c.season.year+1);
  c.player.contractYears=0;
  const expired=createEconomics(c,true);
  assert.equal(expired.contract.expiresYear,c.season.year);
  assert.equal(expired.contractHistory![0].current.years,0);
  assert.equal(expired.contractHistory![0].previous,undefined);
});


test('97 OVR City 25G10A receives a visible evaluation and ability cannot guarantee a Ballon win',()=>{
 const c=makeCareer();c.player.clubId='EN1_13';c.player.ovr=97;c.player.squad='senior';c.season.playerStats=statistics({apps:34,starts:34,minutes:3000,goals:25,assists:10,ratingSum:255,ratingCount:34});
 competitor(c,'stronger-performer','ST',{apps:34,minutes:3000,goals:50,assists:20,ratingSum:320,ratingCount:34},'EN1_12');
 evaluateAwards(c);const r=c.systems!.rankings[0],d=r.diagnostics!.find(d=>d.name==='발롱도르')!;assert.ok(d.eligible);assert.ok(d.detail.includes('경기력 점수'));assert.notEqual(r.playerRank,1);assert.ok(r.playerRank!==null);assert.ok(r.diagnostics!.some(d=>d.scope==='리그만'));
 const lower=structuredClone(c);lower.player.ovr=30;lower.systems!.rankings=[];lower.awards=[];evaluateAwards(lower);assert.equal(lower.systems!.rankings[0].playerRank,r.playerRank);
});
