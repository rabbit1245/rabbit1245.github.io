import {internationalEntries,internationalPlans} from './international-competitions';
import {syncManualInjury} from './manual-injury';
import {tournamentPerformance} from './tournament-awards';
import {CLUBS,getClub,getLeague} from './data';
import {simulateMatch} from './match-engine';
import {getClubWorldPower,getWorldClubPlayers} from './world';
import {resolveNationalShootout} from './national';
import {sumStats,seededRandom,emptyStats,addStats} from './math';
import {fixtureDate,isInternationalBreak,seasonDate} from './calendar';
import {DOMESTIC_CUPS,CONTINENTAL_CUPS,EUROPEAN_COUNTRIES,CUP_MODEL} from './cup-rules';
import type {Career,MatchRecord,Standing} from './types';
import type {ClubTournament,CupFixture} from './revision-types';

const reserve=(id:string)=>/(?:\sB|\sII|카스티야)$/.test(getClub(id).name);
const shuffled=(c:Career,ids:string[],salt:string)=>{const rng=seededRandom(`${c.seed}|cup-draw|${c.season.year}|${salt}`);return ids.map(id=>({id,n:rng()})).sort((a,b)=>a.n-b.n).map(r=>r.id);};
export function cupLedger(c:Career,year?:number):ClubTournament[]{const s=c.systems?.clubCompetitions;return [...(s?.history??[]),...(s?.current??[])].filter(t=>year===undefined||t.year===year);}
export function cupMatches(c:Career,year?:number):MatchRecord[]{return [...new Map(cupLedger(c,year).flatMap(t=>t.matches).map(m=>[m.fixtureId,m])).values()];}
export function cupStats(c:Career,year?:number){return sumStats(cupMatches(c,year).map(m=>m.playerStats));}
export function tournamentResult(t:ClubTournament,id:string){if(!t.entrants.includes(id))return '참가 자격 없음';if(t.id.startsWith('PLAYOFF:'))return t.winnerId===id?'승강 결정전 승리':'승강 결정전 패배';if(t.winnerId===id)return '우승';if(t.byes.includes(id)&&t.stage==='녹아웃 플레이오프')return '16강 직행';if(t.phase==='league')return `리그 페이즈 ${t.table.findIndex(r=>r.clubId===id)+1}위`;if(t.active.includes(id)||t.byes.includes(id))return `${t.stage} 진출`;const last=t.fixtures.filter(f=>f.played&&(f.homeId===id||f.awayId===id)).at(-1);return last?`${last.stage} 탈락`:'경기 대기';}
function rankedCountries(c:Career){return new Map(EUROPEAN_COUNTRIES.map(country=>{
 const top=Object.values(c.systems!.world.competitions).filter(x=>getLeague(x.leagueId).country===country&&getLeague(x.leagueId).tier===1).flatMap(x=>x.table);
 const completed=top.some(r=>r.played>0);const ids=top.sort((a,b)=>completed?b.points-a.points||(b.goalsFor-b.goalsAgainst)-(a.goalsFor-a.goalsAgainst):getClubWorldPower(c,b.clubId)-getClubWorldPower(c,a.clubId)).map(r=>r.clubId).filter(id=>!reserve(id));
 return [country,ids] as const;
}));}
/** Qualification is captured before promotion and league tables reset. */
export function europeanEntries(c:Career):Record<string,string[]>{
 const ranked=rankedCountries(c),used=new Set<string>(),entries:Record<string,string[]>={UCL:[],UEL:[],UECL:[]};
 for(const [index,country] of EUROPEAN_COUNTRIES.entries())for(const id of (ranked.get(country)??[]).slice(0,index<5?4:2)){entries.UCL.push(id);used.add(id);}
 for(const code of ['UCL','UEL']){const winner=c.systems?.clubCompetitions?.current.find(t=>t.id.startsWith(`${code}:`))?.winnerId;if(winner&&!used.has(winner)){entries.UCL.push(winner);used.add(winner);}}
 for(const kind of ['UCL','UEL','UECL']){
  if(kind==='UEL'){const winner=c.systems?.clubCompetitions?.current.find(t=>t.id.startsWith('UECL:'))?.winnerId;if(winner&&!used.has(winner)){entries.UEL.push(winner);used.add(winner);}}
  for(const [index,country] of EUROPEAN_COUNTRIES.entries()){
   if(kind==='UCL')continue;
   const winner=kind==='UEL'?c.systems?.clubCompetitions?.current.find(t=>t.country===country&&t.kind==='cup')?.winnerId:c.systems?.clubCompetitions?.current.find(t=>t.country===country&&t.kind==='leagueCup')?.winnerId;
   const quota=kind==='UEL'?2:1;
   for(const id of [...new Set([...(winner?[winner]:[]),...(ranked.get(country)??[])])].filter(id=>!used.has(id)).slice(0,quota)){entries[kind].push(id);used.add(id);}
  }
  const available=[...ranked.values()].flat().filter(id=>!used.has(id)).sort((a,b)=>{
   const rank=(id:string)=>[...ranked.values()].find(r=>r.includes(id))!.indexOf(id);return rank(a)-rank(b)||getClubWorldPower(c,b)-getClubWorldPower(c,a);
  });
  for(const id of available.slice(0,Math.max(0,36-entries[kind].length))){entries[kind].push(id);used.add(id);}
 }
 for(const rule of DOMESTIC_CUPS){
  const tables=Object.values(c.systems!.world.competitions).filter(x=>getLeague(x.leagueId).country===rule.country).sort((a,b)=>getLeague(a.leagueId).tier-getLeague(b.leagueId).tier);
  entries[`DOM:${rule.id}`]=tables.flatMap(x=>[...x.table].sort((a,b)=>b.points-a.points||(b.goalsFor-b.goalsAgainst)-(a.goalsFor-a.goalsAgainst)||getClubWorldPower(c,b.clubId)-getClubWorldPower(c,a.clubId)).map(r=>r.clubId)).filter(id=>!reserve(id));
 }
 Object.assign(entries,internationalEntries(c));
 return entries;
}
function maxSteps(t:ClubTournament){if(t.maxSteps)return t.maxSteps;const rule=DOMESTIC_CUPS.find(r=>t.id.startsWith(`CUP:${r.id}:`)),rounds=Math.ceil(Math.log2(t.entrants.length));return t.kind==='continental'?t.leagueRounds+9:rounds+Math.max(0,Math.min(rounds,Math.log2(rule?.legsFrom||1))-1);}
function scheduleFor(c:Career,t:ClubTournament,step:number){if(t.calendar?.[step-1]){const last=Date.parse(fixtureDate(c.season,c.season.totalWeeks))-86400000,date=new Date(Math.min(Date.parse(t.calendar[step-1]),last)).toISOString();let round=1;while(round<c.season.totalWeeks&&fixtureDate(c.season,round)<date)round++;return {round,date};}return matchDayDate(c,step,maxSteps(t),t.kind);}
function planDates(c:Career,t:ClubTournament){for(const f of t.fixtures)if(!f.date)f.date=scheduleFor(c,t,f.step).date;}
function emptyTable(ids:string[]):Standing[]{return ids.map(clubId=>({clubId,played:0,won:0,drawn:0,lost:0,goalsFor:0,goalsAgainst:0,points:0}));}
function leagueDraw(c:Career,t:ClubTournament){
 if(t.groups||t.id.startsWith('AFC_ELITE:')){
  const groups=t.groups??[t.entrants.slice(0,12),t.entrants.slice(12)];
  for(const [g,group] of groups.entries()){const ids=shuffled(c,group,`${t.id}:group:${g}`);for(let r=0;r<t.leagueRounds;r++){
   const teams=[...ids];for(let k=0;k<r%(teams.length-1);k++)teams.splice(1,0,teams.pop()!);
   for(let i=0;i<teams.length/2;i++){const pair=[teams[i],teams[teams.length-1-i]];if((r+i)%2)pair.reverse();if(r>=teams.length-1)pair.reverse();t.fixtures.push({id:`${t.id}|group|${g}|${r}|${i}`,round:r+1,step:r+1,homeId:pair[0],awayId:pair[1],played:false,stage:t.groups?`조별리그 ${g+1}조`:'리그 페이즈',leg:1,tieId:`group:${g}:${r}:${i}`});}
  }}
 }else{const ids=shuffled(c,t.entrants,t.id),n=ids.length/2;for(let r=0;r<t.leagueRounds;r++)for(let i=0;i<n;i++){const pair=[ids[i],ids[n+(i+r)%n]];if(r%2)pair.reverse();t.fixtures.push({id:`${t.id}|league|${r}|${i}`,round:r+1,step:r+1,homeId:pair[0],awayId:pair[1],played:false,stage:'리그 페이즈',leg:1,tieId:`league:${r}:${i}`});}}
 if(t.id.startsWith('AFC_ELITE:')){const unused=new Set(t.fixtures.map((_,i)=>i));for(const start of t.entrants){if(!t.fixtures.some((f,i)=>unused.has(i)&&[f.homeId,f.awayId].includes(start)))continue;const stack=[start];while(stack.length){const id=stack.at(-1)!,edge=t.fixtures.findIndex((f,i)=>unused.has(i)&&[f.homeId,f.awayId].includes(id));if(edge<0){stack.pop();continue;}unused.delete(edge);const f=t.fixtures[edge],next=f.homeId===id?f.awayId:f.homeId;f.homeId=id;f.awayId=next;stack.push(next);}}}
 planDates(c,t);
}
function knockoutDraw(c:Career,t:ClubTournament,ids:string[],stage?:string){
 const field=stage==='16강'?ids.slice(0,8).flatMap((id,i)=>[id,ids[15-i]]):shuffled(c,ids,`${t.id}:${t.step}`),power=2**Math.floor(Math.log2(field.length)),byes=field.length>power?power*2-field.length:0;
 t.byes=field.slice(0,byes);t.active=[...field];const remaining=field.slice(byes),size=2**Math.ceil(Math.log2(field.length));t.stage=stage??(size===2?'결승':`${size}강`);
 const rule=DOMESTIC_CUPS.find(r=>t.id.startsWith(`CUP:${r.id}:`));const two=!t.singleLeg&&(t.kind==='continental'&&(t.stage!=='결승'||t.doubleFinal)&&(!t.id.startsWith('AFC_ELITE:')||size===16)||!!rule&&rule.legsFrom>0&&size<=rule.legsFrom&&size>2);
 for(let i=0;i<remaining.length;i+=2){const pair=[remaining[i],remaining[i+1]],tieId=`${t.id}|${t.stage}|${t.step}|${i/2}`;for(let leg=1;leg<=(two?2:1);leg++)t.fixtures.push({id:`${tieId}|${leg}`,tieId,round:t.step+leg,step:t.step+leg,homeId:pair[(leg-1)%2],awayId:pair[leg%2],played:false,stage:t.stage,leg});}
 planDates(c,t);
}
export function initializeClubCompetitions(c:Career,entries?:Record<string,string[]>,previous?:Career):void{
 if(!c.systems)return;const old=c.systems.clubCompetitions;if(old?.year===c.season.year)return;
 const history=[...(old?.history??[]),...(old?.current??[]).map(({playerStats,...t})=>t)];
 const state=c.systems.clubCompetitions={version:1,year:c.season.year,current:[] as ClubTournament[],history};
 // Resuming a past season does not invent already elapsed cup fixtures.
 if(c.stage!=='season'||c.season.week>0)return;
 const basis=entries?'지난 시즌 실제 리그·컵 성적':'첫 시즌 구단 전력 시드';
 const make=(id:string,name:string,entrants:string[],kind:ClubTournament['kind'],rounds=0,country?:string,rules='')=>{
  if(entrants.length<2)return;
  const t:ClubTournament={id:`${id}:${c.season.year}`,name,year:c.season.year,...(country?{country}:{}),kind,entrants,basis,rules:rules||CUP_MODEL,phase:rounds?'league':'knockout',step:0,leagueRounds:rounds,stage:rounds?'리그 페이즈':'첫 라운드',active:[...entrants],byes:[],fixtures:[],matches:[],table:emptyTable(entrants),startedAtRound:0};state.current.push(t);if(rounds)leagueDraw(c,t);else knockoutDraw(c,t,entrants);
 };
 for(const rule of DOMESTIC_CUPS){
  let clubs=Object.values(c.systems.world.clubs).filter(x=>getLeague(x.leagueId).country===rule.country&&!reserve(x.id)&&!(rule.id==='USOPEN'&&/토론토|밴쿠버|몬트리올/.test(getClub(x.id).name))).sort((a,b)=>getLeague(a.leagueId).tier-getLeague(b.leagueId).tier||b.power-a.power);
  if(entries?.[`DOM:${rule.id}`]){const order=entries[`DOM:${rule.id}`];clubs.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));}
  if(rule.id==='TACALIGA')clubs=[...clubs.filter(x=>getLeague(x.leagueId).tier===1).slice(0,6),...clubs.filter(x=>getLeague(x.leagueId).tier===2).slice(0,2)];
  make(`CUP:${rule.id}`,rule.name,clubs.slice(0,rule.max).map(x=>x.id),'leagueCup' in rule?'leagueCup':'cup',0,rule.country,rule.note+' · 미지원 지역 예선/시즌별 세부 시드는 게임 모형 · 정규 90분(홈·원정은 합계) 동률이면 연장 생략 후 승부차기');
 }
 const qualified=entries??europeanEntries(c);
 for(const rule of CONTINENTAL_CUPS)if(qualified[rule.id]?.length===36)make(rule.id,rule.name,qualified[rule.id],'continental',rule.rounds);
 for(const plan of internationalPlans(c,qualified,previous)){
  const t:ClubTournament={id:`${plan.code}:${c.season.year}`,name:plan.name,year:c.season.year,kind:'continental',entrants:plan.entrants,basis:plan.format==='super'||plan.format==='intercontinental'?'지난 시즌 실제 우승·준우승 자격':'대륙별 실제 게임 성적·지원 구단 진출권',rules:plan.rules,phase:plan.rounds?'league':'knockout',step:0,leagueRounds:plan.rounds,stage:plan.rounds?'리그 페이즈':'첫 라운드',active:[...plan.entrants],byes:[],fixtures:[],matches:[],table:emptyTable(plan.entrants),startedAtRound:0,...(plan.format?{format:plan.format}:{}),...(plan.singleLeg?{singleLeg:true}:{}),...(plan.calendar?{calendar:plan.calendar}:{})};
  if(plan.code==='CAF_CL')t.doubleFinal=true;
  if(plan.format==='groups'){const ids=shuffled(c,t.entrants,`${t.id}:groups`);t.groups=Array.from({length:ids.length/4},(_,i)=>ids.slice(i*4,i*4+4));t.maxSteps=t.leagueRounds+Math.log2(t.groups.length*2)*(t.singleLeg?1:2)-(t.singleLeg||t.doubleFinal?0:1);}
  if(plan.code==='AFC_ELITE')t.maxSteps=13;
  if(plan.format==='super'){t.maxSteps=Math.log2(t.entrants.length);const date=new Date(seasonDate(c.season,0));date.setUTCDate(date.getUTCDate()+19);t.calendar=Array.from({length:t.maxSteps},(_,i)=>new Date(date.getTime()+i*4*86400000).toISOString());}
  if(plan.format==='intercontinental'){t.maxSteps=4;const y=c.season.calendarYear??c.season.year;t.calendar=[5,9,13,17].map(d=>`${y}-12-${String(d).padStart(2,'0')}T00:00:00.000Z`);t.stage='아시아·태평양 플레이오프';t.byes=t.entrants.slice(2);t.fixtures.push({id:`${t.id}|first`,tieId:'first',homeId:t.entrants[0],awayId:t.entrants[1],round:1,step:1,leg:1,stage:t.stage,played:false});planDates(c,t);}
  else if(t.leagueRounds)leagueDraw(c,t);else knockoutDraw(c,t,t.entrants);
  state.current.push(t);
 }

}
function playedTable(t:ClubTournament){const table=new Map(emptyTable(t.entrants).map(r=>[r.clubId,r]));for(const f of t.fixtures.filter(f=>(f.stage==='리그 페이즈'||f.stage.startsWith('조별리그'))&&f.played)){
 const home=table.get(f.homeId)!,away=table.get(f.awayId)!,hg=f.homeGoals!,ag=f.awayGoals!;home.played++;away.played++;home.goalsFor+=hg;home.goalsAgainst+=ag;away.goalsFor+=ag;away.goalsAgainst+=hg;if(hg===ag){home.drawn++;away.drawn++;home.points++;away.points++;}else{const w=hg>ag?home:away,l=hg>ag?away:home;w.won++;w.points+=3;l.lost++;}}
 t.table=[...table.values()].sort((a,b)=>b.points-a.points||(b.goalsFor-b.goalsAgainst)-(a.goalsFor-a.goalsAgainst)||b.goalsFor-a.goalsFor||a.clubId.localeCompare(b.clubId));
}
function awardTitle(c:Career,t:ClubTournament){
 if(t.kind==='continental'&&t.format!=='super'&&t.format!=='intercontinental'){
  const maxApps=Math.max(1,...Object.values(t.playerStats??{}).map(r=>r.stats.apps));const rows=Object.values(t.playerStats??{}).filter(r=>r.stats.apps>=Math.max(2,Math.ceil(maxApps*.5))&&r.stats.minutes>=90),ranked=rows.sort((a,b)=>tournamentPerformance({id:b.playerId,...b})-tournamentPerformance({id:a.playerId,...a})||a.playerId.localeCompare(b.playerId));
  if(ranked[0]?.playerId===c.player.id){const id=`${t.id}:player-season:${c.player.id}`;if(!c.awards.some(a=>a.id===id))c.awards.push({id,year:t.year,clubId:c.player.clubId,name:t.id.startsWith('CLUB_WORLD_CUP:')?'FIFA 클럽 월드컵 골든볼':`${t.name} 시즌의 선수`,category:'continental-individual',organiser:t.id.startsWith('CLUB_WORLD_CUP:')?'FIFA':'해당 대륙 축구연맹',sourceUrl:t.id.startsWith('CLUB_WORLD_CUP:')?'https://www.fifa.com/':'https://www.uefa.com/',verification:'game-model',description:`해당 대회 실제 출전 선수 ${rows.length}명의 포지션별 경기 기여·평점·징계를 비교한 게임 내 평가. 리그·다른 컵·국대 기록 제외.`});}
 }

 const contribution=t.matches.filter(m=>m.playerClubId===t.winnerId&&m.playerStats.apps>0);
 if(c.player.squad!=='senior'||!contribution.length)return;
 const id=`${t.id}:champion:${c.player.id}`;if(c.awards.some(a=>a.id===id))return;
 const a={id,year:t.year,clubId:t.winnerId!,name:`${t.name} 우승 메달`,description:`실제 결승 승리 · ${contribution.reduce((n,m)=>n+m.playerStats.apps,0)}경기 출전`,category:'team'};c.awards.push(a);c.systems!.events.push({id,year:t.year,round:c.season.week,type:'award',title:a.name,body:a.description,importance:'milestone'});
}
function finishStep(c:Career,t:ClubTournament){
 if(t.format==='intercontinental'){
  const games=t.fixtures.filter(f=>f.step===t.step);if(!games.length||games.some(f=>!f.winnerId))return;
  const winners=games.map(f=>f.winnerId!);if(t.step===4){t.winnerId=winners[0];t.phase='completed';t.stage='우승 확정';t.active=winners;t.byes=[];awardTitle(c,t);return;}
  const pairs=t.step===1?[[winners[0],t.entrants[2]],[t.entrants[3],t.entrants[4]]]:t.step===2?[[winners[0],winners[1]]]:[[winners[0],t.entrants[5]]];
  t.stage=t.step===3?'결승':t.step===2?'챌린저컵':'대륙간 플레이오프';t.active=[...new Set([...pairs.flat(),...(t.step<3?[t.entrants[5]]:[])])];t.byes=t.step<3?[t.entrants[5]]:[];
  for(const [i,pair] of pairs.entries())t.fixtures.push({id:`${t.id}|step:${t.step+1}|${i}`,tieId:`step:${t.step+1}:${i}`,homeId:pair[0],awayId:pair[1],step:t.step+1,round:t.step+1,leg:1,stage:t.stage,played:false});planDates(c,t);return;
 }
 if(t.phase==='league'){
  playedTable(t);if(t.step<t.leagueRounds)return;
  if(t.groups||t.id.startsWith('AFC_ELITE:')){const groups=t.groups??[t.entrants.slice(0,12),t.entrants.slice(12)],ids=groups.flatMap(g=>t.table.filter(r=>g.includes(r.clubId)).slice(0,t.groups?2:8).map(r=>r.clubId));t.phase='knockout';knockoutDraw(c,t,ids);return;}
  const ids=t.table.map(r=>r.clubId);t.phase='knockout';knockoutDraw(c,t,ids.slice(8,24),'녹아웃 플레이오프');t.byes=ids.slice(0,8);t.active=[...t.byes,...t.active];return;
 }
 const current=t.fixtures.filter(f=>f.stage===t.stage&&f.step<=t.step),ties=[...new Set(current.map(f=>f.tieId))];
 if(current.some(f=>!f.played))return;
 const winners=ties.map(id=>current.filter(f=>f.tieId===id).at(-1)?.winnerId).filter((x):x is string=>!!x);
 if(winners.length!==ties.length)return;
 const next=[...t.byes,...winners];if(next.length===1){t.winnerId=next[0];t.phase='completed';t.stage='우승 확정';t.active=next;t.byes=[];awardTitle(c,t);return;}
 const stage=t.stage==='녹아웃 플레이오프'?'16강':undefined;knockoutDraw(c,t,next,stage);
}
function matchDayDate(c:Career,step:number,max:number,kind:ClubTournament['kind']){const next=Math.min(c.season.totalWeeks,Math.max(1,Math.ceil(step*c.season.totalWeeks/max)));let date=new Date(fixtureDate(c.season,next));date.setUTCDate(date.getUTCDate()-(kind==='continental'?1:kind==='leagueCup'?5:3));while(isInternationalBreak(date.toISOString()))date.setUTCDate(date.getUTCDate()-1);return {round:next,date:date.toISOString()};}
/** The supplied callback applies the same match effects/experience as a league game, exactly once. */
export function processClubCompetitions(c:Career,onMatch:(match:MatchRecord)=>void=()=>{},beforeMatch:(date:string)=>void=()=>{},throughDate?:string):MatchRecord[]{
 initializeClubCompetitions(c);const output:MatchRecord[]=[];
 let guard=0;
 while(guard++<1000){
  const candidates=(c.systems?.clubCompetitions?.current??[]).filter(t=>t.phase!=='completed').map(t=>{
   const pending=t.fixtures.filter(f=>!f.played),step=pending.length?Math.min(...pending.map(f=>f.step)):Infinity;
   const max=maxSteps(t);
   return {t,pending,step,schedule:Number.isFinite(step)?scheduleFor(c,t,step):{round:Infinity,date:''}};
  }).filter(row=>throughDate?row.schedule.date<=throughDate:row.schedule.round<=c.season.week).sort((a,b)=>a.schedule.date.localeCompare(b.schedule.date)||a.t.id.localeCompare(b.t.id));
  const row=candidates[0];if(!row)break;const {t,pending,step,schedule}=row;
   beforeMatch(schedule.date);
   for(const f of pending.filter(f=>f.step===step)){
    const own=c.player.squad==='senior'&&(f.homeId===c.player.clubId||f.awayId===c.player.clubId);
    if(own){const last=[...c.season.matches,...cupMatches(c,c.season.year),...c.systems!.national.matches].filter(x=>x.date&&x.date<schedule.date).sort((a,b)=>a.date!.localeCompare(b.date!)).at(-1);if(last?.date)c.player.fitness=Math.min(100,c.player.fitness+Math.min(18,Math.max(0,(Date.parse(schedule.date)-Date.parse(last.date))/86400000)*5));}
    if(own)syncManualInjury(c,schedule.date);
    const teams=[f.homeId,f.awayId].map(id=>({...getClub(id),power:getClubWorldPower(c,id)}));
    const m=simulateMatch(c,f,{home:teams[0],away:teams[1],homePlayers:getWorldClubPlayers(c,f.homeId),awayPlayers:getWorldClubPlayers(c,f.awayId),scope:'club',competitionId:t.id,date:schedule.date,userParticipates:own,detailed:own,neutralVenue:f.stage==='결승'});
    f.homeGoals=m.homeGoals;f.awayGoals=m.awayGoals;f.date=schedule.date;f.played=true;
    const tie=t.fixtures.filter(x=>x.tieId===f.tieId),last=f.leg===Math.max(...tie.map(x=>x.leg));
    if(t.phase==='knockout'&&last){
     const hg=tie.reduce((n,x)=>n+(x.homeId===f.homeId?x.homeGoals!:x.awayGoals!),0),ag=tie.reduce((n,x)=>n+(x.homeId===f.awayId?x.homeGoals!:x.awayGoals!),0);
     if(hg===ag){m.aggregate={home:hg,away:ag};resolveNationalShootout(c,m);f.shootout={home:m.shootout!.home,away:m.shootout!.away};f.winnerId=m.shootout!.winnerId;}else f.winnerId=hg>ag?f.homeId:f.awayId;
    }
    t.playerStats??={};for(const p of m.performers??[]){const row=t.playerStats[p.id]??(t.playerStats[p.id]={playerId:p.id,name:p.name,clubId:p.clubId,leagueId:c.systems!.world.clubs[p.clubId]?.leagueId??getClub(p.clubId).leagueId,position:p.position,nationality:p.nationality??getClub(p.clubId).country,ovr:p.ovr,stats:emptyStats()});addStats(row.stats,p.stats);}
    if(own){t.matches.push(m);output.push(m);onMatch(m);}
   }
   t.step=step;finishStep(c,t);
 }
 return output;
}
