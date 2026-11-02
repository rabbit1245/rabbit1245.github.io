import type {Position} from './types';
/** Five is exactly neutral; ten reduces risk but never grants immunity. */
export function cardRiskMultiplier(value:number):number{
 const score=Math.max(0,Math.min(10,value));return score<=5?Math.exp((5-score)*.22):Math.exp(-(score-5)*.25);
}
export function expectedDefensiveActivity(position:Position,style:string):number{
 const base=position==='GK'?.55:/CB|LB|RB|LWB|RWB|CDM/.test(position)?1.35:/CM|CAM|LM|RM/.test(position)?1:.65;
 return base*(/프레싱|압박|볼 위닝|스토퍼/.test(style)?1.35:1);
}
