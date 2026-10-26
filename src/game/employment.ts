import type {Career} from './types';
import type {EmploymentPeriod} from './revision-types';
import {getClub,getLeague} from './data';
import {sumStats} from './math';
export const isFreeAgent=(c:Career)=>c.player.clubId==='FA';
/** An expired contract can be renewed in the same summer, after FA takes effect.
 * A voluntary release or a later FA half-season is not an automatic renewal. */
export function expiryReturnClub(c:Career):string|undefined{
 if(!isFreeAgent(c)||c.stage!=='offseason')return;
 const period=c.systems?.employment?.at(-1),last=c.systems?.economics.contractHistory?.at(-1);
 if(period?.reason==='expiry'&&last?.type==='release'&&last.year===c.season.year&&last.effective==='nextSeason'&&last.previous?.clubId!=='FA')return last.previous?.clubId;
}
export function recordedEmployment(c:Career,year:number):EmploymentPeriod[]{
 return (c.systems?.employment??[]).filter(r=>r.year===year&&(r.toRound??(year===c.season.year?c.season.week:r.totalRounds))>r.fromRound);
}
/** A free-agent signing can split one season across leagues. Never reassign old goals. */
export function careerLeagueEntries(c:Career){
 if(!c.systems?.employment)return [{leagueId:c.season.leagueId,clubId:c.player.clubId,stats:c.season.playerStats}];
 const matches=c.season.matches,ids=[...new Set(matches.map(m=>m.competitionId??c.season.leagueId))];
 return ids.map(leagueId=>{const games=matches.filter(m=>(m.competitionId??c.season.leagueId)===leagueId),clubs=[...new Set(games.map(m=>m.playerClubId))];
  const clubId=clubs.sort((a,b)=>sumStats(games.filter(m=>m.playerClubId===b).map(m=>m.playerStats)).minutes-sumStats(games.filter(m=>m.playerClubId===a).map(m=>m.playerStats)).minutes)[0];
  return {leagueId,clubId,stats:sumStats(games.map(m=>m.playerStats))};
 });
}
/** Keep real employment intervals, independently of league rounds and match logs. */
export function beginEmployment(c:Career):void{
 const rows=c.systems!.employment??=[];
 const opening=rows.find(r=>r.year===c.season.year&&r.toRound===undefined&&r.fromRound===0&&r.clubId===c.player.clubId);
 if(c.season.week===0&&opening){opening.leagueId=c.season.leagueId;opening.totalRounds=c.season.totalWeeks;opening.wage=c.player.wage;}
 if(!rows.some(r=>r.year===c.season.year))rows.push({year:c.season.year,totalRounds:c.season.totalWeeks,fromRound:0,clubId:c.player.clubId,leagueId:c.season.leagueId,wage:c.player.wage,reason:'continued'});
}
export function changeEmployment(c:Career,clubId:string,leagueId:string,wage:number,reason:EmploymentPeriod['reason'],nextSeason=false):void{
 beginEmployment(c);
 const year=c.season.year+Number(nextSeason),round=nextSeason?0:c.season.week;
 const rows=c.systems!.employment!;
 for(const row of rows)if(row.toRound===undefined){row.toRound=row.year===year?round:row.totalRounds;}
 rows.push({year,totalRounds:c.systems!.world.competitions[leagueId]?.totalRounds??c.season.totalWeeks,fromRound:round,clubId,leagueId,wage,reason});
}
export function employmentLines(c:Career,year:number):string[]{
 const rows=c.systems?.employment?.filter(r=>r.year===year)??[];
 const h=c.history.find(r=>r.year===year);
 const fallbackTotal=h?.details?.table[0]?.played??c.season.totalWeeks;
 return rows.flatMap(r=>{
  const total=r.totalRounds??fallbackTotal,half=Math.ceil(total/2);
  const end=r.toRound??(year===c.season.year?c.season.week:total);
  if(end<=r.fromRound)return [];
  const label=r.clubId==='FA'?'FA · 무소속 (클럽 출전·급여 없음)':`${getClub(r.clubId).name} · ${getLeague(r.leagueId).name}`;
  if(r.clubId!=='FA')return [`R${r.fromRound}–${end} · ${label}`];
  return [r.fromRound<half?`전반기 · R${r.fromRound}–${Math.min(end,half)} · ${label}`:null,end>half?`후반기 · R${Math.max(r.fromRound,half)}–${end} · ${label}`:null].filter((s):s is string=>!!s);
 });
}
