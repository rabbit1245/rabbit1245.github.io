import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createCareer,advanceHalf,overall,setAllAttributeLocks,retireCareer,ENGINE_VERSION} from '../src/game/engine';
import {FIELD_ATTRIBUTES} from '../src/game/attributes';
import {beginGrowthSeason} from '../src/game/growth';
import {emptyStats} from '../src/game/math';
import {evaluateAwards} from '../src/game/career-systems';
import {cupLedger,processClubCompetitions} from '../src/game/club-competitions';
import {evaluateClubAwards} from '../src/game/club-awards';
import {exportCareer,verifySaveText,validateCareer} from '../src/game/storage';
import {buildCareerText} from '../src/game/career-text';
import {seasonHonours} from '../src/game/honours';

async function main(){
  const out=process.env.KBALL_AWARDS_DIR||'test-results/release-2.9.5';await mkdir(`${out}/fixtures`,{recursive:true});
  let c=createCareer({name:'유럽 수상 검수',nationality:'포르투갈',age:26,height:183,weight:78,foot:'right',position:'ST',talent:'SSS',style:'포처',clubId:'ES1_01',squad:'senior',difficulty:'realistic',seed:'europe-awards-295',training:[]});
  for(const key of FIELD_ATTRIBUTES)c.player.attributes[key]=98;
  c.player.ovr=overall(c.player);c.player.potential=Math.max(c.player.potential,c.player.ovr);c.season.attributeStart={...c.player.attributes};c.season.ovrStart=c.player.ovr;
  beginGrowthSeason(c);c.systems!.firstHalfSnapshot={attributes:{...c.player.attributes},stats:emptyStats(),ovr:c.player.ovr,value:c.systems!.economics.marketValue,round:0};c=setAllAttributeLocks(c,true);
  const attrs={...c.player.attributes};c=advanceHalf(advanceHalf(c));validateCareer(c);assert.deepEqual(c.player.attributes,attrs);
  const cups=cupLedger(c,c.season.year);assert.ok(cups.every(t=>t.phase==='completed'));
  const ucl=cups.find(t=>t.id.startsWith('UCL:'))!;assert.ok(ucl.playerStats?.[c.player.id]);
  for(const t of cups)for(const a of evaluateClubAwards(c,t).awards)assert.ok(c.awards.some(stored=>stored.id===a.id),`${a.name}: completed cup did not store the adjudicated award`);
  const added=c.awards.filter(a=>a.name==='라리가 시즌 최우수 선수'||/^U(?:CL|EL|ECL):.*:(top-scorer|season-eleven):/.test(a.id));assert.ok(added.length>0);
  const before=JSON.stringify(c);processClubCompetitions(c);evaluateAwards(c);assert.equal(JSON.stringify(c),before,'completion and season evaluations are idempotent');
  for(const a of added){assert.ok(c.history[0].awards.some(x=>x.id===a.id));assert.ok(seasonHonours(c,c.season.year).personal.some(x=>x.id===a.id));assert.ok(buildCareerText(c).includes(a.name));}
  const text=await exportCareer(c);await writeFile(`${out}/fixtures/season.json`,text);const loaded=await verifySaveText(text);assert.deepEqual(loaded.awards,JSON.parse(JSON.stringify(c.awards)));
  const retired=retireCareer(c);validateCareer(retired);for(const a of added)assert.ok(buildCareerText(retired).includes(a.name));await writeFile(`${out}/fixtures/retired.json`,await exportCareer(retired));
  const report={version:ENGINE_VERSION,year:c.season.year,clubId:c.player.clubId,actualWholeWorldSeason:true,league:{apps:c.season.playerStats.apps,goals:c.season.playerStats.goals,assists:c.season.playerStats.assists},ucl:{apps:ucl.playerStats![c.player.id].stats.apps,goals:ucl.playerStats![c.player.id].stats.goals,participants:Object.keys(ucl.playerStats!).length},newAwards:added.map(a=>({id:a.id,name:a.name,description:a.description})),completedCups:cups.length,abilitiesUnchanged:true,completionIdempotent:true,archive:true,seasonHonours:true,JSONRoundTrip:true,retirementTXT:true};
  await writeFile(`${out}/actual-season.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
