/** Actual fixtures in both German/Spanish pyramids, without a participating user.
 * Other countries remain unplayed; this diagnoses NPC league balance, not a full career.
 */
import {mkdirSync,writeFileSync} from 'node:fs';
import {getClub} from '../src/game/data';
import {createCareer} from '../src/game/engine';
import {getClubWorldPower,processWorldRound,transitionWorldSeason} from '../src/game/world';
const results=[],years=Number(process.env.KBALL_BALANCE_YEARS??15),seeds=Number(process.env.KBALL_BALANCE_SEEDS??3);
for(let seed=0;seed<seeds;seed++){
 const c=createCareer({name:'리그 검증',nationality:'대한민국',age:20,height:180,weight:75,foot:'right',position:'ST',talent:'A',style:'포처',clubId:'KR1_01',squad:'senior',difficulty:'realistic',seed:`league-balance-${seed}`});
 const seasons=[];
 for(let year=0;year<years;year++){
  const w=c.systems!.world,all=w.competitions;
  w.competitions=Object.fromEntries(Object.entries(all).filter(([id])=>/^(DE|ES)/.test(id)));
  c.season.week=c.season.totalWeeks;processWorldRound(c,[]);
  const leagues=Object.fromEntries(['DE1','ES1'].map(id=>[id,w.competitions[id].table.map((row,i)=>({...row,rank:i+1,name:getClub(row.clubId).name,power:getClubWorldPower(c,row.clubId)}))]));
  const tracked=Object.fromEntries(['DE1_09','DE1_02','ES1_01','ES1_02'].map(id=>{
   const club=w.clubs[id],table=w.competitions[club.leagueId].table,row=table.find(r=>r.clubId===id)!;
   return [id,{league:club.leagueId,rank:table.indexOf(row)+1,...row,power:getClubWorldPower(c,id)}];
  }));
  seasons.push({year:c.season.year,leagues,tracked});
  w.competitions=all;transitionWorldSeason(c);c.season.year++;c.season.index++;c.season.week=0;
 }
 const summary=Object.fromEntries(['DE1','ES1'].map(id=>{
  const titles:Record<string,number>={};for(const s of seasons){const winner=s.leagues[id][0].name;titles[winner]=(titles[winner]??0)+1;}
  return [id,{titles,last5:seasons.slice(-5).map(s=>({year:s.year,winner:s.leagues[id][0].name,points:s.leagues[id][0].points}))}];
 }));
 results.push({seed,summary,seasons});console.log(JSON.stringify({seed,summary}));
}
const directory=process.env.KBALL_BALANCE_RESULTS??'test-results/v231/balance';mkdirSync(directory,{recursive:true});
writeFileSync(`${directory}/results.json`,JSON.stringify({years,seeds,scope:'German and Spanish pyramids; other countries unplayed',results},null,2));
