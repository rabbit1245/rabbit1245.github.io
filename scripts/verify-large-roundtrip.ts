import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {verifySaveText} from '../src/game/storage';
import {careerRecordTotals,buildCareerText} from '../src/game/career-text';
const base='test-results/coherence',hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function main(){
 const source=await verifySaveText(await readFile(`${base}/large/career.json`,'utf8')),imported=await verifySaveText(await readFile(`${base}/large-browser/imported.json`,'utf8'));
 assert.notEqual(source.id,imported.id);
 for(const key of Object.keys(source).filter(k=>k!=='id'))assert.equal(hash(source[key as keyof typeof source]),hash(imported[key as keyof typeof imported]),`import/export ${key}`);
 const progressed=await verifySaveText(await readFile(`${base}/large-browser/progressed.json`,'utf8'));assert.equal(progressed.id,imported.id);assert.equal(progressed.season.year,2040);assert.ok(progressed.season.week>0);assert.deepEqual(progressed.player.attributes,source.player.attributes);
 for(const h of source.history){const after=progressed.history.find(r=>r.year===h.year)!;for(const key of ['stats','matches','awards'] as const)assert.equal(hash(after[key]),hash(h[key]),`${h.year} ${key}`);}
 for(const h of source.systems!.national.history){const after=progressed.systems!.national.history.find(r=>r.year===h.year&&r.squad===h.squad&&r.competitionId===h.competitionId)!;assert.equal(hash(after),hash(h),'prior national season');}
 const totals=careerRecordTotals(progressed);assert.ok(buildCareerText(progressed).includes(progressed.player.name));
 const result={sourceBytes:(await stat(`${base}/large/career.json`)).size,allImportedFieldsExceptNewSlotIDIdentical:true,oldSeasons:source.history.length,oldClubStatsMatchesAwardsIdentical:true,oldNationalRecordsIdentical:true,allAttributesIdentical:true,fullValidationAndChecksum:true,progressedYear:progressed.season.year,progressedRound:progressed.season.week,totals};
 await writeFile(`${base}/large-browser/verified-records.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
