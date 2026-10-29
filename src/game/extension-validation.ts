import { getClub,getLeague } from './data';
import {POSITION_LABELS} from './attributes';
import type { Career,SeasonSummary } from './types';
import type { ClubSeasonDevelopment } from './revision-types';
import {PERSONALITY_KEYS} from './personality';
import {validateCommercial} from './commercial-validation';
function check(ok:unknown,label:string):asserts ok{if(!ok)throw new Error(`저장 데이터 오류: ${label}`);}
function num(v:unknown,label:string,min=0,max=1e15,int=false){check(typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max&&(!int||Number.isInteger(v)),label);return v;}
function starFunding(r:ClubSeasonDevelopment):number{
 const s=r.star;
 if(s){check(typeof s.playerId==='string'&&s.playerId.length>0&&typeof s.name==='string'&&s.position in POSITION_LABELS&&typeof s.retained==='boolean','핵심 선수 근거');num(s.ovr,'핵심 실력',1,120);num(s.apps,'핵심 출전',8,500,true);num(s.minutes,'핵심 시간',720,s.apps*90,true);num(s.rating,'핵심 평점',0,10);num(s.influence,'핵심 기여도',0,1);}
 if(r.starBudget===undefined)return 0;
 num(r.starBudget,'핵심 선수 예산');check(!!s?.retained,'핵심 선수 예산 근거');num(r.revenueBasis,'핵심 예산 수입 근거');
 check(r.starBudget<=Math.round(r.revenueBasis!*.07*s!.influence)+1,'핵심 선수 예산 한도');return r.starBudget;
}
function report(r:ClubSeasonDevelopment){check(r&&typeof r==='object','구단 성장 자료');num(r.year,'성장 연도',1900,2500,true);getLeague(r.leagueId);for(const k of ['rank','teams'] as const)num(r[k],k,1,128,true);check(r.rank<=r.teams,'성장 순위');if(r.expectedRank!==null)num(r.expectedRank,'기대 순위',1,r.teams,true);num(r.points,'승점',0,1000,true);for(const k of ['bonus','reinvestment'] as const)num(r[k],k);check(r.reinvestment<=r.bonus+starFunding(r),'성과 재투자 한도');for(const k of ['beforePower','afterPower','prestigeBefore','prestigeAfter'] as const)num(r[k],k,1,100);num(r.improvedPlayers,'성장 선수 수',0,500,true);num(r.recruits,'보강 수',0,10,true);if(r.userContribution){const s=r.userContribution;num(s.apps,'기여 출전',0,150,true);num(s.minutes,'기여 시간',0,s.apps*90,true);num(s.goals,'기여 득점',0,10000,true);num(s.assists,'기여 도움',0,10000,true);num(s.rating,'기여 평점',0,10);}}
function details(h:SeasonSummary){const d=h.details;if(!d)return;check(d.version===1,'시즌 상세 버전');check(Array.isArray(d.table)&&d.table.length>0&&d.table.length<=128,'보존 순위표');const ids=new Set<string>();for(const t of d.table){getClub(t.clubId);check(!ids.has(t.clubId),'보존 구단 중복');ids.add(t.clubId);for(const key of ['played','won','drawn','lost','goalsFor','goalsAgainst','points'] as const)num(t[key],`보존 ${key}`,0,100000,true);check(t.played===t.won+t.drawn+t.lost&&t.points===t.won*3+t.drawn,'보존 승무패·승점');}check(h.clubId==='FA'?h.rank===0:d.table[h.rank-1]?.clubId===h.clubId,'보존 순위 불일치');for(const attrs of [d.attributes,d.startAttributes]){check(attrs&&typeof attrs==='object','보존 능력치');for(const val of Object.values(attrs))num(val,'보존 능력치 값',0,110);}num(d.marketValue,'보존 몸값');if(d.seasonStartValue!==undefined)num(d.seasonStartValue,'시작 몸값');check(d.contract&&typeof d.contract==='object','보존 계약');getClub(d.contract.clubId);for(const k of ['wage','years','signedYear','expiresYear'] as const)num(d.contract[k],`보존 계약 ${k}`);check(typeof d.contract.role==='string','보존 계약 역할');for(const role of [d.captain.club,d.captain.national])check(['none','captain','vice'].includes(role),'보존 주장 직책');for(const rank of Object.values(d.personalRanks))if(rank!==null)num(rank,'개인 순위',1,100000,true);if(d.clubDevelopment)report(d.clubDevelopment);}
/** Optional extension fields do not initialize or rewrite legacy saves while loading. */
export function validateCareerExtensions(c:Career){
 validateCommercial(c);
 if(c.systems?.world.financeVersion!==undefined)check(c.systems.world.financeVersion===1,'재정 기준 버전');
 if(c.systems?.economics.valuationVersion!==undefined)check(c.systems.economics.valuationVersion===1,'몸값 평가 버전');
 if(c.systems?.personality!==undefined){const p=c.systems.personality;check(p!==null&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).length===5,'성향 형식');for(const key of PERSONALITY_KEYS)num(p[key],`성향 ${key}`,1,10,true);}
 if(c.systems?.growthModelVersion!==undefined)check(c.systems.growthModelVersion===2,'성장 기준 버전');
 if(c.systems?.cheats!==undefined){check(c.systems.cheats!==null&&typeof c.systems.cheats==='object'&&!Array.isArray(c.systems.cheats),'치트 설정');for(const key of ['enabled','freezeAging','used'] as const)check(typeof c.systems.cheats[key]==='boolean','치트 설정');}
 if(c.systems?.world.rosterVersion!==undefined)num(c.systems.world.rosterVersion,'선수단 자료 버전',2,2,true);
 if(c.systems?.world.balanceVersion!==undefined)check(c.systems.world.balanceVersion===1,'구단 균형 버전');

 if(c.systems?.employment!==undefined){const rows=c.systems.employment;check(Array.isArray(rows)&&rows.length<=2000,'소속 이력');let year=0;for(const r of rows){num(r.year,'소속 연도',1900,c.season.year+1,true);check(r.year>=year,'소속 이력 순서');year=r.year;num(r.totalRounds,'소속 리그 경기수',1,150,true);num(r.fromRound,'소속 시작',0,150,true);if(r.toRound!==undefined)num(r.toRound,'소속 종료',0,150,true);getClub(r.clubId);getLeague(r.leagueId);num(r.wage,'소속 급여');check(['initial','transfer','expiry','release','continued'].includes(r.reason),'소속 변경 사유');if(r.clubId==='FA')check(r.wage===0,'FA 급여');}const last=rows.at(-1);check(!!last&&last.clubId===c.player.clubId,'소속 이력과 현재 소속');}
 if(c.player.clubId==='FA')check(!!c.systems?.employment&&c.player.wage===0&&c.player.contractYears===0&&!c.systems.world.players[c.player.id]&&Object.values(c.systems.world.clubs).every(r=>!r.rosterIds.includes(c.player.id)),'FA 선수의 계약·명단');
 for(const h of c.history){details(h);for(const r of h.details?.employmentStandings??[]){getClub(r.clubId);getLeague(r.leagueId);num(r.rank,'이전 소속 순위',1,128,true);for(const k of ['played','won','drawn','lost','points'] as const)num(r[k],'이전 소속 성적',0,100000,true);check(r.played===r.won+r.drawn+r.lost&&r.points===r.won*3+r.drawn,'이전 소속 승무패');}}
 for(const club of Object.values(c.systems?.world.clubs??{})){const d=club.development;if(!d)continue;for(const k of ['basePower','prestige','baselinePower'] as const)num(d[k],`구단 ${k}`,1,100);num(d.baselineYear,'구단 기준 연도',1900,2500,true);if(d.expectedRank!==null)num(d.expectedRank,'구단 기대 순위',1,128,true);check(Array.isArray(d.history)&&d.history.length<=5,'구단 최근 성장 이력');check(new Set(d.history.map(r=>r.year)).size===d.history.length,'구단 성장 연도 중복');for(const r of d.history)report(r);}
}
