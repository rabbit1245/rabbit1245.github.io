import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createCareer,overall,advanceCareer,upgradeAbilityModel,setPlaySkill,configureCheats,cheatIncreaseAttribute,setAllAttributeLocks,retireCareer} from './engine';
import {FIELD_ATTRIBUTES,GK_ATTRIBUTES,NEW_FIELD_ATTRIBUTES,POSITION_ATTRIBUTES,PLAY_STYLES} from './attributes';
import {beginGrowthSeason} from './growth';
import {simulateMatch} from './match-engine';
import {getWorldClubPlayers} from './world';
import {getClub} from './data';
import {validateActionLedger} from './action-metrics';
import {extendedEventTotals,extendedCoverage} from './extended-metrics';
import {EXTENDED_COUNTERS,sumStats} from './math';
import {validateCareer,verifySaveText,exportCareer} from './storage';
import {careerMatchLedger,careerRecordTotals,buildCareerText} from './career-text';
import {cardRiskMultiplier} from './discipline';
import type {Career,Position,AttributeKey} from './types';

function fresh(position:Position='ST',rating=80):Career{
 const c=createCareer({name:'확장 능력과 사건 검수',nationality:'대한민국',age:24,height:184,weight:78,foot:'right',position,talent:'SSS',style:PLAY_STYLES[position][0],clubId:'KR2_03',squad:'senior',difficulty:'free',seed:'expanded-engine-2120',training:[]});
 for(const key of position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES)c.player.attributes[key]=rating;c.player.ovr=overall(c.player);c.season.attributeStart={...c.player.attributes};c.season.ovrStart=c.player.ovr;beginGrowthSeason(c);return c;
}
function setup(c:Career,power=80){const f=c.season.fixtures.find(f=>f.homeId===c.player.clubId)!;const squad=(id:string)=>getWorldClubPlayers(c,id).map(p=>({...p,attributes:undefined,ovr:power}));return {f,options:{home:{...getClub(f.homeId),power},away:{...getClub(f.awayId),power},homePlayers:squad(f.homeId),awayPlayers:squad(f.awayId),forceSelection:{from:0,to:90,started:true},detailed:false}};}
test('five new attributes change their own actual match actions while display OVR and opponents are held constant',()=>{
 for(const [key,position,metric]of [['finishing','ST','goals'],['offTheBall','ST','shots'],['pressing','ST','pressingSuccesses'],['tackling','CB','tackles'],['skillMoves','CAM','dribblesCompleted']] as const){
  const c=fresh(position),{f,options}=setup(c),totals=[0,0];
  for(let variant=0;variant<2;variant++)for(let i=0;i<160;i++){
   const copy={...c,seed:`individual-${key}-${i}`,player:{...c.player,attributes:{...c.player.attributes,[key]:variant?100:45}}};
   const m=simulateMatch(copy,f,options);validateActionLedger(m,c.player.id);totals[variant]+=m.playerStats[metric]??0;
  }
  assert.ok(totals[1]>totals[0]*1.1,`${key}: ${totals.join(' → ')}`);
 }
});
test('free-kick/penalty subsets, real big chances and unique recoveries reconcile with their source events',()=>{
 const c=fresh('CAM',95),{f,options}=setup(c),seen={freeKickGoals:0,freeKickAssists:0,penaltyGoals:0,bigChancesCreated:0,unconvertedBigChances:0};
 for(let i=0;i<220;i++){
  const m=simulateMatch({...c,seed:`extended-events-${i}`},f,options);validateActionLedger(m,c.player.id);const totals=extendedEventTotals(m.events);
  for(const p of m.performers!)for(const key of EXTENDED_COUNTERS)assert.equal(p.stats[key],totals.get(p.id)?.[key]??0);
  assert.ok((m.playerStats.freeKickGoals??0)+(m.playerStats.penaltyGoals??0)<=m.playerStats.goals);
  for(const key of ['freeKickGoals','freeKickAssists','penaltyGoals','bigChancesCreated'] as const)seen[key]+=m.playerStats[key]??0;
  seen.unconvertedBigChances+=(m.playerStats.bigChancesCreated??0)-(m.playerStats.bigChanceAssists??0);
  const recovery=m.events.filter(e=>e.type==='recovery');assert.equal(new Set(recovery.map(e=>e.action?.kind==='recovery'?e.action.possessionId:'')).size,recovery.length);
  assert.equal(m.performers!.reduce((n,p)=>n+(p.stats.ballRecoveries??0),0),recovery.length);
 }
 for(const [key,value]of Object.entries(seen))assert.ok(value>0,`${key} must occur from real actions`);
});
test('five actual 120 specialties above a 100 baseline earn pure 120 and mastered 130',()=>{
 let c=fresh('ST',100);c=configureCheats(c,true,true);
 const selected=POSITION_ATTRIBUTES.ST.slice(0,5);
 for(const key of selected){const before=c.player.ovr;c=setPlaySkill(c,key,true);assert.equal(c.player.ovr,before);}
 for(const key of selected){c=cheatIncreaseAttribute(c,key,10);c=cheatIncreaseAttribute(c,key,10);}
 assert.equal(c.player.ovr,130);validateCareer(c);
 c=setPlaySkill(c,selected[0],false);assert.equal(c.player.ovr,124);assert.equal(c.player.attributes[selected[0]],100);validateCareer(c);
 c=setPlaySkill(c,selected[0],true);assert.equal(c.player.ovr,124);assert.equal(c.player.skillMastery![selected[0]],0);
});
test('unselected abilities stop at 100; selected abilities reach 120 and locked gains remain blocked',()=>{
 let c=configureCheats(fresh('ST',100),true,false);c=cheatIncreaseAttribute(c,'finishing',10);assert.equal(c.player.attributes.finishing,100);assert.equal(c.player.skillMastery?.finishing,undefined);
 const before=c.player.ovr;c=setPlaySkill(c,'finishing',true);assert.equal(c.player.ovr,before);c=cheatIncreaseAttribute(c,'finishing',10);assert.equal(c.player.attributes.finishing,110);assert.equal(c.player.skillMastery?.finishing,10);
 c=setAllAttributeLocks(c,true);c=cheatIncreaseAttribute(c,'finishing',10);assert.equal(c.player.skillMastery?.finishing,10);assert.equal(c.player.attributes.finishing,110);validateCareer(c);
});
test('an actual 2.11.7 midseason save upgrades once without changing previous abilities, matches or awards',async()=>{
 const text=gunzipSync(await readFile(new URL('../../tests/fixtures/kball-2117-midseason.json.gz',import.meta.url))).toString('utf8'),old=await verifySaveText(text),before=JSON.stringify({history:old.history,matches:old.season.matches,awards:old.awards,stats:old.season.playerStats}),attributes={...old.player.attributes};
 assert.equal(old.player.abilityVersion,undefined);assert.equal(extendedCoverage(old.season.playerStats).known,false);
 const c=upgradeAbilityModel(old);validateCareer(c);for(const key of Object.keys(attributes) as AttributeKey[])assert.equal(c.player.attributes[key],attributes[key]);assert.ok(NEW_FIELD_ATTRIBUTES.every(k=>Number.isFinite(c.player.attributes[k])));
 assert.equal(JSON.stringify({history:c.history,matches:c.season.matches,awards:c.awards,stats:c.season.playerStats}),before);assert.equal(upgradeAbilityModel(c),c);assert.equal(old.player.abilityVersion,undefined);
 const played=advanceCareer(c,1);validateCareer(played);assert.equal(played.season.matches.at(-1)!.extendedVersion,1);assert.ok((played.season.playerStats.extendedApps??0)<played.season.playerStats.apps);
 const loaded=await verifySaveText(await exportCareer(played));assert.deepEqual(loaded.player,played.player);const out=buildCareerText(loaded);assert.match(out,/프리킥 득점/);assert.match(out,/압박 성공률/);assert.match(out,/도입 전/);assert.doesNotMatch(out,/undefined/);
});
test('a verified old aging report remains exact when only the five introduced baseline keys are added',async()=>{
 const old=await verifySaveText(gunzipSync(await readFile(new URL('../../tests/fixtures/kball-2117-midseason.json.gz',import.meta.url))).toString('utf8'));
 const baseline={...old.season.attributeStart};old.systems!.agingReport={year:old.season.year,startAttributes:{...baseline},endAttributes:{...baseline},changes:{},ovrStart:old.season.ovrStart,ovrEnd:old.season.ovrStart};validateCareer(old);
 const original=JSON.stringify(old.systems!.agingReport),c=upgradeAbilityModel(old);validateCareer(c);assert.equal(JSON.stringify(c.systems!.agingReport),original);
 const resumed=advanceCareer(c,1);validateCareer(resumed);await verifySaveText(await exportCareer(resumed));
 const altered=structuredClone(c);altered.systems!.agingReport!.endAttributes.shooting!++;assert.throws(()=>validateCareer(altered),/능력치|합계/);
});
test('extended match → competition/year → career → Korean TXT totals survive retirement and reload',async()=>{
 let c=advanceCareer(fresh('ST',95),3);validateCareer(c);const ledger=careerMatchLedger(c),all=sumStats([...ledger.club,...ledger.national].map(m=>m.playerStats)),total=careerRecordTotals(c).all;
 for(const key of EXTENDED_COUNTERS)assert.equal(total[key],all[key]);const retired=retireCareer(c),loaded=await verifySaveText(await exportCareer(retired));assert.deepEqual(careerRecordTotals(loaded).all,total);
 const invalidMastery=structuredClone(loaded);invalidMastery.history.at(-1)!.details!.skillMastery={finishing:21};assert.throws(()=>validateCareer(invalidMastery),/숙련/);
 const txt=buildCareerText(loaded);for(const label of ['프리킥 득점','프리킥 도움','페널티킥 득점','결정적 기회 창출','볼 회수','압박 성공률'])assert.ok(txt.includes(label),label);
});
test('card management five is neutral, ten is finite, and active pressing retains real card risk',()=>{
 assert.equal(cardRiskMultiplier(5),1);assert.ok(cardRiskMultiplier(0)>cardRiskMultiplier(2)&&cardRiskMultiplier(2)>1);assert.ok(cardRiskMultiplier(10)>0&&cardRiskMultiplier(10)<1);
 const c=fresh('ST',80);c.player.style='프레싱 포워드';const {f,options}=setup(c),cards=[0,0,0];
 for(let j=0;j<3;j++)for(let i=0;i<400;i++){const m=simulateMatch({...c,seed:`card-neutral-${i}`,systems:{...c.systems!,personality:{leadership:5,stardom:5,clutch:5,winning:5,fairPlay:[0,5,10][j]}}},f,options);cards[j]+=m.playerStats.yellowCards;}
 assert.ok(cards[0]>cards[1]&&cards[1]>cards[2]&&cards[2]>0,cards.join(' / '));
});
