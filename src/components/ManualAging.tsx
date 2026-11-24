import type {Career,GameCommand} from '../game/types';
import {ATTRIBUTE_ADJUSTMENT_AMOUNTS,type AttributeAdjustmentAmount} from '../game/attributes';

export function AttributeStepControls({aging=false,disabled,amount,onChange,onApplyAll,allDisabled=false}:{
  aging?:boolean;disabled:boolean;amount:AttributeAdjustmentAmount|null|undefined;
  onChange:(amount:AttributeAdjustmentAmount|null|undefined)=>void;
  onApplyAll:(amount:AttributeAdjustmentAmount)=>void;allDisabled?:boolean;
}){
  const sign=aging?'−':'+';
  return <div className="manual-aging" data-testid={aging?'manual-aging':'training-cheat'}>
    <button type="button" className="button secondary" aria-expanded={amount!==undefined} disabled={disabled} onClick={()=>onChange(amount===undefined?null:undefined)}>{aging?'노화':'치트'}</button>
    {amount!==undefined&&<div className="attribute-step-options">
      {amount!==null&&<button type="button" className="button secondary" disabled={disabled||allDisabled} onClick={()=>onApplyAll(amount)}>{aging?'전체 노화':'전체 적용'} {sign}{amount}</button>}
      <div className="action-inline">{ATTRIBUTE_ADJUSTMENT_AMOUNTS.map(step=>(
        <button type="button" className={`button ${amount===step?'primary':'secondary'}`} aria-pressed={amount===step} key={step} disabled={disabled} onClick={()=>onChange(step)}>{sign}{step}</button>
      ))}</div>
    </div>}
  </div>;
}
export function InjuryControl({career,busy,open,onToggle,command}:{career:Career;busy:boolean;open:boolean;onToggle:()=>void;command:(c:GameCommand)=>void}){
 const active=career.systems?.manualInjuries?.find(r=>!r.returned),available=career.stage==='offseason'||career.season.week===0||career.season.week===career.systems?.halfRound;
 return <div className="locker-injury" data-testid="locker-injury"><button className="button secondary" disabled={busy||career.stage==='retired'||!!active||!available} aria-expanded={open} onClick={onToggle}>부상</button>{open&&!active&&<div className="injury-options"><p className="fine-print">{career.stage==='offseason'?'다음 시즌 예약 · ':''}클럽 경기 수 기준 · 국대도 출전 제외 · 시즌 종료 시 복귀 · 능력치 유지</p><div className="action-inline">{([5,10,20,'season'] as const).map(d=><button key={d} className="button secondary" data-testid={`injury-${d}`} disabled={busy} onClick={()=>{onToggle();command({type:'manualInjury',duration:d});}}>{d==='season'?'한 시즌':`${d}경기`}</button>)}</div></div>}{active&&<span className="fine-print">{active.pendingNextSeason?'다음 시즌 부상 예약':active.remainingMatches!==undefined?`부상 · 클럽 ${active.remainingMatches}경기 남음`:active.selectionVersion===2?'시즌 종료까지 부상':`${active.end.slice(0,10)} 복귀`}</span>}{!available&&!active&&<span className="fine-print">전·후반기 시작 전 선택</span>}</div>;
}
