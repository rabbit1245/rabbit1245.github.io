import { FIELD_ATTRIBUTES,GK_ATTRIBUTES,POSITION_ATTRIBUTES,overall } from './attributes';
import { clamp,round,seededRandom } from './math';
import type { AttributeKey,Career,PlayerStats,Talent } from './types';
import type { GrowthCause,GrowthLedger } from './revision-types';

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
  const current=career.player.attributes[key];if(current===undefined)return;
  const next=round(clamp(current+amount,1,100)),change=round(next-current);
  if(!change)return;
  career.player.attributes[key]=next;
  const ledger=ensureGrowthTracking(career),row=ledger.byCause[cause];row[key]=round((row[key]??0)+change);
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
  const age=p.age<=18?1.5:p.age<=22?1.25:p.age<=26?1:p.age<=30?.6:p.age<=34?.28:.12;
  const ceiling=clamp((p.potential-p.ovr)/18,.025,1.1),availability=injured?.2:1;
  const exposure=.8+.2*clamp(career.season.playerStats.minutes/Math.max(90,(career.season.week-1)*75),0,1);
  for(const key of career.training)apply(career,key,GROWTH[p.talent]*(38/career.season.totalWeeks)*age*ceiling*(career.intensity==='intense'?1.32:1)*availability*ledger.trainingQuality*exposure*(.8+rng()*.4),'training');
  // Small, bounded maturation affects mental attributes; it never copies the training gain to every attribute.
  if(p.age<=24&&career.season.week%(p.age<=18?3:6)===0&&!injured){
    const mental=(['decisions','concentration','teamwork'] as AttributeKey[]).filter(k=>p.attributes[k]!==undefined&&!career.training.includes(k)).slice(0,2);
    for(const key of mental)cappedGain(career,key,.01,'development',p.age<=18?.12:.06);
  }
  // A long layoff can modestly reduce physical sharpness, recorded separately from missed training.
  if(p.injuryWeeks>=3)for(const key of (p.position==='GK'?['gkReflexes','gkOneOnOnes']:['stamina','speed']) as AttributeKey[]){
    const previous=Math.abs(ledger.byCause.injury[key]??0);apply(career,key,-Math.min(.01,Math.max(0,.2-previous)),'injury');
  }
  p.ovr=overall(p);p.fitness=clamp(p.fitness+(career.intensity==='intense'?10:19),0,100);
}
export function applyMatchExperience(career:Career,stats:PlayerStats):void {
  if(!stats.apps||!stats.minutes||career.player.age>30)return;
  const p=career.player,keys=new Set<AttributeKey>();
  if(stats.passesCompleted>=10)keys.add(p.position==='GK'?'gkDistribution':'passing');
  if((stats.keyPasses??0)>0)keys.add('vision');
  if(stats.tackles+stats.interceptions>=2){keys.add('positioning');keys.add('anticipation');}
  if((stats.dribblesCompleted??0)>=2)keys.add('ballControl');
  if(stats.shotsOnTarget>0)keys.add('composure');
  if(stats.saves>0){keys.add('gkPositioning');keys.add('concentration');}
  keys.add('decisions');
  const allowed=p.position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES;
  const ceiling=clamp((p.potential-p.ovr)/20,.05,1),age=p.age<=21?1.2:p.age<=26?1:.45;
  for(const key of [...keys].filter(k=>allowed.includes(k)).slice(0,4))cappedGain(career,key,.015*stats.minutes/90*ceiling*age,'experience',.35);
  p.ovr=overall(p);
}
export function roleGrowthDescription(career:Career):string {
  return `${career.player.position} · ${POSITION_ATTRIBUTES[career.player.position].slice(0,3).join(', ')}`;
}
