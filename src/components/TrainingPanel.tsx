import ManualAging from './ManualAging';
import { useEffect, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, LockKeyhole } from 'lucide-react';
import type { AttributeKey, Attributes, Career, GameCommand, Intensity } from '../game/types';
import { ATTRIBUTE_LABELS, FIELD_ATTRIBUTES, GK_ATTRIBUTES } from '../game/attributes';
import { Delta, Panel } from './Shared';

export function TrainingList({attributes,start,keys,allowed,onToggle,disabled=false}:{attributes:Attributes;start:Attributes;keys:AttributeKey[];allowed:AttributeKey[];onToggle:(key:AttributeKey)=>void;disabled?:boolean}) {
  return <div className="training-table" data-testid="training-values"><div className="training-table-legend"><span>선택 · 능력치</span><span>현재</span><span>시즌 변화</span></div><div className="training-rows">{allowed.map(key=>{
    const value=attributes[key],change=value===undefined||start[key]===undefined?undefined:value-start[key]!,selected=keys.includes(key);
    return <button type="button" key={key} data-testid={`training-${key}`} aria-pressed={selected} aria-label={`${ATTRIBUTE_LABELS[key]} 현재 ${value===undefined?'미집계':Math.round(value)} 훈련 선택`} className={`training-row ${selected?'selected':''}`} disabled={disabled||!selected&&keys.length>=3} onClick={()=>onToggle(key)}><span className="selection-box" aria-hidden="true">{selected&&<Check size={16}/>}</span><span className="training-name">{ATTRIBUTE_LABELS[key]}</span><strong>{value===undefined?'—':Math.round(value)}</strong>{change===undefined?<span>—</span>:<Delta value={change}/>}</button>;
  })}</div></div>;
}
export default function TrainingPanel({career,busy,command,onClose}:{career:Career;busy:boolean;command:(c:GameCommand)=>void;onClose?:()=>void}) {
  const [keys,setKeys]=useState(career.training),[intensity,setIntensity]=useState<Intensity>(career.intensity);
  const year=career.stage==='offseason'?career.season.year+1:career.season.year;
  const plan=career.systems?.trainingPlan;
  const confirmed=plan?.forYear===year?plan.confirmed:career.stage!=='offseason';
  const editable=career.stage!=='retired'&&!confirmed&&(career.stage==='offseason'||career.season.week===0);
  useEffect(()=>{setKeys(career.training);setIntensity(career.intensity);},[career.id,year]);
  const toggle=(key:AttributeKey)=>setKeys(rows=>rows.includes(key)?rows.filter(k=>k!==key):rows.length<3?[...rows,key]:rows);
  return <Panel title={editable?'다음 시즌 훈련 선택':'이번 시즌 훈련 계획'} action={<div className="training-header-actions"><ManualAging career={career} busy={busy} command={command}/><span className="pill">{confirmed?<LockKeyhole size={16}/>:<Check size={16}/>} {confirmed?'확정됨':`${keys.length}/3 선택`}</span></div>} className="training-panel">
    <div className="panel-body" data-testid="training-panel"><p className="training-instruction">{editable?'현재 수치와 시즌 변화를 비교해 최대 3개를 선택하세요. 확정 전에는 자유롭게 바꿀 수 있습니다.':'확정한 방향에 집중하고 있습니다. 시즌을 마친 뒤 다음 계획을 선택합니다.'}</p>
      <TrainingList attributes={career.player.attributes} start={career.season.attributeStart} keys={keys} allowed={career.player.position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES} disabled={!editable||busy} onToggle={toggle}/>
      <div className="training-summary"><span>선택한 훈련</span><strong>{keys.length?keys.map(k=>`${ATTRIBUTE_LABELS[k]} ${Math.round(career.player.attributes[k]??0)}`).join(' · '):'아직 선택하지 않았습니다'}</strong></div>
      <div className="training-bottom"><label className="field"><span>훈련 강도</span><select aria-label="강도" disabled={!editable||busy} value={intensity} onChange={e=>setIntensity(e.target.value as Intensity)}><option value="balanced">균형</option><option value="intense">집중 · 부상 위험 증가</option><option value="rest">회복 우선</option></select></label><p className="muted">집중훈련은 선택한 능력치에 적용됩니다. 출전·환경·부상·나이에 따라 성장 폭이 달라집니다.</p><div className="action-inline">{onClose&&<button className="button secondary" onClick={onClose}><ArrowLeft size={17}/>돌아가기</button>}{editable&&<button className="button primary" data-testid="confirm-training" disabled={busy||keys.length===0} onClick={()=>command({type:'training',keys,intensity})}><CheckCircle2 size={18}/>다음 시즌 계획 확정</button>}</div></div>
    </div>
  </Panel>;
}
