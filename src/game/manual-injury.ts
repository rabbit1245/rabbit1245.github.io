import type {Career,MatchRecord} from './types';
import {seasonHalfEndDate} from './calendar';
import {getLeagueRule} from './league-rules';
const WEEK_MS=7*86_400_000;
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
 if(date<active.end)c.player.injuryWeeks=Math.max(c.player.injuryWeeks,Math.max(1,Math.ceil((Date.parse(active.end)-Date.parse(date))/WEEK_MS)));
 else {c.player.injuryWeeks=0;active.returned=active.end;}
}

/** For a recorded match injury, use the same return date in every competition.
 * Older saves without a dated appearance keep their league-round countdown. */
export function syncPlayerInjury(c:Career,date:string):boolean{
 syncManualInjury(c,date);
 if(c.systems?.manualInjuries?.some(r=>!r.returned&&!r.pendingNextSeason))return true;
 if(c.player.injuryWeeks<=0)return false;
 const now=Date.parse(date);
 if(!Number.isFinite(now))return false;
 let lastTime=-Infinity,lastWeeks=0;
 const read=(matches:readonly MatchRecord[])=>{
  for(const match of matches){
   if(!match.playerPlayed||!match.date)continue;
   const time=Date.parse(match.date),weeks=match.effects?.injuryWeeksAfter??0;
   if(time>lastTime||time===lastTime&&weeks>lastWeeks){lastTime=time;lastWeeks=weeks;}
  }
 };
 const recent=c.season.year-1;
 read(c.season.matches);
 for(const h of c.history.slice(-2))if(h.year>=recent)read(h.matches);
 const cups=c.systems?.clubCompetitions;
 for(const cup of cups?.current??[])read(cup.matches);
 for(const cup of cups?.history??[])if(cup.year>=recent)read(cup.matches);
 const national=c.systems?.national;
 if(national){
  read(national.matches);
  for(const row of national.history)if(row.year>=recent)read(row.matches);
 }
 if(!lastWeeks)return false;
 if(now>=lastTime)c.player.injuryWeeks=Math.max(0,Math.ceil((lastTime+lastWeeks*WEEK_MS-now)/WEEK_MS));
 return true;
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
