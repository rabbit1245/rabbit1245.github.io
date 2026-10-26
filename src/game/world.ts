import {playingAbility} from './attributes';
import {reviewK3Promotion} from './korean-promotion';
import {internationalRoster} from './international-clubs';
import {compactMoney} from './currency';
import { CLUBS, LEAGUES, ROSTERS, ROSTER_CALIBRATION, getClub, getLeague } from './data';
import { ALL_STATS, clamp, emptyStats, hashSeed, integer, round, seededRandom } from './math';
import { getLeagueRule } from './league-rules';
import { nationalityForPlayer,currentNationality } from './national-data';
import { simulateMatch } from './match-engine';
import { assessClubSeason,beginClubDevelopment } from './club-development';
import type { Career, Fixture, MatchRecord, Position, Standing } from './types';
import type { ClubWorld, CompetitionState, MatchParticipant, WorldPlayer, WorldState } from './revision-types';

function makeFixtures(ids: string[], year: number): Fixture[] {
  const ring: (string|null)[] = [...ids].sort();
  if (ring.length % 2) ring.push(null);
  const rounds = Math.max(0, ring.length - 1), fixtures: Fixture[] = [];
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < ring.length / 2; i++) {
      const a = ring[i], b = ring[ring.length - 1 - i];
      if (!a || !b) continue;
      const home = (r + i) % 2 ? b : a, away = home === a ? b : a;
      fixtures.push({id:`fixture_${year}_${r+1}_${home}_${away}`,round:r+1,homeId:home,awayId:away,played:false});
      fixtures.push({id:`fixture_${year}_${r+1+rounds}_${away}_${home}`,round:r+1+rounds,homeId:away,awayId:home,played:false});
    }
    ring.splice(1, 0, ring.pop()!);
  }
  return fixtures.sort((a,b) => a.round-b.round || a.id.localeCompare(b.id));
}

function tableFor(fixtures: Fixture[], ids: string[]): Standing[] {
  const rows = new Map(ids.map(clubId => [clubId,{clubId,played:0,won:0,drawn:0,lost:0,goalsFor:0,goalsAgainst:0,points:0}]));
  for (const fixture of fixtures) {
    if (!fixture.played) continue;
    const home = rows.get(fixture.homeId), away = rows.get(fixture.awayId);
    if (!home || !away) continue;
    const h=fixture.homeGoals??0, a=fixture.awayGoals??0;
    home.played++; away.played++; home.goalsFor+=h; home.goalsAgainst+=a; away.goalsFor+=a; away.goalsAgainst+=h;
    if (h>a) {home.won++;home.points+=3;away.lost++;}
    else if (a>h) {away.won++;away.points+=3;home.lost++;}
    else {home.drawn++;away.drawn++;home.points++;away.points++;}
  }
  return [...rows.values()].sort((a,b) => b.points-a.points || (b.goalsFor-b.goalsAgainst)-(a.goalsFor-a.goalsAgainst) || b.goalsFor-a.goalsFor || a.clubId.localeCompare(b.clubId));
}

function competition(leagueId: string, ids: string[], year: number, retained?: Fixture[]): CompetitionState {
  const fixtures=retained ? retained.map(f=>({...f})) : makeFixtures(ids,year);
  return {leagueId,fixtures,table:tableFor(fixtures,ids),round:0,totalRounds:Math.max(0,...fixtures.map(f=>f.round))};
}

const financialFactor: Record<string,number> = {'대한민국':.18,'일본':.26,'중국':.32,'미국':.65,'브라질':.4,'영국':1.3,'이탈리아':.9,'프랑스':.8,'포르투갈':.45,'벨기에':.35,'네덜란드':.45,'튀르키예':.45};
function seasonRevenue(club: ClubWorld): number {
  const league=getLeague(club.leagueId);
  return Math.round(Math.max(250_000, 180_000_000*Math.pow(club.power/80,5)*(financialFactor[league.country]??1)/Math.sqrt(league.tier)));
}

function userWorldPlayer(career: Career): WorldPlayer {
  const player=career.player;
  return {id:player.id,clubId:player.clubId,name:player.name,position:player.position,age:player.age,ovr:player.ovr,potential:player.potential,injuryWeeks:player.injuryWeeks,nationality:player.nationality,leadership:Math.round(clamp((player.attributes.teamwork??55)*.6+(player.attributes.composure??55)*.4,0,100))};
}

export function syncUser(career: Career, world: WorldState): void {
  const previous=world.players[career.player.id];
  if (previous && previous.clubId!==career.player.clubId) {
    const oldClub=world.clubs[previous.clubId];
    if (oldClub) oldClub.rosterIds=oldClub.rosterIds.filter(id=>id!==career.player.id);
  }
  if(career.player.clubId==='FA'){delete world.players[career.player.id];return;}
  world.players[career.player.id]=userWorldPlayer(career);
  const own=world.clubs[career.player.clubId];
  if (own && !own.rosterIds.includes(career.player.id)) own.rosterIds.push(career.player.id);
}

const averagePower=(values:number[],n:number)=>values.slice(0,n).reduce((sum,v)=>sum+v,0)/Math.max(1,Math.min(n,values.length));
const weightedPower=(values:number[])=>averagePower(values,11)*.82+averagePower(values,18)*.18;
const basePowers=new Map(CLUBS.map(club=>[club.id,round(weightedPower(ROSTERS[club.id].map(p=>p.ovr).sort((a,b)=>b-a)))]));
/** The original club scale stays fixed. Sustained results and funded investment can build a new era;
 * inflated replacement NPC ratings still cannot redefine the club's scale.
 */
const seasonForms=new WeakMap<WorldState,{year:number;seed:string;values:Map<string,number>}>();
function teamBase(career:Career,world:WorldState,club:ClubWorld):number {
  const d=club.development,base=d?.basePower??basePowers.get(club.id)!;
  const progress=clamp(((d?.prestige??base)-base)*.35,-3,6);
  let cache=seasonForms.get(world);
  if(!cache||cache.year!==world.year||cache.seed!==career.seed){cache={year:world.year,seed:career.seed,values:new Map()};seasonForms.set(world,cache);}
  let form=cache.values.get(club.id);
  if(form===undefined){const rng=seededRandom(`${career.seed}|club-season-form|${world.year}|${club.id}`);form=(rng()+rng()-1)*2;cache.values.set(club.id,form);}
  return base+progress+clamp(d?.investmentPower??0,0,22)+form;
}

function squadStrength(career: Career, world: WorldState, club: ClubWorld) {
  const ids=club.rosterIds.filter(id=>id!==career.player.id);if(club.id===career.player.clubId)ids.push(career.player.id);
  const players=ids.flatMap(id => {
    const row=id===career.player.id ? userWorldPlayer(career) : world.players[id];
    return row && (id!==career.player.id || career.player.squad==='senior') ? [row] : [];
  });
  const anchored=(world.rosterVersion??1)>=2,base=anchored?teamBase(career,world,club):0;
  const npc=players.filter(p=>p.id!==career.player.id).map(p=>p.ovr).sort((a,b)=>b-a);
  const offset=anchored?base-weightedPower(npc):0;
  const effective=(p:WorldPlayer)=>p.id===career.player.id?playingAbility(career.player):clamp(p.ovr+offset,25,99);
  const full=players.map(effective).sort((a,b)=>b-a);
  const available=players.map(p=>effective(p)-(p.injuryWeeks>0?12:0)).sort((a,b)=>b-a);
  const healthyPower=weightedPower(full),rawPower=weightedPower(available),injuryImpact=healthyPower-rawPower;
  const contribution=healthyPower-weightedPower(npc.map(v=>clamp(v+offset,25,99)));
  const power=anchored?base+contribution-injuryImpact:rawPower;
  return {power:round(clamp(power,25,99)),depth:round(averagePower(available,18)),averageAge:round(players.reduce((n,p)=>n+p.age,0)/Math.max(1,players.length)),injuryImpact:round(injuryImpact)};
}

function refreshClub(career: Career, world: WorldState, club: ClubWorld): void {
  Object.assign(club,squadStrength(career,world,club));
}

export function createWorld(career: Career): WorldState {
  const world: WorldState={rosterVersion:ROSTER_CALIBRATION.version,year:career.season.year,clubs:{},players:{},competitions:{},playerStats:{},movements:[]};
  for (const club of CLUBS) {
    const roster=ROSTERS[club.id]??[];
    for (const player of roster) {
      const rng=seededRandom(`${career.seed}|world-player|${player.id}`);
      world.players[player.id]={...player,potential:clamp(player.ovr+(player.age<=23?integer(rng,3,12):integer(rng,0,3)),player.ovr,98),injuryWeeks:0,nationality:nationalityForPlayer(player.id,club.country),leadership:integer(rng,35,85)};
    }
    world.clubs[club.id]={id:club.id,leagueId:club.leagueId,power:club.power,depth:club.power,averageAge:25,injuryImpact:0,budget:0,wageBudget:0,revenue:0,rosterIds:roster.map(p=>p.id),changes:['보관된 선수단을 기준으로 시작']};
  }
  syncUser(career,world);
  for (const club of Object.values(world.clubs)) {
    const base=basePowers.get(club.id)!;
    club.development={basePower:base,prestige:base,baselineYear:world.year,baselinePower:base,expectedRank:null,history:[]};
    refreshClub(career,world,club);
    club.revenue=seasonRevenue(club); club.budget=Math.round(club.revenue*.22); club.wageBudget=Math.round(club.revenue*.52);
  }
  for (const league of LEAGUES) {
    const ids=Object.values(world.clubs).filter(club=>club.leagueId===league.id).map(club=>club.id);
    world.competitions[league.id]=competition(league.id,ids,world.year,career.player.squad==='senior'&&league.id===career.season.leagueId?career.season.fixtures:undefined);
  }
  // Imported old saves retain their known matches, without inventing historic detailed actions.
  if (career.player.squad==='senior') {
    for (const match of career.season.matches) aggregateMatch(career,world,match,career.season.leagueId);
    world.competitions[career.season.leagueId].round=career.season.week;
  }
  beginClubDevelopment({...career,systems:{...career.systems,world} as Career['systems']},true);
  return world;
}

/** Correct the club scale once on an editable snapshot. All NPC identities,
 * attributes and played records remain intact. Match squads use the club scale.
 */
export function repairLegacyRosterScale(career:Career):void {
  const world=career.systems?.world;
  if(!world || (world.rosterVersion??1)>=ROSTER_CALIBRATION.version)return;
  const before=new Map(Object.values(world.clubs).map(club=>[club.id,{...squadStrength(career,world,club)}]));
  world.rosterVersion=ROSTER_CALIBRATION.version;
  for(const club of Object.values(world.clubs)){
    const base=basePowers.get(club.id)!,old=before.get(club.id)!;
    const d=club.development,previousBase=d?.basePower??ROSTER_CALIBRATION.legacyPower[club.id];
    club.development={basePower:base,prestige:round(clamp(base+((d?.prestige??previousBase)-previousBase),25,99)),
      baselineYear:world.year,baselinePower:base,expectedRank:null,history:d?.history??[]};
    refreshClub(career,world,club);
    // Finances use the same corrected club scale; personal contracts stay intact.
    const factor=Math.pow((club.power+club.injuryImpact)/Math.max(25,old.power+old.injuryImpact),5);
    for(const key of ['budget','wageBudget','revenue'] as const)club[key]=Math.round(club[key]*factor);
    club.changes.push('구단 기준 전력 보정 · 성적에 따른 완만한 성장');
  }
  beginClubDevelopment(career,true);
  career.systems!.events.push({id:`roster-calibration-${ROSTER_CALIBRATION.version}`,year:career.season.year,round:career.season.week,
    type:'growth',title:'구단 기준 전력 보정',importance:'brief',
    body:'구단의 잘못된 시작 전력을 교정했습니다. 기본 전력을 보존하며 시즌 성과는 완만한 팀 성장으로 반영합니다. 선수 능력치·계약·과거 경기·순위·우승 기록은 보존됩니다.'});
}

export function getSeasonClubIds(career: Career, leagueId: string): string[] {
  return career.systems ? Object.values(career.systems.world.clubs).filter(club=>club.leagueId===leagueId).map(club=>club.id).sort()
    : CLUBS.filter(club=>club.leagueId===leagueId).map(club=>club.id).sort();
}

export function getClubWorldPower(career: Career, id: string): number {
  const world=career.systems?.world, club=world?.clubs[id];
  return world && club ? squadStrength(career,world,club).power : getClub(id).power;
}

/** Translate record-keeping NPC ratings to the club's current match scale. */
export function getClubRatingOffset(career:Career,id:string):number {
  const world=career.systems?.world,club=world?.clubs[id];
  if(!world||!club||(world.rosterVersion??1)<2)return 0;
  const npcs=club.rosterIds.filter(pid=>pid!==career.player.id).map(pid=>world.players[pid]?.ovr).filter((v):v is number=>v!==undefined).sort((a,b)=>b-a);
  return teamBase(career,world,club)-weightedPower(npcs);
}

/** One playing-ability scale for club and international comparisons. Cache only within a query. */
export function worldPlayerAbility(career:Career,player:Pick<WorldPlayer,'id'|'clubId'|'ovr'>,offsets=new Map<string,number>()):number {
  if(player.id===career.player.id)return round(playingAbility(career.player));
  let offset=offsets.get(player.clubId);
  if(offset===undefined){offset=getClubRatingOffset(career,player.clubId);offsets.set(player.clubId,offset);}
  return round(clamp(player.ovr+offset,25,99));
}

/** Persistent, healthy squad members. The match engine selects its own XI and substitutions. */
export function getWorldClubPlayers(career: Career, clubId: string): MatchParticipant[] {
  const world=career.systems?.world, club=world?.clubs[clubId];
  if (!world || !club) return (ROSTERS[clubId]??internationalRoster(clubId)).map(p=>({...p}));
  const offset=getClubRatingOffset(career,clubId);
  const ids=club.rosterIds.filter(id=>id!==career.player.id);if(clubId===career.player.clubId)ids.push(career.player.id);
  return ids.flatMap(id => {
    const player=id===career.player.id ? userWorldPlayer(career) : world.players[id];
    if (!player || player.injuryWeeks>0 || id===career.player.id && career.player.squad!=='senior') return [];
    return [{id:player.id,name:player.name,position:player.position,ovr:id===career.player.id?round(playingAbility(career.player)):round(clamp(player.ovr+offset,25,99)),nationality:currentNationality(player),clubId,
      ...(id===career.player.id ? {attributes:career.player.attributes} : {})}];
  }).sort((a,b)=>b.ovr-a.ovr || a.id.localeCompare(b.id));
}

/** Academy games use their own squad and ledger. Missing depth is explicitly fictional. */
export function getYouthClubPlayers(career: Career, clubId: string): MatchParticipant[] {
  const world=career.systems?.world, club=world?.clubs[clubId];
  const country=getClub(clubId).country;
  const players:MatchParticipant[]=club&&world?club.rosterIds.flatMap(id=>{
    const row=id===career.player.id?userWorldPlayer(career):world.players[id];
    if(!row||row.injuryWeeks>0||row.age>20||id===career.player.id&&career.player.squad!=='youth')return [];
    return [{id:row.id,name:row.name,clubId,position:row.position,ovr:row.ovr,nationality:row.nationality,
      ...(id===career.player.id?{attributes:career.player.attributes}:{})}];
  }):(ROSTERS[clubId]??[]).filter(p=>p.age<=20).map(p=>({...p,nationality:nationalityForPlayer(p.id,country)}));
  const required:Position[]=['GK','GK','CB','CB','CB','LB','RB','CDM','CDM','CM','CM','CAM','LW','RW','ST','ST','LM','RM'];
  const seen=new Map<Position,number>();
  const academyBase=clamp((club?.power??getClub(clubId).power)-16,30,78);
  for(const position of required){
    const requiredCount=(seen.get(position)??0)+1;seen.set(position,requiredCount);
    if(players.filter(p=>p.position===position).length>=requiredCount)continue;
    const id=`academy:${career.season.year}:${clubId}:${position}:${requiredCount}`;
    const random=seededRandom(`${career.seed}|${id}`);
    players.push({id,name:`${getClub(clubId).name} U19 ${position}${requiredCount} (가상)`,clubId,position,
      ovr:Math.round(clamp(academyBase-4+random()*8,25,82)),nationality:country});
  }
  return players.sort((a,b)=>b.ovr-a.ovr||a.id.localeCompare(b.id));
}

function aggregateMatch(career: Career, world: WorldState, match: MatchRecord, leagueId: string): void {
  const performers=match.performers??(match.playerPlayed?[{...career.player,clubId:match.playerClubId,stats:match.playerStats,rating:match.playerRating,minutes:match.playerMinutes,started:match.playerStarted}]:[]);
  for (const player of performers) {
    if (!player.stats.apps) continue;
    const persistent=world.players[player.id];if(persistent?.joinedYear!==undefined&&persistent.leagueDebutYear===undefined)persistent.leagueDebutYear=world.year;
    let row=world.playerStats[player.id];
    if (!row) row=world.playerStats[player.id]={playerId:player.id,name:player.name,clubId:player.clubId,leagueId,position:player.position,nationality:player.nationality??world.players[player.id]?.nationality??getClub(player.clubId).country,ovr:player.ovr,stats:emptyStats()};
    // Keep actual competition scope for comparisons; only played rows occupy the season ledger.
    for (const key of ALL_STATS) row.stats[key]=(row.stats[key]??0)+(player.stats[key]??0);
    row.stats.ratingSum=round(row.stats.ratingSum);
    if (match.momPlayerId===player.id && !player.stats.mom) row.stats.mom=(row.stats.mom??0)+1;
  }
}

function updateAvailability(career: Career, world: WorldState, clubIds: string[], roundNumber: number): void {
  for (const id of clubIds) {
    const club=world.clubs[id], rng=seededRandom(`${career.seed}|availability|${world.year}|${roundNumber}|${id}`);
    for (const playerId of club.rosterIds) {
      if (playerId===career.player.id) continue;
      const player=world.players[playerId];
      if (!player) continue;
      if (player.injuryWeeks>0) {const e=career.systems?.achievementEvidence;if(e?.year===career.season.year)e.injuredRounds[playerId]=(e.injuredRounds[playerId]??0)+1;player.injuryWeeks--;}
      else if (rng()<.0035) player.injuryWeeks=integer(rng,2,10);
    }
    refreshClub(career,world,club);
  }
}

function playWorldFixture(career: Career, world: WorldState, fixture: Fixture, leagueId: string): MatchRecord {
  const home={...getClub(fixture.homeId),leagueId,power:world.clubs[fixture.homeId].power};
  const away={...getClub(fixture.awayId),leagueId,power:world.clubs[fixture.awayId].power};
  return simulateMatch(career,fixture,{home,away,homePlayers:getWorldClubPlayers(career,home.id),awayPlayers:getWorldClubPlayers(career,away.id),userParticipates:false,detailed:false,competitionId:leagueId});
}

/** Advance all competitions from real fixtures and aggregate the returned individual performances. */
export function processWorldRound(career: Career, activeMatches: MatchRecord[]): void {
  const world=career.systems?.world;
  if (!world || world.year!==career.season.year) return;
  syncUser(career,world);
  // U19 fixtures share club identities for presentation, never senior results or awards.
  const active=career.player.squad==='senior'?world.competitions[career.season.leagueId]:undefined;
  if (active) {
    const previous=new Map(active.fixtures.map(f=>[f.id,f.played]));
    for (const match of activeMatches) if (!previous.get(match.fixtureId)) {
      aggregateMatch(career,world,match,active.leagueId);
      previous.set(match.fixtureId,true);
    }
    const oldRound=active.round;
    active.fixtures=career.season.fixtures.map(f=>({...f}));
    active.table=career.season.table.map(row=>({...row}));
    active.round=career.season.week;
    const ids=active.table.map(row=>row.clubId);
    for (let r=oldRound+1;r<=active.round;r++) updateAvailability(career,world,ids,r);
  }
  const progress=clamp(career.season.week/Math.max(1,career.season.totalWeeks),0,1);
  for (const state of Object.values(world.competitions)) {
    if (state===active) continue;
    const target=Math.floor(progress*state.totalRounds+1e-8), ids=state.table.map(row=>row.clubId);
    for (let r=state.round+1;r<=target;r++) {
      updateAvailability(career,world,ids,r);
      for (const fixture of state.fixtures) {
        if (fixture.round!==r || fixture.played) continue;
        const match=playWorldFixture(career,world,fixture,state.leagueId);
        fixture.played=true; fixture.homeGoals=match.homeGoals; fixture.awayGoals=match.awayGoals;
        aggregateMatch(career,world,match,state.leagueId);
      }
    }
    if (target>state.round) state.table=tableFor(state.fixtures,ids);
    state.round=Math.max(state.round,target);
  }
}

function movement(career: Career, world: WorldState, clubId: string, destination: string, reason: string): void {
  const club=world.clubs[clubId], from=club.leagueId;
  if (from===destination) return;
  const kind=getLeague(destination).tier<getLeague(from).tier?'promotion':'relegation';
  world.movements.push({year:world.year+1,clubId,fromLeagueId:from,toLeagueId:destination,kind,reason});
  club.leagueId=destination;
  club.changes.push(`${getLeague(from).name} → ${getLeague(destination).name}: ${reason}`);
}

function compareAcrossGroups(a: Standing,b: Standing): number {
  return b.points/Math.max(1,b.played)-a.points/Math.max(1,a.played)
    || (b.goalsFor-b.goalsAgainst)/Math.max(1,b.played)-(a.goalsFor-a.goalsAgainst)/Math.max(1,a.played)
    || a.clubId.localeCompare(b.clubId);
}

function applyMovements(career: Career, world: WorldState): void {
  if(world.pendingMovements){for(const m of world.pendingMovements)movement(career,world,m.clubId,m.toLeagueId,m.reason);delete world.pendingMovements;return;}
  for (const upper of LEAGUES) {
    const rule=getLeagueRule(upper.id);
    if (!rule.relegation || upper.id==='KR1') continue;
    const lower=LEAGUES.filter(l=>l.country===upper.country && l.tier===upper.tier+1 && getLeagueRule(l.id).automatic);
    if (!lower.length) continue;
    const upperRows=world.competitions[upper.id].table;
    const count=Math.min(rule.relegation,Math.floor(upperRows.length/2));
    const promoted: {row:Standing;leagueId:string}[]=[], vacancies=new Map<string,number>();
    const base=Math.floor(count/lower.length);
    for (const league of lower) {
      const rows=world.competitions[league.id].table.filter(row=>promotionEligible(row.clubId,upper.id));
      for (const row of rows.slice(0,base)) promoted.push({row,leagueId:league.id});
    }
    const remaining=lower.flatMap(league=>world.competitions[league.id].table.filter(row=>promotionEligible(row.clubId,upper.id)).slice(base).map(row=>({row,leagueId:league.id})))
      .sort((a,b)=>compareAcrossGroups(a.row,b.row));
    promoted.push(...remaining.slice(0,count-promoted.length));
    for (const selected of promoted) vacancies.set(selected.leagueId,(vacancies.get(selected.leagueId)??0)+1);
    const relegated=upperRows.slice(-promoted.length).reverse();
    for (const selected of promoted) movement(career,world,selected.row.clubId,upper.id,`정규 순위·조 간 비교에 따른 게임 모델 승격 (${getLeague(selected.leagueId).name})`);
    for (const row of relegated) {
      const original=getClub(row.clubId).leagueId;
      const destination=(vacancies.get(original)??0)>0?original:[...vacancies.keys()].sort().find(id=>(vacancies.get(id)??0)>0)!;
      vacancies.set(destination,(vacancies.get(destination)??0)-1);
      movement(career,world,row.clubId,destination,'정규 순위에 따른 게임 모델 강등 · 지역조 정원 유지');
    }
  }
  const k1=world.competitions.KR1?.table, k2=world.competitions.KR2?.table;
  if (k1?.length && k2?.length) {
    movement(career,world,k1[k1.length-1].clubId,'KR2','K1 최하위 직접 강등 (게임 모델)');
    movement(career,world,k2[0].clubId,'KR1','K2 정규리그 우승 직접 승격 (게임 모델)');
    for (let i=0;i<2;i++) {
      const incumbent=k1[k1.length-2-i], challenger=k2[1+i];
      if (!incumbent || !challenger) continue;
      const fixture:Fixture={id:`playoff_${world.year}_${i}_${incumbent.clubId}_${challenger.clubId}`,round:world.competitions.KR1.totalRounds+i+1,homeId:incumbent.clubId,awayId:challenger.clubId,played:false};
      const result=playWorldFixture(career,world,fixture,'KR1');
      const reason=`K1/K2 단판 모델 플레이오프 ${getClub(incumbent.clubId).name} ${result.homeGoals}:${result.awayGoals} ${getClub(challenger.clubId).name} (동점 시 K1 잔류, 실제 준PO 단순화)`;
      world.clubs[incumbent.clubId].changes.push(reason);
      world.clubs[challenger.clubId].changes.push(reason);
      if (result.awayGoals>result.homeGoals) {
        movement(career,world,incumbent.clubId,'KR2',reason); movement(career,world,challenger.clubId,'KR1',reason);
      }
    }
  }

  const edition=world.koreanLicenseEditions?.find(e=>e.year===career.season.year),review=reviewK3Promotion(career,edition);
  if(review){(world.promotionReviews??=[]).push(review);if(review.promoted){const bottom=world.competitions.KR2.table.at(-1)!.clubId;movement(career,world,review.clubId,'KR2',review.reason);movement(career,world,bottom,'KR3',review.reason);}}
}
function promotionEligible(id:string,destination:string):boolean{
 const club=getClub(id),country=club.country,reserve=/(?:\s(?:B|II)|\sU23|Futuro|Next Gen|Castilla|Atletic|Fortuna)$|^Jong /i.test(club.nativeName);
 if(!reserve)return true;const tier=getLeague(destination).tier;
 if(country==='독일'&&tier<=2)return false;
 if(['스페인','포르투갈','이탈리아','네덜란드','벨기에'].includes(country)&&tier===1)return false;
 return true;
}
/** Resolve once before the transfer window, apply membership changes only on the next season. */
export function prepareWorldMovements(c:Career):void{
 const world=c.systems?.world;if(!world||world.pendingMovements)return;
 const snapshot:WorldState={...world,clubs:Object.fromEntries(Object.entries(world.clubs).map(([id,club])=>[id,{...club,changes:[...club.changes]}])),movements:[],promotionReviews:[]};
 applyMovements(c,snapshot);world.pendingMovements=snapshot.movements;
 world.promotionReviews=[...(world.promotionReviews??[]),...(snapshot.promotionReviews??[])];
 for(const r of snapshot.promotionReviews??[])if(r.matches.length&&r.matches.some(m=>[m.homeId,m.awayId].includes(c.player.clubId))){
  const matches=r.matches.filter(m=>[m.homeId,m.awayId].includes(c.player.clubId)),entrants=[matches[0].homeId,matches[0].awayId],last=matches.at(-1)!,winner=r.promoted?r.clubId:entrants.find(id=>id!==r.clubId)!;
  const fixtures=matches.map((m,i)=>({id:m.fixtureId,round:i+1,homeId:m.homeId,awayId:m.awayId,homeGoals:m.homeGoals,awayGoals:m.awayGoals,date:m.date,played:true,step:i+1,leg:i+1,tieId:'promotion-final',stage:'결승',...(i===matches.length-1?{winnerId:winner}:{})}));
  c.systems!.clubCompetitions?.current.push({id:`PLAYOFF:KR23:${c.season.year}`,name:'K리그2·K3 승강 결정전',year:c.season.year,country:'대한민국',kind:'cup',entrants,basis:r.reason,rules:r.reason,phase:'completed',step:matches.length,leagueRounds:0,stage:'우승 확정',active:[winner],byes:[],fixtures,matches,table:entrants.map(clubId=>({clubId,played:0,won:0,drawn:0,lost:0,goalsFor:0,goalsAgainst:0,points:0})),winnerId:winner,startedAtRound:c.season.week});
 }
}

function recruitNationality(career:Career,club:ClubWorld,year:number,salt:string):string{
  const roster=ROSTERS[club.id]??[],country=getClub(club.id).country;
  const rng=seededRandom(`${career.seed}|recruit-nationality|${year}|${club.id}|${salt}`);
  const source=roster[Math.floor(rng()*roster.length)];return source?nationalityForPlayer(source.id,country):country;
}
function recruit(career: Career, world: WorldState, club: ClubWorld, position: WorldPlayer['position'], nextYear: number, serial: number): void {
  const rng=seededRandom(`${career.seed}|recruit|${nextYear}|${club.id}|${serial}`);
  const tier=getLeague(club.leagueId).tier, age=integer(rng,18,24);
  const quality=round(clamp(club.power+integer(rng,-5,2)+(club.budget>club.revenue*.25?1:0)-Math.max(0,tier-1)*.25,30,93));
  const id=`regen_${club.id}_${nextYear}_${serial}`;
  world.players[id]={id,clubId:club.id,joinedYear:nextYear,name:`유망주 ${hashSeed(id).toString(36).slice(0,4).toUpperCase()} (가상)`,position,age,ovr:quality,potential:clamp(quality+integer(rng,3,10),quality,97),injuryWeeks:0,nationality:recruitNationality(career,club,nextYear,String(serial)),leadership:integer(rng,35,72)};
  club.rosterIds.push(id);
}

/** Preserve the squad, age its members and fund replacement recruitment in the new division. */
export function transitionWorldSeason(career: Career): void {
  const world=career.systems?.world;
  if (!world || world.year!==career.season.year) return;
  const nextYear=world.year+1;
  syncUser(career,world);
  const completedLeagues=new Set(Object.values(world.competitions).filter(comp=>comp.round===comp.totalRounds&&comp.table.every(t=>t.played>0)).map(comp=>comp.leagueId));
  const observedByClub=new Map<string,typeof world.playerStats[string][]>();
  for(const row of Object.values(world.playerStats)){const rows=observedByClub.get(row.clubId)??[];rows.push(row);observedByClub.set(row.clubId,rows);}
  const earned=new Map(Object.values(world.competitions).flatMap(comp=>comp.table.map(row=>{
    const club=world.clubs[row.clubId];return [club.id,assessClubSeason(career,club,comp.table,comp.round===comp.totalRounds&&comp.table.every(t=>t.played>0),observedByClub.get(club.id)??[])] as const;
  })));
  for (const club of Object.values(world.clubs)) club.changes=[];
  applyMovements(career,world);
  for (const club of Object.values(world.clubs)) {
    const performance=earned.get(club.id)??assessClubSeason(career,club,[{clubId:club.id,played:0,won:0,drawn:0,lost:0,points:0,goalsFor:0,goalsAgainst:0}],false);
    const before=club.power, oldRevenue=club.revenue, replacements:WorldPlayer['position'][]=[];
    let grown=0,declined=0,retired=0;
    const retained:string[]=[];
    for (const id of club.rosterIds) {
      if (id===career.player.id) {retained.push(id);continue;}
      const player=world.players[id]; if (!player) continue;
      const rng=seededRandom(`${career.seed}|world-growth|${nextYear}|${id}`), prior=player.ovr;
      player.age++;
      const retirementAge=player.position==='GK'?39:35;
      if (player.age>=retirementAge && rng()<clamp((player.age-retirementAge+1)*.14,0,.95)) {
        replacements.push(player.position);delete world.players[id];retired++;continue;
      }
      const gain=player.age<=22 ? Math.min(1.5,Math.max(0,player.potential-player.ovr)*(.06+rng()*.05))
        : player.age<=26 ? Math.min(.6,Math.max(0,player.potential-player.ovr)*.035)
        : player.age>(player.position==='GK'?33:30) ? -(.25+(player.age-(player.position==='GK'?33:30))*.16)*( .85+rng()*.3) : 0;
      player.ovr=round(clamp(player.ovr+gain,25,99));
      player.injuryWeeks=Math.max(0,player.injuryWeeks-6);
      if (player.ovr-prior>.2) grown++; if (prior-player.ovr>.2) declined++;
      retained.push(id);
    }
    club.rosterIds=retained;
    refreshClub(career,world,club);
    const revenue=seasonRevenue(club);
    // Revenue adjusts gradually; promotion/relegation still changes available recruitment immediately.
    club.revenue=Math.round(oldRevenue*.35+revenue*.65+performance.bonus);
    const wages=club.wageBudget;
    club.wageBudget=Math.round(club.revenue*.52);
    club.budget=Math.round(Math.max(0,club.budget*.3+club.revenue*.22-(Math.max(0,wages-club.revenue*.65))));
    // Earned funds finance limited real squad upgrades, never a scoreboard bonus.
    if(performance.bonus>0){
      // Sustained elite play can attract income and justify funded squad building even below mid-table.
      const coreBudget=performance.star?.retained?club.revenue*.07*performance.star.influence:0;
      const available=Math.min(performance.bonus*.65+coreBudget,club.budget*.35),training=Math.round(available*.25);
      if(coreBudget>0){performance.starBudget=Math.round(Math.min(coreBudget,available));performance.revenueBasis=club.revenue;}
      const youngsters=club.rosterIds.filter(id=>id!==career.player.id).map(id=>world.players[id]).filter(p=>p&&p.age<=26&&p.ovr<p.potential).sort((a,b)=>b.ovr-a.ovr).slice(0,8);
      const gain=Math.min(.35,training/Math.max(1,club.revenue)*16);
      for(const row of youngsters){const old=row.ovr;row.ovr=round(Math.min(row.potential,row.ovr+gain));if(row.ovr>old)performance.improvedPlayers++;}
      let spent=youngsters.length?training:0;
      const starters=club.rosterIds.filter(id=>id!==career.player.id).map(id=>world.players[id]).filter(Boolean).sort((a,b)=>b.ovr-a.ovr).slice(0,10);
      const target=[...starters].sort((a,b)=>a.ovr-b.ovr)[0],fee=Math.round(Math.max(25_000,club.revenue*.035));
      if(target&&available-spent>=fee&&club.rosterIds.length<40){
        const quality=round(clamp(Math.max(target.ovr+1,club.power+Math.min(4,performance.bonus/Math.max(1,oldRevenue)*24)),25,93));
        const id=`success_${club.id}_${nextYear}`;
        world.players[id]={id,clubId:club.id,name:`${getClub(club.id).name} 보강 선수 (가상)`,position:target.position,age:23,ovr:quality,potential:Math.min(97,quality+5),injuryWeeks:0,nationality:recruitNationality(career,club,nextYear,'success'),leadership:55};
        const released=club.rosterIds.filter(x=>x!==career.player.id).map(x=>world.players[x]).filter(row=>row?.position===target.position).sort((a,b)=>a.ovr-b.ovr||b.age-a.age)[0];
        if(released){club.rosterIds=club.rosterIds.filter(x=>x!==released.id);delete world.players[released.id];}
        club.rosterIds.push(id);spent+=fee;performance.recruits=1;
      }
      club.budget=Math.max(0,Math.round(club.budget-spent));performance.reinvestment=spent;
      club.changes.push(`${performance.year}시즌 ${performance.rank}위 · 성과·핵심 선수 수입 +${compactMoney(performance.bonus)}, 선수단 재투자 ${compactMoney(spent)}`);
    }
    const rng=seededRandom(`${career.seed}|recruit-policy|${nextYear}|${club.id}`);
    if (replacements.length===0 && club.rosterIds.length>18 && rng()<.16) {
      const disposable=club.rosterIds.filter(id=>id!==career.player.id).map(id=>world.players[id]).sort((a,b)=>a.ovr-b.ovr || b.age-a.age)[0];
      if (disposable) {club.rosterIds=club.rosterIds.filter(id=>id!==disposable.id);replacements.push(disposable.position);delete world.players[disposable.id];club.changes.push(`${disposable.name} 선수단 이탈 · 대체 영입`);}
    }
    while (club.rosterIds.length+replacements.length<18) replacements.push(club.rosterIds.length%3===0?'CB':'CM');
    replacements.forEach((position,index)=>recruit(career,world,club,position,nextYear,index));
    if (replacements.length) {club.changes.push(`은퇴 ${retired}명 · 영입 ${replacements.length}명 (이적 예산·새 리그 수준 반영)`);club.budget=Math.round(club.budget*.65);}
    if (grown || declined) club.changes.push(`기존 선수 성장 ${grown}명 · 노화 하락 ${declined}명`);
    refreshClub(career,world,club);
    club.development??={basePower:before,prestige:before,baselineYear:world.year,baselinePower:before,expectedRank:null,history:[]};
    club.development.prestige=performance.prestigeAfter;
    // Funded recruitment/development changes the anchored team scale gradually.
    // This is bounded and depreciates; inflated replacement NPC ratings cannot bypass it.
    const previousInvestment=club.development.investmentPower??0;
    const base=club.development.basePower,ceiling=Math.max(6,Math.min(22,92-base));
    const room=clamp((94-club.power)/20,.12,1);
    const investment=completedLeagues.has(performance.leagueId)?Math.min(1.4,performance.reinvestment/Math.max(1,oldRevenue)*22/Math.pow(getLeague(performance.leagueId).tier,1.25))*room:0;
    // Existing investment is retained across updates. High-level squads face smaller marginal gains.
    club.development.investmentPower=round(clamp(previousInvestment*.98+investment,0,Math.max(previousInvestment,ceiling)),3);
    refreshClub(career,world,club);
    performance.afterPower=club.power;
    if(completedLeagues.has(performance.leagueId))club.development.history=[...club.development.history.filter(r=>r.year!==performance.year),performance].slice(-5);
    club.changes.push(`팀 전력 ${before.toFixed(1)} → ${club.power.toFixed(1)}, 연간 수입 ${(club.revenue/1_000_000).toFixed(1)}백만`);
    if (club.injuryImpact>.2) club.changes.push(`잔여 부상으로 전력 ${club.injuryImpact.toFixed(1)} 감소`);
  }
  syncUser(career,world);
  world.year=nextYear;
  for(const club of Object.values(world.clubs))refreshClub(career,world,club);
  world.playerStats={};
  world.competitions={};
  for (const league of LEAGUES) {
    const ids=Object.values(world.clubs).filter(club=>club.leagueId===league.id).map(club=>club.id);
    world.competitions[league.id]=competition(league.id,ids,nextYear);
  }
  beginClubDevelopment(career);
}
