import {readJSONBlob} from './json-reader';
import {archiveWire,restoreArchiveWire} from './event-archive';
import {jsonBlob} from './json-blob';

const MAGIC='KBALL-EVENT-WIRE-2\n';
const OLD_MAGIC='KBALL-EVENT-WIRE-1\n';
const METADATA_LIMIT=64*1024*1024;

export class ArchiveMetadataLimitError extends Error {
 constructor(){super('경기 기록의 저장 메타데이터가 너무 큽니다.');}
}

export async function encodeArchiveWire(value:unknown,metadataLimit=METADATA_LIMIT):Promise<Blob>{
 const parts:Blob[]=[];
 const visit=(node:unknown):unknown=>{
  if(node instanceof Blob){
   const index=parts.length;
   parts.push(node);
   return {$part:index,bytes:node.size,type:node.type};
  }
  if(!node||typeof node!=='object')return node;
  if(Array.isArray(node))return node.map(visit);
  return Object.fromEntries(Object.entries(node).map(([key,child])=>[key,visit(child)]));
 };
 const body=jsonBlob(visit(archiveWire(value)));
 if(body.size>metadataLimit)throw new ArchiveMetadataLimitError();
 const compressed=await new Response(body.stream().pipeThrough(new CompressionStream('gzip'))).blob();
 const size=new DataView(new ArrayBuffer(8));
 size.setUint32(0,compressed.size,true);
 size.setUint32(4,body.size,true);
 return new Blob([MAGIC,size.buffer,compressed,...parts]);
}

export async function decodeArchiveWire<T=unknown>(blob:Blob,buffer?:ArrayBuffer,metadataLimit=METADATA_LIMIT):Promise<T>{
 const fail=()=>{throw Error('경기 보관 기록의 구조가 다릅니다.');};
 // One read avoids thousands of IndexedDB-backed Blob reads. Event arrays
 // retain views of these bytes and keep the original slices for later saves.
 const bytes=buffer??await blob.arrayBuffer();
 const magic=new TextDecoder().decode(new Uint8Array(bytes,0,Math.min(MAGIC.length,bytes.byteLength)));
 const old=magic===OLD_MAGIC;
 if(!old&&magic!==MAGIC)return fail();
 const header=MAGIC.length+(old?4:8);
 if(bytes.byteLength!==blob.size||bytes.byteLength<header)return fail();
 const sizes=new DataView(bytes,MAGIC.length,header-MAGIC.length);
 const size=sizes.getUint32(0,true);
 if(size>metadataLimit||size+header>blob.size)return fail();
 const body=blob.slice(header,header+size);
 const wire=old?JSON.parse(await body.text()):await readJSONBlob(body,{
  encoding:'gzip',rawBytes:sizes.getUint32(4,true),maximum:metadataLimit,
 });
 let offset=header+size;
 let next=0;
 const partBytes=new WeakMap<Blob,Uint8Array<ArrayBuffer>>();
 const visit=(value:unknown):unknown=>{
  if(!value||typeof value!=='object')return value;
  const row=value as Record<string,unknown>;
  if(Object.hasOwn(row,'$part')){
   if(row.$part!==next++||typeof row.bytes!=='number'||!Number.isSafeInteger(row.bytes)||
     row.bytes<0||row.bytes>blob.size-offset||typeof row.type!=='string')return fail();
   const part=blob.slice(offset,offset+row.bytes,row.type);
   partBytes.set(part,new Uint8Array(bytes,offset,row.bytes));
   offset+=row.bytes;
   return part;
  }
  for(const key of Object.keys(row)){
   if(['__proto__','constructor','prototype'].includes(key))return fail();
   row[key]=visit(row[key]);
  }
  return row;
 };
 const result=visit(wire);
 if(offset!==blob.size)return fail();
 return restoreArchiveWire(result as T,part=>partBytes.get(part));
}
