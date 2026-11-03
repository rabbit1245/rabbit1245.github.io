import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,setPlaySkill,configureCheats,cheatIncreaseAttribute,setAllAttributeLocks,manuallyAge,advanceCareer} from './engine';
import {FIELD_ATTRIBUTES,GK_ATTRIBUTES,PLAY_STYLES,POSITION_LABELS,attributeWeights,overall} from './attributes';
import {FIELD_PLAY_SKILLS,GK_PLAY_SKILLS,playSkillsForYear,retirementPlaySkillNames} from './play-skills';
import {trainRound,applyMatchExperience,beginGrowthSeason} from './growth';
import {validateCareer,exportCareer,verifySaveText} from './storage';
import {buildCareerText} from './career-text';
import {OVR_LEVELS} from './ovr-levels';
import {commandChange} from './command-patches';
import {executeCommand} from './commands';
import {emptyStats} from './math';
import type {AttributeKey,Position,Career} from './types';

const fresh=(position:Position='ST')=>createCareer({name:'스킬 검증',nationality:'포르투갈',age:16,height:180,weight:75,foot:'right',position,talent:'SSS',style:PLAY_STYLES[position][0],clubId:'EN1_01',squad:'senior',difficulty:'realistic',seed:'skills-280-'+position});
const core=(position:Position,style=PLAY_STYLES[position][0])=>(Object.entries(attributeWeights(position,style))as[AttributeKey,number][]).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k])=>k);

test('annual retirement skills explain the specialty for field players and keepers',()=>{
 assert.deepEqual(retirementPlaySkillNames('ST',['stamina','shooting']),['엔진(체력 스페셜리스트)','스나이퍼(슈팅 스페셜리스트)']);
 assert.match(retirementPlaySkillNames('GK',['gkReflexes'])[0],/^리플렉스\(.+ 스페셜리스트\)$/);
 const c=setPlaySkill(fresh(),'stamina',true),text=buildCareerText(c);
 assert.match(text,/플레이스타일: 엔진\(체력 스페셜리스트\)/);
 assert.doesNotMatch(text.split('C. 연도별 기록')[0],/엔진\(/);
 assert.doesNotMatch(buildCareerText(setPlaySkill(c,'stamina',false)),/엔진\(/);
});

test('all 35 skill mappings and expanded OVR ranges are complete, unique by context and have examples',()=>{
 assert.deepEqual(FIELD_PLAY_SKILLS.map(s=>s.key),FIELD_ATTRIBUTES);assert.deepEqual(GK_PLAY_SKILLS.map(s=>s.key),GK_ATTRIBUTES);
 assert.equal(new Set([...FIELD_ATTRIBUTES,...GK_ATTRIBUTES]).size,33);
 for(let v=0;v<=130;v++)assert.equal(OVR_LEVELS.filter(r=>v>=r.min&&v<=r.max).length,1);
 assert.ok(OVR_LEVELS.every(r=>r.examples.length>=1));
});

test('choosing skills adds no abilities, OVR or hidden bonus; sixth choice and wrong-position skills are rejected',()=>{
 const start=fresh(),before=JSON.stringify(start.player.attributes),ovr=start.player.ovr;let c=start;
 for(const key of core('ST')){c=setPlaySkill(c,key,true);assert.equal(c.player.ovr,ovr);assert.equal(JSON.stringify(c.player.attributes),before);}
 assert.throws(()=>setPlaySkill(c,'speed',true),/최대 5/);assert.throws(()=>setPlaySkill(c,'gkReflexes',true),/포지션/);
 assert.equal(start.player.playSkills,undefined);validateCareer(c);
 const next=executeCommand(start,{type:'playSkill',key:'shooting',selected:true},'bounded-skill');assert.ok(commandChange(start,next),'skill clicks retain the small durable journal path');
 const repeated=executeCommand(next,{type:'playSkill',key:'shooting',selected:true},'duplicate-selection');assert.equal(repeated.revision,next.revision+1);assert.equal(repeated.systems!.playSkillChanges!.length,next.systems!.playSkillChanges!.length);assert.equal(executeCommand(repeated,{type:'playSkill',key:'shooting',selected:true},'duplicate-selection'),repeated);
 const bad=structuredClone(c);bad.player.playSkills=[...FIELD_ATTRIBUTES.slice(0,6)];assert.throws(()=>validateCareer(bad),/최대 5/);
});

test('locks, explicit manual aging, deletion above 100 and a complete export/import preserve the skill history',async()=>{
 let c=setPlaySkill(fresh(),'shooting',true);c=configureCheats(c,true,false);
 for(let n=0;n<8;n++)c=cheatIncreaseAttribute(c,'shooting',10);
 assert.equal(c.player.attributes.shooting,120);assert.ok(c.player.ovr>c.season.ovrStart);
 c=setAllAttributeLocks(c,true);const locked=c.player.attributes.shooting;trainRound(c);assert.equal(c.player.attributes.shooting,locked);
 c=manuallyAge(c,1,'shooting');assert.equal(c.player.attributes.shooting,119);assert.ok(c.player.playSkills?.includes('shooting'));
 c=setPlaySkill(c,'shooting',false);assert.equal(c.player.attributes.shooting,100);assert.equal(c.systems!.playSkillChanges!.at(-1)!.before,119);
 assert.ok(c.systems!.attributeLocks!.includes('shooting'));validateCareer(c);
 const imported=await verifySaveText(await exportCareer(c));assert.deepEqual(imported.systems!.playSkillChanges,c.systems!.playSkillChanges);
 assert.equal(imported.player.attributes.shooting,100);
});
test('110 mental attributes keep derived leadership within its percentage scale and remain saveable after a real round',()=>{
 let c=configureCheats(setPlaySkill(setPlaySkill(fresh(),'teamwork',true),'composure',true),true,false);
 for(const key of ['teamwork','composure']as AttributeKey[])while((c.player.attributes[key]??0)<110)c=cheatIncreaseAttribute(c,key,10);
 c=advanceCareer(c,1);assert.equal(c.systems!.world.players[c.player.id].leadership,100);validateCareer(c);
});

test('annual retirement skills start at acquisition and disappear from deletion year; neither skills nor narratives enter totals',()=>{
 let c=setPlaySkill(fresh(),'shooting',true);const year=c.season.year;
 // Isolate year replay without inventing old match or financial records.
 c={...c,season:{...c.season,year:year+2}};c=setPlaySkill(c,'shooting',false);
 assert.deepEqual(playSkillsForYear(c,year-1),[]);assert.deepEqual(playSkillsForYear(c,year),['shooting']);assert.deepEqual(playSkillsForYear(c,year+1),['shooting']);assert.deepEqual(playSkillsForYear(c,year+2),[]);
 const txt=buildCareerText(c),basic=txt.split('C. 연도별 기록')[0];assert.ok(!basic.includes('플레이스타일'));assert.ok(!txt.includes('낭만'));
});

test('every position and tactical style uses raw 120 plus at most 2 per earned skill, up to 130',()=>{
 for(const position of Object.keys(POSITION_LABELS)as Position[])for(const style of PLAY_STYLES[position]){
  const chosen=core(position,style),allowed=position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES;
  for(let n=0;n<=5;n++){
   const skills=chosen.slice(0,n),p={position,style,playSkills:skills,skillMastery:Object.fromEntries(skills.map(k=>[k,20])),attributes:Object.fromEntries(allowed.map(k=>[k,skills.includes(k)?120:100]))};
   assert.equal(overall(p),100+6*n,position+' '+style);
   assert.equal(overall({...p,skillMastery:{}}),100+4*n,'earned raw growth supplies four per skill');
  }
 }
});

test('actual training at the raw cap can earn specialty mastery in all positions without unchecked growth or cheats',()=>{
 for(const position of Object.keys(POSITION_LABELS)as Position[]){
  let c=fresh(position);const keys=position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES;
  // Controlled already-developed raw abilities, not a promise of reaching 130
  // from a teenage novice by training only five of twenty-five attributes.
  c.player.attributes=Object.fromEntries(keys.map(k=>[k,100]));c.player.potential=120;c.player.ovr=overall(c.player);
  for(const key of core(position))c=setPlaySkill(c,key,true);
  for(const key of c.player.playSkills!)c.player.attributes[key]=120;c.player.ovr=overall(c.player);
  const before={...c.player.attributes};c.player.age=20;c.intensity='intense';
  for(let season=0;season<50&&c.player.ovr<130;season++){
   c.season={...c.season,year:2026+season,week:0,attributeStart:{...before},playerStats:emptyStats(),totalWeeks:38};
   beginGrowthSeason(c);
   for(let week=1;week<=38;week++){
    c.training=[...c.player.playSkills!].sort((a,b)=>(c.player.skillMastery?.[a]??0)-(c.player.skillMastery?.[b]??0)).slice(0,3);
    c.season.week=week;trainRound(c);
    applyMatchExperience(c,{...emptyStats(),apps:1,starts:1,minutes:90,ratingCount:1,ratingSum:7.5,shotsOnTarget:2,passesCompleted:30,keyPasses:2,tackles:3,interceptions:2,dribblesCompleted:2,saves:4});
   }
  }
  assert.deepEqual(c.player.attributes,before);assert.equal(c.player.ovr,130,position);assert.ok(!c.systems!.cheats?.used);
 }
});
