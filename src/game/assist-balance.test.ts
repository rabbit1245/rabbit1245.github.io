import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,overall} from './engine';
import {FIELD_ATTRIBUTES,PLAY_STYLES} from './attributes';
import {getClub} from './data';
import {getClubWorldPower,getWorldClubPlayers} from './world';
import {simulateMatch} from './match-engine';
test('forwards retain link-up assists and creative positions supply actual assisted goals',t=>{
 const rows:Record<string,{goals:number;assists:number;goalsAll:number;assistsAll:number}>={};
 for(const position of ['ST','CAM','RW','CB'] as const){
  const c=createCareer({name:'도움 분포',nationality:'대한민국',age:25,height:180,weight:75,foot:'right',position,talent:'S',style:PLAY_STYLES[position][0],clubId:'KR1_01',squad:'senior',difficulty:'realistic',seed:'assist-balance'});
  for(const key of FIELD_ATTRIBUTES)c.player.attributes[key]=85;c.player.ovr=overall(c.player);
  const fixture=c.season.fixtures.find(f=>f.homeId===c.player.clubId||f.awayId===c.player.clubId)!;
  const row=rows[position]={goals:0,assists:0,goalsAll:0,assistsAll:0};
  for(let seed=0;seed<300;seed++){
   const m=simulateMatch({...c,seed:`assist-probe-${seed}`},fixture,{forceSelection:{from:0,to:90,started:true},detailed:false,home:{...getClub(fixture.homeId),power:getClubWorldPower(c,fixture.homeId)},away:{...getClub(fixture.awayId),power:getClubWorldPower(c,fixture.awayId)},homePlayers:getWorldClubPlayers(c,fixture.homeId),awayPlayers:getWorldClubPlayers(c,fixture.awayId)});
   row.goals+=m.playerStats.goals;row.assists+=m.playerStats.assists;row.goalsAll+=m.homeGoals+m.awayGoals;row.assistsAll+=m.performers!.reduce((sum,p)=>sum+p.stats.assists,0);
   const goals=new Map(m.events.filter(e=>e.type==='goal').map(e=>[e.id,e])),linked=new Set<string>();
   for(const assist of m.events.filter(e=>e.type==='assist')){assert.ok(!linked.has(assist.relatedId!));linked.add(assist.relatedId!);assert.notEqual(assist.playerId,goals.get(assist.relatedId!)!.playerId);}
  }
  assert.ok(row.assistsAll/row.goalsAll>.65&&row.assistsAll/row.goalsAll<.85);
 }
 assert.ok(rows.ST.assists>rows.ST.goals*.15,'strikers can link play, rather than only score');
 assert.ok(rows.CAM.assists>rows.CAM.goals*.6);assert.ok(rows.RW.assists>75);
 assert.ok(rows.CAM.assists>rows.CB.assists*3,'creative positions supply more final passes than central defenders');t.diagnostic(JSON.stringify(rows));
});
