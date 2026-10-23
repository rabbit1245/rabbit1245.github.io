import {getClub} from './data';
import {sumStats,ALL_STATS} from './math';
import type {Career,MatchRecord} from './types';
const check=(v:unknown,label:string)=>{if(!v)throw new Error(`저장 데이터 오류: ${label}`);};
const num=(v:unknown,min=0,max=1e9)=>check(typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max,'대회/수동 노화 수치');
export function validateCompetitionData(c:Career,validateMatches:(rows:MatchRecord[])=>void,validateStats:(value:unknown)=>void=()=>{}){
 const state=c.systems?.clubCompetitions;
 if(state!==undefined){check(state&&state.version===1&&state.year===c.season.year&&Array.isArray(state.current)&&Array.isArray(state.history),'클럽 대회 상태');const ids=new Set<string>();
  for(const t of [...state.history,...state.current]){
   check(t&&typeof t.id==='string'&&typeof t.name==='string'&&!ids.has(t.id),'대회 ID');ids.add(t.id);num(t.year,1900,2500);check(['cup','leagueCup','continental'].includes(t.kind)&&['league','knockout','completed'].includes(t.phase),'대회 종류/진행');
   check(Array.isArray(t.entrants)&&t.entrants.length>=2&&t.entrants.length<=128&&new Set(t.entrants).size===t.entrants.length,'대회 참가 구단');for(const id of t.entrants)getClub(id);
   check(Array.isArray(t.fixtures)&&t.fixtures.length<=2500&&Array.isArray(t.matches)&&Array.isArray(t.active)&&Array.isArray(t.byes),'대회 일정');
   const fixtures=new Map(t.fixtures.map(f=>[f.id,f]));check(fixtures.size===t.fixtures.length,'중복 대회 일정');
   for(const f of t.fixtures){check(t.entrants.includes(f.homeId)&&t.entrants.includes(f.awayId)&&f.homeId!==f.awayId&&typeof f.played==='boolean','대회 경기 구단');num(f.step,1,64);num(f.leg,1,2);if(f.played){num(f.homeGoals,0,50);num(f.awayGoals,0,50);check(typeof f.date==='string'&&Number.isFinite(Date.parse(f.date)),'대회 경기일');}if(f.winnerId)check(f.played&&[f.homeId,f.awayId].includes(f.winnerId),'대회 경기 승자');}
   validateMatches(t.matches);
   for(const m of t.matches){const f=fixtures.get(m.fixtureId);check(f?.played&&m.competitionId===t.id&&m.seasonYear===t.year&&f.homeId===m.homeId&&f.awayId===m.awayId&&f.homeGoals===m.homeGoals&&f.awayGoals===m.awayGoals,'컵 경기 원장/일정');if(m.aggregate){const tie=t.fixtures.filter(x=>x.tieId===f!.tieId);check(tie.every(x=>x.played),'합계 미완료');const home=tie.reduce((n,x)=>n+(x.homeId===m.homeId?x.homeGoals!:x.awayGoals!),0),away=tie.reduce((n,x)=>n+(x.homeId===m.awayId?x.homeGoals!:x.awayGoals!),0);check(m.aggregate.home===home&&m.aggregate.away===away,'홈·원정 합산 점수');}}
   if(t.phase==='completed')check(t.winnerId&&t.entrants.includes(t.winnerId)&&t.fixtures.some(f=>f.stage==='결승'&&f.played&&f.winnerId===t.winnerId)&&t.fixtures.every(f=>f.played),'미경기 대회 우승');
   if(t.playerStats!==undefined){check(t.playerStats&&typeof t.playerStats==='object'&&!Array.isArray(t.playerStats),'컵 선수 집계');for(const [id,p] of Object.entries(t.playerStats)){check(p.playerId===id&&typeof p.name==='string'&&t.entrants.includes(p.clubId),'컵 집계 선수');validateStats(p.stats);}
    const all=sumStats(Object.values(t.playerStats).map(p=>p.stats)),goals=t.fixtures.filter(f=>f.played).reduce((n,f)=>n+f.homeGoals!+f.awayGoals!,0);check(all.goals===goals&&all.assists<=goals,'컵 득점·도움과 경기 점수');
   }
   check(Array.isArray(t.table)&&t.table.length===t.entrants.length&&new Set(t.table.map(r=>r.clubId)).size===t.entrants.length,'컵 순위표');
   check(t.active.every(id=>t.entrants.includes(id))&&t.byes.every(id=>t.active.includes(id)),'컵 진출/부전승');
   for(const r of t.table){check(t.entrants.includes(r.clubId),'컵 순위 구단');for(const key of ['played','won','drawn','lost','goalsFor','goalsAgainst','points'] as const)num(r[key],0,10000);check(r.played===r.won+r.drawn+r.lost&&r.points===r.won*3+r.drawn,'컵 순위 지표');}
   if(t.playerStats?.[c.player.id]){const actual=sumStats(t.matches.map(m=>m.playerStats));for(const k of ALL_STATS)check(Math.abs((actual[k]??0)-(t.playerStats[c.player.id].stats[k]??0))<.01,'컵 개인 지표 집계');}
  }
 }
 if(c.systems?.manualAging!==undefined){check(Array.isArray(c.systems.manualAging),'수동 노화 이력');const ids=new Set();for(const a of c.systems.manualAging){check(!ids.has(a.id)&&[1,5,10].includes(a.amount)&&Number.isFinite(Date.parse(a.date)),'수동 노화 적용');ids.add(a.id);if(a.playerId!==undefined)check(a.playerId===c.player.id&&typeof a.playerName==='string','수동 노화 선수');num(a.year,1900,2500);num(a.ovrBefore,1,100);num(a.ovrAfter,1,100);check(Object.keys(a.before).sort().join()===Object.keys(a.after).sort().join(),'수동 노화 능력치');for(const key of Object.keys(a.before) as (keyof typeof a.before)[]){num(a.before[key],0,100);num(a.after[key],0,100);check(Math.abs(a.after[key]!-Math.max(0,a.before[key]!-a.amount))<.011,'수동 노화 감소량');}}}
 for(const club of Object.values(c.systems?.world.clubs??{}))if(club.development?.investmentPower!==undefined)num(club.development.investmentPower,0,6);
 for(const r of c.systems?.rankings??[])if(r.diagnostics!==undefined){check(Array.isArray(r.diagnostics)&&r.diagnostics.length<=100,'수상 진단');for(const d of r.diagnostics)check(typeof d.name==='string'&&typeof d.scope==='string'&&typeof d.result==='string'&&typeof d.detail==='string'&&typeof d.eligible==='boolean','수상 진단 항목');}
 const n=c.systems?.national;if(n?.formatVersion!==undefined)check(n.formatVersion===2,'대표팀 일정 버전');
 if(n?.schedule!==undefined){check(Array.isArray(n.schedule)&&n.schedule.length<=10000&&new Set(n.schedule.map(f=>f.id)).size===n.schedule.length,'대표팀 편성 일정');for(const f of n.schedule)check(typeof f.id==='string'&&Number.isFinite(Date.parse(f.date))&&[f.homeId,f.awayId].includes(`NAT:${n.country}:${f.squad}`)&&f.homeId!==f.awayId&&['senior','U20'].includes(f.squad),'대표팀 편성 경기');}
 for(const [competitionId,map] of Object.entries(n?.tournamentStats??{})){const own=map[c.player.id];if(own){const games=[...new Map([...(n?.history.flatMap(h=>h.matches)??[]),...(n?.matches??[])].filter(m=>m.competitionId===competitionId&&!m.fixtureId.includes('|qualifying|')&&!m.fixtureId.includes('|friendly|')).map(m=>[m.fixtureId,m])).values()],actual=sumStats(games.map(m=>m.playerStats));for(const key of ALL_STATS)check(Math.abs((actual[key]??0)-(own.stats[key]??0))<.011,'대표팀 본선 개인 집계');}}
 for(const map of Object.values(n?.tournamentStats??{}))for(const [id,p] of Object.entries(map)){check(p.id===id&&typeof p.name==='string','대표팀 본선 집계');validateStats(p.stats);}
 for(const draws of Object.values(n?.finalDraws??{})){check(Array.isArray(draws.groups)&&new Set(draws.groups.flat()).size===draws.size&&[8,10,16,24,48].includes(draws.size),'대표팀 본선 추첨');}
 for(const rounds of Object.values(n?.windowQualifiers??{}))check(Array.isArray(rounds)&&new Set(rounds).size===rounds.length&&rounds.every(r=>Number.isInteger(r)&&r>=0&&r<6),'대표팀 예선 일정 라운드');
 for(const m of [...(n?.matches??[]),...(n?.history.flatMap(h=>h.matches)??[])])if(m.nationalSelection){const s=m.nationalSelection;check(typeof s.called==='boolean'&&typeof s.reason==='string'&&['starter','substitute','bench','excluded'].includes(s.role)&&m.playerStarted===(s.role==='starter')&&m.playerPlayed===['starter','substitute'].includes(s.role)&&s.called===(s.role!=='excluded'),'대표팀 선발/출전 상태');}
 for(const draws of Object.values(n?.qualifyingDraws??{})){check([1,2].includes(draws.legs)&&Array.isArray(draws.groups),'대표팀 예선 추첨');const ids=draws.groups.flat();check(new Set(ids).size===ids.length&&ids.every(id=>typeof id==='string'),'대표팀 예선 국가 중복');}
}
