import type {CareerSystems} from './revision-types';
import {ROSTER_CALIBRATION} from './data';
/** Archived games are immutable. Copy mutable containers rather than re-copying decades of matches. */
export function copySystems(s:CareerSystems,light=false):CareerSystems{
 if((s.world.rosterVersion??1)<ROSTER_CALIBRATION.version)return structuredClone(s);
 const next:CareerSystems={...s,economics:structuredClone(s.economics),leadership:structuredClone(s.leadership),events:[...s.events],growthReports:[...s.growthReports],rankings:[...s.rankings],manualAging:[...(s.manualAging??[])],attributeLocks:[...(s.attributeLocks??[])],...(s.growthLedger?{growthLedger:structuredClone(s.growthLedger)}:{}),...(s.cheats?{cheats:{...s.cheats}}:{})};
 if(light)return next;
 const {matches,history,teamResults,...national}=s.national;
 next.national={...structuredClone(national),matches:[...matches],history:[...history],...(teamResults?{teamResults:[...teamResults]}:{})};
 next.world=structuredClone(s.world);
 if(s.clubCompetitions){const {current,history,...state}=s.clubCompetitions;next.clubCompetitions={...state,history:[...history],current:current.map(t=>{const {matches,...mutable}=t;return {...structuredClone(mutable),matches:[...matches]};})};}
 if(s.manualInjuries)next.manualInjuries=structuredClone(s.manualInjuries);
 if(s.achievementEvidence)next.achievementEvidence=structuredClone(s.achievementEvidence);
 if(s.monthlyLeague)next.monthlyLeague=structuredClone(s.monthlyLeague);
 return next;
}
