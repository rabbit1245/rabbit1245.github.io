import {evaluateTournamentAwards} from './tournament-awards';
import type {Career,MatchRecord} from './types';
import type {InternationalWindow} from './national';
import {seededRandom,clamp} from './math';
type Stage='qualifying'|'friendly'|'group'|'round32'|'round16'|'quarterfinal'|'semifinal'|'final'|'thirdPlace';
type Contest={id:string;name:string;year:number;countries:string[]};
type Adapter={play:(c:Career,t:Contest,h:string,a:string,s:Stage,date:string,label:string)=>MatchRecord;select:(c:Career)=>void;power:(c:Career,country:string)=>number;};
const nation=(id:string)=>id.split(':')[1];
const won=(m:MatchRecord)=>m.shootout?.winnerId??(m.homeGoals>m.awayGoals?m.homeId:m.awayGoals>m.homeGoals?m.awayId:undefined);
const ledger=(c:Career)=>[...new Map([...c.systems!.national.history.flatMap(h=>h.matches),...c.systems!.national.matches,...c.systems!.national.teamResults??[]].map(m=>[m.fixtureId,m])).values()];
function ranked(ids:string[],matches:MatchRecord[]){
 const table=new Map(ids.map(id=>[id,{id,p:0,g:0,f:0,played:0}]));
 for(const m of matches){const h=table.get(nation(m.homeId)),a=table.get(nation(m.awayId));if(!h||!a)continue;h.played++;a.played++;h.g+=m.homeGoals-m.awayGoals;a.g+=m.awayGoals-m.homeGoals;h.f+=m.homeGoals;a.f+=m.awayGoals;if(m.homeGoals===m.awayGoals){h.p++;a.p++;}else(m.homeGoals>m.awayGoals?h:a).p+=3;}
 return [...table.values()].sort((a,b)=>b.p-a.p||b.g-a.g||b.f-a.f||a.id.localeCompare(b.id));
}
function groups(c:Career,ids:string[],size:number,salt:string,power:Adapter['power']){
 const count=Math.ceil(ids.length/size),out=Array.from({length:count},()=>[] as string[]),rng=seededRandom(`${c.seed}|national-groups|${salt}`);
 const seeded=ids.map(id=>({id,p:power(c,id),r:rng()})).sort((a,b)=>b.p-a.p||a.r-b.r);
 for(let p=0;p<seeded.length;p+=count){const pot=seeded.slice(p,p+count).sort((a,b)=>a.r-b.r);pot.forEach((r,i)=>out[i].push(r.id));}return out;
}
function pairs(ids:string[],round:number,legs=1):[string,string][]{
 const teams=[...ids];if(teams.length%2)teams.push('');const n=teams.length,days=n-1;if(round>=days*legs)return[];
 for(let r=0;r<round%days;r++)teams.splice(1,0,teams.pop()!);
 const result:[string,string][]=[];for(let i=0;i<n/2;i++){let pair:[string,string]=[teams[i],teams[n-1-i]];if((round+i)%2)pair.reverse();if(Math.floor(round/days)%2)pair.reverse();if(pair.every(Boolean))result.push(pair);}return result;
}
function fieldSize(id:string,count:number){const kind=id.split(':')[0];return Math.min(count,kind==='WC'?48:kind==='UEFA'||kind==='AFC'||kind==='CAF'||kind==='U20WC'?24:kind==='CONCACAF'?16:kind==='CONMEBOL'?10:8);}
export function advanceNationalWindow(c:Career,w:InternationalWindow,through:string,t:Contest,a:Adapter){
 const records=ledger(c),byFixture=new Map(records.map(m=>[m.fixtureId,m]));
 const n=c.systems!.national,prefix=w.date.slice(0,7),callup=`callup:${prefix}:${n.squad}`;
 if(n.processedWindows.some(key=>key.startsWith(`window:${prefix}:`)))return;
 if(!n.processedWindows.includes(callup)){a.select(c);n.processedWindows.push(callup);c.systems!.events.push({id:`national:${callup}`,year:c.season.year,round:c.season.week,type:'national',title:n.status==='called'?'국가대표 발탁':'국가대표 소집 평가',body:n.reason,importance:'brief'});}
 n.competitionId=t.id;n.competitionName=t.name;
 const lookup=(stage:Stage,label:string,contest=t)=>byFixture.get(`NAT|${n.squad}|${contest.id}|${stage}|${label}`);
 const due=(h:string,v:string,stage:Stage,date:string,label:string,contest=t)=>{
  const id=`NAT|${n.squad}|${contest.id}|${stage}|${label}`;
  if(h===n.country||v===n.country){n.schedule??=[];if(!n.schedule.some(f=>f.id===id))n.schedule.push({id,date,competitionId:contest.id,stage,squad:n.squad,homeId:`NAT:${h}:${n.squad}`,awayId:`NAT:${v}:${n.squad}`});}
  const existing=lookup(stage,label,contest);if(existing)return existing;if(Date.parse(date)>Date.parse(through))return undefined;
  if(h===n.country||v===n.country){const previous=[...n.matches].reverse().find(m=>m.date&&m.date>=w.date&&m.date<date);if(previous?.date){const days=Math.max(0,(Date.parse(date)-Date.parse(previous.date))/86400000);c.player.fitness=clamp(c.player.fitness+Math.min(20,days*6),0,100);}}
  const match=a.play(c,contest,h,v,stage,date,label);records.push(match);byFixture.set(match.fixtureId,match);return match;
 };
 const key=`${n.squad}|${t.id}`;n.qualifyingDraws??={};
 const draw=n.qualifyingDraws[key]??(n.qualifyingDraws[key]={groups:groups(c,t.countries,4,`${key}:qualifying`,a.power),legs:c.season.index===1&&t.year===Number(c.createdAt.slice(0,4))?1:2});
 const size=fieldSize(t.id,t.countries.length),rounds=3*draw.legs;
 const played=records.filter(m=>m.competitionId===t.id&&m.homeId.endsWith(`:${n.squad}`)&&m.fixtureId.includes('|qualifying|q:'));
 const completeRounds=Array.from({length:rounds},(_,r)=>r).filter(r=>draw.groups.every((g,gi)=>pairs(g,r,draw.legs).every((_,i)=>lookup('qualifying',`q:${gi}:${r}:${i}`))));
 const finalYear=w.year===t.year&&w.month===6;
 n.windowQualifiers??={};const planKey=`${key}|${prefix}`;
 const nextRounds=n.windowQualifiers[planKey]??(n.windowQualifiers[planKey]=Array.from({length:rounds},(_,r)=>r).filter(r=>!completeRounds.includes(r)).slice(0,finalYear?rounds:2));
 for(const [offset,r] of nextRounds.entries())for(const [gi,g] of draw.groups.entries())for(const [i,[h,v]] of pairs(g,r,draw.legs).entries()){
  const day=w.month===6?2+offset*3:19+offset*5;
  due(h,v,'qualifying',`${prefix}-${String(day).padStart(2,'0')}`,`q:${gi}:${r}:${i}`);
 }
 const complete=draw.groups.every((g,gi)=>Array.from({length:rounds},(_,r)=>pairs(g,r,draw.legs).every((_,i)=>lookup('qualifying',`q:${gi}:${r}:${i}`))).every(Boolean));
 const tables=draw.groups.map((g,gi)=>ranked(g,records.filter(m=>m.competitionId===t.id&&m.fixtureId.includes(`|qualifying|q:${gi}:`))));
 const qualified=tables.flatMap(table=>table.map((r,i)=>({...r,rank:i}))).sort((x,y)=>x.rank-y.rank||y.p/Math.max(1,y.played)-x.p/Math.max(1,x.played)||y.g-x.g||y.f-x.f||x.id.localeCompare(y.id)).slice(0,size).map(r=>r.id);
 const own=tables.find(rows=>rows.some(r=>r.id===n.country));n.rank=(own?.findIndex(r=>r.id===n.country)??-1)+1;n.points=own?.find(r=>r.id===n.country)?.p??0;n.qualified=complete&&qualified.includes(n.country);
 if(!finalYear){
  n.phase=complete?'friendlies':'qualifying';
  if(nextRounds.length===0){
   const friendly:Contest={id:`FRIENDLIES:${w.year}`,name:`${w.year} 국제친선`,year:w.year,countries:t.countries};
   const rng=seededRandom(`${c.seed}|friendlies|${n.country}|${prefix}`),guests=t.countries.filter(x=>x!==n.country).map(id=>({id,r:rng()})).sort((x,y)=>x.r-y.r).slice(0,rng()<.3?1:2);
   guests.forEach((r,i)=>due(i?n.country:r.id,i?r.id:n.country,'friendly',`${prefix}-${w.month===6?String(5+i*5).padStart(2,'0'):19+i*5}`,`${prefix}:friendly:${i}`,friendly));
  }
 }else if(complete){
  n.phase=n.qualified?'finals':'eliminated';n.finalDraws??={};
  const finals=n.finalDraws[key]??(n.finalDraws[key]={groups:groups(c,qualified,size===10?5:4,`${key}:finals`,a.power),size});
  const groupRounds=finals.groups[0].length%2===0?finals.groups[0].length-1:finals.groups[0].length;
  const start=Math.max(10,2+nextRounds.length*3+2);
  for(let r=0;r<groupRounds;r++)for(const [gi,g]of finals.groups.entries())for(const [i,[h,v]]of pairs(g,r).entries())due(h,v,'group',`${t.year}-06-${String(start+r*4).padStart(2,'0')}`,`g:${gi}:${r}:${i}`);
  const groupDone=finals.groups.every((g,gi)=>Array.from({length:groupRounds},(_,r)=>pairs(g,r).every((_,i)=>lookup('group',`g:${gi}:${r}:${i}`))).every(Boolean));
  if(groupDone){
   const bracketSize=size===48?32:size===24?16:size>=10?8:4;
   const rows=finals.groups.flatMap((g,gi)=>ranked(g,records.filter(m=>m.competitionId===t.id&&m.fixtureId.includes(`|group|g:${gi}:`))).map((r,rank)=>({...r,rank})));
   let active=rows.sort((x,y)=>x.rank-y.rank||y.p-x.p||y.g-x.g||y.f-x.f||x.id.localeCompare(y.id)).slice(0,Math.min(bracketSize,rows.length)).map(r=>r.id);
   // Knockout pairs have distinct group opponents where possible; all advancing sides earned group points.
   const slots=2**Math.floor(Math.log2(active.length));active=active.slice(0,slots);let count=slots,index=0;
   while(count>=2){
    const stage:Stage=count===2?'final':count===4?'semifinal':count===8?'quarterfinal':count===16?'round16':'round32';
    const date=new Date(Date.UTC(t.year,5,start+(groupRounds-1)*4+5+index*5)).toISOString().slice(0,10),games:MatchRecord[]=[];
    for(let i=0;i<active.length/2;i++){const m=due(active[i],active[active.length-1-i],stage,date,`ko:${count}:${i}`);if(m)games.push(m);}
    if(games.length!==active.length/2)break;
    if(count===4&&/^(WC|U20WC|CONMEBOL|CAF):/.test(t.id)){
     const losers=games.map(m=>nation(won(m)===m.homeId?m.awayId:m.homeId)),thirdDate=new Date(Date.parse(date)+4*86400000).toISOString().slice(0,10);
     due(losers[0],losers[1],'thirdPlace',thirdDate,'ko:third');
    }
    active=games.map(m=>nation(won(m)!));count=active.length;index++;
   }
   if(active.length===1){
    const final=records.find(m=>m.competitionId===t.id&&m.fixtureId.includes('|final|ko:2:'));
    if(final&&!c.systems!.events.some(e=>e.id===`national-full:${key}:winner`)){
     c.systems!.events.push({id:`national-full:${key}:winner`,year:c.season.year,round:c.season.week,type:'national',title:`${t.name} · ${active[0]} 우승`,body:'예선·조별리그·모든 토너먼트의 실제 승자',importance:active[0]===n.country?'milestone':'brief'});
     const ownFinals=records.filter(m=>m.competitionId===t.id&&m.playerClubId===`NAT:${n.country}:${n.squad}`&&/\|(group|round32|round16|quarterfinal|semifinal|final|thirdPlace)\|/.test(m.fixtureId));
     if(active[0]===n.country&&ownFinals.some(m=>m.playerStats.apps>0))c.awards.push({id:`${c.season.year}:national:${t.id}:${c.player.id}`,year:c.season.year,name:`${t.name} 우승`,clubId:c.player.clubId,category:'national',description:`실제 본선 ${ownFinals.reduce((v,m)=>v+m.playerStats.apps,0)}경기 출전 · 결승 승리`});
     for(const award of evaluateTournamentAwards(c))if(!c.awards.some(x=>x.id===award.id))c.awards.push(award);
    }
   }
   if(!active.includes(n.country))n.phase='eliminated';
  }
 }
 if(Date.parse(through)>=Date.parse(w.endDate)&&!n.processedWindows.some(x=>x.startsWith(`window:${prefix}:`)))n.processedWindows.push(`window:${prefix}:${n.squad}`);
}
