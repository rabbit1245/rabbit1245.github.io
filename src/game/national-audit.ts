import {sumStats} from './math';
import type {Career,MatchRecord} from './types';
export const nationalStage=(id:string)=>id.includes('|friendly|')?'친선':id.includes('|qualifying|')?'예선':'본선';
export function nationalAudit(c:Career){
 const n=c.systems?.national,all=[...new Map([...(n?.history.flatMap(h=>h.matches)??[]),...(n?.matches??[])].map(m=>[m.fixtureId,m])).values()];
 const years=[...new Set([...all.map(m=>Number((m.date??String(m.seasonYear)).slice(0,4))),...(n?.schedule??[]).map(f=>Number(f.date.slice(0,4)))])].sort((a,b)=>b-a);
 const count=(matches:MatchRecord[])=>({teamGames:matches.length,called:matches.filter(m=>m.nationalSelection?.called??m.playerPlayed).length,starts:matches.filter(m=>m.playerStarted).length,sub:matches.filter(m=>m.playerPlayed&&!m.playerStarted).length,bench:matches.filter(m=>m.nationalSelection?.role==='bench').length,excluded:matches.filter(m=>m.nationalSelection?.role==='excluded').length,stats:sumStats(matches.map(m=>m.playerStats))});
 return years.flatMap(year=>(['U20','senior'] as const).map(squad=>{
  const games=all.filter(m=>Number((m.date??String(m.seasonYear)).slice(0,4))===year&&m.playerClubId.endsWith(`:${squad}`)),plans=(n?.schedule??[]).filter(f=>Number(f.date.slice(0,4))===year&&f.squad===squad),ids=new Set(games.map(m=>m.fixtureId));
  return {year,squad,scheduled:games.length+plans.filter(f=>!ids.has(f.id)).length,pending:plans.filter(f=>!ids.has(f.id)),legacy:games.some(m=>!m.nationalSelection),...count(games),types:(['친선','예선','본선'] as const).map(kind=>({kind,...count(games.filter(m=>nationalStage(m.fixtureId)===kind))})),tournaments:new Set(games.filter(m=>nationalStage(m.fixtureId)==='본선'&&m.playerPlayed).map(m=>m.competitionId)).size};
 })).filter(r=>r.scheduled>0);
}
