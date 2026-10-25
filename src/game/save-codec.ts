import type {Career,SaveEnvelope,SaveSlot} from './types';
import {applyCareerPatches,validatePatches,type CareerPatch} from './command-patches';
import {prepareEnvelope,verifyEnvelope,validateCareer} from './storage';
import {getClub} from './data';

export interface JournalEntry {id:string;revision:number;previousRevision:number;previousHash:string;hash:string;patches:CareerPatch[]}
export interface BlobCareer {id:string;format:'kball-blob-v1';revision:number;hash:string;versionHash:string;writeId:string;blob:Blob;journal:JournalEntry[]}
export interface LegacyCareer {id:string;envelope:SaveEnvelope}
export type StoredCareer=BlobCareer|LegacyCareer;
export interface StoredMetadata extends SaveSlot {hash:string;deleted?:false}
export interface PreparedSave {record:BlobCareer;metadata:StoredMetadata}
export interface DecodedSave {career:Career;versionHash:string;normalized?:BlobCareer}
const digest=async(text:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');
export const isBlobCareer=(r:StoredCareer):r is BlobCareer=>!!r&&'format' in r&&r.format==='kball-blob-v1';
export function storedHead(r:StoredCareer):{revision:number;hash:string}{
 if(isBlobCareer(r)){const last=r.journal?.at(-1);return {revision:last?.revision??r.revision,hash:last?.hash??r.versionHash};}
 return {revision:r?.envelope?.career?.revision,hash:r?.envelope?.hash};
}
export function recordFingerprint(r:StoredCareer|undefined):string{
 if(!r)return 'missing';
 return isBlobCareer(r)?JSON.stringify({...r,blob:{size:r.blob?.size,type:r.blob?.type}}):JSON.stringify(r);
}
export function metadataFor(c:Career,hash:string,savedAt:string):StoredMetadata{
 return {id:c.id,name:`${c.player.name} · ${c.season.year}/${String(c.season.year+1).slice(-2)}`,playerName:c.player.name,clubName:getClub(c.player.clubId).name,year:c.season.year,age:c.player.age,ovr:c.player.ovr,updatedAt:savedAt,revision:c.revision,hash};
}
export function packEnvelope(envelope:SaveEnvelope,versionHash=envelope.hash):PreparedSave{
 const c=envelope.career;
 return {record:{id:c.id,format:'kball-blob-v1',revision:c.revision,hash:envelope.hash,versionHash,writeId:crypto.randomUUID(),blob:new Blob([JSON.stringify(envelope)],{type:'application/json'}),journal:[]},metadata:metadataFor(c,versionHash,envelope.savedAt)};
}
export async function prepareStored(c:Career):Promise<PreparedSave>{return packEnvelope(await prepareEnvelope(c));}
export async function journalEntry(id:string,previousRevision:number,revision:number,previousHash:string,patches:CareerPatch[]):Promise<JournalEntry>{
 validatePatches(patches);const data={id,revision,previousRevision,previousHash,patches};return {...data,hash:await digest(JSON.stringify(data))};
}
export async function replayJournal(c:Career,versionHash:string,entries:JournalEntry[]):Promise<DecodedSave>{
 let next=c,hash=versionHash;
 for(const entry of entries){
  if(entry.id!==next.id||entry.previousRevision!==next.revision||entry.revision!==next.revision+1||entry.previousHash!==hash)throw Error('저장 변경 기록의 순서가 일치하지 않습니다.');
  const checked=await journalEntry(entry.id,entry.previousRevision,entry.revision,entry.previousHash,entry.patches);
  if(checked.hash!==entry.hash)throw Error('저장 변경 기록이 손상되었습니다. 이전 저장본을 복구해 주세요.');
  next=applyCareerPatches(next,entry.patches);if(next.id!==entry.id||next.revision!==entry.revision)throw Error('저장 변경 기록의 리비전이 올바르지 않습니다.');hash=entry.hash;
 }
 return {career:next,versionHash:hash};
}
export async function decodeStored(r:StoredCareer):Promise<DecodedSave>{
 if(!isBlobCareer(r)){
  const envelope=await verifyEnvelope(r?.envelope);if(envelope.career.id!==r.id)throw Error('슬롯 ID와 저장 내용이 일치하지 않습니다.');
  return {career:envelope.career,versionHash:envelope.hash,normalized:packEnvelope(envelope).record};
 }
 if(!(r.blob instanceof Blob)||r.blob.size>256*1024*1024+4096||!Array.isArray(r.journal)||r.journal.length>512||!/^[a-f0-9]{64}$/.test(r.versionHash))throw Error('저장 스냅샷 형식이 올바르지 않습니다.');
 let value:unknown;try{value=JSON.parse(await r.blob.text());}catch{throw Error('저장 스냅샷을 읽을 수 없습니다.');}
 const envelope=await verifyEnvelope(value);
 if(envelope.career.id!==r.id||envelope.career.revision!==r.revision||envelope.hash!==r.hash)throw Error('저장 스냅샷의 검사 정보가 일치하지 않습니다.');
 const replayed=await replayJournal(envelope.career,r.versionHash,r.journal);
 return {...replayed,career:r.journal.length?validateCareer(replayed.career):replayed.career};
}
