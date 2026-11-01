import type {Career,GameCommand} from '../game/types';
import {nationalParticipation,nationalParticipationLines,nationalParticipationReason,nationalParticipationNotice} from '../game/national-participation';

export function NationalParticipationControls({career,busy,command}:{career:Career;busy:boolean;command:(c:GameCommand)=>void}){
 const state=nationalParticipation(career);
 return <div className="national-participation-controls" data-testid="national-participation-controls">
  <label><input type="checkbox" checked={state.declineCallups} disabled={busy} onChange={e=>command({type:'nationalParticipation',key:'declineCallups',checked:e.target.checked})}/>국대 소집 거절</label>
  <label><input type="checkbox" checked={state.retired} disabled={busy} onChange={e=>command({type:'nationalParticipation',key:'retired',checked:e.target.checked})}/>국대 은퇴</label>
 </div>;
}
export function NationalParticipationHistory({career,year}:{career:Career;year:number}){
 const lines=nationalParticipationLines(career,year);
 return lines.length?<div className="national-participation-history" data-testid="national-participation-history"><strong>국가대표 활동 설정</strong>{lines.map((line,i)=><p key={i}>{line}</p>)}</div>:null;
}
export {nationalParticipationReason,nationalParticipationNotice};
