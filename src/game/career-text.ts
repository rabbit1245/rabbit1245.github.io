import {moneyText,currencyText} from './currency';
import {nationalAudit} from './national-audit';
import {cupMatches,cupStats,cupLedger,tournamentResult} from './club-competitions';
import { ATTRIBUTE_LABELS, POSITION_LABELS, TALENT_LABELS } from './attributes';
import { getClub } from './data';
import { ALL_STATS, emptyStats, sumStats } from './math';
import {competitionLabel,isTeamAward,seasonHonours} from './honours';
import type { Career, MatchRecord, PlayerStats, Standing } from './types';

export const STAT_TEXT:Record<string,string>={apps:'출전 경기',starts:'선발 경기',minutes:'출전 시간(분)',goals:'득점(골)',assists:'도움(개)',shots:'슈팅(회)',shotsOnTarget:'유효 슈팅(회)',passes:'패스 시도(회)',passesCompleted:'패스 성공(회)',tackles:'태클 성공(회)',interceptions:'인터셉트(회)',saves:'선방(회)',goalsConceded:'실점(골)',cleanSheets:'무실점 경기',ratingSum:'평점 합계',ratingCount:'평점 집계 경기',yellowCards:'경고(회)',redCards:'퇴장(회)',mom:'경기 최우수 선수(회)',keyPasses:'키패스(회)',dribbleAttempts:'드리블 시도(회)',dribblesCompleted:'드리블 성공(회)',tackleAttempts:'태클 시도(회)',aerialAttempts:'공중볼 경합 시도(회)',aerialWon:'공중볼 경합 성공(회)',shotsFaced:'피유효슈팅(회)',oneOnOneAttempts:'일대일 대응(회)',oneOnOneSaves:'일대일 선방(회)',penaltiesFaced:'피페널티(회)',penaltiesSaved:'페널티 선방(회)',crossesFaced:'피크로스(회)',crossesCaught:'크로스 포구(회)',sweepingAttempts:'스위핑 시도(회)',sweepingSuccesses:'스위핑 성공(회)',buildUpPasses:'빌드업 패스 시도(회)',buildUpCompleted:'빌드업 패스 성공(회)',longKicks:'롱킥 시도(회)',longKicksCompleted:'롱킥 성공(회)',handlingAttempts:'공 처리 시도(회)',handlingSuccesses:'공 처리 성공(회)',lateActions:'후반 행동(회)',lateSuccesses:'후반 행동 성공(회)',detailedApps:'세부 행동 집계 경기'};
const rates:[string,keyof PlayerStats,keyof PlayerStats][]=[['슈팅 정확도','shotsOnTarget','shots'],['패스 성공률','passesCompleted','passes'],['드리블 성공률','dribblesCompleted','dribbleAttempts'],['태클 성공률','tackles','tackleAttempts'],['공중볼 성공률','aerialWon','aerialAttempts'],['선방률','saves','shotsFaced'],['일대일 선방률','oneOnOneSaves','oneOnOneAttempts'],['페널티 선방률','penaltiesSaved','penaltiesFaced'],['크로스 포구율','crossesCaught','crossesFaced'],['스위핑 성공률','sweepingSuccesses','sweepingAttempts'],['빌드업 패스 성공률','buildUpCompleted','buildUpPasses'],['롱킥 성공률','longKicksCompleted','longKicks']];
const baseline=new Set(['apps','starts','minutes','goals','assists','shots','shotsOnTarget','passes','passesCompleted','tackles','interceptions','saves','goalsConceded','cleanSheets','ratingSum','ratingCount','yellowCards','redCards']);
const name=(id:string)=>{if(id.startsWith('NAT:')){const [,country,squad]=id.split(':');return `${country} ${squad==='U20'?'U20':'성인 대표팀'}`;}try{return getClub(id).name;}catch{return id||'소속 미기록';}};
const money=moneyText;
const avg=(s:PlayerStats)=>s.ratingCount?(s.ratingSum/s.ratingCount).toFixed(2):'미집계';
const unique=(matches:MatchRecord[])=>[...new Map(matches.map(m=>[m.fixtureId||m.id,m])).values()];
export function careerMatchLedger(c:Career){
 const club=unique([...c.history.flatMap(h=>h.matches),...c.season.matches,...cupMatches(c)]);
 const national=unique([...(c.systems?.national.history.flatMap(h=>h.matches)??[]),...(c.systems?.national.matches??[])]);
 return {club,national};
}
function clubTotal(c:Career){return sumStats([cupStats(c),...c.history.map(h=>h.stats),...(!c.history.some(h=>h.year===c.season.year)?[c.season.playerStats]:[])]);}
function statsText(stats:PlayerStats,matches:readonly MatchRecord[]):string[]{
 const measured=sumStats(matches.filter(m=>m.metricsVersion===2).map(m=>m.playerStats)),legacy=stats.apps>(stats.detailedApps??0),keys=[...new Set([...ALL_STATS,...Object.keys(stats)])];
 const lines=[`출전 ${stats.apps}경기 · ${stats.minutes}분 · ${stats.goals}골 · ${stats.assists}도움 · 평균 평점 ${avg(stats)}`,`상세 행동 기록 ${stats.detailedApps??0}/${stats.apps}경기. 과거에 집계하지 않은 지표와 분모는 추정하지 않습니다.`];
 for(const key of keys){const value=(stats as unknown as Record<string,number|undefined>)[key];lines.push(`${STAT_TEXT[key]??'추가 기록'}: ${value===undefined?'미기록':legacy&&!baseline.has(key)&&key!=='detailedApps'&&!(stats.detailedApps??0)&&value===0?'과거 기록 미보존':value}`);}
 const rateStats=legacy?measured:stats;
 for(const [label,a,b] of rates){const denominator=rateStats[b],numerator=rateStats[a];lines.push(`${label}: ${denominator&&numerator!==undefined?`${(numerator/denominator*100).toFixed(2)}% (${numerator}/${denominator})`:'미집계 · 시도 또는 분모 없음'}${legacy?' · 상세 기록이 보존된 경기만':''}`);}
 for(const key of keys.filter(k=>!['apps','starts','minutes','ratingSum','ratingCount','detailedApps'].includes(k))){const v=(rateStats as unknown as Record<string,number>)[key];if(v!==undefined)lines.push(`${STAT_TEXT[key]??'추가 기록'} / 90분: ${rateStats.minutes?(v*90/rateStats.minutes).toFixed(3):'미집계'}${legacy?' · 상세 기록 경기 기준':''}`);}
 return lines;
}
function teamRecord(matches:MatchRecord[],clubId:string){let won=0,drawn=0,lost=0,gf=0,ga=0;for(const m of matches){if(m.playerClubId!==clubId)continue;const home=m.homeId===clubId,a=home?m.homeGoals:m.awayGoals,b=home?m.awayGoals:m.homeGoals;gf+=a;ga+=b;if(a>b)won++;else if(a<b)lost++;else drawn++;}return `${won+drawn+lost}경기 ${won}승 ${drawn}무 ${lost}패 · 승점 ${won*3+drawn}점 · 득점 ${gf}골 · 실점 ${ga}골 · 득실차 ${gf-ga}`;}
function attributesText(attributes:Record<string,number|undefined>){return Object.entries(attributes).map(([key,value])=>`${ATTRIBUTE_LABELS[key as keyof typeof ATTRIBUTE_LABELS]??'추가 능력치'}: ${value??'미기록'}`).join(' · ');}
function standingText(t:Standing,index:number){return `${index+1}위 ${name(t.clubId)} · ${t.played}경기 · ${t.won}승 ${t.drawn}무 ${t.lost}패 · 득점 ${t.goalsFor}골 · 실점 ${t.goalsAgainst}골 · 득실차 ${t.goalsFor-t.goalsAgainst} · 승점 ${t.points}점`;}
const words:Record<string,string>={right:'오른발',left:'왼발',both:'양발',unselected:'미선발',watchlist:'관찰 대상',called:'대표팀 소집',injured:'부상 제외',retired:'은퇴',pending:'응답 대기',accepted:'수락',declined:'거절',expired:'종료',initial:'첫 계약',renew:'재계약',transfer:'이적',legacy:'이전 계약',first:'전반기',season:'시즌 전체',training:'훈련',experience:'출전 경험',development:'발달',injury:'부상',aging:'노화',cheat:'직접 조정',youth:'유소년',senior:'성인 대표팀',U20:'20세 이하 대표팀',balanced:'균형',intense:'집중',rest:'회복',preseason:'시즌 준비',creation:'선수 생성',offseason:'시즌 종료 후',now:'즉시',nextSeason:'다음 시즌',friendlies:'친선 경기',qualifying:'예선',finals:'본선',eliminated:'대회 종료'};
const korean=(v:string|undefined)=>v?words[v]??v:'미기록';
const roleText=(role:string)=>role==='captain'?'주장':role==='vice'?'부주장':'해당 없음';
/** One readable, UTF-8 document; no clipboard, network or fabricated historical fields. */
export function* careerTextChunks(c:Career):Generator<string>{
 const p=c.player,s=c.systems,e=s?.economics,l=s?.leadership,ledger=careerMatchLedger(c),club=clubTotal(c),national=sumStats(ledger.national.map(m=>m.playerStats)),all=sumStats([club,national]);
 const seasons=[...c.history].sort((a,b)=>a.year-b.year),first=seasons[0],years=Array.from({length:c.season.year-(first?.year??c.season.year)+1},(_,i)=>(first?.year??c.season.year)+i),peak=Math.max(p.ovr,...seasons.map(h=>Math.max(h.ovrStart,h.ovrEnd)),...(s?.growthReports.flatMap(r=>[r.ovrStart,r.ovrEnd])??[])),line=(v='')=>`${currencyText(v)}\r\n`;
 const section=(title:string)=>line()+line('='.repeat(60))+line(title)+line('='.repeat(60));
 yield '\ufeff';yield line(`K볼 · ${p.name} · ${c.stage==='retired'?'은퇴 커리어 전체 기록':'현재까지의 전체 커리어 기록'}`);
 yield line('원본 저장에 남은 기록만 사용합니다. 미참가·해당 없음·미집계·과거 기록 미보존은 서로 구분합니다.');
 yield section('A. 선수 기본 프로필');
 yield line(`선수명: ${p.name} · 국적: ${p.nationality} · 포지션: ${POSITION_LABELS[p.position]} (${p.position}) · 부 포지션: ${p.secondaryPositions.map(k=>POSITION_LABELS[k]).join(', ')||'해당 없음'}`);
 yield line(`재능: ${p.talent} (${TALENT_LABELS[p.talent]}) · 잠재력: ${p.potential} · 스타일: ${p.style} · 주발: ${korean(p.foot)} · 신체: ${p.height}cm / ${p.weight}kg`);
 const debuted=seasons.find(h=>h.stats.apps>0);
 yield line(`최초 보존 시즌: ${first?.year??c.season.year}년 · 데뷔: ${debuted?`${debuted.year}년 / ${debuted.age}세`:c.season.playerStats.apps?`${c.season.year}년 / ${p.age}세`:'출전 기록 없음'} · 은퇴: ${c.retiredYear?`${c.retiredYear}년 / ${p.age}세`:'현역'} · 보존 기간: ${years[0]}–${years.at(-1)} (${years.length}시즌)`);
 const peakYears=[...new Set([...seasons.filter(h=>h.ovrEnd===peak||h.ovrStart===peak).map(h=>h.year),...(s?.growthReports.filter(r=>r.ovrStart===peak||r.ovrEnd===peak).map(r=>r.year)??[]),...(p.ovr===peak?[c.season.year]:[])])].sort((a,b)=>a-b);
 yield line(`최종 종합 능력: ${p.ovr} · 최고 종합 능력: ${peak} · 기록상 최고 시즌: ${peakYears.join(', ')} · 현재 소속: ${name(p.clubId)}`);
 yield line(`최종 세부 능력치: ${attributesText(p.attributes)}`);
 yield section('B. 통산 기록 전체');
 for(const [label,stats,matches] of [['전체',all,[...ledger.club,...ledger.national]],['클럽',club,ledger.club],['국가대표',national,ledger.national]] as const){yield line(`[${label}]`);for(const row of statsText(stats,matches))yield line(row);}
 const competitions=new Map<string,MatchRecord[]>();for(const m of [...ledger.club,...ledger.national]){const key=`${m.scope==='national'?'국가대표':'클럽'} / ${competitionLabel(c,m.competitionId)}`;competitions.set(key,[...(competitions.get(key)??[]),m]);}
 for(const [label,matches] of competitions){yield line(`[대회별 통산: ${label}]`);for(const row of statsText(sumStats(matches.map(m=>m.playerStats)),matches))yield line(row);}
 yield line('보존된 출전·대회 기록을 기준으로 집계했습니다. 기록이 없는 대회의 성적은 포함하지 않습니다.');
 yield section('C. 연도별·시즌별 상세 기록');
 for(const year of years){
  const h=seasons.find(row=>row.year===year),current=year===c.season.year,cm=h?.matches??(current?c.season.matches:[]),nm=ledger.national.filter(m=>m.seasonYear===year),stats=sumStats([h?.stats??(current?c.season.playerStats:emptyStats()),cupStats(c,year)]);
  const allClubMatches=[...cm,...cupMatches(c,year)];
  if(!h&&!current){yield line(`${year}시즌: 과거 기록 미보존`);continue;}
  yield line(`[${year}시즌] ${h?.age??p.age}세 · ${h?.clubName??name(p.clubId)} · ${h?.competitionName??c.season.competitionName} · ${POSITION_LABELS[h?.position??p.position]}`);
  yield line(`리그 순위: ${h?.rank??(c.season.table.findIndex(t=>t.clubId===p.clubId)+1)}위 · ${h?.completed?'시즌 종료':current?'진행 중/은퇴 시점':'과거 기록 미보존'}`);
  yield line(`팀 결과(보존 경기 원장 ${cm.length}경기 기준): ${teamRecord(cm,h?.clubId??p.clubId)}`);
  yield line(`종합 능력 ${h?.ovrStart??c.season.ovrStart} → ${h?.ovrEnd??p.ovr} · 수입: ${money(h?.income??Math.max(0,c.careerIncome-seasons.reduce((n,x)=>n+x.income,0)))}`);
  const report=s?.growthReports.find(r=>r.year===year&&r.half==='season')??s?.growthReports.find(r=>r.year===year);
  yield line(`시작 능력치: ${h?.details?attributesText(h.details.startAttributes):report?attributesText(report.startAttributes):current?attributesText(c.season.attributeStart):'과거 기록 미보존'}`);
  yield line(`종료/현재 능력치: ${h?.details?attributesText(h.details.attributes):report?attributesText(report.endAttributes):current?attributesText(p.attributes):'과거 기록 미보존'}`);
  yield line(`능력치 변화: ${h?attributesText(h.attributeGrowth):'아직 시즌 미결산'}`);
  yield line(`주장 직책: ${l?.terms.filter(t=>t.startYear<=year&&(t.endYear??Infinity)>=year).map(t=>`${name(t.teamId)} ${t.role==='captain'?'주장':t.role==='vice'?'부주장':'임시 경기 주장'}`).join(' / ')||'해당 없음 또는 과거 미보존'}`);
  yield line(`몸값: ${e?.valueHistory.filter(v=>v.year===year).map(v=>`R${v.round} ${money(v.value)}`).join(' / ')||'과거 기록 미보존'}`);
  yield line(`개인 수상: ${c.awards.filter(a=>a.year===year&&!isTeamAward(a)&&a.category!=='commercial').map(a=>`${a.name} (${a.description})`).join(' / ')||'기록된 수상 없음'}`);
  yield line(`구단 인기·상업 기록(추정): ${c.awards.filter(a=>a.year===year&&a.category==='commercial').map(a=>`${a.name} (${a.description})`).join(' / ')||'기록 없음'}`);
  for(const row of statsText(stats,allClubMatches))yield line(`클럽 ${row}`);
  if(nm.length){for(const row of statsText(sumStats(nm.map(m=>m.playerStats)),nm))yield line(`국대 ${row}`);}else yield line('국대: 이 시즌 보존된 출전 기록 없음');
  for(const n of s?.national.history.filter(n=>n.year===year)??[])yield line(`참가 대회: ${n.competitionName} · ${korean(n.squad)} · ${n.result} · 본선 자격 ${n.qualified?'획득':'미획득'}`);
  if(h?.details){const d=h.details;yield line(`시즌 종료 몸값: ${money(d.marketValue)} · 시작 몸값: ${d.seasonStartValue===undefined?'과거 기록 미보존':money(d.seasonStartValue)}`);yield line(`당시 계약: ${name(d.contract.clubId)} · 주급 ${money(d.contract.wage)} · ${d.contract.years}년 · ${d.contract.signedYear}–${d.contract.expiresYear} · 역할 ${d.contract.role}`);yield line(`개인 리그 순위: 득점 ${d.personalRanks.goals?`${d.personalRanks.goals}위`:'해당 없음/미집계'} · 도움 ${d.personalRanks.assists?`${d.personalRanks.assists}위`:'해당 없음/미집계'} · 무실점 ${d.personalRanks.cleanSheets?`${d.personalRanks.cleanSheets}위`:'해당 없음/미집계'}`);yield line(`시즌 종료 주장 직책: 클럽 ${roleText(d.captain.club)} · 국대 ${roleText(d.captain.national)}`);if(d.clubDevelopment){const x=d.clubDevelopment;yield line(`구단 성과 반영: 성과 수입 ${money(x.bonus)} · 실제 재투자 ${money(x.reinvestment)} · 전력 ${x.beforePower} → ${x.afterPower} · 위상 ${x.prestigeBefore} → ${x.prestigeAfter}`);}}
  else yield line('시즌 종료 전체 순위표·당시 계약·개인 득점/도움 순위 원본: 과거 기록 미보존 (아래 보존 원장으로 확인 가능한 값만 표시)');
 }
 yield section('D. 클럽 및 이적 경력');
 for(const id of new Set([...seasons.map(h=>h.clubId),p.clubId])){const hs=seasons.filter(h=>h.clubId===id),ms=ledger.club.filter(m=>m.playerClubId===id);yield line(`${name(id)} · 보존 시즌 ${hs.map(h=>h.year).join(', ')||'현재 시즌'} · ${teamRecord(ms,id)}`);for(const row of statsText(sumStats([...hs.map(h=>h.stats),...cupLedger(c).flatMap(t=>t.matches.filter(m=>m.playerClubId===id).map(m=>m.playerStats)),...(!seasons.some(h=>h.year===c.season.year)&&id===p.clubId?[c.season.playerStats]:[])]),ms))yield line(row);}
 for(const t of c.transfers)yield line(`${t.year}년 ${name(t.fromClubId)} → ${name(t.toClubId)} · 이적료 ${money(t.fee)} · 주급 ${money(t.wage)}`);
 for(const r of (s?.world.promotionReviews??[]).filter(r=>r.clubId===p.clubId||c.history.some(h=>h.year===r.year&&h.leagueId==='KR3')))yield line(`${r.year}년 승강 검토 · ${name(r.clubId)} · ${r.status==='unverified'?'자료 미확인·판정 보류':r.status==='ineligible'?'자격 미충족':r.status==='played'?'실제 결정전 진행':'미지원'} · ${r.reason}`);
 yield section('E. 국가대표 커리어');
 yield line(`현재/마지막 상태: ${korean(s?.national.status)} · ${s?.national.reason??'과거 기록 미보존'}`);
 for(const n of [...s?.national.history??[]].sort((a,b)=>a.year-b.year||a.competitionId.localeCompare(b.competitionId))){yield line(`${n.year}년 · ${korean(n.squad)} · ${n.competitionName} · ${n.result} · 예선 통과 ${n.qualified?'예':'아니오'}`);for(const row of statsText(n.stats,n.matches))yield line(row);}
 for(const r of nationalAudit(c)){
  yield line(`${r.year}년 ${korean(r.squad)} · 편성 ${r.scheduled} · 진행 ${r.teamGames} · 소집 ${r.called} · 선발 ${r.starts} · 교체 ${r.sub} · 벤치 ${r.bench} · 제외 ${r.excluded} · 실제 본선 참가 ${r.tournaments}개 대회${r.legacy?' · 과거 소집 세부 일부 미보존':''}`);
  for(const t of r.types)yield line(`${t.kind}: 대표팀 ${t.teamGames}경기 · 내 출전 ${t.stats.apps}경기 · ${t.stats.minutes}분 · ${t.stats.goals}골 · ${t.stats.assists}도움`);
 }
 yield section('F. 개인 수상·개인 순위 전체');
 for(const a of c.awards.filter(a=>a.category==='commercial'))yield line(`구단 인기·상업 기록(추정): ${a.year}년 · ${name(a.clubId)} · ${a.name} · ${a.description}`);
 const counts=new Map<string,number>();for(const a of c.awards.filter(a=>!isTeamAward(a)&&a.category!=='commercial')){counts.set(a.name,(counts.get(a.name)??0)+1);yield line(`${a.year}년 · ${a.category==='commercial'?'구단 인기·상업적 성과(추정)':a.category?.startsWith('club')?'구단':a.category?.startsWith('league')?'리그':a.category?.startsWith('national')?'국가대표':'월드·대회'} · ${a.name} · ${name(a.clubId)} · ${a.description} · 평가 ${a.evaluationPeriod??'기간 미보존'} · 순위 ${a.rank??'해당 없음'}`);}
 for(const [award,count] of counts)yield line(`통산 ${award}: ${count}회`);
 for(const r of s?.rankings??[])yield line(`${r.year}년 발롱도르: ${r.playerRank?`${r.playerRank}위`:'순위권 밖/미선정'} · 세계 베스트 11: ${r.world11.some(x=>x.playerId===p.id)?'선정':'미선정'}`);
 yield line(`경기 최우수 선수 합계: ${all.mom??0}회`);
 yield section('G. 팀 수상·대회 성적 전체');
 for(const h of seasons)yield line(`${h.year}년 · ${h.clubName} · ${h.competitionName} · ${h.rank}위 · ${h.completed?'완료':'중도 종료'} · ${teamRecord(h.matches,h.clubId)}`);
 for(const h of s?.national.history??[])yield line(`${h.year}년 ${h.competitionName} ${korean(h.squad)}: ${h.result} · 본선 진출 ${h.qualified?'예':'아니오'}`);
 for(const a of c.awards.filter(isTeamAward))yield line(`${a.year}년 ${a.name}: ${a.description}`);
 for(const t of cupLedger(c)){
  const team=t.matches[0]?.playerClubId;if(!team)continue;
  yield line(`${t.year}년 ${t.name} · ${name(team)} · ${tournamentResult(t,team)} · 실제 내 출전 ${t.matches.reduce((n,m)=>n+m.playerStats.apps,0)}경기 · 우승 구단 ${t.winnerId?name(t.winnerId):'미확정'} · 참가 근거 ${t.basis}`);
 }
 yield section('H. 주장·부주장 전체 이력');
 if(!l?.terms.length)yield line('기록된 주장/부주장 임기 없음');
 for(const t of l?.terms??[])yield line(`${t.scope==='club'?'클럽':'국가대표'} ${name(t.teamId)} · ${t.role==='captain'?'주장':t.role==='vice'?'부주장':'임시 경기 주장'} · ${t.startYear}년 라운드 ${t.startRound??'미기록'} → ${t.endYear??'현재'} 라운드 ${t.endRound??'미기록'} · ${t.apps}경기 · ${t.reason}`);
 for(const o of l?.offers??[])yield line(`주장단 제의 ${o.year}년 라운드 ${o.round}: ${name(o.teamId)} ${roleText(o.role)} · ${korean(o.status)} · ${o.reason}`);
 yield section('I. 몸값·계약·시장 가치 이력');
 yield line(`현재/최종 몸값: ${e?money(e.marketValue):'미기록'} · 최고 몸값: ${e?money(e.peakValue):'미기록'} · 최고 달성: ${e?.valueHistory.filter(v=>v.value===e.peakValue).map(v=>`${v.year}년 라운드 ${v.round}`).join(', ')||'과거 기록 미보존'} · 최고 주급: ${e?money(e.highestWage):'미기록'}`);
 for(const v of e?.valueHistory??[])yield line(`${v.year}년 라운드 ${v.round} 몸값 ${money(v.value)} · ${v.reason}`);
 for(const h of e?.contractHistory??[])yield line(`${h.year}년 라운드 ${h.round} ${korean(h.type)} · ${name(h.current.clubId)} · ${h.current.signedDate??h.current.signedYear} → ${h.current.expiresDate??h.current.expiresYear} · ${h.current.years}년 · 주급 ${money(h.current.wage)} · 계약상 연간 환산 ${money(h.current.wage*52)} · 이적료 ${money(h.fee)} · ${h.reason}`);
 yield line(`실제 누적 급여 ${e?money(e.salaryIncome):'미기록'} · 보너스 ${e?money(e.bonusIncome):'미기록'} · 구단 간 이적료 ${e?money(e.totalTransferFees):'미기록'}`);
 yield section('J. 능력치 성장 이력');
 const snapshots=[...seasons.flatMap(h=>h.details?[{label:`${h.year}년 시즌 시작`,attributes:h.details.startAttributes},{label:`${h.year}년 시즌 종료`,attributes:h.details.attributes}]:[]),...(s?.growthReports.flatMap(r=>[{label:`${r.year}년 라운드 ${r.fromRound}`,attributes:r.startAttributes},{label:`${r.year}년 라운드 ${r.toRound}`,attributes:r.endAttributes}])??[]),{label:`${c.season.year}년 현재/최종`,attributes:p.attributes}];
 yield line('세부 능력치 최고점은 보존된 시점끼리 비교합니다. 과거 매 경기 능력치가 없으면 그 사이의 최고값은 추정하지 않습니다.');
 for(const key of Object.keys(p.attributes)){const observed=snapshots.filter(r=>r.attributes[key as keyof typeof r.attributes]!==undefined),highest=Math.max(...observed.map(r=>r.attributes[key as keyof typeof r.attributes]!));yield line(`${ATTRIBUTE_LABELS[key as keyof typeof ATTRIBUTE_LABELS]??'추가 능력치'} 보존 최고점: ${highest} · ${[...new Set(observed.filter(r=>r.attributes[key as keyof typeof r.attributes]===highest).map(r=>r.label))].join(', ')}`);}
 for(const r of [...s?.growthReports??[]].sort((a,b)=>a.year-b.year||a.toRound-b.toRound)){yield line(`${r.year}년 ${korean(r.half)} 라운드 ${r.fromRound}–${r.toRound} · 종합 능력 ${r.ovrStart} → ${r.ovrEnd}`);yield line(`시작: ${attributesText(r.startAttributes)}`);yield line(`종료: ${attributesText(r.endAttributes)}`);if(r.growth)for(const [cause,changes] of Object.entries(r.growth.byCause))yield line(`원인 ${korean(cause)}: ${attributesText(changes)}`);if(r.offseasonAging)yield line(`시즌 전 노화: ${attributesText(r.offseasonAging.changes)}`);}
 yield line(`현재 고정 능력치: ${(s?.attributeLocks??[]).map(k=>ATTRIBUTE_LABELS[k]).join(', ')||'없음'}`);
 for(const r of s?.manualInjuries??[]){yield line(`수동 부상 · ${r.year}년 · ${name(r.clubId)} · ${r.duration==='half'?'반 시즌':'한 시즌'} · 시작 ${r.start.slice(0,10)} · 예정 복귀 ${r.end.slice(0,10)} · ${r.returned?'복귀 완료':'회복 중'} · 총 ${r.missed.length}경기 결장 (클럽 ${r.missed.filter(m=>m.scope==='club').length} / 국가대표 ${r.missed.filter(m=>m.scope==='national').length})`);for(const year of [...new Set(r.missed.map(m=>m.year))]){const actual=c.history.find(h=>h.year===year)?.stats.apps??(c.season.year===year?c.season.playerStats.apps:0);yield line(`${year}년 부상 결장 ${r.missed.filter(m=>m.year===year).length}경기 · 해당 시즌 실제 리그 출전 ${actual}경기 · 실제 클럽 ${ledger.club.filter(m=>m.seasonYear===year).reduce((n,m)=>n+m.playerStats.apps,0)}경기 / 국가대표 ${ledger.national.filter(m=>m.seasonYear===year).reduce((n,m)=>n+m.playerStats.apps,0)}경기`);}}
 for(const a of s?.manualAging??[]){yield line(`수동 노화 · ${a.playerName??p.name} · ${a.date.slice(0,10)} · ${a.year}년 라운드 ${a.round} · ${a.key?ATTRIBUTE_LABELS[a.key]:'전체 능력치(이전 방식)'} −${a.amount} · 종합 능력 ${a.ovrBefore} → ${a.ovrAfter}`);yield line(`적용 전: ${attributesText(a.before)}`);yield line(`적용 후: ${attributesText(a.after)}`);}
 yield section('K. 전체 순위 지표 및 경기별 모든 상세 기록');
 for(const h of seasons){yield line(`[${h.year}년 ${h.competitionName}] ${h.rank}위`);if(h.details)for(const [i,t] of h.details.table.entries())yield line(standingText(t,i));else yield line('최종 전체 순위표 원본: 과거 기록 미보존');}
 yield line(`[현재/마지막 시즌 전체 순위] ${c.season.competitionName}`);
 for(const [i,t] of c.season.table.entries())yield line(standingText(t,i));
 const events:Record<string,string>={shot:'슈팅',goal:'득점',save:'선방',assist:'도움',yellow:'경고',red:'퇴장',injury:'부상',substitution:'교체',pass:'패스',keyPass:'키패스',dribble:'드리블',tackle:'태클',interception:'가로채기',aerial:'공중볼 경합',handling:'공 처리',sweep:'뒷공간 처리',longKick:'롱킥'};
 for(const m of [...ledger.club,...ledger.national].sort((a,b)=>a.seasonYear-b.seasonYear||(a.date??'').localeCompare(b.date??'')||a.round-b.round)){
  yield line(`[${m.seasonYear}년 ${m.date?.slice(0,10)??`${m.round}라운드`} / ${competitionLabel(c,m.competitionId)}] ${name(m.homeId)} ${m.homeGoals}:${m.awayGoals} ${name(m.awayId)}${m.shootout?` · 승부차기 ${m.shootout.home}:${m.shootout.away}`:''}`);
  yield line(`내 출전: ${m.playerPlayed?`${m.playerStarted?'선발':'교체'} ${m.playerMinutes}분 · 평점 ${m.playerRating.toFixed(2)}`:'미출전'}`);
  for(const row of statsText(m.playerStats,[m]))yield line(row);
  const self=m.performers?.find(actor=>actor.id===p.id);if(self)yield line(`내 역할: ${POSITION_LABELS[self.position]} · ${self.captain?'주장 완장 착용':'일반 선수'}`);
  if(m.effects)yield line(`경기 후 상태: 체력 ${m.effects.fitnessAfter} · 사기 ${m.effects.moraleAfter} · 경기 감각 ${m.effects.formAfter} · 감독 신뢰 ${m.effects.trustAfter} · 부상 회복 ${m.effects.injuryWeeksAfter}주`);
  if(m.events.length)yield line('경기 주요 장면과 세부 행동');
  for(const e of [...m.events].sort((a,b)=>a.minute-b.minute))yield line(`${e.minute}분 · ${events[e.type]??'주요 장면'} · ${e.playerName} · ${name(e.teamId)} · ${e.detail}`);
  for(const [i,a] of (m.shootout?.attempts??[]).entries())yield line(`승부차기 ${i+1}번째: ${name(a.teamId)} · ${m.performers?.find(p=>p.id===a.playerId)?.name??'선수 이름 미기록'} · ${a.scored?'성공':'실패'}`);
 }
 yield section('L. 훈련·직접 조정·대회 추가 기록');
 yield line(`현재 훈련: ${c.training.map(k=>ATTRIBUTE_LABELS[k]).join(' · ')} · ${korean(c.intensity)} 강도`);
 yield line(`치트 모드: ${s?.cheats?.enabled?'사용 중':'꺼짐'} · 나이 증가 중지: ${s?.cheats?.enabled&&s.cheats.freezeAging?'사용 중':'꺼짐'} · 치트 사용 이력: ${s?.cheats?.used?'있음':'없음'}`);
 if(s?.growthLedger){yield line(`현재 시즌 성장 원인 (${s.growthLedger.year}년 ${s.growthLedger.trackedFromRound}라운드부터)`);for(const [cause,changes] of Object.entries(s.growthLedger.byCause))yield line(`${korean(cause)}: ${attributesText(changes)}`);}
 if(e){yield line(`현재 계약: ${name(e.contract.clubId)} · 주급 ${money(p.wage)} · 잔여 ${p.contractYears}년 · 역할 ${e.contract.role}`);for(const h of e.contractHistory??[])if(h.previous)yield line(`${h.year}년 계약 이전 조건: ${name(h.previous.clubId)} · 주급 ${money(h.previous.wage)} · ${h.previous.years}년 · 역할 ${h.previous.role}`);}
 if(s?.national){const n=s.national;yield line(`마지막 국가대표 대회: ${n.competitionName} · ${korean(n.squad)} · ${korean(n.phase)} · 순위 ${n.rank||'미집계'} · 승점 ${n.points} · 본선 자격 ${n.qualified?'획득':'미획득'}`);}
 for(const r of s?.rankings??[])for(const d of r.diagnostics??[])yield line(`${r.year}년 수상 평가 ${d.name}: ${d.result} · ${d.scope} · ${d.eligible?'자격 충족':'자격 미충족'} · ${d.detail}`);
 for(const t of cupLedger(c)){
  yield line(`${t.year}년 ${t.name} 전체 대진·일정 · ${t.rules}`);
  for(const f of t.fixtures)yield line(`${f.date?.slice(0,10)??'일정 대기'} · ${f.stage} ${f.leg}차전 · ${name(f.homeId)} ${f.played?`${f.homeGoals}:${f.awayGoals}`:'예정'} ${name(f.awayId)}${f.shootout?` · 승부차기 ${f.shootout.home}:${f.shootout.away}`:''}${f.winnerId?` · 진출/우승 ${name(f.winnerId)}`:''}`);
 }
 for(const year of years){const h=seasonHonours(c,year);for(const t of h.titles)yield line(`${year}년 우승 대회: ${t.name} · ${t.team} · 내 출전 ${t.apps===null?'기록 미보존':`${t.apps}경기`} · 개인 메달 ${t.medal?'획득':'획득 기록 없음'}`);}
 const teamGames=unique(s?.national.teamResults??[]);
 if(teamGames.length)yield line('국가대표 대회의 다른 팀 경기 결과');
 for(const m of teamGames)yield line(`${m.seasonYear}년 · ${competitionLabel(c,m.competitionId)} · ${name(m.homeId)} ${m.homeGoals}:${m.awayGoals} ${name(m.awayId)}${m.shootout?` · 승부차기 ${m.shootout.home}:${m.shootout.away}`:''}`);
}
export function buildCareerText(c:Career):string{return [...careerTextChunks(c)].join('');}
export function careerTextFilename(c:Career){return `K볼_${c.player.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_')}_${c.stage==='retired'?'은퇴커리어':'전체커리어'}.txt`;}
