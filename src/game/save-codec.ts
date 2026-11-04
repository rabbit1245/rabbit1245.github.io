import {readJSONBlob,SaveReadError} from './json-reader';
import {replayGameDelta,validatePreparedDelta,sealCareer,type PreparedGameDelta} from './game-delta';
import type {Career,SaveEnvelope,SaveSlot} from './types';
import {applyCareerPatches,validatePatches,type CareerPatch} from './command-patches';
import {prepareEnvelope,verifyEnvelope,validateCareer,validateEngineResult} from './storage';
import {getClub} from './data';
import {MAX_SAVE_BYTES} from './save-limits';
import {jsonBlob} from './json-blob';

export interface JournalEntry {id:string;revision:number;previousRevision:number;previousHash:string;hash:string;patches:CareerPatch[]}
export interface DeltaJournalEntry {kind:'game-delta';id:string;revision:number;previousRevision:number;previousHash:string;hash:string;payload:PreparedGameDelta}
export type SaveJournalEntry=JournalEntry|DeltaJournalEntry;
export interface BlobCareer {id:string;format:'kball-blob-v1'|'kball-blob-v2';revision:number;hash:string;versionHash:string;writeId:string;blob:Blob;encoding?:'gzip';rawBytes?:number;journal:SaveJournalEntry[]}
export interface LegacyCareer {id:string;envelope:SaveEnvelope}
export type StoredCareer=BlobCareer|LegacyCareer;
export interface StoredMetadata extends SaveSlot {hash:string;deleted?:false}
export interface PreparedSave {record:BlobCareer;metadata:StoredMetadata}
export interface DecodedSave {career:Career;versionHash:string;normalized?:BlobCareer}
const digest=async(text:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');
export const isBlobCareer=(r:StoredCareer):r is BlobCareer=>!!r&&'format' in r&&(r.format==='kball-blob-v1'||r.format==='kball-blob-v2');
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
 return {record:{id:c.id,format:'kball-blob-v1',revision:c.revision,hash:envelope.hash,versionHash,writeId:crypto.randomUUID(),blob:jsonBlob(envelope),journal:[]},metadata:metadataFor(c,versionHash,envelope.savedAt)};
}
export async function packStored(envelope:SaveEnvelope,versionHash=envelope.hash):Promise<PreparedSave>{
 const prepared=packEnvelope(envelope,versionHash),record=prepared.record;
 if(record.blob.size>32*1024*1024&&typeof CompressionStream!=='undefined'){
  const rawBytes=record.blob.size,blob=await new Response(record.blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  if(blob.size<rawBytes)Object.assign(record,{blob,encoding:'gzip',rawBytes});
 }
 return prepared;
}
export async function prepareStored(c:Career):Promise<PreparedSave>{return packStored(await prepareEnvelope(c));}
export async function journalEntry(id:string,previousRevision:number,revision:number,previousHash:string,patches:CareerPatch[]):Promise<JournalEntry>{
 validatePatches(patches);const data={id,revision,previousRevision,previousHash,patches};return {...data,hash:await digest(JSON.stringify(data))};
}
export async function deltaJournalEntry(id:string,previousRevision:number,revision:number,previousHash:string,payload:PreparedGameDelta):Promise<DeltaJournalEntry>{
 validatePreparedDelta(payload);
 if(payload.baseId!==id||payload.baseRevision!==previousRevision||payload.revision!==revision)throw Error('진행 변경 기록의 리비전이 올바르지 않습니다.');
 const data={kind:'game-delta' as const,id,revision,previousRevision,previousHash},descriptor={...data,dataHash:payload.dataHash,rawBytes:payload.rawBytes,encoding:payload.encoding??'json'};
 return {...data,payload,hash:await digest(JSON.stringify(descriptor))};
}
export function journalSize(entries:SaveJournalEntry[]):{storedBytes:number;rawBytes:number}{
 let storedBytes=0,rawBytes=0;for(const entry of entries){if(!entry||typeof entry!=='object')throw Error('저장 변경 기록의 형식이 올바르지 않습니다.');if('kind' in entry){if(entry.kind!=='game-delta')throw Error('지원하지 않는 변경 기록입니다.');validatePreparedDelta(entry.payload);storedBytes+=entry.payload.blob.size;rawBytes+=entry.payload.rawBytes;}else{const size=new TextEncoder().encode(JSON.stringify(entry)).length;storedBytes+=size;rawBytes+=size;}}return {storedBytes,rawBytes};
}
export async function replayJournal(c:Career,versionHash:string,entries:SaveJournalEntry[]):Promise<DecodedSave>{
 let next=c,hash=versionHash;
 for(const entry of entries){
  if(entry.id!==next.id||entry.previousRevision!==next.revision||(entry.revision<=next.revision||!('kind' in entry&&entry.kind==='game-delta')&&entry.revision!==next.revision+1)||entry.previousHash!==hash)throw Error('저장 변경 기록의 순서가 일치하지 않습니다.');
  if('kind' in entry&&entry.kind==='game-delta'){
   const checked=await deltaJournalEntry(entry.id,entry.previousRevision,entry.revision,entry.previousHash,entry.payload);
   if(checked.hash!==entry.hash)throw Error('저장 변경 기록이 손상되었습니다. 이전 저장본을 복구해 주세요.');
   next=await replayGameDelta(next,entry.payload);
  }else{
   const patch=entry as JournalEntry,checked=await journalEntry(patch.id,patch.previousRevision,patch.revision,patch.previousHash,patch.patches);
   if(checked.hash!==entry.hash)throw Error('저장 변경 기록이 손상되었습니다. 이전 저장본을 복구해 주세요.');
   next=applyCareerPatches(next,patch.patches);
  }if(next.id!==entry.id||next.revision!==entry.revision)throw Error('저장 변경 기록의 리비전이 올바르지 않습니다.');hash=entry.hash;
 }
 return {career:next,versionHash:hash};
}
export async function decodeStored(r:StoredCareer):Promise<DecodedSave>{
 if(!isBlobCareer(r)){
  const envelope=await verifyEnvelope(r?.envelope);if(envelope.career.id!==r.id)throw Error('슬롯 ID와 저장 내용이 일치하지 않습니다.');
  return {career:envelope.career,versionHash:r.envelope.hash,normalized:(await packStored(envelope,r.envelope.hash)).record};
 }
 if(!(r.blob instanceof Blob)||r.blob.size>MAX_SAVE_BYTES+4096||r.encoding!==undefined&&r.encoding!=='gzip'||!Array.isArray(r.journal)||r.journal.length>512||!/^[a-f0-9]{64}$/.test(r.versionHash))throw Error('저장 스냅샷 형식이 올바르지 않습니다.');
 const usage=journalSize(r.journal);if(usage.rawBytes>768*1024*1024||usage.storedBytes>128*1024*1024)throw Error('저장 변경 기록의 지원 범위를 초과했습니다.');
 let value:unknown;
 try{value=await readJSONBlob(r.blob,{encoding:r.encoding,rawBytes:r.rawBytes,maximum:MAX_SAVE_BYTES+4096});}
 catch(e){const stage=e instanceof SaveReadError?({gzip:'압축 해제',size:'크기 검사',json:'JSON 해석',read:'저장소 읽기'} as const)[e.phase]:'저장소 읽기';throw Error(`저장 스냅샷을 읽을 수 없습니다. [${stage}] 원본 저장 보관 또는 이전 저장 복원을 이용해 주세요.`);}

 const original=value as {hash?:string};
 const envelope=await verifyEnvelope(value,true);
 if(envelope.career.id!==r.id||envelope.career.revision!==r.revision||original.hash!==r.hash)throw Error('저장 스냅샷의 검사 정보가 일치하지 않습니다.');
 const incremental=r.journal.length>0&&'importScripts' in globalThis;
 if(incremental)sealCareer(envelope.career);
 const replayed=await replayJournal(envelope.career,r.versionHash,r.journal);
 const career=r.journal.length?(incremental?validateEngineResult(envelope.career,replayed.career):validateCareer(replayed.career,true)):replayed.career;
 return {...replayed,career,...(envelope.hash!==original.hash?{normalized:(await packStored(await prepareEnvelope(career,true),replayed.versionHash)).record}:{})};
}
