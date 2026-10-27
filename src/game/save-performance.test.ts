import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createCareer} from './engine';
import {PLAY_STYLES} from './attributes';
import {executeCommand} from './commands';
import {commandChange,applyCareerPatches} from './command-patches';
import {saveCareer,saveCareerChange,loadCareer,restoreBackup,deleteSlot,checkpointCareer,validateCareer,exportCareer} from './storage';
import type {Career,GameCommand} from './types';
import type {BlobCareer} from './save-codec';
if(!globalThis.crypto?.subtle)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
const base=createCareer({name:'저장 성능 검증',age:23,nationality:'대한민국',height:180,weight:75,foot:'right',position:'ST',talent:'S',style:PLAY_STYLES.ST[0],clubId:'KR2_01',squad:'senior',difficulty:'realistic',seed:'durable-light-commands'});
const fresh=(id:string)=>({...structuredClone(base),id:'performance-'+id});let commandIndex=0;
const step=(c:Career,command:GameCommand)=>executeCommand(c,command,'perf-command-'+(++commandIndex));
const json=(c:Career)=>JSON.parse(JSON.stringify(c));
async function stored(id:string):Promise<BlobCareer>{return new Promise((resolve,reject)=>{const r=indexedDB.open('kball-careers');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('slots'),get=tx.objectStore('slots').get(id);tx.oncomplete=()=>{db.close();resolve(get.result);};};});}
async function replace(record:unknown){return new Promise<void>((resolve,reject)=>{const r=indexedDB.open('kball-careers');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('slots','readwrite');tx.objectStore('slots').put(record);tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});}
test('light controls durably replay every field without replacing the large snapshot',async()=>{
 let c=fresh('all-controls');await saveCareer(c);const first=await stored(c.id),originalWorld=JSON.stringify(c.systems!.world);
 const controls:GameCommand[]=[{type:'attributeLock',key:'shooting',locked:true},{type:'manualAging',key:'shooting',amount:5},{type:'cheatSettings',enabled:true,freezeAging:true},{type:'increaseAttribute',key:'passing',amount:5},{type:'attributeLockAll',locked:false}];
 for(let i=0;i<controls.length;i++){
  const next=step(c,controls[i]);assert.ok(commandChange(c,next),controls[i].type);await saveCareerChange(c,next);c=next;
  const record=await stored(c.id);assert.equal(record.format,'kball-blob-v1');assert.equal(record.hash,first.hash);assert.equal(record.revision,first.revision);assert.equal(record.journal.length,i+1);
  const loaded=await loadCareer(c.id);assert.deepEqual(loaded,json(c),controls[i].type);validateCareer(loaded);
 }
 assert.equal(JSON.stringify(c.systems!.world),originalWorld);assert.deepEqual(c.season.playerStats,base.season.playerStats);
 await checkpointCareer(c.id);const compacted=await stored(c.id);assert.equal(compacted.journal.length,0);assert.equal(compacted.revision,c.revision);assert.deepEqual(await loadCareer(c.id),json(c));await deleteSlot(c.id);
});
test('compaction retains the previous logical revision as backup and identical autosaves keep it',async()=>{
 const initial=fresh('backup');await saveCareer(initial);const one=step(initial,{type:'attributeLock',key:'shooting',locked:true});await saveCareerChange(initial,one);
 const two=step(one,{type:'manualAging',key:'shooting',amount:5});await saveCareerChange(one,two);await checkpointCareer(two.id);await saveCareer(two);
 const restored=await restoreBackup(two.id);assert.deepEqual(restored.player.attributes,one.player.attributes);assert.deepEqual(restored.systems?.attributeLocks,one.systems?.attributeLocks);assert.ok(restored.revision>two.revision);
 const undo=await restoreBackup(two.id);assert.deepEqual(undo.player.attributes,two.player.attributes);await deleteSlot(two.id);
});
test('corrupt write-ahead records fail validation and restore without displacing the good backup',async()=>{
 const initial=fresh('corrupt');await saveCareer(initial);const next=step(initial,{type:'attributeLock',key:'shooting',locked:true});await saveCareerChange(initial,next);
 const record=await stored(next.id);record.journal[0].patches.push({path:['player','ovr'],op:'set',value:99});await replace(record);
 await assert.rejects(loadCareer(next.id),/손상/);const restored=await restoreBackup(next.id);assert.deepEqual(restored.player.attributes,initial.player.attributes);assert.ok(restored.revision>next.revision);await deleteSlot(next.id);
});
test('a changed engine receipt falls back to full validation instead of persisting a malformed delta',async()=>{
 const initial=fresh('tampered');await saveCareer(initial);const next=step(initial,{type:'attributeLock',key:'shooting',locked:true});next.player.attributes.shooting=-1;
 assert.equal(commandChange(initial,next),undefined);await assert.rejects(saveCareerChange(initial,next));assert.deepEqual(await loadCareer(initial.id),json(initial));await deleteSlot(initial.id);
});
test('parallel forks cannot overwrite the first durable light command',async()=>{
 const initial=fresh('parallel');await saveCareer(initial);const a=step(initial,{type:'attributeLock',key:'shooting',locked:true}),b=step(initial,{type:'attributeLock',key:'passing',locked:true});
 const outcomes=await Promise.allSettled([saveCareerChange(initial,a),saveCareerChange(initial,b)]);assert.equal(outcomes[0].status,'fulfilled');assert.equal(outcomes[1].status,'rejected');assert.deepEqual(await loadCareer(initial.id),json(a));await deleteSlot(initial.id);
});
test('a checkpoint overlapping a new command preserves the newer head and its backup',async()=>{
 const initial=fresh('overlap');await saveCareer(initial);const a=step(initial,{type:'attributeLock',key:'shooting',locked:true});await saveCareerChange(initial,a);
 const checkpoint=checkpointCareer(initial.id),b=step(a,{type:'manualAging',key:'shooting',amount:1});await saveCareerChange(a,b);await checkpoint;
 assert.deepEqual(await loadCareer(initial.id),json(b));const restored=await restoreBackup(initial.id);assert.deepEqual(restored.player.attributes,a.player.attributes);await deleteSlot(initial.id);
});
test('an external tab update blocks a local journal even if metadata is stale',async()=>{
 const initial=fresh('external');await saveCareer(initial);const remote={...structuredClone(initial),revision:initial.revision+1};remote.player.name='다른 탭';await replace({id:initial.id,envelope:JSON.parse(await exportCareer(remote))});
 const local=step(initial,{type:'attributeLock',key:'shooting',locked:true});await assert.rejects(saveCareerChange(initial,local),/다른 탭/);assert.deepEqual(await loadCareer(initial.id),remote);await deleteSlot(initial.id);
});
test('malformed patch paths cannot alter prototypes and deleted slots cannot be revived',async()=>{
 const initial=fresh('delete');await saveCareer(initial);const next=step(initial,{type:'attributeLock',key:'shooting',locked:true});await deleteSlot(initial.id);await assert.rejects(saveCareerChange(initial,next),/삭제/);
 assert.throws(()=>applyCareerPatches(initial,[{path:['__proto__','polluted'],op:'set',value:true}]),/경로/);assert.equal(({} as any).polluted,undefined);
});

test('offseason training confirmation uses the same durable change path',async()=>{
 const initial=JSON.parse(gunzipSync(readFileSync(new URL('../../tests/fixtures/v272-offseason.json.gz',import.meta.url))).toString('utf8')).career as Career;initial.id='performance-training';assert.equal(initial.stage,'offseason');await saveCareer(initial);
 const upgraded=step(initial,{type:'attributeLock',key:'passing',locked:false});assert.equal(commandChange(initial,upgraded),undefined,'the one-off old-world repair requires a fully validated snapshot');await saveCareerChange(initial,upgraded);assert.equal(initial.systems!.world.balanceVersion,undefined,'original old save stays intact');
 const next=step(upgraded,{type:'training',keys:[],intensity:'rest'});assert.ok(commandChange(upgraded,next));await saveCareerChange(upgraded,next);assert.deepEqual(await loadCareer(initial.id),json(next));await deleteSlot(initial.id);
});
test('a modified previous mutable state cannot inherit a trusted incremental receipt',async()=>{
 const initial=fresh('previous-tampered');await saveCareer(initial);initial.player.attributes.shooting=-1;
 const next=step(initial,{type:'attributeLock',key:'passing',locked:true});await assert.rejects(saveCareerChange(initial,next));await deleteSlot(initial.id);
});
