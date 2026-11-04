import 'fake-indexeddb/auto';
import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';
import {upgradeAbilityModel,releaseContract} from './engine';import {commandChange} from './command-patches';
import {createCareer} from './engine';import {executeCommand} from './commands';
import {packGameResult} from './worker-result';
import {sealCareer,prepareGameDelta,replayGameDelta,certifyGameDelta,certifiedGameDelta} from './game-delta';
import {saveCareer,saveCareerChange,loadCareer,checkpointCareer,restoreBackup,deleteSlot,validateCareer,validateEngineResult} from './storage';
import type {Career,GameCommand} from './types';import type {BlobCareer,DeltaJournalEntry} from './save-codec';
let sequence=0;
const fresh=(name:string)=>createCareer({name,nationality:'대한민국',age:24,height:180,weight:78,foot:'right',position:'ST',talent:'S',style:'포처',clubId:'KR2_03',squad:'senior',difficulty:'realistic',seed:'delta-'+name,training:[]});
const json=(c:Career)=>JSON.parse(JSON.stringify(c));
async function step(c:Career,command:GameCommand){sealCareer(c);const n=executeCommand(c,command,'delta-command-'+(++sequence));validateEngineResult(c,n);const payload=await prepareGameDelta(packGameResult(c,n));assert.ok(payload);sealCareer(n);certifyGameDelta(c,n,payload);return n;}
async function stored(id:string):Promise<BlobCareer>{return new Promise((resolve,reject)=>{const r=indexedDB.open('kball-careers');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('slots'),q=tx.objectStore('slots').get(id);tx.oncomplete=()=>{db.close();resolve(q.result);};};});}
async function replace(record:BlobCareer){return new Promise<void>((resolve,reject)=>{const r=indexedDB.open('kball-careers');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('slots','readwrite');tx.objectStore('slots').put(record);tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});}

test('real round deltas and later light decisions persist without rewriting the base, with exact load and backup recovery',async()=>{
 let c=sealCareer(fresh('실제 경기와 변경 저장'));await saveCareer(c);const base=await stored(c.id);
 const one=await step(c,{type:'advance',weeks:1});await saveCareerChange(c,one);let record=await stored(c.id);assert.equal(record.format,'kball-blob-v2');assert.equal(record.hash,base.hash);assert.equal(record.revision,base.revision);assert.equal(record.journal.length,1);assert.equal((record.journal[0] as DeltaJournalEntry).kind,'game-delta');assert.deepEqual(await loadCareer(c.id),json(one));
 const two=sealCareer(executeCommand(one,{type:'attributeLock',key:'shooting',locked:true},'delta-light'));await saveCareerChange(one,two);assert.deepEqual(await loadCareer(c.id),json(two));
 c=await step(two,{type:'advance',weeks:1});await saveCareerChange(two,c);record=await stored(c.id);assert.equal(record.journal.length,3);assert.equal(record.hash,base.hash);const restored=await loadCareer(c.id);assert.deepEqual(restored,json(c));validateCareer(restored);
 await checkpointCareer(c.id);assert.equal((await stored(c.id)).journal.length,0);assert.deepEqual(await loadCareer(c.id),json(c));
 const backup=await restoreBackup(c.id);assert.deepEqual(backup.season.matches,json(two).season.matches);assert.deepEqual(backup.systems!.attributeLocks,two.systems!.attributeLocks);await deleteSlot(c.id);
});
test('new match corruption is rejected before a delta is certified; full external validation still rejects an altered old match',async()=>{
 const first=await step(fresh('검사 유지'),{type:'advance',weeks:1});const next=executeCommand(first,{type:'advance',weeks:1},'delta-invalid-new');next.season.matches.at(-1)!.playerStats.goals++;assert.throws(()=>validateEngineResult(first,next),/원장|득점|슈팅|일치|합계/);
 const altered=json(first);altered.season.matches[0].playerStats.goals++;assert.throws(()=>validateCareer(altered),/원장|득점|슈팅|일치|합계/);
 const cloned=executeCommand(first,{type:'advance',weeks:1},'delta-invalid-clone');cloned.season.matches[0]=structuredClone(cloned.season.matches[0]);cloned.season.matches[0].playerStats.goals++;assert.throws(()=>validateEngineResult(first,cloned),/원장|득점|슈팅|일치|합계/);
 assert.throws(()=>{first.season.matches[0].playerStats.goals++;},TypeError,'old validation is reused only on genuinely immutable records');
});
test('corrupt immutable payloads, wrong bases and altered hash chains fail and retain the last good backup',async()=>{
 const c=sealCareer(fresh('손상 복구'));await saveCareer(c);const n=await step(c,{type:'advance',weeks:1});await saveCareerChange(c,n);const record=await stored(c.id),entry=record.journal[0] as DeltaJournalEntry;
 const bytes=new Uint8Array(await entry.payload.blob.arrayBuffer());bytes[Math.floor(bytes.length/2)]^=1;entry.payload.blob=new Blob([bytes]);await replace(record);
 await assert.rejects(loadCareer(c.id));const backup=await restoreBackup(c.id);assert.deepEqual(backup.season.matches,c.season.matches);await deleteSlot(c.id);
 const payload=await prepareGameDelta(packGameResult(c,n));assert.ok(payload);await assert.rejects(replayGameDelta({...c,revision:15},payload),/순서/);assert.throws(()=>certifyGameDelta(c,sealCareer({...n,revision:25}),payload),/기준/);
});
test('concurrent forks and deleted slots cannot be overwritten by a prepared game delta',async()=>{
 const c=sealCareer(fresh('충돌 보호'));await saveCareer(c);const a=await step(c,{type:'advance',weeks:1}),b=await step(c,{type:'advance',weeks:2});const outcomes=await Promise.allSettled([saveCareerChange(c,a),saveCareerChange(c,b)]);assert.equal(outcomes[0].status,'fulfilled');assert.equal(outcomes[1].status,'rejected');assert.deepEqual(await loadCareer(c.id),json(a));await deleteSlot(c.id);await assert.rejects(saveCareerChange(c,b),/삭제/);
});
test('sealing preserves all source values, mutable callers cannot borrow a trusted receipt, and actual no-ops do not create saves',()=>{
 const c=fresh('불필요한 저장 없음'),before=JSON.stringify(c);sealCareer(c);assert.equal(JSON.stringify(c),before);assert.equal(certifiedGameDelta(c,{...c}),undefined);assert.equal(executeCommand(c,{type:'dismissChoice'},'no-change'),c);assert.equal(executeCommand(c,{type:'upgradeAbilities'},'already-modern'),c);
});


test('multi-round revision jumps remain one atomic durable command and replay exactly',async()=>{
 const c=sealCareer(fresh('반시즌 리비전'));await saveCareer(c);const next=await step(c,{type:'advance',weeks:3});assert.ok(next.revision>c.revision+1);await saveCareerChange(c,next);const entry=(await stored(c.id)).journal[0];assert.equal(entry.previousRevision,c.revision);assert.equal(entry.revision,next.revision);assert.deepEqual(await loadCareer(c.id),json(next));await deleteSlot(c.id);
});


test('actual offseason contracts and voluntary FA use small durable patches with identical world, wage and club records after reload',async()=>{
 const raw=JSON.parse(gunzipSync(await readFile(new URL('../../tests/fixtures/v272-offseason.json.gz',import.meta.url))).toString('utf8')).career as Career;
 let c=upgradeAbilityModel(raw);c=executeCommand(c,{type:'attributeLock',key:'passing',locked:false},'repair-before-contract');sealCareer(c);validateCareer(c);await saveCareer(c);const base=await stored(c.id);assert.ok(c.offers.length);
 const next=executeCommand(c,{type:'transfer',offerId:c.offers[0].id},'local-contract');validateEngineResult(c,next);sealCareer(next);assert.ok(commandChange(c,next));await saveCareerChange(c,next);assert.equal((await stored(c.id)).hash,base.hash);assert.deepEqual(await loadCareer(c.id),json(next));
 const fa=executeCommand(next,{type:'releaseContract'},'local-fa');validateEngineResult(next,fa);sealCareer(fa);assert.ok(commandChange(next,fa));await saveCareerChange(next,fa);assert.equal((await stored(c.id)).hash,base.hash);assert.deepEqual(await loadCareer(c.id),json(fa));assert.equal(fa.player.clubId,'FA');
 const before=await stored(c.id);await saveCareerChange(fa,fa);assert.equal((await stored(c.id)).writeId,before.writeId);await deleteSlot(c.id);
});


test('retirement carries all prior events and annual records through the new durable result path',async()=>{
 const start=sealCareer(fresh('은퇴 원장 보존'));await saveCareer(start);const played=await step(start,{type:'advance',weeks:2});await saveCareerChange(start,played);const retired=await step(played,{type:'retire'});await saveCareerChange(played,retired);assert.equal(retired.stage,'retired');assert.deepEqual(await loadCareer(start.id),json(retired));await deleteSlot(start.id);
});
