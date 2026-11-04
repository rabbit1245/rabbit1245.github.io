import {isBlobCareer,type StoredCareer} from './save-codec';
import {jsonBlob} from './json-blob';
export const RECOVERY_MAGIC='KBALL-RECOVERY-V1\n';
/** Preserve exact compressed bytes even when normal decoding fails. The manifest
 * is small; legacy JSON is emitted in chunks, never one giant string. */
export function recoveryArchive(snapshot:{current?:StoredCareer;backup?:StoredCareer;metadata?:unknown}):Blob{
 const parts:Blob[]=[];
 const part=(blob:Blob)=>{const index=parts.length;parts.push(blob);return {index,bytes:blob.size,type:blob.type};};
 const record=(r:StoredCareer|undefined):unknown=>{
  if(!r)return null;
  if(!isBlobCareer(r))return {kind:'legacy-json',data:part(jsonBlob(r))};
  return {kind:'blob',data:{...r,blob:part(r.blob),journal:r.journal.map(e=>'kind' in e&&e.kind==='game-delta'?{...e,payload:{...e.payload,blob:part(e.payload.blob)}}:e)}};
 };
 const manifest={format:'kball-recovery',version:1,createdAt:new Date().toISOString(),current:record(snapshot.current),backup:record(snapshot.backup),metadata:snapshot.metadata??null,parts:parts.map(p=>({bytes:p.size,type:p.type}))};
 const body=jsonBlob(manifest),size=new Uint8Array(4);new DataView(size.buffer).setUint32(0,body.size,true);
 return new Blob([RECOVERY_MAGIC,size,body,...parts],{type:'application/octet-stream'});
}
