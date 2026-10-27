import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCareer,advanceHalf,startNextSeason,overall,setAllAttributeLocks,acceptTransfer,respondToCaptainOffer,ENGINE_VERSION} from '../src/game/engine';
import {PLAY_STYLES,FIELD_ATTRIBUTES} from '../src/game/attributes';
import {beginGrowthSeason} from '../src/game/growth';
import {getClubWorldPower} from '../src/game/world';
import {exportCareer,verifySaveText,validateCareer} from '../src/game/storage';
import {canonicalBytes} from '../src/game/canonical-bytes';
import {emptyStats} from '../src/game/math';
import {userInfluencedClub,ESTABLISHED_CLUBS} from '../src/game/club-balance';
async function main(){
 const out=process.env.KBALL_LIVERPOOL_DIR||'test-results/release-2.9.4/liverpool',seasons=Number(process.env.KBALL_LIVERPOOL_SEASONS||12);await mkdir(out,{recursive:true});
 const resume=process.env.KBALL_LIVERPOOL_RESUME;
 let c=resume?JSON.parse(await readFile(resume,'utf8')):createCareer({name:'리버풀 98 장기 검수',nationality:'포르투갈',age:28,height:183,weight:78,foot:'right',position:'ST',talent:'SSS',style:PLAY_STYLES.ST[0],clubId:'EN1_12',squad:'senior',difficulty:'realistic',seed:'liverpool-98-stability-294',training:[]});
 if(!resume){for(const key of FIELD_ATTRIBUTES)c.player.attributes[key]=98;c.player.ovr=overall(c.player);c.player.potential=Math.max(c.player.potential,c.player.ovr);c.season.attributeStart={...c.player.attributes};c.season.ovrStart=c.player.ovr;beginGrowthSeason(c);c.systems!.firstHalfSnapshot={attributes:{...c.player.attributes},stats:emptyStats(),ovr:c.player.ovr,value:c.systems!.economics.marketValue,round:0};c=setAllAttributeLocks(c,true);}
 const baseline=new Map<string,number>(Object.values(c.systems!.world.clubs).map((t:any)=>[t.id,t.development!.basePower])),attributes={...c.player.attributes},rows:any[]=resume?JSON.parse(await readFile(`${out}/progress.json`,'utf8')).rows.filter((r:any)=>r.year<c.season.year):[];
 for(let year=rows.length;year<seasons;year++){
  if(c.stage==='season')c=advanceHalf(advanceHalf(c));validateCareer(c);assert.deepEqual(c.player.attributes,attributes);await writeFile(`${out}/last-completed.json`,JSON.stringify(c));
  const own=c.season.table.find(t=>t.clubId==='EN1_12')!,stats=c.season.playerStats,awards=c.awards.filter(a=>a.year===c.season.year).map(a=>a.name);
  const npc=Object.values(c.systems!.world.clubs).filter((t:any)=>!userInfluencedClub(c,t.id)),maxNpcRise=Math.max(...npc.map((t:any)=>getClubWorldPower(c,t.id)-baseline.get(t.id)!));assert.ok(maxNpcRise<=6.51,`unaffected club rise ${maxNpcRise}`);
  const established=Object.fromEntries([...ESTABLISHED_CLUBS].map(id=>[id,getClubWorldPower(c,id)]));for(const id of ESTABLISHED_CLUBS)if(!userInfluencedClub(c,id))assert.ok(established[id]+c.systems!.world.clubs[id].injuryImpact>=baseline.get(id)!-1,`${id}: healthy underlying power lost`);
  rows.push({year:c.season.year,age:c.player.age,rank:c.season.table.indexOf(own)+1,points:own.points,apps:stats.apps,minutes:stats.minutes,goals:stats.goals,assists:stats.assists,power:getClubWorldPower(c,'EN1_12'),investment:c.systems!.world.clubs.EN1_12.development!.investmentPower??0,ballonRank:c.systems!.rankings.at(-1)?.playerRank,awards,maxNpcRise,established});console.log(JSON.stringify(rows.at(-1)));
  await writeFile(`${out}/progress.json`,JSON.stringify({version:ENGINE_VERSION,completed:year+1,rows},null,2)+'\n');
  if(year===seasons-1)break;
  const renewal=c.offers.find(o=>o.clubId==='EN1_12');assert.ok(renewal);c=acceptTransfer(c,renewal.id);
  for(const offer of c.systems!.leadership.offers??[])if(offer.status==='pending'&&offer.year===c.season.year)c=respondToCaptainOffer(c,offer.id,true);
  c=startNextSeason(c);
 }
 const leagueTitles=rows.filter(r=>r.rank===1).length,uclTitles=rows.filter(r=>r.awards.includes('UEFA 챔피언스리그 우승 메달')).length;
 const report={version:ENGINE_VERSION,seasons,personality:'all default 5; no automatic trophy award; renewals/captain offers accepted by test driver',leagueTitles,uclTitles,attributesUnchanged:true,rows};await writeFile(`${out}/results.json`,JSON.stringify(report,null,2)+'\n');
 const text=await exportCareer(c),loaded=await verifySaveText(text),hash=(v:unknown)=>createHash('sha256').update(canonicalBytes(v)).digest('hex');assert.equal(hash(c),hash(loaded));await writeFile(`${out}/career.json`,text);console.log('LIVERPOOL CAREER PASSED',JSON.stringify({leagueTitles,uclTitles,seasons}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
