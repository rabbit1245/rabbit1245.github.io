import {getClub,getLeague} from './data';
import {clamp} from './math';
import type {Career,MatchRecord} from './types';
import type {CompetitorSeason} from './revision-types';

export interface AchievementEvidence {
 year:number;observedFrom:number;completeStart:boolean;
 clubs:Record<string,{power:number;expectedRank:number|null;leagueId:string}>;
 lastTitles:Record<string,number>;records:Record<string,{value:number;year:number}>;
 injuredRounds:Record<string,number>;previousInjuredRounds:Record<string,number>;
 nationalPowers:Record<string,Record<string,number>>;promotions:Record<string,number>;
}
export interface AchievementContext {leagueWinners:Map<string,string>;cups:{id:string;kind:string;winnerId?:string;entrants:string[];matches:MatchRecord[];finalIds?:string[]}[]}
export function beginAchievementSeason(c:Career):void{
 if(!c.systems||c.systems.achievementEvidence?.year===c.season.year)return;
 const old=c.systems.achievementEvidence;
 const expected=new Map<string,number>();for(const league of Object.values(c.systems.world.competitions)){[...league.table].sort((a,b)=>(c.systems!.world.clubs[b.clubId]?.power??0)-(c.systems!.world.clubs[a.clubId]?.power??0)||a.clubId.localeCompare(b.clubId)).forEach((r,i)=>expected.set(r.clubId,i+1));}
 const promotions={...old?.promotions};for(const m of c.systems.world.movements)if(m.kind==='promotion'&&getLeague(m.toLeagueId).tier===1)promotions[m.clubId]=m.year;
 c.systems.achievementEvidence={year:c.season.year,observedFrom:old?.observedFrom??c.season.year,completeStart:c.season.week===0,clubs:Object.fromEntries(Object.values(c.systems.world.clubs).map(t=>[t.id,{power:t.power,expectedRank:t.development?.expectedRank??expected.get(t.id)??null,leagueId:t.leagueId}])),lastTitles:{...old?.lastTitles},records:{...old?.records},injuredRounds:{},previousInjuredRounds:{...old?.injuredRounds},nationalPowers:{},promotions};
}
export function captureNationalPower(c:Career,id:string,country:string,power:number){const e=c.systems?.achievementEvidence;if(e?.year!==c.season.year)return;const rows=e.nationalPowers[id]??(e.nationalPowers[id]={});if(rows[country]===undefined)rows[country]=power;}
const winner=(m:MatchRecord)=>m.shootout?.winnerId??(m.homeGoals>m.awayGoals?m.homeId:m.awayGoals>m.homeGoals?m.awayId:undefined);
const recordKey=(r:CompetitorSeason)=>`goals:${r.leagueId}`;
interface AchievementIndex {participants:Map<string,Set<string>>;heroes:Set<string>;nationalUpsets:Set<string>}
const indexes=new WeakMap<AchievementContext,AchievementIndex>();
function evidenceIndex(c:Career,context:AchievementContext):AchievementIndex{
 const cached=indexes.get(context);if(cached)return cached;
 const index:AchievementIndex={participants:new Map(),heroes:new Set(),nationalUpsets:new Set()},e=c.systems!.achievementEvidence!;
 const heroes=(m:MatchRecord)=>{const win=winner(m);for(const a of m.performers??[])if(a.teamId===win&&a.minutes>0&&((a.stats.goals>0&&a.rating>=8)||(a.position==='GK'&&(a.stats.penaltiesSaved??0)>0)||(a.position==='GK'&&a.stats.saves>=7&&a.stats.cleanSheets>0)))index.heroes.add(a.id);};
 for(const t of context.cups){
  const ids=new Set<string>(),minutes=new Map<string,number>();index.participants.set(t.id,ids);const finals=new Set(t.finalIds??[]);
  for(const m of t.matches){
   for(const a of m.performers??[])if(a.clubId===t.winnerId&&a.minutes>0)minutes.set(a.id,(minutes.get(a.id)??0)+a.minutes);
   if(m.playerPlayed&&m.playerClubId===t.winnerId&&!m.performers?.some(a=>a.id===c.player.id))minutes.set(c.player.id,(minutes.get(c.player.id)??0)+m.playerMinutes);
   if(finals.has(m.fixtureId)||m.fixtureId.includes('|final|'))heroes(m);
  }
  const required=Math.max(180,Math.max(0,...minutes.values())*.4);for(const [id,value]of minutes)if(value>=required)ids.add(id);
 }
 const national=[...new Map([...(c.systems!.national.teamResults??[]),...c.systems!.national.matches,...c.systems!.national.history.flatMap(h=>h.matches)].filter(m=>m.seasonYear===c.season.year&&m.fixtureId.includes('|final|')).map(m=>[m.fixtureId,m])).values()];
 for(const m of national){heroes(m);const win=winner(m),country=win?.split(':')[1],powers=e.nationalPowers[m.competitionId??''],power=country?powers?.[country]:undefined;if(power!==undefined&&powers&&Object.values(powers).filter(v=>v>power).length>=8)for(const a of m.performers??[])if(a.teamId===win&&a.minutes>0)index.nationalUpsets.add(a.id);}
 indexes.set(context,index);return index;
}
/** One shared, evidence-only model for NPCs and the player. No narrative is exported to the career text. */
export function achievementBonus(c:Career,r:CompetitorSeason,context:AchievementContext):number{
 const e=c.systems?.achievementEvidence,s=r.stats;
 if(!e||e.year!==c.season.year||s.apps<15||s.minutes<1350||s.ratingCount===0)return 0;
 const rating=s.ratingSum/s.ratingCount;if(rating<7)return 0;
 const w=c.systems!.world,p=w.players[r.playerId],year=c.season.year;
 const clubTitle=context.leagueWinners.get(r.clubId),start=e.clubs[r.clubId],major=context.cups.filter(t=>t.winnerId===r.clubId&&!/SUPER|INTERCONTINENTAL/.test(t.id));
 const leagueStats=r.playerId===c.player.id?c.season.playerStats:w.playerStats[r.playerId]?.stats;
 const topTitle=!!clubTitle&&getLeague(clubTitle).tier===1&&(leagueStats?.minutes??0)>=1350;
 const index=evidenceIndex(c,context),participated=(t:AchievementContext['cups'][number])=>index.participants.get(t.id)?.has(r.playerId)??false;
 let titleStory=0,other=0;
 if(topTitle&&e.completeStart&&start?.expectedRank&&start.expectedRank>=Math.ceil((w.competitions[clubTitle!]?.table.length??20)*.5))titleStory=Math.max(titleStory,3);
 if(topTitle&&r.playerId===c.player.id){const history=c.history.filter(h=>h.clubId===r.clubId&&h.squad==='senior').sort((a,b)=>a.year-b.year);if(history.some((h,i)=>getLeague(h.leagueId).tier>1&&history.slice(i+1).some(next=>next.year>h.year&&getLeague(next.leagueId).tier===1)))titleStory=Math.max(titleStory,3);}
 if(major.some(t=>t.id.startsWith('UCL:')&&participated(t))&&e.completeStart&&start&&context.cups.some(t=>t.id.startsWith('UCL:')&&t.entrants.filter(id=>(e.clubs[id]?.power??0)>start.power).length>=12))titleStory=Math.max(titleStory,3);
 if(topTitle&&r.playerId!==c.player.id&&p?.joinedYear!==undefined&&e.promotions[r.clubId]!==undefined&&p.joinedYear<e.promotions[r.clubId])titleStory=Math.max(titleStory,3);
 const title=topTitle||major.some(participated),last=e.lastTitles[r.clubId];
 const drought=last===undefined?year-e.observedFrom:year-last;
 if(title&&e.completeStart&&drought>=8)titleStory=Math.min(4,titleStory+2);
 const age=r.playerId===c.player.id?c.player.age:p?.age??0;
 if(age>=35&&s.minutes>=2200&&rating>=7.6&&(title||r.nationalStats?.apps))other+=1.5;
 const injured=r.playerId===c.player.id?Math.max(e.previousInjuredRounds[r.playerId]??0,c.systems!.growthReports.filter(h=>h.year===year-1).reduce((n,h)=>Math.max(n,h.growth?.injuredRounds??0),0)):e.previousInjuredRounds[r.playerId]??0;
 if(injured>=12&&rating>=7.5&&s.minutes>=2000)other+=1.5;
 const ownYears=r.playerId===c.player.id?(()=>{let n=0;for(let y=year-1;;y--){if(!c.history.some(h=>h.year===y&&h.clubId===r.clubId))return n;n++;}})():p?.joinedYear===undefined?0:year-p.joinedYear;
 if(ownYears>=8&&title&&rating>=7.5)other+=1;
 if(index.nationalUpsets.has(r.playerId))other+=2;
 if(index.heroes.has(r.playerId))other+=1.5;
 const prior=e.records[recordKey(r)];if(prior&&prior.year<year&&getLeague(r.leagueId).tier===1&&(leagueStats?.goals??0)>prior.value&&(leagueStats?.goals??0)>=25)other+=1.5;
 return Math.round(clamp(titleStory+other,0,10)*100)/100;
}
/** Update compact historical facts only after the current year's judging has finished. */
export function finishAchievementSeason(c:Career,rows:CompetitorSeason[],context:AchievementContext){
 const e=c.systems?.achievementEvidence;if(!e)return;
 for(const [club,league]of context.leagueWinners)if(getLeague(league).tier===1)e.lastTitles[club]=c.season.year;
 for(const cup of context.cups)if(cup.winnerId&&(cup.kind==='continental'||cup.kind==='cup'))e.lastTitles[cup.winnerId]=c.season.year;
 const leagues=Object.values(c.systems!.world.playerStats).map(r=>r.playerId===c.player.id?{...r,stats:c.season.playerStats}:r);
 void rows;
 for(const row of leagues){const key=recordKey(row),old=e.records[key];if(!old||row.stats.goals>old.value)e.records[key]={value:row.stats.goals,year:c.season.year};}
}

export function validateAchievementEvidence(c:Career):void{
 const e=c.systems?.achievementEvidence;if(!e)return;
 const check=(v:unknown)=>{if(!v)throw Error('저장 데이터 오류: 수상 평가 근거가 올바르지 않습니다.');};
 const num=(v:number,min:number,max:number)=>check(Number.isFinite(v)&&v>=min&&v<=max);
 check(e.year===c.season.year&&typeof e.completeStart==='boolean');num(e.observedFrom,1900,e.year);
 for(const map of [e.clubs,e.lastTitles,e.records,e.injuredRounds,e.previousInjuredRounds,e.nationalPowers,e.promotions])check(map&&typeof map==='object'&&!Array.isArray(map)&&Object.keys(map).length<=100000);
 for(const [id,r]of Object.entries(e.clubs)){check(!!c.systems!.world.clubs[id]);getLeague(r.leagueId);num(r.power,1,100);if(r.expectedRank!==null)num(r.expectedRank,1,128);}
 for(const [id,y]of Object.entries(e.lastTitles)){getClub(id);num(y,e.observedFrom,e.year);}
 for(const [id,y]of Object.entries(e.promotions)){check(!!c.systems!.world.clubs[id]);num(y,1900,e.year);}
 for(const r of Object.values(e.records)){num(r.value,0,100000);num(r.year,e.observedFrom,e.year);}
 for(const map of [e.injuredRounds,e.previousInjuredRounds])for(const v of Object.values(map))num(v,0,150);
 for(const powers of Object.values(e.nationalPowers)){check(powers&&typeof powers==='object'&&!Array.isArray(powers)&&Object.keys(powers).length<=250);for(const v of Object.values(powers))num(v,1,110);}
}
