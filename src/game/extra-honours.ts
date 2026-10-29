import type {Award,Career,MatchRecord,PlayerStats,Position} from './types';
import type {CompetitorSeason} from './revision-types';
import {getClub,getLeague} from './data';
import {emptyStats,addStats,sumStats,clamp} from './math';
import {tournamentPerformance} from './tournament-awards';
import {performanceBaselines,type PerformanceBaselines} from './performance-profile';
import {cupLedger} from './club-competitions';
import {personalityEdge} from './personality';
const avg=(s:PlayerStats)=>s.ratingCount?s.ratingSum/s.ratingCount:0;
const role=(p:Position)=>p==='GK'?'GK':/^(CB|LB|RB|LWB|RWB)$/.test(p)?'DEF':/^(CDM|CM|CAM|LM|RM)$/.test(p)?'MID':'FWD';
export interface MonthlyPlayer {id:string;name:string;position:Position;age:number;clubId:string;stats:PlayerStats;}
export interface MonthlyLedger {year:number;leagueId:string;months:Record<string,Record<string,MonthlyPlayer>>;}
export const EXTRA_HONOUR_KINDS=['구단 올해의 선수','구단 팬 선정 올해의 선수','구단 선수단 선정 올해의 선수','구단 올해의 유망주','구단 올해의 영입','구단 올해의 공격수','구단 올해의 미드필더','구단 올해의 수비수','구단 올해의 골키퍼','구단 올해의 해결사','리그 이달의 선수','리그 이달의 유망주','리그 올해의 유망주','리그 올해의 신인','리그 올해의 영입','국내 컵대회 최우수 선수','대륙 클럽대회 최우수 선수','FIFA 클럽 월드컵 최우수 선수','국가대표 올해의 선수','K볼 유니폼 판매 1위','K볼 유니폼 판매 2위','K볼 유니폼 판매 3위'] as const;
export function trackMonthlyLeague(c:Career,matches:MatchRecord[]):void{
 if(!c.systems||c.player.squad!=='senior')return;
 const ledger=c.systems.monthlyLeague;
 const state=ledger?.year===c.season.year&&ledger.leagueId===c.season.leagueId?ledger:(c.systems.monthlyLeague={year:c.season.year,leagueId:c.season.leagueId,months:{}});
 for(const m of matches){if(!m.date)continue;const month=m.date.slice(0,7),rows=state.months[month]??(state.months[month]={});for(const p of m.performers??[]){const row=rows[p.id]??(rows[p.id]={id:p.id,name:p.name,position:p.position,age:p.id===c.player.id?c.player.age:c.systems.world.players[p.id]?.age??99,clubId:p.clubId,stats:emptyStats()});addStats(row.stats,p.stats);}}
}
function legacyPerformance(r:CompetitorSeason,baselines:PerformanceBaselines={}){return tournamentPerformance({id:r.playerId,...r},baselines)*clamp(r.stats.minutes/1800,.3,1.2);}
function allClubRows(c:Career):CompetitorSeason[]{
 const rows=new Map(Object.values(c.systems!.world.playerStats).map(r=>[r.playerId,{...r,stats:{...r.stats}}]));
 for(const t of cupLedger(c,c.season.year))for(const r of Object.values(t.playerStats??{})){const row=rows.get(r.playerId);if(row)addStats(row.stats,r.stats);else rows.set(r.playerId,{...r,stats:{...r.stats}});}
 return [...rows.values()];
}
/** In-house honours are explicitly Kball estimates, distinct from existing official-name awards. */
export function evaluateExtraHonours(c:Career,scoreSeason:(r:CompetitorSeason)=>number=legacyPerformance):Award[]{
 const performance=scoreSeason;
 if(!c.systems||c.player.squad!=='senior')return[];
 const p=c.player,w=c.systems.world,year=c.season.year,clubId=c.season.matches[0]?.playerClubId??p.clubId;
 const league=Object.values(w.playerStats).filter(r=>r.leagueId===c.season.leagueId),all=allClubRows(c),club=all.filter(r=>r.clubId===clubId),own=club.find(r=>r.playerId===p.id),awards:Award[]=[];
 const age=(r:CompetitorSeason)=>r.playerId===p.id?p.age:w.players[r.playerId]?.age??99;
 const minApps=Math.max(8,Math.ceil(c.season.totalWeeks*.35)),eligible=(r:CompetitorSeason)=>r.stats.apps>=minApps&&r.stats.minutes>=720&&avg(r.stats)>=6.65;
 const creationYear=Number(c.createdAt.slice(0,4));
 const tenure=(r:CompetitorSeason)=>r.playerId===p.id?Math.max(0,year-c.systems!.leadership.clubSinceYear):Math.max(0,year-(w.players[r.playerId]?.joinedYear??creationYear));
 const reputation=(r:CompetitorSeason)=>{
  const prior=c.systems!.rankings.slice(-3).flatMap(y=>y.candidates),ranks=prior.filter(x=>x.playerId===r.playerId);
  return Math.max(0,...ranks.map(x=>31-x.rank))*1.1+(r.playerId===p.id?c.awards.filter(a=>a.year>=year-2&&['world','continental-individual'].includes(a.category??'')).length*6:0);
 };
 const popularity=(r:CompetitorSeason)=>(performance(r)*.65+reputation(r)+Math.min(7,tenure(r))*2+Math.min(12,r.stats.goals*.25+r.stats.assists*.18)*(1+Math.log10(1+(w.clubs[clubId]?.revenue??0)/1000000)*.03)+(r.stats.mom??0)*.9)*(r.playerId===p.id?1+personalityEdge(c,'stardom')*.05:1);
 const firstSigning=(r:CompetitorSeason)=>r.playerId===p.id?c.transfers.some(t=>t.toClubId===r.clubId&&t.year===year&&t.fromClubId!==t.toClubId):w.players[r.playerId]?.joinedYear===year;
 const valueReturn=(r:CompetitorSeason)=>performance(r)/(1+Math.log10(1+(r.playerId===p.id?c.transfers.find(t=>t.year===year&&t.toClubId===clubId)?.fee??0:w.players[r.playerId]?.transferFee??0)/1000000)*.14);
 const add=(id:string,name:string,scope:string,rows:CompetitorSeason[],score:(r:CompetitorSeason)=>number,detail:string,commercial=false)=>{
  const candidates=rows.filter(eligible).map(r=>({r,score:score(r)})).sort((a,b)=>b.score-a.score||a.r.playerId.localeCompare(b.r.playerId));
  const win=candidates[0];if(!win||win.r.playerId!==p.id)return;
  awards.push({id:`${year}:extra:${id}:${clubId}:${p.id}`,name:`${scope==='club'?'클럽 선정':'언론 선정'} · ${name}`,year,clubId,category:commercial?'commercial':scope,official:false,organiser:scope==='club'?'클럽 평가 모형':'언론 평가 모형',verification:'game-model',ruleVersion:'kball-extra-2.7',evaluationPeriod:`${year}시즌`,criterion:detail,description:`${getClub(clubId).name} · ${win.r.stats.apps}경기 · 평점 ${avg(win.r.stats).toFixed(2)} · 자격 충족 후보 ${candidates.length}명 비교. ${detail}${commercial?' 실제 판매 데이터가 없는 예상 순위이며 판매량을 생성하지 않습니다.':' 공식 시상 결과와 구별하는 게임 내 선정입니다.'}`});
 };
 add('club-player','구단 올해의 선수','club',club,performance,'포지션별 경기 기여·실제 출전량·평점');
 add('club-fans','구단 팬 선정 올해의 선수','club',club,r=>popularity(r)+(r.stats.mom??0),'활약·주요 경기 기여·게임 내 명성·보존된 재적 기간으로 팬 평가 추정');
 add('club-squad','구단 선수단 선정 올해의 선수','club',club,r=>performance(r)*.7+(r.playerId===p.id?p.attributes.teamwork??50:w.players[r.playerId]?.leadership??50)*.25+Math.min(10,r.stats.starts*.2)-r.stats.redCards*3,'팀워크·선발 기여·꾸준한 경기력·페어플레이로 동료 평가 추정');
 add('club-young','구단 올해의 유망주','club',club.filter(r=>age(r)<=23),performance,'23세 이하 · 충분한 실제 출전과 포지션별 활약');
 add('club-signing','구단 올해의 영입','club',club.filter(firstSigning),valueReturn,'게임에서 확인된 이적 첫 시즌 · 실제 이적료 대비 기여');
 for(const [group,name] of [['FWD','공격수'],['MID','미드필더'],['DEF','수비수'],['GK','골키퍼']])add(`club-${group}`,`구단 올해의 ${name}`,'club',club.filter(r=>role(r.position)===group),performance,'해당 포지션군 내 충분한 실제 출전·평점·공격/수비/선방 기여');
 // All peers use the same observed winning-goal evidence. Cup/league own records contain both teams.
 const decisive=new Map<string,number>();for(const m of [...c.season.matches,...cupLedger(c,year).flatMap(t=>t.matches)]){const home=m.homeGoals>m.awayGoals,win=home?m.homeId:m.awayId;if(m.homeGoals===m.awayGoals||win!==clubId)continue;const loseGoals=home?m.awayGoals:m.homeGoals,goals=m.events.filter(e=>e.type==='goal'&&e.teamId===win).sort((a,b)=>a.minute-b.minute),goal=goals[loseGoals];if(goal?.playerId)decisive.set(goal.playerId,(decisive.get(goal.playerId)??0)+1);}
 add('club-clutch','구단 올해의 해결사','club',club.filter(r=>(decisive.get(r.playerId)??0)>=3),r=>(decisive.get(r.playerId)??0)*10+performance(r)*.15,'실제 승리 경기의 결승 득점 3회 이상 · 상대 득점보다 한 골 앞선 득점의 득점자 비교');
 add('league-young',`${getLeague(c.season.leagueId).name} 올해의 유망주`,'league',league.filter(r=>age(r)<=23),performance,'23세 이하 · 같은 리그 실제 시즌 활약 비교');
 const ownFirst=!c.history.some(h=>h.year<year&&h.leagueId===c.season.leagueId&&h.squad==='senior'&&h.stats.apps>0);
 add('league-rookie',`${getLeague(c.season.leagueId).name} 올해의 신인`,'league',league.filter(r=>r.playerId===p.id?ownFirst:w.players[r.playerId]?.leagueDebutYear===year),performance,'이 게임에서 참가 이력이 확인되는 리그 첫 시즌 · NPC 과거 이력이 불명확하면 후보에서 제외');
 add('league-signing',`${getLeague(c.season.leagueId).name} 올해의 영입`,'league',league.filter(firstSigning),valueReturn,'확인된 이적 첫 시즌 · 출전 기여와 이적료 대비 활약');
 for(const [month,map] of Object.entries(c.systems.monthlyLeague?.year===year?c.systems.monthlyLeague.months:{}))for(const young of [false,true]){
  const eligible=Object.values(map).filter(r=>r.stats.apps>=2&&r.stats.minutes>=120&&avg(r.stats)>=6.8&&(!young||r.age<=23)),baselines=performanceBaselines(eligible,120),scores=new Map(eligible.map(r=>[r.id,tournamentPerformance(r,baselines)])),candidates=eligible.sort((a,b)=>scores.get(b.id)!-scores.get(a.id)!||a.id.localeCompare(b.id));
  if(candidates[0]?.id===p.id){const r=candidates[0];awards.push({id:`${year}:extra:month:${month}:${young?'young':'player'}:${p.id}`,year,clubId:r.clubId,name:`언론 선정 · ${getLeague(c.season.leagueId).name} ${month} 이달의 ${young?'유망주':'선수'}`,category:'league-monthly',official:false,organiser:'언론 평가 모형',verification:'game-model',description:`${month} 리그만 ${r.stats.apps}경기 · ${r.stats.goals}골 ${r.stats.assists}도움 · 평점 ${avg(r.stats).toFixed(2)}. 최소 2경기·120분·평점 6.8${young?'·23세 이하':''}; ${candidates.length}명 비교. 공식 월간 시상과 구별하는 언론 선정.`});}
 }
 // Domestic cups use their own ledger. Existing continental MVP is reused, never awarded twice.
 for(const t of cupLedger(c,year).filter(t=>t.phase==='completed'&&(t.kind==='cup'||t.kind==='leagueCup'))){
  const rows=Object.values(t.playerStats??{}),minApps=Math.max(2,Math.ceil(Math.max(...rows.map(r=>r.stats.apps),0)*.5));
  const eligible=rows.filter(r=>r.stats.apps>=minApps),baselines=performanceBaselines(eligible,90),scores=new Map(eligible.map(r=>[r.playerId,legacyPerformance(r,baselines)]));
  const candidates=eligible.sort((a,b)=>scores.get(b.playerId)!-scores.get(a.playerId)!||a.playerId.localeCompare(b.playerId));
  if(candidates[0]?.playerId===p.id)awards.push({id:`${t.id}:extra:mvp:${p.id}`,year,clubId,name:`언론 선정 · ${t.name} 최우수 선수`,category:'cup-individual',official:false,organiser:'언론 평가 모형',verification:'game-model',description:`해당 컵 실제 출전 ${candidates[0].stats.apps}경기 · 포지션별 활약으로 ${candidates.length}명 비교. 다른 대회 기록 제외.`});
 }
 const natGames=[...new Map([...(c.systems.national.history.flatMap(h=>h.matches)??[]),...c.systems.national.matches].filter(m=>m.seasonYear===year&&m.playerClubId.endsWith(':senior')).map(m=>[m.fixtureId,m])).values()];
 const natRows=new Map<string,MonthlyPlayer>();for(const m of natGames)for(const r of m.performers??[]){if((r.teamId??r.clubId)!==m.playerClubId)continue;const row=natRows.get(r.id)??{id:r.id,name:r.name,position:r.position,age:99,clubId,stats:emptyStats()};addStats(row.stats,r.stats);natRows.set(r.id,row);}
 const nationalPool=[...natRows.values()].filter(r=>r.stats.apps>=4&&r.stats.minutes>=240&&avg(r.stats)>=6.7),nationalBaselines=performanceBaselines(nationalPool,240),nationalScores=new Map(nationalPool.map(r=>[r.id,tournamentPerformance(r,nationalBaselines)])),nationals=nationalPool.sort((a,b)=>nationalScores.get(b.id)!-nationalScores.get(a.id)!||a.id.localeCompare(b.id));
 if(nationals[0]?.id===p.id)awards.push({id:`${year}:extra:national-player:${p.id}`,year,clubId,name:`언론 선정 · ${c.systems.national.country} 국가대표 올해의 선수`,category:'national-individual',official:false,organiser:'언론 평가 모형',verification:'game-model',description:`해당 게임 연도 실제 성인 대표팀 ${nationals[0].stats.apps}경기 · 같은 대표팀 실제 출전 ${nationals.length}명 비교. U20·클럽 기록 제외.`});
 // Historical estimated popularity awards remain intact. New sales medals use
 // the conserved world merchandise market, not a second popularity-only award.
 return awards.filter(a=>!c.awards.some(old=>old.id===a.id));
}
