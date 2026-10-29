import {syncUser} from './world';
import {selectEleven,awardPositionGroup} from './award-selection';
export {awardPositionGroup} from './award-selection';
import {evaluateClubAwards} from './club-awards';
import {personalityEdge} from './personality';
import {shirtSalesAwards} from './commercial';
import {playingAbility} from './attributes';
import {marketEstimate,marketQuote,assessmentNow} from './market-value';
export {marketEstimate} from './market-value';
import {careerStanding,productionEvidence} from './career-standing';
import {getClubRatingOffset} from './world';
import {globalVoting,additionalGlobalHonours} from './global-honours';
import {isFreeAgent,expiryReturnClub,changeEmployment,careerLeagueEntries} from './employment';
import {evaluateExtraHonours} from './extra-honours';
import {moneyText} from './currency';
import {cupLedger,cupMatches,cupStats} from './club-competitions';
import { CLUBS, getClub, getLeague } from './data';
import { leagueAwardRules, GLOBAL_AWARD_RULES, AWARD_MODEL_VERSION } from './award-rules';
import type { AwardRule } from './award-rules';
import { clamp, emptyStats, hashSeed, round, seededRandom, sumStats } from './math';
import { getLeagueRule } from './league-rules';
import { nextCalendarYear, seasonDate } from './calendar';
import { evaluateTournamentAwards } from './tournament-awards';
import { normalizeNationality } from './national-data';
import { scoutingReports } from './scouting';
import { getCaptainAssessment,proposeCaptainOffer,expireCaptainOffers } from './captain';
export { getCaptainAssessment,answerCaptainOffer,expireCaptainOffers } from './captain';
import type { Award, Career, PlayerStats, Position, TransferOffer } from './types';
import type { BallonDorYear, CompetitorSeason, ContractSnapshot, ContractTermsSnapshot, Economics, Leadership, RankingCandidate } from './revision-types';

const avgRating = (s: PlayerStats) => s.ratingCount ? s.ratingSum / s.ratingCount : 0;
const clubPower = (career: Career, clubId: string) => career.systems?.world.clubs[clubId]?.power ?? getClub(clubId).power;
/** Initialize inertia without repricing an already-held, hash-verified asset. */
export function ensureEconomicMarket(c:Career):void{
 const e=c.systems?.economics;if(!e||e.valuationVersion===2&&e.assessment)return;
 e.valuationVersion=2;e.assessment=assessmentNow(c);
}
function dateOnly(value:string):string { return value.slice(0,10); }
function contractEndDate(startYear:number,startMonth:number,years:number):string {
  return new Date(Date.UTC(startYear+years,startMonth-1,0)).toISOString().slice(0,10);
}
function termsSnapshot(contract:Economics['contract']):ContractTermsSnapshot {
  return {clubId:contract.clubId,wage:contract.wageAtSigning,years:Math.max(0,contract.expiresYear-contract.signedYear),signedYear:contract.signedYear,expiresYear:contract.expiresYear,role:contract.role,
    ...(contract.signedDate?{signedDate:contract.signedDate}:{}),...(contract.expiresDate?{expiresDate:contract.expiresDate}:{})};
}
function legacyContractSnapshot(career:Career,economics:Economics):ContractSnapshot {
  return {id:`contract:legacy:${career.player.id}:${career.season.year}:${career.season.week}`,year:career.season.year,round:career.season.week,type:'legacy',effective:economics.contract.signedYear>career.season.year?'nextSeason':'now',reason:'기존 저장에서 확인한 현재 계약입니다. 과거 계약 변경 내역은 미집계입니다.',fee:0,current:termsSnapshot(economics.contract)};
}
/** Upgrade only an editable, hash-verified career; never invent missing older renewals. */
export function ensureEconomicHistory(career:Career):void {
  const e=career.systems?.economics;if(!e)return;
  if(e.contractHistory===undefined)e.contractHistory=[legacyContractSnapshot(career,e)];
  if(e.seasonStartYear!==career.season.year||e.seasonStartValue===undefined){
    const start=e.valueHistory.find(point=>point.year===career.season.year&&point.round===0);
    if(start){e.seasonStartYear=career.season.year;e.seasonStartValue=start.value;}
  }
}
export function createEconomics(career: Career,legacy=false): Economics {
  const value = marketEstimate(career),years=Math.max(legacy?0:1,career.player.contractYears);
  const signedDate=dateOnly(seasonDate(career.season,0));
  const economics:Economics = {
    valuationVersion:2,assessment:assessmentNow(career),
    marketValue: value, previousValue: value, peakValue: value,
    valueHistory: [{ year: career.season.year, round: career.season.week, value, reason: '현재 능력·나이·잠재력·리그 수준으로 평가 시작' }],
    salaryIncome: career.careerIncome, bonusIncome: 0,
    totalTransferFees: career.transfers.reduce((sum, t) => sum + t.fee, 0), highestWage: Math.max(career.player.wage, ...career.transfers.map(t => t.wage)),
    contract: { signedYear: career.season.year, expiresYear: career.season.year + years, wageAtSigning: career.player.wage, role: career.player.squad === 'youth' ? '유소년' : '로테이션', clubId: career.player.clubId,
      ...(!legacy?{signedDate,expiresDate:contractEndDate(career.season.calendarYear??career.season.year,getLeagueRule(career.season.leagueId).startMonth,years)}:{}) },
    ...(!legacy&&career.season.week===0?{seasonStartValue:value,seasonStartYear:career.season.year}:{}),
  };
  economics.contractHistory=legacy?[legacyContractSnapshot(career,economics)]:[{id:`contract:initial:${career.player.id}:${career.season.year}`,year:career.season.year,round:career.season.week,type:'initial',effective:'now',reason:'커리어 시작 당시 체결한 최초 계약',fee:0,current:termsSnapshot(economics.contract)}];
  return economics;
}
/** Call after the new season's opening valuation, once per actual logical season. */
export function beginEconomicSeason(career:Career):void {
  const e=career.systems?.economics;if(!e)return;
  ensureEconomicHistory(career);
  if(e.seasonStartYear===career.season.year&&e.seasonStartValue!==undefined)return;
  e.seasonStartYear=career.season.year;e.seasonStartValue=e.marketValue;
}
export function getPreviousContractWage(career:Career):number|undefined {
  const e=career.systems?.economics;
  return e?.contract.previousWage??e?.contractHistory?.at(-1)?.previous?.wage;
}
export function updateMarketValue(career: Career, reason: string): void {
  if (!career.systems) return;
  ensureEconomicHistory(career);
  const e = career.systems.economics;
  ensureEconomicMarket(career);
  e.previousValue = e.marketValue;
  e.marketValue = marketQuote(career);
  const before=e.assessment!,now=assessmentNow(career);
  const elapsed=now.year-before.year+now.round/now.totalRounds-before.round/before.totalRounds;
  // Keep the last observed ability through administrative/no-match updates.
  // Otherwise manual decline would reset its own reference before being tested in games.
  if(elapsed>0||now.injuryWeeks>=before.injuryWeeks+4||now.stardom>before.stardom)e.assessment=now;
  e.peakValue = Math.max(e.peakValue, e.marketValue);
  const entry = { year: career.season.year, round: career.season.week, value: e.marketValue, reason };
  const previous = e.valueHistory.at(-1);
  if (previous?.year === entry.year && previous.round === entry.round && previous.reason === reason) e.valueHistory[e.valueHistory.length - 1] = entry;
  else e.valueHistory.push(entry);
}
export function paySalary(career: Career, weeks: number): void {
  if(isFreeAgent(career))return;
  if (!Number.isFinite(weeks) || weeks < 0) throw new Error('급여 지급 기간이 올바르지 않습니다.');
  if (!career.systems) return;
  const e = career.systems.economics;
  // Round cumulative income, not each fraction: 38 rounds still pay exactly 52 weeks.
  e.salaryIncome = round(e.salaryIncome + e.contract.wageAtSigning * weeks, 6);
  e.highestWage = Math.max(e.highestWage, e.contract.wageAtSigning);
  career.careerIncome = round(e.salaryIncome + e.bonusIncome, 2);
}
/** Engine calls this only for an earned bonus under its explicit game contract clauses. */
export function payBonus(career: Career, amount: number): void {
  if (!Number.isFinite(amount) || amount < 0) throw new Error('보너스 금액이 올바르지 않습니다.');
  if (!career.systems) return;
  const e = career.systems.economics;
  e.bonusIncome = round(e.bonusIncome + amount, 2);
  career.careerIncome = round(e.salaryIncome + e.bonusIncome, 2);
}

export function contractRole(career:Career,clubId:string):string {
 const standing=careerStanding(career),club=career.systems!.world.clubs[clubId],p=career.player;
 const group=(position:string)=>position==='GK'?'GK':/^(CB|LB|RB|LWB|RWB)$/.test(position)?'DEF':/^(CDM|CM|CAM|LM|RM)$/.test(position)?'MID':'FWD';
 const offset=getClubRatingOffset(career,clubId),levels=club.rosterIds.map(id=>career.systems!.world.players[id]).filter(row=>row&&row.id!==p.id&&group(row.position)===group(p.position)).map(row=>clamp(row.ovr+offset,25,99)).sort((a,b)=>b-a).slice(0,p.position==='GK'?1:3);
 const competition=levels.length?levels.reduce((a,b)=>a+b,0)/levels.length:club.power;
 const delta=standing.ability+standing.proven*.75-competition;
 let role=delta>=7?'핵심 선수':delta>=-3?'주전':delta>=-11?'로테이션':'유망주';
 // An incumbent's actual high-level production and repeated selection cannot be
 // overruled by comparing raw OVR to a team-wide power score.
 const proof=standing.rows.find(r=>!r.youth&&r.stats.minutes>=1800&&r.year>=career.season.year-1&&getLeague(r.leagueId).tier<=getLeague(club.leagueId).tier);
 if(proof){const s=proof.stats,rating=s.ratingCount?s.ratingSum/s.ratingCount:0,impact=productionEvidence(s,proof.position),own=proof.clubId===clubId;
  if((impact>=.8&&rating>=7||standing.worldRank!==null&&standing.worldRank<=30)&&delta>=-16)role=own&&((impact>=1.05&&rating>=7.2)||standing.worldRank!==null&&standing.worldRank<=10)?'핵심 선수':'주전';
 }
 return role;
}
function individualWageLimit(career: Career, clubId: string): number {
  const club = career.systems?.world.clubs[clubId];
  return club ? Math.max(0, Math.floor(club.wageBudget / 52 * .14)) : 0;
}
const CONTRACT_OFFER_MODEL='offseason-v2111';
/** Old proposals are refreshed once when opened, after the save hash is verified. */
export function needsContractOfferRefresh(career:Career):boolean{
 return career.stage!=='retired'&&(career.stage==='offseason'||isFreeAgent(career))&&(!career.transferDecision||isFreeAgent(career))&&
  (career.offers.length===0||career.offers.some(o=>!o.id.includes(`:${CONTRACT_OFFER_MODEL}:`)));
}
function contractYears(career:Career,role:string,rng:()=>number):number{
 const p=career.player,s=career.season.playerStats;
 const previous=career.history.filter(h=>h.year<career.season.year).slice(-2);
 const recentAbility=Math.max(career.season.ovrStart,...previous.map(h=>h.ovrEnd));
 const retained=p.ovr>=recentAbility-2,proven=s.minutes>=900&&avgRating(s)>=6.8;
 const firstTeam=role==='핵심 선수'||role==='주전';
 // One year is a response to actual decline or a marginal squad role.
 // Age alone never turns a retained first-team player into an annual release.
 if(p.age>=29&&!retained&&!proven||p.age>=32&&!firstTeam&&!proven)return 1;
 const physical=p.position==='GK'?((p.attributes.gkPositioning??50)+(p.attributes.concentration??50))/2:((p.attributes.stamina??50)+(p.attributes.strength??50)+(p.attributes.speed??50))/3;
 if(p.age>=32)return firstTeam&&retained&&physical>=75&&p.injuryWeeks===0?3:2;
 if(p.age>=29)return firstTeam||proven?3:2;
 return 3+Math.floor(rng()*2);
}
export function makeContractOffers(career:Career,timing:'midseason'|'offseason'):TransferOffer[]{
 if(!career.systems||(career.stage!=='offseason'&&!isFreeAgent(career))||career.stage==='retired')return[];
 const {world,economics:e}=career.systems,p=career.player,remaining=Math.max(0,e.contract.expiresYear-career.season.year-1);
 const rng=seededRandom(`${career.seed}:offers-v29:${career.season.year}:${isFreeAgent(career)?career.season.week:0}`),reports=new Map(scoutingReports(career).map(r=>[r.clubId,r]));
 const priorWage=isFreeAgent(career)?e.contract.previousWage??0:p.wage,returnClub=expiryReturnClub(career);
 const renewalClub=!isFreeAgent(career)?p.clubId:returnClub;
 const canRenew=!!renewalClub&&!!world.clubs[renewalClub]&&individualWageLimit(career,renewalClub)>=150;
 const declined=p.age>=34&&p.ovr<(career.history.filter(h=>h.year<career.season.year).at(-1)?.ovrEnd??career.season.ovrStart)-4&&avgRating(career.season.playerStats)<6.5;
 const affordable=Object.values(world.clubs).filter(x=>x.id!==p.clubId&&!(canRenew&&x.id===returnClub)&&(!isFreeAgent(career)||career.stage==='offseason'||getLeagueRule(x.leagueId).startMonth===getLeagueRule(career.season.leagueId).startMonth)&&!/(?:\sB|\sII|카스티야)$/.test(getClub(x.id).name)&&individualWageLimit(career,x.id)>=150&&x.budget>=0);
 // Prefer clubs that can honour the established salary; keep an explicitly explained budget fallback.
 const funded=affordable.filter(x=>individualWageLimit(career,x.id)>=priorWage*(declined?.8:1.03));
 const candidates=funded.length>=6?funded:affordable;
 const target=clamp(p.ovr+(avgRating(career.season.playerStats)-6.5)*1.5,25,100),used=new Set<string>(),selected:{id:string;band:NonNullable<TransferOffer['band']>}[]=[],countries=new Map<string,number>();
 const choose=(pool:typeof candidates,band:NonNullable<TransferOffer['band']>,distance:(power:number)=>number)=>{
  const ranked=pool.filter(x=>!used.has(x.id)).map(x=>({x,score:distance(x.power)+(countries.get(getClub(x.id).country)??0)*5-(reports.get(x.id)?.need??.25)*3+rng()*9})).sort((a,b)=>a.score-b.score||a.x.id.localeCompare(b.x.id));
  const row=ranked[0]?.x;if(!row)return false;used.add(row.id);selected.push({id:row.id,band});const country=getClub(row.id).country;countries.set(country,(countries.get(country)??0)+1);return true;
 };
 // Reserve the distinct lower/higher/wild bands before choosing three nearby clubs.
 const lower=candidates.filter(x=>x.power<target-4),higher=candidates.filter(x=>x.power>target+4);
 choose(lower.length?lower:candidates,'lower',power=>Math.abs(power-(target-10)));
 choose(higher.length?higher:candidates,'higher',power=>higher.length?Math.abs(power-(target+8)):-power);
 const highWild=seededRandom(`${career.seed}|wild-direction`)()<.5?career.season.year%2===0:career.season.year%2!==0;
 const wild=candidates.filter(x=>highWild?x.power>target+14:x.power<target-18),opposite=candidates.filter(x=>highWild?x.power<target-18:x.power>target+14);
 choose(wild.length?wild:opposite.length?opposite:candidates,'wild',power=>wild.length||opposite.length?-Math.abs(power-target):-Math.abs(power-target));
 for(let i=0;i<3;i++)choose(candidates,'similar',power=>Math.abs(power-target));
 if(selected.length!==6)throw new Error('실제 구단과 예산을 충족하는 6개 제안을 편성할 수 없습니다.');
 const offer=(id:string,renew:boolean,band?:TransferOffer['band']):TransferOffer=>{
  const club=world.clubs[id],limit=individualWageLimit(career,id),justified=Math.max(e.marketValue,marketQuote(career))/(52*12)*(p.age<=20?.72:p.age<=23?.88:1)*(1+Math.max(0,avgRating(career.season.playerStats)-6.5)*.08);
  const demand=reports.get(id)?.need??.25,role=contractRole(career,id);
  const exceptionalCut=declined&&['로테이션','유망주'].includes(role);
  const salaryFloor=priorWage*(exceptionalCut?.78+rng()*.12:renew?1.04:1.03+rng()*.17+demand*.08);
  const wage=Math.round(Math.min(limit,Math.max(150,justified*(.96+rng()*.2),salaryFloor)));
  const asking=renew||remaining===0?0:Math.round(e.marketValue*clamp(.45+remaining*.18+rng()*.12,.45,1.35)),fee=Math.min(asking,Math.floor(club.budget*.75));
  const years=contractYears(career,role,rng),labels={similar:'동급 경쟁',lower:'하위 전력 · 핵심 기용',higher:'상위 전력 · 우승 경쟁',wild:'극단적 랜덤 · 도전 제안'};
  return {id:`${career.season.year}:${CONTRACT_OFFER_MODEL}:${renew?'renew':'transfer'}:${id}`,clubId:id,wage,years,role,fee,type:renew?'renew':'transfer',...(band?{band}:{}),expiresRound:career.season.totalWeeks,effective:'nextSeason',currentWage:p.wage,budgetLimit:club.budget,reason:`${band?labels[band]:'재계약'} · 팀 전력 ${club.power.toFixed(1)} · ${role}. 포지션 수요 ${Math.round((reports.get(id)?.need??0)*100)}%. 현재 주급 ${moneyText(p.wage)} → ${moneyText(wage)} · ${years}년. 현재 기량 ${playingAbility(p).toFixed(1)} · 실전 위상 보정 ${careerStanding(career).proven.toFixed(1)}. 역할과 계약 기간은 포지션 경쟁·최근 실적·세계 수상 평가와 나이를 함께 반영합니다.${fee<asking?' 요구 이적료보다 낮은 예산 한도 내 입찰이며 수락 여부는 선수가 결정합니다.':''}${['유망주','로테이션'].includes(role)&&club.power>playingAbility(p)+12?' 즉시 주전 보장 없는 장기 육성·로테이션 계약.':''}${higher.length===0&&band==='higher'?' 현재 수준보다 강한 팀이 없어 실제 최상위 경쟁 구단으로 대체.':''}${lower.length===0&&band==='lower'?' 현재 수준보다 낮은 팀이 없어 가능한 낮은 전력의 실제 비교 구단으로 대체.':''}`};
 };
 const result=selected.sort((a,b)=>({similar:0,lower:1,higher:2,wild:3}[a.band]-{similar:0,lower:1,higher:2,wild:3}[b.band])).map(row=>offer(row.id,false,row.band));
 if(canRenew){
  const renewal=offer(renewalClub!,true);
  // FA -> former club is a real, fee-free return in the transfer ledger.
  // Keep renew snapshots reserved for uninterrupted contracts at one club.
  if(isFreeAgent(career)){renewal.type='transfer';renewal.reason=`계약 만료 구단의 재계약 · FA 재입단 제안. ${renewal.reason}`;}
  result.push(renewal);
 }
 for(const o of result){if(isFreeAgent(career)){o.fee=0;o.effective=career.stage==='offseason'?'nextSeason':'now';}if(o.wage<priorWage)o.reason+=declined&&['로테이션','유망주'].includes(o.role)?' 고령·최근 기량 저하와 후보 역할을 반영한 감액 제안.':' 구단 급여 예산 한도로 종전 주급을 맞추지 못한 제안.';}
 return result;
}
export function applyContract(career: Career, offer: TransferOffer): void {
  if (!career.systems) throw new Error('계약 시스템이 초기화되지 않았습니다.');
  const { economics: e, world, leadership: l } = career.systems;
  const historyId=`contract:${offer.id}`;
  if(e.contractHistory?.some(entry=>entry.id===historyId))return;
  const fromClubId = career.player.clubId;
  const effectiveYear = career.season.year + (offer.effective === 'nextSeason' ? 1 : 0);
  const target = world.clubs[offer.clubId];
  if (!target || offer.wage <= 0 || !Number.isFinite(offer.wage) || !Number.isInteger(offer.years) || offer.years < 1 || offer.years > 5 || offer.fee < 0 || !Number.isFinite(offer.fee)) throw new Error('올바르지 않은 계약입니다.');
  if (offer.type === 'renew' && offer.clubId !== fromClubId) throw new Error('현재 구단에서만 재계약할 수 있습니다.');
  if (offer.fee > target.budget || offer.wage > individualWageLimit(career, offer.clubId)) throw new Error('구단의 이적 또는 급여 예산을 초과했습니다.');
  ensureEconomicHistory(career);
  const previous=termsSnapshot(e.contract);
  if(career.systems.employment||fromClubId==='FA')changeEmployment(career,offer.clubId,target.leagueId,offer.wage,'transfer',offer.effective==='nextSeason');
  const actualStartYear=offer.effective==='nextSeason'?nextCalendarYear(career.season,target.leagueId):(career.season.calendarYear??career.season.year);
  const signedDate=dateOnly(seasonDate(career.season));
  const expiresDate=contractEndDate(actualStartYear,getLeagueRule(target.leagueId).startMonth,offer.years);
  if (offer.type === 'transfer' && offer.clubId !== fromClubId) {
    target.budget -= offer.fee;
    if (world.clubs[fromClubId]) world.clubs[fromClubId].budget += offer.fee;
    const oldRoster = world.clubs[fromClubId]?.rosterIds;
    if (oldRoster) world.clubs[fromClubId].rosterIds = oldRoster.filter(id => id !== career.player.id);
    if (!target.rosterIds.includes(career.player.id)) target.rosterIds.push(career.player.id);
    if (world.players[career.player.id]) world.players[career.player.id].clubId = offer.clubId;
    career.transfers.push({ year: effectiveYear, fromClubId, toClubId: offer.clubId, fee: offer.fee, wage: offer.wage });
    e.totalTransferFees += offer.fee;
    for (const term of l.terms) if (term.scope === 'club' && term.endYear === undefined) { term.endYear = career.season.year; term.endRound = career.season.week; }
    l.clubId = offer.clubId; l.clubSinceYear = effectiveYear; l.clubRole = 'none'; l.clubMatches = 0;
    l.reason = '새 구단에 합류했습니다. 주장단은 능력치와 별개로 근속·리더십·신뢰·출전으로 결정됩니다.';
    career.managerTrust = 50;
  }
  career.player.clubId = offer.clubId;
  career.player.wage = offer.wage;
  syncUser(career,world);
  career.player.contractYears = offer.years;
  e.contract = { signedYear: effectiveYear, expiresYear: effectiveYear + offer.years, wageAtSigning: offer.wage, role: offer.role, clubId: offer.clubId,previousWage:previous.wage,signedDate,expiresDate };
  e.contractHistory!.push({id:historyId,year:career.season.year,round:career.season.week,type:offer.type,effective:offer.effective??'now',reason:offer.reason,fee:offer.fee,previous,current:termsSnapshot(e.contract)});
  e.highestWage = Math.max(e.highestWage, offer.wage);
  career.careerIncome = round(e.salaryIncome + e.bonusIncome, 2);
}

export function createLeadership(career: Career): Leadership {
  const a = career.player.attributes;
  const mental = ((a.teamwork ?? 45) + (a.decisions ?? 45) + (a.composure ?? 45) + (a.concentration ?? 45)) / 4;
  const trait=Math.round(clamp(mental + hashSeed(`${career.seed}:leadership`) % 15 - 7, 15, 95));
  return { trait, baseTrait:trait, traitUpdatedYear:career.season.year, clubSinceYear: career.season.year, clubId: career.player.clubId, clubRole: 'none', nationalRole: 'none', clubMatches: 0, nationalMatches: 0, terms: [], reason: '신입 선수: 근속·리더십·신뢰·꾸준한 출전이 필요합니다.' };
}
function nationalMatches(career: Career) {
  const national = career.systems!.national;
  const all = [...national.history.flatMap(h => h.matches), ...national.matches];
  return [...new Map(all.map(m => [m.id, m])).values()];
}
export function updateLeadership(career: Career, scope: 'club'|'national', appointment = false): void {
  if(scope==='club'&&isFreeAgent(career))return;
  if (!career.systems) return;
  const { leadership: l, world, national } = career.systems;
  const p = career.player;
  // Temperament is retained; mental development and played experience can build leadership.
  // A season's preparation fixes this value, so weekly and compressed commands agree.
  l.baseTrait ??= l.trait;
  if((l.traitUpdatedYear??-1)<career.season.year){
    const mentalKeys=['teamwork','decisions','composure','concentration'] as const;
    const mental=mentalKeys.reduce((sum,key)=>sum+(p.attributes[key]??45),0)/mentalKeys.length;
    const clubApps=career.history.reduce((sum,h)=>sum+h.stats.apps,0)+(career.history.some(h=>h.year===career.season.year)?0:career.season.playerStats.apps);
    const appearances=clubApps+nationalMatches(career).filter(m=>m.playerPlayed).length;
    const maturity=clamp((p.age-17)*1.1,0,16.5);
    const experience=Math.min(18,Math.log1p(appearances)*2.6);
    const createdYear=Number(career.createdAt.slice(0,4));
    const initialYear=Number.isInteger(createdYear)&&createdYear>=1900?createdYear:career.season.year-Math.max(0,career.season.index-1);
    const elapsed=Math.max(0,career.season.year-initialYear);
    const growthYears=Math.max(0,career.season.year-(l.traitUpdatedYear??initialYear));
    const ceiling=Math.min(l.baseTrait+elapsed*2.5,l.trait+growthYears*2.5);
    const target=clamp(mental*.55+l.baseTrait*.45+maturity+experience,15,95);
    l.trait=round(Math.max(l.trait,Math.min(ceiling,target)),1);
    l.traitUpdatedYear=career.season.year;
  }
  if (l.clubId !== p.clubId) {
    for (const term of l.terms) if (term.scope === 'club' && term.endYear === undefined) { term.endYear = career.season.year; term.endRound = career.season.week; }
    expireCaptainOffers(career,'club');
    l.clubId = p.clubId; l.clubSinceYear = career.season.year; l.clubRole = 'none';
  }
  const records = scope === 'club' ? [...career.history.flatMap(h => h.matches), ...career.season.matches,...cupMatches(career)] : nationalMatches(career);
  const teamId = scope === 'club' ? p.clubId : `NAT:${national.country}:${national.squad}`;
  const matches = [...new Map(records.map(m => [m.id, m])).values()].filter(m => m.playerPlayed && (scope === 'club' ? m.playerClubId === p.clubId : m.homeId === teamId || m.awayId === teamId));
  if (scope === 'club') l.clubMatches = matches.length; else l.nationalMatches = matches.length;
  const appointmentRound = scope === 'club' ? career.season.week : matches.filter(m => m.seasonYear === career.season.year).length;
  const roleKey = scope === 'club' ? 'clubRole' : 'nationalRole';
  if (scope === 'national' && l.terms.some(t => t.scope === scope && t.teamId !== teamId && t.endYear === undefined)) {
    for (const t of l.terms) if (t.scope === scope && t.teamId !== teamId && t.endYear === undefined) { t.endYear = career.season.year; t.endRound = 0; }
    l.nationalRole = 'none';expireCaptainOffers(career,'national');
  }
  const assessment=getCaptainAssessment(career,scope);
  if(appointment||scope==='club'&&career.season.week>0&&career.season.week%6===0)proposeCaptainOffer(career,scope,assessment);
  for (const t of l.terms.filter(t => t.scope === scope && t.teamId === teamId)) {
    if (t.role !== 'match') t.apps = matches.filter((m, index) => {
      const playedRound = scope === 'club' ? m.round : matches.slice(0, index + 1).filter(previous => previous.seasonYear === m.seasonYear).length;
      const afterAppointment = m.seasonYear > t.startYear || (m.seasonYear === t.startYear && playedRound > (t.startRound ?? 0));
      const beforeEnd = t.endYear === undefined || m.seasonYear < t.endYear || (m.seasonYear === t.endYear && playedRound <= (t.endRound ?? Infinity));
      const woreArmband = t.role !== 'captain' || !m.performers || m.performers.some(r => r.id === p.id && r.captain);
      return afterAppointment && beforeEnd && woreArmband;
    }).length;
  }
  const latest = matches.at(-1);
  if (latest?.performers?.find(r => r.id === p.id)?.captain && l[roleKey] !== 'captain' && !l.terms.some(t => t.role === 'match' && t.reason.includes(latest.id))) {
    l.terms.push({ scope, teamId, role: 'match', startYear: career.season.year, endYear: career.season.year, startRound: latest.round, endRound: latest.round, apps: 1, reason: `정규 주장 부재 시 임시 주장 · 경기 ${latest.id}` });
  }
  l.reason=assessment.reasons.join(' ');
}

function competitors(career: Career): CompetitorSeason[] {
  const world = career.systems!.world;
  const byId = new Map(Object.values(world.playerStats).map(r => [r.playerId, r]));
  const national = career.systems!.national;
  const currentNational = national.matches.filter(m => m.seasonYear === career.season.year).map(m => m.playerStats);
  for (const h of national.history) if (h.year === career.season.year) currentNational.push(h.stats);
  // A history entry may contain the current competition: match ids are the canonical deduplication key.
  const nationalRows = nationalMatches(career).filter(m => m.seasonYear === career.season.year).map(m => m.playerStats);
  const entries=careerLeagueEntries(career),primary=[...entries].sort((a,b)=>b.stats.minutes-a.stats.minutes)[0];
  byId.set(career.player.id, { ...(career.systems!.employment?{leagueSplits:entries.map(r=>({leagueId:r.leagueId,stats:r.stats}))}:{}),playerId: career.player.id, name: career.player.name, clubId: primary?.clubId??career.player.clubId, leagueId: primary?.leagueId??career.season.leagueId, position: career.player.position, nationality: career.player.nationality, ovr: career.player.ovr, stats: career.season.playerStats, nationalStats: sumStats(nationalRows.length ? nationalRows : currentNational) });
  return [...byId.values()];
}
interface VotingContext { prestige:Map<string,number>;teamScore:Map<string,number>;leagueTitles:Map<string,number>;cupTitles:Map<string,number>;roleLevels:Map<string,{rating:number;contribution:number}> }
function roleContribution(row:CompetitorSeason):number{
 const s=row.stats,group=awardPositionGroup(row.position),games=Math.max(1,s.minutes/90),rate=(n:number,expected:number)=>Math.min(2.5,n/games/expected);
 if(group==='GK')return rate(s.saves,3.4)*12+s.cleanSheets/Math.max(1,s.apps)*32+s.saves/Math.max(1,s.shotsFaced??s.saves+s.goalsConceded)*18+rate(s.penaltiesSaved??0,.04)*2;
 if(group==='DEF')return rate(s.tackles+s.interceptions,4)*20+rate(s.aerialWon??0,2.3)*7+s.cleanSheets/Math.max(1,s.apps)*22+rate(s.goals+s.assists,.18)*8;
 if(group==='MID')return rate(s.goals+s.assists,.45)*19+rate(s.keyPasses??0,1.6)*11+rate(s.tackles+s.interceptions,3.5)*8+s.passesCompleted/Math.max(1,s.passes)*8;
 return rate(s.goals,.52)*26+rate(s.assists,.2)*10+rate(s.dribblesCompleted??0,2)*7+rate(s.tackles+s.interceptions,3)*10+rate(s.keyPasses??0,1.2)*6+rate(s.aerialWon??0,2)*4;
}
const median=(values:number[])=>{const a=values.sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;};
function votingContext(career:Career):VotingContext{
 const strengths=new Map<string,{sum:number;count:number}>(),world=career.systems!.world;
 for(const club of Object.values(world.clubs)){const row=strengths.get(club.leagueId)??{sum:0,count:0};row.sum+=club.power;row.count++;strengths.set(club.leagueId,row);}
 const prestige=new Map([...strengths].map(([id,v])=>[id,(.3+v.sum/v.count/100*.7)/Math.sqrt(getLeague(id).tier)]));
 const teamScore=new Map<string,number>(),leagueTitles=new Map<string,number>();
 for(const comp of Object.values(world.competitions)){
  const table=[...comp.table].sort((a,b)=>b.points-a.points||(b.goalsFor-b.goalsAgainst)-(a.goalsFor-a.goalsAgainst)||b.goalsFor-a.goalsFor||a.clubId.localeCompare(b.clubId));
  for(const [i,team]of table.entries()){teamScore.set(team.clubId,team.points/Math.max(1,team.played*3)*12);if(comp.round===comp.totalRounds&&team.played>0&&i<3)leagueTitles.set(team.clubId,[8,4,2][i]);}
 }
 const cupTitles=new Map<string,number>(),continental=new Set<string>(),domestic=new Set<string>();
 const cups=cupLedger(career,career.season.year).filter(t=>t.phase==='completed'&&t.winnerId);
 for(const t of cups){
  const major=t.kind==='continental'&&t.format!=='super'&&t.format!=='intercontinental';
  const value=t.id.startsWith('UCL:')?16:t.id.startsWith('UEL:')?8:t.id.startsWith('UECL:')?5:major?9:t.kind==='cup'?4:t.kind==='leagueCup'?2:1;
  const rows=new Map(Object.values(t.playerStats??{}).filter(r=>r.clubId===t.winnerId).map(r=>[r.playerId,r]));
  if(t.winnerId===career.player.clubId){const stats=sumStats(t.matches.filter(m=>m.playerClubId===t.winnerId).map(m=>m.playerStats));if(stats.minutes)rows.set(career.player.id,{playerId:career.player.id,stats} as CompetitorSeason);}
  const maxMinutes=Math.max(90,...[...rows.values()].map(r=>r.stats.minutes));
  for(const row of rows.values())if(row.stats.minutes>0){const credit=value*clamp(row.stats.minutes/(maxMinutes*.65),0,1);cupTitles.set(row.playerId,(cupTitles.get(row.playerId)??0)+credit);if(major&&row.stats.minutes>=maxMinutes*.4)continental.add(row.playerId);if(t.kind==='cup'&&row.stats.minutes>=maxMinutes*.4)domestic.add(row.playerId);}
 }
 const all=competitors(career),groups=new Map<string,CompetitorSeason[]>();
 for(const r of all){if(r.stats.minutes<900||r.stats.apps<10)continue;const key=`${r.leagueId}:${awardPositionGroup(r.position)}`,rows=groups.get(key)??[];rows.push(r);groups.set(key,rows);}
 const roleLevels=new Map<string,{rating:number;contribution:number}>();
 for(const [key,rows]of groups)if(rows.length>=5)roleLevels.set(key,{rating:median(rows.map(r=>avgRating(r.stats))),contribution:Math.max(12,median(rows.map(roleContribution)))});
 for(const row of all)if(leagueTitles.get(row.clubId)===8&&continental.has(row.playerId)&&domestic.has(row.playerId))cupTitles.set(row.playerId,(cupTitles.get(row.playerId)??0)+7);
 return {prestige,teamScore,leagueTitles,cupTitles,roleLevels};
}
/** Same observed role baselines and achievement credit for every actual competitor; OVR has no vote. */
export function performanceScore(row:CompetitorSeason,career:Career,includeNational=false,context=votingContext(career)):number{
 const s=row.stats,group=awardPositionGroup(row.position);if(s.apps<1||s.minutes<1)return 0;
 const level=context.roleLevels.get(`${row.leagueId}:${group}`),raw=roleContribution(row);
 const common=Math.max(0,avgRating(s)-(level?level.rating-1.8:5))*17+(s.mom??0)*.7;
 const contribution=level?clamp(raw/level.contribution,0,2.2)*32:raw;
 const participation=clamp(s.minutes/90/24,0,1),discipline=s.yellowCards*.12+s.redCards*2.5;
 let value=(common+contribution)*(.35+.65*participation)+(context.teamScore.get(row.clubId)??0)-discipline;
 if(includeNational){
  const rounds=worldRounds(career,row.leagueId),leagueCredit=clamp(s.minutes/(rounds*90*.65),0,1);
  value=(value+(context.leagueTitles.get(row.clubId)??0)*leagueCredit)*(context.prestige.get(row.leagueId)??.7)+(context.cupTitles.get(row.playerId)??0);
  const n=row.nationalStats??emptyStats();
  value+=(n.minutes?Math.max(0,avgRating(n)-5)*Math.min(8,n.apps)*.6+n.goals*(group==='DEF'||group==='GK'?1.5:.9)+n.assists*.7+(group==='GK'?n.cleanSheets:0)*1.2:0)-n.redCards*1.5;
 }
 return round(Math.max(0,value),4);
}
function worldRounds(c:Career,id:string):number{return c.systems!.world.competitions[id]?.totalRounds??c.season.totalWeeks;}
function rankRows(rows: CompetitorSeason[], career: Career, global = false, context = votingContext(career),score?:(r:CompetitorSeason)=>number): RankingCandidate[] {
  return rows.filter(r => r.stats.apps > 0).map(row => ({ playerId: row.playerId, name: row.name, clubId: row.clubId, position: row.position, score: score?score(row):performanceScore(row, career, global, context), rank: 0, stats: { ...row.stats }, nationalStats: { ...(row.nationalStats ?? emptyStats()) } }))
    .sort((a,b) => b.score - a.score || a.playerId.localeCompare(b.playerId)).map((row,i) => ({ ...row, rank: i + 1 }));
}
function award(career: Career, rule: Pick<AwardRule,'id'|'name'|'organiser'|'criterion'|'sourceUrl'|'official'>, category: string, detail: string): Award {
  return { id: `${career.season.year}:${category}:${rule.id}:${career.player.id}`, name: rule.name, year: career.season.year, clubId: career.player.clubId, description: detail, organiser: rule.organiser, criterion: rule.criterion, sourceUrl: rule.sourceUrl, category, official: rule.official??true };
}
export function getClubTopScorer(career: Career): { playerId: string; name: string; goals: number; tied: boolean } | null {
  if (!career.systems || career.player.squad==='youth') return null;
  const rows = competitors(career).filter(r => r.leagueId === career.season.leagueId && r.clubId === career.player.clubId && r.stats.apps > 0).sort((a,b) => b.stats.goals - a.stats.goals || a.playerId.localeCompare(b.playerId));
  if (!rows.length) return null;
  return { playerId: rows[0].playerId, name: rows[0].name, goals: rows[0].stats.goals, tied: rows.filter(r => r.stats.goals === rows[0].stats.goals).length > 1 };
}

function leagueHonours(career:Career,leagueId:string,leagueRows:CompetitorSeason[],context:VotingContext):Award[]{
 const own=career.player.squad==='senior'?leagueRows.find(r=>r.playerId===career.player.id):undefined,won:Award[]=[];
 const rounds=career.systems!.employment?career.systems!.world.competitions[leagueId]?.totalRounds??career.season.totalWeeks:career.season.totalWeeks,minApps=Math.max(5,Math.floor(rounds*.4));
 const leagueRanking=rankRows(leagueRows.filter(r=>r.stats.apps>=minApps),career,false,context,r=>performanceScore(r,career,false,context)*(r.playerId===career.player.id?1+personalityEdge(career,'stardom')*.016:1));
  for (const rule of leagueAwardRules(leagueId,getLeague(leagueId).name)) {
    if (!own) continue;
    if (rule.metric === 'goals' || rule.metric === 'assists' || rule.metric === 'cleanSheets') {
      const eligible = rule.metric === 'cleanSheets' ? leagueRows.filter(r => r.position === 'GK') : leagueRows;
      const max = Math.max(0, ...eligible.map(r => r.stats[rule.metric as 'goals'|'assists'|'cleanSheets']));
      let tied = eligible.filter(r => r.stats[rule.metric as 'goals'|'assists'|'cleanSheets'] === max);
      if (rule.tieBreak === 'fewerAppsThenMinutes') {
        const leastApps = Math.min(...tied.map(r => r.stats.apps));
        tied = tied.filter(r => r.stats.apps === leastApps);
        const leastMinutes = Math.min(...tied.map(r => r.stats.minutes));
        tied = tied.filter(r => r.stats.minutes === leastMinutes);
      }
      const resolved = rule.tieBreak !== 'unresolved' || tied.length === 1;
      if (max > 0 && resolved && tied.some(r => r.playerId === own.playerId)) won.push({...award(career, rule, 'league', `${getLeague(leagueId).name} ${max}${rule.metric === 'goals' ? '득점' : rule.metric === 'assists' ? '도움' : '무실점'} · 실제 리그 출전 선수 ${eligible.length}명 비교${tied.length > 1 ? ' · 공동 수상' : ''}`),clubId:own.clubId});
    } else {
      const ranking = leagueRanking;
      const winners = rule.metric === 'performance' ? ranking.slice(0,1) : selectEleven(ranking, rule.formation!.defenders, rule.formation!.midfielders, rule.formation!.forwards);
      if (winners.some(r => r.playerId === own.playerId)) won.push({ ...award(career, rule, 'league', `${own.stats.apps}경기 · 평점 ${avgRating(own.stats).toFixed(2)} · 포지션별 실제 기록을 사용한 게임 내 투표 결과`), position: own.position,clubId:own.clubId });
    }
  }

 return career.systems!.employment?won.map(a=>({...a,id:`${a.id}:${leagueId}`})):won;
}

export function evaluateAwards(career: Career): Award[] {
  if (!career.systems) return [];
  const existing = career.systems.rankings.find(r => r.year === career.season.year);
  if (existing) return existing.awards;
  const rows = competitors(career);
  const context = votingContext(career);
  const entries=careerLeagueEntries(career),localEntry=entries.find(r=>r.leagueId===career.season.leagueId);
  const leagueRows = rows.filter(r => r.playerId!==career.player.id&&r.leagueId === career.season.leagueId && r.stats.apps > 0);
  if(localEntry&&localEntry.stats.apps>0)leagueRows.push({...rows.find(r=>r.playerId===career.player.id)!,...localEntry});
  // Youth fixtures are a development simulation, not senior official award eligibility.
  const own = career.player.squad === 'senior' ? leagueRows.find(r => r.playerId === career.player.id) : undefined;
  const won: Award[] = [];
  const minApps = Math.max(5, Math.floor(career.season.totalWeeks * .4));
  const leagueRanking=rankRows(leagueRows.filter(r=>r.stats.apps>=minApps),career,false,context);
  for(const entry of entries){
   const local=rows.filter(r=>r.playerId!==career.player.id&&r.leagueId===entry.leagueId&&r.stats.apps>0);
   if(entry.stats.apps>0)local.push({...rows.find(r=>r.playerId===career.player.id)!,...entry});
   won.push(...leagueHonours(career,entry.leagueId,local,context));
  }
  const competition = career.systems.world.competitions[career.season.leagueId];
  const standings = [...(competition?.table ?? career.season.table)].sort((a,b) => b.points - a.points || (b.goalsFor-b.goalsAgainst) - (a.goalsFor-a.goalsAgainst) || b.goalsFor-a.goalsFor || a.clubId.localeCompare(b.clubId));
  const leagueRule = getLeagueRule(career.season.leagueId);
  if (!career.systems.employment&&own && standings[0]?.clubId === career.player.clubId && career.season.playerStats.apps >= leagueRule.medalApps) won.push({ id: `${career.season.year}:league-title:${career.player.id}`, name: `${getLeague(career.season.leagueId).name} 우승 메달`, year: career.season.year, clubId: career.player.clubId, description: `우승팀에서 리그 ${career.season.playerStats.apps}경기 출전. 메달 기준 ${leagueRule.medalApps}경기. ${leagueRule.note}`, organiser: getLeague(career.season.leagueId).name, criterion: `우승팀 소속 및 최소 ${leagueRule.medalApps}경기 출전. 확인되지 않은 리그의 기준은 게임 모형입니다.`, sourceUrl: leagueRule.sourceUrl, category: 'team', official: career.season.leagueId === 'EN1' });
  if(career.systems.employment){
   const clubs=[...new Set(career.season.matches.map(m=>`${m.competitionId??career.season.leagueId}|${m.playerClubId}`))];
   for(const key of clubs){const [leagueId,clubId]=key.split('|'),rule=getLeagueRule(leagueId),table=career.systems.world.competitions[leagueId]?.table,stats=sumStats(career.season.matches.filter(m=>(m.competitionId??career.season.leagueId)===leagueId&&m.playerClubId===clubId).map(m=>m.playerStats));
    if(career.player.squad==='senior'&&table?.[0]?.clubId===clubId&&stats.apps>=rule.medalApps)won.push({id:`${career.season.year}:league-title:${leagueId}:${clubId}:${career.player.id}`,name:`${getLeague(leagueId).name} 우승 메달`,year:career.season.year,clubId,description:`해당 우승팀에서 실제 리그 ${stats.apps}경기 출전 · 메달 기준 ${rule.medalApps}경기`,organiser:getLeague(leagueId).name,category:'team',official:leagueId==='EN1'});
   }
  }
  const national = career.systems.national;
  const nationalSeasons = national.history.filter(h => h.year === career.season.year && /우승|champion/i.test(h.result) && !/준우승|runner/i.test(h.result));
  for (const title of nationalSeasons) if (title.stats.apps > 0 && title.matches.some(m => m.playerPlayed && m.playerMinutes > 0 && /\|(semifinal|final)\|/.test(m.fixtureId))) won.push({ id: `${career.season.year}:national:${title.competitionId}:${career.player.id}`, name: `${title.competitionName} 우승`, year: career.season.year, clubId: career.player.clubId, description: `대표팀 대회 ${title.stats.apps}경기 실제 출전 · ${title.result}`, organiser: /월드컵|World Cup/i.test(title.competitionName) ? 'FIFA' : '해당 대륙 축구연맹', criterion: '게임에서는 실제 본선 출전이 있는 우승팀 선수에게 우승 기록을 부여합니다. 대회별 공식 메달 규정과는 구별됩니다.', sourceUrl: 'https://www.fifa.com/', category: 'national', official: true });
  won.push(...evaluateTournamentAwards(career),...evaluateExtraHonours(career,row=>performanceScore(row,career,false,context)),...shirtSalesAwards(career));
  // Global votes include actual club cup games for every competitor; league awards above remain league-only.
  const globalRows=rows.map(r=>({...r,stats:{...r.stats},nationalStats:{...(r.nationalStats??emptyStats())}}));
  const globalMap=new Map(globalRows.map(r=>[r.playerId,r]));
  for(const t of cupLedger(career,career.season.year))for(const r of Object.values(t.playerStats??{})){
    const target=globalMap.get(r.playerId);if(target)target.stats=sumStats([target.stats,r.stats]);else{const row={...r,stats:{...r.stats},nationalStats:emptyStats()};globalMap.set(r.playerId,row);globalRows.push(row);}
  }
  const globalOwn=globalMap.get(career.player.id);if(globalOwn)globalOwn.stats=sumStats([career.season.playerStats,cupStats(career,career.season.year)]);
  const globalContext={...context,leagueWinners:new Map([...context.leagueTitles].filter(([,v])=>v===8).map(([id])=>[id,career.systems!.world.clubs[id].leagueId])),cups:cupLedger(career,career.season.year).filter(t=>t.phase==='completed'&&!t.id.startsWith('PLAYOFF:')).map(t=>({id:t.id,kind:t.kind,winnerId:t.winnerId,entrants:t.entrants,matches:t.matches,finalIds:t.fixtures.filter(f=>f.stage==='결승'||f.stage==='final').map(f=>f.id)}))};
  const voting=globalVoting(career,globalRows,row=>performanceScore(row,career,false,context),globalContext);
  const extraGlobal=additionalGlobalHonours(career,globalRows.filter(r=>career.player.squad==='senior'||r.playerId!==career.player.id),rows,voting,selectEleven);
  won.push(...extraGlobal.awards);
  const fullRanking = rankRows(globalRows.filter(r => (career.player.squad === 'senior' || r.playerId !== career.player.id) && r.stats.apps >= Math.min(10, minApps) && r.stats.minutes >= 450), career, true, context,r=>voting.score(r));
  const candidates = fullRanking.slice(0,30);
  const playerRank = candidates.find(r => r.playerId === career.player.id)?.rank ?? null;
  const fifproRanking=rankRows(globalRows.filter(r=>(career.player.squad==='senior'||r.playerId!==career.player.id)&&r.stats.apps+r.nationalStats.apps>=30),career,true,context,r=>voting.score(r,'fifpro'));
  const world11 = selectEleven(fifproRanking, 3,3,3,true);
  if (candidates[0]?.playerId === career.player.id) won.push({ ...award(career, GLOBAL_AWARD_RULES.ballonDor, 'world', `30인 후보 중 1위 · 포지션 보정 경기력·팀 성적·대표팀 활약·페어플레이를 반영한 게임 내 투표`), rank: 1 });
  if (world11.length === 11 && world11.some(r => r.playerId === career.player.id)) won.push({ ...award(career, GLOBAL_AWARD_RULES.world11, 'world', `GK 1·DF 3·MF 3·FW 3 + 남은 필드 선수 1명 · 실제 세계 시즌 기록 기반 게임 내 선수 투표`), position: career.player.position });
  for(const item of won){
    item.ruleVersion=AWARD_MODEL_VERSION;item.verification='game-model';
    if(!item.evaluationPeriod)item.evaluationPeriod=`게임 시즌 ${seasonDate(career.season,0).slice(0,10)} ~ ${seasonDate(career.season,career.season.totalWeeks).slice(0,10)}의 기록${item.category==='world'?' · 각 리그의 같은 게임 시즌을 비교':''}`;
  }
  const diagnostics=(leagueAwardRules(career.season.leagueId,getLeague(career.season.leagueId).name)).map(rule=>({name:rule.name,scope:'리그만',eligible:!!own&&(rule.metric!=='cleanSheets'||own.position==='GK')&&(rule.metric==='performance'||rule.metric==='eleven'?own.stats.apps>=minApps:true),result:won.some(a=>a.id.includes(`:${rule.id}:`))?'수상':'미선정',detail:!own?'성인 리그 실제 출전이 필요합니다.':`${own.stats.apps}경기 · ${own.stats.goals}골 · ${own.stats.assists}도움 · 평점 ${avgRating(own.stats).toFixed(2)}${['performance','eleven'].includes(rule.metric)?` · 최소 ${minApps}경기 · 같은 포지션군 ${leagueRanking.filter(r=>awardPositionGroup(r.position)===awardPositionGroup(own.position)).findIndex(r=>r.playerId===own.playerId)+1}위`:''} · 같은 리그 실제 출전 선수 ${leagueRows.length}명 비교` }));
  diagnostics.push(...extraGlobal.diagnostics);
  const rankedOwn=fullRanking.find(r=>r.playerId===career.player.id);
  for(const [name,selected] of [['발롱도르',playerRank===1],['FIFPRO 월드 11',world11.some(r=>r.playerId===career.player.id)]] as const)diagnostics.push({name,scope:'리그·클럽 컵·국가대표',eligible:!!rankedOwn&&(name==='발롱도르'||rankedOwn.stats.apps+rankedOwn.nationalStats.apps>=30),result:selected?'수상':name==='발롱도르'&&playerRank?`${playerRank}위 · 미선정`:'미선정',detail:rankedOwn?`경기력 점수 ${rankedOwn.score.toFixed(2)} · 전체 ${rankedOwn.rank}위 · 우승/대회 기여 ${(context.cupTitles.get(career.player.id)??0).toFixed(1)}점 · 전체 비교 ${fullRanking.length}명 · 클럽 ${rankedOwn.stats.apps}경기 · 국대 ${rankedOwn.nationalStats.apps}경기. 발롱도르는 30인 후보 중 1위, 월드 11은 포지션별 비교와 총 30경기 이상.`:'성인 클럽 최소 출전·450분 기준 미충족 또는 실제 성적 미확인'});
  diagnostics.push({name:'경기 최우수 선수',scope:'실제 경기별',eligible:!!globalOwn?.stats.apps,result:`${(globalOwn?.stats.mom??0)+(globalOwn?.nationalStats.mom??0)}회`,detail:'각 경기에서 실제로 뛰고 받은 평점과 기여를 비교합니다. 출전하지 않은 경기는 제외합니다.'});
  for(const t of cupLedger(career,career.season.year).filter(t=>t.entrants.includes(career.player.clubId)||!!t.playerStats?.[career.player.id]))diagnostics.push(...evaluateClubAwards(career,t).diagnostics);
  const result: BallonDorYear = {diagnostics, year: career.season.year, candidates, playerRank, winnerId: candidates[0]?.playerId ?? '', world11, awards: won };
  career.systems.rankings.push(result);
  voting.finish();
  for (const a of won) if (!career.awards.some(previous => previous.id === a.id)) career.awards.push(a);
  return won;
}
