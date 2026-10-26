import {writeFile,mkdir} from 'node:fs/promises';
import {createCareer,calculateTable,overall,ENGINE_VERSION} from '../src/game/engine';
import {FIELD_ATTRIBUTES,PLAY_STYLES} from '../src/game/attributes';
import {getClub} from '../src/game/data';
import {getClubWorldPower,getWorldClubPlayers} from '../src/game/world';
import {simulateMatch} from '../src/game/match-engine';
import {emptyStats,addStats} from '../src/game/math';
import assert from 'node:assert/strict';

// Independent complete leagues, matched seeds, identical full availability.
// No results, goals or table places are injected into the match engine.
async function main(){
const rows=[];
for(let seed=0;seed<12;seed++){
 const c=createCareer({name:'세리에 C 비교',nationality:'대한민국',age:24,height:182,weight:77,foot:'right',position:'ST',talent:'SSS',style:PLAY_STYLES.ST[0],clubId:'IT3_30',squad:'senior',difficulty:'realistic',seed:`serie-c-impact-${seed}`,training:[]});
 for(const level of [60,98]){
  for(const key of FIELD_ATTRIBUTES)c.player.attributes[key]=level;c.player.ovr=overall(c.player);
  const fixtures=c.season.fixtures.map(f=>({...f})),stats=emptyStats();
  const powers=new Map(c.season.table.map(r=>[r.clubId,getClubWorldPower(c,r.clubId)])),rosters=new Map(c.season.table.map(r=>[r.clubId,getWorldClubPlayers(c,r.clubId)]));
  for(const f of fixtures){const own=f.homeId===c.player.clubId||f.awayId===c.player.clubId;
   const m=simulateMatch(c,f,{home:{...getClub(f.homeId),power:powers.get(f.homeId)!},away:{...getClub(f.awayId),power:powers.get(f.awayId)!},homePlayers:rosters.get(f.homeId),awayPlayers:rosters.get(f.awayId),userParticipates:own,detailed:false,forceSelection:{from:0,to:90,started:true}});
   f.played=true;f.homeGoals=m.homeGoals;f.awayGoals=m.awayGoals;if(own)addStats(stats,m.playerStats);
  }
  const table=calculateTable(fixtures,c.season.table.map(r=>r.clubId)),own=table.find(r=>r.clubId===c.player.clubId)!;
  rows.push({seed,level,rank:table.indexOf(own)+1,points:own.points,won:own.won,drawn:own.drawn,lost:own.lost,goalsFor:own.goalsFor,goalsAgainst:own.goalsAgainst,goals:stats.goals,assists:stats.assists,power:powers.get(c.player.clubId)});
 }
}
const average=(key:keyof typeof rows[number],level:number)=>rows.filter(r=>r.level===level).reduce((n,r)=>n+Number(r[key]),0)/12;
const report={version:ENGINE_VERSION,scenario:'Pescara IT3__B, ST 60 vs 98, 12 paired 38-match leagues, full availability',means:[60,98].map(level=>({level,rank:average('rank',level),points:average('points',level),goals:average('goals',level),assists:average('assists',level),goalsFor:average('goalsFor',level),goalsAgainst:average('goalsAgainst',level),titles:rows.filter(r=>r.level===level&&r.rank===1).length,top3:rows.filter(r=>r.level===level&&r.rank<=3).length})),rows};
if(process.env.KBALL_CHECK_STAR_IMPACT==='1'){const [ordinary,elite]=report.means;assert.ok(elite.points-ordinary.points>=28);assert.ok(elite.rank<=3);assert.ok(elite.goalsAgainst<=75);assert.ok(elite.titles>0);}
const output=process.env.KBALL_IMPACT_REPORT||'test-results/star-impact.json';await mkdir(output.slice(0,output.lastIndexOf('/')),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.means));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
