import { clamp,round } from './math';
import type { Career,Standing } from './types';
import type { ClubWorld,ClubSeasonDevelopment,ClubStarContribution,CompetitorSeason } from './revision-types';
function observedStar(c:Career,club:ClubWorld,played:number,observed?:CompetitorSeason[]):ClubStarContribution|undefined{
 if(played<=0)return;
 const world=c.systems!.world,base=club.development?.basePower??club.power;
 const candidates=(observed??Object.values(world.playerStats)).filter(row=>row.clubId===club.id&&row.leagueId===club.leagueId)
   .map(row=>({id:row.playerId,name:row.name,position:row.position,ovr:row.ovr,stats:row.stats}));
 const h=c.history.find(h=>h.year===world.year&&h.clubId===club.id&&h.squad==='senior');
 const user=h?{id:c.player.id,name:c.player.name,position:h.position,ovr:h.ovrEnd,stats:h.stats}:
   c.player.clubId===club.id&&c.player.squad==='senior'?{id:c.player.id,name:c.player.name,position:c.player.position,ovr:c.player.ovr,stats:c.season.playerStats}:undefined;
 if(user&&!candidates.some(row=>row.id===user.id))candidates.push(user);
 const rows=candidates.flatMap(row=>{
  const s=row.stats;if(s.apps<8||s.minutes<Math.max(720,played*90*.35)||!s.ratingCount)return [];
  const rating=s.ratingSum/s.ratingCount;
  const ratingScale=['GK','CB','LB','RB','LWB','RWB','CDM'].includes(row.position)?.8:1;
  const influence=round(clamp((row.ovr-base-4)/12,0,1)*clamp((rating-6.2)/ratingScale,0,1)*clamp(s.minutes/(played*90),0,1),3);
  return influence>0?[{playerId:row.id,name:row.name,position:row.position,ovr:row.ovr,apps:s.apps,minutes:s.minutes,rating:round(rating),influence,retained:club.rosterIds.includes(row.id)&&world.players[row.id]?.clubId===club.id}]:[];
 });
 return rows.sort((a,b)=>b.influence-a.influence||a.playerId.localeCompare(b.playerId))[0];
}
/** Snapshot the actual roster before results arrive; an old save has no invented start. */
export function beginClubDevelopment(c:Career,initial=false):void{
 const w=c.systems?.world;if(!w)return;
 for(const comp of Object.values(w.competitions)){
  const ordered=comp.table.map(row=>w.clubs[row.clubId]).sort((a,b)=>b.power-a.power||a.id.localeCompare(b.id));
  for(const [index,club] of ordered.entries()){
   club.development??={basePower:club.power,prestige:club.power,baselineYear:w.year,baselinePower:club.power,expectedRank:null,history:[]};
   const d=club.development;d.baselineYear=w.year;d.baselinePower=club.power;d.expectedRank=initial&&comp.round>0?null:index+1;
  }
 }
}
export function assessClubSeason(c:Career,club:ClubWorld,table:Standing[],completed:boolean,observed?:CompetitorSeason[]):ClubSeasonDevelopment{
 const w=c.systems!.world,rank=table.findIndex(row=>row.clubId===club.id)+1,row=table[rank-1],d=club.development,teams=table.length;
 const expected=d?.baselineYear===w.year?d.expectedRank:null,finish=teams>1?(teams-rank)/(teams-1):0;
 const surprise=expected===null?0:clamp((expected-rank)/Math.max(1,teams-1),0,1);
 const earned=completed&&row&&row.played>0?clamp(Math.max(0,finish-.45)*.12+(rank===1?.065:0)+surprise*.10,0,.22):0;
 const before=d?.prestige??club.power,leagueLevel=clamp(club.power+(completed?(finish-.5)*12:0),25,95);
 const prestige=completed?round(clamp(before+(leagueLevel-before)*.12+(rank===1?.35:0),25,95)):before;
 const user=c.history.find(h=>h.year===w.year&&h.clubId===club.id&&h.squad==='senior');
 const stats=user?.stats??(c.player.clubId===club.id&&c.player.squad==='senior'?c.season.playerStats:undefined);
 const star=completed?observedStar(c,club,row?.played??0,observed):undefined;
 return {year:w.year,leagueId:club.leagueId,rank:Math.max(1,rank),expectedRank:expected,points:row?.points??0,teams,bonus:Math.round(club.revenue*(earned+(star?.influence??0)*.035)),reinvestment:0,beforePower:club.power,afterPower:club.power,prestigeBefore:before,prestigeAfter:prestige,improvedPlayers:0,recruits:0,...(star?{star}:{}),...(stats&&stats.apps>0?{userContribution:{apps:stats.apps,minutes:stats.minutes,goals:stats.goals,assists:stats.assists,rating:stats.ratingCount?round(stats.ratingSum/stats.ratingCount):0}}:{})};
}
