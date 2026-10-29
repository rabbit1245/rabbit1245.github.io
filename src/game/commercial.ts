import {CLUBS,getClub,getLeague} from './data';
import {playingAbility} from './attributes';
import {baseShirtMarket} from './market-benchmarks';
import {clamp,hashSeed} from './math';
import {personality} from './personality';
import {worldPlayerAbility} from './world';
import type {Award,Career,PlayerStats,Position} from './types';

export interface ShirtClubState {popularity:number;power:number;}
export interface ShirtSeller {playerId:string;name:string;clubId:string;units:number;rank:number;}
export interface ShirtClubSales {clubId:string;total:number;named:number;other:number;popularity:number;}
export interface ShirtPlayerClub {clubId:string;units:number;rank:number;clubTotal:number;clubPopularity:number;}
export interface ShirtSeason {
 year:number;completed:boolean;throughRound:number;totalRounds:number;marketTotal:number;namedTotal:number;otherTotal:number;
 playerUnits:number;playerRank:number|null;candidateCount:number;playerClubs:ShirtPlayerClub[];
 leaders:ShirtSeller[];clubLeaders:ShirtSeller[];clubs:ShirtClubSales[];
 evidence:{ability:number;stardom:number;goals:number;assists:number;minutes:number;rating:number;};
}
export interface CommercialState {version:1;firstYear:number;clubs:Record<string,ShirtClubState>;reputation:Record<string,number>;seasons:ShirtSeason[];}
type Production={apps:number;minutes:number;goals:number;assists:number;ratingSum:number;ratingCount:number;tackles:number;interceptions:number;saves:number;cleanSheets:number;};
type Entry={playerId:string;name:string;clubId:string;position:Position;ability:number;production:Production;};
const zero=():Production=>({apps:0,minutes:0,goals:0,assists:0,ratingSum:0,ratingCount:0,tackles:0,interceptions:0,saves:0,cleanSheets:0});
const mean=(s:Production)=>s.ratingCount?s.ratingSum/s.ratingCount:0;
const role=(p:Position)=>p==='GK'?'GK':/^(CB|LB|RB|LWB|RWB)$/.test(p)?'DEF':/^(CDM|CM|CAM|LM|RM)$/.test(p)?'MID':'FWD';
function add(a:Production,b:PlayerStats){for(const k of Object.keys(a) as (keyof Production)[])a[k]+=b[k]??0;}
const legend=(name:string)=>/Lionel Messi|Cristiano Ronaldo|리오넬 메시|크리스티아누 호날두/.test(name)?.98:/Mbappé|Mbappe|Neymar|Salah|Haaland|Bellingham|Vinícius|Vinicius|Lewandowski|Son Heung|Harry Kane|음바페|네이마르|살라|홀란|벨링엄|비니시|레반도프|손흥민|해리 케인/.test(name)?.75:0;
/** A conserved, integer allocation: named shirts + other shirts always equal supply. */
export function allocateUnits(total:number,weights:number[]):number[]{
 if(!weights.length)return[];const sum=weights.reduce((a,b)=>a+Math.max(0,b),0);if(!sum)return weights.map((_,i)=>i?0:total);
 const raw=weights.map(w=>total*Math.max(0,w)/sum),out=raw.map(Math.floor),order=raw.map((v,i)=>({i,f:v-out[i]})).sort((a,b)=>b.f-a.f||a.i-b.i);
 for(let left=total-out.reduce((a,b)=>a+b,0),i=0;i<left;i++)out[order[i].i]++;
 return out;
}
export function ensureCommercial(c:Career):CommercialState|undefined{
 if(!c.systems)return;
 if(c.systems.commercial)return c.systems.commercial;
 const reputation:Record<string,number>={};
 // A mature imported career is not an unknown rookie. Seed only from its real
 // prior honours/results; never invent historical sales or rewrite old seasons.
 for(const year of c.systems.rankings.slice(-3))for(const p of year.candidates){const recent=Math.pow(.94,Math.max(0,c.season.year-year.year));reputation[p.playerId]=Math.max(reputation[p.playerId]??0,(.3+.65*clamp((31-p.rank)/30,0,1))*recent);}
 for(const a of c.awards.filter(a=>a.year>=c.season.year-4&&['world','continental-individual','league'].includes(a.category??''))){const value=a.category==='world'?.88:a.category==='continental-individual'?.7:.5;reputation[c.player.id]=Math.max(reputation[c.player.id]??0,value*Math.pow(.94,Math.max(0,c.season.year-a.year)));}
 for(const h of c.history.slice(-3).filter(h=>h.squad==='senior'&&h.stats.minutes>=1500)){const rating=h.stats.ratingCount?h.stats.ratingSum/h.stats.ratingCount:0,quality=clamp((h.ovrEnd-65)/40,0,1);reputation[c.player.id]=Math.max(reputation[c.player.id]??0,(.2+quality*.25+clamp(rating-7,0,1)*.2)/Math.sqrt(getLeague(h.leagueId).tier));}
 return c.systems.commercial={version:1,firstYear:c.season.year+(c.stage==='offseason'||c.stage==='retired'?1:0),clubs:Object.fromEntries(CLUBS.map(club=>{const w=c.systems!.world.clubs[club.id],d=w?.development;return[club.id,{popularity:clamp(1+Math.max(0,d?.investmentPower??0)*.04+Math.max(0,(d?.prestige??club.power)-(d?.basePower??club.power))*.015,1,2.5),power:w?.power??club.power}];})),reputation,seasons:[]};
}
function entries(c:Career):Entry[]{
 const w=c.systems!.world,rows=new Map<string,Entry>();
 const get=(id:string,name:string,clubId:string,position:Position,ovr:number)=>{
  const key=`${id}|${clubId}`;let row=rows.get(key);if(!row){row={playerId:id,name,clubId,position,ability:ovr,production:zero()};rows.set(key,row);}return row;
 };
 // The same player may sell two clubs' shirts after a real midseason transfer.
 const offsets=new Map<string,number>();
 for(const p of Object.values(w.players))if(p.id!==c.player.id&&w.clubs[p.clubId])get(p.id,p.name,p.clubId,p.position,worldPlayerAbility(c,p,offsets));
 for(const p of Object.values(w.playerStats))if(p.playerId!==c.player.id&&w.clubs[p.clubId])add(get(p.playerId,p.name,p.clubId,p.position,p.ovr).production,p.stats);
 const cups=[...new Map([...(c.systems!.clubCompetitions?.history??[]),...(c.systems!.clubCompetitions?.current??[])].filter(t=>t.year===c.season.year).map(t=>[t.id,t])).values()];
 for(const t of cups)for(const p of Object.values(t.playerStats??{}))if(p.playerId!==c.player.id&&w.clubs[p.clubId])add(get(p.playerId,p.name,p.clubId,p.position,p.ovr).production,p.stats);
 for(const m of [...c.season.matches,...cups.flatMap(t=>t.matches)])if(w.clubs[m.playerClubId])add(get(c.player.id,c.player.name,m.playerClubId,c.player.position,playingAbility(c.player)).production,m.playerStats);
 if(c.player.clubId!=='FA'&&c.player.squad==='senior')get(c.player.id,c.player.name,c.player.clubId,c.player.position,playingAbility(c.player));
 // A season entirely without a club has no club merchandise attribution.
 return [...rows.values()];
}
function contribution(e:Entry):number{
 const s=e.production,r=role(e.position),n=Math.max(1,s.minutes/90),played=clamp(s.minutes/1800,0,1);
 const production=r==='GK'?(s.saves/n*.11+s.cleanSheets/Math.max(1,s.apps)*.8):r==='DEF'?(s.goals*.09+s.assists*.075+(s.tackles+s.interceptions)/n*.065):r==='MID'?(s.goals*.055+s.assists*.065+(s.tackles+s.interceptions)/n*.025):(s.goals*.06+s.assists*.05+(s.tackles+s.interceptions)/n*.012);
 return clamp((Math.max(0,mean(s)-6)*.7+production*.55)*played,0,2.5);
}
export function shirtDemandWeight(e:Entry,fame:number,stardom:number):number{
 const skills=clamp((e.ability-35)/65,.08,1.2),visibility=role(e.position)==='FWD'?1.2:role(e.position)==='MID'?1:role(e.position)==='DEF'?.78:.7;
 const regularity=.6+.4*Math.sqrt(clamp(e.production.minutes/2200,0,1));
 return Math.pow(visibility*(.12+skills*skills*.8+fame*4.5+contribution(e)*.65)*(.55+stardom*.09)*regularity,1.65);
}
/** Once at the actual year boundary. No market work runs on training/stat clicks. */
export function settleShirtMarket(c:Career,completed=true):ShirtSeason|undefined{
 const state=ensureCommercial(c);if(!state||c.player.squad!=='senior'||c.season.year<state.firstYear)return;
 const existing=state.seasons.find(s=>s.year===c.season.year);if(existing)return existing;
 const w=c.systems!.world,rows=entries(c),byClub=new Map<string,Entry[]>();
 for(const e of rows){let pool=byClub.get(e.clubId);if(!pool){pool=[];byClub.set(e.clubId,pool);}pool.push(e);}
 const standings=new Map(Object.values(w.competitions).flatMap(t=>t.table.map((r,i)=>[r.clubId,{rank:i+1,teams:t.table.length}] as const)));
 const titles=new Map<string,number>();for(const t of c.systems!.clubCompetitions?.current??[])if(t.winnerId)titles.set(t.winnerId,(titles.get(t.winnerId)??0)+(t.kind==='continental'?.04:.015));
 const oldFame=state.reputation,newFame:Record<string,number>={},fame=new Map<string,number>(),weight=new Map<string,number>();
 for(const e of rows){
  const ability=clamp((e.ability-55)/45,0,1),initial=Math.max(e.playerId.startsWith('fc25_')?legend(e.name):0,ability*.32+(hashSeed(e.playerId)%1000)/1000*.10),prior=oldFame[e.playerId]??initial;
  const tier=getLeague(w.clubs[e.clubId].leagueId).tier,exposure=clamp((w.clubs[e.clubId].power-35)/55,.15,1)/Math.sqrt(tier);
  const record=clamp(contribution(e)/2.5,0,1),quality=clamp((e.ability-65)/40,0,1),s=standings.get(e.clubId),team=s?(s.teams-s.rank)/Math.max(1,s.teams-1):.5;
  const earned=record*exposure*.48+quality*.22+team*.08+(titles.get(e.clubId)??0);
  const current=clamp(prior*.82+earned*.18,0,1);fame.set(`${e.playerId}|${e.clubId}`,current);newFame[e.playerId]=Math.max(newFame[e.playerId]??0,current);
  const star=e.playerId===c.player.id?personality(c).stardom:clamp(3+ability*4+(hashSeed(e.playerId+'star')%300)/100,1,10);
  weight.set(`${e.playerId}|${e.clubId}`,shirtDemandWeight(e,current,star));
 }
 const clubs=CLUBS.filter(club=>byClub.has(club.id));
 const demands=clubs.map(club=>{
  const before=state.clubs[club.id]??{popularity:1,power:club.power},actual=w.clubs[club.id],s=standings.get(club.id),finish=s?(s.teams-s.rank)/Math.max(1,s.teams-1):.5;
  const progress=clamp((actual.power-before.power)*.007,-.025,.045),success=(finish-.55)*.035+(s?.rank===1?.02:0)+(titles.get(club.id)??0);
  const popularity=clamp(before.popularity*(1+(completed?clamp(success+progress,-.025,.09):0)),.35,5);
  state.clubs[club.id]={popularity,power:actual.power};
  const pool=byClub.get(club.id)!,attention=pool.reduce((n,e)=>n+Math.pow(fame.get(`${e.playerId}|${e.clubId}`)??0,4)*clamp((e.ability-65)/30,0,1),0);
  return baseShirtMarket(club.id)*popularity*(.9+finish*.12+(titles.get(club.id)??0))+Math.min(400000,attention*75000)*popularity;
 });
 const fraction=completed?1:clamp(c.season.week/c.season.totalWeeks,0,1);
 const marketTotal=Math.round(clubs.reduce((n,club)=>n+baseShirtMarket(club.id),0)*Math.min(1.8,Math.pow(1.012,Math.max(0,c.season.year-state.firstYear)))*fraction);
 const clubUnits=allocateUnits(marketTotal,demands),sales:ShirtSeller[]=[],clubSales:ShirtClubSales[]=[],ownClubs:ShirtPlayerClub[]=[],peers:ShirtSeller[]=[];
 let namedTotal=0,otherTotal=0;
 for(let i=0;i<clubs.length;i++){
  const club=clubs[i],pool=byClub.get(club.id)!,total=clubUnits[i],named=Math.round(total*.80),other=total-named,units=allocateUnits(named,pool.map(e=>weight.get(`${e.playerId}|${club.id}`)??0));
  const sold=pool.map((e,j)=>({playerId:e.playerId,name:e.name,clubId:club.id,units:units[j],rank:0})).sort((a,b)=>b.units-a.units||a.playerId.localeCompare(b.playerId));sold.forEach((e,j)=>e.rank=j+1);sales.push(...sold);
  const own=sold.find(e=>e.playerId===c.player.id);if(own){ownClubs.push({clubId:club.id,units:own.units,rank:own.rank,clubTotal:total,clubPopularity:state.clubs[club.id].popularity});peers.push(...sold);}
  clubSales.push({clubId:club.id,total,named,other,popularity:state.clubs[club.id].popularity});namedTotal+=named;otherTotal+=other;
 }
 const all=new Map<string,ShirtSeller>(),primary=new Map<string,number>();for(const s of sales){const existing=all.get(s.playerId);if(existing){existing.units+=s.units;if(s.units>(primary.get(s.playerId)??0)){existing.clubId=s.clubId;primary.set(s.playerId,s.units);}}else{all.set(s.playerId,{...s});primary.set(s.playerId,s.units);}}
 const ranked=[...all.values()].sort((a,b)=>b.units-a.units||a.playerId.localeCompare(b.playerId));ranked.forEach((s,i)=>s.rank=i+1);
 const own=ranked.find(e=>e.playerId===c.player.id),p=c.player,s=c.season.playerStats;
 const result:ShirtSeason={year:c.season.year,completed,throughRound:c.season.week,totalRounds:c.season.totalWeeks,marketTotal,namedTotal,otherTotal,playerUnits:own?.units??0,playerRank:own?.units?own.rank:null,candidateCount:ranked.length,playerClubs:ownClubs,leaders:ranked.filter(s=>s.units>0).slice(0,20),clubLeaders:peers,clubs:clubSales,evidence:{ability:playingAbility(p),stardom:personality(c).stardom,goals:s.goals,assists:s.assists,minutes:s.minutes,rating:s.ratingCount?s.ratingSum/s.ratingCount:0}};
 state.reputation=newFame;state.seasons.push(result);return result;
}
export function shirtSalesSeason(c:Career,year:number):ShirtSeason|undefined{return c.systems?.commercial?.seasons.find(s=>s.year===year);}
export function shirtSalesAwards(c:Career):Award[]{
 const s=shirtSalesSeason(c,c.season.year);if(!s?.completed||!s.playerRank||s.playerRank>3||s.playerUnits<=0)return[];
 return [{id:`${s.year}:shirt-market:${c.player.id}`,name:`K볼 유니폼 판매 ${s.playerRank}위`,year:s.year,clubId:[...s.playerClubs].sort((a,b)=>b.units-a.units)[0]?.clubId??c.player.clubId,rank:s.playerRank,category:'commercial-individual',official:false,organiser:'K볼 유니폼 시장',verification:'game-model',ruleVersion:'shirt-market-1',evaluationPeriod:`${s.year}시즌`,criterion:'세계 전체 선수의 실제 게임 내 유니폼 판매량 합계 1~3위. 복수 소속팀 판매량 합산.',description:`유니폼 ${s.playerUnits.toLocaleString('ko-KR')}장 · ${s.candidateCount.toLocaleString('ko-KR')}명 중 세계 ${s.playerRank}위. 구단별 유한한 시장과 개인 실적·팀 성적·실력·스타성·명성·클럽 인기도를 반영한 게임 내 판매량입니다.`}];
}
