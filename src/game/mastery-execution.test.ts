import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer} from './engine';
import {FIELD_ATTRIBUTES,GK_ATTRIBUTES,overall,playingAbility,PLAY_STYLES} from './attributes';
import {simulateMatch} from './match-engine';
import {getClub} from './data';
import {emptyStats,addStats} from './math';
import {cognitiveOpportunity} from './ability-contests';
import type {AttributeKey,Career,Fixture,Position} from './types';

const base=createCareer({name:'기량 연동 검수',nationality:'일본',age:27,height:180,weight:76,foot:'right',position:'ST',talent:'SSS',style:'포처',clubId:'ES1_01',squad:'senior',difficulty:'realistic',seed:'mastery-execution-2115',training:[]});
function profile(position:Position='ST',mental=false):Career{
 const attributes=Object.fromEntries((position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES).map(k=>[k,mental?95:90]));
 const skills:AttributeKey[]=mental?['positioning','anticipation','decisions','composure','vision']:[];
 for(const key of skills)attributes[key]=120;if(mental){attributes.concentration=120;attributes.teamwork=120;attributes.speed=65;attributes.dribbling=65;attributes.skillMoves=65;attributes.agility=65;attributes.strength=65;attributes.shooting=90;}
 const player={...base.player,position,style:PLAY_STYLES[position][0],attributes,playSkills:skills,skillMastery:Object.fromEntries(skills.map(k=>[k,20])),fitness:100,form:75};player.ovr=overall(player);
 return {...base,player,managerTrust:70,systems:{...base.systems!,personality:{leadership:5,stardom:5,fairPlay:5,clutch:5,winning:5}}};
}
const positions:Position[]=['GK','CB','CB','LB','RB','CDM','CM','CAM','LW','RW','ST','CM','GK'];
function game(c:Career,seed:number,level=85,stage?:string){
 const home={...getClub('ES1_01'),power:level},away={...getClub('ES1_02'),power:level};
 const roster=(clubId:string)=>positions.map((position,i)=>({id:`control:${clubId}:${i}`,clubId,name:`대조 선수 ${i}`,position,ovr:level}));
 const fixture:Fixture&{stage?:string}={id:`control:${seed}`,round:seed+1,homeId:home.id,awayId:away.id,played:false,...(stage?{stage}:{})};
 return simulateMatch({...c,seed:'isagi-control-'+seed},fixture,{home,away,homePlayers:roster(home.id),awayPlayers:roster(away.id),detailed:false});
}

test('earned mental mastery stays on the selection scale while physical and technical actions retain their real values',()=>{
 const c=profile('ST',true),before=JSON.stringify(c.player.attributes);
 assert.ok(c.player.ovr>=100);assert.ok(playingAbility({...c.player,ovr:undefined})<c.player.ovr,'actual earned specialty adds at most ten to the raw average');
 assert.equal(playingAbility(c.player),c.player.ovr);assert.equal(c.player.attributes.speed,65);assert.equal(c.player.attributes.shooting,90);assert.equal(JSON.stringify(c.player.attributes),before);
 assert.equal(cognitiveOpportunity(90,65,65),0,'ordinary lower-division skills get no extra cognitive multiplier');
 const at100={...c.player,attributes:{...c.player.attributes}};for(const key of at100.playSkills??[])at100.attributes[key]=100;at100.ovr=overall(at100);
 const selected={...at100,playSkills:[]};assert.equal(overall(selected),at100.ovr,'selection alone still grants no OVR');
});

test('identical retained ability and condition produce identical club decisions at 27 and 40, with elite second-division starts',()=>{
 const young=profile('ST',true),older={...young,player:{...young.player,age:40}};let starts=0;
 for(let i=0;i<80;i++){const a=game(young,i,65),b=game(older,i,65);assert.deepEqual(b,a);starts+=Number(b.playerStarted);}
 assert.ok(starts>=76,'healthy elite ability is recognised for starts regardless of the older age');
});

test('exceptional reading creates real space and supply without turning weak dribbling into elite dribbling',()=>{
 const brain=profile('ST',true),ordinary=profile(),a=emptyStats(),b=emptyStats();
 for(let i=0;i<240;i++){addStats(a,game(brain,i).playerStats);addStats(b,game(ordinary,i).playerStats);}
 assert.ok(a.goals>b.goals&&a.assists>b.assists,'a high-ability cerebral striker can outperform an ordinary 90 through actual chances');
 assert.ok(a.dribblesCompleted!<b.dribblesCompleted!,'technical weaknesses remain observable');
});

test('clutch reaches passing, defending and keeping in finals, with real contributions in some defeats and unchanged ordinary games',()=>{
 let losingContribution=false;
 for(const position of ['ST','CM','CB','GK'] as const){
  const c=profile(position),high={...c,systems:{...c.systems!,personality:{...c.systems!.personality!,clutch:10}}},a=emptyStats(),b=emptyStats();
  for(let i=0;i<120;i++){
   const neutral=game(c,i,80,'결승'),boosted=game(high,i,80,'결승');addStats(a,neutral.playerStats);addStats(b,boosted.playerStats);
   const performer=boosted.performers!.find(p=>p.id===c.player.id);if(performer)assert.deepEqual(performer.attributes,c.player.attributes,'match pressure never changes saved abilities');else assert.equal(boosted.playerStats.apps,0);
   if(boosted.homeGoals<boosted.awayGoals&&(boosted.playerStats.goals>0||boosted.playerStats.assists>0||boosted.playerStats.interceptions>neutral.playerStats.interceptions||boosted.playerStats.saves>neutral.playerStats.saves))losingContribution=true;
  }
  if(position==='CM')assert.ok(b.progressivePasses!>a.progressivePasses!&&b.assists>a.assists);
  if(position==='CB')assert.ok(b.interceptions>a.interceptions);
  if(position==='GK')assert.ok(b.saves>a.saves);
  for(let i=0;i<4;i++)assert.deepEqual(game(high,i,65),game(c,i,65),'the same clutch trait does not modify ordinary fixtures');
 }
 assert.ok(losingContribution,'a final defeat does not suppress the player’s real successful actions');
 const c=profile('CM'),high={...c,systems:{...c.systems!,personality:{...c.systems!.personality!,clutch:10}}};
 assert.notDeepEqual(game(high,0,65,'4강').playerStats,game(c,0,65,'4강').playerStats,'Korean semifinal stages reach the same big-match path');
});
