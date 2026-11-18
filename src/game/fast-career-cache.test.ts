import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {cacheCareer,readCachedCareer,forgetCachedCareer} from './fast-career-cache';
import {compactMatchEvents} from './event-archive';
import type {Career} from './types';
import type {BlobCareer} from './save-codec';
import {journalEntry,packStored} from './save-codec';
import {createCareer} from './engine';
import {prepareEnvelope} from './storage';
import {executeCommand} from './commands';
import {commandChange} from './command-patches';

function changeCache(id:string,change:(saved:{hash:string;blob:Blob})=>void){
 return new Promise<void>((resolve,reject)=>{
  const request=indexedDB.open('kball-verified-read-cache',1);
  request.onsuccess=()=>{
   const db=request.result,transaction=db.transaction('careers','readwrite');
   const store=transaction.objectStore('careers'),get=store.get(id);
   get.onsuccess=()=>{change(get.result);store.put(get.result);};
   transaction.oncomplete=()=>{db.close();resolve();};
   transaction.onabort=()=>{db.close();reject(transaction.error);};
  };
 });
}
const json=(value:unknown)=>JSON.parse(JSON.stringify(value));
test('the cache checks its contents, source snapshot and durable journal suffix',async()=>{
 const record:BlobCareer={id:'cache-fixture',format:'kball-blob-v1',revision:1,hash:'a'.repeat(64),versionHash:'a'.repeat(64),writeId:'source',blob:new Blob(['original bytes']),journal:[]};
 const original={id:record.id,revision:1,history:[],season:{matches:[{fixtureId:'fixture',events:Array.from({length:50},(_,i)=>({id:String(i),detail:'전체 이벤트😀'}))}]}} as unknown as Career;
 const expected=json(original);
 compactMatchEvents(original);
 await cacheCareer(record,original);
 assert.deepEqual(json((await readCachedCareer(record))?.career),expected);
 assert.equal(await readCachedCareer({...record,hash:'changed snapshot'}),undefined);
 await changeCache(record.id,value=>{value.blob=new Blob(['bad archive']);});
 assert.equal(await readCachedCareer(record),undefined);
 assert.equal(await record.blob.text(),'original bytes');
 await forgetCachedCareer(record.id);
 assert.equal(await readCachedCareer(record),undefined);

 const career=createCareer({name:'저장 접속 검수',nationality:'대한민국',age:22,position:'CDM',style:'앵커맨',height:180,weight:77,foot:'right',talent:'S',clubId:'DE1_03',squad:'senior',difficulty:'realistic',seed:'resume-cache'});
 const {record:initial}=await packStored(await prepareEnvelope(career,true));
 await cacheCareer(initial,career);
 const next=executeCommand(career,{type:'attributeLock',key:'passing',locked:true},'lock-after-cache');
 const patches=commandChange(career,next);assert.ok(patches);
 const entry=await journalEntry(career.id,career.revision,next.revision,initial.versionHash,patches);
 const withChange:BlobCareer={...initial,format:'kball-blob-v2',writeId:'different',journal:[entry]};
 const warm=await readCachedCareer(withChange);
 assert.equal(warm?.replayed,1);
 assert.deepEqual(json(warm?.career),json(next));
 assert.equal(await readCachedCareer({...withChange,journal:[{...entry,hash:'f'.repeat(64)}]}),undefined);
 await forgetCachedCareer(career.id);
});
