import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { createCareer,advanceCareer,startNextSeason,stayAtClub,setTraining,overall,respondToCaptainOffer } from '../src/game/engine';
import { FIELD_ATTRIBUTES,PLAY_STYLES } from '../src/game/attributes';
import { CLUBS } from '../src/game/data';
import { beginGrowthSeason } from '../src/game/growth';
import { getCaptainAssessment } from '../src/game/captain';
import { exportCareer,validateCareer } from '../src/game/storage';

async function validateExamples(career:ReturnType<typeof createCareer>,directory:string){
  const offer=career.systems!.leadership.offers!.find(o=>o.scope==='club'&&o.status==='pending')!;
  assert.ok(offer);
  const mismatch=structuredClone(career);
  mismatch.systems!.leadership.offers!.find(o=>o.id===offer.id)!.assessment.eligibleRole='vice';
  assert.throws(()=>validateCareer(mismatch),/평가 대상·역할/);
  const impossibleMinutes=structuredClone(career),assessment=impossibleMinutes.systems!.leadership.offers!.find(o=>o.id===offer.id)!.assessment;
  assessment.recentMinutes=assessment.recentApps*90+1;
  assert.throws(()=>validateCareer(impossibleMinutes),/최근 출전 기록/);
  const accepted=respondToCaptainOffer(career,offer.id,true);
  validateCareer(accepted);
  accepted.systems!.leadership.terms=accepted.systems!.leadership.terms.filter(t=>!(t.scope===offer.scope&&t.teamId===offer.teamId&&t.role===offer.role&&t.startYear===career.season.year));
  assert.throws(()=>validateCareer(accepted),/임기 기록/);
  const completed=['proposal/assessment role mismatch rejected','impossible recent minutes rejected','legitimate acceptance validates','accepted proposal without its formal term rejected'];
  await writeFile(`${directory}/captain-storage-report.json`,JSON.stringify({completed},null,2));
  console.log(JSON.stringify({storageChecks:completed},null,2));
}
async function main(){
const directory=process.env.KBALL_CAPTAIN_RESULTS_DIR||'test-results/v22';
if(process.env.KBALL_CAPTAIN_VALIDATE_ONLY==='1')return validateExamples(JSON.parse(await readFile(`${directory}/captain-offer.json`,'utf8')).career,directory);
// Controlled initial talent creates a reachable UI state. Every appearance, score,
// date and performance in this fixture is calculated by the real engine below.
const club=CLUBS.filter(c=>c.leagueId==='KR2').sort((a,b)=>a.power-b.power)[0];
assert.ok(club,'a real K League 2 club is required');
let career=createCareer({name:'주장 제의 브라우저 검증',nationality:'대한민국',age:27,height:185,weight:80,foot:'right',position:'ST',talent:'SSS',style:PLAY_STYLES.ST[0],clubId:club.id,squad:'senior',difficulty:'realistic',seed:'captain-browser-v22',intensity:'rest'});
for(const key of FIELD_ATTRIBUTES)career.player.attributes[key]=90;
career.player.ovr=overall(career.player);career.player.potential=99;
career.managerTrust=90;
career.season.attributeStart={...career.player.attributes};career.season.ovrStart=career.player.ovr;
career.systems!.leadership.trait=95;career.systems!.leadership.baseTrait=95;
beginGrowthSeason(career);
career.systems!.world.players[career.player.id].ovr=career.player.ovr;
career.systems!.world.players[career.player.id].potential=career.player.potential;
validateCareer(career);
for(let year=0;year<3;year++){
  career=advanceCareer(career,120);
  assert.equal(career.stage,'offseason');validateCareer(career);
  const pending=career.systems!.leadership.offers?.find(o=>o.scope==='club'&&o.status==='pending');
  if(pending?.role==='captain')break;
  // Declining a vice proposal exercises a normal decision; captain consideration
  // occurs afresh in a subsequent season after genuine tenure has accumulated.
  if(pending)career=respondToCaptainOffer(career,pending.id,false);
  career=startNextSeason(setTraining(stayAtClub(career),career.training,career.intensity));
  if(career.systems!.leadership.offers?.some(o=>o.scope==='club'&&o.role==='captain'&&o.status==='pending'))break;
}
const offer=career.systems!.leadership.offers?.find(o=>o.scope==='club'&&o.status==='pending');
assert.ok(offer,JSON.stringify(getCaptainAssessment(career,'club')));
assert.equal(offer.role,'captain',JSON.stringify(getCaptainAssessment(career,'club')));
assert.equal(career.systems!.leadership.clubRole,'none');
assert.ok(career.history.length>=2);
assert.ok(offer.assessment.apps>=40);
assert.ok(offer.assessment.recentMinutes>=360);
validateCareer(career);
await mkdir(directory,{recursive:true});
await writeFile(`${directory}/captain-offer.json`,await exportCareer(career));
await writeFile(`${directory}/captain-fixture-provenance.json`,JSON.stringify({controlledInitialAttributes:90,controlledInitialLeadership:95,controlledInitialTrust:90,syntheticHistoricalMatches:false,clubId:club.id,completedSeasons:career.history.length,clubMatches:career.history.reduce((sum,h)=>sum+h.matches.length,0),offer},null,2));
await validateExamples(career,directory);
console.log(JSON.stringify({fixture:`${directory}/captain-offer.json`,completedSeasons:career.history.length,assessment:offer.assessment},null,2));

}
main().catch(error=>{console.error(error);process.exitCode=1;});
