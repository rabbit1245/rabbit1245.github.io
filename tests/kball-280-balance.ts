import {writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {FIELD_ATTRIBUTES,GK_ATTRIBUTES,PLAY_STYLES,attributeWeights,overall} from '../src/game/attributes';
import {simulateMatch} from '../src/game/match-engine';
import {emptyStats} from '../src/game/math';
import type {AttributeKey,Career,Club,Position} from '../src/game/types';
import type {MatchParticipant} from '../src/game/revision-types';
const out=process.env.KBALL_TEST_RESULTS_DIR||'test-results/release-2.8.0';mkdirSync(out,{recursive:true});
const home:Club={id:'probe-home',name:'검증 홈',nativeName:'검증 홈',country:'대한민국',leagueId:'TEST',power:65,color:'#fff'},away={...home,id:'probe-away',name:'검증 원정',power:75};
const slots:Position[]=['GK','CB','CB','LB','RB','CDM','CM','CAM','LW','RW','ST','CM','GK'];
const roster=(id:string,ovr:number):MatchParticipant[]=>slots.map((position,i)=>({id:id+i,position,ovr,name:'검증 선수 '+i,clubId:id}));
const fixture={id:'paired-level-probe',round:1,homeId:home.id,awayId:away.id,played:false};
const results=[];
for(const position of ['ST','LWB','CB','GK']as Position[])for(const level of [85,90,95,100,110,120]){
 const allowed=position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES,style=PLAY_STYLES[position][0],keys=(Object.entries(attributeWeights(position,style))as[AttributeKey,number][]).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k])=>k),skills=level>100?keys:[];
 let special=level>100?110:level;
 if(level===110){let lo=100,hi=110;for(let n=0;n<30;n++){const mid=(lo+hi)/2,p={position,style,playSkills:skills,attributes:Object.fromEntries(allowed.map(k=>[k,keys.includes(k)?mid:90]))};if(overall(p)<110)lo=mid;else hi=mid;}special=hi;}
 const attributes=Object.fromEntries(allowed.map(k=>[k,level>100?(keys.includes(k)?special:90):level]));assert.equal(overall({position,style,playSkills:skills,attributes}),level);
 let goals=0,assists=0,saves=0,conceded=0,tackles=0,keyPasses=0,rating=0,wins=0;
 for(let seed=0;seed<240;seed++){
  const c={schemaVersion:1,id:'probe',seed:'ovr280-'+seed,revision:0,createdAt:'2026-07-01',updatedAt:'2026-07-01',player:{id:'user',name:'검증',nationality:'대한민국',age:25,height:180,weight:75,foot:'right',position,secondaryPositions:[],talent:'SSS',style,attributes,playSkills:skills,clubId:home.id,squad:'senior',fitness:100,morale:70,form:70,injuryWeeks:0,ovr:level,potential:100,wage:1000,contractYears:3},season:{year:2026,index:0,week:1,totalWeeks:38,leagueId:'TEST',competitionName:'통제 검증',fixtures:[],table:[],matches:[],playerStats:emptyStats(),ovrStart:level,attributeStart:attributes,completed:false},history:[],news:[],training:[],intensity:'balanced',transfers:[],offers:[],stage:'season',managerTrust:90,careerIncome:0,awards:[],difficulty:'realistic',processedCommands:[]}as Career;
  const m=simulateMatch(c,fixture,{home,away,homePlayers:roster(home.id,65),awayPlayers:roster(away.id,75),forceSelection:{from:0,to:90,started:true},detailed:false});const s=m.playerStats;
  goals+=s.goals;assists+=s.assists;saves+=s.saves;conceded+=s.goalsConceded;tackles+=s.tackles+s.interceptions;keyPasses+=s.keyPasses??0;rating+=m.playerRating;if(m.homeGoals>m.awayGoals)wins++;
 }
 results.push({position,level,matches:240,goals,assists,saves,conceded,saveRate:saves/Math.max(1,saves+conceded),tackles,keyPasses,averageRating:rating/240,wins,skillValue:special});
}
for(const position of ['ST','LWB','CB','GK']){
 const low=results.find(r=>r.position===position&&r.level===90)!,high=results.find(r=>r.position===position&&r.level===120)!;
 assert.ok(high.wins<high.matches,'a single 120 player cannot guarantee victories');
 if(position==='ST')assert.ok(high.goals>low.goals,'earned mastery improves striker output');
 if(position==='LWB')assert.ok(high.keyPasses+high.tackles>low.keyPasses+low.tackles,'wingback mastery improves actual actions');
 if(position==='CB')assert.ok(high.tackles>low.tackles,'defensive mastery improves actual actions');
 if(position==='GK')assert.ok(high.saveRate>low.saveRate,'goalkeeper mastery improves shot prevention');
}
writeFileSync(out+'/balance.json',JSON.stringify({method:'Paired 240 seeds per position/level; all 22 players and action-based match calculation; home 65 vs away 75; fixed actual 90-minute exposure for comparison only. 110/120 are earned-stat fixtures, not forced wins.',results},null,2));console.log(JSON.stringify(results));
