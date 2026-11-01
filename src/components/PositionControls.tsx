import {useState} from 'react';
import type {Career,GameCommand,Position} from '../game/types';
import {PLAY_STYLES,POSITION_LABELS,attributeImportance,attributeWeights} from '../game/attributes';
import {canChangePosition,positionChangeLines,positionPreview} from '../game/position-changes';
import type {AttributeKey} from '../game/types';
import {Modal} from './Shared';

export function OvrImportance({position,style,attribute}:{position:Position;style:string;attribute:AttributeKey}){
 const level=attributeImportance(position,style)[attribute]??0,weight=attributeWeights(position,style)[attribute]??0;
 return level?<span className="ovr-importance" data-testid={`importance-${attribute}`} data-level={level} title={`현재 포지션·유형의 OVR 가중치 ${(weight*100).toFixed(1)}%`} aria-label={`OVR 기여도 ${level}단계`}>{'↑'.repeat(level)}</span>:null;
}
export default function PositionControls({career,busy,command}:{career:Career;busy:boolean;command:(c:GameCommand)=>void}){
 const [open,setOpen]=useState(false),[position,setPosition]=useState(career.player.position),[style,setStyle]=useState(career.player.style),p=career.player;
 return <><button className="button secondary position-change-button" data-testid="change-position" disabled={busy||career.stage==='retired'} onClick={()=>{setPosition(p.position);setStyle(p.style);setOpen(true);}}>포지션 변경 · {p.position}</button>{open&&<Modal title="포지션 변경" onClose={()=>setOpen(false)}>
  <div className="position-change-fields"><label className="field">새 포지션<select aria-label="변경할 포지션" value={position} onChange={e=>{const next=e.target.value as Position;setPosition(next);setStyle(PLAY_STYLES[next].includes(style)?style:PLAY_STYLES[next][0]);}}>{Object.entries(POSITION_LABELS).map(([id,name])=><option key={id} value={id} disabled={!canChangePosition(career,id as Position)}>{id} · {name}{!canChangePosition(career,id as Position)?' · 전용 능력치 없음':''}</option>)}</select></label>
  <label className="field">선수 유형<select aria-label="변경할 선수 유형" value={style} onChange={e=>setStyle(e.target.value)}>{PLAY_STYLES[position].map(s=><option key={s}>{s}</option>)}</select></label>
  <p data-testid="position-ovr-preview"><strong>{p.position} → {position} · OVR {p.ovr} → {positionPreview(career,position,style)}</strong></p>
  <p>현재 능력치를 새 포지션과 유형의 가중치로 평가합니다. 변경 이력은 커리어와 해당 연도 기록에 남습니다. 다음 경기부터 새 포지션으로 출전 경쟁에 참여합니다.</p>
  <div className="modal-actions"><button className="button secondary" onClick={()=>setOpen(false)}>취소</button><button className="button primary" data-testid="confirm-position" disabled={busy||position===p.position&&style===p.style} onClick={()=>{command({type:'changePosition',position,style});setOpen(false);}}>변경 적용</button></div></div>
 </Modal>}</>;
}
export function PositionHistory({career,year}:{career:Career;year?:number}){
 const rows=positionChangeLines(career,year);
 return rows.length?<details className="position-history" data-testid="position-history"><summary>포지션 변경 이력 · {rows.length}회</summary>{rows.map((s,i)=><p key={i}>{s}</p>)}</details>:null;
}
