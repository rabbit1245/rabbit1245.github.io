import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createCareer,advanceHalf,startNextSeason,acceptTransfer,setAllAttributeLocks,overall,respondToCaptainOffer,ENGINE_VERSION} from '../src/game/engine';
import {FIELD_ATTRIBUTES,POSITION_ATTRIBUTES,PLAY_STYLES} from '../src/game/attributes';
import {beginGrowthSeason} from '../src/game/growth';
import {emptyStats} from '../src/game/math';
import {getCaptainAssessment} from '../src/game/captain';
import {getClubWorldPower} from '../src/game/world';
import {validateCareer,exportCareer,verifySaveText} from '../src/game/storage';
import {careerRecordTotals,careerMatchLedger,buildCareerText} from '../src/game/career-text';
import {actionEventTotals} from '../src/game/action-metrics';
import {ACTION_COUNTERS} from '../src/game/math';
import type {Career,Position} from '../src/game/types';
const profiles=[{name:'son90',position:'LW',ovr:90,clubId:'EN1_18',seasons:1},{name:'legend110',position:'ST',ovr:110,clubId:'EN1_12',seasons:1},{name:'chelsea95',position:'RWB',ovr:95,clubId:'EN1_06',seasons:2},{name:'small98',position:'ST',ovr:98,clubId:'IT3_30',seasons:3}] as const;
function leadership(c:Career){const order={none:0,vice:1,captain:2};for(const o of c.systems!.leadership.offers??[])if(o.status==='pending'&&order[getCaptainAssessment(c,o.scope).eligibleRole]>=order[o.role])c=respondToCaptainOffer(c,o.id,true);return c;}
async function main(){const out=process.env.KBALL_ABILITY_CAREERS||'test-results/release-2.10.1/careers';await mkdir(out,{recursive:true});const results:Record<string,unknown>={};
 for(const p of profiles){if(process.argv.includes('--resume')){const text=await readFile(`${out}/${p.name}.json`,'utf8').catch(()=>null);if(text){validateCareer(await verifySaveText(text));results[p.name]=JSON.parse(await readFile(`${out}/${p.name}-progress.json`,'utf8'));continue;}}let c=createCareer({name:`능력 연동 ${p.name}`,nationality:'포르투갈',age:27,height:184,weight:80,foot:'right',position:p.position as Position,talent:'SSS',style:PLAY_STYLES[p.position][0],clubId:p.clubId,squad:'senior',difficulty:'realistic',seed:`ability-season-${p.name}`,training:[]});for(const k of FIELD_ATTRIBUTES)c.player.attributes[k]=Math.min(100,p.ovr);if(p.ovr>100){c.player.playSkills=POSITION_ATTRIBUTES[p.position].slice(0,5);for(const k of c.player.playSkills)c.player.attributes[k]=105;}c.player.ovr=overall(c.player);c.player.potential=Math.min(100,Math.max(c.player.potential,c.player.ovr));c.season.attributeStart={...c.player.attributes};c.season.ovrStart=c.player.ovr;beginGrowthSeason(c);c.systems!.firstHalfSnapshot={attributes:{...c.player.attributes},ovr:c.player.ovr,stats:emptyStats(),value:c.systems!.economics.marketValue,round:0};c=setAllAttributeLocks(c,true);const attrs={...c.player.attributes},rows=[];
  for(let year=0;year<p.seasons;year++){c=leadership(advanceHalf(c));c=leadership(advanceHalf(c));validateCareer(c);assert.deepEqual(c.player.attributes,attrs);const s=c.season.playerStats,table=c.season.table,own=table.find(r=>r.clubId===p.clubId)!;const ledger=careerMatchLedger(c);for(const m of [...ledger.club,...ledger.national].filter(m=>m.actionVersion===1)){const totals=actionEventTotals(m.events).get(c.player.id);for(const k of ACTION_COUNTERS)assert.equal(m.playerStats[k],totals?.[k]??0);}
   const row={year:c.season.year,ovr:c.player.ovr,position:p.position,rank:table.indexOf(own)+1,leagueTeams:table.length,points:own.points,teamGF:own.goalsFor,teamGA:own.goalsAgainst,apps:s.apps,starts:s.starts,minutes:s.minutes,goals:s.goals,assists:s.assists,rating:s.ratingSum/Math.max(1,s.ratingCount),power:getClubWorldPower(c,p.clubId),investment:c.systems!.world.clubs[p.clubId].development?.investmentPower??0,nationalApps:careerRecordTotals(c).national.apps,clubRole:c.systems!.leadership.clubRole,awards:c.awards.filter(a=>a.year===c.season.year).map(a=>a.name)};rows.push(row);console.log(p.name,JSON.stringify(row));await writeFile(`${out}/${p.name}-progress.json`,JSON.stringify(rows,null,2)+'\n');
   if(year<p.seasons-1){const offer=c.offers.find(o=>o.clubId===p.clubId);assert.ok(offer);c=startNextSeason(acceptTransfer(c,offer.id));}
  }
  const text=await exportCareer(c),loaded=await verifySaveText(text);assert.deepEqual(careerRecordTotals(loaded),careerRecordTotals(c));await writeFile(`${out}/${p.name}.json`,text);await writeFile(`${out}/${p.name}.txt`,buildCareerText(c));results[p.name]=rows;
 }
 await writeFile(`${out}/results.json`,JSON.stringify({version:ENGINE_VERSION,actualWorldSeasons:profiles.reduce((n,p)=>n+p.seasons,0),training:[],lockedAbilitiesUnchanged:true,validLeadershipOffersAccepted:true,sourceCountersReconciled:true,JSONRoundTrip:true,profiles:results},null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
