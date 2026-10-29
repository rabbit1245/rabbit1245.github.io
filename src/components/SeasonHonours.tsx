import AwardDisclosure from './AwardDisclosure';
import ShirtSales from './ShirtSales';
import {useMemo,useState} from 'react';
import {ChevronRight} from 'lucide-react';
import type {Award,Career} from '../game/types';
import {seasonHonours} from '../game/honours';
import {Panel,teamName} from './Shared';
const scope=(a:Award)=>a.category?.startsWith('commercial')?'commercial':a.category?.startsWith('club')?'club':a.category?.startsWith('league')?'league':a.category?.startsWith('national')?'national':'world';
const labels={all:'전체',club:'구단',league:'리그',world:'월드·대회',national:'국가대표',commercial:'인기·상업 기록'};
export default function SeasonHonours({career,archive=false,compact=false}:{career:Career;archive?:boolean;compact?:boolean}){
 const [selected,setSelected]=useState(String(career.season.year)),[filter,setFilter]=useState<keyof typeof labels>('all'),[page,setPage]=useState(0),year=archive?selected:String(career.season.year);
 const years=useMemo(()=>[...new Set([career.season.year,...career.history.map(h=>h.year),...career.awards.map(a=>a.year),...(career.systems?.national.history.map(h=>h.year)??[])])].sort((a,b)=>b-a),[career]);
 const pages=Math.max(1,Math.ceil(years.length/4)),current=Math.min(page,pages-1);
 const rows=useMemo(()=>(year==='all'?years.slice(current*4,current*4+4):[Number(year)]).map(y=>seasonHonours(career,y)),[career,year,current]);
 const content=<div className="panel-body" data-testid="season-honours">
  {archive&&<div className="view-toolbar"><label>수상 범위<select aria-label="수상 범위" value={filter} onChange={e=>setFilter(e.target.value as keyof typeof labels)}>{Object.entries(labels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>{year==='all'&&<div className="pagination"><button aria-label="최근 수상 시즌" disabled={current===0} onClick={()=>setPage(p=>p-1)}>←</button><span>{current+1} / {pages}</span><button aria-label="이전 수상 시즌" disabled={current+1>=pages} onClick={()=>setPage(p=>p+1)}>→</button></div>}</div>}
  {rows.map(row=>{const personal=row.personal.filter(a=>a.category!=='commercial'&&(filter==='all'||scope(a)===filter)),commercial=row.commercial.filter(()=>filter==='all'||filter==='commercial');
   return <section key={row.year}><h3 className="minor-heading">{row.year}시즌{row.pending?' · 진행 중':' · 결산'}</h3>{!compact&&<ShirtSales career={career} year={row.year}/>}<div className="season-honours-grid"><div><h4>우승한 대회</h4>{row.titles.length?<ul>{row.titles.map(t=><li key={t.id}><strong>{t.name} 우승</strong><p>{t.scope==='club'?'클럽':'국가대표'} · {t.team} · 내 출전 {t.apps===null?'기록 미보존':`${t.apps}경기`}</p><small>{t.medal?'개인 우승 메달 획득':'소속팀 우승 · 개인 메달은 수상 확정 기록 기준'}</small></li>)}</ul>:<p className="muted">{row.pending?'아직 확정된 우승이 없습니다.':'우승 기록이 없습니다.'}</p>}</div><div><h4>내 개인 수상</h4>{personal.length?<ul>{personal.map(a=><li key={a.id}><AwardDisclosure award={a}/></li>)}</ul>:<p className="muted">{row.pending?'개인상은 시즌·대회 종료 후 확정됩니다.':'선택한 범위에 획득한 개인상이 없습니다.'}</p>}</div></div>{commercial.length>0&&<div className="commercial-honours"><h4>과거 인기·상업 추정 기록</h4>{commercial.map(a=><AwardDisclosure key={a.id} award={a}/>)}</div>}</section>;
  })}
 </div>;
 if(compact){const row=rows[0],personal=row.personal.filter(a=>a.category!=='commercial'),preview=(names:string[])=>names.length?`${names.slice(0,3).join(' · ')}${names.length>3?` 외 ${names.length-3}개`:''}`:row.pending?'확정 전':'없음';
  return <details className="locker-detail season-honours" data-testid="honours-disclosure" key={`${career.id}:${career.season.year}`}><summary><strong>이번 시즌 우승 · 개인 수상</strong><div className="honours-preview" data-testid="honours-preview"><span>우승한 대회 <b>{preview(row.titles.map(t=>t.name))}</b></span><span>내 개인 수상 <b>{preview(personal.map(a=>a.name))}</b></span></div><span className="disclosure-cue">상세 <ChevronRight size={17}/></span></summary>{content}</details>;
 }
 return <Panel title={archive?'시즌별 우승과 내 개인 수상':'이번 시즌 우승 · 개인 수상'} className="season-honours" action={archive?<select aria-label="수상 이력 시즌" value={year} onChange={e=>{setSelected(e.target.value);setPage(0);}}><option value="all">모든 시즌</option>{years.map(y=><option key={y} value={y}>{y}시즌</option>)}</select>:undefined}>{content}</Panel>;
}
