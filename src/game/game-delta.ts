import {readJSONBlob} from './json-reader';
import {encodeArchiveWire,decodeArchiveWire} from './archive-wire';
import {isEventArchive,compactMatchEvents} from './event-archive';
import type {Career} from './types';
import {unpackGameResult,type GameResultWire} from './worker-result';
import {jsonBlob} from './json-blob';
import {sha256} from '@noble/hashes/sha256';

export const MAX_GAME_DELTA_BYTES=256*1024*1024;
export interface PreparedGameDelta {format:'kball-game-delta-v1'|'kball-game-delta-v2';baseId:string;baseRevision:number;revision:number;rawBytes:number;dataHash:string;blob:Blob;encoding?:'gzip'}
const toHex=(bytes:Uint8Array)=>Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
const digest=async(buffer:ArrayBuffer)=>toHex(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)));
const sealed=new WeakSet<object>();
/** Browser game states are immutable. Shared archived records are sealed once,
 * so later decisions only visit their new objects, never decades of old events. */
export function sealCareer(c:Career):Career{
 const visit=(v:unknown):void=>{if(!v||typeof v!=='object'||sealed.has(v)||isEventArchive(v))return;for(const key of Object.keys(v))visit((v as Record<string,unknown>)[key]);Object.freeze(v);sealed.add(v);};visit(c);return c;
}
export const isSealedCareer=(c:Career)=>sealed.has(c);
const receipts=new WeakMap<Career,{previous:WeakRef<Career>;prepared:PreparedGameDelta}>();
/** Only the engine Worker may certify this immutable result and its immutable Blob.
 * Files, JSON and arbitrary mutable states always take the original full validator. */
export function certifyGameDelta(previous:Career,next:Career,prepared:PreparedGameDelta):void{
 if(!sealed.has(previous)||!sealed.has(next)||prepared.baseId!==previous.id||prepared.baseRevision!==previous.revision||prepared.revision!==next.revision||next.id!==previous.id||next.revision<=previous.revision)throw Error('진행 변경 기록의 기준이 일치하지 않습니다.');
 validatePreparedDelta(prepared);Object.freeze(prepared);receipts.set(next,{previous:new WeakRef(previous),prepared});
}
export function certifiedGameDelta(previous:Career,next:Career):PreparedGameDelta|undefined{
 const r=receipts.get(next);return r?.previous.deref()===previous&&sealed.has(previous)&&sealed.has(next)?r.prepared:undefined;
}
export function validatePreparedDelta(p:PreparedGameDelta):void{
 if(!['kball-game-delta-v1','kball-game-delta-v2'].includes(p?.format)||typeof p.baseId!=='string'||!Number.isSafeInteger(p.baseRevision)||p.baseRevision<0||(!Number.isSafeInteger(p.revision)||p.revision<=p.baseRevision||p.revision>100_000_000)||!Number.isSafeInteger(p.rawBytes)||p.rawBytes<=0||p.rawBytes>MAX_GAME_DELTA_BYTES||!(p.blob instanceof Blob)||p.blob.size>MAX_GAME_DELTA_BYTES||!/^[a-f0-9]{64}$/.test(p.dataHash)||p.encoding!==undefined&&p.encoding!=='gzip')throw Error('진행 변경 기록의 저장 형식이 올바르지 않습니다.');
}
/** Run in the simulation Worker, using its existing result instead of posting the
 * entire career to another Worker for a second full serialization and checksum. */
export async function prepareGameDelta(wire:GameResultWire,archive=false):Promise<PreparedGameDelta|undefined>{
 if(wire.career.revision<=wire.baseRevision)return undefined;
 if(archive){const blob=await encodeArchiveWire(wire);if(blob.size>MAX_GAME_DELTA_BYTES)return undefined;return {format:'kball-game-delta-v2',baseId:wire.baseId,baseRevision:wire.baseRevision,revision:wire.career.revision,rawBytes:blob.size,dataHash:await digest(await blob.arrayBuffer()),blob};}
 const raw=jsonBlob(wire);if(raw.size>MAX_GAME_DELTA_BYTES)return undefined;
 const dataHash=await digest(await raw.arrayBuffer());let blob=raw,encoding:'gzip'|undefined;
 if(raw.size>256*1024&&typeof CompressionStream!=='undefined'){
  const compressed=await new Response(raw.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  if(compressed.size<raw.size){blob=compressed;encoding='gzip';}
 }
 return {format:'kball-game-delta-v1',baseId:wire.baseId,baseRevision:wire.baseRevision,revision:wire.career.revision,rawBytes:raw.size,dataHash,blob,...(encoding?{encoding}:{})};
}
export async function replayGameDelta(previous:Career,p:PreparedGameDelta,compact=false):Promise<Career>{
 validatePreparedDelta(p);
 if(previous.id!==p.baseId||previous.revision!==p.baseRevision)throw Error('진행 변경 기록의 순서가 일치하지 않습니다.');
 let wire:GameResultWire;
 if(p.format==='kball-game-delta-v2'){
  if(p.encoding!==undefined||p.blob.size!==p.rawBytes)throw Error('진행 변경 기록이 손상되었습니다.');
  const bytes=await p.blob.arrayBuffer();
  if(await digest(bytes)!==p.dataHash)throw Error('진행 변경 기록이 손상되었습니다.');
  wire=await decodeArchiveWire<GameResultWire>(p.blob,bytes);
 }else{
  const hash=sha256.create();
  if(!p.encoding&&p.blob.size!==p.rawBytes)throw Error('진행 변경 기록의 크기가 일치하지 않습니다.');
  const forbidden=new Set(['__proto__','prototype','constructor']);
  try{
   wire=await readJSONBlob(p.blob,{
    encoding:p.encoding,rawBytes:p.rawBytes,maximum:MAX_GAME_DELTA_BYTES,
    // Large deltas are compacted as their subtrees are parsed.
    stream:compact&&p.rawBytes>=96*1024*1024,onChunk:chunk=>{hash.update(chunk);},
    transform(value){
     const visit=(node:unknown)=>{
      if(!node||typeof node!=='object')return;
      for(const [key,child] of Object.entries(node)){
       if(forbidden.has(key))throw Error('허용하지 않는 속성이 포함되어 있습니다.');
       visit(child);
      }
     };
     visit(value);
     return compact?compactMatchEvents(value):value;
    },
   }) as GameResultWire;
  }catch{throw Error('진행 변경 기록을 읽을 수 없습니다.');}
  if(toHex(hash.digest())!==p.dataHash)throw Error('진행 변경 기록이 손상되었습니다. 이전 저장본을 복구해 주세요.');
 }
 if(wire?.baseId!==p.baseId||wire.baseRevision!==p.baseRevision||wire.career?.revision!==p.revision)throw Error('진행 변경 기록의 검사 정보가 일치하지 않습니다.');
 return unpackGameResult(previous,wire);
}
