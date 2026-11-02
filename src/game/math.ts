import type { PlayerStats } from './types';
export const clamp = (v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
export const round = (v:number,digits=2)=>Number(v.toFixed(digits));
export function hashSeed(text:string) { let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0; }
export function seededRandom(seed:string) { let value=hashSeed(seed);return()=>{value+=0x6D2B79F5;let x=value;x=Math.imul(x^x>>>15,x|1);x^=x+Math.imul(x^x>>>7,x|61);return((x^x>>>14)>>>0)/4294967296}; }
export const integer=(r:()=>number,min:number,max:number)=>min+Math.floor(r()*(max-min+1));
export const CORE_STATS=['apps','starts','minutes','goals','assists','shots','shotsOnTarget','passes','passesCompleted','tackles','interceptions','saves','goalsConceded','cleanSheets','ratingSum','ratingCount','yellowCards','redCards'] as const;
export const DETAIL_STATS=['mom','keyPasses','dribbleAttempts','dribblesCompleted','tackleAttempts','aerialAttempts','aerialWon','shotsFaced','oneOnOneAttempts','oneOnOneSaves','penaltiesFaced','penaltiesSaved','crossesFaced','crossesCaught','sweepingAttempts','sweepingSuccesses','buildUpPasses','buildUpCompleted','longKicks','longKicksCompleted','handlingAttempts','handlingSuccesses','lateActions','lateSuccesses','detailedApps'] as const;
export const ACTION_COUNTERS=['headerGoals','pressingWins','progressivePasses','punches'] as const;
export const ACTION_STATS=[...ACTION_COUNTERS,'actionApps','actionMinutes'] as const;
export const EXTENDED_COUNTERS=['freeKickGoals','freeKickAssists','penaltyGoals','bigChancesCreated','bigChanceAssists','pressingAttempts','pressingSuccesses','ballRecoveries','pressureRecoveries'] as const;
export const EXTENDED_STATS=[...EXTENDED_COUNTERS,'extendedApps','extendedMinutes'] as const;
const BASE_STATS=[...CORE_STATS,...DETAIL_STATS] as const;
export const ALL_STATS=[...BASE_STATS,...ACTION_STATS,...EXTENDED_STATS] as const;
// Exhaustive literal keeps every new stats object on the same optimized shape.
export function emptyStats():PlayerStats { return {apps:0,starts:0,minutes:0,goals:0,assists:0,shots:0,shotsOnTarget:0,passes:0,passesCompleted:0,tackles:0,interceptions:0,saves:0,goalsConceded:0,cleanSheets:0,ratingSum:0,ratingCount:0,yellowCards:0,redCards:0,mom:0,keyPasses:0,dribbleAttempts:0,dribblesCompleted:0,tackleAttempts:0,aerialAttempts:0,aerialWon:0,shotsFaced:0,oneOnOneAttempts:0,oneOnOneSaves:0,penaltiesFaced:0,penaltiesSaved:0,crossesFaced:0,crossesCaught:0,sweepingAttempts:0,sweepingSuccesses:0,buildUpPasses:0,buildUpCompleted:0,longKicks:0,longKicksCompleted:0,handlingAttempts:0,handlingSuccesses:0,lateActions:0,lateSuccesses:0,detailedApps:0,headerGoals:0,pressingWins:0,progressivePasses:0,punches:0,actionApps:0,actionMinutes:0,freeKickGoals:0,freeKickAssists:0,penaltyGoals:0,bigChancesCreated:0,bigChanceAssists:0,pressingAttempts:0,pressingSuccesses:0,ballRecoveries:0,pressureRecoveries:0,extendedApps:0,extendedMinutes:0} satisfies Record<typeof ALL_STATS[number],number>; }
// New action counts/coverage are validated integers: exact addition avoids needless decimal conversions.
export function sumStats(records:PlayerStats[]):PlayerStats { const s=emptyStats();for(const row of records){for(const k of BASE_STATS)s[k]=round((s[k]??0)+(row[k]??0));for(const k of [...ACTION_STATS,...EXTENDED_STATS])s[k]=(s[k]??0)+(row[k]??0);}return s; }
export function addStats(target:PlayerStats,row:PlayerStats):PlayerStats {for(const k of BASE_STATS)target[k]=round((target[k]??0)+(row[k]??0));for(const k of [...ACTION_STATS,...EXTENDED_STATS])target[k]=(target[k]??0)+(row[k]??0);return target;}
