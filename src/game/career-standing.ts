import {playingAbility} from './attributes';
import {getLeague} from './data';
import {clamp} from './math';
import type {Career,PlayerStats,Position} from './types';

export function observedSeasons(c:Career){
 const rows=c.history.filter(h=>h.completed&&h.year<=c.season.year&&h.year>=c.season.year-2).map(h=>({year:h.year,age:h.age,clubId:h.clubId,leagueId:h.leagueId,position:h.position,stats:h.stats,youth:h.squad==='youth',complete:true,rounds:Math.max(1,h.matches.length)}));
 if(!rows.some(h=>h.year===c.season.year))rows.push({year:c.season.year,age:c.player.age,clubId:c.player.clubId,leagueId:c.season.leagueId,position:c.player.position,stats:c.season.playerStats,youth:c.player.squad==='youth',complete:c.season.completed,rounds:c.season.totalWeeks});
 return rows.sort((a,b)=>b.year-a.year);
}
/** Position-aware observed production; never writes ability, award votes or team power. */
export function productionEvidence(s:PlayerStats,position:Position):number {
 if(!s.minutes)return 0;const per90=(n:number)=>n*90/s.minutes;
 if(position==='GK')return clamp(((s.saves/Math.max(1,s.shotsFaced??s.saves+s.goalsConceded))-.55)*2+s.cleanSheets/Math.max(1,s.apps)*.65,0,1.3);
 if(/^(CB|LB|RB|LWB|RWB|CDM)$/.test(position))return clamp(per90(s.tackles+s.interceptions)*.12+per90(s.assists+s.goals)*.8+per90(s.progressivePasses??0)*.025,0,1.3);
 if(/^(CM|CAM|LM|RM)$/.test(position))return clamp(per90(s.goals+s.assists)*1.15+per90(s.keyPasses??0)*.13,0,1.3);
 return clamp(per90(s.goals+s.assists*.75)*1.45+per90(s.pressingWins??0)*.035+per90(s.keyPasses??0)*.08+per90(s.tackles+s.interceptions)*.035,0,1.3);
}
export function careerStanding(c:Career){
 const rows=observedSeasons(c),senior=rows.filter(r=>!r.youth&&r.stats.minutes>=900),ability=playingAbility(c.player);
 let performance=0,weight=0;
 for(const r of senior){const s=r.stats,reliability=clamp(s.minutes/2200,0,1)*clamp(s.apps/24,0,1),rating=s.ratingCount?s.ratingSum/s.ratingCount:6.5;
  const w=(r.year===c.season.year?1:.7**(c.season.year-r.year))*reliability,level=1/Math.pow(getLeague(r.leagueId).tier,.65);
  performance+=(productionEvidence(s,r.position)*7+clamp((rating-6.8)*3,0,3))*level*w;weight+=w;
 }
 const worldRank=c.systems?.rankings.filter(r=>r.year>=c.season.year-1&&r.year<=c.season.year&&r.playerRank!==null).reduce((best,r)=>Math.min(best,r.playerRank!),Infinity)??Infinity;
 const recognition=worldRank<=10?3:worldRank<=30?1.5:0;
 const proven=clamp((weight?performance/weight:0)+recognition,0,12);
 return {ability,proven,worldRank:Number.isFinite(worldRank)?worldRank:null,rows,established:senior.length>=2};
}
