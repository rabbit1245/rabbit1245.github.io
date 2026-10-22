import { ATTRIBUTE_LABELS, POSITION_LABELS, TALENT_LABELS } from './attributes';
import { getClub } from './data';
import { ALL_STATS, emptyStats, sumStats } from './math';
import type { Career, MatchRecord, PlayerStats, Standing } from './types';

export const STAT_TEXT:Record<string,string>={apps:'출전 경기',starts:'선발 경기',minutes:'출전 시간(분)',goals:'득점(골)',assists:'도움(개)',shots:'슈팅(회)',shotsOnTarget:'유효 슈팅(회)',passes:'패스 시도(회)',passesCompleted:'패스 성공(회)',tackles:'태클 성공(회)',interceptions:'인터셉트(회)',saves:'선방(회)',goalsConceded:'실점(골)',cleanSheets:'무실점 경기',ratingSum:'평점 합계',ratingCount:'평점 집계 경기',yellowCards:'경고(회)',redCards:'퇴장(회)',mom:'MOM(회)',keyPasses:'키패스(회)',dribbleAttempts:'드리블 시도(회)',dribblesCompleted:'드리블 성공(회)',tackleAttempts:'태클 시도(회)',aerialAttempts:'공중볼 경합 시도(회)',aerialWon:'공중볼 경합 성공(회)',shotsFaced:'피유효슈팅(회)',oneOnOneAttempts:'일대일 대응(회)',oneOnOneSaves:'일대일 선방(회)',penaltiesFaced:'피페널티(회)',penaltiesSaved:'페널티 선방(회)',crossesFaced:'피크로스(회)',crossesCaught:'크로스 포구(회)',sweepingAttempts:'스위핑 시도(회)',sweepingSuccesses:'스위핑 성공(회)',buildUpPasses:'빌드업 패스 시도(회)',buildUpCompleted:'빌드업 패스 성공(회)',longKicks:'롱킥 시도(회)',longKicksCompleted:'롱킥 성공(회)',handlingAttempts:'공 처리 시도(회)',handlingSuccesses:'공 처리 성공(회)',lateActions:'후반 행동(회)',lateSuccesses:'후반 행동 성공(회)',detailedApps:'세부 행동 집계 경기'};
const rates:[string,keyof PlayerStats,keyof PlayerStats][]=[['슈팅 정확도','shotsOnTarget','shots'],['패스 성공률','passesCompleted','passes'],['드리블 성공률','dribblesCompleted','dribbleAttempts'],['태클 성공률','tackles','tackleAttempts'],['공중볼 성공률','aerialWon','aerialAttempts'],['선방률','saves','shotsFaced'],['일대일 선방률','oneOnOneSaves','oneOnOneAttempts'],['페널티 선방률','penaltiesSaved','penaltiesFaced'],['크로스 포구율','crossesCaught','crossesFaced'],['스위핑 성공률','sweepingSuccesses','sweepingAttempts'],['빌드업 패스 성공률','buildUpCompleted','buildUpPasses'],['롱킥 성공률','longKicksCompleted','longKicks']];
const baseline=new Set(['apps','starts','minutes','goals','assists','shots','shotsOnTarget','passes','passesCompleted','tackles','interceptions','saves','goalsConceded','cleanSheets','ratingSum','ratingCount','yellowCards','redCards']);
const name=(id:string)=>{if(id.startsWith('NAT:')){const [,country,squad]=id.split(':');return `${country} ${squad==='U20'?'U20':'성인 대표팀'}`;}try{return getClub(id).name;}catch{return id||'소속 미기록';}};
const money=(n:number)=>`€${Math.round(n).toLocaleString('ko-KR')}`;
const avg=(s:PlayerStats)=>s.ratingCount?(s.ratingSum/s.ratingCount).toFixed(2):'미집계';
const unique=(matches:MatchRecord[])=>[...new Map(matches.map(m=>[m.fixtureId||m.id,m])).values()];
export function careerMatchLedger(c:Career){
 const club=unique([...c.history.flatMap(h=>h.matches),...c.season.matches]);
 const national=unique([...(c.systems?.national.history.flatMap(h=>h.matches)??[]),...(c.systems?.national.matches??[])]);
 return {club,national};
}
function clubTotal(c:Career){return sumStats([...c.history.map(h=>h.stats),...(!c.history.some(h=>h.year===c.season.year)?[c.season.playerStats]:[])]);}
function statsText(stats:PlayerStats,matches:readonly MatchRecord[]):string[]{
 const measured=sumStats(matches.filter(m=>m.metricsVersion===2).map(m=>m.playerStats)),legacy=stats.apps>(stats.detailedApps??0),keys=[...new Set([...ALL_STATS,...Object.keys(stats)])];
 const lines=[`출전 ${stats.apps}경기 · ${stats.minutes}분 · ${stats.goals}골 · ${stats.assists}도움 · 평균 평점 ${avg(stats)}`,`상세 행동 기록 ${stats.detailedApps??0}/${stats.apps}경기. 과거에 집계하지 않은 지표와 분모는 추정하지 않습니다.`];
 for(const key of keys){const value=(stats as unknown as Record<string,number|undefined>)[key];lines.push(`${STAT_TEXT[key]??key}: ${value===undefined?'미기록':legacy&&!baseline.has(key)&&key!=='detailedApps'&&!(stats.detailedApps??0)&&value===0?'과거 기록 미보존':value}`);}
 const rateStats=legacy?measured:stats;
 for(const [label,a,b] of rates){const denominator=rateStats[b],numerator=rateStats[a];lines.push(`${label}: ${denominator&&numerator!==undefined?`${(numerator/denominator*100).toFixed(2)}% (${numerator}/${denominator})`:'미집계 · 시도 또는 분모 없음'}${legacy?' · 상세 기록이 보존된 경기만':''}`);}
 for(const key of keys.filter(k=>!['apps','starts','minutes','ratingSum','ratingCount','detailedApps'].includes(k))){const v=(rateStats as unknown as Record<string,number>)[key];if(v!==undefined)lines.push(`${STAT_TEXT[key]??key} / 90분: ${rateStats.minutes?(v*90/rateStats.minutes).toFixed(3):'미집계'}${legacy?' · 상세 기록 경기 기준':''}`);}
 return lines;
}
function teamRecord(matches:MatchRecord[],clubId:string){let won=0,drawn=0,lost=0,gf=0,ga=0;for(const m of matches){if(m.playerClubId!==clubId)continue;const home=m.homeId===clubId,a=home?m.homeGoals:m.awayGoals,b=home?m.awayGoals:m.homeGoals;gf+=a;ga+=b;if(a>b)won++;else if(a<b)lost++;else drawn++;}return `${won+drawn+lost}경기 ${won}승 ${drawn}무 ${lost}패 · 승점 ${won*3+drawn}점 · 득점 ${gf}골 · 실점 ${ga}골 · 득실차 ${gf-ga}`;}
function attributesText(attributes:Record<string,number|undefined>){return Object.entries(attributes).map(([key,value])=>`${ATTRIBUTE_LABELS[key as keyof typeof ATTRIBUTE_LABELS]??key}: ${value??'미기록'}`).join(' · ');}
function standingText(t:Standing,index:number){return `${index+1}위 ${name(t.clubId)} · ${t.played}경기 · ${t.won}승 ${t.drawn}무 ${t.lost}패 · 득점 ${t.goalsFor}골 · 실점 ${t.goalsAgainst}골 · 득실차 ${t.goalsFor-t.goalsAgainst} · 승점 ${t.points}점`;}
const roleText=(role:string)=>role==='captain'?'주장':role==='vice'?'부주장':'해당 없음';
function ownMatch(m:MatchRecord,id:string){return {...m,performers:m.performers?.filter(p=>p.id===id)};}
function selfRanking(c:Career,r:NonNullable<Career['systems']>['rankings'][number]){return {...r,candidates:r.candidates.filter(p=>p.playerId===c.player.id),world11:r.world11.filter(p=>p.playerId===c.player.id)};}

/** One readable, UTF-8 document; no clipboard, network or fabricated historical fields. */
export function* careerTextChunks(c:Career):Generator<string>{
 const p=c.player,s=c.systems,e=s?.economics,l=s?.leadership,ledger=careerMatchLedger(c),club=clubTotal(c),national=sumStats(ledger.national.map(m=>m.playerStats)),all=sumStats([club,national]);
 const seasons=[...c.history].sort((a,b)=>a.year-b.year),first=seasons[0],years=Array.from({length:c.season.year-(first?.year??c.season.year)+1},(_,i)=>(first?.year??c.season.year)+i),peak=Math.max(p.ovr,...seasons.map(h=>Math.max(h.ovrStart,h.ovrEnd)),...(s?.growthReports.flatMap(r=>[r.ovrStart,r.ovrEnd])??[])),line=(v='')=>`${v}\r\n`;
 const section=(title:string)=>line()+line('='.repeat(60))+line(title)+line('='.repeat(60));
 yield '\ufeff';yield line(`K볼 · ${p.name} · ${c.stage==='retired'?'은퇴 커리어 전체 기록':'현재까지의 전체 커리어 기록'}`);
 yield line('원본 저장에 남은 기록만 사용합니다. 미참가·해당 없음·미집계·과거 기록 미보존은 서로 구분합니다.');
 yield section('A. 선수 기본 프로필');
 yield line(`선수명: ${p.name} · 국적: ${p.nationality} · 포지션: ${POSITION_LABELS[p.position]} (${p.position}) · 부 포지션: ${p.secondaryPositions.join(', ')||'해당 없음'}`);
 yield line(`재능: ${p.talent} (${TALENT_LABELS[p.talent]}) · 잠재력: ${p.potential} · 스타일: ${p.style} · 주발: ${p.foot} · 신체: ${p.height}cm / ${p.weight}kg`);
 const debuted=seasons.find(h=>h.stats.apps>0);
 yield line(`최초 보존 시즌: ${first?.year??c.season.year}년 · 데뷔: ${debuted?`${debuted.year}년 / ${debuted.age}세`:c.season.playerStats.apps?`${c.season.year}년 / ${p.age}세`:'출전 기록 없음'} · 은퇴: ${c.retiredYear?`${c.retiredYear}년 / ${p.age}세`:'현역'} · 보존 기간: ${years[0]}–${years.at(-1)} (${years.length}시즌)`);
 const peakYears=[...new Set([...seasons.filter(h=>h.ovrEnd===peak||h.ovrStart===peak).map(h=>h.year),...(s?.growthReports.filter(r=>r.ovrStart===peak||r.ovrEnd===peak).map(r=>r.year)??[]),...(p.ovr===peak?[c.season.year]:[])])].sort((a,b)=>a-b);
 yield line(`최종 OVR: ${p.ovr} · 최고 보존 OVR: ${peak} · 기록상 최고 시즌: ${peakYears.join(', ')} · 현재 소속: ${name(p.clubId)}`);
 yield line(`최종 세부 능력치: ${attributesText(p.attributes)}`);
 yield section('B. 통산 기록 전체');
 for(const [label,stats,matches] of [['전체',all,[...ledger.club,...ledger.national]],['클럽',club,ledger.club],['국가대표',national,ledger.national]] as const){yield line(`[${label}]`);for(const row of statsText(stats,matches))yield line(row);}
 const competitions=new Map<string,MatchRecord[]>();for(const m of [...ledger.club,...ledger.national]){const key=`${m.scope==='national'?'국가대표':'클럽'} / ${m.competitionId??'대회 ID 미보존'}`;competitions.set(key,[...(competitions.get(key)??[]),m]);}
 for(const [label,matches] of competitions){yield line(`[대회별 통산: ${label}]`);for(const row of statsText(sumStats(matches.map(m=>m.playerStats)),matches))yield line(row);}
 yield line('국내 컵·클럽 대륙대회: 현재 엔진 미구현 · 참가/성적을 임의 생성하지 않음. 경기 원장 없는 과거 대회 분류: 과거 기록 미보존.');
 yield section('C. 연도별·시즌별 상세 기록');
 for(const year of years){
  const h=seasons.find(row=>row.year===year),current=year===c.season.year,cm=h?.matches??(current?c.season.matches:[]),nm=ledger.national.filter(m=>m.seasonYear===year),stats=h?.stats??(current?c.season.playerStats:emptyStats());
  if(!h&&!current){yield line(`${year}시즌: 과거 기록 미보존`);continue;}
  yield line(`[${year}시즌] ${h?.age??p.age}세 · ${h?.clubName??name(p.clubId)} · ${h?.competitionName??c.season.competitionName} · ${h?.position??p.position}`);
  yield line(`리그 순위: ${h?.rank??(c.season.table.findIndex(t=>t.clubId===p.clubId)+1)}위 · ${h?.completed?'시즌 종료':current?'진행 중/은퇴 시점':'과거 기록 미보존'}`);
  yield line(`팀 결과(보존 경기 원장 ${cm.length}경기 기준): ${teamRecord(cm,h?.clubId??p.clubId)}`);
  yield line(`OVR ${h?.ovrStart??c.season.ovrStart} → ${h?.ovrEnd??p.ovr} · 수입: ${money(h?.income??Math.max(0,c.careerIncome-seasons.reduce((n,x)=>n+x.income,0)))}`);
  const report=s?.growthReports.find(r=>r.year===year&&r.half==='season')??s?.growthReports.find(r=>r.year===year);
  yield line(`시작 능력치: ${h?.details?attributesText(h.details.startAttributes):report?attributesText(report.startAttributes):current?attributesText(c.season.attributeStart):'과거 기록 미보존'}`);
  yield line(`종료/현재 능력치: ${h?.details?attributesText(h.details.attributes):report?attributesText(report.endAttributes):current?attributesText(p.attributes):'과거 기록 미보존'}`);
  yield line(`능력치 변화: ${h?attributesText(h.attributeGrowth):'아직 시즌 미결산'}`);
  yield line(`주장 직책: ${l?.terms.filter(t=>t.startYear<=year&&(t.endYear??Infinity)>=year).map(t=>`${name(t.teamId)} ${t.role==='captain'?'주장':t.role==='vice'?'부주장':'임시 경기 주장'}`).join(' / ')||'해당 없음 또는 과거 미보존'}`);
  yield line(`몸값: ${e?.valueHistory.filter(v=>v.year===year).map(v=>`R${v.round} ${money(v.value)}`).join(' / ')||'과거 기록 미보존'}`);
  yield line(`개인·팀 수상: ${c.awards.filter(a=>a.year===year).map(a=>`${a.name} (${a.description})`).join(' / ')||'기록된 수상 없음'}`);
  for(const row of statsText(stats,cm))yield line(`클럽 ${row}`);
  if(nm.length){for(const row of statsText(sumStats(nm.map(m=>m.playerStats)),nm))yield line(`국대 ${row}`);}else yield line('국대: 이 시즌 보존된 출전 기록 없음');
  for(const n of s?.national.history.filter(n=>n.year===year)??[])yield line(`참가 대회: ${n.competitionName} · ${n.squad} · ${n.result} · 본선 자격 ${n.qualified?'획득':'미획득'}`);
  if(h?.details){const d=h.details;yield line(`시즌 종료 몸값: ${money(d.marketValue)} · 시작 몸값: ${d.seasonStartValue===undefined?'과거 기록 미보존':money(d.seasonStartValue)}`);yield line(`당시 계약: ${name(d.contract.clubId)} · 주급 ${money(d.contract.wage)} · ${d.contract.years}년 · ${d.contract.signedYear}–${d.contract.expiresYear} · 역할 ${d.contract.role}`);yield line(`개인 리그 순위: 득점 ${d.personalRanks.goals?`${d.personalRanks.goals}위`:'해당 없음/미집계'} · 도움 ${d.personalRanks.assists?`${d.personalRanks.assists}위`:'해당 없음/미집계'} · 무실점 ${d.personalRanks.cleanSheets?`${d.personalRanks.cleanSheets}위`:'해당 없음/미집계'}`);yield line(`시즌 종료 주장 직책: 클럽 ${roleText(d.captain.club)} · 국대 ${roleText(d.captain.national)}`);if(d.clubDevelopment){const x=d.clubDevelopment;yield line(`구단 성과 반영: 성과 수입 ${money(x.bonus)} · 실제 재투자 ${money(x.reinvestment)} · 전력 ${x.beforePower} → ${x.afterPower} · 위상 ${x.prestigeBefore} → ${x.prestigeAfter}`);}}
  else yield line('시즌 종료 전체 순위표·당시 계약·개인 득점/도움 순위 원본: 과거 기록 미보존 (아래 보존 원장으로 확인 가능한 값만 표시)');
 }
 yield section('D. 클럽 및 이적 경력');
 for(const id of new Set([...seasons.map(h=>h.clubId),p.clubId])){const hs=seasons.filter(h=>h.clubId===id),ms=ledger.club.filter(m=>m.playerClubId===id);yield line(`${name(id)} · 보존 시즌 ${hs.map(h=>h.year).join(', ')||'현재 시즌'} · ${teamRecord(ms,id)}`);for(const row of statsText(sumStats([...hs.map(h=>h.stats),...(!seasons.some(h=>h.year===c.season.year)&&id===p.clubId?[c.season.playerStats]:[])]),ms))yield line(row);}
 for(const t of c.transfers)yield line(`${t.year}년 ${name(t.fromClubId)} → ${name(t.toClubId)} · 이적료 ${money(t.fee)} · 주급 ${money(t.wage)}`);
 yield section('E. 국가대표 커리어');
 yield line(`현재/마지막 상태: ${s?.national.status??'미기록'} · ${s?.national.reason??'과거 기록 미보존'}`);
 for(const n of [...s?.national.history??[]].sort((a,b)=>a.year-b.year||a.competitionId.localeCompare(b.competitionId))){yield line(`${n.year}년 · ${n.squad} · ${n.competitionName} · ${n.result} · 예선 통과 ${n.qualified?'예':'아니오'}`);for(const row of statsText(n.stats,n.matches))yield line(row);}
 yield section('F. 개인 수상·개인 순위 전체');
 const counts=new Map<string,number>();for(const a of c.awards){counts.set(a.name,(counts.get(a.name)??0)+1);yield line(`${a.year}년 · ${a.name} · ${name(a.clubId)} · ${a.description} · 평가 ${a.evaluationPeriod??'기간 미보존'} · 순위 ${a.rank??'해당 없음'}`);}
 for(const [award,count] of counts)yield line(`통산 ${award}: ${count}회`);
 for(const r of s?.rankings??[])yield line(`${r.year}년 발롱도르: ${r.playerRank?`${r.playerRank}위`:'순위권 밖/미선정'} · FIFPRO 월드 11: ${r.world11.some(x=>x.playerId===p.id)?'선정':'미선정'}`);
 yield line(`실제 경기 MOM 합계: ${all.mom??0}회`);
 yield section('G. 팀 수상·대회 성적 전체');
 for(const h of seasons)yield line(`${h.year}년 · ${h.clubName} · ${h.competitionName} · ${h.rank}위 · ${h.completed?'완료':'중도 종료'} · ${teamRecord(h.matches,h.clubId)}`);
 for(const h of s?.national.history??[])yield line(`${h.year}년 ${h.competitionName} ${h.squad}: ${h.result} · 본선 진출 ${h.qualified?'예':'아니오'}`);
 for(const a of c.awards.filter(a=>a.category==='team'||/우승|준우승/.test(a.name)))yield line(`${a.year}년 ${a.name}: ${a.description}`);
 yield section('H. 주장·부주장 전체 이력');
 if(!l?.terms.length)yield line('기록된 주장/부주장 임기 없음');
 for(const t of l?.terms??[])yield line(`${t.scope==='club'?'클럽':'국가대표'} ${name(t.teamId)} · ${t.role==='captain'?'주장':t.role==='vice'?'부주장':'임시 경기 주장'} · ${t.startYear}년 R${t.startRound??'미기록'} → ${t.endYear??'현재'} R${t.endRound??'미기록'} · ${t.apps}경기 · ${t.reason}`);
 for(const o of l?.offers??[])yield line(`주장단 제의 ${o.year}년 R${o.round}: ${name(o.teamId)} ${o.role} · ${o.status} · ${o.reason}`);
 yield section('I. 몸값·계약·시장 가치 이력');
 yield line(`현재/최종 몸값: ${e?money(e.marketValue):'미기록'} · 최고 몸값: ${e?money(e.peakValue):'미기록'} · 최고 달성: ${e?.valueHistory.filter(v=>v.value===e.peakValue).map(v=>`${v.year}년 R${v.round}`).join(', ')||'과거 기록 미보존'} · 최고 주급: ${e?money(e.highestWage):'미기록'}`);
 for(const v of e?.valueHistory??[])yield line(`${v.year}년 R${v.round} 몸값 ${money(v.value)} · ${v.reason}`);
 for(const h of e?.contractHistory??[])yield line(`${h.year}년 R${h.round} ${h.type} · ${name(h.current.clubId)} · ${h.current.signedDate??h.current.signedYear} → ${h.current.expiresDate??h.current.expiresYear} · ${h.current.years}년 · 주급 ${money(h.current.wage)} · 계약상 연간 환산 ${money(h.current.wage*52)} · 이적료 ${money(h.fee)} · ${h.reason}`);
 yield line(`실제 누적 급여 ${e?money(e.salaryIncome):'미기록'} · 보너스 ${e?money(e.bonusIncome):'미기록'} · 구단 간 이적료 ${e?money(e.totalTransferFees):'미기록'}`);
 yield section('J. 능력치 성장 이력');
 const snapshots=[...seasons.flatMap(h=>h.details?[{label:`${h.year}년 시즌 시작`,attributes:h.details.startAttributes},{label:`${h.year}년 시즌 종료`,attributes:h.details.attributes}]:[]),...(s?.growthReports.flatMap(r=>[{label:`${r.year}년 R${r.fromRound}`,attributes:r.startAttributes},{label:`${r.year}년 R${r.toRound}`,attributes:r.endAttributes}])??[]),{label:`${c.season.year}년 현재/최종`,attributes:p.attributes}];
 yield line('세부 능력치 최고점은 보존된 시점끼리 비교합니다. 과거 매 경기 능력치가 없으면 그 사이의 최고값은 추정하지 않습니다.');
 for(const key of Object.keys(p.attributes)){const observed=snapshots.filter(r=>r.attributes[key as keyof typeof r.attributes]!==undefined),highest=Math.max(...observed.map(r=>r.attributes[key as keyof typeof r.attributes]!));yield line(`${ATTRIBUTE_LABELS[key as keyof typeof ATTRIBUTE_LABELS]??key} 보존 최고점: ${highest} · ${[...new Set(observed.filter(r=>r.attributes[key as keyof typeof r.attributes]===highest).map(r=>r.label))].join(', ')}`);}
 for(const r of [...s?.growthReports??[]].sort((a,b)=>a.year-b.year||a.toRound-b.toRound)){yield line(`${r.year}년 ${r.half} R${r.fromRound}–${r.toRound} · OVR ${r.ovrStart} → ${r.ovrEnd}`);yield line(`시작: ${attributesText(r.startAttributes)}`);yield line(`종료: ${attributesText(r.endAttributes)}`);if(r.growth)for(const [cause,changes] of Object.entries(r.growth.byCause))yield line(`원인 ${cause}: ${attributesText(changes)}`);if(r.offseasonAging)yield line(`시즌 전 노화: ${attributesText(r.offseasonAging.changes)}`);}
 yield section('K. 전체 순위 지표 및 경기별 모든 상세 기록');
 for(const h of seasons){yield line(`[${h.year}년 ${h.competitionName}] ${h.rank}위`);if(h.details)for(const [i,t] of h.details.table.entries())yield line(standingText(t,i));else yield line('최종 전체 순위표 원본: 과거 기록 미보존');}
 yield line(`[현재/마지막 시즌 전체 순위] ${c.season.competitionName}`);
 for(const [i,t] of c.season.table.entries())yield line(standingText(t,i));
 for(const m of [...ledger.club,...ledger.national].sort((a,b)=>a.seasonYear-b.seasonYear||(a.date??'').localeCompare(b.date??'')||a.round-b.round)){yield line(`[${m.seasonYear}년 ${m.date??`R${m.round}`} / ${m.competitionId??'대회 미보존'}] ${name(m.homeId)} ${m.homeGoals}:${m.awayGoals} ${name(m.awayId)}${m.shootout?` · 승부차기 ${m.shootout.home}:${m.shootout.away}`:''}`);for(const row of statsText(m.playerStats,[m]))yield line(row);}
 yield section('L. 원본 보존 상세 · 누락 없이 보관하는 부록');
 yield line('이 부록은 선수 본인·소속팀·대회와 관련된 원본 항목을 보존합니다. 다른 선수의 가상 명단은 제외합니다. 숫자를 새로 만들어 채우지 않습니다.');
 const raw={profile:p,history:seasons.map(h=>({...h,matches:h.matches.map(m=>ownMatch(m,p.id))})),season:{...c.season,matches:c.season.matches.map(m=>ownMatch(m,p.id))},awards:c.awards,transfers:c.transfers,national:s?{...s.national,matches:s.national.matches.map(m=>ownMatch(m,p.id)),history:s.national.history.map(h=>({...h,matches:h.matches.map(m=>ownMatch(m,p.id))})),teamResults:s.national.teamResults?.map(m=>ownMatch(m,p.id))}:undefined,economics:e,leadership:l,growthReports:s?.growthReports,growthLedger:s?.growthLedger,agingReport:s?.agingReport,training:{keys:c.training,intensity:c.intensity,plan:s?.trainingPlan},rankings:s?.rankings.map(r=>selfRanking(c,r)),clubRecords:s?Object.fromEntries([...new Set([...seasons.map(h=>h.clubId),p.clubId])].map(id=>[id,s.world.clubs[id]])):undefined};
 // Serialize one season at a time in the readable sections above; the original
 // appendix is intentionally complete for future, unknown statistic fields too.
 yield line(JSON.stringify(raw,null,2).replace(/\n/g,'\r\n'));
}
export function buildCareerText(c:Career):string{return [...careerTextChunks(c)].join('');}
export function careerTextFilename(c:Career){return `K볼_${c.player.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_')}_${c.stage==='retired'?'은퇴커리어':'전체커리어'}.txt`;}
