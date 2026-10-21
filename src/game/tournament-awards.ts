import { FIFA_TOURNAMENT_AWARD_RULES, AWARD_MODEL_VERSION } from './award-rules';
import { addStats, emptyStats } from './math';
import type { Award, Career, MatchRecord, PlayerStats, Position } from './types';

interface TournamentPlayer { id:string; name:string; position:Position; stats:PlayerStats }
const average=(s:PlayerStats)=>s.ratingCount?s.ratingSum/s.ratingCount:0;
const group=(position:Position)=>position==='GK'?'GK':['CB','LB','RB','LWB','RWB'].includes(position)?'DEF':['CDM','CM','CAM','LM','RM'].includes(position)?'MID':'FWD';

/** This is a published game voting model; it never pretends to reproduce FIFA's actual votes. */
export function tournamentPerformance(player:TournamentPlayer):number {
  const s=player.stats;if(!s.apps||!s.minutes)return 0;
  const matches=Math.max(1,s.minutes/90),role=group(player.position);
  const fairPlay=s.yellowCards*.35+s.redCards*3;
  const common=Math.max(0,average(s)-5)*18+(s.mom??0)*1.5-fairPlay;
  if(role==='GK')return common+s.saves/matches*2+s.saves/Math.max(1,s.shotsFaced??s.saves+s.goalsConceded)*16+s.cleanSheets/Math.max(1,s.apps)*16-s.goalsConceded/matches*1.5+(s.penaltiesSaved??0)*3;
  if(role==='DEF')return common+(s.tackles+s.interceptions)/matches*2.5+(s.aerialWon??0)/matches+s.cleanSheets/Math.max(1,s.apps)*12+(s.goals+s.assists)/matches*6;
  if(role==='MID')return common+(s.goals+s.assists)/matches*9+(s.keyPasses??0)/matches*2+(s.tackles+s.interceptions)/matches+s.passesCompleted/Math.max(1,s.passes)*5;
  return common+s.goals/matches*13+s.assists/matches*7+(s.dribblesCompleted??0)/matches;
}

/** Pure, competition-scoped personal awards, based only on completed FIFA finals ledgers. */
export function evaluateTournamentAwards(career:Career):Award[] {
  const national=career.systems?.national;if(!national)return [];
  const unique=new Map<string,MatchRecord>();
  for(const match of [...national.history.flatMap(h=>h.matches),...national.matches,...national.teamResults??[]])unique.set(match.fixtureId,match);
  const matches=[...unique.values()];
  const completed=new Set(matches.filter(m=>m.seasonYear===career.season.year&&m.fixtureId.includes('|final|')&&/^(WC|U20WC):\d+$/.test(m.competitionId??'')).map(m=>m.competitionId!));
  const awards:Award[]=[];
  for(const id of completed) {
    const finals=matches.filter(m=>m.competitionId===id&&(m.fixtureId.includes('|semifinal|')||m.fixtureId.includes('|final|')));
    const players=new Map<string,TournamentPlayer>();
    for(const match of finals)for(const p of match.performers??[]) {
      if(!p.stats.apps||!p.stats.minutes)continue;
      const row=players.get(p.id)??{id:p.id,name:p.name,position:p.position,stats:emptyStats()};
      addStats(row.stats,p.stats);players.set(p.id,row);
    }
    const own=players.get(career.player.id);if(!own)continue;
    const rows=[...players.values()];
    const [kind,year]=id.split(':');
    const tournament=`${year} FIFA ${kind==='U20WC'?'U-20 ':''}월드컵`;
    const playedDates=finals.map(match=>match.date?.slice(0,10)).filter((date):date is string=>!!date).sort();
    const evaluationPeriod=playedDates.length?`게임 본선 ${playedDates[0]} ~ ${playedDates.at(-1)} · 예선·친선·클럽 경기 제외`:`${tournament} 게임 본선 기록 · 예선·친선·클럽 경기 제외`;
    const add=(rule:typeof FIFA_TOURNAMENT_AWARD_RULES.goldenBoot,description:string)=>awards.push({id:`${career.season.year}:tournament:${id}:${rule.id}:${career.player.id}`,name:`${tournament} ${rule.name}`,year:career.season.year,clubId:career.player.clubId,description,organiser:rule.organiser,criterion:rule.criterion,sourceUrl:rule.sourceUrl,category:'national-individual',official:true,position:career.player.position,ruleVersion:AWARD_MODEL_VERSION,verification:'game-model',evaluationPeriod});
    const boot=rows.filter(p=>p.stats.goals>0).sort((a,b)=>b.stats.goals-a.stats.goals||b.stats.assists-a.stats.assists||a.stats.minutes-b.stats.minutes||a.id.localeCompare(b.id));
    // A fully tied sporting record does not invent a sole winner by player-id ordering.
    if(boot[0]&&own.stats.goals===boot[0].stats.goals&&own.stats.assists===boot[0].stats.assists&&own.stats.minutes===boot[0].stats.minutes)add(FIFA_TOURNAMENT_AWARD_RULES.goldenBoot,`축약 본선 ${own.stats.goals}골 · ${own.stats.assists}도움 · ${own.stats.minutes}분. 실제 본선 출전 선수 ${rows.length}명 비교${boot.filter(p=>p.stats.goals===own.stats.goals&&p.stats.assists===own.stats.assists&&p.stats.minutes===own.stats.minutes).length>1?' · 완전 동률 공동 선정':''}.`);
    const ranked=[...rows].sort((a,b)=>tournamentPerformance(b)-tournamentPerformance(a)||a.id.localeCompare(b.id));
    if(ranked[0]?.id===own.id)add(FIFA_TOURNAMENT_AWARD_RULES.goldenBall,`본선 ${own.stats.apps}경기 · 평점 ${average(own.stats).toFixed(2)}. 본선에서 실제로 뛴 선수들의 역할별 기록을 비교한 게임 내 투표.`);
    const keepers=rows.filter(p=>p.position==='GK').sort((a,b)=>tournamentPerformance(b)-tournamentPerformance(a)||a.id.localeCompare(b.id));
    if(keepers[0]?.id===own.id)add(FIFA_TOURNAMENT_AWARD_RULES.goldenGlove,`본선 ${own.stats.saves}선방 · ${own.stats.cleanSheets}무실점 · 평점 ${average(own.stats).toFixed(2)}. 실제 본선 골키퍼 ${keepers.length}명을 비교한 게임 내 투표.`);
  }
  return awards;
}
