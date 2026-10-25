import type {Career,MatchRecord} from './types';
import {getLeagueRule} from './league-rules';
/** Calendar time, shared by every competition. A league round is not a week of international time. */
export function syncManualInjury(c:Career,date:string):void{
 const rows=c.systems?.manualInjuries;if(!rows?.length)return;
 const active=rows.find(r=>!r.returned&&!r.pendingNextSeason);
 if(!active)return;
 if(date<active.start)return;
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
 pending.end=new Date(Date.parse(pending.start)+(pending.duration==='half'?182:365)*86400000).toISOString();
 delete pending.pendingNextSeason;
}
export function recordManualAbsences(c:Career):void{
 const injuries=c.systems?.manualInjuries;if(!injuries?.length)return;
 const matches:MatchRecord[]=[...c.season.matches,...(c.systems?.clubCompetitions?.current.flatMap(t=>t.matches)??[]),...(c.systems?.national.matches??[]),...(c.systems?.national.history.filter(h=>h.year===c.season.year).flatMap(h=>h.matches)??[])];
 for(const injury of injuries){
  if(injury.pendingNextSeason)continue;
  const known=new Set(injury.missed.map(m=>m.fixtureId));
  for(const m of matches)if(m.date&&m.date>=injury.start&&m.date<injury.end&&!m.playerPlayed&&(m.scope==='national'||m.homeId===m.playerClubId||m.awayId===m.playerClubId)&&!known.has(m.fixtureId)){
   injury.missed.push({fixtureId:m.fixtureId,year:m.seasonYear,scope:m.scope==='national'?'national':'club'});known.add(m.fixtureId);
  }
 }
}
