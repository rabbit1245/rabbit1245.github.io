import {archiveWire,restoreArchiveWire,compactMatchEvents} from './event-archive';
import {canonicalHash} from './canonical-bytes';
import {recordFingerprint,storedHead,type StoredCareer} from './save-codec';
import type {Career} from './types';
const DATABASE='kball-verified-read-cache';
const MAX=256*1024*1024;
async function database(){return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(DATABASE,1);r.onupgradeneeded=()=>r.result.createObjectStore('careers',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function key(record:StoredCareer){return recordFingerprint(record);}
/** Optional, fully derived cache. It never replaces the original save or backup. */
export async function cachedCareer(record:StoredCareer):Promise<Career|undefined>{
 try{const db=await database();const cached:any=await new Promise((resolve,reject)=>{const t=db.transaction('careers'),r=t.objectStore('careers').get(record.id);t.oncomplete=()=>resolve(r.result);t.onabort=()=>reject(t.error);});db.close();if(!cached||cached.source!==key(record)||cached.version!==1||canonicalHash(cached.wire,MAX)!==cached.hash)return;
 const career=await restoreArchiveWire(cached.wire) as Career,head=storedHead(record);if(career.id!==record.id||career.revision!==head.revision)return;return career;
 }catch{return;}
}
export async function cacheCareer(record:StoredCareer,career:Career):Promise<void>{
 try{compactMatchEvents(career);const wire=archiveWire(career),value={id:career.id,version:1,source:key(record),hash:canonicalHash(wire,MAX),wire};const db=await database();await new Promise<void>((resolve,reject)=>{const t=db.transaction('careers','readwrite');t.objectStore('careers').put(value);t.oncomplete=()=>resolve();t.onabort=()=>reject(t.error);});db.close();}catch{/* A quota/codec failure never changes the source or makes a save fail. */}
}
export async function forgetCachedCareer(id:string){try{const db=await database();await new Promise<void>((resolve,reject)=>{const t=db.transaction('careers','readwrite');t.objectStore('careers').delete(id);t.oncomplete=()=>resolve();t.onabort=()=>reject(t.error);});db.close();}catch{/* Optional cache only. */}}
