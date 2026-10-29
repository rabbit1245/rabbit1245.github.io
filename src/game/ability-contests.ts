/** Smooth skill contests preserve an advantage above 90/100 without guaranteeing success. */
export function skillSuccess(base:number,quality:number,opposition:number,sensitivity=.03,resistance=.022):number{
  return 1/(1+Math.exp(-(Math.log(base/(1-base))+(quality-65)*sensitivity-(opposition-65)*resistance)));
}
/** Basic shot stopping remains competent in lower divisions too. Absolute skill still
 * changes accuracy upstream; this contest compares the actual finisher and keeper.
 * A weak keeper used to lower the neutral save rate AND lose the skill contest,
 * making even ordinary 65–70 strikers prolific against equally ordinary opponents. */
export function openPlaySaveChance(keeping:number,finishing:number):number{
  const basic=Math.max(0,Math.min(1,keeping/80));
  const neutral=keeping<80?.6+.268*(2*basic-basic*basic):Math.min(.94,.5+.0046*keeping);
  // A single bounded difference avoids multiplying the gap by keeper level as well.
  // Both players retain strictly monotonic effects, including abilities above 100.
  const edge=Math.tanh((keeping-finishing)/12)*.65;
  return 1/(1+Math.exp(-(Math.log(neutral/(1-neutral))+edge)));
}
/** Strong sides have a finite supply of chances: finishing roles compete for it.
 * Preserve the original team opportunity budget; no goal or result is rewritten.
 * The rule is identical for the protagonist and NPCs, using real attributes. */
export function shareShotSupply(rows:{opportunities:number;quality:number;contest?:boolean}[],teamPower:number):number[]{
 const competition=Math.max(0,Math.min(1,(teamPower-75)/20));
 if(competition===0)return rows.map(r=>r.opportunities);
 const eligible=rows.map((r,i)=>r.contest!==false&&r.opportunities>0?i:-1).filter(i=>i>=0);
 if(eligible.length<2||eligible.every(i=>rows[i].quality===rows[eligible[0]].quality))return rows.map(r=>r.opportunities);
 const original=eligible.reduce((n,i)=>n+rows[i].opportunities,0);
 const weights=rows.map(r=>r.opportunities*Math.pow(Math.max(.55,Math.min(1.3,.75+(r.quality-80)*.018)),competition));
 // A better finisher can absorb available supply, without creating another
 // large scoring boost on top of the existing elite skill advantages.
 const result=rows.map(r=>r.contest===false?r.opportunities:0),active=new Set(eligible);let remaining=original;
 while(active.size){
  const total=[...active].reduce((n,i)=>n+weights[i],0);if(!total)break;
  const capped=[...active].filter(i=>remaining*weights[i]/total>rows[i].opportunities*1.05);
  if(!capped.length){for(const i of active)result[i]=remaining*weights[i]/total;return result;}
  for(const i of capped){result[i]=rows[i].opportunities*1.05;remaining-=result[i];active.delete(i);}
 }
 return original===0?result:rows.map(r=>r.opportunities);
}
