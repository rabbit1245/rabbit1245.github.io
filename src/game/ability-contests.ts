/** Smooth skill contests preserve an advantage above 90/100 without guaranteeing success. */
export function skillSuccess(base:number,quality:number,opposition:number,sensitivity=.03,resistance=.022):number{
  return 1/(1+Math.exp(-(Math.log(base/(1-base))+(quality-65)*sensitivity-(opposition-65)*resistance)));
}
/** Keep the established equal-skill scoring environment; improve the actual finisher/keeper contest. */
export function openPlaySaveChance(keeping:number,finishing:number):number{
  const neutral=Math.max(.6,Math.min(.94,.5+.0046*keeping));
  const contest=.4+Math.max(0,keeping-65)*.025;
  // A very large gap must not turn every shot past a lower-division keeper into a goal.
  const edge=Math.tanh((keeping-finishing)/12)*contest;
  return 1/(1+Math.exp(-(Math.log(neutral/(1-neutral))+edge)));
}
