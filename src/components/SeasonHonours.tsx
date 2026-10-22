import {useState} from 'react';
import {ChevronRight} from 'lucide-react';
import type {Career} from '../game/types';
import {seasonHonours} from '../game/honours';
import {Panel} from './Shared';
export default function SeasonHonours({career,archive=false,compact=false}:{career:Career;archive?:boolean;compact?:boolean}){
 const [selected,setSelected]=useState(String(career.season.year)),year=archive?selected:String(career.season.year);
 const years=[...new Set([career.season.year,...career.history.map(h=>h.year),...career.awards.map(a=>a.year),...(career.systems?.national.history.map(h=>h.year)??[])])].sort((a,b)=>b-a);
 const rows=(year==='all'?years:[Number(year)]).map(y=>seasonHonours(career,y));
 const content=<div className="panel-body" data-testid="season-honours">{rows.map(row=><section key={row.year}><h3 className="minor-heading">{row.year}시즌{row.pending?' · 진행 중':' · 결산'}</h3><div className="season-honours-grid"><div><h4>우승한 대회</h4>{row.titles.length?<ul>{row.titles.map(t=><li key={t.id}><strong>{t.name} 우승</strong><p>{t.scope==='club'?'클럽':'국가대표'} · {t.team} · 내 출전 {t.apps===null?'기록 미보존':`${t.apps}경기`}</p><small>{t.medal?'개인 우승 메달 획득':'소속팀 우승 · 개인 메달은 수상 확정 기록 기준'}</small></li>)}</ul>:<p className="muted">{row.pending?'아직 확정된 우승이 없습니다.':'우승 기록이 없습니다.'}</p>}</div><div><h4>내 개인 수상</h4>{row.personal.length?<ul>{row.personal.map(a=><li key={a.id}><strong>{a.name}</strong><p>{a.description}</p></li>)}</ul>:<p className="muted">{row.pending?'개인상은 시즌·대회 종료 후 확정됩니다.':'획득한 개인상이 없습니다.'}</p>}</div></div></section>)}</div>;
 if(compact){
  const row=rows[0];
  return <details className="locker-detail season-honours" data-testid="honours-disclosure" key={`${career.id}:${career.season.year}`}><summary>
   <strong>이번 시즌 우승 · 개인 수상</strong><div className="honours-preview" data-testid="honours-preview">
    <span>우승한 대회 <b>{row.titles.length?row.titles.map(t=>t.name).join(' · '):row.pending?'확정 전':'없음'}</b></span>
    <span>내 개인 수상 <b>{row.personal.length?row.personal.map(a=>a.name).join(' · '):row.pending?'확정 전':'없음'}</b></span>
   </div><span className="disclosure-cue">상세 <ChevronRight size={17}/></span>
  </summary>{content}</details>;
 }
 return <Panel title={archive?'시즌별 우승과 내 개인 수상':'이번 시즌 우승 · 개인 수상'} className="season-honours" action={archive?<select aria-label="수상 이력 시즌" value={year} onChange={e=>setSelected(e.target.value)}><option value="all">모든 시즌</option>{years.map(y=><option key={y} value={y}>{y}시즌</option>)}</select>:undefined}>{content}</Panel>;
}
