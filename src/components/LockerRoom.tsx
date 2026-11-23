import ShirtSales from './ShirtSales';
import {hasConfirmedNextSeasonTraining} from '../game/engine';
import {needsContractOfferRefresh} from '../game/career-systems';
import {InjuryControl} from './ManualAging';
import {NationalParticipationControls,NationalParticipationHistory} from './NationalParticipation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, ArrowRight, Check, ChevronLeft, ChevronRight, Dumbbell, Play } from 'lucide-react';
import type { AttributeKey, Career, GameCommand, MatchRecord, Standing } from '../game/types';
import { ATTRIBUTE_LABELS } from '../game/attributes';
import { getLeagueRule } from '../game/league-rules';
import { seasonOverview, seasonClubId } from '../game/season-overview';
import { average, calendarLabel, compactMoney, Delta, Empty, MatchRow, Modal, Panel, seasonLabel, TeamBadge, teamName } from './Shared';
import StatsNine from './StatsNine';
import './LockerRoom.css';
import LeagueLeaders from './LeagueLeaders';
import ClubDevelopment from './ClubDevelopment';
import SeasonHonours from './SeasonHonours';
import SeasonRecordTable from './SeasonRecordTable';
import Transfers from './Transfers';
import type { GrowthCause,GrowthReport } from '../game/revision-types';

type Props = {career:Career;busy:boolean;command:(command:GameCommand,onError?:(message:string)=>void)=>void};
export function phaseLabel(c:Career) { return c.stage==='retired'?'은퇴':c.stage==='offseason'?'시즌 결산':({preseason:'시즌 준비',first:'전반기',midseason:'중간 정비',second:'후반기',review:'시즌 결산',retired:'은퇴'} as const)[c.systems?.phase || (c.season.week===0?'preseason':'first')]; }
export function GrowthCard({report}:{report:GrowthReport}) {
  const [page,setPage]=useState(0),ledger=report.growth;
  const causes:GrowthCause[]=['training','experience','development','injury','aging',...(ledger?.byCause.cheat?['cheat' as const]:[]),...(ledger?.byCause.skillChange?['skillChange' as const]:[])];
  const causeLabels={training:'훈련',experience:'출전 경험',development:'발달',injury:'부상',aging:'노화',cheat:'직접 조정',skillChange:'스킬 삭제'};
  useEffect(()=>setPage(0),[report.year,report.half]);
  const changes=Object.entries(report.endAttributes).map(([key,value])=>({key:key as AttributeKey,from:report.startAttributes[key as AttributeKey]??value??0,to:value??0,delta:(value??0)-(report.startAttributes[key as AttributeKey]??value??0)}));
  const rows=changes.slice(page*6,page*6+6),pages=Math.max(1,Math.ceil(changes.length/6));
  return <Panel title={report.half==='first'?'전반기 성장 리포트':'시즌 성장 리포트'} eyebrow={`${seasonLabel(report.year)} · R${report.fromRound}–${report.toRound}`} action={<span className="pill">OVR {report.ovrStart} → {report.ovrEnd} <Delta value={report.ovrEnd-report.ovrStart-(report.ovrAdjustment??0)}/>{report.ovrAdjustment?' · 개편 제외':''}</span>} className="growth-panel"><div className="panel-body"><div className="growth-context"><span>출전 <b>{report.stats.minutes}분</b></span><span>평점 <b>{average(report.stats)}</b> · 이전 {average(report.previousStats)}</span><span>몸값 <b>{compactMoney(report.valueStart)} → {compactMoney(report.valueEnd)}</b></span></div><p className="growth-explanation">{report.context}</p><div className="growth-table-wrap"><table className="growth-table"><thead><tr><th>능력치</th><th>시작 → 현재</th><th>변화</th>{causes.map(cause=><th key={cause}>{causeLabels[cause]}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.key}><th>{ATTRIBUTE_LABELS[row.key]}</th><td>{Math.round(row.from)} → <b>{Math.round(row.to)}</b></td><td><Delta value={row.delta}/></td>{causes.map(cause=><td key={cause}>{ledger?<Delta value={cause==='aging'?(ledger.byCause.aging?.[row.key]??0)+(report.offseasonAging?.changes[row.key]??0):(ledger.byCause[cause]?.[row.key]??0)}/>:<span className="muted">미집계</span>}</td>)}</tr>)}</tbody></table></div><div className="growth-foot"><p className="muted">{ledger?`원인 기록: R${ledger.trackedFromRound}부터 · 부상 ${ledger.injuredRounds}라운드 · 훈련 환경 ${Math.round(ledger.trainingQuality*100)}%${ledger.legacy?' · 이전 변화 원인 미집계':''}`:'이전 저장의 변화 원인은 미집계입니다. 새 진행부터 실제 변화 원인을 기록합니다.'}</p><div className="pagination"><button aria-label="능력치 이전 페이지" disabled={page===0} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={18}/></button><span>{page+1} / {pages}</span><button aria-label="능력치 다음 페이지" disabled={page+1>=pages} onClick={()=>setPage(p=>p+1)}><ChevronRight size={18}/></button></div></div>{report.offseasonAging&&<p className="aging-note">시즌 시작 전 노화: OVR {report.offseasonAging.ovrStart} → {report.offseasonAging.ovrEnd} · 전 시즌 종료부터 시즌 시작까지의 변화이며 시즌 중 합계와 별도 집계</p>}</div></Panel>;
}
function NearbyTable({career}:{career:Career}) {
  const [expanded,setExpanded]=useState(false),table=career.season.table;
  const ownId=seasonClubId(career);
  const own=Math.max(0,table.findIndex(t=>t.clubId===ownId)),rule=getLeagueRule(career.season.leagueId);
  const promotion=career.player.squad==='youth'?0:rule.promotion,relegation=career.player.squad==='youth'?0:rule.relegation;
  const start=Math.min(Math.max(0,own-2),Math.max(0,table.length-5));
  useEffect(()=>setExpanded(false),[career.id,career.season.year,career.stage]);
  const boundaries=<div className="table-boundaries">{promotion>0&&<span><i className="promotion-dot"/>승격 1–{promotion}위</span>}{relegation>0&&<span><i className="relegation-dot"/>강등 {table.length-relegation+1}–{table.length}위</span>}{!promotion&&!relegation&&<span>이 대회는 승강을 적용하지 않습니다.</span>}</div>;
  const rows=(standings:Standing[],offset:number,full:boolean)=>standings.map((r,index)=>{
    const rank=offset+index+1,difference=r.goalsFor-r.goalsAgainst;
    return <tr key={r.clubId} data-club-id={r.clubId} className={`${r.clubId===ownId?'my-team ':''}${rank<=promotion?'promotion ':rank>table.length-relegation?'relegation ':''}`}>
      <td><span className="rank-marker">{rank}</span></td><td><span className="table-club"><TeamBadge id={r.clubId} small/><strong>{teamName(r.clubId)}</strong></span></td>
      <td>{r.played}</td><td data-stat="won">{r.won}</td><td data-stat="drawn">{r.drawn}</td><td data-stat="lost">{r.lost}</td>
      {full&&<><td>{r.goalsFor}</td><td>{r.goalsAgainst}</td></>}<td>{difference>0?'+':''}{difference}</td><td><b>{r.points}</b></td>
    </tr>;
  });
  const heading=(full:boolean)=><thead><tr><th scope="col">#</th><th scope="col">구단</th><th scope="col">경기</th><th scope="col">승</th><th scope="col">무</th><th scope="col">패</th>{full&&<><th scope="col">득점</th><th scope="col">실점</th></>}<th scope="col">득실</th><th scope="col">승점</th></tr></thead>;
  return <>
    <Panel title={career.season.competitionName} action={<button className="text-button" data-testid="standings-more" aria-haspopup="dialog" aria-expanded={expanded} onClick={()=>setExpanded(true)}>전체 순위 더보기<ChevronRight size={17}/></button>} className="nearby-panel">
      <div className="nearby-standings-scroll" role="region" aria-label="내 팀 주변 순위 · 승무패 포함, 좌우로 스크롤" tabIndex={0}><table className="league-table nearby-standings" aria-label="내 팀 주변 순위" data-testid="nearby-standings">{heading(false)}<tbody>{rows(table.slice(start,start+5),start,false)}</tbody></table></div>
      <div className="table-note">{boundaries}</div>
    </Panel>
    {expanded&&<Modal title={`전체 순위 · ${career.season.competitionName}`} onClose={()=>setExpanded(false)} wide>
      <div className="full-standings-intro"><p>{calendarLabel(career)} · {table.length}개 구단 전체 순위</p><span className="pill">승 3점 · 무 1점 · 패 0점</span></div>
      <div className="full-standings-scroll" role="region" aria-label="전체 순위표 · 상하와 좌우로 스크롤" tabIndex={0} data-testid="full-standings-scroll"><table className="league-table full-standings" aria-label={`${career.season.competitionName} 전체 순위`} data-testid="full-standings">{heading(true)}<tbody>{rows(table,0,true)}</tbody></table></div>
      <div className="table-note full-standings-note">{boundaries}<span>내 팀은 연두색으로 표시합니다. 작은 화면에서는 표를 좌우로 움직일 수 있습니다.</span></div>
    </Modal>}
  </>;
}
export default function LockerRoom({career,busy,command,onMatch,onTraining,onCareer}:Props&{onMatch:(m:MatchRecord)=>void;onTraining?:()=>void;onCareer?:(view:'national'|'awards'|'seasons'|'records')=>void;presenting?:boolean}) {
  const [transfers,setTransfers]=useState(false),[matchPage,setMatchPage]=useState(0),[allMatches,setAllMatches]=useState(false),[injuryOpen,setInjuryOpen]=useState(false);
  const p=career.player,s=career.season,phase=career.systems?.phase||'preseason';
  useEffect(()=>{setTransfers(false);setMatchPage(0);setAllMatches(false);},[career.id,s.year,career.stage]);
  const recent=useMemo(()=>[...s.matches].reverse(),[career]);
  const { national, club, combined, detailed, nationalCompetitions, clubCompetitions } = useMemo(() => seasonOverview(career), [career]);
  const next=career.stage==='offseason'?{label:'다음 시즌 시작',command:{type:'nextSeason'} as GameCommand}:phase==='midseason'?{label:'후반기 진행',command:{type:'continueHalf'} as GameCommand}:{label:phase==='second'?'후반기 계속 진행':'전반기 진행',command:{type:'advanceHalf'} as GameCommand};
  const trainingConfirmed=hasConfirmedNextSeasonTraining(career);
  const nextBlocked=false;
  return <section className="locker-workspace" aria-label="시즌 현황" data-testid="locker-season-overview">
    <div className="locker-overview-heading"><h2>시즌 현황</h2><nav className="locker-shortcuts" aria-label="시즌 빠른 이동">
      {onTraining&&(career.stage!=='offseason'||trainingConfirmed)&&<button className="text-button" data-testid="quick-training" onClick={onTraining}>훈련 계획</button>}
      {onCareer&&<><button className="text-button" data-testid="quick-national" onClick={()=>onCareer('national')}>국가대표</button><button className="text-button" data-testid="quick-awards" onClick={()=>onCareer('awards')}>수상 · 우승</button><button className="text-button" data-testid="quick-seasons" onClick={()=>onCareer('seasons')}>시즌 이력</button></>}
    </nav>{career.stage==='offseason'&&<span className="preparation-status">계약 {p.clubId==='FA'?'FA':career.transferDecision?'✓':'현재 계약 유지 · 만료 시 FA'} · 훈련 {trainingConfirmed?(career.training.length?'✓':'선택 없음'):'미확정 · 선택 없음 · 균형 강도로 시작'}</span>}</div>
    <div className="locker-controls"><div className="season-progress"><div><strong>{phaseLabel(career)}</strong><span>{s.week} / {s.totalWeeks}라운드</span></div><div className="season-track"><span style={{width:`${Math.min(100,s.week/Math.max(1,s.totalWeeks)*100)}%`}}/></div></div><div className="action-inline">
      {career.stage!=='retired'&&<button data-testid="advance-half" className="button primary" disabled={busy||nextBlocked} onClick={()=>command(next.command)}><Play size={18}/>{next.label}<ArrowRight size={18}/></button>}
      {career.stage!=='retired'&&<InjuryControl career={career} busy={busy} open={injuryOpen} onToggle={()=>setInjuryOpen(v=>!v)} command={command}/>}
      {career.stage!=='retired'&&<NationalParticipationControls career={career} busy={busy} command={command}/>}
      {career.stage!=='retired'&&<button className="button secondary" data-testid="transfer-window" disabled={busy} onClick={()=>{if(needsContractOfferRefresh(career))command({type:'refreshOffers'});setTransfers(true);}}><ArrowLeftRight size={18}/>{p.clubId==='FA'?'FA · 계약 제안':'이적 · 재계약'}</button>}
      {career.stage==='offseason'&&<>{!trainingConfirmed&&onTraining&&<button className="button secondary" data-testid="training-plan" disabled={busy} onClick={onTraining}><Dumbbell size={17}/>훈련 선택</button>}</>}
    </div></div>
    <div className="locker-core" data-testid="locker-core"><div className="locker-records">
      <Panel title="이번 시즌 기록" action={<LeagueLeaders career={career}/>} className="season-summary-panel">
        <SeasonRecordTable key={`${career.id}:${s.year}`} combined={combined} national={national} club={club}
          nationalCompetitions={nationalCompetitions} clubCompetitions={clubCompetitions} keeper={p.position==='GK'} />
      </Panel>
      <SeasonHonours career={career} compact/>
      <Panel title={allMatches?'시즌 경기':'최근 경기'} action={recent.length>3?<button className="text-button" onClick={()=>{setAllMatches(v=>!v);setMatchPage(0);}}>{allMatches?'최근 경기':'전체 경기'}</button>:undefined} className="recent-panel">
        {recent.length?<><div className="match-list">{recent.slice(allMatches?matchPage*3:0,allMatches?matchPage*3+3:3).map(m=><MatchRow key={m.id} match={m} onClick={()=>onMatch(m)}/>)}</div>{allMatches&&<div className="pagination"><button aria-label="라커룸 경기 이전 페이지" disabled={matchPage===0} onClick={()=>setMatchPage(page=>page-1)}><ChevronLeft size={18}/></button><span>{matchPage+1} / {Math.ceil(recent.length/3)}</span><button aria-label="라커룸 경기 다음 페이지" disabled={(matchPage+1)*3>=recent.length} onClick={()=>setMatchPage(page=>page+1)}><ChevronRight size={18}/></button></div>}</>:<p className="first-match-note">첫 경기 전입니다. 전반기를 진행하면 결과가 여기에 표시됩니다.</p>}
      </Panel>
    </div><NearbyTable career={career}/></div>
    <details className="locker-detail locker-season-details" data-testid="season-details-disclosure" key={`${career.id}:${s.year}`}>
      <summary><strong>이번 시즌 통합 세부 기록</strong><span>{combined.apps}경기 · {combined.minutes.toLocaleString()}분 · 평점 {average(combined)}</span><span className="disclosure-cue">{p.position==='GK'?10:12}개 지표 <ChevronRight size={17}/></span></summary>
      <div className="panel-body" data-testid="locker-season-details"><StatsNine stats={combined} detailedStats={detailed} position={p.position}/><ShirtSales career={career}/>{onCareer&&<button className="text-button" onClick={()=>onCareer('records')}>대회별 · 경기별 전체 기록<ArrowRight size={16}/></button>}</div>
    </details>
    <NationalParticipationHistory career={career} year={s.year}/>
    {!!career.systems?.manualInjuries?.length&&<details className="locker-detail injury-history" data-testid="injury-history"><summary>부상 · 결장 이력</summary><div className="panel-body">{[...career.systems.manualInjuries].reverse().slice(0,12).map(r=><p key={r.id}>{r.year}시즌 · {typeof r.duration==='number'?`${r.duration}경기 부상`:r.selectionVersion===2?'시즌 전체 부상':r.duration==='half'?'반 시즌 부상':'한 시즌 부상'} · {r.pendingNextSeason?'다음 시즌 예약':r.returned?'복귀 완료':'회복 중'} · 클럽 {r.missed.filter(m=>m.scope==='club').length} / 국대 {r.missed.filter(m=>m.scope==='national').length}경기 결장{r.remainingMatches!==undefined&&!r.returned?` · 클럽 ${r.remainingMatches}경기 남음`:''}</p>)}</div></details>}
    <ClubDevelopment career={career}/>
    {transfers&&<Transfers career={career} busy={busy} command={command} onClose={()=>setTransfers(false)}/>}
  </section>;
}
