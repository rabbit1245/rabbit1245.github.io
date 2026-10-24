import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createCareer,setTraining,startNextSeason,setAttributeLock,setAllAttributeLocks,manuallyAge,configureCheats,cheatIncreaseAttribute,overall} from './engine';
import {executeCommand} from './commands';
import {trainRound,applyMatchExperience} from './growth';
import {PLAY_STYLES,FIELD_ATTRIBUTES,GK_ATTRIBUTES} from './attributes';
import {emptyStats} from './math';
import {exportCareer,importCareer,validateCareer} from './storage';
import type {AttributeKey,Position,Career} from './types';

if(!globalThis.crypto?.subtle)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
const fresh=(position:Position='ST',training:AttributeKey[]=[])=>createCareer({name:'선택 성장 검증',nationality:'대한민국',age:17,height:180,weight:73,foot:'right',position,talent:'SSS',style:PLAY_STYLES[position][0],clubId:'NL1_04',squad:'senior',difficulty:'realistic',seed:`selected-only:${position}`,training});
const match={...emptyStats(),apps:1,starts:1,minutes:90,ratingCount:1,ratingSum:9,passesCompleted:50,keyPasses:5,shotsOnTarget:6,saves:12,tackles:8,interceptions:4,dribblesCompleted:6};
function round(c:Career,count:number){for(let i=1;i<=count;i++){c.season.week=i;trainRound(c);applyMatchExperience(c,match);}}

test('zero selected attributes forbid all automatic gains despite youth, talent and strong match actions',()=>{
 for(const pos of ['ST','GK'] as const){const c=fresh(pos),before={...c.player.attributes};round(c,30);
  assert.deepEqual(c.player.attributes,before);for(const cause of ['training','experience','development'] as const)assert.deepEqual(c.systems!.growthLedger!.byCause[cause],{});
 }
});

test('only checked field/GK attributes can gain training, experience or maturation',()=>{
 for(const pos of ['ST','GK'] as const){const key:AttributeKey=pos==='ST'?'shooting':'gkReflexes',c=fresh(pos,[key]),before={...c.player.attributes};round(c,30);
  assert.ok(c.player.attributes[key]!>before[key]!);
  for(const [k,v]of Object.entries(before))if(k!==key)assert.equal(c.player.attributes[k as AttributeKey],v,k);
  assert.ok((c.systems!.growthLedger!.byCause.experience[key]??0)>0);
 }
 const mental=fresh('ST',['decisions']);round(mental,12);assert.ok(mental.systems!.growthLedger!.byCause.development.decisions!>0);
});

test('an empty offseason plan is valid and an unconfirmed plan starts the next season without carrying old selections',()=>{
 const c=fresh('ST',['shooting']);c.stage='offseason';c.season.week=c.season.totalWeeks;c.season.completed=true;c.transferDecision='stay';
 c.systems!.trainingPlan={forYear:c.season.year+1,confirmed:false,confirmedAtRound:c.season.week,source:'offseason'};
 const before={...c.player.attributes},confirmed=setTraining(c,[],'balanced'),a=startNextSeason(confirmed),b=startNextSeason(c);
 for(const next of [a,b]){assert.equal(next.stage,'season');assert.deepEqual(next.training,[]);assert.equal(next.systems!.trainingPlan!.confirmed,true);assert.deepEqual(next.player.attributes,before);round(next,10);assert.deepEqual(next.player.attributes,before);}
 assert.deepEqual(c.training,['shooting']);assert.equal(c.systems!.trainingPlan.confirmed,false);
 const legacy=structuredClone(c);delete legacy.systems!.trainingPlan;assert.deepEqual(startNextSeason(legacy).training,[]);
 legacy.systems!.trainingPlan={forYear:c.season.year+1,confirmed:true,confirmedAtRound:c.season.week,source:'legacy'};assert.deepEqual(startNextSeason(legacy).training,[]);
});

test('whole-player locks toggle atomically, retain partial locks before commands, and persist through saves',async()=>{
 for(const pos of ['ST','GK'] as const){const allowed=pos==='ST'?FIELD_ATTRIBUTES:GK_ATTRIBUTES,base=setAttributeLock(fresh(pos),allowed[0],true),before=JSON.stringify(base);
  const all=executeCommand(base,{type:'attributeLockAll',locked:true},`lock-all:${pos}`);assert.equal(JSON.stringify(base),before);assert.deepEqual(all.systems!.attributeLocks,allowed);
  assert.equal(executeCommand(all,{type:'attributeLockAll',locked:true},`lock-all:${pos}`),all);
  const loaded=await importCareer(await exportCareer(all));assert.deepEqual(loaded.systems!.attributeLocks,allowed);
  const unlocked=setAllAttributeLocks(loaded,false);assert.deepEqual(unlocked.systems!.attributeLocks,[]);assert.deepEqual(unlocked.player.attributes,all.player.attributes);validateCareer(unlocked);
 }
});

test('manual aging overrides locks without unlocking or enabling automatic recovery and remains in the ledger',async()=>{
 for(const pos of ['ST','GK'] as const){const key:AttributeKey=pos==='ST'?'shooting':'gkReflexes',c=setAllAttributeLocks(fresh(pos,[key]),true),before={...c.player.attributes};
  let aged=manuallyAge(c,5,key);assert.equal(aged.player.attributes[key],Math.max(0,before[key]!-5));assert.deepEqual(aged.systems!.attributeLocks,c.systems!.attributeLocks);assert.equal(aged.player.ovr,overall(aged.player));
  for(const [k,v]of Object.entries(before))if(k!==key)assert.equal(aged.player.attributes[k as AttributeKey],v);
  assert.equal(aged.systems!.growthLedger!.byCause.aging[key],-5);validateCareer(aged);
  aged=await importCareer(await exportCareer(aged));const adjusted={...aged.player.attributes};round(aged,12);assert.deepEqual(aged.player.attributes,adjusted);
  const cheat=cheatIncreaseAttribute(configureCheats(aged,true,false),key,10);assert.deepEqual(cheat.player.attributes,adjusted);
 }
});

test('manual aging floors a locked ability at zero and unlocking never restores discarded growth',()=>{
 let c=setAllAttributeLocks(fresh('ST',['shooting']),true);
 for(let i=0;i<10;i++)c=manuallyAge(c,10,'shooting');assert.equal(c.player.attributes.shooting,0);
 round(c,12);assert.equal(c.player.attributes.shooting,0);const unlocked=setAllAttributeLocks(c,false);assert.equal(unlocked.player.attributes.shooting,0);
});
