import { FIFA_TOURNAMENT_AWARD_RULES, AWARD_MODEL_VERSION } from './award-rules';
import { addStats, emptyStats } from './math';
import type { Award, Career, MatchRecord, PlayerStats, Position } from './types';
import {evaluateFieldPerformance,type PerformanceBaselines,performanceBaselines} from './performance-profile';

interface TournamentPlayer { id:string; name:string; position:Position; stats:PlayerStats }
const average=(s:PlayerStats)=>s.ratingCount?s.ratingSum/s.ratingCount:0;
const group=(position:Position)=>position==='GK'?'GK':['CB','LB','RB','LWB','RWB'].includes(position)?'DEF':['CDM','CM','CAM','LM','RM'].includes(position)?'MID':'FWD';

/** This is a published game voting model; it never pretends to reproduce FIFA's actual votes. */
export function tournamentPerformance(player:TournamentPlayer,baselines:PerformanceBaselines={}):number {
  const s=player.stats;if(!s.apps||!s.minutes)return 0;
  const matches=Math.max(1,s.minutes/90),role=group(player.position);
  const fairPlay=s.yellowCards*.35+s.redCards*3;
  if(role!=='GK')return evaluateFieldPerformance(player,baselines).value+(s.mom??0)*.8-fairPlay;
  const common=Math.max(0,average(s)-5)*18+(s.mom??0)*1.5-fairPlay;
  return common+s.saves/matches*2+s.saves/Math.max(1,s.shotsFaced??s.saves+s.goalsConceded)*16+s.cleanSheets/Math.max(1,s.apps)*16-s.goalsConceded/matches*1.5+(s.penaltiesSaved??0)*3;
}

/** Pure, competition-scoped personal awards, based only on completed FIFA finals ledgers. */
export function evaluateTournamentAwards(career:Career):Award[] {
  const national=career.systems?.national;if(!national)return [];
  const unique=new Map<string,MatchRecord>();
  for(const match of [...national.history.flatMap(h=>h.matches),...national.matches,...national.teamResults??[]])unique.set(match.fixtureId,match);
  const matches=[...unique.values()];
  const completed=new Set(matches.filter(m=>m.seasonYear===career.season.year&&m.fixtureId.includes('|final|')&&/^(WC|U20WC|UEFA|AFC|CAF|CONCACAF|CONMEBOL):\d+$/.test(m.competitionId??'')).map(m=>m.competitionId!));
  const awards:Award[]=[];
  for(const id of completed) {
    const finals=matches.filter(m=>m.competitionId===id&&/\|(group|round32|round16|quarterfinal|semifinal|final|thirdPlace)\|/.test(m.fixtureId));
    const stored=national.tournamentStats?.[id];
    const players=new Map<string,TournamentPlayer>(Object.values(stored??{}).map(r=>[r.id,structuredClone(r)]));
    for(const match of stored?[]:finals)for(const p of match.performers??[]) {
      if(!p.stats.apps||!p.stats.minutes)continue;
      const row=players.get(p.id)??{id:p.id,name:p.name,position:p.position,stats:emptyStats()};
      addStats(row.stats,p.stats);players.set(p.id,row);
    }
    const own=players.get(career.player.id);if(!own)continue;
    const rows=[...players.values()];
    const [kind,year]=id.split(':');
    const tournament=`${year} ${{WC:'FIFA 월드컵',U20WC:'FIFA U-20 월드컵',UEFA:'UEFA 유로',AFC:'AFC 아시안컵',CAF:'아프리카 네이션스컵',CONCACAF:'CONCACAF 골드컵',CONMEBOL:'코파 아메리카'}[kind]}`;
    const fifa=kind==='WC'||kind==='U20WC',organiser=fifa?'FIFA':kind==='CONMEBOL'?'CONMEBOL':kind==='CONCACAF'?'CONCACAF':kind;
    const mapped=(id:string,name:string)=>({id,name,organiser,sourceUrl:({'UEFA':'https://www.uefa.com/','AFC':'https://www.the-afc.com/','CAF':'https://www.cafonline.com/','CONCACAF':'https://www.concacaf.com/','CONMEBOL':'https://www.conmebol.com/'} as Record<string,string>)[organiser],criterion:'실제 본선 출전 기록만 비교하는 게임 모형. 예선·친선·승부차기 득점·클럽 기록 제외.'});
    const rules=fifa?FIFA_TOURNAMENT_AWARD_RULES:{goldenBoot:mapped('top-scorer','득점왕'),goldenBall:mapped('player-tournament','대회 최우수 선수'),goldenGlove:mapped('best-goalkeeper','최우수 골키퍼')};
    const playedDates=finals.map(match=>match.date?.slice(0,10)).filter((date):date is string=>!!date).sort();
    const evaluationPeriod=playedDates.length?`게임 본선 ${playedDates[0]} ~ ${playedDates.at(-1)} · 예선·친선·클럽 경기 제외`:`${tournament} 게임 본선 기록 · 예선·친선·클럽 경기 제외`;
    const add=(rule:typeof FIFA_TOURNAMENT_AWARD_RULES.goldenBoot,description:string)=>awards.push({id:`${career.season.year}:tournament:${id}:${rule.id}:${career.player.id}`,name:`${tournament} ${rule.name}`,year:career.season.year,clubId:career.player.clubId,description,organiser:rule.organiser,criterion:rule.criterion,sourceUrl:rule.sourceUrl,category:'national-individual',official:true,position:career.player.position,ruleVersion:AWARD_MODEL_VERSION,verification:'game-model',evaluationPeriod});
    const boot=rows.filter(p=>p.stats.goals>0).sort((a,b)=>b.stats.goals-a.stats.goals||b.stats.assists-a.stats.assists||a.stats.minutes-b.stats.minutes||a.id.localeCompare(b.id));
    // A fully tied sporting record does not invent a sole winner by player-id ordering.
    if(boot[0]&&own.stats.goals===boot[0].stats.goals&&own.stats.assists===boot[0].stats.assists&&own.stats.minutes===boot[0].stats.minutes)add(rules.goldenBoot,`본선 ${own.stats.goals}골 · ${own.stats.assists}도움 · ${own.stats.minutes}분. 실제 본선 출전 선수 ${rows.length}명 비교${boot.filter(p=>p.stats.goals===own.stats.goals&&p.stats.assists===own.stats.assists&&p.stats.minutes===own.stats.minutes).length>1?' · 완전 동률 공동 선정':''}.`);
    const minApps=Math.max(1,Math.ceil(Math.max(...rows.map(r=>r.stats.apps))*.5));
    const eligible=rows.filter(p=>p.stats.apps>=minApps),baselines=performanceBaselines(eligible,90),scores=new Map(eligible.map(r=>[r.id,tournamentPerformance(r,baselines)]));
    const ranked=eligible.sort((a,b)=>scores.get(b.id)!-scores.get(a.id)!||a.id.localeCompare(b.id));
    if(ranked[0]?.id===own.id)add(rules.goldenBall,`본선 ${own.stats.apps}경기 · 평점 ${average(own.stats).toFixed(2)}. 본선에서 실제로 뛴 선수들의 역할별 기록을 비교한 게임 내 투표.`);
    const keepers=rows.filter(p=>p.position==='GK'&&p.stats.apps>=minApps).sort((a,b)=>scores.get(b.id)!-scores.get(a.id)!||a.id.localeCompare(b.id));
    if(kind!=='UEFA'&&keepers[0]?.id===own.id)add(rules.goldenGlove,`본선 ${own.stats.saves}선방 · ${own.stats.cleanSheets}무실점 · 평점 ${average(own.stats).toFixed(2)}. 실제 본선 골키퍼 ${keepers.length}명을 비교한 게임 내 투표.`);
  }
  return awards;
}
