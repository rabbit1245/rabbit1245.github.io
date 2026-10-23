import {cupLedger} from './club-competitions';
import {getClub,getLeague} from './data';
import type {Award,Career} from './types';
export function competitionLabel(c:Career,id?:string):string{
 if(!id)return '대회 미기록';
 const cup=cupLedger(c).find(t=>t.id===id);if(cup)return cup.name;
 const archived=c.history.find(h=>h.leagueId===id);if(archived)return archived.competitionName;
 const national=c.systems?.national,known=national?.history.find(h=>h.competitionId===id);
 if(known)return known.competitionName;
 if(national?.competitionId===id)return national.competitionName;
 try{return getLeague(id).name;}catch{/* A national competition. */}
 const labels:Record<string,string>={WC:'월드컵',U20WC:'20세 이하 월드컵',AFC:'아시안컵',UEFA:'유럽 선수권',CONMEBOL:'코파 아메리카',CONCACAF:'골드컵',CAF:'아프리카 네이션스컵',OFC:'오세아니아 네이션스컵',FRIENDLIES:'국가대표 친선 경기'};
 const [kind,year]=id.split(':');return labels[kind]?`${year?`${year}년 `:''}${labels[kind]}`:'대회 미기록';
}
export const isTeamAward=(a:Award)=>['team','national','national-team'].includes(a.category??'')||/우승|메달/.test(a.name);
export interface SeasonTitle {id:string;year:number;name:string;team:string;scope:'club'|'national';apps:number|null;medal:boolean;}
export function seasonHonours(c:Career,year:number){
 const n=c.systems?.national,titles:SeasonTitle[]=[],awards=[...new Map([...c.awards,...c.history.flatMap(h=>h.awards),...(c.systems?.rankings.flatMap(r=>r.awards)??[])].filter(a=>a.year===year).map(a=>[a.id,a])).values()];
 const h=c.history.find(h=>h.year===year),season=year===c.season.year?c.season:undefined;
 const clubId=h?.clubId??season?.matches[0]?.playerClubId??c.player.clubId;
 const completed=h?.completed??season?.completed??false,rank=h?.rank??(season?season.table.findIndex(t=>t.clubId===clubId)+1:0);
 if(completed&&rank===1)titles.push({id:`club:${year}:${clubId}`,year,name:h?.competitionName??season!.competitionName,team:h?.clubName??getClub(clubId).name,scope:'club',apps:h?.stats.apps??season!.playerStats.apps,medal:awards.some(a=>a.category==='team'&&a.clubId===clubId&&a.name.startsWith(h?.competitionName??season!.competitionName))});
 for(const t of cupLedger(c,year)){const own=t.matches[0]?.playerClubId;if(t.winnerId&&own===t.winnerId)titles.push({id:t.id,year,name:t.name,team:getClub(t.winnerId).name,scope:'club',apps:t.matches.reduce((n,m)=>n+m.playerStats.apps,0),medal:awards.some(a=>a.id.startsWith(t.id+':champion:'))});}
 const addNational=(id:string,name:string,squad:string,apps:number)=>{const finals=[...new Map([...(n?.history.flatMap(h=>h.matches)??[]),...(n?.matches??[])].filter(m=>m.competitionId===id&&m.playerClubId.endsWith(`:${squad}`)&&/\|(group|round32|round16|quarterfinal|semifinal|final|thirdPlace)\|/.test(m.fixtureId)).map(m=>[m.fixtureId,m])).values()];if(finals.length)apps=finals.reduce((sum,m)=>sum+m.playerStats.apps,0);if(!titles.some(t=>t.id===`national:${id}`))titles.push({id:`national:${id}`,year,name,team:`${n?.country??c.player.nationality} ${squad==='U20'?'20세 이하 대표팀':'성인 대표팀'}`,scope:'national',apps,medal:awards.some(a=>isTeamAward(a)&&a.name.includes(name))});};
 for(const row of n?.history??[])if(row.year===year&&row.result==='우승')addNational(row.competitionId,row.competitionName,row.squad,row.stats.apps);
 const matches=[...new Map([...(n?.history.flatMap(h=>h.matches)??[]),...(n?.matches??[])].filter(m=>m.seasonYear===year).map(m=>[m.fixtureId,m])).values()];
 for(const m of matches){
  if(!m.fixtureId.includes('|final|')||!m.playerClubId.startsWith('NAT:'))continue;
  const winner=m.shootout?.winnerId??(m.homeGoals>m.awayGoals?m.homeId:m.awayGoals>m.homeGoals?m.awayId:undefined);
  if(winner!==m.playerClubId)continue;
  const id=m.competitionId;if(!id)continue;
  addNational(id,competitionLabel(c,id),m.playerClubId.split(':')[2],matches.filter(x=>x.competitionId===id).reduce((sum,x)=>sum+x.playerStats.apps,0));
 }
 for(const a of awards.filter(a=>isTeamAward(a)&&/우승/.test(a.name)&&!/준우승/.test(a.name))){
  const name=a.name.replace(/\s*우승(?:\s*(?:메달|트로피))?$/,'');
  if(!titles.some(t=>t.name===name))titles.push({id:`award:${a.id}`,year,name,team:a.category==='team'?getClub(a.clubId).name:`${n?.country??c.player.nationality} 대표팀`,scope:a.category==='team'?'club':'national',apps:null,medal:true});
 }
 return {year,titles,personal:awards.filter(a=>!isTeamAward(a)),teamAwards:awards.filter(isTeamAward),pending:year===c.season.year&&!c.season.completed&&c.stage==='season'};
}
