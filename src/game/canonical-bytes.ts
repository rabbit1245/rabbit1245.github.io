import {canonicalEventBytes} from './event-archive';
import {sha256} from '@noble/hashes/sha256';

/** The legacy canonical JSON bytes, buffered without one enormous recursive rope. */
export interface JSONShape {properties:number;depth:number}
const forbiddenKeys=new Set(['__proto__','constructor','prototype']);

function visitCanonical(value:unknown,emit:(bytes:Uint8Array<ArrayBuffer>)=>void,shape?:JSONShape):number{
 // Cache only encoded property names, never values or subtrees. Every field is
 // still visited and sorted, with the legacy undefined-array bytes preserved.
 const encoder=new TextEncoder(),limit=32*1024,keyTokens=new Map<string,{first:string;next:string}>();let buffer='',size=0;
 const flush=()=>{if(!buffer)return;const bytes=encoder.encode(buffer);emit(bytes);size+=bytes.length;buffer='';};
 const write=(token:string|undefined)=>{
  if(!token)return;
  if(buffer.length+token.length>limit)flush();
  if(token.length>=limit){const bytes=encoder.encode(token);emit(bytes);size+=bytes.length;}else buffer+=token;
 };
 const visit=(node:unknown,depth=1)=>{
  if(node&&typeof node==='object'){const raw=canonicalEventBytes(node);if(raw){flush();emit(raw);size+=raw.length;return;}}
  if(node===null){write('null');return;}
  if(typeof node==='number'){write(Number.isFinite(node)?String(node):'null');return;}
  if(typeof node==='boolean'){write(node?'true':'false');return;}
  if(typeof node!=='object'){write(JSON.stringify(node));return;}
  if(Array.isArray(node)){
   if(shape&&node.length){shape.properties+=node.length;shape.depth=Math.max(depth,shape.depth);}
   write('[');for(let i=0;i<node.length;i++){if(i)write(',');visit(shape?node[i]??null:node[i],depth+1);}write(']');return;
  }
  const object=node as Record<string,unknown>,keys=Object.keys(object).filter(k=>object[k]!==undefined).sort();
  if(shape&&keys.length){shape.properties+=keys.length;shape.depth=Math.max(depth,shape.depth);}
  write('{');for(let i=0;i<keys.length;i++){const key=keys[i];let token=keyTokens.get(key);if(token===undefined){if(shape&&forbiddenKeys.has(key))throw Error('허용하지 않는 속성이 포함되어 있습니다.');const text=JSON.stringify(key)+':';token={first:text,next:','+text};if(key.length<=256&&keyTokens.size<4096)keyTokens.set(key,token);}write(i?token.next:token.first);visit(object[key],depth+1);}write('}');
 };
 visit(value);flush();return size;
}

/** The same canonical wire bytes, retained only by callers that need them. */
export function canonicalBytes(value:unknown,shape?:JSONShape):Uint8Array<ArrayBuffer>{
 const chunks:Uint8Array<ArrayBuffer>[]=[];const size=visitCanonical(value,b=>chunks.push(b),shape);
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
/** Incremental SHA-256 keeps the legacy digest without career-sized buffers. */
export function canonicalHash(value:unknown,maximum:number):string{
 const hash=sha256.create();let size=0;
 visitCanonical(value,bytes=>{size+=bytes.length;if(size>maximum)throw new Error('저장 파일이 지원하는 크기 범위를 초과했습니다.');hash.update(bytes);});
 return Array.from(hash.digest(),b=>b.toString(16).padStart(2,'0')).join('');
}
