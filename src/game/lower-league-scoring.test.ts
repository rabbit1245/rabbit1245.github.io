import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,makeFixtures,overall} from './engine';
import {CLUBS,getClub} from './data';
import {FIELD_ATTRIBUTES,PLAY_STYLES} from './attributes';
import {getClubWorldPower,getWorldClubPlayers} from './world';
import {simulateMatch} from './match-engine';
import {openPlaySaveChance} from './ability-contests';
import {validateActionLedger} from './action-metrics';

test('equally matched lower-division keepers retain basic shot stopping without an ability dead zone',()=>{
 const ordinary=openPlaySaveChance(65,65),elite=openPlaySaveChance(80,80);
 assert.ok(ordinary>.84&&elite-ordinary<.02,`${ordinary} → ${elite}`);
 for(const finishing of [25,50,65,70,90,110]){
  let previous=0;for(let keeping=1;keeping<=110;keeping++){
   const current=openPlaySaveChance(keeping,finishing);assert.ok(current>previous,`${keeping}/${finishing}`);previous=current;
  }
 }
});

for(const clubId of ['IT3_30','EN3_17','DE3_03'])test(`${clubId}: ordinary strikers do not routinely score 30–40 across 20 real league schedules`,t=>{
 const c=createCareer({name:'하부 리그 회귀 검수',nationality:'대한민국',age:25,height:184,weight:80,foot:'right',position:'ST',talent:'SSS',style:PLAY_STYLES.ST[0],clubId,squad:'senior',difficulty:'realistic',seed:'scoring-level-pair',training:[]});
 const club=getClub(clubId),ids=CLUBS.filter(c=>c.leagueId===club.leagueId).map(c=>c.id),fixtures=makeFixtures(ids,2026).filter(f=>f.homeId===clubId||f.awayId===clubId),rows=[];
 // Full minutes and a goal-focused role deliberately test the upper side of the distribution.
 // No test alters a completed match or requires that an exceptional 30-goal season be impossible.
 for(const level of [65,70,...(clubId==='IT3_30'?[90]:[])]){
  c.player.attributes=Object.fromEntries(FIELD_ATTRIBUTES.map(k=>[k,level]));c.player.ovr=overall(c.player);const goals=[];
  for(let season=0;season<20;season++){
   c.seed=`lower-scoring-${season}`;const teams=new Map(ids.map(id=>[id,{club:{...getClub(id),power:getClubWorldPower(c,id)},players:getWorldClubPlayers(c,id)}]));let total=0;
   for(const f of fixtures){const h=teams.get(f.homeId)!,a=teams.get(f.awayId)!,m=simulateMatch(c,f,{home:h.club,away:a.club,homePlayers:h.players,awayPlayers:a.players,forceSelection:{from:0,to:90,started:true},detailed:false});
    total+=m.playerStats.goals;
    assert.ok(m.playerStats.goals<=(f.homeId===clubId?m.homeGoals:m.awayGoals));
    assert.equal(m.events.filter(e=>e.type==='goal'&&e.playerId===c.player.id).length,m.playerStats.goals);
    if(season===0)validateActionLedger(m,c.player.id);
   }goals.push(total);
  }
  rows.push({level,mean:goals.reduce((a,b)=>a+b,0)/goals.length,atLeast30:goals.filter(g=>g>=30).length,atLeast40:goals.filter(g=>g>=40).length,min:Math.min(...goals),max:Math.max(...goals)});
 }
 assert.ok(rows[0].mean>8&&rows[0].mean<22,JSON.stringify(rows));
 assert.ok(rows[1].mean>rows[0].mean+3&&rows[1].mean<28,JSON.stringify(rows));
 assert.ok(rows[0].atLeast30<=3&&rows[1].atLeast30<=7&&rows[1].atLeast40<=2,JSON.stringify(rows));
 if(rows[2])assert.ok(rows[2].mean>rows[1].mean+15,JSON.stringify(rows));
 t.diagnostic(JSON.stringify({fixtures:fixtures.length,forcedMinutes:true,seasons:20,rows}));
});
