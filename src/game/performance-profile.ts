import {awardPositionGroup} from './award-selection';
import {getLeague} from './data';
import {clamp} from './math';
import type {League,PlayerStats,Position} from './types';

export type PerformanceRole='DEF'|'MID'|'FWD';
type Channels=Record<PerformanceRole,number>;
interface Row {position:Position;stats:PlayerStats;}
interface Baseline {rating:number;goalImpact:number;channels:Channels;}
export type PerformanceBaselines=Partial<Record<PerformanceRole,Baseline>>;
const roles:PerformanceRole[]=['DEF','MID','FWD'];
const defaults:Record<PerformanceRole,Baseline>={
 DEF:{rating:6.6,goalImpact:Math.tanh(.15),channels:{DEF:45,MID:18,FWD:6}},
 MID:{rating:6.9,goalImpact:Math.tanh(.35),channels:{DEF:28,MID:34,FWD:13}},
 FWD:{rating:7.1,goalImpact:Math.tanh(.65),channels:{DEF:18,MID:25,FWD:30}},
};
const average=(s:PlayerStats)=>s.ratingCount?s.ratingSum/s.ratingCount:0;
const majorLeagueCountries=new Set(['영국','스페인','독일','이탈리아','프랑스']);
export const majorSeniorLeague=(league:League)=>league.tier===1&&majorLeagueCountries.has(league.country);

/** Full-season evidence used by voting and valuation. Each stint keeps the
 * strength of the league in which its minutes were actually played. */
export function leagueSeasonImpact(position:Position,leagueId:string,s:PlayerStats):number{
 const sample=clamp((s.minutes-900)/1800,0,1)*clamp(s.apps/24,0,1);
 if(!sample||!s.ratingCount)return 0;
 const league=getLeague(leagueId);
 if(league.tier!==1)return 0;
 const games=s.minutes/90,per90=(value:number)=>value/games;
 const ramp=(value:number,start:number,range:number)=>clamp((value-start)/range,0,1);
 const role=awardPositionGroup(position),rating=ramp(average(s),7,1.25);
 let form:number;
 if(role==='GK'){
  const faced=s.shotsFaced??s.saves+s.goalsConceded;
  const stopping=ramp(s.saves/Math.max(1,faced),.68,.14)*clamp(per90(faced)/2.2,0,1);
  form=.7*stopping+.3*ramp(s.cleanSheets/Math.max(1,s.apps),.32,.33);
 }else if(role==='DEF'){
  const defensive=per90(s.tackles+s.interceptions+(s.aerialWon??0)*.4+(s.pressureRecoveries??0)*.35);
  form=.8*ramp(defensive,4.7,3.2)+.2*ramp(s.cleanSheets/Math.max(1,s.apps),.30,.30);
 }else if(role==='MID'){
  const creation=per90(s.goals+.9*s.assists+.14*Math.max(0,(s.keyPasses??0)-s.assists)+.025*(s.progressivePasses??0));
  form=ramp(creation,.52,.72);
 }else{
  const production=per90(s.goals-.45*(s.penaltyGoals??0)+s.assists*.75);
  form=ramp(production,position==='ST'||position==='CF'?.66:.60,.60);
 }
 return sample*form*(.7+.3*rating)*(majorSeniorLeague(league)?1:.48);
}
// Match ratings are bounded at ten. Subtracting an unlimited linear production
// component penalised prolific seasons after the observed rating had saturated.
// Compress only this background comparison; actual production stays explicit.
const goalImpact=(s:PlayerStats)=>Math.tanh((s.goals*.95+s.assists*.65)/Math.max(1,s.ratingCount));
const diminishing=(n:number,threshold:number)=>n<=threshold?n:threshold+Math.log1p(n-threshold);
export function performanceChannels(s:PlayerStats):Channels{
 const games=Math.max(1,s.minutes/90),rate=(n:number,target:number)=>diminishing(Math.max(0,n/games/target),2.5),coverage=clamp((s.actionMinutes??0)/Math.max(1,s.minutes),0,1);
 const progressive=s.progressivePasses??0,ordinary=Math.max(0,s.passesCompleted-progressive),passing=s.passesCompleted/Math.max(1,s.passes);
 const buildup=passing*(8*(1-coverage)+rate(ordinary,35)*4*coverage)+rate(progressive,5)*8;
 return {
  FWD:rate(s.goals,.52)*32,
  MID:rate(s.assists,.22)*18+rate(Math.max(0,(s.keyPasses??0)-s.assists-Math.max(0,(s.bigChancesCreated??0)-(s.bigChanceAssists??0)))+Math.max(0,(s.bigChancesCreated??0)-(s.bigChanceAssists??0))*1.55,1.6)*10+buildup+rate(s.dribblesCompleted??0,2)*6,
  DEF:rate(s.tackles+s.interceptions+(s.pressureRecoveries??0)+Math.max(0,(s.pressingWins??0)-(s.pressingSuccesses??0))*1.2+Math.max(0,(s.pressingSuccesses??0)-(s.pressureRecoveries??0))*.25,4+2.5*coverage)*25+rate(s.aerialWon??0,2.3)*7+s.cleanSheets/Math.max(1,s.apps)*22,
 };
}
const median=(values:number[])=>{values.sort((a,b)=>a-b);const m=Math.floor(values.length/2);return values.length%2?values[m]:(values[m-1]+values[m])/2;};
/** One linear collection plus three small role distributions, once per judging
 * context. This never scans a world or career for each award candidate. */
export function performanceBaselines(rows:Row[],minimum=900):PerformanceBaselines{
 const groups=new Map<PerformanceRole,{stats:PlayerStats;channels:Channels}[]>();
 for(const r of rows){const role=awardPositionGroup(r.position);if(role==='GK'||r.stats.minutes<minimum||r.stats.apps<1)continue;const group=groups.get(role)??[];group.push({stats:r.stats,channels:performanceChannels(r.stats)});groups.set(role,group);}
 const out:PerformanceBaselines={};
 for(const [role,group]of groups)if(group.length>=5)out[role]={rating:median(group.map(r=>average(r.stats))),goalImpact:median(group.map(r=>goalImpact(r.stats))),channels:Object.fromEntries(roles.map(key=>[key,Math.max(8,median(group.map(r=>r.channels[key])))])) as Channels};
 return out;
}
/** Absolute contribution and excellence among actual position peers both count.
 * A winger can lead with defending, a defender with finishing or progression.
 * We select one primary contribution, adding only bounded complementary work. */
export function evaluateFieldPerformance(row:Row,baselines:PerformanceBaselines={}):{value:number;role:PerformanceRole}{
 const nominal=awardPositionGroup(row.position);if(nominal==='GK'||row.stats.apps<1||row.stats.minutes<1)return {value:0,role:'DEF'};
 const s=row.stats,channels=performanceChannels(s),peers=baselines[nominal]??defaults[nominal],rating=average(s)-goalImpact(s);
 // Absolute functional excellence keeps growing; unusualness versus the nominal
 // position retains its old bound and cannot by itself dominate world voting.
 const relative=(role:PerformanceRole)=>{const actual=baselines[role]??defaults[role];return (diminishing(Math.max(0,channels[role]/Math.max(8,actual.channels[role])),2.2)+clamp(channels[role]/Math.max(8,peers.channels[role]),0,2.2))*.5;};
 let best={value:-Infinity,role:nominal as PerformanceRole};
 for(const role of roles){
  const level=baselines[role]??defaults[role],common=Math.max(0,rating-(level.rating-level.goalImpact-1.8))*17+(s.mom??0)*.7;
  const complement=Math.min(6,Math.max(0,...roles.filter(r=>r!==role).map(r=>relative(r)-1))*4);
  const value=common+relative(role)*32+complement;
  if(value>best.value)best={value,role};
 }
 return best;
}
