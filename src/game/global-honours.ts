import {getLeague} from './data';
import {personalityEdge} from './personality';
import {clamp,round,emptyStats} from './math';
import {worldPlayerAbility} from './world';
import {EUROPEAN_COUNTRIES} from './cup-rules';
import {currentNationality,normalizeNationality} from './national-data';
import {achievementBonus,finishAchievementSeason,type AchievementContext} from './achievement-evidence';
import type {Award,Career} from './types';
import type {CompetitorSeason,RankingCandidate} from './revision-types';

export type VoteKind='ballon'|'fifa'|'fifa11'|'fifpro'|'yashin'|'fifa-gk'|'kopa';
export interface VotingTeamContext extends AchievementContext {leagueTitles:Map<string,number>;cupTitles:Map<string,number>;teamScore:Map<string,number>;prestige?:Map<string,number>}
const weights:Record<VoteKind,[number,number,number]>={ballon:[60,20,20],fifa:[65,20,15],fifa11:[70,15,15],fifpro:[75,10,15],yashin:[65,20,15],'fifa-gk':[70,15,15],kopa:[65,20,15]};
const avg=(r:CompetitorSeason)=>r.stats.ratingCount?r.stats.ratingSum/r.stats.ratingCount:0;
export function globalVoting(c:Career,rows:CompetitorSeason[],performance:(r:CompetitorSeason)=>number,context:VotingTeamContext){
 const offsets=new Map<string,number>(),raw=new Map(rows.map(r=>[r.playerId,Math.max(0,performance(r)-(context.teamScore.get(r.clubId)??0))*(context.prestige?.get(r.leagueId)??1/Math.sqrt(getLeague(r.leagueId).tier))]));
 const national=c.systems!.national,nationalTitles=new Map<string,number>();
 const finals=[...new Map([...(national.teamResults??[]),...national.matches,...national.history.flatMap(h=>h.matches)].filter(m=>m.seasonYear===c.season.year&&m.fixtureId.includes('|final|')&&/^(WC|UEFA|AFC|CAF|CONCACAF|CONMEBOL|OFC):/.test(m.competitionId??'')).map(m=>[m.fixtureId,m])).values()];
 for(const final of finals){const win=final.shootout?.winnerId??(final.homeGoals>final.awayGoals?final.homeId:final.awayGoals>final.homeGoals?final.awayId:undefined),country=win?.split(':')[1],tournament=national.tournamentStats?.[final.competitionId??''];if(!country||!tournament)continue;const maxMinutes=Math.max(90,...Object.values(tournament).map(r=>r.stats.minutes));
  for(const r of rows){const person=c.systems!.world.players[r.playerId],nation=r.playerId===c.player.id?normalizeNationality(c.player.nationality):person?currentNationality(person):normalizeNationality(r.nationality),played=tournament[r.playerId]?.stats.minutes??0;if(nation!==country||played<=0)continue;const value=final.competitionId!.startsWith('WC:')?12:/^(UEFA|CONMEBOL):/.test(final.competitionId!)?8:5;nationalTitles.set(r.playerId,(nationalTitles.get(r.playerId)??0)+value*clamp(played/(maxMinutes*.6),0,1));}
 }
 const eligible=rows.filter(r=>r.stats.minutes>=900).map(r=>raw.get(r.playerId)??0).sort((a,b)=>a-b);
 const scale=Math.max(80,(eligible[Math.floor(eligible.length*.95)]??100)*1.15);
 const ability=(r:CompetitorSeason)=>r.playerId===c.player.id?c.player.ovr:c.systems!.world.players[r.playerId]?worldPlayerAbility(c,c.systems!.world.players[r.playerId],offsets):r.ovr;
 const evidence=new Map(rows.map(r=>[r.playerId,achievementBonus(c,r,context)]));
 const base=(r:CompetitorSeason,kind:VoteKind)=>{
  const [personal,team,skill]=weights[kind],n=r.nationalStats;
  const national=n?.minutes?clamp((n.ratingCount?n.ratingSum/n.ratingCount:0)-6,0,3)*Math.min(8,n.apps)*.5:0;
  const individual=clamp(((raw.get(r.playerId)??0)+national)/scale,0,1.35);
  const achievement=(context.leagueTitles.get(r.clubId)??0)/Math.sqrt(getLeague(r.leagueId).tier)+(context.cupTitles.get(r.playerId)??0)+(nationalTitles.get(r.playerId)??0)+(context.teamScore.get(r.clubId)??0)*.25;
  return personal*individual+team*clamp(achievement/36,0,1)+skill*clamp((ability(r)-50)/70,0,1);
 };
 const thresholds=new Map<VoteKind,number>();
 for(const kind of Object.keys(weights)as VoteKind[]){const scores=rows.filter(r=>r.stats.minutes>=900).map(r=>base(r,kind)).sort((a,b)=>a-b);thresholds.set(kind,(scores[Math.floor(scores.length*.8)]??100)-4);}
 return {score:(r:CompetitorSeason,kind:VoteKind='ballon')=>round((base(r,kind)+(base(r,kind)>=(thresholds.get(kind)??100)?evidence.get(r.playerId)??0:0))*(r.playerId===c.player.id?1+personalityEdge(c,'stardom')*.008:1),4),finish:()=>finishAchievementSeason(c,rows,context)};
}

const annual=(id:string,name:string,organiser:string,url:string)=>({id,name,organiser,sourceUrl:url});
export const ADDITIONAL_GLOBAL_AWARDS={
 fifa:annual('fifa-best-player','The Best FIFA 올해의 선수','FIFA','https://www.fifa.com/the-best-fifa-football-awards'),
 fifa11:annual('fifa-mens11',"The Best FIFA Men's 11",'FIFA','https://www.fifa.com/the-best-fifa-football-awards'),
 yashin:annual('yashin-trophy','야신 트로피','France Football','https://ballondor.com/'),
 'fifa-gk':annual('fifa-best-goalkeeper','The Best FIFA 올해의 골키퍼','FIFA','https://www.fifa.com/the-best-fifa-football-awards'),
 kopa:annual('kopa-trophy','코파 트로피','France Football','https://ballondor.com/'),
 shoe:annual('european-golden-shoe','유러피언 골든슈','European Sports Media','https://www.eusm.eu/'),
} as const;
export function europeanShoePoints(r:CompetitorSeason):number{
 if(r.leagueSplits)return r.leagueSplits.reduce((n,s)=>n+europeanShoePoints({...r,...s,leagueSplits:undefined}),0);
 const l=getLeague(r.leagueId);if(l.tier!==1||!EUROPEAN_COUNTRIES.includes(l.country))return 0;
 return r.stats.goals*(['영국','스페인','독일','이탈리아','프랑스'].includes(l.country)?2:1.5);
}
/** Separate winners/IDs for each organiser. Only the user's outcome is added to the UI/history. */
export function additionalGlobalHonours(c:Career,rows:CompetitorSeason[],leagueRows:CompetitorSeason[],voting:ReturnType<typeof globalVoting>,eleven:(rows:RankingCandidate[],d:number,m:number,f:number)=>RankingCandidate[]){
 const awards:Award[]=[],diagnostics:{name:string;scope:string;eligible:boolean;result:string;detail:string}[]=[];
 const age=(r:CompetitorSeason)=>r.playerId===c.player.id?c.player.age:c.systems!.world.players[r.playerId]?.age??99;
 const valid=rows.filter(r=>r.stats.apps>=10&&r.stats.minutes>=900);
 const judged=(kind:Exclude<keyof typeof ADDITIONAL_GLOBAL_AWARDS,'shoe'>,pool:CompetitorSeason[],team=false)=>{
  const rule=ADDITIONAL_GLOBAL_AWARDS[kind],ranking=pool.map(r=>({playerId:r.playerId,name:r.name,clubId:r.clubId,position:r.position,stats:r.stats,nationalStats:r.nationalStats??emptyStats(),score:voting.score(r,kind),rank:0})).sort((a,b)=>b.score-a.score||a.playerId.localeCompare(b.playerId)).map((r,i)=>({...r,rank:i+1}));
  const own=ranking.find(r=>r.playerId===c.player.id),selected=team?eleven(ranking,4,3,3).some(r=>r.playerId===c.player.id):ranking[0]?.playerId===c.player.id;
  const criterion=`${rule.organiser}의 상을 게임 기록으로 평가하는 별도 모형. ${team?'포지션별 11인':'개인 성과·팀 성과·실제 능력'} 비교. ${kind==='kopa'?'시즌 시작 연도 7월 31일 기준 21세 미만 모형. ':''}연도별 공식 투표·평가 기간을 완전히 재현한 결과는 아닙니다.`;
  if(selected&&own)awards.push({...rule,id:`${c.season.year}:world:${rule.id}:${c.player.id}`,year:c.season.year,clubId:c.player.clubId,category:'world',official:true,verification:'game-model',ruleVersion:'kball-awards-2.8',criterion,description:`${own.stats.apps}경기 · 평점 ${avg(pool.find(r=>r.playerId===c.player.id)!).toFixed(2)} · 해당 상의 자격 충족 선수 ${pool.length}명 비교`,rank:team?undefined:1});
  diagnostics.push({name:rule.name,scope:'해당 게임 시즌 · 리그·컵·국가대표',eligible:!!own,result:selected&&own?'수상':own?`${own.rank}위 · 미선정`:'자격 미충족',detail:`${criterion} ${pool.length}명 비교${kind==='kopa'?` · 현재 나이 ${c.player.age}세`:''}`});
 };
 judged('fifa',valid);judged('fifa11',valid.filter(r=>r.stats.apps+(r.nationalStats?.apps??0)>=30),true);
 const keepers=valid.filter(r=>r.position==='GK');judged('yashin',keepers);judged('fifa-gk',keepers);
 judged('kopa',valid.filter(r=>age(r)<21));
 const shoe=leagueRows.filter(r=>europeanShoePoints(r)>0).sort((a,b)=>europeanShoePoints(b)-europeanShoePoints(a)||a.stats.minutes-b.stats.minutes||a.playerId.localeCompare(b.playerId));
 const own=shoe.find(r=>r.playerId===c.player.id),best=shoe[0],win=!!own&&!!best&&europeanShoePoints(own)===europeanShoePoints(best)&&own.stats.minutes===best.stats.minutes;
 if(win)awards.push({...ADDITIONAL_GLOBAL_AWARDS.shoe,id:`${c.season.year}:world:european-golden-shoe:${c.player.id}`,year:c.season.year,clubId:c.player.clubId,category:'world',official:true,verification:'game-model',ruleVersion:'kball-awards-2.8',criterion:'지원 유럽 국내 최상위 리그의 실제 정규리그 득점×계수(상위 5리그 2, 지원 나머지 1.5). 컵·국대·승부차기 제외. 동점은 적은 출전 시간, 완전 동률은 공동 선정. 고정 계수는 미래의 실제 협회 순위 변화와 구별하는 게임 모형입니다.',description:`리그 ${own!.stats.goals}골 · ${europeanShoePoints(own!)}점 · 실제 출전 ${own!.stats.minutes}분. 능력치나 종합 투표 점수는 순위에 사용하지 않습니다.`});
 diagnostics.push({name:ADDITIONAL_GLOBAL_AWARDS.shoe.name,scope:'유럽 국내 1부 정규리그만',eligible:!!own,result:win?'수상':own?'미선정':'대상 리그·득점 없음',detail:own?`${own.stats.goals}골 × 리그 계수 = ${europeanShoePoints(own)}점 · 컵·국대 기록 제외`:'지원 유럽 최상위 리그의 실제 리그 득점이 필요합니다.'});
 return {awards,diagnostics};
}
