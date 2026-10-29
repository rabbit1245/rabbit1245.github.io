import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {validateCareer,exportCareer,verifySaveText} from '../src/game/storage';
import {evaluateAwards} from '../src/game/career-systems';
import {buildCareerText,careerRecordTotals} from '../src/game/career-text';
import type {Career} from '../src/game/types';
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function zipped(file:string):Promise<Career>{return validateCareer(JSON.parse(gunzipSync(await readFile(file)).toString()),true);}
async function main(){
 const rejudged=[];
 for(const position of ['CB','RWB']){
  const c=await zipped(`test-results/defender-2113/before/champions.json-${position}-ES1_01.json.gz`),old=hash({awards:c.awards,rankings:c.systems!.rankings}),before=c.systems!.rankings.at(-1)!.playerRank;
  evaluateAwards(c);assert.equal(hash({awards:c.awards,rankings:c.systems!.rankings}),old,'already adjudicated user seasons remain unchanged');
  const matches=hash(c.season.matches),world=hash(c.systems!.world.playerStats),copy=structuredClone(c);copy.awards=[];copy.systems!.rankings=[];
  evaluateAwards(copy);assert.equal(hash(copy.season.matches),matches);assert.equal(hash(copy.systems!.world.playerStats),world);
  rejudged.push({position,before,after:copy.systems!.rankings[0].playerRank,diagnostic:copy.systems!.rankings[0].diagnostics!.find(d=>d.name==='발롱도르'),sameActualMatchesAndNPCStats:true,existingSavedJudgementUnchanged:true,analysisOnly:true});
 }
 const current=await zipped('test-results/defender-2113/actual-final.json-CB-ES1_01.json.gz'),json=await exportCareer(current),restored=await verifySaveText(json);
 assert.equal(hash(restored),hash(JSON.parse(JSON.stringify(current))),'all new defender data survives JSON round trip');
 const totals=careerRecordTotals(restored),text=buildCareerText(restored);assert.ok(totals.club.cleanSheets>0);assert.ok(text.includes('무실점 경기'));assert.ok(text.includes(restored.player.name));
 const source=await verifySaveText(await readFile('test-results/coherence/large/career.json','utf8')),imported=await verifySaveText(await readFile('test-results/defender-2113/large-imported.json','utf8'));
 for(const key of Object.keys(source).filter(k=>k!=='id'))assert.equal(hash(source[key as keyof Career]),hash(imported[key as keyof Career]),`large old career ${key}`);
 const report={rejudged,currentCareer:{position:current.player.position,ovr:current.player.ovr,ballonRank:current.systems!.rankings.at(-1)!.playerRank,leagueCleanSheets:current.season.playerStats.cleanSheets,clubCleanSheets:totals.club.cleanSheets,nationalCleanSheets:totals.national.cleanSheets,JSONRoundTripAllFields:true,fullValidationAndChecksum:true,KoreanTXT:true},oldLargeCareer:{seasons:source.history.length,bytes:(await readFile('test-results/coherence/large/career.json')).byteLength,allFieldsExceptNewSlotIDIdentical:true,legacyAdjudicationPreserved:true}};
 await writeFile('test-results/defender-2113/verified-records.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
