import {getLeagueRule} from './league-rules';
import type {Career,Club} from './types';
import {CLUBS,INTERNATIONAL_CLUBS,getClub,getLeague} from './data';
import {seededRandom} from './math';
export interface InternationalPlan {code:string;name:string;entrants:string[];rounds:number;format?:'groups'|'intercontinental'|'super';singleLeg?:boolean;calendar?:string[];rules:string;}
const region:Record<string,string[]>= {AFC:['대한민국','일본','중국','사우디아라비아','카타르','아랍에미리트','이란','우즈베키스탄','호주','태국','이라크'],CAF:['이집트','모로코','튀니지','알제리','남아프리카공화국','콩고민주공화국','앙골라','탄자니아','수단','코트디부아르'],OFC:['뉴질랜드','피지','바누아투','솔로몬제도','타히티','파푸아뉴기니','사모아','뉴칼레도니아'],CONMEBOL:['브라질','아르헨티나','콜롬비아','에콰도르','우루과이','파라과이'],CONCACAF:['미국','멕시코','코스타리카','온두라스']};
const canadianMLS=new Set(CLUBS.filter(c=>/토론토|밴쿠버|몬트리올/.test(c.name)).map(c=>c.id));
export const clubCountry=(id:string)=>canadianMLS.has(id)?'캐나다':getClub(id).country;
const guestNote='지원 국내 리그는 실제 게임 순위로 진출하며, 미지원 국가의 초청 구단·예선 배분은 게임 모형입니다. 초청 구단은 실제 구단명·추정 전력·(가상) 선수단이며 미지원 국내 리그 성적은 만들지 않습니다.';
export function continent(id:string):string|undefined{const country=getClub(id).country;return Object.keys(region).find(key=>region[key].includes(country))??(['영국','독일','스페인','이탈리아','프랑스','포르투갈','네덜란드','벨기에','튀르키예'].includes(country)?'UEFA':undefined);}
function ranked(c:Career,country:string):string[]{
 const tables=Object.values(c.systems!.world.competitions).filter(t=>getLeague(t.leagueId).country===country&&getLeague(t.leagueId).tier===1);
 return tables.length?tables.flatMap(t=>[...t.table].sort((a,b)=>b.points-a.points||(b.goalsFor-b.goalsAgainst)-(a.goalsFor-a.goalsAgainst)||getClub(b.clubId).power-getClub(a.clubId).power).map(r=>r.clubId)):INTERNATIONAL_CLUBS.filter(x=>x.country===country).sort((a,b)=>b.power-a.power).map(x=>x.id);
}
export function internationalEntries(c:Career):Record<string,string[]>{
 const entries:Record<string,string[]>={},used=new Set<string>();
 const select=(key:string,countries:string[],size:number)=>{
  const lists=countries.map(country=>ranked(c,country)),out:string[]=[];
  for(let r=0;out.length<size&&r<32;r++)for(const list of lists){const id=list[r];if(id&&!used.has(id)&&out.length<size){out.push(id);used.add(id);}}
  entries[key]=out;
 };
 // AFC Elite has two independent 12-team geographical league phases.
 const east=['대한민국','일본','중국','호주','태국'],west=['사우디아라비아','카타르','아랍에미리트','이란','우즈베키스탄','이라크'];
 const quotas=(key:string,rows:[string,number][])=>{entries[key]=rows.flatMap(([country,n])=>ranked(c,country).slice(0,n));entries[key].forEach(id=>used.add(id));};
 quotas('AFC_ELITE_E',[['대한민국',3],['일본',3],['중국',3],['호주',1],['태국',2]]);quotas('AFC_ELITE_W',[['사우디아라비아',3],['카타르',3],['아랍에미리트',2],['이란',2],['우즈베키스탄',1],['이라크',1]]);entries.AFC_ELITE=[...entries.AFC_ELITE_E,...entries.AFC_ELITE_W];
 select('AFC_TWO',[...east,...west],32);
 select('LIBERTADORES',region.CONMEBOL,32);select('SUDAMERICANA',region.CONMEBOL,32);
 select('CONCACAF_CL',region.CONCACAF,27);select('CAF_CL',region.CAF,16);entries.OFC_CL=region.OFC.map(country=>ranked(c,country)[0]).filter(Boolean);entries.OFC_CL.forEach(id=>used.add(id));
 for(const country of new Set(CLUBS.map(x=>x.country)))entries[`RANK:${country}`]=ranked(c,country);
 return entries;
}
const holder=(c:Career,code:string)=>c.systems?.clubCompetitions?.current.find(t=>t.id.startsWith(`${code}:`)&&t.phase==='completed')?.winnerId;
const finalPair=(c:Career,prefix:string)=>{const t=c.systems?.clubCompetitions?.current.find(t=>t.id.startsWith(prefix));const f=t?.fixtures.find(f=>f.stage==='결승'&&f.played);return f?[t!.winnerId!,f.homeId===t!.winnerId?f.awayId:f.homeId].filter(Boolean):[];};
/** A host champion already qualified via its confederation does not erase the host berth. */
export function clubWorldHost(c:Career,entries:Record<string,string[]>,qualified:string[],year:number){
 const hosts=Object.keys(entries).filter(k=>k.startsWith('RANK:')&&entries[k].some(id=>!qualified.includes(id)&&clubCountry(id)===k.slice(5))),rng=seededRandom(`${c.seed}|cwc-host|${year}`),key=hosts[Math.floor(rng()*hosts.length)];
 return key?{country:key.slice(5),clubId:entries[key].find(id=>!qualified.includes(id)&&clubCountry(id)===key.slice(5))!}:undefined;
}
/** Called before tables reset: entry records survive transfers and all next-season recalculation. */
export function internationalPlans(c:Career,entries:Record<string,string[]>,previous?:Career):InternationalPlan[]{
 const plans:InternationalPlan[]=[],y=c.season.calendarYear??c.season.year,start=getLeague(c.season.leagueId).country;
 const add=(code:string,name:string,entrants:string[],rounds:number,format:InternationalPlan['format'],rules:string,singleLeg=false,calendar?:string[])=>{if(entrants.length<2||new Set(entrants).size!==entrants.length)return;plans.push({code,name,entrants,rounds,...(format?{format}:{}),singleLeg,rules:rules+' '+guestNote,...(calendar?{calendar}:{} )});};
 if(entries.AFC_ELITE?.length===24)add('AFC_ELITE','AFC 챔피언스리그 엘리트',entries.AFC_ELITE,8,undefined,'동·서 12팀 각각 리그 8경기 · 각 권역 상위 8팀 16강. 16강 홈원정, 8강부터 단판. 녹아웃 권역별 추첨은 지원 모형에서 통합합니다.');
 if(entries.AFC_TWO?.length===32&&entries.AFC_TWO.filter(id=>['사우디아라비아','카타르','아랍에미리트','이란','우즈베키스탄'].includes(getClub(id).country)).length===16)add('AFC_TWO','AFC 챔피언스리그 2',entries.AFC_TWO,6,'groups','32팀 8조 · 조별 홈·원정 6경기 · 상위 2팀 16강 · 결승 단판.');
 for(const [code,name,size] of [['LIBERTADORES','CONMEBOL 리베르타도레스',32],['SUDAMERICANA','CONMEBOL 수다메리카나',32],['CAF_CL','CAF 챔피언스리그',16],['OFC_CL','OFC 챔피언스리그',8]] as const)if(entries[code]?.length===size)add(code,name,entries[code],code==='OFC_CL'?3:6,'groups','4팀 조별리그 · 상위 2팀 녹아웃. 지원 구단 범위에서 예선·국가별 배분·홈원정 일부를 축약한 게임 모형.',code==='OFC_CL');
 if(entries.CONCACAF_CL?.length===27)add('CONCACAF_CL','CONCACAF 챔피언스컵',entries.CONCACAF_CL,0,undefined,'27팀 · 5팀 16강 부전승 · 이후 홈·원정과 단판 결승. 최초 1라운드 시드는 지원 구단 순위 기반 게임 모형.');
 if(!previous)return plans;
 // Real holders only. No source season -> no invented super cup or annual world champion.
 const domestic=[['영국','FA','커뮤니티 실드'],['독일','DFB','DFL 슈퍼컵'],['프랑스','CDF','트로페 데 샹피옹'],['네덜란드','KNVB','요한 크라위프 스할'],['포르투갈','TACA','수페르타사'],['벨기에','CROKY','벨기에 슈퍼컵'],['튀르키예','TURKIYE','튀르키예 슈퍼컵'],['일본','EMPEROR','일본 슈퍼컵'],['브라질','BRASIL','수페르코파 두 브라질'],['스페인','COPA','수페르코파 데 에스파냐'],['이탈리아','COPPA','수페르코파 이탈리아나']];
 for(const [country,cup,name] of domestic){const rank=entries[`RANK:${country}`]??[],cupFinal=finalPair(previous,`CUP:${cup}:`),size=['스페인','이탈리아'].includes(country)?4:2;if(!rank.length||!cupFinal.length)continue;const ids=[...new Set([...(size===4?rank.slice(0,2):rank.slice(0,1)),...(size===4?cupFinal:cupFinal.slice(0,1)),...rank])].slice(0,size);add(`SUPER_${cup}`,name,ids,0,'super',`${size===4?'리그 상위 2팀·컵 우승/준우승(중복 시 리그 후순위)':'리그·컵 우승팀(중복 시 리그 준우승)'} · 단판`,true);}
 const ucl=holder(previous,'UCL'),uel=holder(previous,'UEL');if(ucl&&uel&&ucl!==uel)add('UEFA_SUPER','UEFA 슈퍼컵',[ucl,uel],0,'super','직전 챔피언스리그·유로파리그 우승팀 · 단판 중립',true);
 const seeds=['AFC_ELITE','OFC_CL','CAF_CL','LIBERTADORES','CONCACAF_CL','UCL'].map(key=>holder(previous,key));
 if(seeds.every((id):id is string=>!!id))add('INTERCONTINENTAL','FIFA 인터컨티넨털컵',seeds as string[],0,'intercontinental','연례 · 6대륙 최상위 대회 실제 우승팀. AFC↔OFC→CAF, 남미↔북중미, 양 경로 승자 대결 후 UEFA 챔피언과 결승. 5경기 · 단판.',true);
 // Expanded Club World Cup: four-year cycle, separate qualification from the annual event.
 if(y>=2029&&(y-2025)%4===0){
  const history=[...(previous.systems?.clubCompetitions?.history??[]),...(previous.systems?.clubCompetitions?.current??[])],entrants:string[]=[],countryCounts=new Map<string,number>();
  const sources=[['UEFA','UCL',12],['CONMEBOL','LIBERTADORES',6],['AFC','AFC_ELITE',4],['CAF','CAF_CL',4],['CONCACAF','CONCACAF_CL',4],['OFC','OFC_CL',1]] as const;
  for(const [conf,code,quota] of sources){const completed=history.filter(t=>t.id.startsWith(code+':')&&t.phase==='completed'&&t.year>=previous.season.year-3),champions=[...new Set(completed.map(t=>t.winnerId!))];
   const scores=new Map<string,number>();for(const t of completed)for(const f of t.fixtures.filter(f=>f.played)){for(const [id,win] of [[f.homeId,f.homeGoals!>f.awayGoals!],[f.awayId,f.awayGoals!>f.homeGoals!]] as const)scores.set(id,(scores.get(id)??0)+1+(win?3:f.homeGoals===f.awayGoals?1:0));}
   const ranked=[...scores].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([id])=>id);let count=0;
   for(const id of [...new Set([...champions,...ranked])]){if(entrants.includes(id)||continent(id)!==conf)continue;const country=clubCountry(id);if(!champions.includes(id)&&(countryCounts.get(country)??0)>=2)continue;entrants.push(id);countryCounts.set(country,(countryCounts.get(country)??0)+1);if(++count===quota)break;}
  }
  // The host for future editions is not claimed as verified. Select a game host and its actual champion.
  const host=clubWorldHost(c,entries,entrants,y);
  if(entrants.length===31&&host){entrants.push(host.clubId);const europe=getLeague(c.season.leagueId).country==='영국'||getLeagueRule(c.season.leagueId).startMonth===7;const month=europe?'08':'06',days=[1,5,9,13,17,21,25];add('CLUB_WORLD_CUP','FIFA 클럽 월드컵',entrants,3,'groups',`4년 주기 · 32팀 8조·상위 2팀 16강·단판 결승. 지난 4개 게임 시즌 대륙 우승 우선·실제 대륙 경기 점수 순위, 국가별 2팀 상한(복수 우승팀 예외), UEFA12·남미6·아시아4·아프리카4·북중미4·오세아니아1·개최국1. 미래 개최국은 미확정이므로 게임 추첨 ${host.country}; 해당 리그 실제 순위의 최상위 미진출 구단(우승팀이 이미 진출했으면 차순위). 날짜는 소속 리그 달력에 맞춘 게임 일정.`,true,days.map(d=>`${y}-${month}-${String(d).padStart(2,'0')}T00:00:00.000Z`));}
 }
 return plans;
}
