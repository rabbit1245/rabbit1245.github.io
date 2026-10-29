import {getClub} from './data';
import type {Career} from './types';
import type {ShirtSeason,ShirtSeller} from './commercial';
const check=(v:unknown,label:string)=>{if(!v)throw Error(`저장 데이터 오류: 유니폼 시장 · ${label}`);};
const integer=(v:number,label:string,max=1e12)=>check(Number.isSafeInteger(v)&&v>=0&&v<=max,label);
const popularity=(v:number)=>check(Number.isFinite(v)&&v>=.35&&v<=5,'클럽 인기도');
function seller(r:ShirtSeller){check(r&&typeof r.playerId==='string'&&r.playerId.length>0&&r.playerId.length<=500&&typeof r.name==='string'&&r.name.length>0&&r.name.length<=500,'판매 선수');getClub(r.clubId);integer(r.units,'선수 판매량');integer(r.rank,'판매 순위',1000000);check(r.rank>0,'판매 순위');}
function season(s:ShirtSeason,c:Career){
 integer(s.year,'집계 연도',c.season.year);check(s.year>=1900&&typeof s.completed==='boolean','집계 기간');integer(s.totalRounds,'시즌 경기 수',150);integer(s.throughRound,'집계 라운드',s.totalRounds);check(!s.completed||s.throughRound===s.totalRounds,'완료 집계 기간');
 for(const k of ['marketTotal','namedTotal','otherTotal','playerUnits','candidateCount'] as const)integer(s[k],k);
 check(s.namedTotal+s.otherTotal===s.marketTotal,'세계 총 판매량');check(s.playerUnits<=s.namedTotal,'선수 판매량 한도');
 check(s.playerRank===null||Number.isInteger(s.playerRank)&&s.playerRank>0&&s.playerRank<=s.candidateCount,'개인 세계 순위');check(s.playerUnits>0?s.playerRank!==null:s.playerRank===null,'무판매 순위');
 check(Array.isArray(s.clubs)&&s.clubs.length<=1000,'구단 시장');const ids=new Set<string>();let total=0,named=0,other=0;
 for(const r of s.clubs){getClub(r.clubId);check(!ids.has(r.clubId),'구단 중복');ids.add(r.clubId);for(const k of ['total','named','other'] as const)integer(r[k],`구단 ${k}`);check(r.named+r.other===r.total,'구단 총 판매량');popularity(r.popularity);total+=r.total;named+=r.named;other+=r.other;}
 check(total===s.marketTotal&&named===s.namedTotal&&other===s.otherTotal,'구단→세계 판매량 합계');
 check(Array.isArray(s.playerClubs)&&s.playerClubs.length<=150,'시즌 소속 판매량');let own=0;const ownIds=new Set<string>();
 for(const r of s.playerClubs){getClub(r.clubId);check(!ownIds.has(r.clubId),'소속 중복');ownIds.add(r.clubId);integer(r.units,'소속별 개인 판매량');integer(r.rank,'구단 내 순위',1000000);check(r.rank>0,'구단 내 순위');const club=s.clubs.find(t=>t.clubId===r.clubId);check(club&&r.clubTotal===club.total&&r.units<=club.named&&r.clubPopularity===club.popularity,'소속 판매량 근거');popularity(r.clubPopularity);own+=r.units;}
 check(own===s.playerUnits,'소속별→개인 판매량 합계');
 check(Array.isArray(s.leaders)&&s.leaders.length<=20&&Array.isArray(s.clubLeaders)&&s.clubLeaders.length<=500,'판매 순위표');
 const players=new Set<string>();for(let i=0;i<s.leaders.length;i++){const r=s.leaders[i];seller(r);check(r.rank===i+1&&!players.has(r.playerId)&&(!i||s.leaders[i-1].units>=r.units),'세계 순위표');players.add(r.playerId);if(r.playerId===c.player.id)check(r.units===s.playerUnits&&r.rank===s.playerRank,'본인 순위 일치');}
 for(const r of s.clubLeaders){seller(r);check(ownIds.has(r.clubId),'소속 구단 비교 선수');}
 for(const id of ownIds){const rows=s.clubLeaders.filter(r=>r.clubId===id);check(rows.reduce((n,r)=>n+r.units,0)===s.clubs.find(r=>r.clubId===id)!.named,'구단 선수 판매량 합계');const own=rows.find(r=>r.playerId===c.player.id);check(own&&own.units===s.playerClubs.find(r=>r.clubId===id)!.units,'개인 원장');}
 const e=s.evidence;check(e&&Number.isFinite(e.ability)&&e.ability>=0&&e.ability<=120&&Number.isInteger(e.stardom)&&e.stardom>=1&&e.stardom<=10,'실력·스타성 근거');for(const k of ['goals','assists','minutes'] as const)integer(e[k],`기록 ${k}`);check(Number.isFinite(e.rating)&&e.rating>=0&&e.rating<=10,'평점 근거');
}
export function validateCommercial(c:Career):void{
 const state=c.systems?.commercial;if(!state)return;
 check(state.version===1,'모형 버전');integer(state.firstYear,'도입 연도',c.season.year+1);check(state.firstYear>=1900,'도입 연도');
 check(state.clubs&&typeof state.clubs==='object'&&!Array.isArray(state.clubs)&&Object.keys(state.clubs).length<=1000,'클럽 인기도');
 for(const [id,r]of Object.entries(state.clubs)){getClub(id);popularity(r.popularity);check(Number.isFinite(r.power)&&r.power>=1&&r.power<=100,'인기도 전력 근거');}
 check(state.reputation&&typeof state.reputation==='object'&&!Array.isArray(state.reputation)&&Object.keys(state.reputation).length<=100000,'선수 명성');for(const [id,v]of Object.entries(state.reputation))check(id.length>0&&id.length<=500&&Number.isFinite(v)&&v>=0&&v<=1,'선수 명성 범위');
 check(Array.isArray(state.seasons)&&state.seasons.length<=300&&new Set(state.seasons.map(s=>s.year)).size===state.seasons.length,'연도별 집계');for(const s of state.seasons){check(s.year>=state.firstYear,'도입 전 집계');season(s,c);}
}
