import 'fake-indexeddb/auto';import test from 'node:test';import assert from 'node:assert/strict';
import {createCareer} from './engine';import {executeCommand} from './commands';
import {saveCareer,saveCareerChange,loadCareer,exportRecoveryArchive,recoverBackupToNewSlot,deleteSlot,listSlots} from './storage';
import {RECOVERY_MAGIC} from './recovery-archive';
import type {BlobCareer} from './save-codec';
async function slot(id:string):Promise<BlobCareer>{return new Promise((resolve,reject)=>{const r=indexedDB.open('kball-careers');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction('slots'),q=t.objectStore('slots').get(id);t.oncomplete=()=>{db.close();resolve(q.result);};};});}
async function replace(record:BlobCareer){return new Promise<void>((resolve,reject)=>{const r=indexedDB.open('kball-careers');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction('slots','readwrite');t.objectStore('slots').put(record);t.oncomplete=()=>{db.close();resolve();};t.onabort=()=>reject(t.error);};});}
test('failed loads can export exact corrupt bytes and recover the verified backup as a separate slot without overwriting either original',async()=>{
 const c=createCareer({name:'스이쿤 복구 검수',nationality:'대한민국',age:35,height:180,weight:77,foot:'right',position:'CDM',talent:'S',style:'앵커맨',clubId:'DE1_03',squad:'senior',difficulty:'realistic',seed:'recovery-safety'});await saveCareer(c);
 const next=executeCommand(c,{type:'attributeLock',key:'passing',locked:true},'recovery-next');await saveCareerChange(c,next);
 const broken=await slot(c.id);broken.encoding='gzip';broken.rawBytes=100;broken.blob=new Blob(['intentionally broken gzip']);await replace(broken);
 await assert.rejects(loadCareer(c.id),/스냅샷.*읽을 수 없습니다.*압축 해제/);
 const archive=await exportRecoveryArchive(c.id),magic=new TextEncoder().encode(RECOVERY_MAGIC),header=new DataView(await archive.slice(magic.length,magic.length+4).arrayBuffer()),length=header.getUint32(0,true),manifest=JSON.parse(await archive.slice(magic.length+4,magic.length+4+length).text());
 assert.equal(await archive.slice(0,magic.length).text(),RECOVERY_MAGIC);assert.equal(manifest.current.data.id,c.id);assert.equal(manifest.metadata.playerName,c.player.name);
 let offset=magic.length+4+length;const payloads=[];for(const p of manifest.parts){payloads.push(archive.slice(offset,offset+p.bytes));offset+=p.bytes;}assert.equal(offset,archive.size);
 assert.equal(await payloads[manifest.current.data.blob.index].text(),'intentionally broken gzip');
 const recovered=await recoverBackupToNewSlot(c.id);assert.notEqual(recovered.id,c.id);assert.match(recovered.id,/^recovered-/);assert.equal(recovered.player.name,c.player.name);assert.deepEqual((await loadCareer(recovered.id)).player,c.player);
 const original=await slot(c.id);assert.equal(await original.blob.text(),'intentionally broken gzip');assert.equal(original.writeId,broken.writeId);await assert.rejects(loadCareer(c.id),/압축 해제/);
 assert.equal((await listSlots()).filter(s=>s.playerName===c.player.name).length,2);await deleteSlot(c.id);await deleteSlot(recovered.id);
});

test('exported archives round-trip exact records; malformed framing is rejected before decoding',async()=>{
 const {recoveryArchive,readRecoveryArchive}=await import('./recovery-archive');
 const raw=new Blob(['original bytes'],{type:'application/json'});
 const record:BlobCareer={id:'archive-fixture',format:'kball-blob-v2',revision:1,hash:'a'.repeat(64),versionHash:'a'.repeat(64),writeId:'original',blob:raw,journal:[]};
 const archive=recoveryArchive({current:record});const restored=await readRecoveryArchive(archive) as BlobCareer;
 assert.equal(restored.id,record.id);assert.equal(restored.writeId,record.writeId);assert.equal(await restored.blob.text(),await raw.text());
 await assert.rejects(readRecoveryArchive(archive,'backup'),/없습니다/);
 await assert.rejects(readRecoveryArchive(archive.slice(0,archive.size-1)),/구조/);
 await assert.rejects(readRecoveryArchive(new Blob([archive,'extra'])),/구조/);
 await assert.rejects(readRecoveryArchive(new Blob(['not an archive'])),/구조/);
 const oversized=new Uint8Array(4);new DataView(oversized.buffer).setUint32(0,0xffffffff,true);
 await assert.rejects(readRecoveryArchive(new Blob([RECOVERY_MAGIC,oversized])),/구조/);
});

test('archive import validates the current save and creates a separate slot without changing the source',async()=>{
 const {importCareer}=await import('./storage');
 const c=createCareer({name:'원본 보존 검수',nationality:'대한민국',age:35,height:180,weight:77,foot:'right',position:'CDM',talent:'S',style:'앵커맨',clubId:'DE1_03',squad:'senior',difficulty:'realistic',seed:'archive-import-safety'});await saveCareer(c);
 const before=await slot(c.id),archive=await exportRecoveryArchive(c.id),imported=await importCareer(archive);
 assert.notEqual(imported.id,c.id);assert.deepEqual({...imported,id:c.id},c);await saveCareer(imported);
 assert.deepEqual(await loadCareer(c.id),c);assert.equal((await slot(c.id)).writeId,before.writeId);
 assert.deepEqual(await loadCareer(imported.id),imported);await deleteSlot(c.id);await deleteSlot(imported.id);
});
