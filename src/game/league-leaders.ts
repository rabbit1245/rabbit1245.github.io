import { LEAGUE_AWARD_RULES } from './award-rules';
import type { Career, PlayerStats } from './types';
export interface LeagueLeader {playerId:string;name:string;clubId:string;position:string;stats:PlayerStats;rank:number}
export type LeagueMetric='goals'|'assists'|'cleanSheets';
/** Current senior league only; actual world ledgers, never national/cup totals. */
export function leagueLeaders(c:Career,metric:LeagueMetric='goals'):LeagueLeader[]{
 if(c.player.squad==='youth'||!c.systems)return [];
 const rows=new Map(Object.values(c.systems.world.playerStats).filter(r=>r.leagueId===c.season.leagueId&&r.stats.apps>0&&(metric!=='cleanSheets'||r.position==='GK')).map(r=>[r.playerId,{playerId:r.playerId,name:r.name,clubId:r.clubId,position:r.position,stats:r.stats,rank:0}]));
 if(c.season.playerStats.apps>0&&(metric!=='cleanSheets'||c.player.position==='GK'))rows.set(c.player.id,{playerId:c.player.id,name:c.player.name,clubId:c.season.matches[0]?.playerClubId??c.player.clubId,position:c.player.position,stats:c.season.playerStats,rank:0});
 const rule=LEAGUE_AWARD_RULES[c.season.leagueId]?.find(r=>r.metric===metric);
 const compare=(a:LeagueLeader,b:LeagueLeader)=>b.stats[metric]-a.stats[metric]||(rule?.tieBreak==='fewerAppsThenMinutes'?a.stats.apps-b.stats.apps||a.stats.minutes-b.stats.minutes:0);
 const ordered=[...rows.values()].sort((a,b)=>compare(a,b)||a.playerId.localeCompare(b.playerId));
 for(let i=0;i<ordered.length;i++)ordered[i].rank=i>0&&compare(ordered[i-1],ordered[i])===0?ordered[i-1].rank:i+1;
 return ordered;
}
export function ownLeagueRanks(c:Career){const own=(metric:LeagueMetric)=>c.season.playerStats[metric]>0?leagueLeaders(c,metric).find(r=>r.playerId===c.player.id)?.rank??null:null;return {goals:own('goals'),assists:own('assists'),cleanSheets:c.player.position==='GK'?own('cleanSheets'):null};}
