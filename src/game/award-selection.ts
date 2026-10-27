import type { Position } from './types';

export function awardPositionGroup(position: Position): 'GK'|'DEF'|'MID'|'FWD' {
  if (position === 'GK') return 'GK';
  if (['CB','LB','RB','LWB','RWB'].includes(position)) return 'DEF';
  if (['CDM','CM','CAM','LM','RM'].includes(position)) return 'MID';
  return 'FWD';
}

/** The input is ranked by observed performance; no ability or reputation tie-break. */
export function selectEleven<T extends {playerId:string;position:Position}>(ranking:T[],defenders:number,midfielders:number,forwards:number,extra=false):T[] {
  const selected:T[]=[],used=new Set<string>();
  const family=(p:Position)=>['LB','LWB'].includes(p)?'LB':['RB','RWB'].includes(p)?'RB':['ST','CF','SS'].includes(p)?'ST':p;
  for(const [group,amount]of [['GK',1],['DEF',defenders],['MID',midfielders],['FWD',forwards]] as const){
    const pool=ranking.filter(r=>awardPositionGroup(r.position)===group);
    const slots:Position[]=group==='GK'?['GK']:group==='DEF'?(amount===4?['LB','CB','CB','RB']:['CB','CB']):group==='FWD'&&amount===3?['LW','ST','RW']:[];
    const take=(position?:Position)=>{const remaining=pool.filter(r=>!used.has(r.playerId));const same=position?remaining.filter(r=>family(r.position)===family(position)):remaining;const winner=(same.length?same:remaining)[0];if(winner){used.add(winner.playerId);selected.push(winner);}};
    for(const pos of slots.slice(0,amount))take(pos);
    while(selected.filter(r=>awardPositionGroup(r.position)===group).length<amount&&pool.some(r=>!used.has(r.playerId)))take();
  }
  if(extra){const other=ranking.find(r=>r.position!=='GK'&&!used.has(r.playerId));if(other)selected.push(other);}
  return selected;
}
