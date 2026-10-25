import ManualAging,{InjuryControl} from './ManualAging';
import { useEffect, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, LockKeyhole, LockKeyholeOpen } from 'lucide-react';
import type { AttributeKey, Attributes, Career, GameCommand, Intensity } from '../game/types';
import { ATTRIBUTE_LABELS, FIELD_ATTRIBUTES, GK_ATTRIBUTES } from '../game/attributes';
import { Delta, Panel } from './Shared';

export function TrainingList({attributes,start,keys,allowed,onToggle,disabled=false,locks=[],onLock,aging,onAge,busy=false}:{attributes:Attributes;start:Attributes;keys:AttributeKey[];allowed:AttributeKey[];onToggle:(key:AttributeKey)=>void;disabled?:boolean;locks?:AttributeKey[];onLock?:(key:AttributeKey,locked:boolean)=>void;aging?:1|5|10|null;onAge?:(key:AttributeKey)=>void;busy?:boolean}) {
  return <div className="training-table" data-testid="training-values"><div className="training-table-legend"><span>{aging!==undefined?'감소할 능력치 선택':'선택 · 능력치'}</span><span>현재</span><span>시즌 변화</span></div><div className="training-rows">{allowed.map(key=>{
    const value=attributes[key],change=value===undefined||start[key]===undefined?undefined:value-start[key]!,selected=keys.includes(key),locked=locks.includes(key);
    return <div className={`training-cell ${locked?'locked':''}`} key={key}><button type="button" data-testid={`training-${key}`} aria-pressed={selected} aria-label={`${ATTRIBUTE_LABELS[key]} 현재 ${value===undefined?'미집계':Math.round(value)} ${aging!==undefined?'수동 노화':'훈련 선택'}`} className={`training-row ${selected?'selected':''} ${locked?'locked':''}`} disabled={aging!==undefined?busy||!aging:disabled||!selected&&keys.length>=3} onClick={()=>aging?onAge?.(key):onToggle(key)}><span className="selection-box" aria-hidden="true">{aging?`−${aging}`:selected&&<Check size={16}/>}</span><span className="training-name">{ATTRIBUTE_LABELS[key]}</span><strong>{value===undefined?'—':Math.round(value)}</strong>{change===undefined?<span>—</span>:<Delta value={change}/>}</button>{onLock&&<button className={`attribute-lock ${locked?'locked':''}`} data-testid={`lock-${key}`} aria-label={`${ATTRIBUTE_LABELS[key]} 고정`} aria-pressed={locked} disabled={busy} onClick={()=>onLock(key,!locked)}>{locked?<LockKeyhole size={15}/>:<LockKeyholeOpen size={15}/>}</button>}</div>;
  })}</div></div>;
}
export default function TrainingPanel({career,busy,command,onClose}:{career:Career;busy:boolean;command:(c:GameCommand)=>void;onClose?:()=>void}) {
  const [aging,setAging]=useState<1|5|10|null|undefined>(),[injuryOpen,setInjuryOpen]=useState(false);
  const [keys,setKeys]=useState<AttributeKey[]>(career.stage==='offseason'&&!career.systems?.trainingPlan?.confirmed?[]:career.training),[intensity,setIntensity]=useState<Intensity>(career.intensity);
  const year=career.stage==='offseason'?career.season.year+1:career.season.year;
  const plan=career.systems?.trainingPlan;
  const confirmed=plan?.forYear===year?plan.confirmed:career.stage!=='offseason';
  const editable=career.stage!=='retired'&&!confirmed&&(career.stage==='offseason'||career.season.week===0);
  useEffect(()=>{setKeys(career.stage==='offseason'&&!plan?.confirmed?[]:career.training);setIntensity(career.intensity);},[career.id,year]);
  const allowed=career.player.position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES;
  const allLocked=allowed.every(key=>career.systems?.attributeLocks?.includes(key));
  const toggle=(key:AttributeKey)=>setKeys(rows=>rows.includes(key)?rows.filter(k=>k!==key):rows.length<3?[...rows,key]:rows);
  return <Panel title={editable?'다음 시즌 훈련 선택':'이번 시즌 훈련 계획'} action={<div className="training-header-actions">{career.stage!=='retired'&&<button type="button" className="attribute-lock-all" data-testid="lock-all-attributes" aria-pressed={allLocked} disabled={busy} onClick={()=>command({type:'attributeLockAll',locked:!allLocked})}>{allLocked?<LockKeyhole size={16}/>:<LockKeyholeOpen size={16}/>} {allLocked?'전체 잠금 해제':'전체 잠금'}</button>}<ManualAging career={career} busy={busy} amount={aging} onChange={setAging}/><InjuryControl career={career} busy={busy} open={injuryOpen} onToggle={()=>setInjuryOpen(v=>!v)} command={command}/><span className="pill">{confirmed?<LockKeyhole size={16}/>:<Check size={16}/>} {confirmed?'확정됨':`${keys.length}/3 선택`}</span></div>} className="training-panel">
    <div className="panel-body" data-testid="training-panel"><p className="training-instruction">{editable?'체크한 최대 3개 능력치만 성장합니다. 선택 없이 계획을 확정하거나 다음 시즌을 시작할 수 있습니다.':'체크한 능력치만 훈련·경기 경험으로 성장합니다. 체크하지 않은 능력치는 자연 성장하지 않습니다.'}</p>
      {aging!==undefined&&<p className="inline-tool-note" role="status">{aging?`−${aging} 선택됨 · 감소할 능력치를 클릭하세요. 해당 항목만 즉시 감소합니다.`:'감소량을 선택한 뒤 원하는 능력치를 클릭하세요.'} 잠근 항목도 직접 누른 수동 노화는 적용되며 잠금은 유지됩니다.</p>}
      <TrainingList locks={career.systems?.attributeLocks} onLock={career.stage!=='retired'?(key,locked)=>command({type:'attributeLock',key,locked}):undefined} busy={busy} aging={aging} onAge={key=>{if(aging)command({type:'manualAging',key,amount:aging});}} attributes={career.player.attributes} start={career.season.attributeStart} keys={keys} allowed={allowed} disabled={!editable||busy} onToggle={toggle}/>
      <p className="fine-print">초록색 잠금은 자동 성장·부상 저하·치트 조정을 막습니다. 수동 노화·부상 처리는 잠금 중에도 가능합니다. 나이만으로 능력치가 감소하지 않습니다.</p>
      <div className="training-summary"><span>선택한 훈련</span><strong>{keys.length?keys.map(k=>`${ATTRIBUTE_LABELS[k]} ${Math.round(career.player.attributes[k]??0)}`).join(' · '):'선택 없음 · 자동 성장 없음'}</strong></div>
      <div className="training-bottom"><label className="field"><span>훈련 강도</span><select aria-label="강도" disabled={!editable||busy} value={intensity} onChange={e=>setIntensity(e.target.value as Intensity)}><option value="balanced">균형</option><option value="intense">집중 · 부상 위험 증가</option><option value="rest">회복 우선</option></select></label><p className="muted">집중훈련은 선택한 능력치에 적용됩니다. 출전·환경·부상·나이에 따라 성장 폭이 달라집니다.</p><div className="action-inline">{onClose&&<button className="button secondary" onClick={onClose}><ArrowLeft size={17}/>돌아가기</button>}{editable&&<button className="button primary" data-testid="confirm-training" disabled={busy} onClick={()=>command({type:'training',keys,intensity})}><CheckCircle2 size={18}/>다음 시즌 계획 확정</button>}</div></div>
      {!!career.systems?.manualInjuries?.length&&<details className="injury-history"><summary>수동 부상 이력 {career.systems.manualInjuries.length}회</summary>{[...career.systems.manualInjuries].reverse().slice(0,12).map(r=><p key={r.id}>{r.year}년 · {r.duration==='half'?'반 시즌':'한 시즌'} · {r.pendingNextSeason?'다음 시즌 시작일부터':`${r.start.slice(0,10)} ~ ${r.end.slice(0,10)}`} · {r.pendingNextSeason?'예약됨':r.returned?'복귀 완료':'회복 중'} · 클럽 {r.missed.filter(m=>m.scope==='club').length} / 국대 {r.missed.filter(m=>m.scope==='national').length}경기 결장 · 이번 시즌 실제 리그 출전 {career.season.playerStats.apps}경기</p>)}</details>}
    </div>
  </Panel>;
}
