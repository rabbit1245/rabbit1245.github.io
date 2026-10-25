import type { PlayerStats } from './types';
export const clamp = (v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
export const round = (v:number,digits=2)=>Number(v.toFixed(digits));
export function hashSeed(text:string) { let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0; }
export function seededRandom(seed:string) { let value=hashSeed(seed);return()=>{value+=0x6D2B79F5;let x=value;x=Math.imul(x^x>>>15,x|1);x^=x+Math.imul(x^x>>>7,x|61);return((x^x>>>14)>>>0)/4294967296}; }
export const integer=(r:()=>number,min:number,max:number)=>min+Math.floor(r()*(max-min+1));
export const CORE_STATS=['apps','starts','minutes','goals','assists','shots','shotsOnTarget','passes','passesCompleted','tackles','interceptions','saves','goalsConceded','cleanSheets','ratingSum','ratingCount','yellowCards','redCards'] as const;
export const DETAIL_STATS=['mom','keyPasses','dribbleAttempts','dribblesCompleted','tackleAttempts','aerialAttempts','aerialWon','shotsFaced','oneOnOneAttempts','oneOnOneSaves','penaltiesFaced','penaltiesSaved','crossesFaced','crossesCaught','sweepingAttempts','sweepingSuccesses','buildUpPasses','buildUpCompleted','longKicks','longKicksCompleted','handlingAttempts','handlingSuccesses','lateActions','lateSuccesses','detailedApps'] as const;
export const ALL_STATS=[...CORE_STATS,...DETAIL_STATS] as const;
const ZERO_STATS=Object.freeze(Object.fromEntries(ALL_STATS.map(k=>[k,0]))) as Readonly<PlayerStats>;
export function emptyStats():PlayerStats { return {...ZERO_STATS}; }
export function sumStats(records:PlayerStats[]):PlayerStats { const s=emptyStats();for(const row of records)for(const k of ALL_STATS)s[k]=round((s[k]??0)+(row[k]??0));return s; }
export function addStats(target:PlayerStats,row:PlayerStats):PlayerStats {for(const k of ALL_STATS)target[k]=round((target[k]??0)+(row[k]??0));return target;}
