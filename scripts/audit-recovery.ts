import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readRecoveryArchive} from '../src/game/recovery-archive';
import {decodeStored} from '../src/game/save-codec';
import {canonicalHash} from '../src/game/canonical-bytes';
import {MAX_SAVE_BYTES} from '../src/game/save-limits';
async function main(){
 const [file,output,count,nationalCount]=process.argv.slice(2);if(!file||!output)throw Error('Usage: node --import tsx scripts/audit-recovery.ts archive output.json [preserved-history-count] [preserved-national-history-count]');
 const bytes=await readFile(file),record=await readRecoveryArchive(new Blob([bytes])),{career:c}=await decodeStored(record);
 const history=c.history.slice(0,count?Number(count):c.history.length),national=c.systems?.national.history.slice(0,nationalCount?Number(nationalCount):undefined)??[];
 const summary={archiveSHA256:createHash('sha256').update(bytes).digest('hex'),archiveBytes:bytes.length,id:c.id,revision:c.revision,age:c.player.age,year:c.season.year,week:c.season.week,stage:c.stage,historyCount:c.history.length,preservedHistoryCount:history.length,preservedHistoryHash:canonicalHash(history,MAX_SAVE_BYTES),clubMatches:history.reduce((s,h)=>s+h.matches.length,0),nationalHistoryCount:c.systems?.national.history.length,preservedNationalHistoryCount:national.length,preservedNationalHistoryHash:canonicalHash(national,MAX_SAVE_BYTES)};
 await writeFile(output,JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
