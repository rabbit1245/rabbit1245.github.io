/** Paired real schedules, not a player's career or post-hoc goal normalization. */
import {mkdir,writeFile} from 'node:fs/promises';
import {createCareer,overall,makeFixtures,ENGINE_VERSION} from '../src/game/engine';
import {CLUBS,getClub,getLeague} from '../src/game/data';
import {FIELD_ATTRIBUTES,PLAY_STYLES} from '../src/game/attributes';
import {getWorldClubPlayers,getClubWorldPower} from '../src/game/world';
import {simulateMatch} from '../src/game/match-engine';
import {validateActionLedger} from '../src/game/action-metrics';
import type {Career,Position} from '../src/game/types';

const seasons=Number(process.env.KBALL_SCORING_SEASONS??30);
const output=process.env.KBALL_SCORING_OUTPUT??'test-results/coherence/before.json';
const profiles=[
 {club:'ES1_01',position:'RW' as Position,levels:[75,80,85,90,95,100]},
 {club:'ES1_07',position:'RW' as Position,levels:[80,90]},
 {club:'ES1_01',position:'ST' as Position,levels:[80,90,100]},
 {club:'IT3_30',position:'ST' as Position,levels:[65,70,98]},
 {club:'EN1_18',position:'LW' as Position,levels:[90]},
];
const average=(ns:number[])=>ns.reduce((a,b)=>a+b,0)/ns.length;
const quantile=(ns:number[],q:number)=>[...ns].sort((a,b)=>a-b)[Math.floor((ns.length-1)*q)];
function cFor(clubId:string,position:Position):Career{return createCareer({name:'하부 리그 득점 검수',nationality:'대한민국',age:25,height:184,weight:80,foot:'right',position,talent:'SSS',style:PLAY_STYLES[position][0],clubId,squad:'senior',difficulty:'realistic',seed:'scoring-level-pair',training:[]});}
async function main(){const rows=[];
 for(const profile of profiles){const base=cFor(profile.club,profile.position),club=getClub(profile.club),league=getLeague(club.leagueId),ids=CLUBS.filter(c=>c.leagueId===league.id).map(c=>c.id),fixtures=makeFixtures(ids,2026).filter(f=>f.homeId===club.id||f.awayId===club.id);
  for(const level of profile.levels){const c={...base,player:{...base.player,attributes:Object.fromEntries(FIELD_ATTRIBUTES.map(k=>[k,level]))}};c.player.ovr=overall(c.player);const samples=[];
   for(let run=0;run<seasons;run++){c.seed=`lower-scoring-${run}`;let goals=0,assists=0,shots=0,onTarget=0,minutes=0,gf=0,ga=0,opposingKeeper=0,penalties=0,oneOnOnes=0,oneOnOneGoals=0,penaltyGoals=0;
    const teams=new Map(ids.map(id=>[id,{club:{...getClub(id),power:getClubWorldPower(c,id)},players:getWorldClubPlayers(c,id)}]));
    for(const f of fixtures){const h=teams.get(f.homeId)!,a=teams.get(f.awayId)!,m=simulateMatch(c,f,{home:h.club,away:a.club,homePlayers:h.players,awayPlayers:a.players,forceSelection:{from:0,to:90,started:true},detailed:false}),s=m.playerStats,own=f.homeId===club.id;
     goals+=s.goals;assists+=s.assists;shots+=s.shots;onTarget+=s.shotsOnTarget;minutes+=s.minutes;gf+=own?m.homeGoals:m.awayGoals;ga+=own?m.awayGoals:m.homeGoals;
     const keeper=m.performers!.find(p=>p.clubId===(own?a.club.id:h.club.id)&&p.position==='GK')!;opposingKeeper+=keeper.ovr;
     const events=new Map(m.events.map(e=>[e.id,e]));
     for(const e of m.events.filter(e=>e.playerId===c.player.id)){if(e.type==='shot'){penalties+=+(e.detail==='페널티킥');oneOnOnes+=+(e.detail==='일대일 슈팅');}if(e.type==='goal'){const shot=events.get(e.relatedId!);oneOnOneGoals+=+(shot?.detail==='일대일 슈팅');penaltyGoals+=+(shot?.detail==='페널티킥');}}
     if(run===0)validateActionLedger(m,c.player.id);
    }
    samples.push({goals,assists,shots,onTarget,minutes,gf,ga,opposingKeeper:opposingKeeper/fixtures.length,penalties,penaltyGoals,oneOnOnes,oneOnOneGoals});
   }
   const mean=Object.fromEntries(Object.keys(samples[0]).map(k=>[k,Number(average(samples.map(s=>s[k as keyof typeof s])).toFixed(3))]));
   const row={clubId:club.id,club:club.name,league:league.name,position:profile.position,style:c.player.style,level,fixtures:fixtures.length,seasons,forced90:true,mean,goals:{min:Math.min(...samples.map(s=>s.goals)),p50:quantile(samples.map(s=>s.goals),.5),p90:quantile(samples.map(s=>s.goals),.9),max:Math.max(...samples.map(s=>s.goals)),atLeast30:samples.filter(s=>s.goals>=30).length,atLeast40:samples.filter(s=>s.goals>=40).length},samples};rows.push(row);console.log(JSON.stringify({...row,samples:undefined}));
  }
 }
 const npc=[];
 for(const clubId of ['ES1_01','ES1_07']){const c=cFor(clubId,'ST'),league=getClub(clubId).leagueId,ids=CLUBS.filter(c=>c.leagueId===league).map(c=>c.id),fixtures=makeFixtures(ids,2026),runs=[];
  for(let run=0;run<3;run++){c.seed=`npc-lower-scoring-${run}`;const teams=new Map(ids.map(id=>[id,{club:{...getClub(id),power:getClubWorldPower(c,id)},players:getWorldClubPlayers(c,id).filter(p=>p.id!==c.player.id)}]));let goals=0,shots=0;const scorers=new Map<string,number>();
   for(const f of fixtures){const h=teams.get(f.homeId)!,a=teams.get(f.awayId)!,m=simulateMatch(c,f,{home:h.club,away:a.club,homePlayers:h.players,awayPlayers:a.players,userParticipates:false,detailed:false,recordActionEvents:false});goals+=m.homeGoals+m.awayGoals;for(const p of m.performers!){shots+=p.stats.shots;scorers.set(p.id,(scorers.get(p.id)??0)+p.stats.goals);}}
   runs.push({goalsPerGame:goals/fixtures.length,shotsPerGame:shots/fixtures.length,topScorer:Math.max(...scorers.values())});
  }npc.push({league,runs});console.log('NPC',league,JSON.stringify(runs));
 }
 await mkdir(output.slice(0,output.lastIndexOf('/')),{recursive:true});await writeFile(output,JSON.stringify({version:ENGINE_VERSION,seasons,rows,npc},null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
