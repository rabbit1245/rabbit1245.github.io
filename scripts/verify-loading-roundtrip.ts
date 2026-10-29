import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {verifySaveText} from '../src/game/storage';
import {canonicalBytes} from '../src/game/canonical-bytes';
import {jsonBlob} from '../src/game/json-blob';
import {careerRecordTotals,buildCareerText} from '../src/game/career-text';
import type {Career} from '../src/game/types';
const base='test-results/loading-2.11.2',hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function main(){
 let source:Career|undefined=await verifySaveText(await readFile('test-results/coherence/large/career.json','utf8'));
 const afterFile=`${base}/after/progressed.json`,after=await verifySaveText(await readFile(afterFile,'utf8'));
 for(const h of source.history){const row=after.history.find(r=>r.year===h.year)!;for(const key of ['stats','matches','awards'] as const)assert.equal(hash(row[key]),hash(h[key]),`old ${h.year} ${key}`);}
 for(const h of source.systems!.national.history){const row=after.systems!.national.history.find(r=>r.year===h.year&&r.squad===h.squad&&r.competitionId===h.competitionId)!;assert.equal(hash(row),hash(h),'old national records');}
 assert.deepEqual(after.player.attributes,source.player.attributes);
 const oldSeasons=source.history.length;source=undefined;global.gc?.();
 const before=await verifySaveText(await readFile(`${base}/before/progressed.json`,'utf8'));
 assert.deepEqual(after.season.playerStats,before.season.playerStats,'same actual new season player stats');
 assert.equal(hash(after.season.matches),hash(before.season.matches),'same new season match events');
 assert.equal(hash(after.season.table),hash(before.season.table),'same league outcomes');
 const totals=careerRecordTotals(after);assert.ok(buildCareerText(after).includes(after.player.name));
 const envelope=JSON.parse(await readFile(afterFile,'utf8'));
 assert.equal(createHash('sha256').update(canonicalBytes(envelope.career)).digest('hex'),envelope.hash,'full canonical checksum');
 const expected=createHash('sha256').update(await readFile(afterFile)).digest('hex'),actual=createHash('sha256');
 for await(const chunk of jsonBlob(envelope).stream())actual.update(chunk);
 assert.equal(actual.digest('hex'),expected,'streamed JSON is byte-identical to exported JSON');
 assert.equal(expected,hash(envelope),'large export is byte-identical to native JSON.stringify');
 const result={sourceSeasons:oldSeasons,exportedBytes:(await stat(afterFile)).size,allOldClubStatsMatchesAwardsIdentical:true,allOldNationalRecordsIdentical:true,allAttributesIdentical:true,newSeasonStatsIdenticalToOldEngine:true,newSeasonEventsIdenticalToOldEngine:true,leagueTableIdenticalToOldEngine:true,fullValidationAndCanonicalChecksum:true,plainJSONByteHash:expected,totals};
 await writeFile(`${base}/records-verified.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
