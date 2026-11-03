import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createCareer,upgradeAbilityModel,setPlaySkill,configureCheats,cheatIncreaseAttribute,changePosition,setAllAttributeLocks,manuallyAge,advanceCareer,retireCareer} from './engine';
import {FIELD_ATTRIBUTES,GK_ATTRIBUTES,PLAY_STYLES,POSITION_LABELS,attributeWeights,overall,overallParts,expanded2121Overall} from './attributes';
import {validatePlaySkills} from './play-skill-validation';
import {attributeCap} from './play-skills';
import {actionAbility} from './match-actions';
import {beginGrowthSeason} from './growth';
import {seasonOVRChange} from './ability-expansion';
import {marketDeclineEvidence,comparableRecordedAbility} from './market-value';
import {validateCareer,verifySaveText,exportCareer} from './storage';
import {careerRecordTotals,buildCareerText} from './career-text';
import {positionPreview} from './position-changes';
import type {Career,Position,AttributeKey} from './types';
const fresh=(position:Position='ST')=>createCareer({name:'130 체계 검수',nationality:'포르투갈',age:25,height:184,weight:80,foot:'right',position,talent:'SSS',style:PLAY_STYLES[position][0],clubId:'EN1_12',squad:'senior',difficulty:'realistic',seed:'redesign-2130',training:[]});
const uniform=(p:Position,n:number)=>Object.fromEntries((p==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES).map(k=>[k,n]));
function capped(position:Position):Career{const c=fresh(position);c.player.attributes=uniform(position,100);c.player.ovr=100;c.season.attributeStart={...c.player.attributes};c.season.ovrStart=100;beginGrowthSeason(c);return c;}

test('every position/style reaches 120 ability and 130 total with any five trained specialties, including its lowest weights',()=>{
 for(const position of Object.keys(POSITION_LABELS) as Position[])for(const style of PLAY_STYLES[position]){
  const keys=position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES,w=attributeWeights(position,style);
  for(const chosen of [keys.slice(0,5),[...keys].sort((a,b)=>w[a]!-w[b]!).slice(0,5),[...keys].sort((a,b)=>w[b]!-w[a]!).slice(0,5)]){
   const attributes={...uniform(position,100),...Object.fromEntries(chosen.map(k=>[k,120]))},p={position,style,attributes,playSkills:chosen};
   const parts=overallParts(p);assert.ok(Math.abs(parts.ability-120)<1e-9);assert.equal(parts.mastery,0);assert.equal(overall(p),120);
   assert.equal(overall({...p,skillMastery:Object.fromEntries(chosen.map(k=>[k,20]))}),130);
   for(let n=0;n<5;n++){const subset=chosen.slice(0,n),q={...p,attributes:{...uniform(position,100),...Object.fromEntries(subset.map(k=>[k,120]))},playSkills:subset};assert.equal(overall(q),100+4*n);assert.equal(overall({...q,skillMastery:Object.fromEntries(subset.map(k=>[k,20]))}),100+6*n);}
  }
 }
});
test('all 3850 weights respond monotonically both below 100 and within actual selected 100–120 growth',()=>{
 let count=0;
 for(const position of Object.keys(POSITION_LABELS) as Position[])for(const style of PLAY_STYLES[position])for(const key of position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES){
  const p={position,style,attributes:uniform(position,70)},selected={...p,playSkills:[key]};let before=-1;
  for(let value=0;value<=120;value++){
   const q={...selected,attributes:{...p.attributes,[key]:value}},parts=overallParts(q);assert.ok(parts.total>before,`${position}/${style}/${key}/${value}`);before=parts.total;
   if(value<=100)assert.equal(overall(q),overall({...q,playSkills:[]}),'selection alone adds zero');
  }
  count++;
 }
 assert.equal(count,3850);
});
test('caps, deletion under locks, manual aging, empty training, saving and retirement use the new rules',async()=>{
 let c=configureCheats(capped('ST'),true,false);c=cheatIncreaseAttribute(c,'stamina',10);assert.equal(c.player.attributes.stamina,100);assert.equal(attributeCap(c.player,'stamina'),100);
 c=setPlaySkill(c,'stamina',true);assert.equal(c.player.ovr,100);assert.equal(attributeCap(c.player,'stamina'),120);
 c=cheatIncreaseAttribute(cheatIncreaseAttribute(c,'stamina',10),'stamina',10);assert.equal(c.player.attributes.stamina,120);assert.equal(c.player.ovr,106);
 c=setAllAttributeLocks(c,true);c=manuallyAge(c,1,'stamina');assert.equal(c.player.attributes.stamina,119);
 c=setPlaySkill(c,'stamina',false);assert.equal(c.player.attributes.stamina,100);assert.equal(c.player.ovr,100);validateCareer(c);
 const played=advanceCareer(c,1);assert.deepEqual(played.player.attributes,c.player.attributes);validateCareer(played);
 const saved=await verifySaveText(await exportCareer(played));assert.deepEqual(saved.player,played.player);
 const retired=retireCareer(saved),text=buildCareerText(retired);assert.match(text,/은퇴/);assert.deepEqual(careerRecordTotals(retired).all,careerRecordTotals(await verifySaveText(await exportCareer(retired))).all);
 const bad=structuredClone(c);bad.player.attributes.stamina=101;bad.player.ovr=overall(bad.player);assert.throws(()=>validatePlaySkills(bad),/미선택 100/);
});
test('actual 2.12.1 raw-120 save authenticates, migrates once, archives originals and retains all events and signed finances',async()=>{
 const old=await verifySaveText(gunzipSync(await readFile(new URL('../../tests/fixtures/kball-2121-raw120.json.gz',import.meta.url))).toString('utf8'));
 assert.equal(old.player.ovrVersion,2);assert.equal(old.player.attributes.stamina,120);const before=JSON.stringify(old),c=upgradeAbilityModel(old);
 assert.equal(JSON.stringify(old),before);assert.equal(c.player.ovrVersion,3);assert.equal(c.player.attributes.stamina,100);assert.equal(c.player.attributes.passing,100);assert.equal(c.player.attributes.finishing,120);
 assert.deepEqual(c.systems!.abilityRulesUpgrade!.attributesBefore,old.player.attributes);
 for(const key of ['history','awards','transfers'] as const)assert.deepEqual(c[key],old[key]);assert.deepEqual(c.season.matches,old.season.matches);assert.deepEqual(c.season.playerStats,old.season.playerStats);assert.deepEqual(c.systems!.economics,old.systems!.economics);
 assert.equal(seasonOVRChange(c),old.player.ovr-old.season.ovrStart);assert.equal(upgradeAbilityModel(c),c);validateCareer(c);
 const imported=await verifySaveText(await exportCareer(c));assert.deepEqual(imported.systems!.abilityRulesUpgrade,c.systems!.abilityRulesUpgrade);assert.equal(upgradeAbilityModel(imported),imported);
 assert.equal(marketDeclineEvidence(c).severity,0,'a rule conversion is not genuine loss of form');
});
test('position change preserves every raw attribute and learned specialty while recomposing OVR and action execution',()=>{
 let c=capped('ST');c.player.attributes={...c.player.attributes,finishing:100,offTheBall:100,shooting:100,passing:50,vision:50,defending:35,tackling:35};c.player.ovr=overall(c.player);c.season.attributeStart={...c.player.attributes};c.season.ovrStart=c.player.ovr;beginGrowthSeason(c);
 c=setPlaySkill(c,'finishing',true);c=configureCheats(c,true,false);c=cheatIncreaseAttribute(c,'finishing',10);
 const before={...c.player.attributes},skills=[...c.player.playSkills!],preview=positionPreview(c,'CB','스토퍼'),next=changePosition(c,'CB','스토퍼');
 assert.deepEqual(next.player.attributes,before);assert.deepEqual(next.player.playSkills,skills);assert.equal(next.player.ovr,preview);assert.notEqual(next.player.ovr,c.player.ovr);assert.equal(next.systems!.positionChanges!.at(-1)!.ovrAfter,preview);validateCareer(next);
});
test('actual action qualities retain specialty differences and have the same weighted mean as unrounded OVR',()=>{
 for(const position of Object.keys(POSITION_LABELS) as Position[]){
  const c=capped(position),keys=position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES,chosen=keys.slice(0,5);
  c.player.playSkills=chosen;c.player.skillMastery=Object.fromEntries(chosen.map(k=>[k,20]));for(const k of chosen)c.player.attributes[k]=120;c.player.ovr=overall(c.player);
  const w=attributeWeights(position,c.player.style),average=keys.reduce((n,k)=>n+actionAbility(c.player,k)*w[k]!,0);
  assert.ok(Math.abs(average-130)<1e-9,`${position}: ${average}`);assert.ok(actionAbility(c.player,chosen[0])>actionAbility(c.player,keys.at(-1)!));
 }
});

test('the defined zero baseline is saveable and an earned 130 is not an automatic match victory',async()=>{
 const zero=capped('ST');zero.player.attributes=uniform('ST',0);zero.player.ovr=0;zero.season.attributeStart={...zero.player.attributes};zero.season.ovrStart=0;beginGrowthSeason(zero);validateCareer(zero);assert.equal((await verifySaveText(await exportCareer(zero))).player.ovr,0);
 const {simulateMatch}=await import('./match-engine'),{getClub}=await import('./data');const c=capped('ST'),chosen=['finishing','offTheBall','shooting','positioning','composure'] as AttributeKey[];
 c.player.playSkills=chosen;c.player.skillMastery=Object.fromEntries(chosen.map(k=>[k,20]));for(const k of chosen)c.player.attributes[k]=120;c.player.ovr=overall(c.player);assert.equal(c.player.ovr,130);
 const positions:Position[]=['GK','CB','CB','LB','RB','CDM','CM','CAM','LW','RW','ST','CM','CB'],roster=(clubId:string,ovr:number)=>positions.map((position,i)=>({id:`${clubId}:test:${i}`,clubId,position,ovr,name:'검수 상대 '+i}));
 let losses=0;for(let i=0;i<100;i++){const m=simulateMatch({...c,seed:'goat-not-guarantee-'+i},{id:'goat-not-guarantee',round:1,homeId:'EN1_12',awayId:'EN1_13',played:false},{home:{...getClub('EN1_12'),power:40},away:{...getClub('EN1_13'),power:95},homePlayers:roster('EN1_12',40),awayPlayers:roster('EN1_13',95),detailed:false,forceSelection:{from:0,to:90,started:true}});if(m.homeGoals<m.awayGoals)losses++;}
 assert.ok(losses>0,'even 130 cannot fix every other player in a vastly weaker team');
});


test('legacy all-120 basics are archived and normalized without false market decline or growth',async()=>{
 const old=await verifySaveText(gunzipSync(await readFile(new URL('../../tests/fixtures/kball-2121-raw120.json.gz',import.meta.url))).toString('utf8'));
 old.player.attributes=uniform('ST',120);old.player.playSkills=[];old.player.skillMastery={};old.player.ovr=expanded2121Overall(old.player);old.season.ovrStart=120;old.season.attributeStart={...old.player.attributes};old.systems!.playSkillChanges=[];beginGrowthSeason(old);
 old.systems!.economics.assessment={abilityVersion:2,ovrVersion:2,ability:120,year:old.season.year,round:0,totalRounds:old.season.totalWeeks,injuryWeeks:0,stardom:5};validateCareer(old);
 const c=upgradeAbilityModel(old);assert.equal(c.player.ovr,100);assert.ok(Object.values(c.player.attributes).every(v=>v===100));assert.equal(marketDeclineEvidence(c).severity,0);assert.equal(seasonOVRChange(c),0);validateCareer(c);
});


test('valid legacy growth from a low baseline remains balanced after the basic cap is reduced',async()=>{
 const old=await verifySaveText(gunzipSync(await readFile(new URL('../../tests/fixtures/kball-2121-raw120.json.gz',import.meta.url))).toString('utf8'));
 old.player.attributes=uniform('ST',120);old.player.playSkills=[];old.player.skillMastery={};old.player.ovr=120;old.season.ovrStart=5;old.season.attributeStart=uniform('ST',5);old.systems!.playSkillChanges=[];beginGrowthSeason(old);
 old.systems!.growthLedger!.baselineAttributes=uniform('ST',5);old.systems!.growthLedger!.byCause.cheat=uniform('ST',115);validateCareer(old);
 const c=upgradeAbilityModel(old);validateCareer(c);assert.ok(Object.values(c.systems!.growthLedger!.baselineAttributes).every(v=>v===0));assert.deepEqual(c.systems!.abilityRulesUpgrade!.baselineBefore,old.systems!.growthLedger!.baselineAttributes);
 await verifySaveText(await exportCareer(c));
});


test('historical unselected abilities never inherit specialties selected in later years',async()=>{
 const old=await verifySaveText(gunzipSync(await readFile(new URL('../../tests/fixtures/kball-2121-raw120.json.gz',import.meta.url))).toString('utf8'));
 const c=upgradeAbilityModel(old);c.player.playSkills=FIELD_ATTRIBUTES.slice(0,5);c.player.skillMastery=Object.fromEntries(c.player.playSkills.map(k=>[k,20]));
 assert.equal(comparableRecordedAbility(c,120,{abilityVersion:2,ovrVersion:2,attributes:uniform('ST',120)}),100);
});
