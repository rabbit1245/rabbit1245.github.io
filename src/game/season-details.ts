import { ownLeagueRanks } from './league-leaders';
import {recordedEmployment} from './employment';
import type { Career,SeasonDetails } from './types';
export function captureSeasonDetails(c:Career):SeasonDetails|undefined{
 const s=c.systems;if(!s)return;
 const e=s.economics,p=c.player;
 const periods=recordedEmployment(c,c.season.year).filter(r=>r.clubId!=='FA');
 const employmentStandings=[...new Map(periods.map(period=>[period.clubId,period])).values()].flatMap(({clubId,leagueId})=>{
  const archived=s.youthLeagueSchedules?.[leagueId];
  const table=p.squad==='youth'?(leagueId===c.season.leagueId?c.season.table:archived?.table):s.world.competitions[leagueId]?.table;
  const rank=table?.findIndex(row=>row.clubId===clubId)??-1;
  if(!table||rank<0)return [];
  const {played,won,drawn,lost,points}=table[rank];
  return [{clubId,leagueId,rank:rank+1,played,won,drawn,lost,points,...(archived?{atDeparture:true as const}:{})}];
 });
 return {version:1,...(p.abilityVersion?{abilityVersion:p.abilityVersion,ovrVersion:p.ovrVersion,...(c.season.ovrVersion!==undefined?{startOvrVersion:c.season.ovrVersion}:{}),skillMastery:{...p.skillMastery}}:{}),...(s.employment?{employmentStandings}:{}),...(p.playSkills?{playSkills:[...p.playSkills]}:{}),table:structuredClone(c.season.table),attributes:{...p.attributes},startAttributes:{...c.season.attributeStart},marketValue:e.marketValue,...(e.seasonStartYear===c.season.year&&e.seasonStartValue!==undefined?{seasonStartValue:e.seasonStartValue}:{}),contract:{clubId:e.contract.clubId,wage:p.wage,years:p.contractYears,signedYear:e.contract.signedYear,expiresYear:e.contract.expiresYear,role:e.contract.role},personalRanks:ownLeagueRanks(c),captain:{club:s.leadership.clubRole,national:s.leadership.nationalRole}};
}
