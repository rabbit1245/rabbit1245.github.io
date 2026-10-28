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
