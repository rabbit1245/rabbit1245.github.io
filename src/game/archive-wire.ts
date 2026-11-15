import {readJSONBlob} from './json-reader';
import {archiveWire,restoreArchiveWire} from './event-archive';
import {jsonBlob} from './json-blob';
const MAGIC='KBALL-EVENT-WIRE-2\n',OLD_MAGIC='KBALL-EVENT-WIRE-1\n';
export async function encodeArchiveWire(value:unknown):Promise<Blob>{
 const parts:Blob[]=[];
 const visit=(v:any):any=>{if(v instanceof Blob){const index=parts.length;parts.push(v);return {$part:index,bytes:v.size,type:v.type};}if(!v||typeof v!=='object')return v;if(Array.isArray(v))return v.map(visit);const out:Record<string,unknown>={};for(const key of Object.keys(v))Object.defineProperty(out,key,{value:visit(v[key]),enumerable:true,writable:true,configurable:true});return out;};
 const body=jsonBlob(visit(archiveWire(value)));if(body.size>64*1024*1024)throw Error('진행 메타데이터가 너무 큽니다.');
 const compressed=await new Response(body.stream().pipeThrough(new CompressionStream('gzip'))).blob();
 const size=new Uint8Array(8);new DataView(size.buffer).setUint32(0,compressed.size,true);new DataView(size.buffer).setUint32(4,body.size,true);
 return new Blob([MAGIC,size,compressed,...parts]);
}
export async function decodeArchiveWire(blob:Blob):Promise<any>{
 const fail=()=>{throw Error('경기 보관 진행 기록의 구조가 다릅니다.');};
 const magic=await blob.slice(0,MAGIC.length).text(),old=magic===OLD_MAGIC;
 if(!old&&magic!==MAGIC)return fail();const header=MAGIC.length+(old?4:8);
 const sizes=new DataView(await blob.slice(MAGIC.length,header).arrayBuffer()),n=sizes.getUint32(0,true);if(n>64*1024*1024||n+header>blob.size)return fail();
 const wire=old?JSON.parse(await blob.slice(header,header+n).text()):await readJSONBlob(blob.slice(header,header+n),{encoding:'gzip',rawBytes:sizes.getUint32(4,true),maximum:64*1024*1024});let offset=header+n,next=0;
 const visit=(v:any):any=>{if(!v||typeof v!=='object')return v;if('$part'in v){if(v.$part!==next++||!Number.isSafeInteger(v.bytes)||v.bytes<0||v.bytes>blob.size-offset||typeof v.type!=='string')return fail();const part=blob.slice(offset,offset+v.bytes,v.type);offset+=v.bytes;return part;}for(const k of Object.keys(v)){if(['__proto__','constructor','prototype'].includes(k))return fail();v[k]=visit(v[k]);}return v;};
 const out=visit(wire);if(offset!==blob.size)return fail();return restoreArchiveWire(out);
}
