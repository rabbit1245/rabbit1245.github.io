import { ownLeagueRanks } from './league-leaders';
import {recordedEmployment} from './employment';
import type { Career,SeasonDetails } from './types';
export function captureSeasonDetails(c:Career):SeasonDetails|undefined{
 const s=c.systems;if(!s)return;
 const e=s.economics,p=c.player;
 const periods=recordedEmployment(c,c.season.year).filter(r=>r.clubId!=='FA');
 const employmentStandings=[...new Set(periods.map(r=>r.clubId))].flatMap(clubId=>{const period=periods.find(r=>r.clubId===clubId)!,table=s.world.competitions[period.leagueId]?.table,row=table?.find(r=>r.clubId===clubId);return row?[{clubId,leagueId:period.leagueId,rank:table!.indexOf(row)+1,played:row.played,won:row.won,drawn:row.drawn,lost:row.lost,points:row.points}]:[];});
 return {version:1,...(s.employment?{employmentStandings}:{}),...(p.playSkills?{playSkills:[...p.playSkills]}:{}),table:structuredClone(c.season.table),attributes:{...p.attributes},startAttributes:{...c.season.attributeStart},marketValue:e.marketValue,...(e.seasonStartYear===c.season.year&&e.seasonStartValue!==undefined?{seasonStartValue:e.seasonStartValue}:{}),contract:{clubId:e.contract.clubId,wage:p.wage,years:p.contractYears,signedYear:e.contract.signedYear,expiresYear:e.contract.expiresYear,role:e.contract.role},personalRanks:ownLeagueRanks(c),captain:{club:s.leadership.clubRole,national:s.leadership.nationalRole}};
}
