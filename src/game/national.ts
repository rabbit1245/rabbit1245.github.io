import { CLUBS, ROSTERS, getClub, getLeague } from './data';
import { getLeagueRule } from './league-rules';
import { fixtureDate, seasonDate } from './calendar';
import { simulateMatch } from './match-engine';
import { addStats, clamp, emptyStats, seededRandom, sumStats } from './math';
import { nationalityForPlayer, normalizeNationality } from './national-data';
import type { MatchParticipant, NationalSeason, NationalState } from './revision-types';
import type { Career, Club, Fixture, MatchRecord, PlayerStats, Position, RosterPlayer } from './types';

/** Competition names/cycles are real; the reduced three-team qualification and four-team
 * finals are a game model, not a claim to reproduce every federation's actual regulations. */
export const NATIONAL_MODEL_NOTE = '국대는 실제 대회 주기를 바탕으로 한 축약 모형입니다. 내 예선은 3팀 조 상위 2팀이며, 본선 상대도 실제 모의 예선을 통과해야 합니다. 참가국 수에 따라 4강·결승 또는 결승을 치르고 본선은 중립 구장입니다. 승점·득실·득점까지 동률이면 추첨하며, 실제 국가별 예선 방식·개최 일정과 다를 수 있습니다. 선수 국적은 보관된 FC25 자료를 사용하고 부족한 명단은 (가상) 선수로 보완합니다.';

type Squad = NationalState['squad'];
type Stage = 'qualifying' | 'friendly' | 'semifinal' | 'final';
type Shootout = { home: number; away: number; winnerId: string; attempts: { teamId: string; playerId: string; scored: boolean }[] };
type NationalMatch = MatchRecord & { shootout?: Shootout };
type State = NationalState & { teamResults?: MatchRecord[]; timingVersion?: 1; processedThrough?: string };
type Competition = { id: string; name: string; year: number; countries: string[] };
type Candidate = MatchParticipant & { age: number; score: number; injured: boolean };

const continents: Record<string, string[]> = {
  AFC: ['대한민국','일본','중국','호주','이란','카타르','사우디아라비아','우즈베키스탄','이라크','아랍에미리트','인도','인도네시아','베트남','태국','필리핀','싱가포르','말레이시아'],
  UEFA: ['잉글랜드','이탈리아','프랑스','스페인','독일','포르투갈','벨기에','네덜란드','튀르키예','스코틀랜드','덴마크','스위스','폴란드','노르웨이','크로아티아','오스트리아','세르비아','체코','스웨덴','아일랜드','웨일스','북아일랜드','우크라이나','루마니아','슬로바키아','슬로베니아','헝가리','그리스','핀란드','아이슬란드'],
  CONMEBOL: ['브라질','아르헨티나','우루과이','콜롬비아','칠레','에콰도르','페루','파라과이','베네수엘라','볼리비아'],
  CONCACAF: ['미국','멕시코','캐나다','코스타리카','자메이카','파나마'],
  CAF: ['모로코','세네갈','나이지리아','가나','이집트','카메룬','남아프리카공화국','알제리','튀니지','말리','코트디부아르','잠비아','콩고민주공화국','앙골라'],
  OFC: ['뉴질랜드','피지','뉴칼레도니아','바누아투'],
};
const confederation = (country: string) => Object.keys(continents).find(key => continents[key].includes(country)) ?? 'UEFA';
const allCountries = [...new Set(Object.values(continents).flat())];
const countryPower: Record<string, number> = { '아르헨티나':86,'브라질':85,'프랑스':86,'잉글랜드':85,'스페인':85,'독일':83,'포르투갈':84,'이탈리아':82,'네덜란드':82,'벨기에':81,'우루과이':80,'크로아티아':79,'대한민국':73,'일본':76,'중국':61,'미국':76,'멕시코':76,'모로코':78,'이란':73,'호주':72,'뉴질랜드':64 };
const clubsById = new Map(CLUBS.map(club => [club.id, club]));
const retainedRosterIds = new Set(Object.values(ROSTERS).flat().map(player=>player.id));
const rosterByCountry = new Map<string, RosterPlayer[]>();
for (const club of CLUBS) for (const player of ROSTERS[club.id] ?? []) {
  const country = nationalityForPlayer(player.id, club.country);
  const pool = rosterByCountry.get(country) ?? [];
  pool.push(player); rosterByCountry.set(country, pool);
}
const group = (position: Position) => position === 'GK' ? 'GK' : ['CB','LB','RB','LWB','RWB'].includes(position) ? 'DEF' : ['CDM','CM','CAM','LM','RM'].includes(position) ? 'MID' : 'ATT';
const quotas = { GK: 3, DEF: 8, MID: 7, ATT: 5 };
const firstEleven: Position[] = ['GK','LB','CB','CB','RB','CDM','CM','CAM','LW','RW','ST'];
const squadFor = (career: Career): Squad => career.player.age <= 20 ? 'U20' : 'senior';
const teamId = (country: string, squad: Squad) => `NAT:${country}:${squad}`;
const nationalMatchSquad = (match: MatchRecord): Squad => match.homeId.endsWith(':U20') ? 'U20' : 'senior';

export function getTeamLabel(id: string): string {
  if (id.startsWith('NAT:')) {
    const [country, squad] = id.slice(4).split(':');
    return `${country}${squad === 'U20' ? ' U20' : ' 대표팀'}`;
  }
  return clubsById.get(id)?.name ?? id;
}

function nextCycle(year: number, base: number, interval: number): number {
  return year <= base ? base : base + Math.ceil((year - base) / interval) * interval;
}
function competitionFor(country: string, squad: Squad, year: number, month: number): Competition {
  const earliest = year + (month > 6 ? 1 : 0);
  if (squad === 'U20') {
    const finalYear = nextCycle(earliest, 2027, 2);
    return { id: `U20WC:${finalYear}`, name: `${finalYear} FIFA U-20 월드컵`, year: finalYear, countries: allCountries };
  }
  const federation = confederation(country);
  const wc = nextCycle(earliest, 2026, 4);
  const continentalBase = federation === 'AFC' || federation === 'CAF' ? 2027 : 2028;
  const continental = nextCycle(earliest, continentalBase, federation === 'CONCACAF' ? 2 : 4);
  if (wc <= continental) return { id: `WC:${wc}`, name: `${wc} FIFA 월드컵`, year: wc, countries: allCountries };
  const names: Record<string,string> = { AFC: 'AFC 아시안컵', UEFA: 'UEFA 유로', CONMEBOL: '코파 아메리카', CONCACAF: 'CONCACAF 골드컵', CAF: '아프리카 네이션스컵', OFC: 'OFC 네이션스컵' };
  return { id: `${federation}:${continental}`, name: `${continental} ${names[federation]}`, year: continental, countries: continents[federation] };
}
function competitionName(id: string): string {
  const [kind, year] = id.split(':');
  const names: Record<string,string> = { WC:'FIFA 월드컵',U20WC:'FIFA U-20 월드컵',AFC:'AFC 아시안컵',UEFA:'UEFA 유로',CONMEBOL:'코파 아메리카',CONCACAF:'CONCACAF 골드컵',CAF:'아프리카 네이션스컵',OFC:'OFC 네이션스컵',FRIENDLIES:'국제친선' };
  return `${year} ${names[kind] ?? kind}`;
}
function windowDate(career: Career, half: 'first'|'second') {
  const startMonth = getLeagueRule(career.season.leagueId).startMonth;
  const calendar = startMonth === 1;
  return { year: (career.season.calendarYear??career.season.year) + (!calendar && half === 'second' ? 1 : 0), month: (calendar ? half === 'first' : half === 'second') ? 6 : 11 };
}

function leagueLevel(career: Career, clubId: string): number {
  const club = clubsById.get(clubId);
  if (!club) return 0;
  const leagueId = career.systems?.world.clubs[clubId]?.leagueId ?? club.leagueId;
  const league = getLeague(leagueId);
  const top = ['영국','스페인','독일','이탈리아','프랑스'].includes(league.country) ? 4 : ['네덜란드','포르투갈','벨기에','브라질','아르헨티나'].includes(league.country) ? 2 : 0;
  return top - Math.max(0, league.tier - 1) * 2;
}
function scoreCandidate(career: Career, id: string, ovr: number, clubId: string, user: boolean): number {
  const stats = user ? career.season.playerStats : career.systems?.world.playerStats[id]?.stats;
  const minutes = stats?.minutes ?? 0;
  const rating = stats && stats.ratingCount > 0 ? stats.ratingSum / stats.ratingCount : 6.5;
  const minutesRate = Math.min(1, minutes / Math.max(450, career.season.week * 90));
  return ovr * .86 + minutesRate * 5 + (rating - 6.5) * 3 + leagueLevel(career, clubId) + (user ? (career.player.form - 60) * .045 : 0);
}
function poolFor(career: Career, country: string, squad: Squad): Candidate[] {
  const world = career.systems?.world;
  const hasPersistentPlayers = !!world && Object.keys(world.players).length>0;
  const pool: Candidate[] = [];
  for (const row of rosterByCountry.get(country) ?? []) {
    const persistent = world?.players[row.id];
    if(hasPersistentPlayers&&!persistent)continue; // Retired world players must not reappear.
    const age = persistent?.age ?? row.age + Math.max(0,career.season.index-1);
    if (squad === 'U20' && age > 20) continue;
    if (squad === 'senior' && age > 40) continue;
    const clubId = persistent?.clubId ?? row.clubId;
    const ovr = persistent?.ovr ?? row.ovr;
    pool.push({id:row.id,name:row.name,position:row.position,ovr,age,clubId,nationality:country,injured:(persistent?.injuryWeeks ?? 0)>0,score:scoreCandidate(career,row.id,ovr,clubId,false)});
  }
  // Academy arrivals added by the persistent world are eligible too; the static index
  // remains the source for retained players, including those who move abroad.
  for (const row of Object.values(world?.players ?? {})) {
    if(retainedRosterIds.has(row.id)||row.id===career.player.id||normalizeNationality(row.nationality)!==country)continue;
    if((squad==='U20'&&row.age>20)||(squad==='senior'&&row.age>40))continue;
    pool.push({id:row.id,name:row.name,position:row.position,ovr:row.ovr,age:row.age,clubId:row.clubId,nationality:country,injured:row.injuryWeeks>0,score:scoreCandidate(career,row.id,row.ovr,row.clubId,false)});
  }
  if (normalizeNationality(career.player.nationality) === country && squadFor(career) === squad) {
    const p = career.player;
    pool.push({id:p.id,name:p.name,position:p.position,ovr:p.ovr,attributes:p.attributes,age:p.age,clubId:p.clubId,nationality:country,injured:p.injuryWeeks>0,score:scoreCandidate(career,p.id,p.ovr,p.clubId,true)});
  }
  // A country with no retained eligible goalkeeper/position must still field a legal XI.
  // Only missing position-group depth is generated, and every such name is explicitly virtual.
  const baseline = (countryPower[country] ?? 68) - (squad === 'U20' ? 12 : 0);
  const necessary = { GK: 2, DEF: 5, MID: 4, ATT: 3 };
  const template: Record<keyof typeof necessary, Position[]> = { GK:['GK'],DEF:['LB','CB','CB','RB','CB'],MID:['CDM','CM','CAM','CM'],ATT:['LW','RW','ST'] };
  for (const key of Object.keys(necessary) as (keyof typeof necessary)[]) {
    const missing = necessary[key] - pool.filter(player=>group(player.position)===key && !player.injured).length;
    for (let i=0;i<missing;i++) {
      const rng = seededRandom(`${career.seed}|national-fill|${country}|${squad}|${key}|${i}`);
      const ovr = Math.round(clamp(baseline - 5 + rng()*8, 35, 80));
      pool.push({id:`national_virtual_${country}_${squad}_${key}_${i}`,name:`${country} ${key}${i+1} (가상)`,position:template[key][i%template[key].length],ovr,age:squad==='U20'?19:25,clubId:teamId(country,squad),nationality:country,injured:false,score:ovr*.86});
    }
  }
  return pool.sort((a,b)=>b.score-a.score || a.id.localeCompare(b.id));
}
function rosterFor(career: Career, country: string, squad: Squad): Candidate[] {
  const pool = poolFor(career,country,squad).filter(player=>!player.injured);
  const roster: Candidate[] = [];
  for (const key of Object.keys(quotas) as (keyof typeof quotas)[]) roster.push(...pool.filter(player=>group(player.position)===key).slice(0,quotas[key]));
  // Stable lineup order supplies a balanced XI even when squad positional labels differ.
  const available = [...roster];
  const ordered: Candidate[] = [];
  for (const position of firstEleven) {
    const index = available.findIndex(p=>p.position===position);
    const groupIndex = index>=0 ? index : available.findIndex(p=>group(p.position)===group(position));
    if (groupIndex>=0) ordered.push(...available.splice(groupIndex,1));
  }
  return [...ordered,...available];
}
function selection(career: Career, state: NationalState): Candidate[] {
  const roster = rosterFor(career,state.country,state.squad);
  const p = career.player;
  const competitors = poolFor(career,state.country,state.squad).filter(row=>group(row.position)===group(p.position)&&!row.injured);
  const rank = Math.max(1, competitors.findIndex(row=>row.id===p.id)+1);
  const threshold = quotas[group(p.position)];
  if (career.stage==='retired') {state.status='retired';state.reason='국가대표 경력을 마쳤습니다.';}
  else if (p.injuryWeeks>0) {state.status='injured';state.reason=`부상 회복 중 · 남은 회복 ${p.injuryWeeks}주. 다음 소집에서 출전 상황을 다시 평가합니다.`;}
  else if (roster.some(row=>row.id===p.id)) {state.status='called';state.reason=`${state.country} ${state.squad==='U20'?'U20':'성인'} 대표 발탁 · 같은 포지션군 ${rank}위. 능력치·소속 리그 수준·출전시간·평점·컨디션을 종합했습니다.`;}
  else {state.status=rank<=threshold+3?'watchlist':'unselected';state.reason=`${state.status==='watchlist'?'관찰 명단':'미발탁'} · 같은 포지션군 ${competitors.length}명 중 ${rank}위, 소집 ${threshold}자리. 소속팀 출전시간·평점·능력치·컨디션이 경쟁 기준입니다.`;}
  return roster;
}

export function createNational(career: Career): NationalState {
  const country = normalizeNationality(career.player.nationality);
  const date = windowDate(career,'first');
  const competition = competitionFor(country,squadFor(career),date.year,date.month);
  const state: State = {country,squad:squadFor(career),status:'unselected',reason:'다음 대표팀 소집에서 경기력과 포지션 경쟁을 평가합니다.',competitionId:competition.id,competitionName:competition.name,phase:'qualifying',points:0,rank:0,qualified:false,fatigue:0,reputation:0,matches:[],history:[],processedWindows:[],teamResults:[],timingVersion:1,processedThrough:lastKnownClubDate(career)};
  selection(career,state);
  if(state.status==='called'){state.status='watchlist';state.reason='대표팀 관찰 명단 · 실제 소집 날짜에 출전과 포지션 경쟁을 다시 평가합니다.';}
  return state;
}
function ownMatches(state: NationalState): MatchRecord[] {
  const unique = new Map<string,MatchRecord>();
  for (const row of [...state.history.flatMap(season=>season.matches),...state.matches]) unique.set(row.fixtureId,row);
  return [...unique.values()];
}
function drawCountries(career: Career, competition: Competition, label: string): string[] {
  return competition.countries.filter(country=>country!==career.systems!.national.country)
    .map(country=>({country,draw:seededRandom(`${career.seed}|national-draw|${competition.id}|${label}|${country}`)()}))
    .sort((a,b)=>a.draw-b.draw).map(row=>row.country);
}
export function nationalRosterPower(career:Career,country:string,squad:Squad):number {
 const roster=rosterFor(career,country,squad).slice(0,11);return roster.reduce((sum,p)=>sum+p.ovr,0)/Math.max(1,roster.length);
}
/** Other finalists also earn qualification. Strong squads are seeded into the
 * compact model's representative groups; no unplayed country is awarded a title. */
function finalistGroupWinners(matches:MatchRecord[]):string[]{
 const winners:string[]=[];
 for(let g=0;g<3;g++){
  const games=matches.filter(m=>m.fixtureId.includes(`|qualifying|finalist-group:${g}:`));if(games.length!==3)continue;
  const rows=new Map<string,{country:string;points:number;gd:number;gf:number;played:number}>();
  const row=(id:string)=>{const country=id.slice(4).split(':')[0];if(!rows.has(country))rows.set(country,{country,points:0,gd:0,gf:0,played:0});return rows.get(country)!;};
  for(const m of games){const a=row(m.homeId),b=row(m.awayId);a.played++;b.played++;a.gf+=m.homeGoals;b.gf+=m.awayGoals;a.gd+=m.homeGoals-m.awayGoals;b.gd-=m.homeGoals-m.awayGoals;a.points+=m.homeGoals>m.awayGoals?3:m.homeGoals===m.awayGoals?1:0;b.points+=m.awayGoals>m.homeGoals?3:m.homeGoals===m.awayGoals?1:0;}
  if(rows.size===3&&[...rows.values()].every(r=>r.played===2))winners.push([...rows.values()].sort((a,b)=>b.points-a.points||b.gd-a.gd||b.gf-a.gf||a.country.localeCompare(b.country))[0].country);
 }
 return winners;
}
function qualifiedFinalists(career:Career,competition:Competition,date:string,excluded:string[]):string[]{
 const state=career.systems!.national as State;
 const known=matchLedger(state).filter(m=>m.competitionId===competition.id&&nationalMatchSquad(m)===state.squad);
 const qualifiers=known.filter(m=>m.fixtureId.includes('finalist-group:'));
 // The played draw is authoritative even when club injuries or squad strength
 // change later in the same window. Never redraw completed qualifying groups.
 if(qualifiers.length)return finalistGroupWinners(qualifiers);
 // Preserve pre-2.3 recorded semifinals without inventing earlier qualifiers.
 const ownId=teamId(state.country,state.squad),own=known.find(m=>m.fixtureId.includes('|semifinal|')&&(m.homeId===ownId||m.awayId===ownId)),other=known.find(m=>m.fixtureId.includes('|semifinal|')&&m.homeId!==ownId&&m.awayId!==ownId);
 if(own&&other)return [own.homeId===ownId?own.awayId:own.homeId,other.homeId,other.awayId].map(id=>id.slice(4).split(':')[0]);
 const countries=competition.countries.filter(country=>!excluded.includes(country)).map(country=>({country,power:nationalRosterPower(career,country,state.squad),draw:seededRandom(`${career.seed}|finals-seeding|${competition.id}|${country}`)()})).sort((a,b)=>(b.power+b.draw*5)-(a.power+a.draw*5)).slice(0,9).map(row=>row.country);
 for(let g=0;g<3;g++){
  const group=countries.slice(g*3,g*3+3);if(group.length<3)continue;
  for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)qualifiers.push(play(career,competition,group[i],group[j],'qualifying',date,`finalist-group:${g}:${i}:${j}`));
 }
 return finalistGroupWinners(qualifiers);
}
function syntheticTeam(country: string, squad: Squad, players: Candidate[]): Club {
  const starting = players.slice(0,11);
  return {id:teamId(country,squad),name:getTeamLabel(teamId(country,squad)),nativeName:country,country,leagueId:'national',power:starting.reduce((sum,p)=>sum+p.ovr,0)/Math.max(1,starting.length),color:'#426c65'};
}
function play(career: Career, competition: Competition, homeCountry: string, awayCountry: string, stage: Stage, date: string, label: string): NationalMatch {
  const state = career.systems!.national as State;
  const homePlayers = rosterFor(career,homeCountry,state.squad);
  const awayPlayers = rosterFor(career,awayCountry,state.squad);
  const fixture: Fixture = {id:`NAT|${state.squad}|${competition.id}|${stage}|${label}`,round:state.matches.length+1,homeId:teamId(homeCountry,state.squad),awayId:teamId(awayCountry,state.squad),played:false};
  const isOwn = homeCountry===state.country || awayCountry===state.country;
  const called = isOwn && state.status==='called' && career.player.injuryWeeks===0;
  const match = simulateMatch(career,fixture,{home:syntheticTeam(homeCountry,state.squad,homePlayers),away:syntheticTeam(awayCountry,state.squad,awayPlayers),homePlayers,awayPlayers,scope:'national',competitionId:competition.id,date,userParticipates:called,neutralVenue:stage==='semifinal'||stage==='final'});
  if ((stage==='semifinal'||stage==='final') && match.homeGoals===match.awayGoals) resolveNationalShootout(career,match);
  match.playerClubId = isOwn ? teamId(state.country,state.squad) : match.homeId;
  if (isOwn) {
    state.matches.push(match);
    if (match.playerPlayed) {
      if (match.effects) {career.player.fitness=match.effects.fitnessAfter;career.player.form=match.effects.formAfter;career.player.morale=match.effects.moraleAfter;career.player.injuryWeeks=match.effects.injuryWeeksAfter;}
      state.reputation = clamp(state.reputation + Math.max(-1,(match.playerRating-6)*.6) + (stage==='final' && winner(match)===teamId(state.country,state.squad)?4:0),0,100);
      // A few days separate international matches; fatigue remains visible on club return.
      career.player.fitness = clamp(career.player.fitness+4,0,100);
      state.fatigue = Math.round(100-career.player.fitness);
      if (career.player.injuryWeeks>0) {state.status='injured';state.reason=`대표팀 경기 중 부상 · 회복 ${career.player.injuryWeeks}주. 소속팀 계약은 유지됩니다.`;}
    }
  } else (state.teamResults ??= []).push(match);
  for (const performer of match.performers ?? []) {
    const competitor = career.systems!.world.playerStats[performer.id];
    if (competitor) addStats(competitor.nationalStats ??= emptyStats(),performer.stats);
  }
  return match;
}
/** Penalties are a separate result ledger: no regular-time goals, saves or appearances are added. */
export function resolveNationalShootout(career: Career, match: NationalMatch): void {
  const rng = seededRandom(`${career.seed}|${match.fixtureId}|shootout`);
  const onPitch = (id:string) => (match.performers??[]).filter(player=>{
    if((player.teamId??player.clubId)!==id || player.stats.redCards>0)return false;
    const entry=player.started?0:match.events.find(event=>event.type==='substitution'&&event.playerId===player.id&&event.detail.includes('투입'))?.minute;
    const from=entry??90-player.minutes;
    return from+player.minutes===90&&!match.events.some(event=>event.playerId===player.id&&event.type==='injury');
  });
  const home=onPitch(match.homeId),away=onPitch(match.awayId);
  if(!home.length||!away.length)throw new Error('승부차기를 치를 경기 종료 시점의 선수가 없습니다.');
  const ability=(player:typeof home[number],key:'setPieces'|'composure'|'shooting'|'gkOneOnOnes'|'gkReflexes')=>player.attributes?.[key]??player.ovr;
  const shooting=(players:typeof home)=>[...players].sort((a,b)=>{
    const score=(p:typeof a)=>ability(p,'setPieces')*.6+ability(p,'composure')*.25+ability(p,'shooting')*.15;
    return score(b)-score(a)||a.id.localeCompare(b.id);
  });
  // FIFA's reduce-to-equate rule keeps both sides' eligible pool at the same size.
  const amount=Math.min(home.length,away.length),h=shooting(home).slice(0,amount),a=shooting(away).slice(0,amount);
  const goalkeeping=(players:typeof home)=>{
    const keeper=players.find(player=>player.position==='GK')??[...players].sort((x,y)=>ability(y,'gkOneOnOnes')-ability(x,'gkOneOnOnes'))[0];
    return ability(keeper,'gkOneOnOnes')*.65+ability(keeper,'gkReflexes')*.35;
  };
  const keepers=[goalkeeping(away),goalkeeping(home)];
  const result:Shootout={home:0,away:0,winnerId:'',attempts:[]};
  for(let round=0;;round++){
    for(let side=0;side<2;side++){
      const shooters=side===0?h:a,shooter=shooters[round%shooters.length];
      const skill=ability(shooter,'setPieces')*.6+ability(shooter,'composure')*.25+ability(shooter,'shooting')*.15;
      const scored=rng()<clamp(.74+(skill-keepers[side])*.005,.5,.92);
      result.attempts.push({teamId:side===0?match.homeId:match.awayId,playerId:shooter.id,scored});
      if(scored){if(side===0)result.home++;else result.away++;}
    }
    if(round<4&&Math.abs(result.home-result.away)>4-round)break;
    if(round>=4&&result.home!==result.away)break;
  }
  result.winnerId=result.home>result.away?match.homeId:match.awayId;
  match.shootout=result;
}
function winner(match: NationalMatch): string | undefined { return match.shootout?.winnerId ?? (match.homeGoals===match.awayGoals?undefined:match.homeGoals>match.awayGoals?match.homeId:match.awayId); }
function qualifyingTable(career: Career, competition: Competition, opponents: string[]) {
  const state=career.systems!.national as State;
  const countries=[state.country,...opponents];
  const rows=new Map(countries.map(country=>[teamId(country,state.squad),{country,points:0,gd:0,gf:0,played:0}]));
  for(const match of [...ownMatches(state),...(state.teamResults??[])].filter(row=>row.competitionId===competition.id&&row.fixtureId.includes('|qualifying|')&&nationalMatchSquad(row)===state.squad)) {
    const h=rows.get(match.homeId),a=rows.get(match.awayId);if(!h||!a)continue;
    h.played++;a.played++;h.gf+=match.homeGoals;a.gf+=match.awayGoals;h.gd+=match.homeGoals-match.awayGoals;a.gd+=match.awayGoals-match.homeGoals;
    h.points+=match.homeGoals>match.awayGoals?3:match.homeGoals===match.awayGoals?1:0;
    a.points+=match.awayGoals>match.homeGoals?3:match.homeGoals===match.awayGoals?1:0;
  }
  // A deterministic lot is used only after all published sporting tie-breaks are equal.
  // It preserves two qualification places instead of letting three tied teams all advance.
  const lot=(country:string)=>seededRandom(`${career.seed}|qualification-lot|${competition.id}|${country}`)();
  const sorted=[...rows.values()].sort((a,b)=>b.points-a.points||b.gd-a.gd||b.gf-a.gf||lot(a.country)-lot(b.country));
  const self=rows.get(teamId(state.country,state.squad))!;
  const rank=sorted.indexOf(self)+1;
  return {points:self.points,rank,played:self.played,qualified:self.played>=2&&rank<=2,countries:sorted.map(row=>row.country)};
}

export interface InternationalWindow {
  id: string; date: string; endDate: string; half: 'first'|'second'; year: number; month: number;
}

/** Two model windows follow the actual calendar of the player's league season. */
export function scheduledInternationalWindows(career: Career): InternationalWindow[] {
  const squad=squadFor(career);
  return (['first','second'] as const).map(half=>{
    const {year,month}=windowDate(career,half),prefix=`${year}-${String(month).padStart(2,'0')}`;
    return {id:`window:${prefix}:${squad}`,date:`${prefix}-05`,endDate:`${prefix}-${month===6?'25':'15'}`,half,year,month};
  }).sort((a,b)=>a.date.localeCompare(b.date));
}
const timestamp=(value:string)=>new Date(value).getTime();
const iso=(value:string)=>new Date(value).toISOString();
function lastKnownClubDate(career:Career):string {
  const dated=career.season.matches.flatMap(match=>match.date&&Number.isFinite(timestamp(match.date))?[match.date]:[]).sort((a,b)=>timestamp(a)-timestamp(b));
  if(dated.length)return iso(dated[dated.length-1]);
  const played=Math.max(0,...career.season.fixtures.filter(row=>row.played).map(row=>row.round));
  return iso(played>0?fixtureDate(career.season,played):seasonDate(career.season,0));
}
function completeWindow(state:State,window:InternationalWindow):void {
  if(!state.processedWindows.includes(window.id))state.processedWindows.push(window.id);
}
function matchLedger(state:State):MatchRecord[] {
  return [...new Map([...ownMatches(state),...state.teamResults??[]].map(match=>[match.fixtureId,match])).values()];
}
function completedWindow(state:State,window:InternationalWindow):boolean {
  const prefix=`window:${window.date.slice(0,7)}:`;
  return state.processedWindows.some(key=>key.startsWith(prefix));
}
function migratedCompletedWindow(career:Career,state:State,window:InternationalWindow):boolean {
  const oldKey=`${career.season.year}:${window.half}`;
  const callupKey=`callup:${window.date.slice(0,7)}:${squadFor(career)}`;
  // Older versions calculated a complete window at a half-season boundary. Their
  // known match ledger is authoritative and is never supplemented retrospectively.
  return state.processedWindows.includes(oldKey)||(!state.processedWindows.includes(callupKey)&&matchLedger(state).some(match=>match.date?.startsWith(window.date.slice(0,7))));
}
function carryPreviousNationalSeasons(career:Career):void {
  const state=career.systems!.national;
  for(const year of new Set(state.matches.filter(match=>match.seasonYear!==career.season.year).map(match=>match.seasonYear)))archiveNationalSeason(career,year);
  state.matches=state.matches.filter(match=>match.seasonYear===career.season.year);
}
function processWindowThrough(career:Career,window:InternationalWindow,through:string):void {
  const state=career.systems!.national as State;
  if(completedWindow(state,window))return;
  if(migratedCompletedWindow(career,state,window)){completeWindow(state,window);return;}
  if(timestamp(through)<timestamp(window.date))return;
  const key=`callup:${window.date.slice(0,7)}:${squadFor(career)}`;
  if(!state.processedWindows.includes(key)) {
    state.country=normalizeNationality(career.player.nationality);state.squad=squadFor(career);
    const competition=competitionFor(state.country,state.squad,window.year,window.month);
    state.competitionId=competition.id;state.competitionName=competition.name;state.phase='qualifying';
    selection(career,state);
    state.processedWindows.push(key);
    career.systems!.events.push({id:`national:${key}`,year:career.season.year,round:career.season.week,type:'national',title:state.status==='called'?`${getTeamLabel(teamId(state.country,state.squad))} 발탁`:'국가대표 소집 평가',body:`${window.date} · ${state.reason}`,importance:'brief'});
  }
  if(career.player.injuryWeeks>0&&state.status==='called'){
    state.status='injured';state.reason=`소집 기간 중 부상 · 남은 회복 ${career.player.injuryWeeks}주. 이번 대표팀 경기에는 출전하지 않습니다.`;
  }
  const competition=competitionFor(state.country,state.squad,window.year,window.month);
  const opponents=drawCountries(career,competition,'qualifying').slice(0,2);
  const dateAt=(day:number)=>`${window.year}-${String(window.month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const find=(stage:Stage,label:string)=>matchLedger(state).find(match=>match.fixtureId===`NAT|${state.squad}|${competition.id}|${stage}|${label}`);
  const duePlay=(home:string,away:string,stage:Stage,day:number,label:string,contest=competition):NationalMatch|undefined=>{
    const id=`NAT|${state.squad}|${contest.id}|${stage}|${label}`;
    const known=matchLedger(state).find(match=>match.fixtureId===id);if(known)return known;
    if(timestamp(dateAt(day))>timestamp(through))return undefined;
    return play(career,contest,home,away,stage,dateAt(day),label);
  };
  const previous=ownMatches(state).filter(match=>match.competitionId===competition.id&&nationalMatchSquad(match)===state.squad&&match.fixtureId.includes('|qualifying|'));
  const hadQualification=previous.length>=2&&previous.every(match=>!match.date?.startsWith(window.date.slice(0,7)));
  duePlay(state.country,opponents[0],'qualifying',5,`country:${state.country}:q0`);
  duePlay(opponents[1],state.country,'qualifying',10,`country:${state.country}:q1`);
  duePlay(opponents[0],opponents[1],'qualifying',11,`group:${state.country}`);
  const table=qualifyingTable(career,competition,opponents);
  state.points=table.points;state.rank=table.rank;
  const groupComplete=!!find('qualifying',`country:${state.country}:q0`)&&!!find('qualifying',`country:${state.country}:q1`)&&!!find('qualifying',`group:${state.country}`);
  state.qualified=groupComplete&&table.qualified;
  const finalsNow=window.year===competition.year&&window.month===6;
  if(!finalsNow){
    if(hadQualification){
      state.phase='friendlies';
      const friendly:Competition={id:`FRIENDLIES:${window.year}`,name:`${window.year} 국제친선`,year:window.year,countries:allCountries};
      const guests=drawCountries(career,friendly,`friendly:${window.id}`).slice(0,2);
      for(let i=0;i<2;i++)duePlay(i===0?state.country:guests[i],i===0?guests[i]:state.country,'friendly',5+i*5,`${window.id}:country:${state.country}:f${i}`,friendly);
    }
  }else if(groupComplete){
    if(!state.qualified){state.phase='eliminated';appendResultEvent(career,competition,`예선 ${state.rank}위 · 본선 진출 실패`);}
    else {
      state.phase='finals';
      if(timestamp(through)<timestamp(dateAt(12)))return;
      let finalists=qualifiedFinalists(career,competition,dateAt(12),[state.country,...opponents]);
      if(!finalists.length)finalists=table.countries.slice(0,2).filter(country=>country!==state.country);
      const semifinal=finalists.length>=2?duePlay(state.country,finalists[0],'semifinal',18,`country:${state.country}:semi`):undefined;
      const other=finalists.length>=3?duePlay(finalists[1],finalists[2],'semifinal',18,`other:${state.country}:semi`):undefined;
      const opponent=other?(winner(other)??other.homeId).slice(4).split(':')[0]:finalists.length===1?finalists[0]:finalists[1];
      if((finalists.length===1||semifinal)&&(finalists.length<3||other)){
        if(semifinal&&winner(semifinal)!==teamId(state.country,state.squad)){
          const first=(winner(semifinal)??semifinal.homeId).slice(4).split(':')[0];
          duePlay(first,opponent,'final',25,`other:${state.country}:final`);
          state.phase='eliminated';appendResultEvent(career,competition,'4강 탈락');
        }else{
          const alreadyFinal=find('final',`country:${state.country}:final`);
          const final=duePlay(state.country,opponent,'final',25,`country:${state.country}:final`);
          if(final){
            if(winner(final)===teamId(state.country,state.squad)){
              if(!alreadyFinal)state.reputation=clamp(state.reputation+5,0,100);
              appendResultEvent(career,competition,'우승');
            }else{state.phase='eliminated';appendResultEvent(career,competition,'준우승');}
          }
        }
      }
    }
  }
  if(timestamp(through)>=timestamp(window.endDate))completeWindow(state,window);
}

/** Advance only dates that have actually arrived, before the next club fixture. */
export function processDueNationalWindows(career:Career,throughDate:string):void {
  if(!career.systems)return;
  if(!Number.isFinite(timestamp(throughDate)))throw new Error('대표팀 진행 날짜가 올바르지 않습니다.');
  const state=career.systems.national as State;
  if(career.stage==='retired'){state.status='retired';state.reason='국가대표 경력을 마쳤습니다.';return;}
  carryPreviousNationalSeasons(career);
  const through=iso(throughDate),baseline=state.processedThrough??lastKnownClubDate(career);
  state.timingVersion=1;
  if(timestamp(through)<=timestamp(baseline)){state.processedThrough=baseline;return;}
  for(const window of scheduledInternationalWindows(career)){
    if(timestamp(window.date)>timestamp(through))continue;
    if(completedWindow(state,window))continue;
    if(migratedCompletedWindow(career,state,window)){completeWindow(state,window);continue;}
    const callupKey=`callup:${window.date.slice(0,7)}:${squadFor(career)}`;
    if(timestamp(window.date)<=timestamp(baseline)&&!state.processedWindows.includes(callupKey)){
      // An old save may resume after a national window has started. No past
      // call-up, fixture or personal action is invented for that elapsed period.
      completeWindow(state,window);continue;
    }
    processWindowThrough(career,window,through);
  }
  state.processedThrough=through;
}

/** Compatibility helper for controlled experiments and older half-based callers. */
export function processNationalWindow(career: Career, half: 'first'|'second'): void {
  if(!career.systems)return;
  const state=career.systems.national as State;
  if(career.stage==='retired'){state.status='retired';state.reason='국가대표 경력을 마쳤습니다.';return;}
  carryPreviousNationalSeasons(career);
  const window=scheduledInternationalWindows(career).find(row=>row.half===half)!;
  if(completedWindow(state,window))return;
  processWindowThrough(career,window,window.endDate);
  const oldKey=`${career.season.year}:${half}`;
  if(!state.processedWindows.includes(oldKey))state.processedWindows.push(oldKey);
  state.timingVersion=1;
  if(!state.processedThrough||timestamp(window.endDate)>timestamp(state.processedThrough))state.processedThrough=iso(window.endDate);
}
function appendResultEvent(career:Career,competition:Competition,result:string){
  const id=`national-result:${competition.id}:${career.systems!.national.squad}:${result}`;
  if(career.systems!.events.some(event=>event.id===id))return;
  career.systems!.events.push({id,year:career.season.year,round:career.season.week,type:'national',title:`${competition.name} ${result}`,body:`실제 경기 결과 · ${NATIONAL_MODEL_NOTE}`,importance:result==='우승'?'milestone':'brief'});
}
function resultFor(matches:MatchRecord[],country:string,squad:Squad):string {
  const ownId=teamId(country,squad);
  const final=matches.find(match=>match.fixtureId.includes('|final|')) as NationalMatch|undefined;
  if(final)return winner(final)===ownId?'우승':'준우승';
  const semifinal=matches.find(match=>match.fixtureId.includes('|semifinal|')) as NationalMatch|undefined;
  if(semifinal)return winner(semifinal)===ownId?'결승 진출':'4강';
  return matches.every(match=>match.fixtureId.includes('|friendly|'))?'친선 경기':'예선 참가';
}
export function archiveNationalSeason(career: Career,year=career.season.year): void {
  if(!career.systems)return;
  const state=career.systems.national;
  const current=state.matches.filter(match=>match.seasonYear===year);
  const keys=[...new Set(current.map(match=>`${nationalMatchSquad(match)}|${match.competitionId??'friendlies'}`))];
  for(const key of keys){
    const [squad,id]=key.split('|') as [Squad,string];
    const matches=current.filter(match=>nationalMatchSquad(match)===squad&&match.competitionId===id);
    const existing=state.history.findIndex(row=>row.year===year&&row.squad===squad&&row.competitionId===id);
    const entry:NationalSeason={year,squad,competitionId:id,competitionName:competitionName(id),stats:sumStats(matches.map(match=>match.playerStats)),matches:structuredClone(matches),result:state.competitionId===id&&state.phase==='eliminated'&&!matches.some(match=>match.fixtureId.includes('|semifinal|'))?'예선 탈락':resultFor(matches,state.country,squad),qualified:matches.some(match=>!match.fixtureId.includes('|qualifying|'))||(state.competitionId===id&&state.qualified)};
    if(existing>=0)state.history[existing]=entry;else state.history.push(entry);
  }
}
export function getNationalTotals(career: Career, filter: {year?:number;competitionId?:string;squad?:string} = {}): PlayerStats {
  if(!career.systems)return emptyStats();
  return sumStats(ownMatches(career.systems.national).filter(match=>(filter.year===undefined||match.seasonYear===filter.year)&&(!filter.competitionId||match.competitionId===filter.competitionId)&&(!filter.squad||nationalMatchSquad(match)===filter.squad)).map(match=>match.playerStats));
}
