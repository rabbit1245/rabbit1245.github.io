import {getLeague} from './data';
import {personalityEdge} from './personality';
import {addStats,clamp,round,emptyStats} from './math';
import {worldPlayerAbility} from './world';
import {EUROPEAN_COUNTRIES} from './cup-rules';
import {currentNationality,normalizeNationality} from './national-data';
import {awardPositionGroup} from './award-selection';
import {achievementBonus,finishAchievementSeason,type AchievementContext} from './achievement-evidence';
import {cupLedger} from './club-competitions';
import {performanceBaselines} from './performance-profile';
import {tournamentPerformance} from './tournament-awards';
import type {Award,Career,PlayerStats} from './types';
import type {CompetitorSeason,RankingCandidate} from './revision-types';

export type VoteKind='ballon'|'fifa'|'fifa11'|'fifpro'|'yashin'|'fifa-gk'|'kopa';
export interface VotingTeamContext extends AchievementContext {leagueTitles:Map<string,number>;cupTitles:Map<string,number>;teamScore:Map<string,number>;prestige?:Map<string,number>;performanceRoles?:Map<string,ReturnType<typeof awardPositionGroup>>}
export const BALLON_MIN_CLUB_MINUTES = 900;
const weights:Record<VoteKind,[number,number,number]>={ballon:[75,25,0],fifa:[65,20,15],fifa11:[70,15,15],fifpro:[75,10,15],yashin:[65,20,15],'fifa-gk':[70,15,15],kopa:[65,20,15]};
const avg=(r:CompetitorSeason)=>r.stats.ratingCount?r.stats.ratingSum/r.stats.ratingCount:0;

const MAJOR_COMPETITION_CAP = 4;
const clubCompetitionWeight = new Map([
 ['UCL',1],['LIBERTADORES',.75],['CLUB_WORLD_CUP',.75],['UEL',.5],['UECL',.3],
 ['AFC_ELITE',.55],['CAF_CL',.55],['CONCACAF_CL',.55],['OFC_CL',.4],['AFC_TWO',.3],['SUDAMERICANA',.45],
]);

/** Compare observed tournament performances within their position groups. */
function addMajorCompetitionMerit(merit:Map<string,number>,table:Record<string,Pick<RankingCandidate,'name'|'position'|'stats'>>,weight:number):void{
 const played=Object.entries(table).filter(([,r])=>r.stats.apps>0&&r.stats.minutes>=180&&r.stats.ratingCount>0);
 const baselines=performanceBaselines(played.map(([,r])=>r),180);
 const roles=new Map<ReturnType<typeof awardPositionGroup>,{id:string;minutes:number;score:number}[]>();
 for(const [id,row] of played){
  const role=awardPositionGroup(row.position),peers=roles.get(role)??[];
  peers.push({id,minutes:row.stats.minutes,score:tournamentPerformance({id,...row},baselines)});
  roles.set(role,peers);
 }
 for(const peers of roles.values()){
  if(peers.length<5)continue;
  peers.sort((a,b)=>a.score-b.score);
  const upperQuartile=peers[Math.floor((peers.length-1)*.75)].score;
  const topLevel=peers[Math.floor((peers.length-1)*.95)].score;
  const range=Math.max(15,topLevel-upperQuartile);
  for(const player of peers){
   if(player.score<=upperQuartile)continue;
   const quality=clamp((player.score-upperQuartile)/range,0,1);
   const minutes=clamp(player.minutes/540,0,1);
   const points=MAJOR_COMPETITION_CAP*weight*quality*minutes;
   merit.set(player.id,Math.min(MAJOR_COMPETITION_CAP,(merit.get(player.id)??0)+points));
  }
 }
}

export function globalVoting(c:Career,rows:CompetitorSeason[],performance:(r:CompetitorSeason)=>number,context:VotingTeamContext){
 const offsets=new Map<string,number>(),raw=new Map(rows.map(r=>[r.playerId,Math.max(0,performance(r)-(context.teamScore.get(r.clubId)??0))*(context.prestige?.get(r.leagueId)??1/Math.sqrt(getLeague(r.leagueId).tier))]));
 const {national,world}=c.systems!,nationalTitles=new Map<string,number>();
 const seniorFinals=new Map<string,PlayerStats>();
 const majorMerit=new Map<string,number>();
 for(const cup of cupLedger(c,c.season.year)){
  const weight=clubCompetitionWeight.get(cup.id.split(':')[0]);
  if(weight&&cup.playerStats)addMajorCompetitionMerit(majorMerit,cup.playerStats,weight);
 }
 const finals=[...new Map([...(national.teamResults??[]),...national.matches,...national.history.flatMap(h=>h.matches)].filter(m=>m.seasonYear===c.season.year&&m.fixtureId.includes('|final|')&&/^(WC|UEFA|AFC|CAF|CONCACAF|CONMEBOL|OFC):/.test(m.competitionId??'')).map(m=>[m.fixtureId,m])).values()];
 for(const final of finals){
  const competitionId=final.competitionId!,tournament=national.tournamentStats?.[competitionId];
  if(!tournament)continue;
  const win=final.shootout?.winnerId??(final.homeGoals>final.awayGoals?final.homeId:final.awayGoals>final.homeGoals?final.awayId:undefined);
  const country=win?.split(':')[1],maxMinutes=Math.max(90,...Object.values(tournament).map(r=>r.stats.minutes));
  const titlePoints=competitionId.startsWith('WC:')?12:/^(UEFA|CONMEBOL):/.test(competitionId)?8:5;
  addMajorCompetitionMerit(majorMerit,tournament,titlePoints/12);
  for(const r of rows){
   const stats=tournament[r.playerId]?.stats;
   if(!stats?.minutes)continue;
   const total=seniorFinals.get(r.playerId)??emptyStats();
   seniorFinals.set(r.playerId,addStats(total,stats));
   const person=world.players[r.playerId],nation=r.playerId===c.player.id?normalizeNationality(c.player.nationality):person?currentNationality(person):normalizeNationality(r.nationality);
   if(nation===country)nationalTitles.set(r.playerId,(nationalTitles.get(r.playerId)??0)+titlePoints*clamp(stats.minutes/(maxMinutes*.6),0,1));
  }
 }
 const eligible=rows.filter(r=>r.stats.minutes>=900).map(r=>raw.get(r.playerId)??0).sort((a,b)=>a-b);
 const scale=Math.max(80,(eligible[Math.floor(eligible.length*.95)]??100)*1.15);
 // Judge exceptional role performance against the same role. A single global
 // reference was dominated by attackers' goals/MOM, excluding even elite defenders.
 // League strength is already included in raw; the floor keeps weak output weak.
 const roleValues=new Map<string,number[]>(),roleScales=new Map<string,number>();
 const performanceRole=(r:CompetitorSeason)=>context.performanceRoles?.get(r.playerId)??awardPositionGroup(r.position);
 for(const r of rows)if(r.stats.minutes>=900){const group=performanceRole(r),values=roleValues.get(group)??[];values.push(raw.get(r.playerId)??0);roleValues.set(group,values);}
 for(const [group,values]of roleValues)if(values.length>=5){values.sort((a,b)=>a-b);roleScales.set(group,Math.max(65,values[Math.floor(values.length*.95)]*1.15));}
 const ability=(r:CompetitorSeason)=>r.playerId===c.player.id?c.player.ovr:world.players[r.playerId]?worldPlayerAbility(c,world.players[r.playerId],offsets):r.ovr;
 const evidence=new Map(rows.map(r=>[r.playerId,achievementBonus(c,r,context)]));
 const ownLeagueMinutes=new Map<string,number>();
 for(const match of c.season.matches){
  const key=`${match.competitionId??c.season.leagueId}:${match.playerClubId}`;
  ownLeagueMinutes.set(key,(ownLeagueMinutes.get(key)??0)+match.playerStats.minutes);
 }
 const leagueParticipation=(r:CompetitorSeason)=>{
  const minutes=r.playerId===c.player.id?ownLeagueMinutes.get(`${r.leagueId}:${r.clubId}`):world.playerStats[r.playerId]?.stats.minutes;
  const rounds=world.competitions[r.leagueId]?.totalRounds??c.season.totalWeeks;
  return clamp((minutes??0)/Math.max(90,rounds*90*.65),0,1);
 };
 const performanceVote=(r:CompetitorSeason,kind:VoteKind)=>{
  const n=kind==='ballon'?seniorFinals.get(r.playerId):r.nationalStats;
  const volume=kind==='ballon'?(n?.minutes??0)/90:n?.apps??0;
  const international=n?.minutes&&n.ratingCount?clamp(n.ratingSum/n.ratingCount-6,0,3)*Math.min(8,volume)*.5:0;
  const observed=Math.max(0,((raw.get(r.playerId)??0)+international)/(roleScales.get(performanceRole(r))??scale));
  // Preserve the former scale below its cap, then keep rewarding exceptional
  // output with diminishing returns instead of flattening every top season.
  const individual=observed<=1.35?observed:1.35+.3*-Math.expm1(-(observed-1.35)/.3);
  return weights[kind][0]*individual;
 };
 const teamVote=(r:CompetitorSeason,kind:VoteKind)=>{
  const league=(context.leagueTitles.get(r.clubId)??0)/Math.sqrt(getLeague(r.leagueId).tier)+(context.teamScore.get(r.clubId)??0)*.25;
  const points=league*(kind==='ballon'?leagueParticipation(r):1)+(context.cupTitles.get(r.playerId)??0)+(nationalTitles.get(r.playerId)??0);
  return weights[kind][1]*clamp(points/36,0,1);
 };
 const base=(r:CompetitorSeason,kind:VoteKind)=>{
  const skill=weights[kind][2];
  return performanceVote(r,kind)+teamVote(r,kind)+(skill?skill*clamp((ability(r)-50)/70,0,1):0);
 };
 const thresholds=new Map<VoteKind,number>();
 for(const kind of Object.keys(weights)as VoteKind[]){const scores=rows.filter(r=>r.stats.minutes>=900).map(r=>base(r,kind)).sort((a,b)=>a-b);thresholds.set(kind,(scores[Math.floor(scores.length*.8)]??100)-4);}
 const bonus=(r:CompetitorSeason,kind:VoteKind,points:number)=>{
  const observed=points>=(thresholds.get(kind)??100)?evidence.get(r.playerId)??0:0;
  return kind==='ballon'?Math.min(3,observed):observed;
 };
 return {
  score:(r:CompetitorSeason,kind:VoteKind='ballon')=>{
   const points=base(r,kind);
   const star=kind!=='ballon'&&r.playerId===c.player.id?personalityEdge(c,'stardom')*.02:0;
   const major=kind==='ballon'?majorMerit.get(r.playerId)??0:0;
   return round((points+bonus(r,kind,points)+major)*(1+star),4);
  },
  ballonBreakdown:(r:CompetitorSeason)=>{
   const individual=performanceVote(r,'ballon'),team=teamVote(r,'ballon');
   return {individual,team,major:majorMerit.get(r.playerId)??0,achievement:bonus(r,'ballon',individual+team),nationalApps:seniorFinals.get(r.playerId)?.apps??0};
  },
  finish:()=>finishAchievementSeason(c,rows,context),
 };
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
