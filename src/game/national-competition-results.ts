import {nationalFinalFieldSize,nationalGroupTable,nationalKnockoutTeams,nationalQualifiers} from './national-expanded';
import type {Career,MatchRecord} from './types';
import type {NationalSeason} from './revision-types';

const stages=['qualifying','friendly','group','round32','round16','quarterfinal','semifinal','thirdPlace','final'] as const;
type Stage=typeof stages[number];
export type NationalCompetitionPhase='qualifying'|'finals'|'friendly'|'unrecorded';
type Edition={id:string|undefined;teamId:string;squad:NationalSeason['squad'];year:number;phase:NationalCompetitionPhase};
type Result={label:string;complete:boolean};
const rounds={round32:'32강',round16:'16강',quarterfinal:'8강',semifinal:'4강',thirdPlace:'3·4위전',final:'결승'};
const nextRound={round32:'16강',round16:'8강',quarterfinal:'4강',semifinal:'결승'};

export function nationalFixtureStage(fixtureId:string):Stage|undefined {
 const parts=fixtureId.split('|');
 return stages.find(stage=>parts.includes(stage));
}
export function nationalMatchPhase(match:MatchRecord):NationalCompetitionPhase {
 const stage=nationalFixtureStage(match.fixtureId);
 return stage==='qualifying'?'qualifying':stage==='friendly'||match.competitionId?.startsWith('FRIENDLIES:')?'friendly':stage?'finals':'unrecorded';
}
const includesTeam=(match:MatchRecord,teamId:string)=>match.homeId===teamId||match.awayId===teamId;
const matchWinner=(match:MatchRecord)=>match.shootout?.winnerId??
 (match.homeGoals===match.awayGoals?undefined:match.homeGoals>match.awayGoals?match.homeId:match.awayId);
const live=(label:string):Result=>({label,complete:false});
const finished=(label:string):Result=>({label,complete:true});

function groupProgress(groups:string[][],matches:readonly MatchRecord[],stage:'qualifying'|'group',country:string,legs=1) {
 const marker=stage==='qualifying'?'q':'g';
 const tables=groups.map((group,index)=>nationalGroupTable(group,matches.filter(m=>m.fixtureId.includes(`|${stage}|${marker}:${index}:`))));
 const own=tables.find(table=>table.some(row=>row.id===country));
 const index=own?.findIndex(row=>row.id===country)??-1;
 const rank=index>=0&&own![index].played>0?index+1:undefined;
 const complete=tables.length>0&&tables.every(table=>table.every(row=>row.played===(table.length-1)*legs));
 return {tables,rank,complete};
}

function qualifyingResult(career:Career,edition:Edition,matches:readonly MatchRecord[],archive?:NationalSeason):Result {
 const {id,teamId,squad,year}=edition,n=career.systems?.national;
 const country=teamId.split(':')[1],draw=n?.qualifyingDraws?.[`${squad}|${id}`];
 if(draw){
  const {rank,tables,complete}=groupProgress(draw.groups,matches,'qualifying',country,draw.legs);
  if(rank){
   if(complete){
    const teams=draw.groups.flat().length;
    const slots=nationalFinalFieldSize(id!,teams);
    const place=nationalQualifiers(tables,teams).indexOf(country)+1;
    if(place<=slots)return finished(`예선 조 ${rank}위 · 본선 진출`);
    return finished(`예선 조 ${rank}위 · 본선 선발 ${place}위로 탈락 (상위 ${slots}팀 진출)`);
   }
   return live(`예선 조 현재 ${rank}위`);
  }
 }
 // Older formats can retain a final qualifying status without the saved draw.
 const prefix=`national-result:${id}:${squad}:`;
 const recorded=career.systems?.events.find(event=>event.year<=year&&event.id.startsWith(prefix+'예선 '));
 const place=recorded?.id.slice(prefix.length).match(/^예선 (\d+)위 · 본선 진출 실패$/)?.[1];
 if(place)return finished(`예선 조 ${place}위 탈락`);
 const finals=matches.some(match=>includesTeam(match,teamId)&&nationalMatchPhase(match)==='finals');
 const current=year===career.season.year&&id===n?.competitionId&&squad===n?.squad;
 const rank=current&&n.rank>0?n.rank:undefined;
 if(finals||archive?.qualified||current&&n.qualified)return finished(rank?`예선 조 ${rank}위 · 본선 진출`:'예선 통과 · 본선 진출');
 if(archive?.result==='예선 탈락'||current&&n.phase==='eliminated')return finished(rank?`예선 조 ${rank}위 탈락`:'예선 탈락 · 순위 미보존');
 return live(rank?`예선 조 현재 ${rank}위`:'예선 참가');
}

function finalsResult(career:Career,edition:Edition,matches:readonly MatchRecord[],archive?:NationalSeason):Result {
 const {id,teamId,squad}=edition,n=career.systems?.national;
 const own=matches.filter(match=>includesTeam(match,teamId));
 const stagesPlayed=new Map(own.map(match=>[nationalFixtureStage(match.fixtureId),match]));
 for(const stage of ['final','thirdPlace','semifinal','quarterfinal','round16','round32'] as const){
  const match=stagesPlayed.get(stage);
  if(!match)continue;
  const winner=matchWinner(match);
  if(!winner)return live(`${rounds[stage]} · 결과 미보존`);
  const won=winner===teamId;
  if(stage==='final')return finished(won?'우승':'준우승');
  if(stage==='thirdPlace')return finished(won?'3위':'4위');
  if(won)return live(`${nextRound[stage]} 진출`);
  if(stage==='semifinal'&&n?.schedule?.some(row=>row.squad===squad&&row.competitionId===id&&row.stage==='thirdPlace'&&(row.homeId===teamId||row.awayId===teamId)))return live('4강 패배 · 3·4위전 대기');
  return finished(`${rounds[stage]} 탈락`);
 }
 const draw=n?.finalDraws?.[`${squad}|${id}`];
 if(draw){
  const country=teamId.split(':')[1],{rank,tables,complete}=groupProgress(draw.groups,matches,'group',country);
  if(rank&&complete){
   const advancing=nationalKnockoutTeams(tables,draw.size);
   if(!advancing.includes(country))return finished(`조별리그 ${rank}위 탈락`);
   return live(`조별리그 ${rank}위 · ${advancing.length}강 진출`);
  }
  if(rank)return live(`조별리그 현재 ${rank}위`);
 }
 if(stagesPlayed.has('group'))return live('조별리그 참가');
 if(archive&&['우승','준우승','3위','4위'].includes(archive.result))return finished(archive.result);
 return live('본선 참가');
}

export function getNationalCompetitionResult(career:Career,edition:Edition,editionMatches:readonly MatchRecord[],archive?:NationalSeason):Result {
 if(edition.phase==='friendly')return finished('친선 경기');
 if(edition.phase==='unrecorded')return live('대회 결과 미보존');
 const matches=editionMatches.filter(match=>match.seasonYear<=edition.year);
 return edition.phase==='qualifying'?qualifyingResult(career,edition,matches,archive):finalsResult(career,edition,matches,archive);
}
