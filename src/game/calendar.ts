import { getLeagueRule } from './league-rules';
import type { SeasonState } from './types';

const DAY=86_400_000;
const datesCache=new Map<string,string[]>();
function startOf(season:SeasonState,offset=0):Date {
  return new Date(Date.UTC(season.calendarYear??season.year,getLeagueRule(season.leagueId).startMonth-1+offset,1));
}
export function seasonHalfEndDate(season:SeasonState,half:'first'|'second'):string {
  return new Date(startOf(season,half==='first'?6:12).getTime()-DAY).toISOString();
}
/** The international model reserves these days for travel and international games. */
export function isInternationalBreak(date:string):boolean {
  const day=new Date(date),month=day.getUTCMonth()+1,d=day.getUTCDate();
  return month===6&&d>=5&&d<=25||month===11&&d>=5&&d<=15;
}
function availableDates(season:SeasonState,half:'first'|'second'):string[] {
  const start=startOf(season,half==='first'?0:6),end=new Date(seasonHalfEndDate(season,half));
  const key=`${start.toISOString()}:${half}`;
  let dates=datesCache.get(key);
  if(!dates){dates=[];for(let time=start.getTime();time<=end.getTime();time+=DAY){const date=new Date(time).toISOString();if(!isInternationalBreak(date))dates.push(date);}datesCache.set(key,dates);}
  return dates;
}
/** Distribute actual club fixtures within each local half and outside international breaks. */
export function fixtureDate(season:SeasonState,round:number):string {
  const boundary=Math.ceil(season.totalWeeks/2),first=round<=boundary,half=first?'first':'second';
  const count=first?boundary:season.totalWeeks-boundary,index=Math.max(0,Math.min(count-1,round-(first?1:boundary+1)));
  const dates=availableDates(season,half);
  return dates[Math.min(dates.length-1,Math.floor((index+.5)*dates.length/Math.max(1,count)))];
}
/** Logical season ids stay stable across leagues; displayed dates use the actual calendar. */
export function seasonDate(season:SeasonState,round=season.week):string {
  if(round<=0)return startOf(season).toISOString();
  if(round>=season.totalWeeks)return seasonHalfEndDate(season,'second');
  if(round===Math.ceil(season.totalWeeks/2))return seasonHalfEndDate(season,'first');
  return fixtureDate(season,round);
}
export function nextCalendarYear(previous:SeasonState,nextLeagueId:string):number {
  const end=new Date(seasonHalfEndDate(previous,'second')).getTime();
  let year=Math.max(previous.year+1,previous.calendarYear??previous.year);
  while(Date.UTC(year,getLeagueRule(nextLeagueId).startMonth-1,1)<=end)year++;
  return year;
}
