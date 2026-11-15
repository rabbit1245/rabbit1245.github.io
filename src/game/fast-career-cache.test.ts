import 'fake-indexeddb/auto';import test from 'node:test';import assert from 'node:assert/strict';
import {cacheCareer,cachedCareer,forgetCachedCareer} from './fast-career-cache';import {compactMatchEvents} from './event-archive';
import type {Career} from './types';import type {BlobCareer} from './save-codec';
const change=async(fn:(v:any)=>void)=>new Promise<void>((resolve,reject)=>{const r=indexedDB.open('kball-verified-read-cache',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('careers','readwrite'),s=t.objectStore('careers'),q=s.get('cache-fixture');q.onsuccess=()=>{fn(q.result);s.put(q.result);};t.oncomplete=()=>{db.close();resolve();};t.onabort=()=>reject(t.error);};});
test('a verified cache round-trips every event, rejects changed source tokens and corrupted cache data, and leaves the source intact',async()=>{
 const record:BlobCareer={id:'cache-fixture',format:'kball-blob-v1',revision:1,hash:'a'.repeat(64),versionHash:'a'.repeat(64),writeId:'source',blob:new Blob(['original bytes']),journal:[]};
 const original={id:record.id,revision:1,history:[],season:{matches:[{fixtureId:'fixture',events:Array.from({length:50},(_,i)=>({id:String(i),detail:'전체 이벤트😀'}))}]}} as unknown as Career;
 const json=JSON.stringify(original);compactMatchEvents(original);await cacheCareer(record,original);assert.deepEqual(JSON.parse(JSON.stringify(await cachedCareer(record))),JSON.parse(json));assert.equal(await cachedCareer({...record,writeId:'another version'}),undefined);assert.equal(await record.blob.text(),'original bytes');
 await change(v=>{v.wire.revision=99;});assert.equal(await cachedCareer(record),undefined);
 await cacheCareer(record,original);await change(v=>{v.wire.season.matches[0].events.blob=new Blob(['corrupt']);});assert.equal(await cachedCareer(record),undefined);
 await forgetCachedCareer(record.id);assert.equal(await cachedCareer(record),undefined);
});
