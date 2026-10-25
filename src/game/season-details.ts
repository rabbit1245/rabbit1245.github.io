import { ownLeagueRanks } from './league-leaders';
import type { Career,SeasonDetails } from './types';
export function captureSeasonDetails(c:Career):SeasonDetails|undefined{
 const s=c.systems;if(!s)return;
 const e=s.economics,p=c.player;
 return {version:1,...(p.playSkills?{playSkills:[...p.playSkills]}:{}),table:structuredClone(c.season.table),attributes:{...p.attributes},startAttributes:{...c.season.attributeStart},marketValue:e.marketValue,...(e.seasonStartYear===c.season.year&&e.seasonStartValue!==undefined?{seasonStartValue:e.seasonStartValue}:{}),contract:{clubId:e.contract.clubId,wage:p.wage,years:p.contractYears,signedYear:e.contract.signedYear,expiresYear:e.contract.expiresYear,role:e.contract.role},personalRanks:ownLeagueRanks(c),captain:{club:s.leadership.clubRole,national:s.leadership.nationalRole}};
}
