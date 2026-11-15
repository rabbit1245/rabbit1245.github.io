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

/** Read an exported archive without changing its bytes or choosing an older save.
 * The caller must still verify the stored snapshot, hash chain and career. */
export async function readRecoveryArchive(source:Blob,which:'current'|'backup'='current'):Promise<StoredCareer>{
 const fail=()=>{throw new Error('복구 원본 파일의 구조가 올바르지 않습니다.');};
 const header=RECOVERY_MAGIC.length+4;
 if(source.size<header||await source.slice(0,RECOVERY_MAGIC.length).text()!==RECOVERY_MAGIC)return fail();
 const length=new DataView(await source.slice(RECOVERY_MAGIC.length,header).arrayBuffer()).getUint32(0,true);
 if(length>16*1024*1024||header+length>source.size)return fail();
 let manifest:any;try{manifest=JSON.parse(await source.slice(header,header+length).text());}catch{return fail();}
 if(manifest?.format!=='kball-recovery'||manifest.version!==1||!Array.isArray(manifest.parts)||manifest.parts.length>1024)return fail();
 let offset=header+length;const parts:Blob[]=[];
 for(const p of manifest.parts){if(!Number.isSafeInteger(p?.bytes)||p.bytes<0||p.bytes>source.size-offset||typeof p.type!=='string')return fail();parts.push(source.slice(offset,offset+p.bytes,p.type));offset+=p.bytes;}
 if(offset!==source.size)return fail();
 const part=(ref:any):Blob=>{if(!Number.isSafeInteger(ref?.index)||ref.index<0||ref.index>=parts.length||ref.bytes!==parts[ref.index].size||ref.type!==parts[ref.index].type)return fail();return parts[ref.index];};
 const r=manifest[which];if(!r)throw new Error('복구 원본에 요청한 저장본이 없습니다.');
 if(r.kind==='legacy-json'){const {readJSONBlob}=await import('./json-reader');return await readJSONBlob(part(r.data),{maximum:source.size}) as StoredCareer;}
 if(r.kind!=='blob'||!r.data||!Array.isArray(r.data.journal))return fail();
 const data=r.data;
 return {...data,blob:part(data.blob),journal:data.journal.map((e:any)=>e?.kind==='game-delta'?{...e,payload:{...e.payload,blob:part(e.payload?.blob)}}:e)};
}
