import type {Career,MatchRecord} from './types';
import type {MatchPerformance} from './revision-types';

export function matchInterval(m:MatchRecord,p:MatchPerformance):{from:number;to:number}|undefined{
 const from=p.started?0:m.events.find(e=>e.type==='substitution'&&e.playerId===p.id&&e.detail.includes('투입'))?.minute;
 return from===undefined?undefined:{from,to:from+p.minutes};
}
/** Annotate only an evidenced emergency role in the old engine. Never alter an
 * event, statistic, score, registered position or a new engine's invalid result. */
export function recoverLegacyKeeperRoles(m:MatchRecord):number{
 if(m.lineupVersion===2||m.actionVersion!==1||!Array.isArray(m.performers)||!Array.isArray(m.events))return 0;
 const actors=new Map(m.performers.map(p=>[p.id,p]));let repairs=0;
 for(const p of actors.values()){
  if(p.position==='GK'||p.emergencyGoalkeeper)continue;
  const references=m.events.filter(e=>e.action?.kind==='cross'&&e.action.keeperId===p.id);
  if(!references.length)continue;
  const span=matchInterval(m,p);if(!span)continue;
  const team=p.teamId??p.clubId;
  const keepers=m.performers.filter(q=>q.position==='GK'&&(q.teamId??q.clubId)===team).flatMap(q=>{const i=matchInterval(m,q);return i?[i]:[];});
  const boundaries=[...new Set([span.from,span.to,...keepers.flatMap(i=>[Math.max(span.from,i.from),Math.min(span.to,i.to)])])].filter(t=>t>=span.from&&t<=span.to).sort((a,b)=>a-b);
  const gaps=boundaries.slice(1).map((to,i)=>({from:boundaries[i],to})).filter(i=>i.to>i.from&&!keepers.some(k=>k.from<i.to&&k.to>i.from));
  const gap=gaps.find(i=>references.every(e=>e.minute>i.from&&e.minute<=i.to&&(e.teamId===m.homeId||e.teamId===m.awayId)&&e.teamId!==team));
  if(!gap||(p.stats.shotsFaced??0)!==p.stats.saves+p.stats.goalsConceded)continue;
  p.emergencyGoalkeeper=gap;repairs++;
 }
 return repairs;
}
/** The caller owns this JSON snapshot (or has verified its original checksum). */
export function recoverCareerKeeperRoles(c:Career):number{
 const seen=new Set<MatchRecord>();let repairs=0;
 const visit=(m:MatchRecord)=>{if(m&&typeof m==='object'&&!seen.has(m)){seen.add(m);repairs+=recoverLegacyKeeperRoles(m);}};
 for(const m of c.season?.matches??[])visit(m);
 for(const h of c.history??[])for(const m of h.matches??[])visit(m);
 const n=c.systems?.national;for(const m of n?.matches??[])visit(m);for(const m of n?.teamResults??[])visit(m);for(const h of n?.history??[])for(const m of h.matches??[])visit(m);
 const cups=c.systems?.clubCompetitions;for(const t of [...cups?.current??[],...cups?.history??[]])for(const m of t.matches??[])visit(m);
 return repairs;
}
