import { getClub,getLeague } from './data';
import { clamp,round } from './math';
import type { Career } from './types';
export interface ScoutReport {clubId:string;score:number;currentAbility:number;projectedAbility:number;need:number;interest:boolean;offerEligible:boolean;reason:string;}
const group=(p:string)=>p==='GK'?'GK':/^(CB|LB|RB|LWB|RWB)$/.test(p)?'DEF':/^(CDM|CM|CAM|LM|RM)$/.test(p)?'MID':'FWD';
export function scoutingProfile(c:Career){
 const p=c.player,hist=[...c.history.filter(h=>h.year<c.season.year).slice(-2).map(h=>({stats:h.stats,leagueId:h.leagueId,growth:h.ovrEnd-h.ovrStart,youth:h.squad==='youth'})),{stats:c.season.playerStats,leagueId:c.season.leagueId,growth:p.ovr-c.season.ovrStart,youth:p.squad==='youth'}];
 let performance=0,minutes=0,consistency=0;
 for(const [index,h] of hist.entries()){
  const s=h.stats,exposure=clamp(s.minutes/1800,0,1),rating=s.ratingCount?s.ratingSum/s.ratingCount:6.5,per90=(n:number)=>s.minutes?n*90/s.minutes:0;
  const role=group(p.position),impact=role==='GK'?clamp((s.saves/Math.max(1,s.shotsFaced??s.saves+s.goalsConceded)-.55)*10+s.cleanSheets/Math.max(1,s.apps)*2,0,4):role==='DEF'?clamp(per90(s.tackles+s.interceptions)/2+s.cleanSheets/Math.max(1,s.apps),0,4):role==='MID'?clamp(per90(s.goals+s.assists)*3+per90(s.keyPasses??0)*.4,0,4):clamp(per90(s.goals+s.assists*.7)*5,0,5);
  const weight=(index+1)/hist.length,level=(h.youth ? .5 : 1)/Math.sqrt(getLeague(h.leagueId).tier);
  performance+=(clamp((rating-6.5)*2,0,3)+impact+clamp(h.growth,0,4)*.25)*exposure*weight*level;
  if(!h.youth&&s.minutes>=1200&&rating>=6.8)consistency++;
  minutes+=s.minutes;
 }
 const honors=Math.min(1,c.awards.filter(a=>a.year>=c.season.year-2&&a.category!=='team'&&a.category!=='national-team').length*.2);
 const actual=clamp(performance+honors,0,7),upside=p.age<=23?Math.min(7,Math.max(0,p.potential-p.ovr)*.20):p.age<=26?Math.min(3,Math.max(0,p.potential-p.ovr)*.10):0;
 const proof=clamp(consistency-1,0,2),projected=round(p.ovr+upside+actual+proof,1);
 return {current:p.ovr,projected,performance:actual,upside,consistency,minutes};
}
export function scoutingReports(c:Career):ScoutReport[]{
 const w=c.systems?.world;if(!w||c.stage==='retired')return [];
 const p=c.player,a=scoutingProfile(c),source=getLeague(c.season.leagueId),own=w.clubs[p.clubId];
 return Object.values(w.clubs).filter(club=>club.id!==p.clubId).map(club=>{
  const candidates=club.rosterIds.map(id=>w.players[id]).filter(row=>row&&group(row.position)===group(p.position)).sort((a,b)=>b.ovr-a.ovr);
  const positionLevel=candidates.slice(0,p.position==='GK'?1:3).reduce((sum,row)=>sum+row.ovr,0)/Math.max(1,Math.min(candidates.length,p.position==='GK'?1:3));
  const need=clamp((a.projected-positionLevel+4)/12,0,1),gap=club.power-p.ovr;
  const interest=gap<=Math.min(19,a.projected-p.ovr+5)&&gap>=-18;
  const offerEligible=interest&&need>=.2&&gap<=Math.min(15,a.projected-p.ovr+1)&&(gap<=5||p.age<=24&&a.minutes>=900||a.consistency>=2);
  const league=getLeague(club.leagueId),step=source.country===league.country&&league.tier<source.tier?7:0;
  const score=round(need*10-Math.abs(club.power-(p.ovr+(a.projected-p.ovr)*.6))*.7+step+clamp(club.power-(own?.power??p.ovr),0,15)*.25,2);
  return {clubId:club.id,score,currentAbility:p.ovr,projectedAbility:a.projected,need,interest,offerEligible,reason:`현재 OVR ${p.ovr} · 잠재력 ${p.potential} · 최근 ${Math.min(3,c.history.length+1)}시즌 실전 ${a.minutes}분 · 경기력/성장 평가 ${a.projected}. ${getClub(club.id).name} 포지션 경쟁 ${positionLevel.toFixed(1)} · ${offerEligible?'실력·성장 가능성과 포지션 수요가 맞는 영입 검토':'관심 관찰 · 실제 제안은 출전 수준·수요·예산을 추가 검토'}`};
 }).filter(row=>row.interest).sort((a,b)=>b.score-a.score||a.clubId.localeCompare(b.clubId));
}
