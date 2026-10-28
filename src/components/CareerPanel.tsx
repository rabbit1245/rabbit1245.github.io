import NationalAudit from './NationalAudit';
import {cupLedger,cupMatches} from '../game/club-competitions';
import SeasonHonours from './SeasonHonours';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Copy, Download, Trophy } from 'lucide-react';
import type { Career, GameCommand, MatchRecord, PlayerStats, SeasonSummary } from '../game/types';
import { sumStats } from '../game/math';
import { nationalMatchLedger, newestMatchFirst } from '../game/season-overview';
import { ATTRIBUTE_LABELS,POSITION_LABELS } from '../game/attributes';
import {careerRecordTotals,careerSeasonRecords,careerStatsLines,careerMatchLedger} from '../game/career-text';
import type { AttributeKey } from '../game/types';
import { average, calendarLabel, clubTotal, compactMoney, Empty, MatchRow, Metric, Money, money, nationalTotal, Panel, TeamBadge, teamName, visibleAwards } from './Shared';
import StatsNine from './StatsNine';
import './CareerPanel.css';

type Scope = 'all'|'club'|'national';
export type CareerView = 'records'|'seasons'|'national'|'awards'|'ledger'|'retirement';
type RecordRow = {year:number;clubId:string;squad:string;competitionId:string;competitionName:string;stats:PlayerStats;matches:MatchRecord[]};
const PAGE_SIZE = 6;

function Pager({page,total,onChange,label,size=PAGE_SIZE}:{page:number;total:number;onChange:(value:number)=>void;label:string;size?:number}) {
  const pages=Math.max(1,Math.ceil(total/size)),current=Math.min(page,pages-1);
  return <div className="pagination" aria-label={`${label} 페이지`}><span>{total?`${current*size+1}–${Math.min(total,(current+1)*size)} / ${total}`:'0개'}</span><div><button type="button" className="button secondary small" disabled={current===0} aria-label={`${label} 이전 페이지`} onClick={()=>onChange(current-1)}><ChevronLeft size={17}/>이전</button><span aria-live="polite">{current+1} / {pages}</span><button type="button" className="button secondary small" disabled={current+1>=pages} aria-label={`${label} 다음 페이지`} onClick={()=>onChange(current+1)}>다음<ChevronRight size={17}/></button></div></div>;
}
function PageMatches({matches,onMatch,label='경기'}:{matches:MatchRecord[];onMatch:(match:MatchRecord)=>void;label?:string}) {
  const [page,setPage]=useState(0),current=Math.min(page,Math.max(0,Math.ceil(matches.length/PAGE_SIZE)-1));
  return <>{matches.length?<div className="match-list">{matches.slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE).map(m=><MatchRow key={m.id} match={m} onClick={()=>onMatch(m)}/>)}</div>:<Empty title="선택한 범위의 경기가 없습니다"/>}<Pager page={current} total={matches.length} onChange={setPage} label={label}/></>;
}
function nationalMatches(career:Career) {
  return nationalMatchLedger(career);
}
function nationalCompetition(career:Career,id:string) {
  if(id.startsWith('FRIENDLIES:'))return `${id.split(':')[1]} 국제친선`;
  return career.systems?.national.history.find(h=>h.competitionId===id)?.competitionName??career.systems?.national.competitionName??'국가대표';
}

export function RecordBook({career,onMatch}:{career:Career;onMatch:(m:MatchRecord)=>void}) {
  const [period,setPeriod]=useState<'career'|'season'>('season'),[year,setYear]=useState(career.season.year),[scope,setScope]=useState<Scope>('all'),[competition,setCompetition]=useState('all'),[club,setClub]=useState('all'),[age,setAge]=useState('all'),[detail,setDetail]=useState<'metrics'|'matches'>('metrics');
  const n=career.systems?.national;
  const clubRows:RecordRow[]=useMemo(()=>[...cupLedger(career).filter(t=>t.matches.length).map(t=>({year:t.year,clubId:t.matches[0].playerClubId,squad:'senior',competitionId:t.id,competitionName:t.name,stats:sumStats(t.matches.map(m=>m.playerStats)),matches:t.matches})),...career.history.map(h=>({year:h.year,clubId:h.clubId,squad:h.squad,competitionId:h.leagueId,competitionName:h.competitionName,stats:h.stats,matches:h.matches})),...(!career.history.some(h=>h.year===career.season.year)&&(career.stage==='season'||career.season.matches.length)?[{year:career.season.year,clubId:career.season.matches[0]?.playerClubId??career.player.clubId,squad:career.player.squad,competitionId:career.season.leagueId,competitionName:career.season.competitionName,stats:career.season.playerStats,matches:career.season.matches}]:[])],[career]);
  const natRows:RecordRow[]=useMemo(()=>nationalMatches(career).map(m=>({year:m.seasonYear,clubId:m.playerClubId,squad:m.playerClubId.endsWith(':U20')?'U20':'senior',competitionId:m.competitionId??'national',competitionName:nationalCompetition(career,m.competitionId??'national'),stats:m.playerStats,matches:[m]})),[career]);
  const competitions=[...new Map([...clubRows,...natRows].map(r=>[r.competitionId,r.competitionName])).entries()];
  const included=(r:RecordRow,kind:'club'|'national')=>(period==='career'||r.year===year)&&(competition==='all'||r.competitionId===competition)&&(kind==='national'||club==='all'||r.clubId===club)&&(age==='all'||age==='youth'&&(r.squad==='youth'||r.squad==='U20')||age==='senior'&&r.squad==='senior');
  const filteredClub=clubRows.filter(r=>included(r,'club')),filteredNat=natRows.filter(r=>included(r,'national')),cs=sumStats(filteredClub.map(r=>r.stats)),ns=sumStats(filteredNat.map(r=>r.stats)),combined=sumStats([cs,ns]),selected=scope==='all'?combined:scope==='club'?cs:ns;
  const selectedMatches=(scope==='all'?[...filteredClub,...filteredNat]:scope==='club'?filteredClub:filteredNat).flatMap(r=>r.matches).sort(newestMatchFirst);
  const years=[...new Set([...clubRows,...natRows].map(r=>r.year).concat(career.season.year))].sort((a,b)=>b-a);
  return <Panel title="통합 · 클럽 · 국가대표 기록" className="record-book"><div className="record-filters"><div className="segmented" aria-label="기록 기간"><button aria-pressed={period==='season'} className={period==='season'?'active':''} onClick={()=>setPeriod('season')}>시즌</button><button aria-pressed={period==='career'} className={period==='career'?'active':''} onClick={()=>setPeriod('career')}>통산</button></div>{period==='season'&&<label><span>시즌</span><select aria-label="기록 시즌" value={year} onChange={e=>setYear(Number(e.target.value))}>{years.map(y=><option key={y} value={y}>{calendarLabel(career,y)}</option>)}</select></label>}<label><span>대회</span><select aria-label="기록 대회" value={competition} onChange={e=>setCompetition(e.target.value)}><option value="all">모든 대회</option>{competitions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><label><span>클럽</span><select aria-label="기록 클럽" value={club} onChange={e=>setClub(e.target.value)}><option value="all">모든 클럽</option>{[...new Set(clubRows.map(r=>r.clubId))].map(id=><option key={id} value={id}>{teamName(id)}</option>)}</select></label><label><span>연령</span><select aria-label="기록 연령대" value={age} onChange={e=>setAge(e.target.value)}><option value="all">전체 연령</option><option value="senior">성인 1군 · A대표</option><option value="youth">유소년 · U20</option></select></label></div>
    <div className="record-summary" role="group" aria-label="기록 범위"><div className="record-summary-labels"><span>기록 범위</span><span>경기</span><span>시간</span><span>득점</span><span>도움</span><span>평점</span></div>{([{id:'all',label:'통합',stats:combined},{id:'club',label:'클럽',stats:cs},{id:'national',label:'국대',stats:ns}] as const).map(r=><button key={r.id} data-testid={`records-scope-${r.id}`} className={scope===r.id?'selected':''} aria-pressed={scope===r.id} onClick={()=>setScope(r.id)}><strong>{r.label}<ArrowRight size={16}/></strong><span>{r.stats.apps}</span><span>{r.stats.minutes.toLocaleString()}′</span><span>{r.stats.goals}</span><span>{r.stats.assists}</span><span>{average(r.stats)}</span></button>)}</div>
    <div className="panel-body"><div className="detail-heading"><h3>{scope==='all'?'통합':scope==='club'?'클럽':'국가대표'} 세부 기록</h3><div className="segmented record-detail-toggle"><button className={detail==='metrics'?'active':''} aria-pressed={detail==='metrics'} onClick={()=>setDetail('metrics')}>핵심 {career.player.position==='GK'?10:12}개 지표</button><button data-testid="record-match-ledger" className={detail==='matches'?'active':''} aria-pressed={detail==='matches'} onClick={()=>setDetail('matches')}>경기 원장 {selectedMatches.length}</button></div></div>{detail==='metrics'?<><StatsNine stats={selected} detailedStats={sumStats(selectedMatches.filter(m=>m.metricsVersion===2).map(m=>m.playerStats))} position={career.player.position}/>{scope==='national'&&!selected.apps&&<p className="record-unselected">{n?.reason??'아직 국가대표 출전 기록이 없습니다.'}</p>}</>:<PageMatches key={`${scope}:${period}:${year}:${competition}:${club}:${age}`} matches={selectedMatches} onMatch={onMatch} label="기록 경기"/>}</div>
  </Panel>;
}

function Seasons({career,onMatch}:{career:Career;onMatch:(m:MatchRecord)=>void}) {
  const seasons=[...career.history].reverse(),[selection,setSelection]=useState(0),[detail,setDetail]=useState<'overview'|'matches'|'growth'>('overview'),season=seasons[Math.min(selection,Math.max(0,seasons.length-1))];
  if(!season)return <Panel title="시즌 이력"><Empty title="첫 시즌을 기록하고 있습니다">시즌을 마치면 팀·대회·순위·능력치와 모든 경기 기록이 보존됩니다.</Empty></Panel>;
  return <Panel title="시즌 이력" action={<select aria-label="이력 시즌 선택" value={Math.min(selection,seasons.length-1)} onChange={e=>setSelection(Number(e.target.value))}>{seasons.map((h,i)=><option key={`${h.year}:${h.clubId}:${i}`} value={i}>{calendarLabel(career,h.year)} · {h.clubName}{career.stage==='retired'&&h.year===(career.retiredYear??career.season.year)?' · 은퇴':''}</option>)}</select>}><div className="panel-body"><div className="season-choice"><TeamBadge id={season.clubId}/><div><h3>{season.clubName} · {season.competitionName}</h3><p>{season.age}세 · {season.position} · {season.squad==='youth'?'U19 유소년':'성인 1군'} · {season.rank}위{career.stage==='retired'&&season.year===(career.retiredYear??career.season.year)?' · 은퇴':season.completed?'':' · 중도 종료'}</p></div><span className="pill">OVR {season.ovrStart} → {season.ovrEnd}</span></div><div className="view-toolbar"><div className="segmented"><button className={detail==='overview'?'active':''} onClick={()=>setDetail('overview')}>시즌 기록</button><button className={detail==='matches'?'active':''} onClick={()=>setDetail('matches')}>경기 {season.matches.length}</button><button className={detail==='growth'?'active':''} onClick={()=>setDetail('growth')}>능력치 변화</button></div><span>{visibleAwards(season.awards).map(a=>a.name).join(' · ')||'수상 기록 없음'}</span></div>{detail==='overview'?<StatsNine stats={season.stats} detailedStats={sumStats(season.matches.filter(m=>m.metricsVersion===2).map(m=>m.playerStats))} position={season.position}/>:detail==='matches'?<PageMatches key={`${season.year}:${season.clubId}`} matches={[...season.matches].reverse()} onMatch={onMatch} label="시즌 경기"/>:<SeasonGrowth season={season} career={career}/>}</div></Panel>;
}
function SeasonGrowth({season,career}:{season:SeasonSummary;career:Career}) {

  const aging=career.systems?.manualAging?.filter(a=>a.year===season.year)??[];
  return <div className="season-growth-summary"><p>종합 능력 {season.ovrStart} → {season.ovrEnd} · {season.stats.minutes.toLocaleString()}분 출전</p><div className="season-growth-grid">{Object.entries(season.attributeGrowth).map(([key,value])=><div key={key}><span>{ATTRIBUTE_LABELS[key as AttributeKey]??key}</span><strong>{(value??0)>0?'+':''}{Math.round((value??0)*100)/100}</strong></div>)}</div>{aging.length>0&&<details><summary>수동 노화 적용 이력 {aging.length}회</summary>{aging.map(a=><p key={a.id}>{a.date.slice(0,10)} · 전체 능력치 −{a.amount} · 종합 능력 {a.ovrBefore} → {a.ovrAfter}</p>)}</details>}</div>;
}

function NationalPanel({career,onMatch}:{career:Career;onMatch:(m:MatchRecord)=>void}) {
  const n=career.systems?.national,[year,setYear]=useState(career.season.year),[squad,setSquad]=useState('all'),[competition,setCompetition]=useState('all');
  const all=nationalMatches(career),years=[...new Set(all.map(m=>m.seasonYear).concat(career.season.year))].sort((a,b)=>b-a),inYear=all.filter(m=>m.seasonYear===year&&(squad==='all'||m.playerClubId.endsWith(`:${squad}`))),competitions=[...new Set(inYear.map(m=>m.competitionId??'national'))],filtered=inYear.filter(m=>competition==='all'||m.competitionId===competition).sort((a,b)=>b.round-a.round);
  const label={unselected:'미선발',watchlist:'관찰 대상',called:'대표팀 소집',injured:'부상으로 제외',retired:'대표팀 은퇴'};
  const currentStats=nationalTotal(career);
  return <Panel title={`${career.player.nationality} 국가대표 경력`} action={<span className={`pill ${n?.status==='called'?'teal':''}`}>{n?label[n.status]:'미선발'}</span>}><div className="panel-body"><div className="national-status"><TeamBadge id={`NAT:${career.player.nationality}:${n?.squad??'senior'}`}/><div><h3>현재 {n?.squad==='U20'?'U20':'성인'} 대표팀 상태</h3><p>{n?.reason??'구단에서의 활약을 통해 대표팀 관찰과 소집을 기다립니다.'}</p></div></div><div className="metric-row national-career-totals"><Metric label="국대 통산 출전" value={currentStats.apps}/><Metric label="국대 통산 시간" value={`${currentStats.minutes.toLocaleString()}분`}/><Metric label="득점 / 도움" value={`${currentStats.goals} / ${currentStats.assists}`}/><Metric label="통산 평점" value={average(currentStats)}/></div><NationalAudit career={career}/><div className="view-toolbar"><label>시즌<select aria-label="국대 이력 시즌" value={year} onChange={e=>{setYear(Number(e.target.value));setCompetition('all');}}>{years.map(y=><option key={y} value={y}>{calendarLabel(career,y)}</option>)}</select></label><label>대표팀<select aria-label="국대 이력 연령대" value={squad} onChange={e=>{setSquad(e.target.value);setCompetition('all');}}><option value="all">U20 · 성인 전체</option><option value="U20">U20</option><option value="senior">성인 대표</option></select></label><label>대회<select aria-label="국대 이력 대회" value={competition} onChange={e=>setCompetition(e.target.value)}><option value="all">모든 대회</option>{competitions.map(id=><option key={id} value={id}>{nationalCompetition(career,id)}</option>)}</select></label></div><div className="national-results">{(n?.history??[]).filter(h=>h.year===year&&(squad==='all'||h.squad===squad)&&(competition==='all'||h.competitionId===competition)).map(h=><span key={`${h.year}:${h.squad}:${h.competitionId}`}>{h.squad==='U20'?'U20':'A대표'} · {h.competitionName} · {h.result}</span>)}</div><PageMatches key={`${year}:${squad}:${competition}`} matches={filtered} onMatch={onMatch} label="국대 경기"/></div></Panel>;
}

function Awards({career}:{career:Career}) {
  const rankings=career.systems?.rankings??[],[mode,setMode]=useState<'honours'|'ballon'|'eleven'>('honours'),[selectedYear,setYear]=useState(rankings.at(-1)?.year??career.season.year);
  const ranking=rankings.find(r=>r.year===selectedYear)??rankings.at(-1);
  const selected=ranking?.world11.some(r=>r.playerId===career.player.id),own=ranking?.candidates.find(r=>r.playerId===career.player.id);
  return <Panel title="개인상과 팀의 우승" className="career-awards"><div className="panel-body"><div className="view-toolbar"><div className="segmented"><button className={mode==='honours'?'active':''} onClick={()=>setMode('honours')}>개인 · 팀 수상</button><button className={mode==='ballon'?'active':''} onClick={()=>setMode('ballon')}>발롱도르 순위</button><button className={mode==='eleven'?'active':''} onClick={()=>setMode('eleven')}>FIFPRO 월드 11</button></div>{mode!=='honours'&&rankings.length>0&&<select aria-label="세계 수상 시즌" value={ranking?.year} onChange={e=>setYear(Number(e.target.value))}>{rankings.map(r=><option key={r.year} value={r.year}>{calendarLabel(career,r.year)}</option>)}</select>}</div>
    {mode==='honours'?<SeasonHonours career={career} archive/>:ranking?<div data-testid="personal-world-award"><h3 className="minor-heading">{calendarLabel(career,ranking.year)} · {career.player.name}</h3><div className="metric-row">{mode==='ballon'?<><Metric label="발롱도르 최종 평가" value={ranking.playerRank?`${ranking.playerRank}위`:'순위권 밖 · 미선정'}/><Metric label="통산 수상" value={`${rankings.filter(r=>r.playerRank===1).length}회`}/><Metric label="최고 순위" value={rankings.some(r=>r.playerRank!==null)?`${Math.min(...rankings.filter(r=>r.playerRank!==null).map(r=>r.playerRank!))}위`:'미선정'}/></>:<><Metric label="FIFPRO 월드 11" value={selected?'선정':'미선정'}/><Metric label="선정 포지션" value={selected?career.player.position:'해당 없음'}/><Metric label="통산 선정" value={`${rankings.filter(r=>r.world11.some(p=>p.playerId===career.player.id)).length}회`}/></>}</div>{own&&<p className="muted">클럽 통합 {own.stats.apps}경기 · {own.stats.goals}골 · {own.stats.assists}도움 · 평점 {average(own.stats)}. 실제 경기 기록·출전량·포지션 기여·리그 수준·팀 성적을 함께 평가했습니다.</p>}<details className="award-diagnostics"><summary>수상 평가 근거</summary>{ranking.diagnostics?.map(d=><p key={d.name}><strong>{d.name} · {d.result}</strong><br/>{d.scope} · {d.eligible?'자격 충족':'자격 미충족'} · {d.detail}</p>)??<p>과거 평가의 상세 근거는 보존되지 않았습니다.</p>}</details><p className="fine-print">선수 본인의 평가만 표시합니다. 실제 시상식 결과가 아닌 게임 시즌 기록에 따른 평가입니다.</p></div>:<Empty title="시즌 종료 후 평가합니다"/>}
  </div></Panel>;
}
function CareerLedger({career}:{career:Career}) {
  const [kind,setKind]=useState<'transfers'|'captain'|'income'>('transfers'),[page,setPage]=useState(0),e=career.systems?.economics,terms=career.systems?.leadership.terms??[],transfers=[...career.transfers].reverse(),selected=kind==='transfers'?transfers:terms,current=Math.min(page,Math.max(0,Math.ceil(selected.length/PAGE_SIZE)-1));
  return <Panel title="이적 · 주장 · 수입 이력"><div className="panel-body"><div className="view-toolbar"><div className="segmented"><button className={kind==='transfers'?'active':''} onClick={()=>{setKind('transfers');setPage(0);}}>이적 이력</button><button className={kind==='captain'?'active':''} onClick={()=>{setKind('captain');setPage(0);}}>주장 이력</button><button className={kind==='income'?'active':''} onClick={()=>setKind('income')}>선수 수입</button></div></div>{kind==='income'?<><div className="metric-row"><Metric label="누적 급여" value={e?money(e.salaryIncome):'기록 없음'}/><Metric label="누적 보너스" value={e?money(e.bonusIncome):'기록 없음'}/><Metric label="구단 간 이적료" value={money(e?.totalTransferFees??career.transfers.reduce((s,t)=>s+t.fee,0))}/></div><p className="fine-print">이적료는 구단 간 거래이며 선수의 급여·보너스 수입에 포함되지 않습니다.</p></>:kind==='transfers'?<>{transfers.length?<div className="ledger-list">{transfers.slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE).map((t,i)=><div key={`${t.year}:${t.fromClubId}:${t.toClubId}:${i}`}><span>{calendarLabel(career,t.year)}</span><strong>{teamName(t.fromClubId)} → {teamName(t.toClubId)}</strong><span>이적료 <Money value={t.fee}/> · 주급 <Money value={t.wage}/></span></div>)}</div>:<Empty title="아직 실제 이적이 없습니다"/>}<Pager page={current} total={transfers.length} onChange={setPage} label="이적"/></>:<>{terms.length?<div className="captain-terms">{[...terms].reverse().slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE).map((t,i)=><details key={`${t.teamId}:${t.startYear}:${t.role}:${current*PAGE_SIZE+i}`}><summary><span className="armband">{t.role==='captain'?'C':t.role==='vice'?'VC':'C*'}</span><strong>{teamName(t.teamId)}</strong><span>{t.startYear}–{t.endYear??'현재'} · {t.apps}경기</span></summary><p>{t.role==='captain'?'정식 주장':t.role==='vice'?'부주장':'경기 임시 주장'} · {t.reason}</p></details>)}</div>:<Empty title="아직 주장단 경력이 없습니다">근속·리더십·경험·출전과 신뢰로 주장단을 선정합니다.</Empty>}<Pager page={current} total={terms.length} onChange={setPage} label="주장 경력"/></>}</div></Panel>;
}
function DeferredDetails({summary,children,className,testId}:{summary:ReactNode;children:()=>ReactNode;className?:string;testId?:string}){
  const [open,setOpen]=useState(false);
  return <details className={className} data-testid={testId} onToggle={e=>setOpen(e.currentTarget.open)}><summary>{summary}</summary>{open&&children()}</details>;
}
function Retirement({career}:{career:Career}) {
  const p=career.player,{totals,ledger,seasons}=useMemo(()=>({totals:careerRecordTotals(career),ledger:careerMatchLedger(career),seasons:careerSeasonRecords(career)}),[career]);
  const teamAwards=seasons.flatMap(s=>s.teamAwards.map(award=>`${s.year}년 · ${award}`));
  const shootout=(m:MatchRecord)=>{const kicks=m.shootout?.attempts.filter(a=>a.playerId===p.id)??[];return kicks.length?`${kicks.length}회 시도 · ${kicks.filter(a=>a.scored).length}회 성공`:'미참여';};
  const stats=(s:PlayerStats,matches:MatchRecord[])=><ul className="retirement-stats">{careerStatsLines(s,matches).map((line,i)=><li key={i}>{line}</li>)}</ul>;
  return <section className="retirement" data-testid="retirement-record">
    <span className="eyebrow">은퇴 · {career.retiredYear??career.season.year}시즌</span><h2>{p.name}의 은퇴 기록</h2>
    <div className="retirement-facts">
      <span>국적 <b>{p.nationality}</b></span><span>신체정보 <b>{p.height}cm / {p.weight}kg · {{right:'오른발',left:'왼발',both:'양발'}[p.foot]}</b></span>
      <span>팀 <b>{teamName(p.clubId)}</b></span><span>은퇴나이 <b>{p.age}세</b></span>
      <span>포지션 <b>{POSITION_LABELS[p.position]}</b></span><span>세부 역할 <b>{p.style}</b></span>
      <span>부 포지션 <b>{p.secondaryPositions.map(k=>POSITION_LABELS[k]).join(', ')||'없음'}</b></span>
    </div>
    <h3>통산 총합 스탯</h3><div className="metric-row">
      <Metric label="출전" value={totals.all.apps} note={`클럽 ${totals.club.apps} · 국대 ${totals.national.apps}`}/>
      <Metric label="득점" value={totals.all.goals}/><Metric label="도움" value={totals.all.assists}/><Metric label="평균 평점" value={average(totals.all)}/>
    </div><DeferredDetails summary="통산 세부 스탯 · 개수와 성공률" className="retirement-record-section">{()=>stats(totals.all,[...ledger.club,...ledger.national])}</DeferredDetails>
    <h3>팀 수상</h3>{teamAwards.length?<ul>{teamAwards.map((award,i)=><li key={i}>{award}</li>)}</ul>:<p>기록된 팀 수상 없음</p>}
    <h3>연도별 기록</h3>{[...seasons].reverse().map(h=><DeferredDetails className="retirement-record-section" key={h.year} testId={`retirement-season-${h.year}`} summary={`${h.year}시즌 · ${h.clubName} · ${h.status}`}>{()=> <>
      <div className="retirement-facts"><span>소속팀 <b>{h.clubName}</b></span><span>몸값 <b>{h.value}</b></span><span>주급 <b>{h.wage}</b></span>
        <span>능력점수 <b>{h.ovrStart} → {h.ovrEnd}</b></span><span>주장/부주장 <b>{h.leadership}</b></span><span>부상 유무 <b>{h.injury}</b></span></div>
      {!!h.employment.length&&<ul className="employment-periods">{h.employment.map((period,i)=><li key={i}>{period}</li>)}</ul>}
      {!!h.playSkills.length&&<p>플레이스타일: {h.playSkills.join(' / ')}</p>}
      <p>팀 수상: {h.teamAwards.join(' / ')||'없음'}</p>
      {!!h.awardResults.length&&<p>개인상 평가 결과: {h.awardResults.join(' / ')}</p>}
      <ul>{h.results.map((r,i)=><li key={i}>{r}</li>)}</ul><p>개인 수상: {h.personal.map(a=>a.name).join(' / ')||'없음'}</p>
      <DeferredDetails summary="시즌 통합 세부 스탯 · 개수와 성공률">{()=>stats(h.stats,h.matches)}</DeferredDetails>
      <h4>결승 기록</h4>{!h.finals.length&&<p>결승 진출 기록 없음</p>}{h.finals.map((f,i)=><div className="retirement-final" key={i}>
        <p><b>{f.competition} · {f.result}</b></p>{f.aggregate&&<p>{f.aggregate}</p>}
        {f.legs.map((leg,j)=><div key={j}><p>{leg.label}: {leg.home} {leg.homeGoals===undefined?'미진행':`${leg.homeGoals}:${leg.awayGoals}`} {leg.away} · {leg.result} · {leg.shootout}</p>
          {leg.homeGoals!==undefined&&(leg.match?<details><summary>내 결승 기록 · {leg.match.playerPlayed?leg.match.playerStarted?'선발 출전':'교체 출전':'미출전'}</summary>{leg.match.shootout&&<p>내 승부차기: {shootout(leg.match)}</p>}{stats(leg.match.playerStats,[leg.match])}</details>:<p>내 결승 기록: 과거 기록 미보존</p>)}
        </div>)}
      </div>)}
    </>}</DeferredDetails>)}
  </section>;
}

export default function CareerPanel({career,busy,command,onExport,onCopy,onMatch,requestedView}:{career:Career;busy:boolean;command:(c:GameCommand)=>void;onExport:()=>void;onCopy:()=>void;onMatch:(m:MatchRecord)=>void;requestedView?:CareerView}) {
  const [view,setView]=useState<CareerView>(requestedView??'records');
  useEffect(()=>{if(requestedView)setView(requestedView);},[requestedView]);
  const tabs:{id:CareerView;label:string}[]=[{id:'records',label:'기록'},{id:'seasons',label:'시즌 이력'},{id:'national',label:'국가대표'},{id:'awards',label:'수상 · 우승'},{id:'ledger',label:'이적 · 주장'},{id:'retirement',label:career.stage==='retired'?'은퇴 결산':'선수 생활 마무리'}];
  let content:ReactNode;
  if(view==='records')content=<RecordBook career={career} onMatch={onMatch}/>;
  else if(view==='seasons')content=<Seasons career={career} onMatch={onMatch}/>;
  else if(view==='national')content=<NationalPanel career={career} onMatch={onMatch}/>;
  else if(view==='awards')content=<Awards career={career}/>;
  else if(view==='ledger')content=<CareerLedger career={career}/>;
  else content=career.stage==='retired'?<Retirement career={career}/>:<Panel title="선수 생활의 마지막 장"><div className="panel-body"><p>은퇴 후에는 모든 기록을 보관하며, 이 커리어를 더 진행할 수 없습니다.</p><div className="metric-row"><Metric label="통산 경기" value={sumStats([clubTotal(career),nationalTotal(career)]).apps}/><Metric label="현재 나이" value={`${career.player.age}세`}/><Metric label="기록한 시즌" value={career.history.length}/></div><div className="retire-action"><p>현역 기록과 같은 원본을 은퇴 결산에 사용합니다.</p><button className="button danger" data-testid="retire-career" disabled={busy} onClick={()=>{if(window.confirm('선수 생활을 마무리할까요? 은퇴 후에는 이 커리어를 더 진행할 수 없습니다.'))command({type:'retire'});}}>선수 은퇴</button></div></div></Panel>;
  return <section className="career-workspace">{career.stage==='retired'&&view!=='retirement'&&<div className="career-overview"><h2>{career.player.name}의 축구 인생</h2><span>은퇴 · 모든 기록 보관</span></div>}<div className="career-view-bar"><div className="subview-tabs" role="group" aria-label="커리어 상세 화면">{tabs.map(t=><button key={t.id} data-testid={`career-view-${t.id}`} className={view===t.id?'active':''} aria-pressed={view===t.id} onClick={()=>setView(t.id)}>{t.label}</button>)}</div><div className="action-inline"><button className="text-button" aria-label="전체 기록 TXT 다운로드" data-testid="career-text-download" onClick={onCopy}><Download size={19}/>전체 기록 TXT</button><button className="icon-button" aria-label="JSON 내보내기" onClick={onExport}><Download size={19}/></button></div></div><div className="career-view-content" key={view}>{content}</div></section>;
}
