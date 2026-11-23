import {getClub} from './data';
import {baseShirtMarket} from './market-benchmarks';
import {cupLedger} from './club-competitions';
import {clamp} from './math';
import type {Award,Career} from './types';

const SUPER_BALLON_CRITERION='5개 확정 시즌 중 발롱도르 수상 1회 이상, 3위 이내 2회 이상, 10위 이내 3회 이상이 필요합니다. 10위 이내 시즌의 1위 대비 평가점수 65%와 순위 35%를 합산합니다.';

/** The five-season award reads finalized annual rankings, including older models. */
export function superBallonResult(c:Career){
 const year=c.season.year,start=year-4;
 if(year%5!==0)return;
 const years=(c.systems?.rankings??[]).filter(r=>r.year>=start&&r.year<=year&&r.candidates.length).sort((a,b)=>a.year-b.year);
 if(years.length!==5||years.some((row,index)=>row.year!==start+index))return {year,start,complete:false as const,rows:[]};
 const points=new Map<string,{playerId:string;name:string;points:number;wins:number;podiums:number;topTen:number}>();
 for(const r of years){
  const top=Math.max(1,r.candidates[0].score);
  for(const p of r.candidates.slice(0,10)){
   const row=points.get(p.playerId)??{playerId:p.playerId,name:p.name,points:0,wins:0,podiums:0,topTen:0};
   row.points+=100*(.65*clamp(p.score/top,0,1)+.35*(11-p.rank)/10);
   row.wins+=Number(p.rank===1);
   row.podiums+=Number(p.rank<=3);
   row.topTen++;
   points.set(p.playerId,row);
  }
 }
 const rows=[...points.values()].filter(r=>r.wins>=1&&r.topTen>=3&&r.podiums>=2)
  .sort((a,b)=>b.points-a.points||b.wins-a.wins||b.podiums-a.podiums||b.topTen-a.topTen||a.playerId.localeCompare(b.playerId));
 const player=points.get(c.player.id);
 const annualRanks=years.map(r=>({year:r.year,rank:r.candidates.find(p=>p.playerId===c.player.id)?.rank}));
 return {year,start,complete:true as const,rows,player,annualRanks};
}
export function evaluateSuperBallon(c:Career):Award[]{
 const result=superBallonResult(c);if(!result)return[];
 const current=c.systems?.rankings.find(r=>r.year===result.year),own=result.rows.findIndex(r=>r.playerId===c.player.id);
 const period=`${result.start}~${result.year} · 최근 5시즌`;
 const standings=result.complete?`내 발롱도르 순위 ${result.annualRanks.map(r=>`${r.year}년 ${r.rank?`${r.rank}위`:'후보권 밖'}`).join(' · ')}. 수상 ${result.player?.wins??0}회 · 3위 이내 ${result.player?.podiums??0}회 · 10위 이내 ${result.player?.topTen??0}회`:'';
 if(!current?.diagnostics?.some(d=>d.name==='슈퍼 발롱도르')){
  current?.diagnostics?.push({name:'슈퍼 발롱도르',scope:period,eligible:result.complete&&own>=0,
   result:!result.complete?'평가 자료 부족':own===0?'수상':own>=0?`${own+1}위 · 미선정`:'자격 미충족',
   detail:result.complete?`${SUPER_BALLON_CRITERION} ${standings}. ${own>=0?`내 누적 ${result.rows[own].points.toFixed(2)}점. `:''}${result.rows.length?`수상자 ${result.rows[0].name}.`:'수상 기준을 충족한 선수가 없습니다.'}`:'5개 연도의 확정 발롱도르 후보와 점수가 모두 있어야 평가합니다.'});
 }
 if(!result.complete||own!==0||c.awards.some(a=>a.id===`${result.year}:super-ballon:${c.player.id}`))return[];
 return [{id:`${result.year}:super-ballon:${c.player.id}`,name:'슈퍼 발롱도르',year:result.year,clubId:c.player.clubId,category:'world',rank:1,official:false,organiser:'K볼 5년 통합 평가',verification:'game-model',ruleVersion:'super-ballon-3',evaluationPeriod:period,criterion:SUPER_BALLON_CRITERION,description:`최근 5년 내 성적으로 집계 수상 · ${result.start}~${result.year} 누적 ${result.rows[0].points.toFixed(2)}점 · 자격 충족 ${result.rows.length}명 비교. ${standings}.`}];
}

export function retiredNumberStandard(clubId:string){
 const club=getClub(clubId),prestige=clamp(clamp((club.power-50)/40,0,1)*.7+clamp(Math.log10(1+baseShirtMarket(clubId))/6.5,0,1)*.3,0,1);
 return {prestige,minYears:Math.round(3+6*prestige),minApps:Math.round(100+300*prestige),threshold:55+60*prestige,minTitles:Math.round(1+4*prestige)};
}
/** Once per club, backed by actual senior appearances and that club's honours.
 * Historic stature uses catalog power/fanbase so player-led growth is not penalised. */
export function evaluateRetiredNumbers(c:Career):Award[]{
 if(c.player.squad!=='senior'||!c.systems)return[];
 const games=[...new Map([...c.history.filter(h=>h.squad==='senior').flatMap(h=>h.matches),...c.season.matches,...cupLedger(c).flatMap(t=>t.matches)].filter(m=>m.scope!=='national'&&!m.playerClubId.startsWith('NAT:')&&m.playerStats.apps>0).map(m=>[m.fixtureId,m])).values()];
 const byClub=new Map<string,typeof games>();for(const m of games){const list=byClub.get(m.playerClubId)??[];list.push(m);byClub.set(m.playerClubId,list);}
 const past=[...c.awards,...c.history.flatMap(h=>h.awards)],awards:Award[]=[];
 for(const [clubId,matches]of byClub){
  if(clubId==='FA'||past.some(a=>a.clubId===clubId&&(a.category==='club-legacy'||a.id===`retired-number:${clubId}:${c.player.id}`)))continue;
  const standard=retiredNumberStandard(clubId),seasonMinutes=new Map<number,number>();for(const m of matches)seasonMinutes.set(m.seasonYear,(seasonMinutes.get(m.seasonYear)??0)+m.playerStats.minutes);
  const years=[...seasonMinutes].filter(([,minutes])=>minutes>=900).map(([year])=>year),apps=matches.length;
  const ratingCount=matches.reduce((n,m)=>n+m.playerStats.ratingCount,0),rating=ratingCount?matches.reduce((n,m)=>n+m.playerStats.ratingSum,0)/ratingCount:0;
  const own=[...new Map(past.filter(a=>a.clubId===clubId).map(a=>[a.id,a])).values()];
  const titles=[...new Map(own.filter(a=>a.category==='team'&&/우승/.test(a.name)&&!/준우승/.test(a.name)).map(a=>[`${a.year}:${a.name.replace(/\s*메달$/,'')}`,a])).values()];
  const major=titles.filter(a=>/챔피언스|챔피언스리그|유로파|리베르타도레스|클럽 월드컵/.test(a.name)).length;
  const captainYears=years.filter(year=>c.systems!.leadership.terms.some(t=>t.scope==='club'&&t.teamId===clubId&&t.role!=='match'&&t.startYear<=year&&(t.endYear??c.season.year)>=year)).length;
  const clubPrizes=own.filter(a=>a.category==='club'&&/올해의 선수/.test(a.name)).length;
  const historic=c.history.filter(h=>h.clubId===clubId&&h.completed&&h.rank===1&&(h.details?.clubDevelopment?.expectedRank??0)>=6).length;
  const score=years.length*3+apps*.055+clamp((rating-6.5)*15,0,22)+titles.length*(3+2*standard.prestige)+major*7+Math.min(12,clubPrizes*2)+Math.min(12,captainYears*2)+Math.min(24,historic*12);
  const established=years.length>=standard.minYears&&apps>=standard.minApps;
  const longService=years.length>=standard.minYears+3&&apps>=standard.minApps*1.25&&rating>=7&&captainYears>=2;
  const historicRise=standard.prestige<.55&&years.length>=3&&apps>=90&&historic>=1&&titles.length>=1;
  if(rating<6.9||score<standard.threshold||!(historicRise||established&&(titles.length>=standard.minTitles||major>=2||clubPrizes>=3)||longService))continue;
  awards.push({id:`retired-number:${clubId}:${c.player.id}`,name:`${getClub(clubId).name} 영구결번`,year:c.season.year,clubId,category:'club-legacy',official:false,organiser:`${getClub(clubId).name} 구단 역사 평가`,verification:'game-model',ruleVersion:'retired-number-1',evaluationPeriod:`해당 구단의 누적 성인 경력 · ${c.season.year}년 평가`,criterion:`구단 역사적 위상에 따른 장기 재적·실제 경기 기여·우승·주장·구단 개인상·약체의 역사적 우승을 종합. 기본 ${standard.minYears}시즌·${standard.minApps}경기·평가 ${standard.threshold.toFixed(1)}점, 역사적 도약/장기 헌신 경로 별도. 구단당 1회.`,description:`해당 구단 ${years.length}시즌 · ${apps}경기 · 평점 ${rating.toFixed(2)} · 팀 우승 ${titles.length}회 · 주장단 ${captainYears}시즌 · 역사 평가 ${score.toFixed(1)}점. 실제 구단의 등번호 운영 규정과 구별하는 K볼 특별 영구결번 수상입니다.`});
 }
 return awards;
}
export const retirementAwardName=(a:Award)=>a.name==='슈퍼 발롱도르'?'슈퍼 발롱도르(최근 5년 내 성적으로 집계 수상)':a.name;
