import {cupStats,cupMatches} from './club-competitions';
import test from 'node:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { exportCareer, importCareer, validateCareer } from './storage';
import assert from 'node:assert/strict';
import { CLUBS, getClub } from './data';
import { FIELD_ATTRIBUTES, GK_ATTRIBUTES, PLAY_STYLES, POSITION_LABELS } from './attributes';
import { acceptTransfer, addStats, advanceCareer, calculateTable, createCareer, dismissChoice, emptyStats, getCareerTotals, makeFixtures, overall, retireCareer, setTraining, startNextSeason, stayAtClub } from './engine';
import { simulateMatch } from './match-engine';
import { buildCareerText,careerMatchLedger } from './career-text';
import type { Career, CreateOptions, MatchRecord, PlayerStats, Position, Talent } from './types';

function options(overrides: Partial<CreateOptions> = {}): CreateOptions {
  return {name:'김현우',nationality:'대한민국',age:17,height:178,weight:72,foot:'right',position:'CAM',talent:'A',style:PLAY_STYLES.CAM[0],clubId:'NL1_03',squad:'senior',difficulty:'realistic',seed:'kball-test-v1',...overrides};
}
function freezeDeep<T>(value: T): T {
  if(value&&typeof value==='object') {Object.freeze(value);for(const child of Object.values(value))freezeDeep(child);}
  return value;
}
function seasonDone(career: Career) {
  let next=career;
  for(let steps=0;next.stage==='season';steps++) {
    assert.ok(steps<next.season.totalWeeks+2,'season progression must terminate');
    if(next.systems?.pendingChoice)next=dismissChoice(next);
    const priorWeek=next.season.week;
    next=advanceCareer(next,next.season.totalWeeks-priorWeek);
    assert.ok(next.season.week>priorWeek||next.stage!=='season','season progression cannot stall without a pending decision');
  }
  return next;
}
function sumStats(matches: MatchRecord[]) {return matches.reduce((stats,match)=>addStats(stats,match.playerStats),emptyStats());}
function assertStatsEqual(actual:PlayerStats,expected:PlayerStats) {
  for(const key of Object.keys(expected) as (keyof PlayerStats)[])assert.ok(Math.abs((actual[key]??0)-(expected[key]??0))<1e-6,`${key}: ${actual[key]} !== ${expected[key]}`);
}
function verifyMatch(match: MatchRecord) {
  const goals=match.events.filter(e=>e.type==='goal');
  assert.equal(goals.filter(e=>e.teamId===match.homeId).length,match.homeGoals);
  assert.equal(goals.filter(e=>e.teamId===match.awayId).length,match.awayGoals);
  const byId=new Map(match.events.map(e=>[e.id,e]));
  assert.equal(byId.size,match.events.length);
  for(const goal of goals) {assert.ok(goal.relatedId);const shot=byId.get(goal.relatedId!);assert.equal(shot?.type,'shot');assert.equal(shot?.teamId,goal.teamId);assert.equal(shot?.playerId,goal.playerId);}
  assert.equal(match.playerStats.minutes,match.playerMinutes);
  assert.equal(match.playerStats.apps,match.playerPlayed?1:0);
  assert.ok(match.playerStats.shots>=match.playerStats.shotsOnTarget);
  assert.ok(match.playerStats.shotsOnTarget>=match.playerStats.goals);
  assert.ok(match.playerStats.passesCompleted<=match.playerStats.passes);
  assert.ok(match.playerMinutes>=0&&match.playerMinutes<=90);
}

test('same seed and commands replay exactly without mutating prior snapshots',()=>{
  const start=createCareer(options());
  const snapshot=JSON.stringify(start);
  freezeDeep(start);
  const batch=advanceCareer(start,12);
  let weekly=createCareer(options());
  for(let i=0;i<12;i++)weekly=advanceCareer(weekly,1);
  assert.deepEqual(batch,weekly);
  assert.equal(JSON.stringify(start),snapshot);
  assert.deepEqual(createCareer(options()),createCareer(options()));
  const imported={...createCareer(options()),id:'different-slot-id'};
  const replay=advanceCareer(imported,12);
  assert.deepEqual(replay.season,batch.season,'save-slot identity must not change simulation');
});

test('creation rejects invalid input and defines every field/GK attribute',()=>{
  for(const position of Object.keys(POSITION_LABELS) as Position[]) {
    const career=createCareer(options({position,style:PLAY_STYLES[position][0]}));
    assert.equal(Object.keys(career.player.attributes).length,position==='GK'?10:20);
    assert.equal(career.player.ovr,overall(career.player));
    for(const value of Object.values(career.player.attributes))assert.ok(value!>=1&&value!<=100);
  }
  for(const invalid of [{age:13},{age:36},{height:149},{weight:121},{name:''},{seed:''},{clubId:'missing'},{position:'MISSING'},{talent:'X'},{secondaryPositions:['CAM']}])assert.throws(()=>createCareer(options(invalid as Partial<CreateOptions>)));
  assert.throws(()=>createCareer(options({secondaryPositions:['CB','CB']})));
  assert.throws(()=>createCareer(options({age:25,squad:'youth'})));
});

test('double round robin is balanced, including odd team counts and byes',()=>{
  for(const size of [3,4,5,10,18,20,29]) {
    const ids=Array.from({length:size},(_,i)=>'club_'+i);
    const fixtures=makeFixtures(ids,2026);
    assert.equal(fixtures.length,size*(size-1));
    assert.equal(new Set(fixtures.map(f=>f.id)).size,fixtures.length);
    for(const id of ids) {assert.equal(fixtures.filter(f=>f.homeId===id).length,size-1);assert.equal(fixtures.filter(f=>f.awayId===id).length,size-1);}
    const rounds=[...new Set(fixtures.map(f=>f.round))];
    for(const round of rounds) {const teams=fixtures.filter(f=>f.round===round).flatMap(f=>[f.homeId,f.awayId]);assert.equal(new Set(teams).size,teams.length);}
  }
});

test('selected training dominates bounded experience and development; rest recovers condition',()=>{
  const career=createCareer(options({age:15,squad:'youth',talent:'SSS',training:['shooting','passing']}));
  const prior={...career.player.attributes};
  const after=advanceCareer(career,4);
  const ledger=after.systems!.growthLedger!;
  for(const key of FIELD_ATTRIBUTES) {
    if(['shooting','passing'].includes(key))assert.ok((ledger.byCause.training[key]??0)>0,key);
    else assert.equal(ledger.byCause.training[key]??0,0,`${key}: unselected skills receive no selected training`);
    const recorded=Object.values(ledger.byCause).reduce((sum,cause)=>sum+(cause[key]??0),0);
    assert.ok(Math.abs(after.player.attributes[key]!-prior[key]!-recorded)<.011,`${key}: actual learning reconciles`);
    assert.ok(after.player.attributes[key]!-prior[key]!<5,`${key}: no immediate ability jump`);
  }
  assert.throws(()=>setTraining(career,['passing'],'balanced'),/시즌 중/);
  assert.throws(()=>createCareer(options({training:['gkHandling']})));
  assert.throws(()=>createCareer(options({training:['passing','passing']})));
  const resting=createCareer(options({intensity:'rest'}));resting.player.fitness=30;
  const rested=advanceCareer(resting,1);
  assert.ok(rested.player.fitness>resting.player.fitness);
  assert.deepEqual(rested.systems!.growthLedger!.byCause.training,{});
});

test('match goal events, personal statistics and full league standings reconcile',()=>{
  let career=createCareer(options({position:'ST',style:PLAY_STYLES.ST[0],age:24}));
  for(const key of FIELD_ATTRIBUTES)career.player.attributes[key]=84;
  career.player.ovr=overall(career.player);
  career=seasonDone(career);
  assert.equal(career.stage,'offseason');assert.equal(career.history.length,1);
  for(const match of career.season.matches)verifyMatch(match);
  assertStatsEqual(career.season.playerStats,sumStats(career.season.matches));
  assertStatsEqual(career.history[0].stats,sumStats(career.history[0].matches));
  assert.deepEqual(career.history[0].details!.table,career.season.table);
  assert.deepEqual(career.history[0].details!.attributes,career.player.attributes);
  assertStatsEqual(getCareerTotals(career,'club'),addStats({...career.history[0].stats},cupStats(career)));
  assert.ok(career.season.fixtures.every(f=>f.played));
  const table=calculateTable(career.season.fixtures,career.season.table.map(r=>r.clubId));
  assert.deepEqual(table,career.season.table);
  assert.equal(table.reduce((n,r)=>n+r.goalsFor,0),table.reduce((n,r)=>n+r.goalsAgainst,0));
  for(const row of table) {assert.equal(row.played,row.won+row.drawn+row.lost);assert.equal(row.points,row.won*3+row.drawn);assert.equal(row.played,table.length*2-2);}
  assert.deepEqual(advanceCareer(career,1),career,'completed seasons cannot advance or archive twice');
});

test('six distinct external offers, signing, contract renewal and new league work',()=>{
  const complete=seasonDone(createCareer(options()));
  const offers=complete.offers.filter(o=>o.type==='transfer');
  assert.equal(offers.length,6);assert.equal(new Set(offers.map(o=>o.clubId)).size,6);
  assert.ok(offers.every(o=>o.clubId!==complete.player.clubId));
  assert.throws(()=>acceptTransfer(createCareer(options()),offers[0].id));
  const originalClub=complete.player.clubId;
  const signed=acceptTransfer(complete,offers[0].id);
  assert.equal(complete.player.clubId,originalClub);
  assert.equal(signed.player.clubId,offers[0].clubId);assert.equal(signed.transfers.length,1);
  assert.equal(signed.history[0].clubId,originalClub);
  assert.throws(()=>acceptTransfer(signed,offers[1].id));
  const next=startNextSeason(setTraining(signed,signed.training,signed.intensity));
  assert.equal(next.player.age,complete.player.age+1);
  assert.equal(next.season.year,complete.season.year+1);
  assert.equal(next.season.leagueId,next.systems!.world.clubs[offers[0].clubId].leagueId);
  assert.equal(next.season.week,0);assert.equal(next.history.length,1);
  const expired={...complete,player:{...complete.player,contractYears:0}};
  const renewed=stayAtClub(expired);
  assert.ok(renewed.player.contractYears>0);assert.equal(renewed.player.clubId,originalClub);assert.equal(renewed.transfers.length,0);
});

test('GK records saves without striker output; position performance differs over many matches',()=>{
  const outputs:Record<string,{apps:number;goals:number;saves:number;goalsAgainst:number}>={};
  for(const position of ['GK','CB','CAM','ST'] as Position[]) {
    const totals=emptyStats();
    const career=createCareer(options({position,style:PLAY_STYLES[position][0],age:25}));
    for(const key of position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES)career.player.attributes[key]=90;
    career.player.ovr=overall(career.player);career.managerTrust=90;
    const fixture=career.season.fixtures.find(f=>f.homeId===career.player.clubId||f.awayId===career.player.clubId)!;
    const samples=position==='GK'?1000:100;
    for(let seed=0;seed<samples;seed++) {
      const match=simulateMatch({...career,seed:`distribution-${seed}`},fixture,{forceSelection:{from:0,to:90,started:true}});
      addStats(totals,match.playerStats);verifyMatch(match);
    }
    outputs[position]={apps:totals.apps,goals:totals.goals,saves:totals.saves,goalsAgainst:totals.goalsConceded};
  }
  // Keep the same <=1% scoring-rate ceiling over a larger sample. A single
  // 100-game seed slice is too noisy to classify a rare event after roster changes.
  assert.ok(outputs.GK.saves>800);assert.ok(outputs.GK.goals<=outputs.GK.apps*.01,JSON.stringify(outputs));
  assert.ok(outputs.ST.goals>outputs.CB.goals*2,JSON.stringify(outputs));
  assert.ok(outputs.ST.goals>outputs.CAM.goals,JSON.stringify(outputs));
  assert.equal(outputs.ST.apps,100);
});

test('30 seasons preserve history, finite stats, youth promotion, age progression and retirement totals',{skip:process.env.KBALL_SKIP_LONG_TEST==='1'},async()=>{
  // A previously computed checkpoint can repeat persistence checks without resimulating the world.
  const checkpointFile=process.env.KBALL_LONG_CHECKPOINT;
  const checkpoint=checkpointFile?JSON.parse(await readFile(checkpointFile,'utf8')) as {career:Career;highestOvr:number}:undefined;
  let career=checkpoint?.career??createCareer(options({age:14,squad:'youth',talent:'SSS',seed:'long-career'}));
  let highestOvr=checkpoint?.highestOvr??career.player.ovr;
  const completed=career.history.length;
  if(checkpoint){validateCareer(career);for(const season of career.history){assertStatsEqual(season.stats,sumStats(season.matches));for(const match of season.matches)verifyMatch(match);}}
  if(completed>0&&completed<30&&career.stage==='offseason')career=startNextSeason(setTraining(stayAtClub(career),career.training,career.intensity));
  await mkdir('test-results',{recursive:true});
  for(let year=completed;year<30;year++) {
    career=seasonDone(career);
    assert.equal(career.history.length,year+1);
    assertStatsEqual(career.history[year].stats,sumStats(career.history[year].matches));
    highestOvr=Math.max(highestOvr,career.player.ovr);
    await writeFile('test-results/v26-long-career-checkpoint.json',JSON.stringify({career,highestOvr}));
    validateCareer(career);
    console.log(`Long career verified: ${year+1}/30 seasons, ${career.player.age} years old`);
    if(year<29)career=startNextSeason(setTraining(stayAtClub(career),career.training,career.intensity));
  }
  assert.equal(career.player.age,43);assert.equal(career.player.squad,'senior');
  assert.ok(career.player.ovr>=1&&career.player.ovr<=100,'no automatic age decline is required');
  const beforeRetirement=getCareerTotals(career);
  const retired=retireCareer(career);
  assertStatsEqual(getCareerTotals(retired),beforeRetirement);
  assert.equal(retired.stage,'retired');assert.equal(retired.history.length,30);
  const file=await exportCareer(retired);
  await mkdir('test-results',{recursive:true});
  await writeFile('test-results/v26-long-career-30-seasons.json',file);
  const text=buildCareerText(retired),ledger=careerMatchLedger(retired);
  await writeFile('test-results/v26-long-career-30-seasons.txt',text,'utf8');
  assert.equal(text.charCodeAt(0),0xfeff);assert.ok(!/(?<!\r)\n/.test(text));
  assert.equal((text.match(/\[\d{4}시즌\]/g)??[]).length,30);
  for(const season of retired.history){assert.ok(text.includes(`[${season.year}시즌]`));if(!checkpoint||checkpoint.career.history.every((h:Career['history'][number])=>h.details))assert.ok(season.details,`${season.year}: new seasons preserve standings and contract snapshots`);}
  assert.equal(ledger.club.length,retired.history.reduce((sum,h)=>sum+h.matches.length,0)+cupMatches(retired).length);
  console.log(`Long TXT verified: ${Buffer.byteLength(text)} bytes, ${ledger.club.length} club and ${ledger.national.length} national matches`);
  const imported=await importCareer(file);
  assert.deepEqual(imported.history,JSON.parse(JSON.stringify(retired.history)));
  assert.deepEqual(imported.systems,JSON.parse(JSON.stringify(retired.systems)));
  assertStatsEqual(getCareerTotals(imported),beforeRetirement);
  const expected=retired.history.reduce((stats,row)=>addStats(stats,row.stats),cupStats(retired));
  assertStatsEqual(getCareerTotals(retired,'club'),expected);
  assert.deepEqual(retireCareer(retired),retired);
  assert.deepEqual(advanceCareer(retired,1),retired);
  for(const value of Object.values(getCareerTotals(retired)))assert.ok(Number.isFinite(value)&&value>=0);
});

test('retirement during a season archives the partial ledger exactly once',()=>{
  const partial=advanceCareer(createCareer(options()),7);
  const retired=retireCareer(partial);
  assert.equal(retired.history.length,1);assert.equal(retired.history[0].completed,false);
  assertStatsEqual(getCareerTotals(retired,'club'),addStats({...partial.season.playerStats},cupStats(partial)));
  assert.equal(retireCareer(retired).history.length,1);
});

test('a future effective transfer cannot leave an earlier retirement in the career ledger',()=>{
  const complete=seasonDone(createCareer(options({age:24,seed:'pending-transfer-retire'})));
  const offer=complete.offers.find(offer=>offer.type==='transfer')!;
  const signed=acceptTransfer(complete,offer.id);
  assert.ok(signed.transfers[0].year>signed.season.year);
  assert.throws(()=>retireCareer(signed),/다음 시즌/);
  const retired=retireCareer(startNextSeason(setTraining(signed,signed.training,signed.intensity)));
  assert.equal(retired.stage,'retired');
  assert.ok(retired.transfers.every(transfer=>transfer.year<=retired.retiredYear!));
  assert.equal(retired.history.length,1,'retiring before the new first match must not fabricate a season');
  assertStatsEqual(getCareerTotals(retired,'club'),addStats({...complete.history[0].stats},cupStats(complete)));
});

test('personal actions and clean sheets use the actual on-pitch interval',()=>{
  const career=createCareer(options({position:'GK',style:PLAY_STYLES.GK[0],age:25,talent:'S',height:190,weight:80,seed:'keeper-clean-v2'}));
  for(const key of GK_ATTRIBUTES)career.player.attributes[key]=90;
  career.player.ovr=overall(career.player);career.managerTrust=90;
  const fixture=career.season.fixtures.find(f=>f.homeId===career.player.clubId||f.awayId===career.player.clubId)!;
  let substitutedCleanSheet=false;
  for(let seed=0;seed<160;seed++) {
    const match=simulateMatch({...career,seed:`keeper-interval-${seed}`},fixture,{forceSelection:{from:0,to:60,started:true}});
    if(!match.playerPlayed)continue;
    const from=match.playerStarted?0:match.events.find(event=>event.type==='substitution'&&event.playerId===career.player.id&&event.detail.includes('투입'))!.minute;
    const to=from+match.playerMinutes;
    for(const event of match.events.filter(event=>event.playerId===career.player.id&&['shot','goal','save','assist'].includes(event.type)))assert.ok(event.minute>from&&event.minute<=to,'players cannot act before entering or after leaving');
    const opponentGoals=match.events.filter(event=>event.type==='goal'&&event.teamId!==match.playerClubId);
    const conceded=opponentGoals.filter(event=>event.minute>from&&event.minute<=to).length;
    assert.equal(match.playerStats.goalsConceded,conceded);
    assert.equal(match.playerStats.cleanSheets,match.playerMinutes>=60&&conceded===0?1:0);
    if(match.playerMinutes>=60&&conceded===0&&opponentGoals.length>0)substitutedCleanSheet=true;
  }
  assert.ok(substitutedCleanSheet,'regression fixture must include a goal conceded after the player was substituted');
});

test('absolute OVR and seeds stay independent of team selection',()=>{
  const first=createCareer(options());
  const second=createCareer(options({clubId:CLUBS.find(c=>c.id!==first.player.clubId)!.id}));
  assert.deepEqual(first.player.attributes,second.player.attributes);
  assert.equal(first.player.ovr,second.player.ovr);
});
