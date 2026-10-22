import { useEffect, useState } from 'react';
import { ArrowLeftRight, ArrowRight, Check, ChevronLeft, ChevronRight, Dumbbell, Play } from 'lucide-react';
import type { AttributeKey, Career, GameCommand, MatchRecord, Standing } from '../game/types';
import { ATTRIBUTE_LABELS } from '../game/attributes';
import { getLeagueRule } from '../game/league-rules';
import { sumStats } from '../game/math';
import { average, calendarLabel, compactMoney, Delta, Empty, MatchRow, Modal, money, Panel, seasonLabel, TeamBadge, teamName } from './Shared';
import StatsNine from './StatsNine';
import './LockerRoom.css';
import LeagueLeaders from './LeagueLeaders';
import ClubDevelopment from './ClubDevelopment';
import SeasonHonours from './SeasonHonours';
import type { GrowthCause,GrowthReport } from '../game/revision-types';

type Props = {career:Career;busy:boolean;command:(command:GameCommand)=>void};
export function phaseLabel(c:Career) { return c.stage==='retired'?'은퇴':c.stage==='offseason'?'시즌 결산':({preseason:'시즌 준비',first:'전반기',midseason:'중간 정비',second:'후반기',review:'시즌 결산',retired:'은퇴'} as const)[c.systems?.phase || (c.season.week===0?'preseason':'first')]; }
export function GrowthCard({report}:{report:GrowthReport}) {
  const [page,setPage]=useState(0),ledger=report.growth;
  const causes:GrowthCause[]=['training','experience','development','injury','aging',...(ledger?.byCause.cheat?['cheat' as const]:[])];
  const causeLabels={training:'훈련',experience:'출전 경험',development:'발달',injury:'부상',aging:'시즌 전 노화',cheat:'직접 조정'};
  useEffect(()=>setPage(0),[report.year,report.half]);
  const changes=Object.entries(report.endAttributes).map(([key,value])=>({key:key as AttributeKey,from:report.startAttributes[key as AttributeKey]??value??0,to:value??0,delta:(value??0)-(report.startAttributes[key as AttributeKey]??value??0)}));
  const rows=changes.slice(page*6,page*6+6),pages=Math.max(1,Math.ceil(changes.length/6));
  return <Panel title={report.half==='first'?'전반기 성장 리포트':'시즌 성장 리포트'} eyebrow={`${seasonLabel(report.year)} · R${report.fromRound}–${report.toRound}`} action={<span className="pill">OVR {report.ovrStart} → {report.ovrEnd} <Delta value={report.ovrEnd-report.ovrStart}/></span>} className="growth-panel"><div className="panel-body"><div className="growth-context"><span>출전 <b>{report.stats.minutes}분</b></span><span>평점 <b>{average(report.stats)}</b> · 이전 {average(report.previousStats)}</span><span>몸값 <b>{compactMoney(report.valueStart)} → {compactMoney(report.valueEnd)}</b></span></div><p className="growth-explanation">{report.context}</p><div className="growth-table-wrap"><table className="growth-table"><thead><tr><th>능력치</th><th>시작 → 현재</th><th>변화</th>{causes.map(cause=><th key={cause}>{causeLabels[cause]}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.key}><th>{ATTRIBUTE_LABELS[row.key]}</th><td>{Math.round(row.from)} → <b>{Math.round(row.to)}</b></td><td><Delta value={row.delta}/></td>{causes.map(cause=><td key={cause}>{ledger?<Delta value={cause==='aging'?(report.offseasonAging?.changes[row.key]??0):(ledger.byCause[cause]?.[row.key]??0)}/>:<span className="muted">미집계</span>}</td>)}</tr>)}</tbody></table></div><div className="growth-foot"><p className="muted">{ledger?`원인 기록: R${ledger.trackedFromRound}부터 · 부상 ${ledger.injuredRounds}라운드 · 훈련 환경 ${Math.round(ledger.trainingQuality*100)}%${ledger.legacy?' · 이전 변화 원인 미집계':''}`:'이전 저장의 변화 원인은 미집계입니다. 새 진행부터 실제 변화 원인을 기록합니다.'}</p><div className="pagination"><button aria-label="능력치 이전 페이지" disabled={page===0} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={18}/></button><span>{page+1} / {pages}</span><button aria-label="능력치 다음 페이지" disabled={page+1>=pages} onClick={()=>setPage(p=>p+1)}><ChevronRight size={18}/></button></div></div>{report.offseasonAging&&<p className="aging-note">시즌 시작 전 노화: OVR {report.offseasonAging.ovrStart} → {report.offseasonAging.ovrEnd} · 전 시즌 종료부터 시즌 시작까지의 변화이며 시즌 중 합계와 별도 집계</p>}</div></Panel>;
}
function Transfers({career,busy,command,onClose}:Props&{onClose:()=>void}) {
  const p=career.player,e=career.systems?.economics,active=career.stage==='offseason',offers=active?career.offers:[];
  return <Modal title="계약과 다음 행선지" onClose={onClose} wide>
    <div className="contract-current"><TeamBadge id={p.clubId}/><div><span className="eyebrow">현재 계약</span><strong>{teamName(p.clubId)}</strong><span>{money(p.wage)}/주 · {e?.contract.role||'역할 미집계'} · {e?.contract.signedDate||e?.contract.signedYear||'—'} → {e?.contract.expiresDate||e?.contract.expiresYear||'—'}</span></div><span className="pill">{p.contractYears}년 남음</span></div>
    {career.transferDecision?<div className="notice"><Check size={18}/>다음 시즌 행선지를 확정했습니다. {teamName(p.clubId)}에서 계속합니다.</div>:active?<>
      <div className="offer-grid">{offers.map(o=><section className="offer" key={o.id}><div className="offer-title"><TeamBadge id={o.clubId}/><span className="pill">{o.type==='renew'?'재계약':'이적 제안'}</span></div><h3>{teamName(o.clubId)}</h3><p className="muted">{o.reason}</p><dl className="detail-list"><div><dt>주급 변화</dt><dd>{money(p.wage)} → <b>{money(o.wage)}</b></dd></div><div><dt>이전 대비</dt><dd><Delta value={Math.round((o.wage-p.wage)/Math.max(1,p.wage)*100)}/> %</dd></div><div><dt>계약 / 역할</dt><dd>{o.years}년 · {o.role}</dd></div><div><dt>구단 간 이적료</dt><dd>{o.type==='renew'?'해당 없음':money(o.fee)}</dd></div><div><dt>효력</dt><dd>다음 시즌</dd></div></dl><button className="button primary full" disabled={busy} onClick={()=>command({type:'transfer',offerId:o.id})}>제안 수락<ArrowRight size={17}/></button></section>)}</div>
      {!offers.length&&<Empty title="도착한 제안이 없습니다">현재 구단에 잔류하고 다음 시즌을 준비할 수 있습니다.</Empty>}
      <div className="modal-actions"><button className="button secondary" disabled={busy} onClick={()=>command({type:'stay'})}>현재 구단에 잔류</button></div>
    </>:<p className="muted">이적과 재계약은 시즌 종료 후 진행합니다.</p>}
    <p className="fine-print">주급은 선수 수입이며, 이적료는 구단 간 거래입니다. 전체 계약 이력은 선수 → 계약·몸값에서 확인합니다.</p>
  </Modal>;
}
function NearbyTable({career}:{career:Career}) {
  const [expanded,setExpanded]=useState(false),table=career.season.table;
  const ownId=career.stage==='season'?career.player.clubId:career.history.at(-1)?.clubId||career.player.clubId;
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
export default function LockerRoom({career,busy,command,onMatch,onTraining}:Props&{onMatch:(m:MatchRecord)=>void;onTraining?:()=>void;presenting?:boolean}) {
  const [transfers,setTransfers]=useState(false),[matchPage,setMatchPage]=useState(0),[allMatches,setAllMatches]=useState(false);
  const p=career.player,s=career.season,phase=career.systems?.phase||'preseason';
  useEffect(()=>{setTransfers(false);setMatchPage(0);setAllMatches(false);},[career.id,s.year,career.stage]);
  const recent=[...s.matches].reverse(),n=career.systems?.national,seen=new Set<string>();
  const natMatches=[...(n?.history.filter(h=>h.year===s.year).flatMap(h=>h.matches)||[]),...(n?.matches||[])].filter(m=>m.seasonYear===s.year&&!seen.has(m.id)&&Boolean(seen.add(m.id)));
  const national=sumStats(natMatches.map(m=>m.playerStats)),club=s.playerStats,combined=sumStats([club,national]);
  const detailed=sumStats([...s.matches,...natMatches].filter(m=>m.metricsVersion===2).map(m=>m.playerStats));
  const summaries=[['통합',combined],['클럽',club],['국대',national]] as const;
  const next=career.stage==='offseason'?{label:'다음 시즌 시작',command:{type:'nextSeason'} as GameCommand}:phase==='midseason'?{label:'후반기 진행',command:{type:'continueHalf'} as GameCommand}:{label:phase==='second'?'후반기 계속 진행':'전반기 진행',command:{type:'advanceHalf'} as GameCommand};
  const trainingConfirmed=career.systems?.trainingPlan?.forYear===s.year+1&&career.systems.trainingPlan.confirmed;
  const nextBlocked=career.stage==='offseason'&&(!career.transferDecision||!trainingConfirmed);
  return <section className="locker-workspace" aria-label="시즌 현황" data-testid="locker-season-overview">
    <div className="locker-overview-heading"><h2>시즌 현황</h2>{career.stage==='offseason'&&<span className="preparation-status">계약 {career.transferDecision?'✓':'선택 필요'} · 훈련 {trainingConfirmed?'✓':'선택 필요'}</span>}</div>
    <div className="locker-controls"><div className="season-progress"><div><strong>{phaseLabel(career)}</strong><span>{s.week} / {s.totalWeeks}라운드</span></div><div className="season-track"><span style={{width:`${Math.min(100,s.week/Math.max(1,s.totalWeeks)*100)}%`}}/></div></div><div className="action-inline">
      {career.stage!=='retired'&&<button data-testid="advance-half" className="button primary" disabled={busy||nextBlocked} onClick={()=>command(next.command)}><Play size={18}/>{next.label}<ArrowRight size={18}/></button>}
      {career.stage==='offseason'&&<><button className="button secondary" data-testid="transfer-window" disabled={busy} onClick={()=>setTransfers(true)}><ArrowLeftRight size={18}/>이적 · 재계약{career.transferDecision&&<Check size={18}/>}</button>{!trainingConfirmed&&onTraining&&<button className="button secondary" data-testid="training-plan" disabled={busy} onClick={onTraining}><Dumbbell size={17}/>훈련 선택</button>}</>}
    </div></div>
    <div className="locker-core" data-testid="locker-core"><div className="locker-records">
      <Panel title="이번 시즌 기록" action={<LeagueLeaders career={career}/>} className="season-summary-panel"><table className="season-summary"><thead><tr><th>범위</th><th>출전</th><th>분</th><th>{p.position==='GK'?'선방':'골'}</th><th>{p.position==='GK'?'무실점':'도움'}</th><th>평점</th></tr></thead><tbody>{summaries.map(([label,stats])=><tr key={label}><th>{label}</th><td>{stats.apps}</td><td>{stats.minutes}</td><td>{p.position==='GK'?stats.saves:stats.goals}</td><td>{p.position==='GK'?stats.cleanSheets:stats.assists}</td><td>{average(stats)}</td></tr>)}</tbody></table></Panel>
      <Panel title={allMatches?'시즌 경기':'최근 경기'} action={recent.length>3?<button className="text-button" onClick={()=>{setAllMatches(v=>!v);setMatchPage(0);}}>{allMatches?'최근 경기':'전체 경기'}</button>:undefined} className="recent-panel">
        {recent.length?<><div className="match-list">{recent.slice(allMatches?matchPage*3:0,allMatches?matchPage*3+3:3).map(m=><MatchRow key={m.id} match={m} onClick={()=>onMatch(m)}/>)}</div>{allMatches&&<div className="pagination"><button aria-label="라커룸 경기 이전 페이지" disabled={matchPage===0} onClick={()=>setMatchPage(page=>page-1)}><ChevronLeft size={18}/></button><span>{matchPage+1} / {Math.ceil(recent.length/3)}</span><button aria-label="라커룸 경기 다음 페이지" disabled={(matchPage+1)*3>=recent.length} onClick={()=>setMatchPage(page=>page+1)}><ChevronRight size={18}/></button></div>}</>:<Empty title="첫 경기를 기다립니다">전반기 진행을 누르면 경기가 시작됩니다.</Empty>}
      </Panel>
    </div><NearbyTable career={career}/></div>
    <SeasonHonours career={career}/><ClubDevelopment career={career}/>
    <Panel title="이번 시즌 통합 세부 기록" action={<span className="pill">{calendarLabel(career)} · 클럽 + 국대</span>} className="locker-season-details">
      <div className="panel-body" data-testid="locker-season-details"><StatsNine stats={combined} detailedStats={detailed} position={p.position}/></div>
    </Panel>
    {transfers&&career.stage==='offseason'&&<Transfers career={career} busy={busy} command={command} onClose={()=>setTransfers(false)}/>}
  </section>;
}
