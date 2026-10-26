import {cupLedger,tournamentResult} from './club-competitions';
import {nationalSquadFor} from './national';
import { getClub } from './data';
import { seasonDate,seasonHalfEndDate } from './calendar';
import { normalizeNationality } from './national-data';
import type { Career,MatchRecord } from './types';
import type { NationalState } from './revision-types';

export interface CompetitionParticipation {
  id:string;
  scope:'club'|'national';
  /** Missing only when no current-season national participation is known. */
  competitionId?:string;
  name:string;
  teamId:string;
  teamName:string;
  squad:'youth'|'U20'|'senior';
  status:'registered'|'played'|'called'|'completed'|'unselected'|'watchlist'|'injured'|'retired';
  statusLabel:string;
  apps:number;
  minutes:number;
  reason:string;
}

const names:Record<string,string>={WC:'FIFA 월드컵',U20WC:'FIFA U-20 월드컵',AFC:'AFC 아시안컵',UEFA:'UEFA 유로',CONMEBOL:'코파 아메리카',CONCACAF:'CONCACAF 골드컵',CAF:'아프리카 네이션스컵',OFC:'OFC 네이션스컵',FRIENDLIES:'국제친선'};
const nationalName=(id:string)=>{const [kind,year]=id.split(':');return names[kind]?`${year} ${names[kind]}`:'국가대표 경기 · 대회 미집계';};
const nationalTeamName=(id:string)=>{const [,country,squad]=id.split(':');return `${country} ${squad==='U20'?'U20':'성인 대표팀'}`;};
const squadOf=(match:MatchRecord):'U20'|'senior'=>match.playerClubId.endsWith(':U20')?'U20':'senior';
const played=(match:MatchRecord)=>match.playerPlayed&&match.playerStats.apps>0;

function currentNationalMatches(career:Career):MatchRecord[] {
  const national=career.systems?.national;if(!national)return [];
  const unique=new Map<string,MatchRecord>();
  for(const match of[...national.history.flatMap(row=>row.matches),...national.matches]){
    if(match.seasonYear!==career.season.year||!match.playerClubId.startsWith('NAT:')||![match.homeId,match.awayId].includes(match.playerClubId))continue;
    const key=match.fixtureId||match.id,previous=unique.get(key);
    // Duplicate archived/current copies are the same appearance, never another match.
    if(!previous||!played(previous)&&played(match))unique.set(key,match);
  }
  return [...unique.values()];
}

/** A retained `called` flag from last season is not proof of a new call-up. */
function currentCallup(career:Career,national:NationalState,matches:MatchRecord[]):boolean {
  if(national.status!=='called'||national.squad!==nationalSquadFor(career))return false;
  if(matches.some(match=>squadOf(match)===national.squad))return true;
  const start=seasonDate(career.season,0).slice(0,10),end=seasonHalfEndDate(career.season,'second').slice(0,10);
  const through=national.processedThrough?.slice(0,10);
  if(through&&through>=start&&through<=end&&national.processedWindows.some(key=>{
    const parsed=/^callup:(\d{4}-\d{2}):(U20|senior)$/.exec(key);if(!parsed||parsed[2]!==national.squad)return false;
    const date=`${parsed[1]}-05`;return date>=start&&date<=end&&date<=through;
  }))return true;
  return Boolean(career.systems?.events.some(event=>event.year===career.season.year&&event.type==='national'&&event.id.startsWith('national:callup:')&&event.id.endsWith(`:${national.squad}`)&&event.title.includes('발탁')));
}

function clubParticipation(career:Career):CompetitionParticipation {
  const season=career.season,summary=career.history.find(row=>row.year===season.year);
  // Offseason signing already changes player.clubId, but not the season just completed.
  const teamId=season.matches[0]?.playerClubId??summary?.clubId??career.player.clubId;
  const squad=summary?.squad??(season.competitionName.includes('U19')?'youth':career.player.squad);
  const name=squad==='youth'&&!season.competitionName.includes('U19')?`${season.competitionName} · U19 시뮬레이션`:season.competitionName;
  const ended=career.stage!=='season'||season.completed;
  const stats=season.playerStats;
  return {id:`club:${season.year}:${season.leagueId}:${teamId}:${squad}`,scope:'club',competitionId:season.leagueId,name,teamId,teamName:getClub(teamId).name,squad,status:ended?'completed':stats.apps>0?'played':'registered',statusLabel:ended?'시즌 종료':stats.apps>0?'출전 중':season.week===0?'시작 전 · 등록':'등록 · 출전 경쟁',apps:stats.apps,minutes:stats.minutes,reason:squad==='youth'?'현재 소속의 U19 경기입니다. 성인 정규리그 출전과 구분합니다.':stats.apps?'실제 현재 시즌 소속과 출전 기록입니다.':'현재 시즌 소속 대회입니다. 실제 선발과 출전은 실력·신뢰·상태에 따라 결정됩니다.'};
}

function nationalEmpty(career:Career):CompetitionParticipation {
  const national=career.systems?.national,ageSquad=nationalSquadFor(career);
  const teamId=`NAT:${normalizeNationality(career.player.nationality)}:${ageSquad}`;
  let status:CompetitionParticipation['status']=national?.status==='injured'?'injured':national?.status==='watchlist'?'watchlist':'unselected';
  let statusLabel=status==='injured'?'부상 제외':status==='watchlist'?'관찰 중':'미선발';
  let reason=national?.reason??'현재 시즌에 확인된 국가대표 소집·출전 기록이 없습니다.';
  if(career.stage==='retired'){status='retired';statusLabel='국대 경력 종료';}
  else if(national&&national.squad!==ageSquad){status='unselected';statusLabel='새 연령대 소집 대기';reason='현재 연령에 맞는 대표팀의 새 소집에서 실력·소속·출전 성과를 다시 평가합니다.';}
  else if(national?.status==='called'){status='unselected';statusLabel='다음 소집 대기';reason='이전 소집 상태만 남아 있습니다. 현재 시즌의 새 소집이나 출전은 아직 확인되지 않았습니다.';}
  return {id:`national:none:${career.season.year}`,scope:'national',name:'참여 대회 없음',teamId,teamName:nationalTeamName(teamId),squad:ageSquad,status,statusLabel,apps:0,minutes:0,reason};
}

/** Actual season membership and national selection, never predicted cup eligibility. */
export function getSeasonCompetitions(career:Career):CompetitionParticipation[] {
  const rows=[clubParticipation(career)],national=career.systems?.national,club=rows[0];
  if(career.player.clubId==='FA'&&!career.season.playerStats.apps){club.name='FA · 무소속';club.teamId='FA';club.teamName='FA · 무소속';club.statusLabel='클럽 미등록';club.reason='계약 없이 반 시즌씩 진행 중이며 클럽 경기에 출전하지 않습니다.';}
  if(club.squad==='senior')for(const t of cupLedger(career,career.season.year).filter(t=>t.entrants.includes(club.teamId))){
    const apps=t.matches.reduce((n,m)=>n+m.playerStats.apps,0),minutes=t.matches.reduce((n,m)=>n+m.playerStats.minutes,0),result=tournamentResult(t,club.teamId);
    rows.push({id:t.id,scope:'club',competitionId:t.id,name:t.name,teamId:club.teamId,teamName:club.teamName,squad:'senior',apps,minutes,status:t.phase==='completed'||result.includes('탈락')?'completed':apps?'played':'registered',statusLabel:result,reason:`${t.basis} · ${t.rules}`});
  }
  if(!national)return [...rows,nationalEmpty(career)];
  const matches=currentNationalMatches(career),called=currentCallup(career,national,matches);
  const groups=new Map<string,{teamId:string;squad:'U20'|'senior';competitionId?:string;matches:MatchRecord[];called:boolean}>();
  for(const match of matches.filter(played)){
    const id=match.competitionId,key=`${match.playerClubId}|${id??'unrecorded'}`;
    const group=groups.get(key)??{teamId:match.playerClubId,squad:squadOf(match),competitionId:id,matches:[],called:false};
    group.matches.push(match);groups.set(key,group);
  }
  if(called){
    const year=(national.processedThrough??seasonDate(career.season)).slice(0,4);
    const id=national.phase==='friendlies'?`FRIENDLIES:${year}`:national.competitionId;
    const teamId=`NAT:${national.country}:${national.squad}`,key=`${teamId}|${id}`;
    const group=groups.get(key)??{teamId,squad:national.squad,competitionId:id,matches:[],called:false};group.called=true;groups.set(key,group);
  }
  for(const group of groups.values()){
    const id=group.competitionId,known=national.history.find(row=>row.competitionId===id&&row.squad===group.squad&&row.year===career.season.year);
    let name=known?.competitionName||(id===national.competitionId?national.competitionName:id?nationalName(id):'국가대표 경기 · 대회 미집계');
    const qualifying=group.matches.some(match=>match.fixtureId.includes('|qualifying|'));
    const finals=group.matches.some(match=>/\|(group|round32|round16|quarterfinal|semifinal|final|thirdPlace)\|/.test(match.fixtureId));
    if(!id?.startsWith('FRIENDLIES:')){
      if(qualifying||finals)name+=` · ${qualifying&&finals?'예선·본선':finals?'본선':'예선'}`;
      else if(group.called)name+=` · ${national.phase==='finals'?'본선 소집':'소집'}`;
    }
    const apps=group.matches.reduce((sum,match)=>sum+match.playerStats.apps,0),minutes=group.matches.reduce((sum,match)=>sum+match.playerStats.minutes,0);
    const ended=career.stage!=='season'||career.season.completed;
    const injured=national.status==='injured'&&id===national.competitionId&&group.squad===national.squad;
    const status:CompetitionParticipation['status']=ended?'completed':injured?'injured':group.called?'called':'played';
    rows.push({id:`national:${career.season.year}:${group.teamId}:${id??'unrecorded'}`,scope:'national',competitionId:id,name,teamId:group.teamId,teamName:nationalTeamName(group.teamId),squad:group.squad,status,statusLabel:ended?'시즌 기록':injured?'출전 기록 · 부상 제외':group.called?apps?'소집 · 출전 중':'소집 · 출전 대기':'이번 시즌 출전',apps,minutes,reason:group.called||injured?national.reason:'이번 시즌 실제 국가대표 출전 원장에서 확인한 대회입니다.'});
  }
  return rows.some(row=>row.scope==='national')?rows:[...rows,nationalEmpty(career)];
}
