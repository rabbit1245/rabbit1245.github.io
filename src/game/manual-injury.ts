import type {Career,MatchRecord} from './types';
import {seasonHalfEndDate} from './calendar';
import {getLeagueRule} from './league-rules';
/** Calendar time, shared by every competition. A league round is not a week of international time. */
export function syncManualInjury(c:Career,date:string):void{
 const rows=c.systems?.manualInjuries;if(!rows?.length)return;
 const active=rows.find(r=>!r.returned&&!r.pendingNextSeason);
 if(!active)return;
 recordManualAbsences(c);
 if(date<active.start)return;
 if(active.selectionVersion===2){
  if((active.remainingMatches!==undefined&&active.remainingMatches<=0)||date>=active.end){c.player.injuryWeeks=0;active.end=active.remainingMatches===0?new Date(Date.parse(active.missed.at(-1)?.date??date)+1).toISOString():active.end;active.returned=active.end;}
  else c.player.injuryWeeks=Math.max(1,c.player.injuryWeeks);
  return;
 }
 if(date<active.end)c.player.injuryWeeks=Math.max(c.player.injuryWeeks,Math.max(1,Math.ceil((Date.parse(active.end)-Date.parse(date))/604800000)));
 else {c.player.injuryWeeks=0;active.returned=active.end;}
}
export function activatePendingInjury(c:Career):void{
 const pending=c.systems?.manualInjuries?.find(r=>r.pendingNextSeason&&!r.returned);if(!pending)return;
 const ruleStart=c.season.calendarYear??c.season.year;
 const league=c.season.leagueId;
 // Date selection uses the actual destination league after transfers and calendar conversion.
 pending.year=c.season.year;pending.clubId=c.player.clubId;
 pending.start=new Date(Date.UTC(ruleStart,getLeagueRule(league).startMonth-1,1)).toISOString();
 pending.end=pending.selectionVersion===2?new Date(Date.parse(seasonHalfEndDate(c.season,'second'))+86400000).toISOString():new Date(Date.parse(pending.start)+(pending.duration==='half'?182:365)*86400000).toISOString();
 delete pending.pendingNextSeason;
}
export function recordManualAbsences(c:Career):void{
 const injuries=c.systems?.manualInjuries;if(!injuries?.length)return;
 const matches:MatchRecord[]=[...c.season.matches,...(c.systems?.clubCompetitions?.current.flatMap(t=>t.matches)??[]),...(c.systems?.national.matches??[]),...(c.systems?.national.history.filter(h=>h.year===c.season.year).flatMap(h=>h.matches)??[])].sort((a,b)=>(a.date??'').localeCompare(b.date??''));
 for(const injury of injuries){
  if(injury.pendingNextSeason||matches[0]?.date&&injury.end<=matches[0].date)continue;
  const known=new Set(injury.missed.map(m=>m.fixtureId));
  for(const m of matches)if(m.date&&m.date>=injury.start&&m.date<injury.end&&!m.playerPlayed&&(m.scope==='national'||m.homeId===m.playerClubId||m.awayId===m.playerClubId)&&!known.has(m.fixtureId)&&(injury.selectionVersion!==2||injury.remainingMatches===undefined||injury.remainingMatches>0)){
   injury.missed.push({fixtureId:m.fixtureId,year:m.seasonYear,scope:m.scope==='national'?'national':'club',...(m.date?{date:m.date}:{})});known.add(m.fixtureId);
   if(injury.selectionVersion===2&&injury.remainingMatches!==undefined&&m.scope!=='national')injury.remainingMatches=Math.max(0,injury.remainingMatches-1);
  }
 }
}
