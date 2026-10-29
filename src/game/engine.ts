import {isFreeAgent,beginEmployment,changeEmployment} from './employment';
import {personality,PERSONALITY_KEYS,type PersonalityKey,type Personality} from './personality';
import {beginAchievementSeason} from './achievement-evidence';
import {copySystems} from './snapshot';
import {playSkillDefinitions,playSkillNames} from './play-skills';
import {removeSkillMastery} from './growth';
import {trackMonthlyLeague} from './extra-honours';
import {settleShirtMarket} from './commercial';
import {ensureEconomicMarket} from './career-systems';
import {moneyText} from './currency';
import {syncManualInjury,recordManualAbsences,activatePendingInjury} from './manual-injury';
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
import type { Award, AttributeKey, Attributes, Career, CreateOptions, Fixture, GameProgress, Intensity, MatchRecord, Player, PlayerStats, SeasonState, SeasonSummary, Standing, Talent, TransferOffer } from './types';
import type { PresentationEvent } from './revision-types';

export const ENGINE_VERSION = '2.11.4';
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
  ensureEconomicMarket(next);
  ensureGrowthTracking(next);
  initializeClubCompetitions(next);
  if(!next.systems!.trainingPlan)next.systems!.trainingPlan={forYear:next.season.year+(next.stage==='offseason'?1:0),confirmed:true,confirmedAtRound:next.season.week,source:'legacy'};
  // Old midseason contract prompts are retired on the first command, after their original hash was checked.
  if(next.stage==='season'&&!isFreeAgent(next)){next.systems!.pendingChoice=undefined;next.offers=[];}
  return next;
}
function currentDate(c:Career):string{const date=seasonDate(c.season);return c.systems?.manualClock&&c.systems.manualClock>date?c.systems.manualClock:date;}
export function setPersonality(career:Career,key:PersonalityKey,value:number):Career{
 if(!PERSONALITY_KEYS.includes(key))throw new Error('성향은 현역 중 각 1~10 범위로 조정할 수 있습니다.');
 return setPersonalityValues(career,{...personality(career),[key]:value});
}
export function setPersonalityValues(career:Career,values:Personality):Career{
 if(career.stage==='retired'||!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length!==PERSONALITY_KEYS.length||PERSONALITY_KEYS.some(key=>!Object.prototype.hasOwnProperty.call(values,key)||!Number.isInteger(values[key])||values[key]<1||values[key]>10))throw new Error('성향은 현역 중 각 1~10 범위로 조정할 수 있습니다.');
 const next=editable(career,true);next.systems!.personality={...values};touch(next);return next;
}
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
  const leagueId=career?.systems?.world.clubs[player.clubId]?.leagueId??(player.clubId==='FA'?career!.season.leagueId:getClub(player.clubId).leagueId);
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
  beginAchievementSeason(career);
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
  career.offers=isFreeAgent(career)?makeContractOffers(career,'midseason'):[];systems.pendingChoice=undefined;
}
function archive(career:Career,completed:boolean,reviewedAwards?:Award[]) {
  if(career.history.some(row=>row.year===career.season.year))return;
  settleShirtMarket(career,completed);
  const {player,season}=career;
  const awards=reviewedAwards??(completed?evaluateAwards(career):[]);
  const changes:Attributes={};
  for(const key of Object.keys(player.attributes) as AttributeKey[])changes[key]=round((player.attributes[key]??0)-(season.attributeStart[key]??0));
  const priorIncome=career.history.reduce((s,h)=>s+h.income,0);
  const summary:SeasonSummary={year:season.year,...(season.calendarYear?{calendarYear:season.calendarYear}:{}),clubId:(career.systems?.employment?.some(r=>r.year===season.year)?player.clubId:season.matches[0]?.playerClubId)??player.clubId,clubName:getClub((career.systems?.employment?.some(r=>r.year===season.year)?player.clubId:season.matches[0]?.playerClubId)??player.clubId).name,leagueId:season.leagueId,competitionName:season.competitionName,age:player.age,position:player.position,squad:player.squad,rank:season.table.findIndex(r=>r.clubId===((career.systems?.employment?.some(r=>r.year===season.year)?player.clubId:season.matches[0]?.playerClubId)??player.clubId))+1,ovrStart:season.ovrStart,ovrEnd:player.ovr,stats:{...season.playerStats},awards:[...new Map([...awards,...career.awards.filter(a=>a.year===season.year)].map(a=>[a.id,a])).values()],matches:[...season.matches],attributeGrowth:changes,income:round(Math.max(0,career.careerIncome-priorIncome)),completed,details:captureSeasonDetails(career)};
  career.history.push(summary);
  for(const award of awards){news(career,'award',award.name,award.description);present(career,'award',award.name,award.description,'milestone');}
}
export function generateOffers(career:Career):TransferOffer[] {
  if(career.systems)return makeContractOffers(career,'offseason');
  const next=editable(career);return makeContractOffers(next,'offseason');
}
export function refreshContractOffers(career:Career):Career{
 if(career.stage==='retired'||career.stage!=='offseason'&&!isFreeAgent(career)||career.transferDecision&&!isFreeAgent(career))throw new Error('현재 계약 제안을 다시 검토할 수 없습니다.');
 const next=editable(career,true);next.offers=generateOffers(next);touch(next);return next;
}
function finishSeason(career:Career) {
  prepareWorldMovements(career);
  career.season.completed=true;career.stage='offseason';
  const systems=career.systems!;
  processInternationalThrough(career,seasonHalfEndDate(career.season,'second'));
  updateLeadership(career,'club',true);updateLeadership(career,'national',true);
  syncManualInjury(career,new Date(Date.parse(seasonHalfEndDate(career.season,'second'))+86400000).toISOString());
  archiveNationalSeason(career);
  settleShirtMarket(career,true);
  const awards=evaluateAwards(career);
  updateMarketValue(career,'시즌 종료 평가 · 실제 수상과 누적 시장 위상');
  growthReport(career,'season');
  archive(career,true,awards);
  career.player.contractYears=Math.max(0,systems.economics.contract.expiresYear-(career.season.year+1));
  if(career.player.contractYears===0&&!isFreeAgent(career))releaseInPlace(career,'expiry',true);
  career.offers=generateOffers(career);career.transferDecision=isFreeAgent(career)?'stay':undefined;
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
  if(wasInjured&&!next.systems!.manualInjuries?.some(r=>r.selectionVersion===2&&!r.returned))next.player.injuryWeeks=Math.max(0,next.player.injuryWeeks-1);
  paySalary(next,52/next.season.totalWeeks);
  if(next.season.week===systems.halfRound)halfway(next);
  if(next.season.week>=next.season.totalWeeks)finishSeason(next);
  recordManualAbsences(next);syncManualInjury(next,fixtureDate(next.season,next.season.week));
  touch(next);
}
export function advanceCareer(career:Career,weeks=1,onProgress?:(p:GameProgress)=>void):Career {
  if(career.stage!=='season')return career;
  if(!Number.isInteger(weeks)||weeks<1||weeks>156)throw new Error('진행할 기간은 1~156주입니다.');
  const next=editable(career);
  for(let i=0;i<weeks&&next.stage==='season';i++) {
    playRound(next);
    onProgress?.({year:next.season.year,round:next.season.week,total:next.season.totalWeeks});
  }
  return next;
}
export function advanceHalf(career:Career,onProgress?:(p:GameProgress)=>void):Career {
  if(career.stage!=='season')return career;
  const half=career.systems?.halfRound??Math.ceil(career.season.totalWeeks/2);
  const target=career.season.week<half?half:career.season.totalWeeks;
  return advanceCareer(career,Math.max(1,target-career.season.week),onProgress);
}
function validateTraining(position:Player['position'],keys:AttributeKey[],intensity:Intensity) {
  if(!['balanced','intense','rest'].includes(intensity))throw new Error('올바른 훈련 강도를 선택해 주세요.');
  const allowed=position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES;
  if(!Array.isArray(keys)||keys.length>3||new Set(keys).size!==keys.length||keys.some(key=>!allowed.includes(key)))throw new Error('서로 다른 유효 능력치를 최대 3개까지 선택해 주세요. 선택 없이 진행할 수도 있습니다.');
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
  present(next,'growth','다음 시즌 훈련 확정',keys.length?`${keys.length}개 능력치만 성장합니다. 시즌 중에는 이 계획을 유지합니다.`:'훈련 선택 없이 시작합니다. 이번 시즌 능력치는 자동 성장하지 않습니다.');
  touch(next);return next;
}
export function manuallyAge(career:Career,amount:1|5|10,key:AttributeKey):Career{
 if(career.stage==='retired'||![1,5,10].includes(amount))throw new Error('현역 선수에게 -1/-5/-10 중 하나를 적용해 주세요.');
 if(career.player.attributes[key]===undefined)throw new Error('감소할 능력치를 선택해 주세요.');
 const next=editable(career,true),before={...next.player.attributes},ovrBefore=next.player.ovr;
 applyManualAging(next,amount,key);
 (next.systems!.manualAging??=[]).push({playerId:next.player.id,playerName:next.player.name,id:`manual-aging:${next.id}:${next.revision}`,year:next.season.year,round:next.season.week,date:currentDate(next),amount,key,before,after:{...next.player.attributes},ovrBefore,ovrAfter:next.player.ovr});
 updateMarketValue(next,'사용자 수동 노화');touch(next);return next;
}
export function configureCheats(career:Career,enabled:boolean,freezeAging:boolean):Career{
  if(typeof enabled!=='boolean'||typeof freezeAging!=='boolean')throw new Error('치트 설정이 올바르지 않습니다.');
  const next=editable(career,true);next.systems!.cheats={enabled,freezeAging,used:next.systems!.cheats?.used??false};touch(next);return next;
}
export function setPlaySkill(career:Career,key:AttributeKey,selected:boolean):Career{
 if(career.stage==='retired')throw new Error('은퇴한 선수의 플레이스킬은 변경할 수 없습니다.');
 if(typeof selected!=='boolean'||!playSkillDefinitions(career.player.position).some(s=>s.key===key))throw new Error('포지션에 맞는 플레이스킬을 선택해 주세요.');
 const prior=career.player.playSkills??[];
 if(prior.length>5)throw new Error('기존 스킬 선택이 5개를 초과합니다. 원본 백업을 보존하고 선택을 복구해 주세요.');
 if(prior.includes(key)===selected){const next=editable(career,true);touch(next);return next;}
 if(selected&&prior.length>=5)throw new Error('플레이스킬은 최대 5개까지 선택할 수 있습니다.');
 const next=editable(career,true),before=next.player.attributes[key]??0;
 next.player.playSkills=selected?[...prior,key]:prior.filter(k=>k!==key);
 if(!selected)removeSkillMastery(next,key);
 const year=next.season.year+(next.stage==='offseason'?1:0);
 next.systems!.playSkillChanges=[...(next.systems!.playSkillChanges??[]),{year,round:next.season.week,key,selected,before,after:next.player.attributes[key]??0,position:next.player.position}];
 next.player.ovr=overall(next.player);
 present(next,'growth',selected?'플레이스킬 선택':'플레이스킬 삭제',`${playSkillNames(next.player.position,[key])[0]} · ${selected?'성장 상한 110 해제 · 현재 능력 유지':'선택 해제 · 이전 숙련 기록 보존'}`);
 if(!selected&&before>100)updateMarketValue(next,'플레이스킬 초과 숙련 종료');
 touch(next);return next;
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
  if(career.stage!=='offseason'&&!isFreeAgent(career))throw new Error('소속 선수의 이적과 재계약은 시즌 종료 후에만 결정할 수 있습니다.');
  if(career.stage==='offseason'&&career.transferDecision&&!isFreeAgent(career))throw new Error('이번 이적시장의 선택은 이미 확정되었습니다.');
  const offer=career.offers.find(o=>o.id===offerId);
  if(!offer)throw new Error('유효한 계약 제안을 선택해 주세요.');
  const next=editable(career),from=next.player.clubId;
  const wasFree=isFreeAgent(next);
  applyContract(next,offer);
  if(wasFree&&next.stage==='season')adoptDestinationSchedule(next);
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
    return releaseContract(career);
  }
  const next=editable(career);next.transferDecision='stay';next.offers=[];
  present(next,'transfer','소속 팀 잔류',`${getClub(next.player.clubId).name}에서 현재 계약을 이어갑니다.`);touch(next);return next;
}
export function startNextSeason(career:Career,onProgress?:(p:GameProgress)=>void):Career {
  if(career.stage!=='offseason')throw new Error('현재 시즌을 먼저 마무리해 주세요.');
  const decided=career.transferDecision?career:stayAtClub(career),next=editable(decided);
  // An unconfirmed plan is optional: do not silently carry last season's selection forward.
  const trainingPlan=career.systems?.trainingPlan;
  if(trainingPlan?.forYear!==career.season.year+1||!trainingPlan.confirmed||trainingPlan.source!=='offseason')next.training=[];
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
  if(next.systems!.employment)beginEmployment(next);
  const calendarYear=nextCalendarYear(previousSeason,next.season.leagueId);
  if(calendarYear!==next.season.year)next.season.calendarYear=calendarYear;
  activatePendingInjury(next);
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
  beginAchievementSeason(next);
  systems.firstHalfSnapshot={attributes:{...next.player.attributes},stats:emptyStats(),ovr:next.player.ovr,value:systems.economics.marketValue,round:0};
  updateMarketValue(next,'새 시즌 소속 리그·전력·연령 변화');beginEconomicSeason(next);updateLeadership(next,'club',true);
  for(const move of systems.world.movements.filter(m=>m.year===next.season.year&&m.clubId===next.player.clubId))present(next,'promotion',move.kind==='promotion'?'상위 리그 승격':'하위 리그 강등',`${getLeague(move.fromLeagueId).name} → ${getLeague(move.toLeagueId).name}. 새 상대·일정·수입·영입 예산을 반영했습니다.`,'milestone');
  if(promoted)present(next,'growth','1군 승격','유소년 단계를 마치고 1군 출전 경쟁을 시작합니다.','milestone');
  syncManualInjury(next,seasonDate(next.season,0));
  touch(next);
  const injury=next.systems?.manualInjuries?.find(r=>!r.returned);
  if(injury&&injury.selectionVersion!==2)skipInjuryPeriod(next,injury.end,onProgress);
  if(isFreeAgent(next))next.offers=makeContractOffers(next,'midseason');
  return next;
}
export function retireCareer(career:Career):Career {
  if(career.stage==='retired')return career;
  if(career.stage==='offseason'&&!isFreeAgent(career)&&career.transfers.some(t=>t.year>career.season.year))throw new Error('새 구단과의 계약이 확정됐습니다. 다음 시즌을 시작한 뒤 은퇴해 주세요.');
  const next=editable(career);
  if((next.season.week>0||isFreeAgent(next))&&!next.history.some(s=>s.year===next.season.year))archive(next,false);
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
export function setAllAttributeLocks(career:Career,locked:boolean):Career{
 if(career.stage==='retired'||typeof locked!=='boolean')throw new Error('전체 능력치 고정 설정을 확인해 주세요.');
 const next=editable(career,true),allowed=next.player.position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES;
 next.systems!.attributeLocks=locked?allowed.filter(key=>next.player.attributes[key]!==undefined):[];
 touch(next);return next;
}
export function manuallyInjure(career:Career,duration:'half'|'season'|5|10|20,onProgress?:(p:GameProgress)=>void):Career{
 if(career.stage==='retired'||!['half','season',5,10,20].includes(duration))throw new Error('현역 선수의 부상 기간을 선택해 주세요.');
 if(career.systems?.manualInjuries?.some(r=>!r.returned))throw new Error('현재 수동 부상이 끝난 뒤 다시 적용해 주세요.');
 if(duration!=='half'){
  const half=career.systems!.halfRound;
  if(career.stage==='season'&&career.season.week!==0&&career.season.week!==half)throw new Error('전반기·후반기 시작 전에 부상을 선택해 주세요.');
  const next=editable(career),pending=next.stage==='offseason';
  const year=next.season.year+Number(pending),base=pending?Date.UTC(nextCalendarYear(next.season,next.season.leagueId),getLeagueRule(next.season.leagueId).startMonth-1,1):Date.parse(currentDate(next))+1;
  const start=new Date(base).toISOString(),end=pending?new Date(base+365*86400000).toISOString():new Date(Date.parse(seasonHalfEndDate(next.season,'second'))+86400000).toISOString();
  (next.systems!.manualInjuries??=[]).push({id:`manual-injury:${next.id}:${next.revision}`,year,clubId:next.player.clubId,duration,selectionVersion:2,start,end,...(typeof duration==='number'?{remainingMatches:duration,targetMatches:duration}:{}),...(pending?{pendingNextSeason:true}:{}),missed:[]});
  if(!pending)next.player.injuryWeeks=1;
  present(next,'injury',pending?'다음 시즌 부상 예약':'부상 기간 선택',duration==='season'?'이번 시즌 남은 전 경기 결장':`클럽 ${duration}경기 결장 · 해당 기간 국대도 출전 제외`,'milestone');touch(next);return next;
 }

 const next=editable(career),pending=career.stage==='offseason',league=getClub(next.player.clubId).leagueId;
 const start=pending?new Date(Date.UTC(nextCalendarYear(next.season,league),getLeagueRule(league).startMonth-1,1)).toISOString():new Date(Date.parse(currentDate(next))+1).toISOString(),end=new Date(Date.parse(start)+(duration==='half'?182:365)*86400000).toISOString();
 (next.systems!.manualInjuries??=[]).push({id:`manual-injury:${next.id}:${next.revision}`,year:next.season.year+(pending?1:0),clubId:next.player.clubId,duration,start,end,...(pending?{pendingNextSeason:true}:{}),missed:[]});
 if(pending){present(next,'injury','다음 시즌 부상 예약',`다음 시즌 실제 소속 리그의 시작일부터 ${duration==='half'?182:365}일 동안 결장합니다. 능력치 잠금은 유지되며 계약·훈련 선택 후 적용됩니다.`);touch(next);return next;}
 present(next,'injury',`${duration==='half'?'반 시즌':'한 시즌'} 부상`,`${start.slice(0,10)} ~ ${end.slice(0,10)}. 부상 중 팀 경기는 정상 진행하며 시즌 종료 시 계약·훈련을 결정한 뒤 남은 기간을 이어갑니다.`,'milestone');
 syncManualInjury(next,start);
 skipInjuryPeriod(next,end,onProgress);touch(next);return next;
}

function skipInjuryPeriod(c:Career,end:string,onProgress?:(p:GameProgress)=>void):void{
 while(c.stage==='season'&&fixtureDate(c.season,c.season.week+1)<end){playRound(c);onProgress?.({year:c.season.year,round:c.season.week,total:c.season.totalWeeks});}
 if(c.stage==='season'&&end<=seasonHalfEndDate(c.season,'second')){
  processClubCompetitions(c,m=>{applyEffects(c,m);applyMatchExperience(c,m.playerStats);c.lastMatchId=m.id;},date=>processInternationalThrough(c,date),end);
  processInternationalThrough(c,end);syncManualInjury(c,end);c.systems!.manualClock=end;
 }
 recordManualAbsences(c);
}

function releaseInPlace(next:Career,reason:'release'|'expiry',nextSeason=false):void{
 if(isFreeAgent(next))return;
 const e=next.systems!.economics,old=next.player.clubId,c=e.contract;
 const previous={clubId:c.clubId,wage:c.wageAtSigning,years:c.expiresYear-c.signedYear,signedYear:c.signedYear,expiresYear:c.expiresYear,role:c.role,...(c.signedDate?{signedDate:c.signedDate}:{}),...(c.expiresDate?{expiresDate:c.expiresDate}:{})};
 changeEmployment(next,'FA',next.season.leagueId,0,reason,nextSeason);
 next.systems!.world.clubs[old].rosterIds=next.systems!.world.clubs[old].rosterIds.filter(id=>id!==next.player.id);
 delete next.systems!.world.players[next.player.id];
 for(const term of next.systems!.leadership.terms)if(term.scope==='club'&&term.endYear===undefined){term.endYear=next.season.year;term.endRound=next.season.week;}
 expireCaptainOffers(next,'club');
 Object.assign(next.systems!.leadership,{clubId:'FA',clubRole:'none',clubMatches:0,clubSinceYear:next.season.year+Number(nextSeason)});
 next.player.clubId='FA';next.player.wage=0;next.player.contractYears=0;
 const year=next.season.year+Number(nextSeason);
 e.contract={clubId:'FA',signedYear:year,expiresYear:year,wageAtSigning:0,role:'FA · 무소속',previousWage:previous.wage};
 e.contractHistory!.push({id:`release:${next.id}:${next.revision}:${reason}`,year:next.season.year,round:next.season.week,type:'release',effective:nextSeason?'nextSeason':'now',fee:0,reason:reason==='expiry'?'계약 만료 · FA 전환':'선수의 직접 계약 해지 · FA 전환',previous,current:{clubId:'FA',wage:0,years:0,signedYear:year,expiresYear:year,role:'FA · 무소속'}});
}
export function releaseContract(career:Career):Career{
 if(career.stage==='retired')throw new Error('은퇴한 선수는 계약을 해지할 수 없습니다.');
 const next=editable(career);releaseInPlace(next,'release',next.stage==='offseason');next.transferDecision=next.stage==='offseason'?'stay':undefined;
 next.offers=makeContractOffers(next,next.stage==='offseason'?'offseason':'midseason');
 present(next,'transfer','FA · 무소속 전환','클럽 명단과 급여에서 제외됩니다. 반 시즌씩 진행하면서 새 계약을 검토할 수 있습니다.','milestone');touch(next);return next;
}
function adoptDestinationSchedule(next:Career):void{
 const old=next.season,league=next.systems!.world.clubs[next.player.clubId].leagueId,state=next.systems!.world.competitions[league];
 // Other leagues have already simulated exactly to their own current round.
 next.season={...old,leagueId:league,competitionName:getLeague(league).name,week:state.round,totalWeeks:state.totalRounds,fixtures:state.fixtures.map(f=>({...f})),table:state.table.map(t=>({...t})),completed:state.round===state.totalRounds};
 next.systems!.halfRound=Math.ceil(state.totalRounds/2);delete next.systems!.monthlyLeague;
 const period=next.systems!.employment?.at(-1);if(period)period.fromRound=state.round;
 if(next.systems!.growthLedger)next.systems!.growthLedger.trackedFromRound=Math.min(next.systems!.growthLedger.trackedFromRound,state.round);
 next.systems!.phase=state.round===0?'preseason':state.round===next.systems!.halfRound?'midseason':state.round<next.systems!.halfRound?'first':'second';
}
