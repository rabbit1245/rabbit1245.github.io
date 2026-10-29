import { AWARD_MODEL_VERSION, type AwardRule } from './award-rules';
import { selectEleven } from './award-selection';
import { tournamentPerformance } from './tournament-awards';
import type { BallonDorYear, ClubTournament, CompetitorSeason } from './revision-types';
import type { Award, Career } from './types';
import {performanceBaselines} from './performance-profile';

const uefaPaths:Record<string,string>={UCL:'uefachampionsleague',UEL:'uefaeuropaleague',UECL:'uefaconferenceleague'};
type Diagnostic=NonNullable<BallonDorYear['diagnostics']>[number];

export function clubAwardRules(t:ClubTournament):AwardRule[] {
  if(t.kind!=='continental'||t.format==='super'||t.format==='intercontinental')return [];
  const path=uefaPaths[t.id.split(':')[0]],worldCup=t.id.startsWith('CLUB_WORLD_CUP:');
  const sourceUrl=path?`https://www.uefa.com/${path}/`:worldCup?'https://www.fifa.com/':'',organiser=path?'UEFA':worldCup?'FIFA':'해당 대륙 축구연맹';
  const rules:AwardRule[]=[{id:'player-season',name:worldCup?'FIFA 클럽 월드컵 골든볼':`${t.name} 시즌의 선수`,metric:'performance',organiser,sourceUrl,criterion:'해당 대회만의 실제 출전·평점·포지션별 기여·징계로 선정하는 게임 투표 모형. 능력치·리그·다른 컵·국대 기록은 제외합니다.'}];
  if(path)rules.push(
    {id:'top-scorer',name:`${t.name} 득점왕`,metric:'goals',organiser,sourceUrl:`${sourceUrl}statistics/players/goals/`,criterion:'해당 대회 실제 최다 득점. 득점 동률은 공동 수상하며 승부차기·리그·다른 컵·국대 득점은 제외합니다.'},
    {id:'season-eleven',name:`${t.name} 시즌 베스트 11`,metric:'eleven',formation:{defenders:4,midfielders:3,forwards:3},organiser,sourceUrl,criterion:'해당 대회 실제 출전 기록으로 GK 1·DF 4·MF 3·FW 3을 비교하는 게임 선정 모형. 최소 출전·포지션별 기여·평점·징계를 반영하며 능력치는 사용하지 않습니다.'},
  );
  return rules;
}

/** Uses the all-participant cup ledger, including eliminated teams. Pure and evaluated only at completion. */
export function evaluateClubAwards(c:Career,t:ClubTournament):{awards:Award[];diagnostics:Diagnostic[]} {
  const awards:Award[]=[],diagnostics:Diagnostic[]=[],rules=clubAwardRules(t);
  if(!rules.length)return {awards,diagnostics};
  const rows=Object.values(t.playerStats??{}).filter(r=>r.stats.apps>0&&r.stats.minutes>0);
  const own=rows.find(r=>r.playerId===c.player.id),completed=t.phase==='completed'&&t.year===c.season.year;
  const minApps=Math.max(2,Math.ceil(Math.max(1,...rows.map(r=>r.stats.apps))*.5));
  const baselines=performanceBaselines(rows.filter(r=>r.stats.apps>=minApps),90),scores=new Map(rows.map(r=>[r.playerId,tournamentPerformance({id:r.playerId,...r},baselines)]));
  const score=(r:CompetitorSeason)=>scores.get(r.playerId)??0;
  const ranking=rows.filter(r=>r.stats.apps>=minApps&&r.stats.minutes>=90).sort((a,b)=>score(b)-score(a)||a.playerId.localeCompare(b.playerId));
  const eleven=selectEleven(ranking,4,3,3),topGoals=Math.max(0,...rows.map(r=>r.stats.goals));
  const dates=t.fixtures.filter(f=>f.played&&f.date).map(f=>f.date!.slice(0,10)).sort();
  const period=dates.length?`해당 대회 ${dates[0]} ~ ${dates.at(-1)}`:`${t.year}시즌 해당 대회`;
  for(const rule of rules){
    const qualified=!!own&&c.player.squad==='senior'&&(rule.metric==='goals'||ranking.some(r=>r.playerId===own.playerId))&&(rule.metric!=='eleven'||eleven.length===11);
    const selected=qualified&&(rule.metric==='goals'?topGoals>0&&own!.stats.goals===topGoals:rule.metric==='eleven'?eleven.some(r=>r.playerId===own!.playerId):ranking[0]?.playerId===own!.playerId);
    const id=`${t.id}:${rule.id}:${c.player.id}`;
    const detail=rule.metric==='goals'?`실제 해당 대회 ${own?.stats.goals??0}골 · 출전 선수 ${rows.length}명 비교${topGoals>0&&rows.filter(r=>r.stats.goals===topGoals).length>1?' · 최다 득점 동률 공동 수상':''}`:`실제 해당 대회 ${own?.stats.apps??0}경기 · ${own?.stats.minutes??0}분 · 평점 ${(own?.stats.ratingCount?own.stats.ratingSum/own.stats.ratingCount:0).toFixed(2)} · 최소 ${minApps}경기·90분 · 자격 충족 ${ranking.length}명 역할별 비교${rule.metric==='eleven'?' · GK 1·DF 4·MF 3·FW 3':''}`;
    if(completed&&selected)awards.push({id,year:t.year,clubId:own!.clubId,name:rule.name,category:'continental-individual',organiser:rule.organiser,...(rule.sourceUrl?{sourceUrl:rule.sourceUrl}:{}),criterion:rule.criterion,official:!!uefaPaths[t.id.split(':')[0]]||t.id.startsWith('CLUB_WORLD_CUP:'),position:own!.position,ruleVersion:AWARD_MODEL_VERSION,verification:'game-model',evaluationPeriod:period,description:`${detail}. 해당 대회 기록만 사용하며 리그·다른 컵·국대·승부차기 득점은 제외하는 게임 내 평가.`});
    diagnostics.push({name:rule.name,scope:'해당 대회만',eligible:completed&&qualified,result:!completed?'평가 대기':c.awards.some(a=>a.id===id)?'수상':selected?'평가 기록 없음':'미선정',detail:`${detail} · ${!completed?'대회 종료 후 확정':!own?'해당 대회 실제 출전 기록 없음':!qualified?'출전 또는 포지션별 선수 기록 기준 미충족':'대회 완료'} · ${rule.criterion}`});
  }
  return {awards,diagnostics};
}
