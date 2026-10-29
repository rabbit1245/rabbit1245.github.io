/** Continue an actual world career beyond the former 256MiB guard; no record padding. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {advanceHalf,startNextSeason,acceptTransfer,ENGINE_VERSION} from '../src/game/engine';
import {verifySaveText,prepareEnvelope} from '../src/game/storage';
import {packStored,decodeStored} from '../src/game/save-codec';
import {jsonBlob} from '../src/game/json-blob';
import {careerRecordTotals,buildCareerText} from '../src/game/career-text';
const out='test-results/coherence/large',input=process.env.KBALL_LARGE_SOURCE??'test-results/release-2.11.0/long-browser/eight-seasons.json';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function main(){await mkdir(out,{recursive:true});let c=await verifySaveText(await readFile(input,'utf8'));const attrs={...c.player.attributes},old=c.history.map(h=>({year:h.year,stats:hash(h.stats),matches:hash(h.matches),awards:hash(h.awards)})),clubId=c.player.clubId,rows=[];
 console.log('START',c.stage,c.history.length,c.season.year);
 while(c.history.length<14){
  if(c.stage==='offseason'){const renew=c.offers.find(o=>o.clubId===clubId);assert.ok(renew);c=acceptTransfer(c,renew.id);c=startNextSeason(c);}
  c=advanceHalf(c);if(c.stage==='season')c=advanceHalf(c);assert.equal(c.stage,'offseason');assert.deepEqual(c.player.attributes,attrs);
  const row={year:c.season.year,seasons:c.history.length,goals:c.season.playerStats.goals,value:c.systems!.economics.marketValue,role:c.offers.find(o=>o.clubId===clubId)?.role,memory:process.memoryUsage()};rows.push(row);console.log(JSON.stringify(row));await writeFile(`${out}/progress.json`,JSON.stringify(rows,null,2));global.gc?.();
 }
 for(const prior of old){const h=c.history.find(h=>h.year===prior.year)!;assert.equal(hash(h.stats),prior.stats);assert.equal(hash(h.matches),prior.matches);assert.equal(hash(h.awards),prior.awards);}
 const envelope=await prepareEnvelope(c,true),blob=jsonBlob(envelope);assert.ok(blob.size>256*1024*1024);await writeFile(`${out}/career.json`,new Uint8Array(await blob.arrayBuffer()));
 const packed=await packStored(envelope);assert.equal(packed.record.encoding,'gzip');const decoded=await decodeStored(packed.record);assert.deepEqual(careerRecordTotals(decoded.career),careerRecordTotals(c));assert.equal(buildCareerText(decoded.career),buildCareerText(c));await writeFile(`${out}/career.txt`,buildCareerText(c));
 const result={version:ENGINE_VERSION,actualSeasons:c.history.length,source:input,JSONBytes:blob.size,compressedBytes:packed.record.blob.size,compressedRatio:packed.record.blob.size/blob.size,oldRecordsPreserved:true,allAttributesPreserved:true,fullValidationAndOriginalChecksum:true,compressedDecode:true,totalsAndTXTEqual:true,rows};await writeFile(`${out}/results.json`,JSON.stringify(result,null,2));console.log('FINAL',JSON.stringify(result));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
