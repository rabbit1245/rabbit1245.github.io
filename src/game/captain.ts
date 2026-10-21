import { getClub } from './data';
import { clamp,round,sumStats } from './math';
import { normalizeNationality } from './national-data';
import type { Career,MatchRecord,PlayerStats } from './types';
import type { CaptainAssessment,CaptainOffer } from './revision-types';

type Scope='club'|'national';
const roleRank={none:0,vice:1,captain:2};
const average=(s:PlayerStats)=>s.ratingCount?s.ratingSum/s.ratingCount:0;
function records(c:Career,scope:Scope):MatchRecord[]{
  const n=c.systems!.national,team=scope==='club'?c.player.clubId:`NAT:${n.country}:${n.squad}`;
  const source=scope==='club'?[...c.history.flatMap(h=>h.matches),...c.season.matches]:[...n.history.flatMap(h=>h.matches),...n.matches];
  return [...new Map(source.map(m=>[m.id,m])).values()].filter(m=>m.playerPlayed&&m.playerStats.apps>0&&(scope==='club'?m.playerClubId===team:m.playerClubId===team));
}
/** Compare a player's real team role and performances with that team's actual squad. */
export function getCaptainAssessment(c:Career,scope:Scope):CaptainAssessment{
  const p=c.player,l=c.systems!.leadership,n=c.systems!.national,world=c.systems!.world;
  const junior=scope==='club'?p.squad==='youth':n.squad==='U20',teamId=scope==='club'?p.clubId:`NAT:${n.country}:${n.squad}`;
  const peers=Object.values(world.players).filter(w=>w.id!==p.id&&(scope==='club'?w.clubId===p.clubId:normalizeNationality(w.nationality)===normalizeNationality(n.country))&&(scope==='national'?(junior?w.age<=20:w.age>20):!junior||w.age<=21));
  const strongest=[...peers].sort((a,b)=>b.ovr-a.ovr).slice(0,11);
  const squadOvr=strongest.length?strongest.reduce((sum,w)=>sum+w.ovr,0)/strongest.length:scope==='club'?(world.clubs[p.clubId]?.power??getClub(p.clubId).power):65;
  const teamPower=scope==='club'&&!junior?world.clubs[p.clubId]?.power??squadOvr:squadOvr;
  const all=records(c,scope),recent=all.slice(-12),stats=sumStats(recent.map(m=>m.playerStats));
  const tenure=scope==='club'?Math.max(0,c.season.year-l.clubSinceYear):Math.max(0,new Set(all.map(m=>m.seasonYear)).size-1);
  const trust=scope==='club'?c.managerTrust:n.reputation,rating=average(stats);
  const abilityRank=1+peers.filter(w=>w.ovr>p.ovr).length;
  const abilityFloor=Math.max(squadOvr-7,teamPower-9),captainFloor=Math.max(squadOvr-3,teamPower-5);
  // Compare the same recorded season and weights for everyone. NPC tenure/trust
  // is not recorded, so those remain eligibility gates instead of user bonuses.
  const seasonStats=sumStats(all.filter(m=>m.seasonYear===c.season.year).map(m=>m.playerStats));
  const candidateScore=(leadership:number,ovr:number,age:number,s?:PlayerStats)=>leadership*.42+ovr*.22+clamp((age-(junior?14:19))*1.6,0,13)+(s?clamp((average(s)-6)*9,0,20)*.45+clamp(s.minutes/900,0,1)*6:0);
  const rawScore=candidateScore(l.trait,p.ovr,p.age,seasonStats),score=round(rawScore,2);
  const candidateRank=1+peers.filter(w=>{const row=world.playerStats[w.id],s=scope==='national'?row?.nationalStats:row?.stats;return candidateScore(w.leadership,w.ovr,w.age,s)>rawScore;}).length;
  const reasons:string[]=[];
  if(scope==='club'&&p.squad==='youth')reasons.push('유소년 단계에서는 성인 클럽 주장 제의를 하지 않습니다. 1군에서 실력과 출전 경력을 쌓아야 합니다.');
  if(c.stage==='retired')reasons.push('은퇴한 선수에게 새 주장단 제의를 하지 않습니다.');
  if(scope==='national'&&(n.squad!==(p.age<=20?'U20':'senior')||!all.length||n.status==='unselected'||n.status==='watchlist'))reasons.push('현재 연령대 대표팀의 실제 발탁과 꾸준한 출전이 먼저 필요합니다.');
  if(p.age<(junior?17:21))reasons.push(`${junior?'연령별 팀':'성인 팀'}의 경험 기준인 ${junior?17:21}세에 도달하지 않았습니다.`);
  if(tenure<1)reasons.push('현재 팀에서 최소 한 시즌의 근속과 동료의 신뢰가 필요합니다.');
  if(all.length<(junior?8:scope==='club'?15:8))reasons.push(`현재 팀 실제 출전 ${all.length}경기: 충분한 출전 경력이 필요합니다.`);
  if(stats.apps<(scope==='club'?6:4)||stats.minutes<(scope==='club'?360:240)||rating<6.5)reasons.push('최근 실제 출전 시간과 평균 평점 6.50 이상의 성과가 필요합니다.');
  if(p.ovr<abilityFloor||abilityRank>Math.max(11,Math.ceil((peers.length+1)*.55)))reasons.push(`팀 전력 ${round(teamPower,1)}·주전 평균 ${round(squadOvr,1)}에 맞는 실력이 필요합니다. 현재 OVR ${p.ovr}, 팀 내 ${abilityRank}위입니다.`);
  if(l.trait<(junior?58:65))reasons.push(`리더십 ${l.trait}: 주장단이 요구하는 수준에 아직 부족합니다.`);
  if(trust<65)reasons.push(`팀 신뢰 ${Math.round(trust)}%: 꾸준한 활약으로 신뢰를 더 쌓아야 합니다.`);
  if(candidateRank>2)reasons.push(`실력·성과·연령·리더십을 합친 주장단 후보 ${candidateRank}위입니다.`);
  const eligible=!reasons.length;
  const captain=eligible&&p.age>=(junior?18:24)&&tenure>=(junior?1:2)&&all.length>=(scope==='club'?junior?16:40:16)&&l.trait>=(junior?68:75)&&p.ovr>=captainFloor&&rating>=6.8&&candidateRank===1;
  const eligibleRole=captain?'captain':eligible?'vice':'none';
  if(eligible)reasons.push(`현재 팀 주전 수준의 실력과 최근 평점 ${rating.toFixed(2)}, ${p.age}세·리더십 ${l.trait}·근속 ${tenure}시즌을 종합해 ${captain?'주장':'부주장'} 후보로 평가했습니다.`);
  return {scope,teamId,eligibleRole,teamPower:round(teamPower,1),squadOvr:round(squadOvr,1),playerOvr:p.ovr,abilityRank,candidateRank,age:p.age,leadership:l.trait,tenure,apps:all.length,recentApps:stats.apps,recentMinutes:stats.minutes,rating:round(rating,2),trust:round(trust,2),score,reasons};
}
export function expireCaptainOffers(c:Career,scope?:Scope):void{
  for(const offer of c.systems?.leadership.offers??[])if(offer.status==='pending'&&(!scope||offer.scope===scope)){offer.status='expired';offer.answeredYear=c.season.year;offer.answeredRound=c.season.week;}
}
export function proposeCaptainOffer(c:Career,scope:Scope):CaptainAssessment{
  const l=c.systems!.leadership,a=getCaptainAssessment(c,scope),key=scope==='club'?'clubRole':'nationalRole';
  l.offers??=[];
  for(const offer of l.offers)if(offer.status==='pending'&&offer.scope===scope&&(offer.teamId!==a.teamId||offer.year<c.season.year||a.eligibleRole==='none')){offer.status='expired';offer.answeredYear=c.season.year;offer.answeredRound=c.season.week;}
  if(a.eligibleRole==='none'||roleRank[l[key]]>=roleRank[a.eligibleRole]||l.offers.some(o=>o.scope===scope&&o.teamId===a.teamId&&o.year===c.season.year))return a;
  const offer:CaptainOffer={id:`captain-offer:${scope}:${a.teamId}:${c.season.year}`,scope,teamId:a.teamId,role:a.eligibleRole,year:c.season.year,round:c.season.week,status:'pending',reason:a.reasons.join(' '),assessment:structuredClone(a)};
  l.offers.push(offer);
  c.systems!.events.push({id:offer.id,year:c.season.year,round:c.season.week,type:'captain',title:`${scope==='club'?'클럽':'국가대표'} ${offer.role==='captain'?'주장':'부주장'} 제의`,body:`선수 → 주장에서 수락하거나 거절할 수 있습니다. ${offer.reason}`,importance:'milestone'});
  return a;
}
export function answerCaptainOffer(c:Career,id:string,accept:boolean):void{
  const l=c.systems!.leadership,offer=l.offers?.find(o=>o.id===id);
  if(!offer||offer.status!=='pending')throw new Error('응답할 수 있는 주장 제의가 아닙니다.');
  if(!accept){offer.status='declined';offer.answeredYear=c.season.year;offer.answeredRound=c.season.week;return;}
  const a=getCaptainAssessment(c,offer.scope);
  if(c.stage==='retired'||offer.teamId!==a.teamId||offer.year!==c.season.year||a.eligibleRole==='none'||roleRank[a.eligibleRole]<roleRank[offer.role])throw new Error('현재 소속과 평가에 맞지 않는 주장 제의입니다.');
  offer.status='accepted';offer.answeredYear=c.season.year;offer.answeredRound=c.season.week;
  const key=offer.scope==='club'?'clubRole':'nationalRole',round=offer.scope==='club'?c.season.week:records(c,'national').filter(m=>m.seasonYear===c.season.year).length;
  for(const t of l.terms)if(t.scope===offer.scope&&t.role!=='match'&&t.endYear===undefined){t.endYear=c.season.year;t.endRound=round;}
  l[key]=offer.role;l.reason=offer.reason;
  l.terms.push({scope:offer.scope,teamId:offer.teamId,role:offer.role,startYear:c.season.year,startRound:round,apps:0,reason:`제의 수락 · ${offer.reason}`});
  c.systems!.events.push({id:`${offer.id}:accepted`,year:c.season.year,round:c.season.week,type:'captain',title:`${offer.scope==='club'?'클럽':'국가대표'} ${offer.role==='captain'?'주장':'부주장'} 수락`,body:offer.reason,importance:'milestone'});
}
