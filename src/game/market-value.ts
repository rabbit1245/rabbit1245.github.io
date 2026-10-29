import {getClub,getLeague} from './data';
import {playingAbility} from './attributes';
import {personalityEdge} from './personality';
import {clamp} from './math';
import {observedSeasons,careerStanding} from './career-standing';
import type {Career} from './types';
import type {MarketAssessment} from './revision-types';

/** A fundamental estimate; the quoted market price moves only after new evidence. */
export function marketEstimate(c:Career):number {
 const p=c.player,ability=playingAbility(p),rows=observedSeasons(c),leagueId=c.systems?.world.clubs[p.clubId]?.leagueId??c.season.leagueId,league=getLeague(leagueId),tier=league.tier;
 const youth=p.age<=23?1.15+(23-p.age)*.025:p.age>29?Math.max(.42,1-(p.age-29)*.04):1.1;
 const quality=Math.pow(Math.max(10,ability-25),3.35)*20,potential=1+Math.max(0,p.potential-ability)/65;
 let form=0,exposure=0,total=0,breakout=1;
 for(const row of rows){
  const s=row.stats,age=row.age,yearGap=c.season.year-row.year;
  const w=(yearGap===0?1:.75**yearGap)*(yearGap===0&&!s.minutes?clamp(c.season.week/c.season.totalWeeks,0,1):1);
  if(w){const rating=s.ratingCount?s.ratingSum/s.ratingCount:6.5,per90=s.minutes?(s.goals+s.assists*.75)*90/s.minutes:0;
   form+=(s.apps?clamp(.76+rating/18+Math.min(.28,per90*.22),.6,1.6):.9)*w;
   const rounds=row.complete?row.rounds:Math.max(1,c.season.week);
   exposure+=(.65+.35*clamp(s.minutes/Math.max(90,rounds*70),0,1))*w;total+=w;
  }
  if(row.youth)continue;
  const rowLeague=getLeague(row.leagueId),major=rowLeague.tier===1&&['영국','스페인','독일','이탈리아','프랑스'].includes(rowLeague.country);
  const projection=row.complete?1:clamp(2700/Math.max(1350,s.minutes),1,2),production=row.position==='GK'?clamp((s.cleanSheets*projection-6)/10,0,1.3):clamp((s.goals+s.assists*.8)*projection/13-10/13,0,1.3);
  const reliability=clamp(s.minutes/2200,0,1)*clamp(s.apps/24,0,1),retention=yearGap===0?1:Math.pow(.94,yearGap);
  // A breakout reputation survives birthdays; it is not erased at age 24 or round zero.
  breakout=Math.max(breakout,1+clamp((24-age)/5,0,1.2)*1.25*production*reliability*(major?1:.6/Math.pow(rowLeague.tier,1.5))*retention);
 }
 const power=c.systems?.world.clubs[p.clubId]?.power??getClub(p.clubId).power,prestige=(.45+power/100)/Math.sqrt(tier),international=1+Math.min(.15,(c.systems?.national.reputation??0)/650),injury=Math.max(.7,1-p.injuryWeeks*.015);
 const standing=careerStanding(c),recognition=standing.worldRank!==null&&standing.worldRank<=30?1+(.06+(31-standing.worldRank)/300):1;
 // Actual top-level success reinforces a demonstrated player; medals alone do not price a reserve as a star.
 const trophies=c.awards.filter(a=>a.year>=c.season.year-1&&a.category==='team').length,achievement=1+Math.min(.08,trophies*.012)*clamp(standing.proven/7,0,1);
 return Math.max(1000,Math.min(350000000,Math.round(quality*youth*potential*(total?form/total:.9)*(total?exposure/total:.65)*prestige*international*injury*breakout*recognition*achievement*(1+personalityEdge(c,'stardom')*.06)/1000)*1000));
}
export function assessmentNow(c:Career):MarketAssessment{
 return {year:c.season.year,round:c.season.week,totalRounds:c.season.totalWeeks,ability:playingAbility(c.player),injuryWeeks:c.player.injuryWeeks,stardom:c.systems?.personality?.stardom??5};
}
export function marketQuote(c:Career):number {
 const e=c.systems?.economics;if(!e)return marketEstimate(c);
 const a=e.assessment;if(!a)return e.marketValue;
 const now=assessmentNow(c),elapsed=Math.max(0,now.year-a.year+now.round/now.totalRounds-a.round/a.totalRounds),progress=clamp(elapsed*2,0,1);
 const freshInjury=Math.max(0,now.injuryWeeks-a.injuryWeeks),starChange=now.stardom-a.stardom;
 if(progress===0&&freshInjury<4&&starChange<=0)return e.marketValue;
 const target=marketEstimate(c),up=target>=e.marketValue;
 const firstBreakout=c.history.filter(h=>h.completed&&h.stats.minutes>=1800).length<2;
 const rate=up?(firstBreakout?.95:.55)*progress:.3*progress;
 const eventRate=freshInjury>=4?Math.min(.18,freshInjury*.01):starChange>0?.06:0;
 let value=e.marketValue+(target-e.marketValue)*Math.max(rate,eventRate);
 const retained=now.ability>=a.ability-2,young=c.player.age<=29;
 const maxDrop=(retained&&young?.12:.35)*clamp(elapsed,0,1)+Math.min(.15,freshInjury*.01);
 const floor=Math.ceil(e.marketValue*(1-maxDrop)/1000)*1000;
 value=Math.max(floor,value);
 return Math.max(1000,Math.min(350000000,Math.round(value/1000)*1000));
}
