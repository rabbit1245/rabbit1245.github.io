import {actionCoverage,ACTION_LABELS} from './action-metrics';
import {employmentLines,recordedEmployment} from './employment';
import {playSkillsForYear,retirementPlaySkillNames} from './play-skills';
import {moneyText,currencyText} from './currency';
import {cupMatches,cupStats,cupLedger,tournamentResult} from './club-competitions';
import {POSITION_LABELS} from './attributes';
import {getClub,getLeague} from './data';
import {ALL_STATS,emptyStats,sumStats} from './math';
import {competitionLabel,seasonHonours} from './honours';
import type {Career,MatchRecord,PlayerStats,SeasonSummary} from './types';
import type {CupFixture} from './revision-types';

export const STAT_TEXT:Record<string,string>={apps:'출전 경기',starts:'선발 경기',minutes:'출전 시간(분)',goals:'득점(골)',assists:'도움(개)',shots:'슈팅(회)',shotsOnTarget:'유효 슈팅(회)',passes:'패스 시도(회)',passesCompleted:'패스 성공(회)',tackles:'태클 성공(회)',interceptions:'인터셉트(회)',saves:'선방(회)',goalsConceded:'실점(골)',cleanSheets:'무실점 경기',ratingSum:'평점 합계',ratingCount:'평점 집계 경기',yellowCards:'경고(회)',redCards:'퇴장(회)',mom:'경기 최우수 선수(회)',keyPasses:'키패스(회)',dribbleAttempts:'드리블 시도(회)',dribblesCompleted:'드리블 성공(회)',tackleAttempts:'태클 시도(회)',aerialAttempts:'공중볼 경합 시도(회)',aerialWon:'공중볼 경합 성공(회)',shotsFaced:'피유효슈팅(회)',oneOnOneAttempts:'일대일 대응(회)',oneOnOneSaves:'일대일 선방(회)',penaltiesFaced:'피페널티(회)',penaltiesSaved:'페널티 선방(회)',crossesFaced:'피크로스(회)',crossesCaught:'크로스 포구(회)',sweepingAttempts:'스위핑 시도(회)',sweepingSuccesses:'스위핑 성공(회)',buildUpPasses:'빌드업 패스 시도(회)',buildUpCompleted:'빌드업 패스 성공(회)',longKicks:'롱킥 시도(회)',longKicksCompleted:'롱킥 성공(회)',handlingAttempts:'공 처리 시도(회)',handlingSuccesses:'공 처리 성공(회)',lateActions:'후반 행동(회)',lateSuccesses:'후반 행동 성공(회)',detailedApps:'세부 행동 집계 경기',headerGoals:'헤더 득점(골)',pressingWins:'압박 성공(회)',progressivePasses:'전진 패스 성공(회)',punches:'펀칭 성공(회)',actionApps:'신규 행동 집계 경기',actionMinutes:'신규 행동 집계 시간(분)'};
const rates:[string,keyof PlayerStats,keyof PlayerStats][]=[
 ['득점 전환율','goals','shots'],['슈팅 정확도','shotsOnTarget','shots'],
 ['패스 성공률','passesCompleted','passes'],['드리블 성공률','dribblesCompleted','dribbleAttempts'],
 ['태클 성공률','tackles','tackleAttempts'],['공중볼 성공률','aerialWon','aerialAttempts'],
 ['선방률','saves','shotsFaced'],['일대일 선방률','oneOnOneSaves','oneOnOneAttempts'],
 ['페널티 선방률','penaltiesSaved','penaltiesFaced'],['크로스 포구율','crossesCaught','crossesFaced'],
 ['스위핑 성공률','sweepingSuccesses','sweepingAttempts'],['빌드업 패스 성공률','buildUpCompleted','buildUpPasses'],
 ['롱킥 성공률','longKicksCompleted','longKicks'],['공 처리 성공률','handlingSuccesses','handlingAttempts'],
 ['후반 행동 성공률','lateSuccesses','lateActions'],
];
const baseline=new Set(['apps','starts','minutes','goals','assists','shots','shotsOnTarget','passes','passesCompleted','tackles','interceptions','saves','goalsConceded','cleanSheets','ratingSum','ratingCount','yellowCards','redCards']);
const name=(id:string)=>{
 if(id.startsWith('NAT:')){const [,country,squad]=id.split(':');return `${country} ${squad==='U20'?'20세 이하 대표팀':'성인 대표팀'}`;}
 try{return getClub(id).name;}catch{return '소속 미기록';}
};
const unique=(matches:MatchRecord[])=>[...new Map(matches.map(m=>[m.fixtureId||m.id,m])).values()];
const average=(s:PlayerStats)=>s.ratingCount?(s.ratingSum/s.ratingCount).toFixed(2):'미집계';
const summary=(s:PlayerStats)=>`${s.apps}경기 · ${s.minutes}분 · ${s.goals}골 · ${s.assists}도움 · 평균 평점 ${average(s)}`;
const roleText=(role:string)=>role==='captain'?'주장':role==='vice'?'부주장':role==='match'?'임시 주장':'해당 없음';

/** Gameplay keeps its complete source ledger; the retirement report only prints finals. */
export function careerMatchLedger(c:Career){
 return {
  club:unique([...c.history.flatMap(h=>h.matches),...c.season.matches,...cupMatches(c)]),
  national:unique([...(c.systems?.national.history.flatMap(h=>h.matches)??[]),...(c.systems?.national.matches??[])]),
 };
}
export function careerRecordYears(c:Career){return [...new Set([...c.history.map(h=>h.year),c.season.year])].sort((a,b)=>a-b);}
export function careerRecordTotals(c:Career){
 const club=sumStats([cupStats(c),...c.history.map(h=>h.stats),...(!c.history.some(h=>h.year===c.season.year)?[c.season.playerStats]:[])]);
 const national=sumStats(careerMatchLedger(c).national.map(m=>m.playerStats));
 return {club,national,all:sumStats([club,national])};
}
/** Unknown historical counters stay unknown; rates never manufacture missing denominators. */
export function careerStatsLines(stats:PlayerStats,matches:readonly MatchRecord[]):string[]{
 const detailed=sumStats(matches.filter(m=>m.metricsVersion===2).map(m=>m.playerStats));
 const incomplete=stats.apps>(stats.detailedApps??0);
 const known=(key:keyof PlayerStats)=>stats[key]!==undefined&&(!incomplete||baseline.has(key)||(stats.detailedApps??0)>0||stats[key]!==0);
 const lines=[summary(stats)];
 if(incomplete)lines.push(`세부 기록 보존: ${stats.detailedApps??0}/${stats.apps}경기 · 미집계 지표는 과거 기록 미보존으로 표시`);
 for(const key of ALL_STATS){
  if(['ratingSum','ratingCount','detailedApps','actionApps','actionMinutes'].includes(key))continue;
  if(key in ACTION_LABELS){const coverage=actionCoverage(stats);lines.push(`${STAT_TEXT[key]}: ${coverage.known?`${stats[key]??0}${coverage.partial?` · 신규 집계 ${coverage.apps}/${stats.apps}경기 · 과거 미집계 제외`:''}`:'미집계 · 과거 원본 이벤트 없음'}`);continue;}
  lines.push(`${STAT_TEXT[key]}: ${known(key)?stats[key]:'과거 기록 미보존'}`);
 }
 for(const [label,numerator,denominator] of rates){
  const partial=incomplete&&(!baseline.has(numerator)||!baseline.has(denominator));
  const measured=partial&&(detailed.detailedApps??0)>0;
  const s=measured?detailed:stats,a=s[numerator],b=s[denominator];
  const available=measured||known(numerator)&&known(denominator);
  lines.push(`${label}: ${!available||a===undefined||b===undefined?'과거 기록 미보존':b===0?'해당 없음 (시도 0회)':`${(a/b*100).toFixed(2)}% (${a}/${b})`}${measured?' · 세부 기록 보존 경기 기준':''}`);
 }
 return lines;
}
function seasonClubIds(c:Career,year:number){
 const h=c.history.find(h=>h.year===year),matches=h?.matches??(year===c.season.year?c.season.matches:[]);
 return new Set([h?.clubId??matches[0]?.playerClubId??c.player.clubId,...matches.map(m=>m.playerClubId)]);
}
function winner(m:MatchRecord){return m.shootout?.winnerId??(m.homeGoals>m.awayGoals?m.homeId:m.awayGoals>m.homeGoals?m.awayId:undefined);}
export interface CareerFinal {
 competition:string;teamId:string;result:string;aggregate?:string;
 legs:{label:string;home:string;away:string;homeGoals?:number;awayGoals?:number;result:string;shootout:string;match?:MatchRecord}[];
}
function cupFinalLeg(f:CupFixture,m:MatchRecord|undefined,teamId:string,multiple:boolean):CareerFinal['legs'][number]{
 const homeGoals=m?.homeGoals??f.homeGoals,awayGoals=m?.awayGoals??f.awayGoals;
 const played=f.played&&homeGoals!==undefined&&awayGoals!==undefined;
 const pk=m?.shootout??f.shootout;
 const own=teamId===f.homeId,winId=m?.shootout?.winnerId??f.winnerId;
 const a=own?homeGoals:awayGoals,b=own?awayGoals:homeGoals;
 return {label:multiple?`결승 ${f.leg}차전`:'결승',home:name(f.homeId),away:name(f.awayId),
  ...(played?{homeGoals,awayGoals}:{}),
  result:!played?'미진행':pk&&winId?(winId===teamId?'승부차기 승리':'승부차기 패배'):(a??0)>(b??0)?'승리':(a??0)<(b??0)?'패배':'무승부',
  shootout:!played?'미진행':pk?`승부차기 ${pk.home}:${pk.away}`:'승부차기 없음',match:m};
}
export function careerFinals(c:Career,year:number,ledger=careerMatchLedger(c)):CareerFinal[]{
 const own=seasonClubIds(c,year),finals:CareerFinal[]=[];
 for(const t of cupLedger(c,year))for(const teamId of own){
  const fixtures=t.fixtures.filter(f=>f.stage==='결승'&&(f.homeId===teamId||f.awayId===teamId)).sort((a,b)=>a.leg-b.leg);
  if(!fixtures.length)continue;
  const legs=fixtures.map(f=>cupFinalLeg(f,t.matches.find(m=>m.fixtureId===f.id),teamId,fixtures.length>1));
  const played=legs.every(l=>l.homeGoals!==undefined&&l.awayGoals!==undefined);
  const gf=fixtures.reduce((n,f,i)=>n+(f.homeId===teamId?legs[i].homeGoals??0:legs[i].awayGoals??0),0);
  const ga=fixtures.reduce((n,f,i)=>n+(f.homeId===teamId?legs[i].awayGoals??0:legs[i].homeGoals??0),0);
  const last=fixtures.at(-1)!,lastMatch=legs.at(-1)!.match;
  const winId=t.winnerId??last.winnerId??lastMatch?.shootout?.winnerId??(played&&gf!==ga?(gf>ga?teamId:last.homeId===teamId?last.awayId:last.homeId):undefined);
  finals.push({competition:t.name,teamId,result:!played?'결승 진출 · 미진행':winId===teamId?'승리 · 우승':winId?'패배 · 준우승':'최종 결과 미보존',
   ...(fixtures.length>1&&played?{aggregate:`합산 스코어: ${name(teamId)} ${gf}:${ga} ${name(last.homeId===teamId?last.awayId:last.homeId)}`} :{}),legs});
 }
 for(const m of ledger.national.filter(m=>m.seasonYear===year&&m.fixtureId.includes('|final|')&&(m.homeId===m.playerClubId||m.awayId===m.playerClubId))){
  const winId=winner(m);
  finals.push({competition:competitionLabel(c,m.competitionId),teamId:m.playerClubId,result:winId===m.playerClubId?'승리 · 우승':winId?'패배 · 준우승':'최종 결과 미보존',legs:[{
   label:'결승',home:m.homeName??name(m.homeId),away:m.awayName??name(m.awayId),homeGoals:m.homeGoals,awayGoals:m.awayGoals,
   result:winId===m.playerClubId?'승리':winId?'패배':'무승부',shootout:m.shootout?`승부차기 ${m.shootout.home}:${m.shootout.away}`:'승부차기 없음',match:m,
  }]});
 }
 // A scheduled final is a real qualification, even if the player retires before kick-off.
 if(year===c.season.year)for(const f of c.systems?.national.schedule??[]){
  if(!['final','결승'].includes(f.stage)||ledger.national.some(m=>m.fixtureId===f.id))continue;
  const teamId=f.homeId.startsWith(`NAT:${c.player.nationality}:`)?f.homeId:f.awayId;
  if(!teamId.startsWith(`NAT:${c.player.nationality}:`))continue;
  finals.push({competition:competitionLabel(c,f.competitionId),teamId,result:'결승 진출 · 미진행',legs:[{label:'결승',home:name(f.homeId),away:name(f.awayId),result:'미진행',shootout:'미진행'}]});
 }
 return finals;
}
function financials(c:Career,year:number,h:SeasonSummary|undefined,clubId:string){
 const e=c.systems?.economics,current=year===c.season.year&&!h;
 const value=h?.details?.marketValue??(current?e?.marketValue:undefined)??e?.valueHistory.filter(v=>v.year===year).at(-1)?.value;
 const contracts=(e?.contractHistory??[]).filter(r=>r.year+(r.effective==='nextSeason'?1:0)<=year&&r.current.clubId===clubId&&r.current.signedYear<=year&&r.current.expiresYear>=year).sort((a,b)=>a.year-b.year||a.round-b.round);
 const wage=h?.details?.contract.wage??(current?c.player.wage:undefined)??contracts.at(-1)?.current.wage;
 const periods=recordedEmployment(c,year);
 return {value:value===undefined?'과거 기록 미보존':moneyText(value),wage:periods.length?periods.map(r=>`${name(r.clubId)} ${moneyText(r.wage)}`).join(' → '):wage===undefined?'과거 기록 미보존':moneyText(wage)};
}
function seasonLeadership(c:Career,year:number,h:SeasonSummary|undefined,clubId:string){
 const l=c.systems?.leadership;
 const clubs=new Set([clubId,...recordedEmployment(c,year).map(r=>r.clubId)]);
 const terms=l?.terms.filter(t=>t.startYear<=year&&(t.endYear??Infinity)>=year&&(t.scope==='national'||clubs.has(t.teamId)))??[];
 const labels=terms.map(t=>`${name(t.teamId)} ${roleText(t.role)}`);
 const snapshot=h?.details?.captain??(year===c.season.year&&!h&&l?{club:l.clubRole,national:l.nationalRole}:undefined);
 if(snapshot?.club&&snapshot.club!=='none')labels.push(`${name(clubId)} ${roleText(snapshot.club)}`);
 if(snapshot?.national&&snapshot.national!=='none'&&!terms.some(t=>t.scope==='national'&&t.role===snapshot.national))labels.push(`국가대표 ${roleText(snapshot.national)}`);
 return [...new Set(labels)].join(' / ')||(snapshot?'해당 없음':'과거 기록 미보존');
}
function seasonInjuries(c:Career,year:number,matches:MatchRecord[]){
 const manual=c.systems?.manualInjuries?.filter(r=>!r.pendingNextSeason&&(r.year===year||r.missed.some(m=>m.year===year)||matches.some(m=>m.date&&m.date>=r.start&&m.date<(r.returned??r.end))))??[];
 const recorded=matches.some(m=>(m.effects?.injuryWeeksAfter??0)>0||m.events.some(e=>e.type==='injury'&&(e.playerId===c.player.id||e.playerName===c.player.name)));
 const active=year===c.season.year&&c.player.injuryWeeks>0;
 const missed=new Set(manual.flatMap(r=>r.missed.filter(m=>m.year===year).map(m=>m.fixtureId))).size;
 if(recorded||manual.length||active)return `부상 있음${active?' · 은퇴/현재 시점 부상 중':''}${manual.some(r=>r.selectionVersion===2&&r.duration==='season')?' · 시즌 전체 부상 (선택 이후 남은 전 경기 결장)':''}${missed?` · 확인된 결장 ${missed}경기 (클럽 ${new Set(manual.flatMap(r=>r.missed.filter(m=>m.year===year&&m.scope==='club').map(m=>m.fixtureId))).size} · 국대 ${new Set(manual.flatMap(r=>r.missed.filter(m=>m.year===year&&m.scope==='national').map(m=>m.fixtureId))).size})`:''}`;
 if(matches.length&&matches.every(m=>m.effects!==undefined))return '부상 없음';
 if(year===c.season.year&&c.season.week===0)return '부상 없음';
 return '과거 기록 미보존';
}
function nationalResults(c:Career,year:number,matches:MatchRecord[]){
 const n=c.systems?.national,groups=new Map<string,MatchRecord[]>();
 for(const m of matches){const key=`${m.competitionId}|${m.playerClubId}`;groups.set(key,[...(groups.get(key)??[]),m]);}
 return [...groups.values()].map(ms=>{
  const m=ms[0],archive=n?.history.find(h=>h.year===year&&h.competitionId===m.competitionId&&m.playerClubId.endsWith(`:${h.squad}`));
  const final=ms.find(m=>m.fixtureId.includes('|final|')),third=ms.find(m=>m.fixtureId.includes('|thirdPlace|'));
  const knockout=[...ms].reverse().find(m=>/\|(semifinal|quarterfinal|round16|round32)\|/.test(m.fixtureId));
  const stages:[string,string][]=[['thirdPlace','3·4위전'],['semifinal','4강'],['quarterfinal','8강'],['round16','16강'],['round32','32강'],['group','조별리그'],['qualifying','예선'],['friendly','친선 경기']];
  const stage=stages.find(([id])=>ms.some(m=>m.fixtureId.includes(`|${id}|`)))?.[1]??'진행 기록 미보존';
  const result=final?(winner(final)===m.playerClubId?'우승':'준우승'):third?(winner(third)===m.playerClubId?'3위':'4위'):knockout&&winner(knockout)&&winner(knockout)!==m.playerClubId?`${stage} 탈락`:archive?.result??(n?.competitionId===m.competitionId&&n?.phase==='eliminated'?`${stage} 탈락`:`${stage} 참가`);
  return `${competitionLabel(c,m.competitionId)} · ${name(m.playerClubId)} · ${result}`;
 });
}
export function careerSeasonRecords(c:Career){
 const ledger=careerMatchLedger(c);
 return careerRecordYears(c).map(year=>{
  const h=c.history.find(h=>h.year===year),current=year===c.season.year;
  const clubId=h?.clubId??(current?c.season.matches[0]?.playerClubId:undefined)??c.player.clubId;
  const leagueMatches=h?.matches??(current?c.season.matches:[]),clubMatches=unique([...leagueMatches,...cupMatches(c,year)]),nationalMatches=ledger.national.filter(m=>m.seasonYear===year);
  const clubStats=sumStats([h?.stats??(current?c.season.playerStats:emptyStats()),cupStats(c,year)]),nationalStats=sumStats(nationalMatches.map(m=>m.playerStats));
  const retired=c.stage==='retired'&&year===(c.retiredYear??c.season.year),completed=h?.completed??c.season.completed;
  const rank=h?.rank??(c.season.table.findIndex(t=>t.clubId===clubId)+1),leagueName=h?.competitionName??c.season.competitionName;
  const row=h?.details?.table.find(t=>t.clubId===clubId)??(!h?c.season.table.find(t=>t.clubId===clubId):undefined);
  const leagueResult=`${leagueName} · ${rank>0?`${rank}위`:'순위 미보존'}${completed?' (최종)':retired?' (은퇴 시점)':' (진행 중)'}${row?` · ${row.won}승 ${row.drawn}무 ${row.lost}패 · 승점 ${row.points}점`:''}`;
  const employmentResults=h?.details?.employmentStandings?.map(r=>`${name(r.clubId)} · ${getLeague(r.leagueId).name} · ${r.rank}위${completed?' (최종)':''} · ${r.won}승 ${r.drawn}무 ${r.lost}패 · 승점 ${r.points}점`);
  const own=seasonClubIds(c,year),honours=seasonHonours(c,year),finals=careerFinals(c,year,ledger);
  const cups=cupLedger(c,year).flatMap(t=>[...own].filter(id=>t.entrants.includes(id)).map(id=>`${t.name} · ${name(id)} · ${tournamentResult(t,id)==='결승 탈락'?'준우승 (결승 탈락)':tournamentResult(t,id)}`));
  const judging=c.systems?.rankings.find(r=>r.year===year),globalNames=/발롱도르|FIFPRO|The Best FIFA|야신 트로피|코파 트로피|유러피언 골든슈/;
  const awardResults=(judging?.diagnostics??[]).filter(d=>d.eligible&&globalNames.test(d.name)).map(d=>`${d.name}: ${d.name==='발롱도르'&&d.result==='미선정'?(d.detail.match(/전체 (\d+)위/)?.[1]?d.detail.match(/전체 (\d+)위/)![1]+'위':'후보권 밖')+' · 30인 후보 제외':d.result}`);
  return {year,employment:employmentLines(c,year),awardResults,playSkills:retirementPlaySkillNames(h?.position??c.player.position,playSkillsForYear(c,year)),age:h?.age??c.player.age,clubId,clubName:recordedEmployment(c,year).length?[...new Set(recordedEmployment(c,year).map(r=>name(r.clubId)))].join(' → '):h?.clubName??name(clubId),
   status:retired?`은퇴${completed?' (시즌 종료 후)':' (시즌 도중)'}`:completed?'시즌 종료':'진행 중',
   ovrStart:h?.ovrStart??c.season.ovrStart,ovrEnd:h?.ovrEnd??c.player.ovr,
   ...financials(c,year,h,clubId),leadership:seasonLeadership(c,year,h,clubId),injury:seasonInjuries(c,year,[...clubMatches,...nationalMatches]),
   stats:sumStats([clubStats,nationalStats]),clubStats,nationalStats,matches:[...clubMatches,...nationalMatches],
   results:[...(employmentResults?.length?employmentResults:clubId==='FA'&&!leagueMatches.length?['FA · 클럽 리그 미참가']:[leagueResult]),...cups,...nationalResults(c,year,nationalMatches)],
   titles:honours.titles,teamAwards:[...new Set([
    ...honours.titles.map(t=>`${t.team} · ${t.name} 우승`),
    ...honours.teamAwards.filter(a=>!honours.titles.some(t=>a.name.replace(/\s*우승(?:\s*(?:메달|트로피))?$/,'')===t.name)).map(a=>`${a.category==='team'?name(a.clubId):`${c.systems?.national.country??c.player.nationality} 대표팀`} · ${a.name}`),
   ])],personal:honours.personal,finals};
 });
}

/** A concise Korean career record, without event timelines or internal diagnostics. */
export function* careerTextChunks(c:Career):Generator<string>{
 const p=c.player,ledger=careerMatchLedger(c),totals=careerRecordTotals(c),seasons=careerSeasonRecords(c);
 const line=(v='')=>`${currencyText(v)}\r\n`,section=(title:string)=>line()+line('='.repeat(50))+line(title)+line('='.repeat(50));
 yield '\ufeff';yield line(`K볼 · ${p.name} · ${c.stage==='retired'?'은퇴 기록':'커리어 기록'}`);
 yield section('A. 선수 기본 정보');
 yield line(`이름: ${p.name} · 국적: ${p.nationality}`);
 yield line(`신체정보: ${p.height}cm / ${p.weight}kg · 주발: ${{right:'오른발',left:'왼발',both:'양발'}[p.foot]}`);
 yield line(`팀: ${name(p.clubId)}`);
 yield line(`포지션: ${POSITION_LABELS[p.position]} · 세부 역할: ${p.style} · 부 포지션: ${p.secondaryPositions.map(k=>POSITION_LABELS[k]).join(', ')||'없음'}`);
 yield line(`은퇴나이: ${c.stage==='retired'?`${p.age}세`:'현역'}${c.stage==='retired'?` · 은퇴 시즌: ${c.retiredYear??c.season.year}년`:''}`);
 yield section('B. 통산 총합 스탯 · 팀 수상');
 yield line(`[통산 총합] ${summary(totals.all)}`);
 yield line(`클럽: ${summary(totals.club)}`);yield line(`국가대표: ${summary(totals.national)}`);
 for(const row of careerStatsLines(totals.all,[...ledger.club,...ledger.national]).slice(1))yield line(row);
 yield line('팀 수상:');
 const teamAwards=seasons.flatMap(h=>h.teamAwards.map(award=>`${h.year}년 · ${award}`));
 if(!teamAwards.length)yield line('기록된 팀 수상 없음');
 for(const award of teamAwards)yield line(award);
 yield section('C. 연도별 기록');
 for(const h of seasons){
  yield line();yield line(`[${h.year}시즌] ${h.status} · ${h.age}세`);
  yield line(`소속팀: ${h.clubName}`);
  for(const period of h.employment)yield line(`소속 기간: ${period}`);
  yield line(`몸값: ${h.value}`);yield line(`주급: ${h.wage}`);
  yield line(`능력점수: ${h.ovrStart} → ${h.ovrEnd}`);
  if(h.playSkills.length)yield line(`플레이스타일: ${h.playSkills.join(' / ')}`);
  yield line(`주장/부주장 여부: ${h.leadership}`);yield line(`부상 유무: ${h.injury}`);
  yield line(`팀 수상: ${h.teamAwards.join(' / ')||'없음'}`);
  yield line('대회별 팀 성적:');for(const result of h.results)yield line(`- ${result}`);
  yield line(`개인 수상: ${h.personal.map(a=>a.name).join(' / ')||'없음'}`);
  if(h.awardResults.length)yield line(`개인상 평가 결과: ${h.awardResults.join(' / ')}`);
  yield line(`클럽 기록: ${summary(h.clubStats)}`);yield line(`국가대표 기록: ${summary(h.nationalStats)}`);
  yield line('시즌 통합 세부 스탯 · 성공률:');for(const row of careerStatsLines(h.stats,h.matches))yield line(row);
  yield line(`결승 기록: ${h.finals.length?'':'결승 진출 기록 없음'}`);
  for(const f of h.finals){
   yield line(`${f.competition} · ${name(f.teamId)} · ${f.result}`);
   if(f.aggregate)yield line(f.aggregate);
   for(const leg of f.legs){
    yield line(`${leg.label}: ${leg.home} ${leg.homeGoals===undefined?'미진행':`${leg.homeGoals}:${leg.awayGoals}`} ${leg.away} · ${leg.result} · ${leg.shootout}`);
    if(leg.homeGoals===undefined)continue;
    if(!leg.match){yield line('내 결승 기록: 과거 기록 미보존');continue;}
    yield line(`내 결승 기록: ${leg.match.playerPlayed?leg.match.playerStarted?'선발 출전':'교체 출전':'미출전'}`);
    if(leg.match.shootout){const kicks=leg.match.shootout.attempts.filter(a=>a.playerId===p.id);yield line(`내 승부차기: ${kicks.length?`${kicks.length}회 시도 · ${kicks.filter(a=>a.scored).length}회 성공`:'미참여'}`);}
    for(const row of careerStatsLines(leg.match.playerStats,[leg.match]))yield line(row);
   }
  }
 }
}
export function buildCareerText(c:Career):string{return [...careerTextChunks(c)].join('');}
export function careerTextFilename(c:Career):string{return `K볼_${c.player.name.replace(/[\\/:*?"<>|]/g,'_')}_${c.stage==='retired'?'은퇴커리어':'전체커리어'}.txt`;}
