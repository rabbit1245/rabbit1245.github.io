import type {Career} from './types';

export type NationalParticipationKey='declineCallups'|'retired';
export interface NationalParticipationChange {year:number;round:number;date:string;key:NationalParticipationKey;checked:boolean;}
export interface NationalParticipation {declineCallups:boolean;retired:boolean;history:NationalParticipationChange[];}
const initial={declineCallups:false,retired:false} as const;
const retirementReason='국가대표 은퇴를 선택했습니다. 체크를 해제하면 다음 소집부터 다시 평가합니다.';
const refusalReason='국가대표 소집을 거절하고 있습니다. 체크를 해제하면 다음 소집부터 다시 평가합니다.';
export function nationalParticipation(c:Career){return c.systems?.nationalParticipation??{...initial,history:[]};}
export function nationalParticipationReason(c:Career):string|undefined{
 const s=nationalParticipation(c);
 return s.retired?retirementReason:s.declineCallups?refusalReason:undefined;
}
export function nationalAvailable(c:Career):boolean{
 const s=c.systems?.nationalParticipation;return c.stage!=='retired'&&!s?.retired&&!s?.declineCallups;
}
/** Selection is a historical window result. An immediate checkbox edit stays
 * lightweight and presents a pending reassessment instead of rewriting it. */
export function nationalParticipationNotice(c:Career):string|undefined{
 const blocked=nationalParticipationReason(c);if(blocked)return blocked;
 const n=c.systems?.national;
 return c.stage!=='retired'&&(n?.status==='retired'||n?.reason===retirementReason||n?.reason===refusalReason)?'설정을 해제했습니다. 다음 대표팀 소집에서 현재 실력과 경기력으로 다시 평가합니다.':undefined;
}
export function nationalParticipationLines(c:Career,year:number):string[]{
 const history=nationalParticipation(c).history,state:{declineCallups:boolean;retired:boolean}={...initial},lines:string[]=[];
 for(const change of history){
  if(change.year<year)state[change.key]=change.checked;
 }
 if(state.retired)lines.push('국가대표 은퇴 상태 유지');
 if(state.declineCallups)lines.push('국가대표 소집 거절 유지');
 for(const change of history.filter(r=>r.year===year)){
  state[change.key]=change.checked;
  const title=change.key==='retired'?'국가대표 은퇴':'국가대표 소집 거절';
  lines.push(`${change.date.slice(0,10)} · ${title} ${change.checked?'설정':'해제'}${!state.retired&&!state.declineCallups?' · 이후 소집 재평가 가능':''}`);
 }
 return lines;
}
