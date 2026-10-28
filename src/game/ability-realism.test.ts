import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,overall} from './engine';
import {FIELD_ATTRIBUTES,GK_ATTRIBUTES,PLAY_STYLES} from './attributes';
import {simulateMatch} from './match-engine';
import {skillSuccess,openPlaySaveChance} from './ability-contests';
import {emptyStats,addStats} from './math';
import {getClub} from './data';
import {validateActionLedger} from './action-metrics';
import {ovrLevel} from './ovr-levels';
import type {AttributeKey,Position,PlayerStats} from './types';
const base=createCareer({name:'상위 능력 연동',nationality:'포르투갈',age:27,height:184,weight:80,foot:'right',position:'ST',talent:'SSS',style:PLAY_STYLES.ST[0],clubId:'EN1_12',squad:'senior',difficulty:'realistic',seed:'ability-realism-211',training:[]});
const positions:Position[]=['GK','CB','CB','LB','RB','CDM','CM','CAM','LW','RW','ST','CM','CB'];
const roster=(clubId:string)=>positions.map((position,i)=>({clubId,id:`${clubId}:test:${i}`,position,ovr:80,name:`능력 검수 ${i}`}));
const fixture={id:'ability-upper-range',round:1,homeId:'EN1_12',awayId:'EN1_13',played:false};
const opts={home:{...getClub('EN1_12'),power:80},away:{...getClub('EN1_13'),power:80},homePlayers:roster('EN1_12'),awayPlayers:roster('EN1_13'),detailed:false,forceSelection:{from:0,to:90,started:true}};
function sample(position:Position,level=90){const c={...base,player:{...base.player,position,style:PLAY_STYLES[position][0],attributes:Object.fromEntries((position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES).map(k=>[k,level]))}};c.player.ovr=overall(c.player);return c;}

test('elite success contests stay smooth and responsive through 90, 100 and 110',()=>{
 for(const base of [.55,.67,.71,.84])for(const opponent of [50,65,80,95,110]){let prev=0;for(let quality=1;quality<=110;quality++){const p=skillSuccess(base,quality,opponent);assert.ok(p>prev&&p>0&&p<1);prev=p;}}
 for(const keeper of [50,65,80,95,110]){let prev=1;for(let finishing=1;finishing<=110;finishing++){const p=openPlaySaveChance(keeper,finishing);assert.ok(p<prev&&p>0&&p<1);prev=p;}}
 for(const finishing of [25,50,80,95,110]){let prev=0;for(let keeping=1;keeping<=110;keeping++){const p=openPlaySaveChance(keeping,finishing);assert.ok(p>prev&&p>0&&p<1);prev=p;}}
 assert.ok(openPlaySaveChance(50,110)>.5,'a weak keeper must not concede every on-target shot');
});

for(const [position,key,metric]of [['CM','passing','passesCompleted'],['CM','concentration','passesCompleted'],['CM','dribbling','dribblesCompleted'],['ST','heading','headerGoals'],['GK','gkDistribution','buildUpCompleted'],['GK','gkHandling','handlingSuccesses']] as [Position,AttributeKey,keyof PlayerStats][])test(`${position} ${key} mastery from 100 to 110 changes real ${metric}`,()=>{
 const c=sample(position,100),high={...c,player:{...c.player,playSkills:[key],attributes:{...c.player.attributes,[key]:110}}};let a=0,b=0;
 for(let i=0;i<300;i++){const seed=`upper-${key}-${i}`,lo=simulateMatch({...c,seed},fixture,opts),hi=simulateMatch({...high,seed},fixture,opts);a+=lo.playerStats[metric]??0;b+=hi.playerStats[metric]??0;if(i<10){validateActionLedger(lo,c.player.id);validateActionLedger(hi,c.player.id);}}
 assert.ok(b>a,`${key}: ${a} → ${b}`);
});

test('a stronger keeper supports the same attack instead of raising its reference and cancelling supply',()=>{
 const low=sample('GK',80),high=sample('GK',100);let a=0,b=0,ga=0,gb=0;
 for(let i=0;i<400;i++){const seed=`keeper-attack-reference-${i}`,x=simulateMatch({...low,seed},fixture,opts),y=simulateMatch({...high,seed},fixture,opts);a+=x.homeGoals;b+=y.homeGoals;ga+=x.awayGoals;gb+=y.awayGoals;}
 assert.ok(b>a,`own goals ${a} → ${b}`);assert.ok(gb<ga,`conceded ${ga} → ${gb}`);
});

test('healthy elite starters are judged against actual positional rivals, independent of age',()=>{
 const c=sample('LW',95),run=(age:number)=>{let starts=0,minutes=0;for(let i=0;i<400;i++){const m=simulateMatch({...c,seed:`elite-selection-${i}`,player:{...c.player,age}},fixture,{...opts,forceSelection:undefined});starts+=m.playerStats.starts;minutes+=m.playerMinutes;}return {starts,minutes};};
 const young=run(27),old=run(40);assert.deepEqual(old,young);assert.ok(young.starts>=380,JSON.stringify(young));
});

test('the requested player comparisons are shown without changing numerical OVR or skill ceilings',()=>{
 assert.ok(ovrLevel(90)!.examples.includes('손흥민'));assert.ok(ovrLevel(95)!.examples.includes('해리 케인'));assert.ok(ovrLevel(95)!.examples.includes('카림 벤제마'));assert.ok(ovrLevel(100)!.examples.includes('리오넬 메시'));assert.ok(ovrLevel(110)!.examples.some(s=>s.includes('호날두')));
 const c=sample('ST',90);assert.equal(c.player.ovr,90);assert.equal(overall(c.player),90);
});
