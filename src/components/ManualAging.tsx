import {useEffect,useRef,useState} from 'react';
import type {AttributeKey,Career,GameCommand} from '../game/types';
import {ATTRIBUTE_LABELS,overall} from '../game/attributes';
import {Modal} from './Shared';
export default function ManualAging({career,busy,command}:{career:Career;busy:boolean;command:(c:GameCommand)=>void}){
 const [open,setOpen]=useState(false),[amount,setAmount]=useState<1|5|10|null>(null),pending=useRef<string|undefined>();
 const last=career.systems?.manualAging?.at(-1)?.id;
 useEffect(()=>{if(pending.current!==undefined&&last!==pending.current){pending.current=undefined;setAmount(null);setOpen(false);}},[last]);
 const after=Object.fromEntries(Object.entries(career.player.attributes).map(([k,v])=>[k,Math.max(0,(v??0)-(amount??0))]));
 const value=(n:number)=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(n);
 return <div className="manual-aging" data-testid="manual-aging"><button className="button secondary" aria-expanded={open} disabled={busy||career.stage==='retired'} onClick={()=>setOpen(true)}>노화</button>
  {open&&<Modal title={amount===null?'수동 노화':'수동 노화 적용 확인'} onClose={()=>{if(!busy){setOpen(false);setAmount(null);}}} wide>
   <p>나이에 따른 자동 능력치 감소는 없습니다. 직접 적용할 때만 모든 능력치가 감소합니다. 나이는 바뀌지 않습니다.</p>
   {amount===null?<><div className="action-inline manual-aging-options">{([1,5,10] as const).map(n=><button className="button secondary" key={n} disabled={busy} onClick={()=>setAmount(n)}>−{n}</button>)}</div><p className="fine-print">강도를 선택하면 모든 능력치와 종합 능력의 적용 전후 수치를 확인합니다.</p>{(career.systems?.manualAging?.length??0)>0&&<details><summary>수동 노화 적용 이력 {career.systems!.manualAging!.length}회</summary>{[...career.systems!.manualAging!].reverse().slice(0,10).map(a=><p key={a.id}>{a.date.slice(0,10)} · −{a.amount} · 종합 능력 {a.ovrBefore} → {a.ovrAfter}</p>)}</details>}</>:<>
    <p>이번 한 번만 {amount}씩 낮춥니다. 최솟값은 0입니다.</p><p className="manual-aging-overall">종합 능력 {career.player.ovr} → <strong>{overall({...career.player,attributes:after})}</strong></p>
    <div className="full-standings-scroll"><table className="league-table"><thead><tr><th>능력치</th><th>현재</th><th>적용 후</th></tr></thead><tbody>{Object.entries(career.player.attributes).map(([k,v])=><tr key={k}><td>{ATTRIBUTE_LABELS[k as AttributeKey]}</td><td>{value(v??0)}</td><td>{value(after[k])}</td></tr>)}</tbody></table></div>
    <div className="modal-actions"><button className="button secondary" disabled={busy} onClick={()=>setAmount(null)}>취소</button><button className="button primary" data-testid="confirm-manual-aging" disabled={busy} onClick={()=>{pending.current=last??'';command({type:'manualAging',amount});}}>−{amount} 한 번 적용</button></div>
   </>}
  </Modal>}
 </div>;
}
