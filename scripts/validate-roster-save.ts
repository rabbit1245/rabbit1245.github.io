/** Optional large-save compatibility check; never writes the source save. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import assert from 'node:assert/strict';
import {initializeSystems} from '../src/game/systems';
import {getClubWorldPower} from '../src/game/world';
import {validateCareer,exportCareer} from '../src/game/storage';
async function main(){
if(!globalThis.crypto?.subtle)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
const source=process.argv[2]??'test-results/long-career-30-seasons.json';
const bytes=readFileSync(source),envelope=JSON.parse(bytes.toString()),c=envelope.career;
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
assert.equal(JSON.parse(await exportCareer(c)).hash,envelope.hash,'original envelope checksum');validateCareer(c);
const protectedData=()=>({player:c.player,season:c.season,history:c.history,awards:c.awards,transfers:c.transfers,
 national:c.systems.national,economics:c.systems.economics,leadership:c.systems.leadership,growth:c.systems.growthReports,
 rankings:c.systems.rankings,fixtures:c.systems.world.competitions,playerStats:c.systems.world.playerStats,movements:c.systems.world.movements,
 allNPCs:c.systems.world.players});
const before=digest(protectedData()),clubs=['DE1_09','DE1_02','ES1_18','ES1_02'];
const strengthBefore=Object.fromEntries(clubs.map(id=>[id,getClubWorldPower(c,id)]));
initializeSystems(c);assert.equal(digest(protectedData()),before);validateCareer(c);
const once=digest(c);initializeSystems(c);assert.equal(digest(c),once,'one-time repair');
assert.equal(createHash('sha256').update(readFileSync(source)).digest('hex'),createHash('sha256').update(bytes).digest('hex'));
const result={source,bytes:bytes.length,seasons:c.history.length,originalHash:envelope.hash,originalHashValid:true,protectedDataHash:before,
 protectedDataUnchanged:true,idempotent:true,sourceFileUnchanged:true,rosterVersion:c.systems.world.rosterVersion,strengthBefore,
 strengthAfter:Object.fromEntries(clubs.map(id=>[id,getClubWorldPower(c,id)])),event:c.systems.events.find((e:any)=>e.id==='roster-calibration-2')};
mkdirSync('test-results/v231',{recursive:true});writeFileSync('test-results/v231/old-save-validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
