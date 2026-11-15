import {canonicalBytes} from './canonical-bytes';
import {gzipSync,gunzipSync,strToU8,strFromU8} from 'fflate';
import {sha256} from '@noble/hashes/sha256';
export interface EventArchive {tag:'kball-events-v1';count:number;rawBytes:number;hash:string;blob:Blob;canonical?:true}
type State={descriptor:EventArchive;bytes:Uint8Array};
let lastKey:object|undefined,lastRows:readonly unknown[]|undefined;
const archives=new WeakMap<object,State>(),visited=new WeakSet<object>(),recent=new Map<object,readonly unknown[]>();
const hex=(b:Uint8Array)=>Array.from(sha256(b),n=>n.toString(16).padStart(2,'0')).join('');
function freeze(v:any){if(!v||typeof v!=='object'||Object.isFrozen(v))return;for(const k of Object.keys(v))freeze(v[k]);Object.freeze(v);}
export const isEventArchive=(v:object)=>archives.has(v);
function proxy(state:State):any[]{
 Object.freeze(state.descriptor);const key={};let result:any[];
 const load=()=>{if(lastKey===key)return lastRows!;let rows=recent.get(key);if(rows){recent.delete(key);recent.set(key,rows);lastKey=key;lastRows=rows;return rows;}
  const raw=gunzipSync(state.bytes);if(raw.length!==state.descriptor.rawBytes)throw Error('경기 원본의 확장 크기가 다릅니다.');
  rows=JSON.parse(strFromU8(raw));if(!Array.isArray(rows)||rows.length!==state.descriptor.count)throw Error('경기 원본 목록이 다릅니다.');freeze(rows);recent.set(key,rows);while(recent.size>8)recent.delete(recent.keys().next().value!);lastKey=key;lastRows=rows;return rows!;
 };
 const index=(k:PropertyKey)=>typeof k==='string'&&/^(0|[1-9]\d*)$/.test(k)?Number(k):-1;
 const immutable=()=>{throw new TypeError('보관된 경기 이벤트는 읽기 전용입니다.');};
 result=new Proxy(new Array(state.descriptor.count),{
  get(target,k,receiver){const i=index(k);if(i>=0)return load()[i];if(k===Symbol.iterator||['map','filter','some','every','find','findIndex','forEach','reduce','reduceRight','slice','includes','indexOf','lastIndexOf','values','entries','keys','at','join','toString'].includes(k as string)){const rows=load() as any;return rows[k].bind(rows);}return Reflect.get(target,k,receiver);},
  has(target,k){const i=index(k);return i>=0?i<state.descriptor.count:Reflect.has(target,k);},
  ownKeys(){return [...Array.from({length:state.descriptor.count},(_,i)=>String(i)),'length'];},
  getOwnPropertyDescriptor(target,k){const i=index(k);return i>=0&&i<state.descriptor.count?{value:load()[i],enumerable:true,writable:false,configurable:true}:Reflect.getOwnPropertyDescriptor(target,k);},
  set:immutable,deleteProperty:immutable,defineProperty:immutable,setPrototypeOf:immutable,preventExtensions:immutable,
 });archives.set(result,state);visited.add(result);return result;
}
/** Lossless representation only. Every event field is retained, and ordinary
 * array reads transparently decode one match; the cache holds at most 8 matches. */
export function compactMatchEvents<T>(value:T):T{
 const visit=(v:any)=>{if(!v||typeof v!=='object'||visited.has(v))return;visited.add(v);
  if(typeof v.fixtureId==='string'&&Array.isArray(v.events)&&v.events.length>=16&&!archives.has(v.events)){
   const owned=JSON.parse(JSON.stringify(v.events)),raw=canonicalBytes(owned),bytes=gzipSync(raw,{level:1});
   v.events=proxy({bytes,descriptor:{tag:'kball-events-v1',canonical:true,count:v.events.length,rawBytes:raw.length,hash:hex(bytes),blob:new Blob([bytes as Uint8Array<ArrayBuffer>])}});
  }
  for(const k of Object.keys(v))if(!archives.has(v[k]))visit(v[k]);
 };visit(value);return value;
}
/** A native structured-clone cache, never a public JSON save format. */
export function archiveWire(value:any):any{
 const copies=new WeakMap<object,any>();
 const copy=(v:any):any=>{if(!v||typeof v!=='object')return v;const archive=archives.get(v);if(archive)return archive.descriptor;if(copies.has(v))return copies.get(v);const out:any=Array.isArray(v)?[]:{};copies.set(v,out);for(const k of Object.keys(v))out[k]=copy(v[k]);return out;};return copy(value);
}
export async function restoreArchiveWire(value:any):Promise<any>{
 const pending:{source:EventArchive;parent:any;key:string}[]=[];
 const visit=(v:any)=>{if(!v||typeof v!=='object')return;for(const k of Object.keys(v)){const child=v[k];if(child?.tag==='kball-events-v1'){if(!Number.isSafeInteger(child.count)||child.count<16||child.count>10000||!Number.isSafeInteger(child.rawBytes)||child.rawBytes<2||child.rawBytes>64*1024*1024||!(child.blob instanceof Blob)||child.blob.size>64*1024*1024||!/^[a-f0-9]{64}$/.test(child.hash))throw Error('경기 보관 형식이 올바르지 않습니다.');pending.push({source:child,parent:v,key:k});}else visit(child);}};
 visit(value);let cursor=0;await Promise.all(Array.from({length:Math.min(16,pending.length)},async()=>{while(cursor<pending.length){const p=pending[cursor++],bytes=new Uint8Array(await p.source.blob.arrayBuffer());if(hex(bytes)!==p.source.hash)throw Error('보관된 경기 원본이 손상됐습니다.');p.parent[p.key]=proxy({descriptor:p.source,bytes});}}));return value;
}
/** Clone mutable metadata while sharing only immutable archived event arrays. */
export function cloneWithEventArchives<T>(value:T):T{
 const copies=new WeakMap<object,any>();const copy=(v:any):any=>{if(!v||typeof v!=='object'||archives.has(v))return v;if(v instanceof Blob)return v;if(copies.has(v))return copies.get(v);const out:any=Array.isArray(v)?new Array(v.length):{};copies.set(v,out);for(const k of Object.keys(v))out[k]=copy(v[k]);return out;};return copy(value);
}

/** Verified canonical JSON bytes can feed hashing/export without millions of proxy reads. */
export function canonicalEventBytes(value:object):Uint8Array<ArrayBuffer>|undefined{
 const state=archives.get(value);if(!state?.descriptor.canonical)return;
 return gunzipSync(state.bytes) as Uint8Array<ArrayBuffer>;
}
