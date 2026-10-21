import test from 'node:test';
import assert from 'node:assert/strict';
import { createCareer,previewPlayer,setTraining,startNextSeason,emptyStats } from './engine';
import { FIELD_ATTRIBUTES,PLAY_STYLES } from './attributes';
import { applyMatchExperience,beginGrowthSeason,ensureGrowthTracking,trainRound,trainingQuality } from './growth';
import type { Career,CreateOptions } from './types';

const options=(extra:Partial<CreateOptions>={}):CreateOptions=>({name:'성장 검증',nationality:'대한민국',age:17,height:178,weight:72,foot:'right',position:'CAM',talent:'SSS',style:PLAY_STYLES.CAM[0],clubId:'KR1_01',squad:'youth',difficulty:'realistic',seed:'growth-ledger',training:['shooting','passing'],...extra});
function reconcile(career:Career){
  const ledger=ensureGrowthTracking(career);
  for(const key of FIELD_ATTRIBUTES){
    const change=Object.values(ledger.byCause).reduce((sum,cause)=>sum+(cause[key]??0),0);
    assert.ok(Math.abs(career.player.attributes[key]!-ledger.baselineAttributes[key]!-change)<.011,`${key}: every actual change has one cause`);
  }
}

test('creation preview uses the exact final seed, values, OVR and potential',()=>{
  const input=options();
  const preview=previewPlayer(input);
  assert.deepEqual(createCareer(input).player,preview);
  assert.deepEqual(previewPlayer({...input,training:['speed'],intensity:'rest'}),preview,'choosing a plan must not reroll the player');
});

test('selected training dominates bounded maturation and all changes reconcile by cause',()=>{
  const career=createCareer(options());
  for(let week=1;week<=career.season.totalWeeks;week++){career.season.week=week;trainRound(career);}
  const ledger=ensureGrowthTracking(career);
  assert.ok(ledger.byCause.training.shooting!>2);
  assert.ok(ledger.byCause.training.passing!>2);
  assert.ok((ledger.byCause.development.decisions??0)>0);
  for(const key of FIELD_ATTRIBUTES)if(!career.training.includes(key))assert.ok(career.player.attributes[key]!-ledger.baselineAttributes[key]!<=.121,key);
  assert.deepEqual(ledger.byCause.experience,{});
  reconcile(career);
});

test('actual minutes and actions give bounded experience while non-participants gain none',()=>{
  const career=createCareer(options());const before={...career.player.attributes};
  applyMatchExperience(career,{...emptyStats(),passesCompleted:30,keyPasses:2});
  assert.deepEqual(career.player.attributes,before);
  for(let game=0;game<150;game++)applyMatchExperience(career,{...emptyStats(),apps:1,minutes:90,passesCompleted:30,keyPasses:2});
  const ledger=ensureGrowthTracking(career);
  assert.equal(ledger.byCause.experience.passing,.35);
  assert.equal(ledger.byCause.experience.vision,.35);
  assert.equal(ledger.byCause.experience.decisions,.35);
  assert.deepEqual(ledger.byCause.training,{});
  reconcile(career);
});

test('facilities and actual club minutes affect selected growth under identical seeds',()=>{
  const start=createCareer(options()),low=structuredClone(start),high=structuredClone(start),minutes=structuredClone(start);
  for(const career of[low,high,minutes])career.season.week=10;
  low.systems!.world.clubs[low.player.clubId].revenue=250_000;low.systems!.world.clubs[low.player.clubId].depth=0;
  high.systems!.world.clubs[high.player.clubId].revenue=500_000_000;high.systems!.world.clubs[high.player.clubId].depth=100;
  minutes.systems!.world.clubs[minutes.player.clubId]={...high.systems!.world.clubs[high.player.clubId]};minutes.season.playerStats.minutes=900;
  assert.ok(trainingQuality(high)>trainingQuality(low));
  for(const career of[low,high,minutes])trainRound(career);
  assert.ok(high.player.attributes.shooting!>low.player.attributes.shooting!);
  assert.ok(minutes.player.attributes.shooting!>high.player.attributes.shooting!);
  for(const career of[low,high,minutes])reconcile(career);
});

test('a sustained injury reduces training and records bounded physical loss separately',()=>{
  const healthy=createCareer(options()),injured=structuredClone(healthy);injured.player.injuryWeeks=8;
  for(let week=1;week<=30;week++)for(const career of[healthy,injured]){career.season.week=week;trainRound(career);}
  const a=ensureGrowthTracking(healthy),b=ensureGrowthTracking(injured);
  assert.ok(b.byCause.training.shooting!<a.byCause.training.shooting!);
  assert.equal(b.injuredRounds,30);assert.equal(b.byCause.injury.speed,-.2);assert.equal(b.byCause.injury.stamina,-.2);
  assert.deepEqual(a.byCause.injury,{});reconcile(healthy);reconcile(injured);
});

test('legacy growth starts at the known present and does not attribute an unknown past',()=>{
  const career=createCareer(options());career.season.week=8;career.player.attributes.passing!+=2;
  delete career.systems!.growthLedger;
  const ledger=ensureGrowthTracking(career);
  assert.equal(ledger.legacy,true);assert.equal(ledger.trackedFromRound,8);assert.equal(ledger.baselineAttributes.passing,career.player.attributes.passing);
  assert.ok(Object.values(ledger.byCause).every(cause=>Object.keys(cause).length===0));
  career.season.week++;trainRound(career);reconcile(career);
});

test('annual plans confirm once in offseason and aging has its own transition report',()=>{
  const career=createCareer(options({age:34,squad:'senior'}));
  assert.throws(()=>setTraining(career,['passing'],'balanced'),/시즌 중/);
  career.stage='offseason';career.season.week=career.season.totalWeeks;career.season.completed=true;
  career.transferDecision='stay';career.systems!.trainingPlan={forYear:2027,confirmed:false,confirmedAtRound:career.season.week,source:'offseason'};
  assert.throws(()=>startNextSeason(career),/훈련 계획/);
  const confirmed=setTraining(career,['speed'],'balanced');
  assert.equal(career.systems!.trainingPlan.confirmed,false,'commands preserve the prior snapshot');
  assert.throws(()=>setTraining(confirmed,['passing'],'intense'),/이미 확정/);
  const next=startNextSeason(confirmed),aging=next.systems!.agingReport!;
  assert.equal(aging.year,next.season.year);assert.deepEqual(aging.startAttributes,confirmed.player.attributes);
  assert.deepEqual(aging.endAttributes,next.season.attributeStart);
  assert.ok(aging.changes.speed!<0);assert.ok(aging.ovrEnd<=aging.ovrStart,'rounded OVR may stay the same despite a fractional decline');
  assert.deepEqual(next.systems!.growthLedger!.baselineAttributes,next.player.attributes);
  assert.ok(Object.values(next.systems!.growthLedger!.byCause).every(cause=>Object.keys(cause).length===0),'offseason aging is not counted twice as in-season loss');
  assert.equal(next.systems!.trainingPlan!.confirmed,true);assert.deepEqual(next.training,['speed']);
  beginGrowthSeason(next);reconcile(next);
});
