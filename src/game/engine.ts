import {copySystems} from './snapshot';
import {trackMonthlyLeague} from './extra-honours';
import {moneyText} from './currency';
import {syncManualInjury,recordManualAbsences} from './manual-injury';
import {initializeClubCompetitions,processClubCompetitions,europeanEntries,cupStats} from './club-competitions';
import { CLUBS, getClub, getLeague } from './data';
import { ATTRIBUTE_LABELS, FIELD_ATTRIBUTES, GK_ATTRIBUTES, PLAY_STYLES, POSITION_ATTRIBUTES, POSITION_LABELS, overall as calculateOverall } from './attributes';
import { addStats, clamp, emptyStats, hashSeed, integer, round, seededRandom, sumStats } from './math';
import { simulateMatch } from './match-engine';
import { getClubWorldPower, getSeasonClubIds, getWorldClubPlayers, getYouthClubPlayers, processWorldRound, prepareWorldMovements, transitionWorldSeason } from './world';
import { getLeagueRule } from './league-rules';
import { archiveNationalSeason, getNationalTotals, processDueNationalWindows } from './national';
import { applyContract, evaluateAwards, makeContractOffers, payBonus, paySalary, updateLeadership, updateMarketValue, ensureEconomicHistory, beginEconomicSeason, answerCaptainOffer, expireCaptainOffers } from './career-systems';
import { initializeSystems } from './systems';
import { fixtureDate, nextCalendarYear, seasonDate, seasonHalfEndDate } from './calendar';
import { captureSeasonDetails } from './season-details';
import { applyMatchExperience, beginGrowthSeason, ensureGrowthTracking, trainRound,increaseAttribute,applyManualAging } from './growth';
import { TALENT_PROFILES } from './talent';
import type { AttributeKey, Attributes, Career, CreateOptions, Fixture, Intensity, MatchRecord, Player, PlayerStats, SeasonState, SeasonSummary, Standing, Talent, TransferOffer } from './types';
import type { PresentationEvent } from './revision-types';

export const ENGINE_VERSION = '2.7.1';
export const overall = calculateOverall;
export { addStats, emptyStats, hashSeed, seededRandom } from './math';
const TALENT_ORDER: Talent[] = ['D','C','B','A','S','SS','SSS'];

function editable(career:Career,light=false):Career {
  // One isolated snapshot per command. Rounds mutate this snapshot, never an earlier save.
  const next:Career = {
    ...career, player:{...career.player,attributes:{...career.player.attributes},secondaryPositions:[...career.player.secondaryPositions]},
    season:{...career.season,fixtures:career.season.fixtures.map(f=>({...f})),table:career.season.table.map(row=>({...row})),matches:[...career.season.matches],playerStats:{...career.season.playerStats},attributeStart:{...career.season.attributeStart}},
    history:[...career.history],news:[...career.news],training:[...career.training],transfers:[...career.transfers],offers:career.offers.map(o=>({...o})),awards:[...career.awards],processedCommands:[...career.processedCommands],
    systems:career.systems?copySystems(career.systems,light):undefined,
  };
  initializeSystems(next);
  ensureEconomicHistory(next);
  ensureGrowthTracking(next);
  initializeClubCompetitions(next);
  if(!next.systems!.trainingPlan)next.systems!.trainingPlan={forYear:next.season.year+(next.stage==='offseason'?1:0),confirmed:true,confirmedAtRound:next.season.week,source:'legacy'};
  // Old midseason contract prompts are retired on the first command, after their original hash was checked.
  if(next.stage==='season'){next.systems!.pendingChoice=undefined;next.offers=[];}
  return next;
}
function currentDate(c:Career):string{const date=seasonDate(c.season);return c.systems?.manualClock&&c.systems.manualClock>date?c.systems.manualClock:date;}
function touch(career:Career) {
  career.revision++;
  career.updatedAt=currentDate(career);
  career.news=career.news.slice(0,80);
  if(career.systems)career.systems.events=career.systems.events.slice(-180);
}
function news(career:Career,kind:Career['news'][number]['kind'],title:string,body:string) {
  career.news.unshift({id:`news_${career.season.year}_${career.season.week}_${career.revision}_${career.news.length}`,year:career.season.year,week:career.season.week,kind,title,body});
}
function present(career:Career,type:PresentationEvent['type'],title:string,body:string,importance:PresentationEvent['importance']='brief') {
  career.systems!.events.push({id:`event_${career.season.year}_${career.season.week}_${type}_${career.revision}_${career.systems!.events.length}`,year:career.season.year,round:career.season.week,type,title,body,importance});
}
function salary(ovr:number,power:number) {return Math.max(100,Math.round((150+Math.pow(Math.max(0,ovr-30),3)*.3)*clamp(power/76,.45,1.5)/10)*10);}

export function makeFixtures(clubIds:string[],year:number):Fixture[] {
  if(clubIds.length<2)throw new Error('시즌을 진행할 구단이 부족합니다.');
  const ring:(string|null)[]=[...clubIds].sort();if(ring.length%2)ring.push(null);
  const fixtures:Fixture[]=[],rounds=ring.length-1;
  for(let r=0;r<rounds;r++) {
    for(let i=0;i<ring.length/2;i++) {
      const a=ring[i],b=ring[ring.length-1-i];if(a===null||b===null)continue;
      const homeId=(r+i)%2?b:a,awayId=(r+i)%2?a:b;
      fixtures.push({id:`fixture_${year}_${r+1}_${homeId}_${awayId}`,round:r+1,homeId,awayId,played:false});
      fixtures.push({id:`fixture_${year}_${r+1+rounds}_${awayId}_${homeId}`,round:r+1+rounds,homeId:awayId,awayId:homeId,played:false});
    }
    ring.splice(1,0,ring.pop()!);
  }
  return fixtures.sort((a,b)=>a.round-b.round||a.id.localeCompare(b.id));
}
export function calculateTable(fixtures:Fixture[],clubIds:string[]):Standing[] {
  const table=new Map(clubIds.map(clubId=>[clubId,{clubId,played:0,won:0,drawn:0,lost:0,goalsFor:0,goalsAgainst:0,points:0}]));
  for(const f of fixtures) {
    if(!f.played)continue;
    const h=table.get(f.homeId),a=table.get(f.awayId);if(!h||!a)throw new Error('리그 참가 구단과 경기 일정이 일치하지 않습니다.');
    h.played++;a.played++;h.goalsFor+=f.homeGoals!;h.goalsAgainst+=f.awayGoals!;a.goalsFor+=f.awayGoals!;a.goalsAgainst+=f.homeGoals!;
    if(f.homeGoals!>f.awayGoals!){h.won++;h.points+=3;a.lost++;}else if(f.awayGoals!>f.homeGoals!){a.won++;a.points+=3;h.lost++;}else{h.drawn++;a.drawn++;h.points++;a.points++;}
  }
  return [...table.values()].sort((a,b)=>b.points-a.points||(b.goalsFor-b.goalsAgainst)-(a.goalsFor-a.goalsAgainst)||b.goalsFor-a.goalsFor||a.clubId.localeCompare(b.clubId));
}
function makeSeason(player:Player,year:number,index:number,career?:Career):SeasonState {
  const leagueId=career?.systems?.world.clubs[player.clubId]?.leagueId??getClub(player.clubId).leagueId;
  const league=getLeague(leagueId);
  const teams=career?.systems?getSeasonClubIds(career,leagueId):CLUBS.filter(c=>c.leagueId===leagueId).map(c=>c.id);
  const competition=career?.systems?.world.competitions[leagueId];
  const fixtures=competition&&career?.systems?.world.year===year?competition.fixtures.map(f=>({...f})):makeFixtures(teams,year);
  return {year,index,week:0,totalWeeks:Math.max(...fixtures.map(f=>f.round)),leagueId,competitionName:league.name+(player.squad==='youth'?' · U19 시뮬레이션':''),fixtures,table:calculateTable(fixtures,teams),matches:[],playerStats:emptyStats(),ovrStart:player.ovr,attributeStart:{...player.attributes},completed:false};
}
function validateOptions(options: CreateOptions) {
  if(!options.name.trim()||options.name.trim().length>30) throw new Error('선수 이름은 1~30자로 입력해 주세요.');
  if(!options.nationality.trim()||options.nationality.length>60) throw new Error('국적을 선택해 주세요.');
  if(!Number.isInteger(options.age)||options.age<14||options.age>35) throw new Error('시작 나이는 14~35세입니다.');
  if(!Number.isFinite(options.height)||options.height<150||options.height>210) throw new Error('키는 150~210cm입니다.');
  if(!Number.isFinite(options.weight)||options.weight<45||options.weight>120) throw new Error('몸무게는 45~120kg입니다.');
  if(!(options.position in POSITION_LABELS)) throw new Error('올바른 포지션을 선택해 주세요.');
  if(!TALENT_ORDER.includes(options.talent)) throw new Error('올바른 재능 등급을 선택해 주세요.');
  if(!['right','left','both'].includes(options.foot)) throw new Error('주발을 선택해 주세요.');
  if(!['realistic','challenge','free'].includes(options.difficulty)) throw new Error('난이도를 선택해 주세요.');
  if(!['youth','senior'].includes(options.squad)) throw new Error('소속 단계를 선택해 주세요.');
  if(options.squad==='youth'&&options.age>21) throw new Error('22세 이상 선수는 1군으로 시작해 주세요.');
  if(!PLAY_STYLES[options.position].includes(options.style)) throw new Error('포지션에 맞는 플레이스타일을 선택해 주세요.');
  const secondary=options.secondaryPositions??[];
  if(secondary.length>2||new Set(secondary).size!==secondary.length||secondary.includes(options.position)||secondary.some(p=>!(p in POSITION_LABELS))) throw new Error('부 포지션은 주 포지션과 다른 최대 2개까지 선택할 수 있습니다.');
  if(typeof options.seed!=='string'||!options.seed.length||options.seed.length>200) throw new Error('커리어 시드가 올바르지 않습니다.');
  getClub(options.clubId);
  validateTraining(options.position,options.training??POSITION_ATTRIBUTES[options.position].slice(0,3),options.intensity??'balanced');
}
export function previewPlayer(options:CreateOptions):Player {
  validateOptions(options);
  const rng=seededRandom(options.seed+'|creation'), club=getClub(options.clubId);
  const ageBase=options.age<=22?41+(options.age-14)*2.5:61-Math.max(0,options.age-29)*.8;
  const base=ageBase+TALENT_ORDER.indexOf(options.talent)*1.1+(options.difficulty==='free'?10:options.difficulty==='challenge'?-3:0)+integer(rng,-3,3);
  const attributes: Attributes={};
  const keys=options.position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES;
  for(const key of keys) attributes[key]=clamp(Math.round(base+integer(rng,-7,7)+(POSITION_ATTRIBUTES[options.position].slice(0,3).includes(key)?4:0)),25,90);
  const player: Player={id:'player_'+hashSeed(options.seed+'|'+options.name).toString(36),name:options.name.trim(),nationality:options.nationality,age:options.age,height:options.height,weight:options.weight,foot:options.foot,position:options.position,secondaryPositions:[...(options.secondaryPositions??[])],talent:options.talent,style:options.style,attributes,clubId:club.id,squad:options.squad,fitness:100,morale:72,form:65,injuryWeeks:0,ovr:0,potential:0,wage:0,contractYears:3};
  player.ovr=overall(player);
  const [low,high]=TALENT_PROFILES[player.talent].potential;
  player.potential=Math.max(player.ovr+2,integer(rng,low,high)); player.potential=Math.min(100,player.potential);
  player.wage=salary(player.ovr,club.power);
  return player;
}
export function createCareer(options:CreateOptions):Career {
  const player=previewPlayer(options),club=getClub(options.clubId);
  const career: Career={schemaVersion:1,id:'career_'+hashSeed(options.seed+'|career|'+options.name).toString(36),seed:options.seed,revision:0,createdAt:'2026-07-01T00:00:00.000Z',updatedAt:'2026-07-01T00:00:00.000Z',player,season:makeSeason(player,2026,1),history:[],news:[],training:[...(options.training??POSITION_ATTRIBUTES[player.position].slice(0,3))],intensity:options.intensity??'balanced',transfers:[],offers:[],stage:'season',managerTrust:55,careerIncome:0,awards:[],difficulty:options.difficulty,processedCommands:[]};
  initializeSystems(career,false);
  initializeClubCompetitions(career);
  beginGrowthSeason(career);
  career.systems!.trainingPlan={forYear:career.season.year,confirmed:true,confirmedAtRound:0,source:'creation'};
  career.systems!.trainingLocked=true;
  const startDate=new Date(Date.UTC(2026,getLeagueRule(career.season.leagueId).startMonth-1,1)).toISOString();career.createdAt=startDate;career.updatedAt=startDate;
  news(career,'career',`${player.name}, ${club.name}에 합류`,`${POSITION_LABELS[player.position]} · ${player.squad==='youth'?'유소년':'1군'} 커리어가 시작됩니다. 훈련과 경기에서 당신의 자리를 만들어 보세요.`);
  return career;
}

function growthReport(career:Career,half:'first'|'season') {
  const systems=career.systems!;
  if(systems.growthReports.some(r=>r.year===career.season.year&&r.half===half))return;
  const initial=systems.firstHalfSnapshot;
  const prior=career.history.at(-1)?.stats??emptyStats();
  systems.growthReports.push({year:career.season.year,half,fromRound:0,toRound:career.season.week,startAttributes:{...career.season.attributeStart},endAttributes:{...career.player.attributes},ovrStart:career.season.ovrStart,ovrEnd:career.player.ovr,stats:{...career.season.playerStats},previousStats:{...prior},valueStart:systems.growthReports.find(r=>r.year===career.season.year&&r.half==='first')?.valueStart??initial?.value??systems.economics.previousValue,valueEnd:systems.economics.marketValue,growth:structuredClone(ensureGrowthTracking(career)),...(systems.agingReport?.year===career.season.year?{offseasonAging:structuredClone(systems.agingReport)}:{}),context:`${career.season.competitionName} · ${career.season.playerStats.minutes}분 출전 · 집중 훈련 ${career.training.map(k=>ATTRIBUTE_LABELS[k]).join(', ')} · 부상은 훈련량과 출전 기회를 줄입니다. 나이에 따른 자동 능력치 감소는 없으며 수동 노화만 따로 기록합니다. 기록 변화에는 상대·출전 시간·팀 전력이 함께 작용합니다.`});
  present(career,'growth',half==='first'?'전반기 성장 리포트':'시즌 성장 리포트',`종합 ${career.season.ovrStart} → ${career.player.ovr} · ${career.season.playerStats.minutes}분 출전`,'milestone');
}
function processInternationalThrough(career:Career,throughDate:string) {
  const national=career.systems!.national;
  const before=new Set([...national.history.flatMap(h=>h.matches),...national.matches].map(m=>m.id));
  processDueNationalWindows(career,throughDate);
  const seen=new Set<string>();
  for(const match of [...national.history.flatMap(h=>h.matches),...national.matches]){
    if(seen.has(match.id)||before.has(match.id))continue;seen.add(match.id);
    if(match.seasonYear===career.season.year)applyMatchExperience(career,match.playerStats);
  }
}
function halfway(career:Career) {
  const systems=career.systems!;
  processInternationalThrough(career,seasonHalfEndDate(career.season,'first'));
  updateLeadership(career,'club',true);updateLeadership(career,'national',true);
  updateMarketValue(career,'전반기 경기력·성장·대표팀 활약');
  growthReport(career,'first');
  systems.firstHalfSnapshot={attributes:{...career.player.attributes},stats:{...career.season.playerStats},ovr:career.player.ovr,value:systems.economics.marketValue,round:career.season.week};
  systems.phase='midseason';
  career.offers=[];systems.pendingChoice=undefined;
}
function archive(career:Career,completed:boolean) {
  if(career.history.some(row=>row.year===career.season.year))return;
  const {player,season}=career;
  const awards=completed?evaluateAwards(career):[];
  const changes:Attributes={};
  for(const key of Object.keys(player.attributes) as AttributeKey[])changes[key]=round((player.attributes[key]??0)-(season.attributeStart[key]??0));
  const priorIncome=career.history.reduce((s,h)=>s+h.income,0);
  const summary:SeasonSummary={year:season.year,...(season.calendarYear?{calendarYear:season.calendarYear}:{}),clubId:season.matches[0]?.playerClubId??player.clubId,clubName:getClub(season.matches[0]?.playerClubId??player.clubId).name,leagueId:season.leagueId,competitionName:season.competitionName,age:player.age,position:player.position,squad:player.squad,rank:season.table.findIndex(r=>r.clubId===(season.matches[0]?.playerClubId??player.clubId))+1,ovrStart:season.ovrStart,ovrEnd:player.ovr,stats:{...season.playerStats},awards:[...new Map([...awards,...career.awards.filter(a=>a.year===season.year)].map(a=>[a.id,a])).values()],matches:[...season.matches],attributeGrowth:changes,income:round(Math.max(0,career.careerIncome-priorIncome)),completed,details:captureSeasonDetails(career)};
  career.history.push(summary);
  for(const award of awards){news(career,'award',award.name,award.description);present(career,'award',award.name,award.description,'milestone');}
}
export function generateOffers(career:Career):TransferOffer[] {
  if(career.systems)return makeContractOffers(career,'offseason');
  const next=editable(career);return makeContractOffers(next,'offseason');
}
function finishSeason(career:Career) {
  prepareWorldMovements(career);
  career.season.completed=true;career.stage='offseason';
  const systems=career.systems!;
  processInternationalThrough(career,seasonHalfEndDate(career.season,'second'));
  updateLeadership(career,'club');updateLeadership(career,'national',true);
  updateMarketValue(career,'시즌 종료 평가');
  growthReport(career,'season');
  archiveNationalSeason(career);
  archive(career,true);
  career.player.contractYears=Math.max(0,systems.economics.contract.expiresYear-(career.season.year+1));
  career.offers=generateOffers(career);career.transferDecision=undefined;
  systems.phase='review';systems.pendingChoice=undefined;
  systems.trainingPlan={forYear:career.season.year+1,confirmed:false,confirmedAtRound:career.season.week,source:'offseason'};
  news(career,'career','시즌 종료 · 이적시장',`${career.season.competitionName} ${career.season.table.findIndex(r=>r.clubId===career.player.clubId)+1}위. 구단의 실제 경기 성적과 재정을 반영한 계약을 검토하세요.`);
}
function applyEffects(career:Career,match:MatchRecord) {
  const effect=match.effects;if(!effect)return;
  career.player.fitness=effect.fitnessAfter;career.player.morale=effect.moraleAfter;career.player.form=effect.formAfter;
  career.player.injuryWeeks=effect.injuryWeeksAfter;career.managerTrust=effect.trustAfter;
}
function playRound(next:Career) {
  const systems=next.systems!;
  next.season.week++;systems.trainingLocked=true;
  systems.phase=next.season.week<=systems.halfRound?'first':'second';
  syncManualInjury(next,seasonDate(next.season,next.season.week-1));
  const wasInjured=next.player.injuryWeeks>0;
  trainRound(next);
  if(next.season.week%4===0)news(next,'training','훈련 리포트',`선택 훈련과 경기 경험을 나누어 기록합니다. 종합 ${next.player.ovr}.`);
  const cupGames=processClubCompetitions(next,match=>{applyEffects(next,match);applyMatchExperience(next,match.playerStats);next.lastMatchId=match.id;},date=>processInternationalThrough(next,date));
  processInternationalThrough(next,fixtureDate(next.season,next.season.week));
  const lastCup=cupGames.at(-1);if(lastCup?.date)next.player.fitness=clamp(next.player.fitness+Math.min(18,Math.max(0,(Date.parse(fixtureDate(next.season,next.season.week))-Date.parse(lastCup.date))/86400000)*5),0,100);
  const results:MatchRecord[]=[];
  for(const fixture of next.season.fixtures.filter(f=>f.round===next.season.week&&!f.played)) {
    const isUser=fixture.homeId===next.player.clubId||fixture.awayId===next.player.clubId;
    const date=fixtureDate(next.season,next.season.week);
    syncManualInjury(next,date);
    const youth=next.player.squad==='youth';
    const homePlayers=(youth?getYouthClubPlayers:getWorldClubPlayers)(next,fixture.homeId);
    const awayPlayers=(youth?getYouthClubPlayers:getWorldClubPlayers)(next,fixture.awayId);
    const power=(id:string,players:typeof homePlayers)=>youth?players.slice(0,11).reduce((n,p)=>n+p.ovr,0)/Math.max(1,Math.min(11,players.length)):getClubWorldPower(next,id);
    const match=simulateMatch(next,fixture,{home:{...getClub(fixture.homeId),name:getClub(fixture.homeId).name+(youth?' U19':''),power:power(fixture.homeId,homePlayers)},away:{...getClub(fixture.awayId),name:getClub(fixture.awayId).name+(youth?' U19':''),power:power(fixture.awayId,awayPlayers)},homePlayers,awayPlayers,scope:'club',competitionId:next.season.leagueId,date,userParticipates:isUser,detailed:isUser});
    results.push(match);fixture.homeGoals=match.homeGoals;fixture.awayGoals=match.awayGoals;fixture.played=true;
    if(isUser) {
      applyEffects(next,match);applyMatchExperience(next,match.playerStats);next.season.matches.push(match);addStats(next.season.playerStats,match.playerStats);next.lastMatchId=match.id;
      const won=match.playerClubId===match.homeId?match.homeGoals>match.awayGoals:match.awayGoals>match.homeGoals;
      if(match.playerPlayed&&won)payBonus(next,Math.round(next.player.wage*.1));
      if(match.momPlayerId===next.player.id)payBonus(next,Math.round(next.player.wage*.15));
      if(match.momPlayerId===next.player.id)present(next,'mom','경기 최우수 선수',`${next.player.name} · 평점 ${match.playerRating.toFixed(1)} · 양 팀 실제 경기력 비교`);
      if(match.events.some(e=>e.type==='injury'&&e.playerId===next.player.id))present(next,'injury',`${next.player.injuryWeeks}주 부상`,`${next.player.name}의 출전과 훈련량에 반영됩니다.`);
    }
  }
  next.season.table=calculateTable(next.season.fixtures,next.season.table.map(r=>r.clubId));
  trackMonthlyLeague(next,results);
  processWorldRound(next,results);
  updateLeadership(next,'club');
  syncManualInjury(next,fixtureDate(next.season,next.season.week));
  if(wasInjured)next.player.injuryWeeks=Math.max(0,next.player.injuryWeeks-1);
  paySalary(next,52/next.season.totalWeeks);
  if(next.season.week===systems.halfRound)halfway(next);
  if(next.season.week>=next.season.totalWeeks)finishSeason(next);
  recordManualAbsences(next);
  touch(next);
}
export function advanceCareer(career:Career,weeks=1):Career {
  if(career.stage!=='season')return career;
  if(!Number.isInteger(weeks)||weeks<1||weeks>156)throw new Error('진행할 기간은 1~156주입니다.');
  const next=editable(career);
  for(let i=0;i<weeks&&next.stage==='season';i++) {
    playRound(next);
  }
  return next;
}
export function advanceHalf(career:Career):Career {
  if(career.stage!=='season')return career;
  const half=career.systems?.halfRound??Math.ceil(career.season.totalWeeks/2);
  const target=career.season.week<half?half:career.season.totalWeeks;
  return advanceCareer(career,Math.max(1,target-career.season.week));
}
function validateTraining(position:Player['position'],keys:AttributeKey[],intensity:Intensity) {
  if(!['balanced','intense','rest'].includes(intensity))throw new Error('올바른 훈련 강도를 선택해 주세요.');
  const allowed=position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES;
  if(!Array.isArray(keys)||keys.length<1||keys.length>3||new Set(keys).size!==keys.length||keys.some(key=>!allowed.includes(key)))throw new Error('서로 다른 유효 능력치 1~3개를 선택해 주세요.');
}
export function setTraining(career:Career,keys:AttributeKey[],intensity:Intensity):Career {
  if(career.stage==='retired')throw new Error('은퇴한 선수는 훈련할 수 없습니다.');
  if(career.stage!=='offseason')throw new Error('시즌 중에는 훈련 계획을 바꿀 수 없습니다. 다음 오프시즌에 설정해 주세요.');
  validateTraining(career.player.position,keys,intensity);
  const next=editable(career,true),plan=next.systems!.trainingPlan;
  if(plan?.forYear===career.season.year+1&&plan.confirmed&&plan.source!=='legacy')throw new Error('다음 시즌 훈련 계획은 이미 확정했습니다.');
  next.training=[...keys];next.intensity=intensity;
  next.systems!.trainingPlan={forYear:career.season.year+1,confirmed:true,confirmedAtRound:career.season.week,source:'offseason'};
  next.systems!.trainingLocked=true;
  present(next,'growth','다음 시즌 훈련 확정',`${keys.length}개 능력치에 집중합니다. 시즌 중에는 이 계획을 유지합니다.`);
  touch(next);return next;
}
export function manuallyAge(career:Career,amount:1|5|10,key:AttributeKey):Career{
 if(career.stage==='retired'||![1,5,10].includes(amount))throw new Error('현역 선수에게 -1/-5/-10 중 하나를 적용해 주세요.');
 if(career.player.attributes[key]===undefined)throw new Error('감소할 능력치를 선택해 주세요.');
 if(career.systems?.attributeLocks?.includes(key))throw new Error('고정한 능력치는 수동 노화를 적용할 수 없습니다.');
 const next=editable(career,true),before={...next.player.attributes},ovrBefore=next.player.ovr;
 applyManualAging(next,amount,key);
 (next.systems!.manualAging??=[]).push({playerId:next.player.id,playerName:next.player.name,id:`manual-aging:${next.id}:${next.revision}`,year:next.season.year,round:next.season.week,date:currentDate(next),amount,key,before,after:{...next.player.attributes},ovrBefore,ovrAfter:next.player.ovr});
 updateMarketValue(next,'사용자 수동 노화');touch(next);return next;
}
export function configureCheats(career:Career,enabled:boolean,freezeAging:boolean):Career{
  if(typeof enabled!=='boolean'||typeof freezeAging!=='boolean')throw new Error('치트 설정이 올바르지 않습니다.');
  const next=editable(career,true);next.systems!.cheats={enabled,freezeAging,used:next.systems!.cheats?.used??false};touch(next);return next;
}
export function cheatIncreaseAttribute(career:Career,key:AttributeKey,amount:number):Career{
  if(!career.systems?.cheats?.enabled)throw new Error('설정에서 치트 모드를 켜 주세요.');
  if(career.stage==='retired')throw new Error('은퇴한 선수의 능력치는 변경할 수 없습니다.');
  const allowed=career.player.position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES;
  if(!allowed.includes(key)||![1,5,10].includes(amount))throw new Error('능력치와 증가량을 확인해 주세요.');
  const next=editable(career,true);increaseAttribute(next,key,amount);next.systems!.cheats!.used=true;updateMarketValue(next,'능력치 직접 조정');touch(next);return next;
}
export function acceptTransfer(career:Career,offerId:string):Career {
  if(career.stage==='retired')throw new Error('은퇴한 선수는 계약을 체결할 수 없습니다.');
  if(career.stage!=='offseason')throw new Error('이적과 재계약은 시즌 종료 후에만 결정할 수 있습니다.');
  if(career.stage==='offseason'&&career.transferDecision)throw new Error('이번 이적시장의 선택은 이미 확정되었습니다.');
  const offer=career.offers.find(o=>o.id===offerId);
  if(!offer)throw new Error('유효한 계약 제안을 선택해 주세요.');
  const next=editable(career),from=next.player.clubId;
  applyContract(next,offer);
  if(next.stage==='offseason')next.transferDecision='signed';
  next.systems!.pendingChoice=undefined;next.offers=[];
  present(next,offer.type==='renew'?'renewal':'transfer',offer.type==='renew'?'재계약 체결':`${getClub(offer.clubId).name} 이적`,`${offer.years}년 · 주급 ${moneyText(offer.wage)} · 구단 간 이적료 ${moneyText(offer.fee)}`,'milestone');
  if(from!==next.player.clubId){expireCaptainOffers(next,'club');updateMarketValue(next,'새 구단의 리그와 출전 역할');}
  touch(next);return next;
}
export function respondToCaptainOffer(career:Career,offerId:string,accept:boolean):Career {
  if(career.stage==='retired')throw new Error('은퇴한 선수는 주장 제의에 응답할 수 없습니다.');
  if(typeof offerId!=='string'||!offerId||typeof accept!=='boolean')throw new Error('유효한 주장 제의를 선택해 주세요.');
  const next=editable(career);answerCaptainOffer(next,offerId,accept);touch(next);return next;
}
export function dismissChoice(career:Career):Career {
  if(!career.systems?.pendingChoice)return career;
  const next=editable(career);next.systems!.pendingChoice=undefined;next.offers=[];
  present(next,'renewal','현재 계약 유지','이번 제안을 넘겼습니다. 현재 주급과 계약은 그대로 이어집니다.');touch(next);return next;
}
export function stayAtClub(career:Career):Career {
  if(career.stage==='season'&&career.systems?.pendingChoice)return dismissChoice(career);
  if(career.stage!=='offseason')throw new Error('시즌 종료 후 잔류를 결정할 수 있습니다.');
  if(career.transferDecision)return career;
  if(career.player.contractYears<=0) {
    const renewal=career.offers.find(o=>o.type==='renew'&&o.clubId===career.player.clubId);
    if(!renewal)throw new Error('계약이 만료되었습니다. 새 계약을 선택해 주세요.');
    return acceptTransfer(career,renewal.id);
  }
  const next=editable(career);next.transferDecision='stay';next.offers=[];
  present(next,'transfer','소속 팀 잔류',`${getClub(next.player.clubId).name}에서 현재 계약을 이어갑니다.`);touch(next);return next;
}
export function startNextSeason(career:Career):Career {
  if(career.stage!=='offseason')throw new Error('현재 시즌을 먼저 마무리해 주세요.');
  if(career.systems?.trainingPlan&&!career.systems.trainingPlan.confirmed)throw new Error('다음 시즌 훈련 계획을 먼저 확정해 주세요.');
  const decided=career.transferDecision?career:stayAtClub(career),next=editable(decided);
  const previousSeason=next.season,lastYear=next.season.year,previousOvr=next.player.ovr;
  const entries=europeanEntries(next);
  transitionWorldSeason(next);
  for(const h of next.history){const report=next.systems!.world.clubs[h.clubId]?.development?.history.find(r=>r.year===h.year);if(h.details&&report){const i=next.history.indexOf(h);next.history[i]={...h,details:{...h.details,clubDevelopment:structuredClone(report)}};}}
  if(next.systems?.cheats?.enabled&&next.systems.cheats.freezeAging)next.systems.cheats.used=true;
  else {next.player.age++;}
  const promoted=next.player.squad==='youth'&&(next.player.age>=20||(next.player.age>=17&&next.player.ovr>=getClubWorldPower(next,next.player.clubId)-18));
  if(promoted)next.player.squad='senior';
  next.player.fitness=100;next.player.morale=clamp(next.player.morale+10,0,100);if(!next.systems?.manualInjuries?.some(r=>!r.returned))next.player.injuryWeeks=0;
  next.season=makeSeason(next.player,lastYear+1,next.season.index+1,next);
  const calendarYear=nextCalendarYear(previousSeason,next.season.leagueId);
  if(calendarYear!==next.season.year)next.season.calendarYear=calendarYear;
  next.stage='season';next.offers=[];next.transferDecision=undefined;next.lastMatchId=undefined;
  expireCaptainOffers(next);
  const systems=next.systems!;
  systems.national.formatVersion=2;
  delete systems.monthlyLeague;
  systems.phase='preseason';systems.halfRound=Math.ceil(next.season.totalWeeks/2);systems.trainingLocked=true;systems.pendingChoice=undefined;
  delete systems.agingReport;
  systems.trainingPlan={forYear:next.season.year,confirmed:true,confirmedAtRound:0,source:systems.trainingPlan?.source??'legacy'};
  initializeClubCompetitions(next,entries,decided);
  beginGrowthSeason(next);
  systems.firstHalfSnapshot={attributes:{...next.player.attributes},stats:emptyStats(),ovr:next.player.ovr,value:systems.economics.marketValue,round:0};
  updateMarketValue(next,'새 시즌 소속 리그·전력·연령 변화');beginEconomicSeason(next);updateLeadership(next,'club',true);
  for(const move of systems.world.movements.filter(m=>m.year===next.season.year&&m.clubId===next.player.clubId))present(next,'promotion',move.kind==='promotion'?'상위 리그 승격':'하위 리그 강등',`${getLeague(move.fromLeagueId).name} → ${getLeague(move.toLeagueId).name}. 새 상대·일정·수입·영입 예산을 반영했습니다.`,'milestone');
  if(promoted)present(next,'growth','1군 승격','유소년 단계를 마치고 1군 출전 경쟁을 시작합니다.','milestone');
  syncManualInjury(next,seasonDate(next.season,0));
  touch(next);
  const injury=next.systems?.manualInjuries?.find(r=>!r.returned);
  if(injury)skipInjuryPeriod(next,injury.end);
  return next;
}
export function retireCareer(career:Career):Career {
  if(career.stage==='retired')return career;
  if(career.stage==='offseason'&&career.transfers.some(t=>t.year>career.season.year))throw new Error('새 구단과의 계약이 확정됐습니다. 다음 시즌을 시작한 뒤 은퇴해 주세요.');
  const next=editable(career);
  if(next.season.week>0&&!next.history.some(s=>s.year===next.season.year))archive(next,false);
  archiveNationalSeason(next);
  next.stage='retired';next.retiredYear=next.season.year;next.offers=[];
  next.systems!.phase='retired';next.systems!.pendingChoice=undefined;next.systems!.national.status='retired';
  expireCaptainOffers(next);
  for(const term of next.systems!.leadership.terms)if(term.endYear===undefined){term.endYear=next.season.year;term.endRound=next.season.week;}
  const total=getCareerTotals(next);
  present(next,'retirement',`${next.player.name}의 마지막 휘슬`,`${total.apps}경기 · ${total.minutes}분 · ${total.goals}골 · ${total.assists}도움. 모든 시즌과 대표팀 기록을 보관했습니다.`,'milestone');
  news(next,'career',`${next.player.name}, 현역 은퇴`,`${getCareerTotals(next).apps}경기. 은퇴 전후 같은 경기 원장과 통산 기록을 유지합니다.`);
  touch(next);return next;
}
export function getCareerTotals(career:Career,scope:'club'|'national'|'all'='all'):PlayerStats {
  const club=sumStats([cupStats(career),...career.history.map(s=>s.stats),...(!career.history.some(s=>s.year===career.season.year)?[career.season.playerStats]:[])]);
  if(scope==='club')return club;
  const national=getNationalTotals(career);
  return scope==='national'?national:sumStats([club,national]);
}

export function setAttributeLock(career:Career,key:AttributeKey,locked:boolean):Career{
 if(career.stage==='retired'||career.player.attributes[key]===undefined||typeof locked!=='boolean')throw new Error('능력치 고정 설정을 확인해 주세요.');
 const next=editable(career,true),locks=new Set(next.systems!.attributeLocks??[]);
 if(locked)locks.add(key);else locks.delete(key);next.systems!.attributeLocks=[...locks];touch(next);return next;
}
export function manuallyInjure(career:Career,duration:'half'|'season'):Career{
 if(career.stage!=='season'||!['half','season'].includes(duration))throw new Error('진행 중인 시즌에서 부상 기간을 선택해 주세요.');
 if(career.systems?.manualInjuries?.some(r=>!r.returned))throw new Error('현재 수동 부상이 끝난 뒤 다시 적용해 주세요.');
 const next=editable(career),start=new Date(Date.parse(currentDate(next))+1).toISOString(),end=new Date(Date.parse(start)+(duration==='half'?182:365)*86400000).toISOString();
 (next.systems!.manualInjuries??=[]).push({id:`manual-injury:${next.id}:${next.revision}`,year:next.season.year,clubId:next.player.clubId,duration,start,end,missed:[]});
 present(next,'injury',`${duration==='half'?'반 시즌':'한 시즌'} 부상`,`${start.slice(0,10)} ~ ${end.slice(0,10)}. 부상 중 팀 경기는 정상 진행하며 시즌 종료 시 계약·훈련을 결정한 뒤 남은 기간을 이어갑니다.`,'milestone');
 syncManualInjury(next,start);
 skipInjuryPeriod(next,end);touch(next);return next;
}

function skipInjuryPeriod(c:Career,end:string):void{
 while(c.stage==='season'&&fixtureDate(c.season,c.season.week+1)<end)playRound(c);
 if(c.stage==='season'&&end<=seasonHalfEndDate(c.season,'second')){
  processClubCompetitions(c,m=>{applyEffects(c,m);applyMatchExperience(c,m.playerStats);c.lastMatchId=m.id;},date=>processInternationalThrough(c,date),end);
  processInternationalThrough(c,end);syncManualInjury(c,end);c.systems!.manualClock=end;
 }
 recordManualAbsences(c);
}
