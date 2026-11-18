import {decodeArchiveWire,encodeArchiveWire} from './archive-wire';
import {restoreArchiveWire} from './event-archive';
import {canonicalHash} from './canonical-bytes';
import {isBlobCareer,recordFingerprint,replayJournal,storedHead,type BlobCareer,type StoredCareer,type SaveJournalEntry} from './save-codec';
import {sealCareer} from './game-delta';
import {loadingProgress} from './loading-progress';
import {validateEngineResult} from './storage';
import type {Career} from './types';

const DATABASE='kball-verified-read-cache';
const LIMIT=256*1024*1024;

interface CompactCache {
 id:string;
 version:2;
 revision:number;
 versionHash:string;
 source:string;
 hash:string;
 blob:Blob;
}
interface LegacyCache {id:string;version:1;source:string;hash:string;wire:Career}

async function database():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DATABASE,1);
  request.onupgradeneeded=()=>request.result.createObjectStore('careers',{keyPath:'id'});
  request.onsuccess=()=>{
   const db=request.result;
   db.onversionchange=()=>db.close();
   resolve(db);
  };
  request.onerror=()=>reject(request.error);
  request.onblocked=()=>reject(Error('빠른 저장을 열 수 없습니다.'));
 });
}

async function withCache<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const db=await database();
 try{
  return await new Promise((resolve,reject)=>{
   const transaction=db.transaction('careers',mode);
   const request=run(transaction.objectStore('careers'));
   transaction.oncomplete=()=>resolve(request.result);
   transaction.onabort=()=>reject(transaction.error);
  });
 }finally{db.close();}
}

async function digest(bytes:ArrayBuffer):Promise<string>{
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
}

function prefixKey(record:BlobCareer,journal:SaveJournalEntry[]):string{
 // Journal appends change writeId and may promote the record to v2. The
 // verified prefix still has the same snapshot, content hash and entries.
 return recordFingerprint({...record,format:'kball-blob-v1',writeId:'',journal});
}

export interface CachedCareer {career:Career;replayed:number;legacy?:true}
/** Only a verified prefix is reusable. Any newer durable journal is still
 * checked and replayed, even if autosave just committed before the tab closed. */
export async function readCachedCareer(record:StoredCareer):Promise<CachedCareer|undefined>{
 if(!isBlobCareer(record))return;
 try{
  const cached:CompactCache|LegacyCache|undefined=await withCache('readonly',store=>store.get(record.id));
  if(!cached)return;
  const head=storedHead(record);
  if(cached.version===1){
   if(cached.source!==recordFingerprint(record)||canonicalHash(cached.wire,LIMIT)!==cached.hash)return;
   const career=await restoreArchiveWire(cached.wire);
   if(career.id!==record.id||career.revision!==head.revision)return;
   return {career,replayed:0,legacy:true};
  }
  if(cached.version!==2||!(cached.blob instanceof Blob)||cached.blob.size>LIMIT)return;
  const index=record.journal.findIndex(entry=>entry.revision===cached.revision);
  if(index===-1&&record.revision!==cached.revision)return;
  const baseHash=index===-1?record.versionHash:record.journal[index].hash;
  if(cached.versionHash!==baseHash||cached.source!==prefixKey(record,record.journal.slice(0,index+1)))return;
  const bytes=await cached.blob.arrayBuffer();
  if(await digest(bytes)!==cached.hash)return;
  const career=await decodeArchiveWire<Career>(cached.blob,bytes,LIMIT);
  if(career.id!==record.id||career.revision!==cached.revision)return;
  const suffix=record.journal.slice(index+1);
  if(!suffix.length)return {career,replayed:0};
  sealCareer(career);
  loadingProgress('최근 진행 적용',0);
  const advanced=await replayJournal(career,cached.versionHash,suffix,true,(done,total)=>loadingProgress('최근 진행 적용',Math.floor(done/total*100)));
  if(advanced.career.revision!==head.revision||advanced.versionHash!==head.hash)return;
  return {career:validateEngineResult(career,advanced.career),replayed:suffix.length};
 }catch{return;}
}

/** A failed write (including quota) leaves the primary save and backup usable. */
export async function cacheCareer(record:StoredCareer,career:Career,packed?:Blob):Promise<void>{
 if(!isBlobCareer(record))return;
 try{
  const head=storedHead(record);
  if(career.id!==record.id||career.revision!==head.revision)return;
  const blob=packed??await encodeArchiveWire(career,LIMIT);
  if(blob.size>LIMIT)return;
  const value:CompactCache={
   id:career.id,version:2,revision:head.revision,versionHash:head.hash,
   source:prefixKey(record,record.journal),hash:await digest(await blob.arrayBuffer()),blob,
  };
  await withCache('readwrite',store=>store.put(value));
 }catch{/* Optional cache. */}
}

export const MAX_CAREER_CACHE_BYTES=LIMIT;
export async function forgetCachedCareer(id:string):Promise<void>{
 try{await withCache('readwrite',store=>store.delete(id));}catch{/* Optional cache. */}
}
