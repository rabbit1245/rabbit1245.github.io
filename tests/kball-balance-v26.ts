import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createCareer,calculateTable,overall} from '../src/game/engine';
import {simulateMatch} from '../src/game/match-engine';
import {getClubWorldPower,getWorldClubPlayers,transitionWorldSeason} from '../src/game/world';
import {getClub} from '../src/game/data';
import {emptyStats,addStats} from '../src/game/math';
import type {Career} from '../src/game/types';
const base=createCareer({name:'밸런스 검증',nationality:'대한민국',age:22,height:180,weight:75,foot:'right',position:'ST',talent:'SSS',style:'포처',clubId:'KR1_12',squad:'senior',difficulty:'realistic',seed:'balance-v26'});
function league(c:Career,id:string,user=false){
 const comp=c.systems!.world.competitions[id];
 for(const f of comp.fixtures){
  const own=user&&(f.homeId===c.player.clubId||f.awayId===c.player.clubId);if(own){c.player.fitness=100;c.player.injuryWeeks=0;c.managerTrust=95;c.player.form=80;}
  const m=simulateMatch(c,f,{home:{...getClub(f.homeId),power:getClubWorldPower(c,f.homeId)},away:{...getClub(f.awayId),power:getClubWorldPower(c,f.awayId)},homePlayers:getWorldClubPlayers(c,f.homeId),awayPlayers:getWorldClubPlayers(c,f.awayId),userParticipates:own,detailed:false});f.played=true;f.homeGoals=m.homeGoals;f.awayGoals=m.awayGoals;if(own)addStats(c.season.playerStats,m.playerStats);
 }
 comp.round=comp.totalRounds;comp.table=calculateTable(comp.fixtures,comp.table.map(r=>r.clubId));return comp.table;
}
const distributions=[];
for(const id of ['EN1','ES1','DE1']){
 const ranks:Record<string,number[]>={},champions:Record<string,number>={};
 for(let seed=0;seed<8;seed++){
  const c=structuredClone(base);c.seed=`balance-v26-${seed}`;const table=league(c,id);table.forEach((r,i)=>(ranks[r.clubId]??=[]).push(i+1));champions[table[0].clubId]=(champions[table[0].clubId]??0)+1;
 }
 const clubs=Object.entries(ranks).map(([clubId,values])=>({club:getClub(clubId).name,id:clubId,mean:values.reduce((n,r)=>n+r,0)/values.length,min:Math.min(...values),max:Math.max(...values),titles:champions[clubId]??0,power:getClubWorldPower(base,clubId)})).sort((a,b)=>a.mean-b.mean);
 const strongest=[...clubs].sort((a,b)=>b.power-a.power).slice(0,4),weakest=[...clubs].sort((a,b)=>a.power-b.power).slice(0,4);assert.ok(strongest.reduce((n,r)=>n+r.mean,0)<weakest.reduce((n,r)=>n+r.mean,0),id);distributions.push({league:id,seasons:8,clubs});console.log(id,JSON.stringify(clubs.slice(0,5)));
}
const impact=[];
for(const [id,clubId] of [['EN1','EN1_13'],['DE1','DE1_02']]){
 const rows=[];
 for(const quality of [97,60])for(let seed=0;seed<8;seed++){
  const c=structuredClone(base);c.seed=`strong-impact-v26-${seed}`;c.player.clubId=clubId;c.season.leagueId=id;c.season.totalWeeks=c.systems!.world.competitions[id].totalRounds;
  for(const key of Object.keys(c.player.attributes))c.player.attributes[key as keyof typeof c.player.attributes]=quality;c.player.ovr=overall(c.player);
  const table=league(c,id,true),row=table.find(r=>r.clubId===clubId)!;rows.push({quality,seed,rank:table.findIndex(r=>r.clubId===clubId)+1,points:row.points,goals:c.season.playerStats.goals,assists:c.season.playerStats.assists});
 }
 const means=[97,60].map(quality=>{const group=rows.filter(r=>r.quality===quality);return {quality,rank:group.reduce((n,r)=>n+r.rank,0)/8,points:group.reduce((n,r)=>n+r.points,0)/8,titles:group.filter(r=>r.rank===1).length};});
 assert.ok(means[0].points>means[1].points,JSON.stringify({clubId,means}));assert.ok(means[0].rank<=means[1].rank,JSON.stringify({clubId,means}));impact.push({club:getClub(clubId).name,means,rows});console.log('impact',JSON.stringify(impact.at(-1)));
}
const development=[];
for(const quality of [97,60]){
 const c=structuredClone(base);c.seed='weak-club-comparison';for(const key of Object.keys(c.player.attributes))c.player.attributes[key as keyof typeof c.player.attributes]=quality;c.player.ovr=overall(c.player);
 const records=[];
 for(let year=0;year<10;year++){
  const world=c.systems!.world,club=world.clubs[c.player.clubId],id=club.leagueId,comp=world.competitions[id];c.season={...c.season,year:world.year,index:year+1,week:0,leagueId:id,totalWeeks:comp.totalRounds,fixtures:comp.fixtures,table:comp.table,playerStats:emptyStats(),matches:[]};
  const before=getClubWorldPower(c,club.id),table=league(c,id,true),rank=table.findIndex(r=>r.clubId===club.id)+1,stats={...c.season.playerStats};c.season.week=c.season.totalWeeks;transitionWorldSeason(c);const report=club.development!.history.at(-1)!;
  records.push({year:2026+year,league:id,rank,points:table[rank-1].points,goals:stats.goals,assists:stats.assists,apps:stats.apps,before,after:getClubWorldPower(c,club.id),prestige:club.development!.prestige,investment:club.development!.investmentPower,bonus:report.bonus,reinvestment:report.reinvestment});
 }
 development.push({quality,records});console.log('development',quality,JSON.stringify(records));
}
assert.ok(development[0].records.at(-1)!.prestige>development[1].records.at(-1)!.prestige);
assert.ok(development[0].records.at(-1)!.after>development[1].records.at(-1)!.after);
const report={model:'동일 선수단·고정 시드. 리그 분포 3개×8시즌. 약팀 비교 10년×2, 직접 경기 결과와 유급 재투자. 해당 비교만 선수 건강·체력 고정해 능력 차이를 분리. 전체 커리어 테스트와 구별.',distributions,impact,development};
mkdirSync('test-results/p26',{recursive:true});writeFileSync('test-results/p26/balance.json',JSON.stringify(report,null,2));
