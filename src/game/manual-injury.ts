import type {Career,MatchRecord} from './types';
/** Calendar time, shared by every competition. A league round is not a week of international time. */
export function syncManualInjury(c:Career,date:string):void{
 const rows=c.systems?.manualInjuries;if(!rows?.length)return;
 const active=rows.find(r=>!r.returned);
 if(!active)return;
 if(date<active.start)return;
 if(date<active.end)c.player.injuryWeeks=Math.max(c.player.injuryWeeks,Math.max(1,Math.ceil((Date.parse(active.end)-Date.parse(date))/604800000)));
 else {c.player.injuryWeeks=0;active.returned=active.end;}
}
export function recordManualAbsences(c:Career):void{
 const injuries=c.systems?.manualInjuries;if(!injuries?.length)return;
 const matches:MatchRecord[]=[...c.season.matches,...(c.systems?.clubCompetitions?.current.flatMap(t=>t.matches)??[]),...(c.systems?.national.matches??[]),...(c.systems?.national.history.filter(h=>h.year===c.season.year).flatMap(h=>h.matches)??[])];
 for(const injury of injuries){
  const known=new Set(injury.missed.map(m=>m.fixtureId));
  for(const m of matches)if(m.date&&m.date>=injury.start&&m.date<injury.end&&!m.playerPlayed&&!known.has(m.fixtureId)){
   injury.missed.push({fixtureId:m.fixtureId,year:m.seasonYear,scope:m.scope==='national'?'national':'club'});known.add(m.fixtureId);
  }
 }
}
