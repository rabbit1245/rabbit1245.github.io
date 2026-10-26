import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createCareer,advanceHalf,startNextSeason,overall,setAllAttributeLocks} from '../src/game/engine';
import {PLAY_STYLES,FIELD_ATTRIBUTES} from '../src/game/attributes';
import {beginGrowthSeason} from '../src/game/growth';
import {getClubWorldPower} from '../src/game/world';
import {exportCareer,verifySaveText,validateCareer} from '../src/game/storage';
import {canonicalBytes} from '../src/game/canonical-bytes';
import {createHash} from 'node:crypto';
async function main(){
 const out=process.env.KBALL_STAR_CAREER_DIR||'test-results/release-2.9.3/career';await mkdir(out,{recursive:true});
 let c=createCareer({name:'세리에 C 98 검수',nationality:'대한민국',age:22,height:182,weight:77,foot:'right',position:'ST',talent:'SSS',style:PLAY_STYLES.ST[0],clubId:'IT3_30',squad:'senior',difficulty:'realistic',seed:'serie-c-impact-0',training:[]});
 for(const key of FIELD_ATTRIBUTES)c.player.attributes[key]=98;c.player.ovr=overall(c.player);c.player.potential=Math.max(c.player.potential,c.player.ovr);c.season.ovrStart=c.player.ovr;c.season.attributeStart={...c.player.attributes};beginGrowthSeason(c);
 c.systems!.firstHalfSnapshot={attributes:{...c.player.attributes},stats:empty(),ovr:c.player.ovr,value:c.systems!.economics.marketValue,round:0};
 const e=c.systems!.economics;c.player.contractYears=5;e.contract.expiresYear=c.season.year+5;delete e.contract.expiresDate;const terms=e.contractHistory![0].current;terms.years=5;terms.expiresYear=e.contract.expiresYear;delete terms.expiresDate;
 c=setAllAttributeLocks(c,true);const attributes={...c.player.attributes},rows=[];let firstCaptain:unknown;
 for(let year=0;year<3;year++){
  c=advanceHalf(advanceHalf(c));validateCareer(c);assert.deepEqual(c.player.attributes,attributes);
  const club=c.systems!.world.clubs[c.player.clubId],table=c.season.table.find(r=>r.clubId===c.player.clubId)!;
  const o=c.systems!.leadership.offers?.find(o=>o.scope==='national'&&o.status==='pending'&&o.role==='captain');
  if(o&&!firstCaptain){firstCaptain={age:c.player.age,reputation:c.systems!.national.reputation,assessment:o.assessment};assert.ok(c.player.age<30);await writeFile(`${out}/national-captain.json`,await exportCareer(c));}
  rows.push({year:c.season.year,age:c.player.age,league:c.season.leagueId,rank:c.season.table.indexOf(table)+1,points:table.points,apps:c.season.playerStats.apps,goals:c.season.playerStats.goals,assists:c.season.playerStats.assists,power:getClubWorldPower(c,club.id),investmentBefore:club.development!.investmentPower??0});
  c=startNextSeason(c);validateCareer(c);const d=c.systems!.world.clubs[c.player.clubId].development!;Object.assign(rows.at(-1)!,{investmentAfter:d.investmentPower,funded:d.history.at(-1)?.reinvestment,afterPower:getClubWorldPower(c,c.player.clubId)});console.log(JSON.stringify(rows.at(-1)));
 }
 assert.ok(firstCaptain,'a proven young national leader should receive a real captain offer');assert.ok(c.systems!.world.clubs[c.player.clubId].development!.investmentPower!>3,'three funded seasons must build meaningful club strength');
 const text=await exportCareer(c),loaded=await verifySaveText(text),hash=(v:unknown)=>createHash('sha256').update(canonicalBytes(v)).digest('hex');assert.equal(hash(loaded),hash(c));await writeFile(`${out}/three-seasons.json`,text);
 const report={rows,firstCaptain,attributesUnchanged:true,saveRoundTrip:true};await writeFile(`${out}/results.json`,JSON.stringify(report,null,2)+'\n');console.log('STAR CAREER PASSED');
}
import {emptyStats as empty} from '../src/game/math';
main().catch(error=>{console.error(error);process.exitCode=1;});
