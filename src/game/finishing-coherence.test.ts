import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,overall} from './engine';
import {FIELD_ATTRIBUTES,overallParts,PLAY_STYLES} from './attributes';
import {oneOnOneSaveChance,supportedTechnique} from './ability-contests';
import {simulateMatch} from './match-engine';
import {emptyStats,addStats} from './math';
import {getClub} from './data';
import {validateActionLedger} from './action-metrics';
import type {AttributeKey,PlayerStats,Position} from './types';

const skills:AttributeKey[]=['positioning','anticipation','decisions','composure','vision'];
function player(){
 const c=createCareer({name:'수비형 미드필더 마무리',nationality:'포르투갈',age:27,height:180,weight:75,foot:'right',position:'CDM',talent:'SSS',style:PLAY_STYLES.CDM[0],clubId:'EN1_12',squad:'senior',difficulty:'realistic',seed:'finishing-regression',training:[]});
 c.player.id='finishing-regression-player';c.player.playSkills=skills;c.player.skillMastery=Object.fromEntries(skills.map(k=>[k,20]));
 let lo=0,hi=100;for(let i=0;i<40;i++){
  const value=(lo+hi)/2;c.player.attributes={...Object.fromEntries(FIELD_ATTRIBUTES.map(k=>[k,value])),shooting:68,finishing:63,heading:60,setPieces:65,...Object.fromEntries(skills.map(k=>[k,120]))};
  if(overallParts(c.player).total<100)lo=value;else hi=value;
 }c.player.ovr=overall(c.player);return c;
}
const positions:Position[]=['GK','CB','CB','LB','RB','CDM','CM','CAM','LW','RW','ST','CM','GK'];
const roster=(clubId:string)=>positions.map((position,i)=>({id:`finishing-control:${clubId}:${i}`,clubId,name:`대조 선수 ${i}`,position,ovr:90}));
const fixture={id:'finishing-control',round:1,homeId:'EN1_12',awayId:'EN1_13',played:false};
const options={home:{...getClub(fixture.homeId),power:90},away:{...getClub(fixture.awayId),power:90},homePlayers:roster(fixture.homeId),awayPlayers:roster(fixture.awayId),forceSelection:{from:0,to:90,started:true},detailed:false};

test('mental execution complements technique without replacing it; equal abilities and every positive response remain intact',()=>{
 for(const weight of [.2,.25,.292,.35])for(const technique of [0,25,63,68,95,100,120,150]){
  assert.equal(supportedTechnique(technique,technique,weight),technique);
  let prev=-Infinity;for(let support=0;support<=200;support++){
   const quality=supportedTechnique(technique,support,weight);assert.ok(quality>prev);assert.ok(Math.abs(quality-technique)<=40*weight);prev=quality;
  }
 }
 for(const support of [0,63,100,120,160,200]){let prev=-Infinity;for(let technique=0;technique<=150;technique++){const q=supportedTechnique(technique,support,.35);assert.ok(q>prev);prev=q;}}
 assert.ok(supportedTechnique(95,120,.35)>supportedTechnique(63,200,.35),'excellent composure cannot substitute for substantially better finishing');
});

test('one-on-one finishing and all four keeper skills affect conversion, including 100+ skills; equal scalar contests keep their prior baseline',()=>{
 for(const level of [25,50,65,80,95,100,120])assert.ok(Math.abs(oneOnOneSaveChance(level,level,level,level,level)-(.10+level*.0054))<1e-12);
 let prev=1;for(let finishing=0;finishing<=180;finishing++){const p=oneOnOneSaveChance(90,90,90,90,finishing);assert.ok(p<prev&&p>0&&p<1);prev=p;}
 for(let key=0;key<4;key++){let prev=0;for(let ability=1;ability<=130;ability++){const keeper=[80,80,80,80];keeper[key]=ability;const p=oneOnOneSaveChance(keeper[0],keeper[1],keeper[2],keeper[3],95);assert.ok(p>prev&&p<1);prev=p;}}
});

test('an OVR 100 defensive midfielder with weak finishing retains chances and defensive work but does not finish like the technically strong build',t=>{
 const low=player(),high={...low,player:{...low.player,attributes:{...low.player.attributes,shooting:95,finishing:95,heading:90}}};high.player.ovr=overall(high.player);
 assert.equal(low.player.ovr,100);assert.equal(low.player.attributes.shooting,68);assert.equal(low.player.attributes.finishing,63);
 const totals:PlayerStats[]=[emptyStats(),emptyStats()],oneOnOnes=[{shots:0,goals:0},{shots:0,goals:0}];
 for(let seed=0;seed<480;seed++)for(const [index,c]of [low,high].entries()){
  const m=simulateMatch({...c,seed:'finishing-regression-'+seed},fixture,options);addStats(totals[index],m.playerStats);
  const byId=new Map(m.events.map(e=>[e.id,e]));for(const event of m.events){if(event.playerId!==c.player.id)continue;if(event.type==='shot'&&event.detail==='일대일 슈팅')oneOnOnes[index].shots++;if(event.type==='goal'&&byId.get(event.relatedId!)?.detail==='일대일 슈팅')oneOnOnes[index].goals++;}
  assert.equal(m.events.filter(e=>e.type==='goal'&&e.playerId===c.player.id).length,m.playerStats.goals);assert.ok(m.playerStats.goals<=m.homeGoals);
  if(seed<5)validateActionLedger(m,c.player.id);
 }
 assert.ok(totals[1].goals>totals[0].goals*1.8,JSON.stringify(totals.map(s=>s.goals)));
 assert.ok(oneOnOnes[1].goals/oneOnOnes[1].shots>oneOnOnes[0].goals/oneOnOnes[0].shots+.08,JSON.stringify(oneOnOnes));
 assert.ok(totals[0].shots>480,'an intelligent player still finds shooting opportunities');
 assert.ok(totals[0].passesCompleted>480*25&&totals[0].interceptions>480*2,'passing and defensive contribution remain active');
 t.diagnostic(JSON.stringify({samples:480,low:{goals:totals[0].goals,shots:totals[0].shots},high:{goals:totals[1].goals,shots:totals[1].shots},oneOnOnes}));
});
