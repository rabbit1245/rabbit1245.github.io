import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createCareer,advanceHalf,startNextSeason,acceptTransfer,setAllAttributeLocks,overall,ENGINE_VERSION} from '../src/game/engine';
import {FIELD_ATTRIBUTES,POSITION_ATTRIBUTES,PLAY_STYLES} from '../src/game/attributes';
import {beginGrowthSeason} from '../src/game/growth';
import {emptyStats} from '../src/game/math';
import {validateCareer,exportCareer,verifySaveText} from '../src/game/storage';
import {shirtSalesSeason} from '../src/game/commercial';
import {careerRecordTotals,buildCareerText} from '../src/game/career-text';
import {getClubWorldPower} from '../src/game/world';
const icon=process.argv.includes('--icon'),clubId=icon?'ES1_01':'EN1_18';
const seasons=Number(process.env.KBALL_MARKET_SEASONS||(icon?1:5)),out=process.env.KBALL_MARKET_RESULTS||(icon?'test-results/release-2.11.0/icon':'test-results/release-2.11.0/actual');
async function main(){await mkdir(out,{recursive:true});
 let c=createCareer({name:icon?'세계 판매상 검수':'시장과 장기 저장 검수',nationality:'포르투갈',age:icon?27:18,height:183,weight:76,foot:'right',position:icon?'ST':'LW',talent:icon?'SSS':'SS',style:PLAY_STYLES[icon?'ST':'LW'][0],clubId,squad:'senior',difficulty:'realistic',seed:'commercial-long-career-2110',training:[]});
 for(const k of FIELD_ATTRIBUTES)c.player.attributes[k]=icon?100:90;if(icon){c.player.playSkills=POSITION_ATTRIBUTES.ST.slice(0,5);for(const k of c.player.playSkills)c.player.attributes[k]=105;c.player.potential=100;c.systems!.commercial!.reputation[c.player.id]=1;}c.player.ovr=overall(c.player);c.season.attributeStart={...c.player.attributes};c.season.ovrStart=c.player.ovr;beginGrowthSeason(c);c.systems!.firstHalfSnapshot={attributes:{...c.player.attributes},ovr:c.player.ovr,stats:emptyStats(),value:c.systems!.economics.marketValue,round:0};c=setAllAttributeLocks(c,true);c.systems!.personality={leadership:5,stardom:10,fairPlay:5,clutch:5,winning:5};const attrs={...c.player.attributes},rows=[];
 for(let y=0;y<seasons;y++){
  const start=performance.now();c=advanceHalf(c);validateCareer(c,true);c=advanceHalf(c);validateCareer(c,true);assert.deepEqual(c.player.attributes,attrs);
  const s=c.season.playerStats,market=shirtSalesSeason(c,c.season.year)!;assert.ok(market&&market.completed);const club=c.season.table.find(r=>r.clubId===clubId)!;if(icon)assert.ok(market.playerRank!==null&&market.playerRank<=3,'an established max-reputation 110 player at Real competes for sales medals through the same market');
  const row={year:c.season.year,age:c.player.age,ovr:c.player.ovr,rank:c.season.table.indexOf(club)+1,goals:s.goals,assists:s.assists,shirtUnits:market.playerUnits,shirtRank:market.playerRank,clubPopularity:market.playerClubs[0].clubPopularity,worldMarketUnits:market.marketTotal,candidates:market.candidateCount,shirtAwards:c.awards.filter(a=>a.year===c.season.year&&a.category==='commercial-individual').map(a=>a.name),marketValueEUR:c.systems!.economics.marketValue,wageEUR:c.player.wage,power:getClubWorldPower(c,clubId),elapsedMs:performance.now()-start,memory:process.memoryUsage()};rows.push(row);console.log(JSON.stringify(row));await writeFile(`${out}/progress.json`,JSON.stringify(rows,null,2)+'\n');
  if(y===0||y===seasons-1){const save=await exportCareer(c),loaded=await verifySaveText(save);assert.deepEqual(careerRecordTotals(loaded),careerRecordTotals(c));assert.deepEqual(loaded.systems!.commercial,c.systems!.commercial);await writeFile(`${out}/career-${y+1}.json`,save);await writeFile(`${out}/career-${y+1}.txt`,buildCareerText(c));console.log('EXPORT',y+1,Buffer.byteLength(save));}
  if(y<seasons-1){const renew=c.offers.find(o=>o.clubId===clubId);assert.ok(renew,'a valid funded renewal keeps the long-term test in the same club');c=startNextSeason(acceptTransfer(c,renew.id));}
  global.gc?.();
 }
 await writeFile(`${out}/results.json`,JSON.stringify({version:ENGINE_VERSION,actualFullWorldSeasons:seasons,initialReputation:icon?1:'model default',abilitiesLockedAndUnchanged:true,sourceValidationEveryHalf:true,JSONRoundTrip:true,commercialRoundTrip:true,retirementTXT:true,rows},null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
