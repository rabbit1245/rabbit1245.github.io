import { clamp,round } from './math';
import type { Career,Standing } from './types';
import type { ClubWorld,ClubSeasonDevelopment } from './revision-types';
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
export function assessClubSeason(c:Career,club:ClubWorld,table:Standing[],completed:boolean):ClubSeasonDevelopment{
 const w=c.systems!.world,rank=table.findIndex(row=>row.clubId===club.id)+1,row=table[rank-1],d=club.development,teams=table.length;
 const expected=d?.baselineYear===w.year?d.expectedRank:null,finish=teams>1?(teams-rank)/(teams-1):0;
 const surprise=expected===null?0:clamp((expected-rank)/Math.max(1,teams-1),0,1);
 const earned=completed&&row&&row.played>0?clamp(Math.max(0,finish-.45)*.12+(rank===1?.065:0)+surprise*.10,0,.22):0;
 const before=d?.prestige??club.power,leagueLevel=clamp(club.power+(completed?(finish-.5)*12:0),25,95);
 const prestige=completed?round(clamp(before+(leagueLevel-before)*.12+(rank===1?.35:0),25,95)):before;
 const user=c.history.find(h=>h.year===w.year&&h.clubId===club.id&&h.squad==='senior');
 const stats=user?.stats??(c.player.clubId===club.id&&c.player.squad==='senior'?c.season.playerStats:undefined);
 return {year:w.year,leagueId:club.leagueId,rank:Math.max(1,rank),expectedRank:expected,points:row?.points??0,teams,bonus:Math.round(club.revenue*earned),reinvestment:0,beforePower:club.power,afterPower:club.power,prestigeBefore:before,prestigeAfter:prestige,improvedPlayers:0,recruits:0,...(stats&&stats.apps>0?{userContribution:{apps:stats.apps,minutes:stats.minutes,goals:stats.goals,assists:stats.assists,rating:stats.ratingCount?round(stats.ratingSum/stats.ratingCount):0}}:{})};
}
