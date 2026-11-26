import {cupLedger,tournamentResult} from './club-competitions';
import {nationalSquadFor} from './national';
import {nationalAvailable,nationalParticipationReason,nationalParticipation,nationalParticipationNotice} from './national-participation';
import { getClub,getLeague,LEAGUES,INTERNATIONAL_LEAGUES } from './data';
import { recordedEmployment } from './employment';
import { getNationalCompetitionResult,nationalMatchPhase,type NationalCompetitionPhase } from './national-competition-results';
import { seasonDate,seasonHalfEndDate } from './calendar';
import { normalizeNationality } from './national-data';
import type { Career,MatchRecord,PlayerStats,Standing } from './types';
import type { NationalState } from './revision-types';

type ParticipationStats=Pick<PlayerStats,'apps'|'minutes'|'yellowCards'|'redCards'>;

export interface CompetitionParticipation extends ParticipationStats {
  id:string;
  year:number;
  scope:'club'|'national';
  /** Missing only when no current-season national participation is known. */
  competitionId?:string;
  name:string;
  teamId:string;
  teamName:string;
  squad:'youth'|'U20'|'senior';
  status:'registered'|'played'|'called'|'completed'|'unselected'|'watchlist'|'injured'|'retired';
  statusLabel:string;
  teamGames?:number;
  standing?:Pick<Standing,'won'|'drawn'|'lost'|'points'>;
  nationalPhase?:NationalCompetitionPhase;
  reason:string;
}

const names:Record<string,string>={WC:'FIFA 월드컵',U20WC:'FIFA U-20 월드컵',AFC:'AFC 아시안컵',UEFA:'UEFA 유로',CONMEBOL:'코파 아메리카',CONCACAF:'CONCACAF 골드컵',CAF:'아프리카 네이션스컵',OFC:'OFC 네이션스컵',FRIENDLIES:'국제친선'};
export function nationalCompetitionName(id?:string):string {
  const [kind,year] = id?.split(':') ?? [];
  return year && Object.hasOwn(names,kind) ? `${year} ${names[kind]}` : '국가대표 경기 · 대회 미집계';
}
const nationalTeamName=(id:string)=>{const [,country,squad]=id.split(':');return `${country} ${squad==='U20'?'U20':'성인 대표팀'}`;};
const squadOf=(match:MatchRecord):'U20'|'senior'=>match.playerClubId.endsWith(':U20')?'U20':'senior';
const played=(match:MatchRecord)=>match.playerPlayed&&match.playerStats.apps>0;
const leagues=new Set([...LEAGUES,...INTERNATIONAL_LEAGUES].map(row=>row.id));

function participationStats(matches:readonly MatchRecord[],aggregate?:PlayerStats):ParticipationStats {
  if(aggregate){
    const {apps,minutes,yellowCards=0,redCards=0}=aggregate;
    return {apps,minutes,yellowCards,redCards};
  }
  const totals={apps:0,minutes:0,yellowCards:0,redCards:0};
  for(const {playerStats:stats} of matches){
    totals.apps+=stats.apps;
    totals.minutes+=stats.minutes;
    totals.yellowCards+=stats.yellowCards??0;
    totals.redCards+=stats.redCards??0;
  }
  return totals;
}

/** The current window and its archive can contain the same fixture. Prefer a saved appearance. */
export function nationalMatchLedger(career:Career):MatchRecord[] {
  const national=career.systems?.national;if(!national)return [];
  const unique=new Map<string,MatchRecord>();
  for(const match of[...national.history.flatMap(row=>row.matches),...national.matches]){
    const key=match.fixtureId||match.id,previous=unique.get(key);
    if(!previous||!played(previous)&&played(match))unique.set(key,match);
  }
  return [...unique.values()];
}

/** A retained `called` flag from last season is not proof of a new call-up. */
function currentCallup(career:Career,national:NationalState,matches:MatchRecord[]):boolean {
  if(!nationalAvailable(career)||national.status!=='called'||national.squad!==nationalSquadFor(career))return false;
  if(matches.some(match=>squadOf(match)===national.squad))return true;
  const start=seasonDate(career.season,0).slice(0,10),end=seasonHalfEndDate(career.season,'second').slice(0,10);
  const through=national.processedThrough?.slice(0,10);
  if(through&&through>=start&&through<=end&&national.processedWindows.some(key=>{
    const parsed=/^callup:(\d{4}-\d{2}):(U20|senior)$/.exec(key);if(!parsed||parsed[2]!==national.squad)return false;
    const date=`${parsed[1]}-05`;return date>=start&&date<=end&&date<=through;
  }))return true;
  return Boolean(career.systems?.events.some(event=>event.year===career.season.year&&event.type==='national'&&event.id.startsWith('national:callup:')&&event.id.endsWith(`:${national.squad}`)&&event.title.includes('발탁')));
}

function clubParticipations(career:Career,year:number):CompetitionParticipation[] {
  const current=year===career.season.year,summary=career.history.find(row=>row.year===year),season=career.season;
  if(!current&&!summary)return [];
  const leagueId=summary?.leagueId??season.leagueId,leagueName=summary?.competitionName??season.competitionName;
  const squad=summary?.squad??(leagueName.includes('U19')?'youth':career.player.squad);
  const matches=summary?.matches??season.matches,completed=summary?.completed??season.completed;
  const retired=current&&career.stage==='retired'&&!completed;
  const groups=new Map<string,{teamId:string;leagueId:string;matches:MatchRecord[]}>();
  function group(teamId:string,id:string) {
    const key=`${id}:${teamId}`;
    const row=groups.get(key)??{teamId,leagueId:id,matches:[]};
    groups.set(key,row);
    return row;
  }
  for(const period of recordedEmployment(career,year))if(period.clubId!=='FA')group(period.clubId,period.leagueId);
  for(const match of new Map(matches.map(m=>[m.fixtureId||m.id,m])).values()){
    if(match.playerClubId!=='FA')group(match.playerClubId,match.competitionId&&leagues.has(match.competitionId)?match.competitionId:leagueId).matches.push(match);
  }
  // The archived club represents the played season even after an offseason signing.
  const teamId=summary?.clubId??(career.stage==='offseason'?matches[0]?.playerClubId:undefined)??career.player.clubId;
  if(teamId!=='FA')group(teamId,leagueId);
  const rows:CompetitionParticipation[]=[];
  for(const entry of groups.values()){
    const id=entry.teamId,stored=summary?.details?.employmentStandings?.find(row=>row.clubId===id&&row.leagueId===entry.leagueId);
    const primary=entry.leagueId===leagueId;
    const youthTable=career.systems?.youthLeagueSchedules?.[entry.leagueId]?.table;
    const table=primary?(summary?.details?.table??(current?season.table:undefined))
      :current?(squad==='youth'?youthTable:career.systems?.world.competitions[entry.leagueId]?.table):undefined;
    const tableIndex=table?.findIndex(row=>row.clubId===id)??-1;
    const standing=stored??table?.[tableIndex];
    const rank=stored?.rank??(primary&&summary?.clubId===id?summary.rank:tableIndex+1);
    const knownRank=rank>0&&(completed||standing?.played||retired&&entry.matches.length);
    const atDeparture=stored?.atDeparture||current&&!primary&&squad==='youth'&&!!youthTable;
    const statusLabel=knownRank?`${atDeparture?'이적 당시':completed?'최종':retired?'은퇴 시점':'현재'} ${rank}위`
      :completed?'최종 순위 미보존':retired?'은퇴 시점 · 순위 미보존':standing?.played||entry.matches.length?'순위 미보존':'시작 전 · 등록';
    const stats=participationStats(entry.matches,groups.size===1?summary?.stats??season.playerStats:undefined);
    const name=primary?leagueName:getLeague(entry.leagueId).name;
    rows.push({
      id:`club:${year}:${entry.leagueId}:${id}`,year,scope:'club',competitionId:entry.leagueId,
      name:squad==='youth'&&!name.includes('U19')?`${name} · U19 시뮬레이션`:name,teamId:id,teamName:getClub(id).name,squad,
      ...stats,status:completed||retired?'completed':stats.apps?'played':'registered',statusLabel,
      teamGames:standing?.played,standing,reason:squad==='youth'?'U19 리그':'정규리그',
    });
  }
  const leagueTeams=[...groups.values()].map(row=>row.teamId);
  if(squad==='senior')for(const cup of cupLedger(career,year)){
    const teams=new Set([...leagueTeams,...cup.matches.map(match=>match.playerClubId)]);
    for(const id of teams){
      if(!cup.entrants.includes(id))continue;
      const games=[...new Map(cup.matches.filter(match=>match.playerClubId===id).map(match=>[match.fixtureId||match.id,match])).values()];
      const stats=participationStats(games),result=tournamentResult(cup,id);
      rows.push({
        id:`cup:${cup.id}:${id}`,year,scope:'club',competitionId:cup.id,name:cup.name,teamId:id,teamName:getClub(id).name,squad,
        ...stats,
        teamGames:cup.fixtures.filter(f=>f.played&&(f.homeId===id||f.awayId===id)).length,
        status:cup.phase==='completed'||result.includes('탈락')?'completed':stats.apps?'played':'registered',
        statusLabel:result,reason:`${cup.basis} · ${cup.rules}`,
      });
    }
  }
  return rows.length?rows:[{id:`club:none:${year}`,year,scope:'club',name:'FA · 무소속',teamId:'FA',teamName:'FA · 무소속',squad,status:'unselected',statusLabel:'클럽 미등록',...participationStats([]),reason:'해당 시즌 클럽 소속 기록이 없습니다.'}];
}

function nationalEmpty(career:Career):CompetitionParticipation {
  const national=career.systems?.national,ageSquad=nationalSquadFor(career);
  const teamId=`NAT:${normalizeNationality(career.player.nationality)}:${ageSquad}`;
  let status:CompetitionParticipation['status']=national?.status==='injured'?'injured':national?.status==='watchlist'?'watchlist':'unselected';
  let statusLabel=status==='injured'?'부상 제외':status==='watchlist'?'관찰 중':'미선발';
  let reason=national?.reason??'현재 시즌에 확인된 국가대표 소집·출전 기록이 없습니다.';
  if(career.stage==='retired'){status='retired';statusLabel='국대 경력 종료';}
  else if(!nationalAvailable(career)){status=nationalParticipation(career).retired?'retired':'unselected';statusLabel=nationalParticipation(career).retired?'국대 은퇴':'소집 거절';reason=nationalParticipationReason(career)!;}
  else if(nationalParticipationNotice(career)){status='unselected';statusLabel='다음 소집 대기';reason=nationalParticipationNotice(career)!;}
  else if(national&&national.squad!==ageSquad){status='unselected';statusLabel='새 연령대 소집 대기';reason='현재 연령에 맞는 대표팀의 새 소집에서 실력·소속·출전 성과를 다시 평가합니다.';}
  else if(national?.status==='called'){status='unselected';statusLabel='다음 소집 대기';reason='이전 소집 상태만 남아 있습니다. 현재 시즌의 새 소집이나 출전은 아직 확인되지 않았습니다.';}
  return {id:`national:none:${career.season.year}`,year:career.season.year,scope:'national',name:'참여 대회 없음',teamId,teamName:nationalTeamName(teamId),squad:ageSquad,status,statusLabel,...participationStats([]),reason};
}

type NationalGroup={year:number;teamId:string;squad:NationalState['squad'];competitionId?:string;phase:NationalCompetitionPhase;matches:MatchRecord[];called:boolean};
const editionKey=(id:string|undefined,squad:NationalState['squad'])=>`${squad}|${id??'unrecorded'}`;
const phaseNames={qualifying:'예선',finals:'본선',friendly:'친선',unrecorded:''};

function nationalParticipations(career:Career,years:Set<number>):CompetitionParticipation[] {
  const n=career.systems?.national;
  if(!n)return [];
  const own=nationalMatchLedger(career).filter(match=>match.playerClubId.startsWith('NAT:')&&[match.homeId,match.awayId].includes(match.playerClubId));
  const groups=new Map<string,NationalGroup>();
  function group(year:number,teamId:string,squad:NationalState['squad'],id:string|undefined,phase:NationalCompetitionPhase) {
    const key=`${year}|${teamId}|${editionKey(id,squad)}|${phase}`;
    const row=groups.get(key)??{year,teamId,squad,competitionId:id,phase,matches:[],called:false};
    groups.set(key,row);
    return row;
  }
  for(const match of own)if(years.has(match.seasonYear)){
    group(match.seasonYear,match.playerClubId,squadOf(match),match.competitionId,nationalMatchPhase(match)).matches.push(match);
  }
  const year=career.season.year;
  if(years.has(year)&&n.phase!=='eliminated'&&currentCallup(career,n,own.filter(match=>match.seasonYear===year))){
    const date=(n.processedThrough??seasonDate(career.season)).slice(0,4);
    const id=n.phase==='friendlies'?`FRIENDLIES:${date}`:n.competitionId;
    const teamId=`NAT:${n.country}:${n.squad}`;
    const phase=n.phase==='friendlies'?'friendly':n.phase==='finals'?'finals':'qualifying';
    group(year,teamId,n.squad,id,phase).called=true;
  }
  const participating=[...groups.values()].filter(row=>row.called||row.matches.some(match=>played(match)||match.nationalSelection?.called));
  if(!participating.length)return [];
  const editions=new Map(participating.map(row=>[editionKey(row.competitionId,row.squad),new Map<string,MatchRecord>()]));
  for(const ledger of [own,n.teamResults??[]])for(const match of ledger){
    const squad=match.homeId.endsWith(':U20')?'U20':'senior';
    const records=editions.get(editionKey(match.competitionId,squad));
    const id=match.fixtureId||match.id;
    if(records&&!records.has(id))records.set(id,match);
  }
  const editionMatches=new Map([...editions].map(([key,matches])=>[key,[...matches.values()]]));
  return participating.map(row=>{
    const {competitionId:id,teamId,squad,phase}=row;
    const archive=n.history.find(h=>h.competitionId===id&&h.squad===squad&&h.year===row.year);
    const regularName=archive?.competitionName||(id===n.competitionId?n.competitionName:nationalCompetitionName(id));
    const name=phase==='friendly'&&id?.startsWith('FRIENDLIES:')?nationalCompetitionName(id)
      :phaseNames[phase]?`${regularName} · ${phaseNames[phase]}`:regularName;
    const stats=participationStats(row.matches.filter(played));
    const related=editionMatches.get(editionKey(id,squad))??[];
    const outcome=getNationalCompetitionResult(career,{id,teamId,squad,phase,year:row.year},related,archive);
    const teamGames=related.filter(match=>match.seasonYear===row.year&&nationalMatchPhase(match)===phase&&(match.homeId===teamId||match.awayId===teamId)).length;
    const injured=row.year===year&&id===n.competitionId&&squad===n.squad&&n.status==='injured';
    const waiting=row.called&&!teamGames;
    return {
      id:`national:${row.year}:${teamId}:${id??'unrecorded'}:${phase}`,year:row.year,scope:'national',competitionId:id,name,teamId,teamName:nationalTeamName(teamId),squad,
      status:waiting?'called':outcome.complete?'completed':injured?'injured':row.called?'called':'played',
      statusLabel:waiting?'소집 · 출전 대기':outcome.label,
      nationalPhase:phase,...stats,teamGames,
      reason:row.called||injured?n.reason:'대표팀 경기 원장 기준',
    } satisfies CompetitionParticipation;
  });
}

export function competitionGamesLabel(row:CompetitionParticipation):string {
  return `내 출전 ${row.apps}경기${row.teamGames===undefined?'':` · 팀 ${row.teamGames}경기`}`;
}

/** Read saved competition results as of the requested season without rewriting records. */
export function getCompetitionSeasons(career:Career,years:readonly number[]):Map<number,CompetitionParticipation[]> {
  const result=new Map(years.map(year=>[year,clubParticipations(career,year)]));
  for(const row of nationalParticipations(career,new Set(years)))result.get(row.year)?.push(row);
  const current=result.get(career.season.year);
  if(current&&!current.some(row=>row.scope==='national'))current.push(nationalEmpty(career));
  return result;
}

export function getSeasonCompetitions(career:Career):CompetitionParticipation[] {
  return getCompetitionSeasons(career,[career.season.year]).get(career.season.year)!;
}
