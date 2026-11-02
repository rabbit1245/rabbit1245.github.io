import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {attributeWeights,expanded2120Weights,expanded2120Overall,overall,FIELD_ATTRIBUTES,GK_ATTRIBUTES,POSITION_LABELS,PLAY_STYLES,attributeImportance} from './attributes';
import {upgradeAbilityModel,createCareer,advanceCareer} from './engine';
import {seasonOVRChange} from './ability-expansion';
import {marketDeclineEvidence} from './market-value';
import {beginGrowthSeason} from './growth';
import {validateCareer,verifySaveText,exportCareer} from './storage';
import type {Position,AttributeKey} from './types';
const profiles=Object.keys(POSITION_LABELS).flatMap(p=>PLAY_STYLES[p as Position].map(style=>({position:p as Position,style})));
const uniform=(position:Position,value:number)=>Object.fromEntries((position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES).map(k=>[k,value]));
test('all 160 profiles bound every attribute contribution, preserve specialization and normalize to one',()=>{
 assert.equal(profiles.length,160);let count=0;
 for(const {position,style}of profiles){const w=attributeWeights(position,style),values=Object.values(w) as number[];
  assert.ok(Math.abs(values.reduce((a,b)=>a+b,0)-1)<1e-12);assert.equal(values.length,position==='GK'?10:25);
  assert.ok(Math.min(...values)>=(position==='GK'?.06:.03));assert.ok(Math.max(...values)<=(position==='GK'?.16:.09));
  assert.ok(Math.max(...values)>Math.min(...values)*1.4,'roles still have distinct priorities');
  for(const weight of values){assert.ok(weight*50>1.5);count++;}
  if(position!=='GK')assert.ok(w.stamina!>=.05,`${position}/${style}: shared endurance`);
 }
 assert.equal(count,3850);assert.ok(Math.abs(expanded2120Weights('ST','포처').stamina!-.016774193548387096)<1e-12);
});
test('raising any field ability by fifty adds at least two displayed OVR; striker stamina adds three',()=>{
 for(const {position,style}of profiles){const p={position,style,attributes:uniform(position,50)};assert.equal(overall(p),50);
  for(const key of Object.keys(p.attributes) as AttributeKey[]){const up={...p,attributes:{...p.attributes,[key]:100}};assert.ok(overall(up)-overall(p)>=(position==='GK'?3:2),`${position}/${style}/${key}`);}
 }
 const p={position:'ST' as const,style:'포처',attributes:uniform('ST',50)};assert.equal(overall({...p,attributes:{...p.attributes,stamina:100}})-overall(p),3);
});
test('uniform global ratings, five-skill earned ceiling and importance order remain coherent across every style',()=>{
 for(const {position,style}of profiles){const keys=position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES;
  for(const level of [50,75,90,100,110,120])assert.equal(overall({position,style,attributes:uniform(position,level)}),level);
  const playSkills=keys.slice(0,5),p={position,style,attributes:uniform(position,120),playSkills};assert.equal(overall(p),120);assert.equal(overall({...p,skillMastery:Object.fromEntries(playSkills.map(k=>[k,20]))}),130);
  const w=attributeWeights(position,style),arrows=attributeImportance(position,style),sorted=Object.entries(w).sort((a,b)=>a[1]!-b[1]!);for(let i=1;i<sorted.length;i++)assert.ok(arrows[sorted[i][0] as AttributeKey]!>=arrows[sorted[i-1][0] as AttributeKey]!);
 }
});
test('real 2.12.0 save validates before a one-time reweight, preserving raw abilities, mastery and all existing records',async()=>{
 const old=await verifySaveText(gunzipSync(await readFile(new URL('../../tests/fixtures/kball-2120-midseason.json.gz',import.meta.url))).toString('utf8'));
 assert.equal(old.player.ovrVersion,undefined);assert.equal(old.player.ovr,expanded2120Overall(old.player));const prior=JSON.stringify(old),next=upgradeAbilityModel(old);
 assert.equal(JSON.stringify(old),prior);assert.equal(next.player.ovrVersion,2);assert.equal(next.player.ovr,overall(next.player));assert.deepEqual(next.player.attributes,old.player.attributes);assert.deepEqual(next.player.skillMastery,old.player.skillMastery);assert.deepEqual(next.player.playSkills,old.player.playSkills);
 for(const key of ['history','awards','transfers'] as const)assert.deepEqual(next[key],old[key]);assert.deepEqual(next.season.matches,old.season.matches);assert.deepEqual(next.season.playerStats,old.season.playerStats);assert.deepEqual(next.systems!.economics,old.systems!.economics);
 assert.equal(next.season.ovrStart,old.season.ovrStart);assert.equal(seasonOVRChange(next),old.player.ovr-old.season.ovrStart);assert.equal(upgradeAbilityModel(next),next);validateCareer(next);
 const resumed=advanceCareer(next,1);validateCareer(resumed);const loaded=await verifySaveText(await exportCareer(resumed));assert.deepEqual(loaded.player,resumed.player);
 const bad=structuredClone(loaded);(bad.player as any).ovrVersion=3;assert.throws(()=>validateCareer(bad),/버전/);
});
test('model conversion alone never creates long-term ability-decline pressure or changes a signed contract',()=>{
 const c=createCareer({name:'점수 척도 검수',nationality:'대한민국',age:26,height:180,weight:78,foot:'right',position:'ST',talent:'SSS',style:'포처',clubId:'EN1_12',squad:'senior',difficulty:'realistic',seed:'weights-market-2121',training:[]});
 c.player.ovrVersion=undefined;c.season.ovrVersion=undefined;c.player.attributes=uniform('ST',40);for(const k of ['finishing','offTheBall','shooting','positioning','composure','heading','anticipation','skillMoves'] as const)c.player.attributes[k]=100;
 c.player.ovr=expanded2120Overall(c.player);c.season.ovrStart=c.player.ovr;c.season.attributeStart={...c.player.attributes};beginGrowthSeason(c);c.systems!.economics.assessment={abilityVersion:2,ability:c.player.ovr,year:c.season.year,round:0,totalRounds:c.season.totalWeeks,injuryWeeks:0,stardom:5};
 const next=upgradeAbilityModel(c);assert.ok(c.player.ovr-next.player.ovr>8);assert.equal(marketDeclineEvidence(next).severity,0);assert.equal(seasonOVRChange(next),0);assert.deepEqual(next.systems!.economics,c.systems!.economics);
});
