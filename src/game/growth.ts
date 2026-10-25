import { FIELD_ATTRIBUTES,GK_ATTRIBUTES,POSITION_ATTRIBUTES,overall } from './attributes';
import { clamp,round,seededRandom } from './math';
import type { AttributeKey,Career,PlayerStats,Talent } from './types';
import type { GrowthCause,GrowthLedger } from './revision-types';
import { growthAgeFactor } from './talent';
import {attributeCap} from './play-skills';

const GROWTH:Record<Talent,number>={D:.055,C:.075,B:.105,A:.14,S:.18,SS:.215,SSS:.25};
export function trainingQuality(career:Career):number {
  const club=career.systems?.world.clubs[career.player.clubId];
  if(!club)return .9;
  // Financial capacity and actual squad depth approximate the available training environment.
  return round(clamp(.72+Math.log10(Math.max(250_000,club.revenue)/250_000)*.09+club.depth*.001,.75,1.2));
}
export function beginGrowthSeason(career:Career,legacy=false):void {
  if(!career.systems)return;
  career.systems.growthLedger={year:career.season.year,baselineAttributes:{...career.player.attributes},trackedFromRound:career.season.week,byCause:{training:{},experience:{},development:{},injury:{},aging:{}},injuredRounds:0,trainingQuality:trainingQuality(career),legacy};
}
export function ensureGrowthTracking(career:Career):GrowthLedger {
  if(!career.systems)throw new Error('성장 기록을 초기화할 수 없습니다.');
  if(!career.systems.growthLedger||career.systems.growthLedger.year!==career.season.year)beginGrowthSeason(career,career.season.week>0);
  return career.systems.growthLedger!;
}
function apply(career:Career,key:AttributeKey,amount:number,cause:GrowthCause):void {
  // Manual aging is an explicit user adjustment; automatic changes still honor locks.
  if(cause!=='aging'&&cause!=='skillChange'&&career.systems?.attributeLocks?.includes(key))return;
  if((cause==='training'||cause==='experience'||cause==='development')&&!career.training.includes(key))return;
  const current=career.player.attributes[key];if(current===undefined)return;
  const next=round(clamp(current+amount,0,attributeCap(career.player,key))),change=round(next-current);
  if(!change)return;
  career.player.attributes[key]=next;
  const ledger=ensureGrowthTracking(career),row=ledger.byCause[cause]??(ledger.byCause[cause]={});row[key]=round((row[key]??0)+change);
}
/** Explicit removal ends excess mastery; its former value remains in the skill-change ledger. */
export function removeSkillMastery(career:Career,key:AttributeKey):void{const value=career.player.attributes[key]??0;if(value>100)apply(career,key,100-value,'skillChange');}
function growthCeiling(c:Career,key:AttributeKey):number{
 const p=c.player,ordinary=p.playSkills?.length?overall({...p,playSkills:[]}):p.ovr,normal=ordinary>=p.potential?0:clamp((p.potential-ordinary+4)/12,.025,1.15);
 if(!p.playSkills?.includes(key))return normal;
 // Learned mastery is separate from ordinary potential; talent and age still govern its pace.
 const aptitude:Record<Talent,number>={D:.002,C:.004,B:.006,A:.009,S:.015,SS:.045,SSS:.12};
 const mastery=aptitude[p.talent]*clamp((110-(p.attributes[key]??0)+4)/12,.35,1.15);
 return (p.attributes[key]??0)<100?Math.max(normal,mastery):mastery;
}
export function increaseAttribute(career:Career,key:AttributeKey,amount:number):void{
  apply(career,key,amount,'cheat');career.player.ovr=overall(career.player);
  career.player.potential=Math.min(100,Math.max(career.player.potential,career.player.ovr));
}
function cappedGain(career:Career,key:AttributeKey,amount:number,cause:'experience'|'development',cap:number):void {
  const prior=ensureGrowthTracking(career).byCause[cause][key]??0;
  apply(career,key,Math.min(Math.max(0,cap-prior),amount),cause);
}
export function trainRound(career:Career):void {
  const p=career.player,ledger=ensureGrowthTracking(career);
  const injured=p.injuryWeeks>0;if(injured)ledger.injuredRounds++;
  ledger.trainingQuality=trainingQuality(career);
  if(career.intensity==='rest'){p.fitness=clamp(p.fitness+27,0,100);p.morale=clamp(p.morale+1,0,100);return;}
  const rng=seededRandom(`${career.seed}|training|${career.season.year}|${career.season.week}`);
  const age=growthAgeFactor(p);
  const availability=injured?.2:1;
  const exposure=.8+.2*clamp(career.season.playerStats.minutes/Math.max(90,(career.season.week-1)*75),0,1);
  for(const key of career.training)apply(career,key,GROWTH[p.talent]*(38/career.season.totalWeeks)*age*growthCeiling(career,key)*(career.intensity==='intense'?1.32:1)*availability*ledger.trainingQuality*exposure*(.8+rng()*.4),'training');
  // Maturation can only affect mental attributes explicitly selected for this season.
  if(p.age<=24&&career.season.week%(p.age<=18?3:6)===0&&!injured){
    const mental=(['decisions','concentration','teamwork'] as AttributeKey[]).filter(k=>p.attributes[k]!==undefined&&career.training.includes(k)).slice(0,2);
    for(const key of mental)cappedGain(career,key,.01,'development',p.age<=18?.12:.06);
  }
  // A long layoff can modestly reduce physical sharpness, recorded separately from missed training.
  if(p.injuryWeeks>=3)for(const key of (p.position==='GK'?['gkReflexes','gkOneOnOnes']:['stamina','speed']) as AttributeKey[]){
    const previous=Math.abs(ledger.byCause.injury[key]??0);apply(career,key,-Math.min(.01,Math.max(0,.2-previous)),'injury');
  }
  p.ovr=overall(p);p.fitness=clamp(p.fitness+(career.intensity==='intense'?10:19),0,100);
}
export function applyMatchExperience(career:Career,stats:PlayerStats):void {
  if(!career.training.length||!stats.apps||!stats.minutes)return;
  const p=career.player,allowed=p.position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES,weights=new Map<AttributeKey,number>();
  // Match learning follows position and actions, not a blanket boost to every skill.
  for(const key of allowed)weights.set(key,.18);
  for(const [index,key] of POSITION_ATTRIBUTES[p.position].entries())weights.set(key,.8-index*.035);
  const add=(key:AttributeKey,value:number)=>{if(allowed.includes(key))weights.set(key,Math.min(1.4,(weights.get(key)??.15)+value));};
  if(stats.passesCompleted>=10)add(p.position==='GK'?'gkDistribution':'passing',.45);
  if((stats.keyPasses??0)>0)add('vision',.5);
  if(stats.tackles+stats.interceptions>=2){add('defending',.5);add('anticipation',.35);}
  if((stats.dribblesCompleted??0)>=2){add('ballControl',.4);add('dribbling',.45);}
  if(stats.shotsOnTarget>0){add('shooting',.45);add('composure',.35);}
  if(stats.saves>0){add('gkShotStopping',.45);add('gkReflexes',.35);add('gkPositioning',.3);}
  if(stats.minutes>=60){add('stamina',.2);add('decisions',.25);}
  const talent:Record<Talent,number>={D:.45,C:.58,B:.74,A:.9,S:1.15,SS:1.35,SSS:1.55};
  const age=growthAgeFactor(p);
  const rating=stats.ratingCount?stats.ratingSum/stats.ratingCount:6.5,form=clamp(.85+(rating-6.5)*.16,.55,1.25);
  const base=.20*(38/career.season.totalWeeks)*Math.min(1,stats.minutes/90)*age*talent[p.talent]*trainingQuality(career)*form;
  const cap=(p.age<=18?6:5.2)*Math.min(1,age)*talent[p.talent];
  for(const [key,weight] of weights)if(career.training.includes(key))cappedGain(career,key,base*weight*growthCeiling(career,key),'experience',cap*weight);
  p.ovr=overall(p);
}
export function roleGrowthDescription(career:Career):string {
  return `${career.player.position} · ${POSITION_ATTRIBUTES[career.player.position].slice(0,3).join(', ')}`;
}

export function applyManualAging(career:Career,amount:number,key:AttributeKey):void{apply(career,key,-amount,'aging');career.player.ovr=overall(career.player);}
