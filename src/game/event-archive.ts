import {canonicalBytes,type JSONShape} from './canonical-bytes';
import {gzipSync,gunzipSync,strFromU8} from 'fflate';
import {sha256} from '@noble/hashes/sha256';

export interface EventArchive {
 tag:'kball-events-v1';
 count:number;
 rawBytes:number;
 hash:string;
 blob:Blob;
 canonical?:true;
}

type State={descriptor:EventArchive;bytes:Uint8Array<ArrayBuffer>;shape?:JSONShape};
const archives=new WeakMap<object,State&{load:()=>readonly unknown[]}>();
const encodedArrays=new WeakMap<readonly unknown[],State>();
const recent=new Map<object,readonly unknown[]>();
const readMethods=new Set<PropertyKey>([Symbol.iterator,'map','filter','some','every','find','findIndex','forEach','reduce','reduceRight','slice','includes','indexOf','lastIndexOf','values','entries','keys','at','join','toString']);
const MAX_EVENT_BYTES=64*1024*1024;
let lastKey:object|undefined,lastRows:readonly unknown[]|undefined;

const hashBytes=(bytes:Uint8Array)=>Array.from(sha256(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
const arrayIndex=(key:PropertyKey)=>typeof key==='string'&&/^(0|[1-9]\d*)$/.test(key)?Number(key):-1;
const isMatch=(value:Record<string,unknown>)=>typeof value.fixtureId==='string'&&Array.isArray(value.events);
export const isEventArchive=(value:object)=>archives.has(value);
export function archivedJSONShape(value:object):JSONShape|undefined{
 const archive=archives.get(value);
 if(!archive)return;
 if(!archive.shape)archive.load();
 return archive.shape;
}

function freezeJSON(value:unknown,shape?:JSONShape,depth=1):void{
 if(!value||typeof value!=='object')return;
 const row=value as Record<string,unknown>;
 const keys=Object.keys(row);
 if(shape&&keys.length){
  shape.properties+=keys.length;
  shape.depth=Math.max(depth,shape.depth);
  if(depth>64||shape.properties>64_000_000)throw Error('저장 구조가 지나치게 크거나 깊습니다.');
 }
 for(const key of keys){
  if(shape&&['__proto__','constructor','prototype'].includes(key))throw Error('허용하지 않는 속성이 포함되어 있습니다.');
  freezeJSON(row[key],shape,depth+1);
 }
 Object.freeze(value);
}

function inflateEvents(state:State):Uint8Array<ArrayBuffer>{
 const {bytes,descriptor}=state;
 if(bytes.length<18||new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(bytes.length-4,true)!==descriptor.rawBytes)
  throw Error('경기 원본의 확장 크기가 다릅니다.');
 const raw=gunzipSync(bytes) as Uint8Array<ArrayBuffer>;
 if(raw.length!==descriptor.rawBytes)throw Error('경기 원본의 확장 크기가 다릅니다.');
 return raw;
}

function lazyEvents(state:State):unknown[]{
 Object.freeze(state.descriptor);
 const key={};
 const archive={...state,load};
 function load():readonly unknown[]{
  if(lastKey===key)return lastRows!;
  let rows=recent.get(key);
  if(rows)recent.delete(key);
  else{
   const parsed=JSON.parse(strFromU8(inflateEvents(archive)));
   if(!Array.isArray(parsed)||parsed.length!==archive.descriptor.count)throw Error('경기 원본 목록이 다릅니다.');
   const shape=archive.shape?undefined:{properties:0,depth:0};
   freezeJSON(parsed,shape);
   if(shape)archive.shape=shape;
   rows=parsed;
  }
  recent.set(key,rows);
  if(recent.size>8)recent.delete(recent.keys().next().value!);
  lastKey=key;
  lastRows=rows;
  return rows;
 }
 const immutable=()=>{throw new TypeError('보관된 경기 이벤트는 읽기 전용입니다.');};
 const result=new Proxy(new Array(state.descriptor.count),{
  get(target,property,receiver){
   const index=arrayIndex(property);
   if(index>=0)return index<target.length?load()[index]:undefined;
   if(readMethods.has(property)){
    const rows=load();
    const method=Reflect.get(rows,property) as Function;
    return method.bind(rows);
   }
   return Reflect.get(target,property,receiver);
  },
  has(target,property){
   const index=arrayIndex(property);
   return index>=0?index<target.length:Reflect.has(target,property);
  },
  ownKeys(target){return [...Array.from({length:target.length},(_,i)=>String(i)),'length'];},
  getOwnPropertyDescriptor(target,property){
   const index=arrayIndex(property);
   if(index>=0&&index<target.length)return {value:load()[index],enumerable:true,writable:false,configurable:true};
   return Reflect.getOwnPropertyDescriptor(target,property);
  },
  set:immutable,deleteProperty:immutable,defineProperty:immutable,setPrototypeOf:immutable,preventExtensions:immutable,
 });
 archives.set(result,archive);
 return result;
}

function archiveEvents(events:readonly unknown[]):State{
 const existing=archives.get(events)??encodedArrays.get(events);
 if(existing)return existing;
 const shape:JSONShape={properties:0,depth:0};
 const raw=canonicalBytes(events,shape);
 // A small hash table is sufficient for one match and avoids allocating a
 // large table for every one of the thousands of archived fixtures.
 const bytes=gzipSync(raw,{level:1,mem:3,mtime:0}) as Uint8Array<ArrayBuffer>;
 const descriptor:EventArchive=Object.freeze({
  tag:'kball-events-v1',canonical:true,count:events.length,rawBytes:raw.byteLength,
  hash:hashBytes(bytes),blob:new Blob([bytes]),
 });
 const state={bytes,descriptor,shape};
 // Only a sealed array can be reused after a later command.
 if(Object.isFrozen(events))encodedArrays.set(events,state);
 return state;
}

/** Compact freshly parsed data and new game records. Sealed branches are
 * shared with the prior revision and may contain ordinary event arrays. */
export function compactMatchEvents<T>(value:T):T{
 const visited=new WeakSet<object>();
 const visit=(node:unknown)=>{
  if(!node||typeof node!=='object'||Object.isFrozen(node)||isEventArchive(node)||visited.has(node))return;
  visited.add(node);
  const row=node as Record<string,unknown>;
  const property=Object.getOwnPropertyDescriptor(row,'events');
  if(property?.writable&&isMatch(row)&&Array.isArray(row.events)&&row.events.length>=16&&!isEventArchive(row.events))
   row.events=lazyEvents(archiveEvents(row.events));
  for(const child of Object.values(row))visit(child);
 };
 visit(value);
 return value;
}

/** Copy for transport without rewriting the live graph, even at the point
 * where a six-season career first switches from ordinary arrays to archives. */
export function archiveWire(value:unknown):unknown{
 const copies=new WeakMap<object,unknown>();
 const copy=(node:unknown):unknown=>{
  if(!node||typeof node!=='object'||node instanceof Blob)return node;
  const state=archives.get(node);
  if(state)return state.descriptor;
  const existing=copies.get(node);
  if(existing)return existing;
  const result:Array<unknown>|Record<string,unknown>=Array.isArray(node)?new Array(node.length):{};
  copies.set(node,result);
  const row=node as Record<string,unknown>;
  const match=isMatch(row);
  for(const key of Object.keys(row)){
   const child=row[key];
   const next=match&&key==='events'&&Array.isArray(child)&&child.length>=16?archiveEvents(child).descriptor:copy(child);
   Object.defineProperty(result,key,{value:next,enumerable:true,configurable:true,writable:true});
  }
  return result;
 };
 return copy(value);
}

function isDescriptor(value:unknown):value is EventArchive{
 return !!value&&typeof value==='object'&&(value as Partial<EventArchive>).tag==='kball-events-v1';
}

export async function restoreArchiveWire<T>(value:T,readBytes?: (blob:Blob)=>Uint8Array<ArrayBuffer>|undefined):Promise<T>{
 const pending:{source:EventArchive;parent:Record<string,unknown>;key:string}[]=[];
 const seen=new WeakSet<object>();
 const visit=(node:unknown)=>{
  if(!node||typeof node!=='object'||node instanceof Blob||seen.has(node))return;
  seen.add(node);
  const parent=node as Record<string,unknown>;
  for(const [key,child] of Object.entries(parent)){
   if(!isDescriptor(child)){visit(child);continue;}
   if(key!=='events'||typeof parent.fixtureId!=='string'||!Number.isSafeInteger(child.count)||child.count<16||child.count>10000||
    !Number.isSafeInteger(child.rawBytes)||child.rawBytes<2||child.rawBytes>MAX_EVENT_BYTES||!(child.blob instanceof Blob)||
    child.blob.size>MAX_EVENT_BYTES||!/^[a-f0-9]{64}$/.test(child.hash))
    throw Error('경기 보관 형식이 올바르지 않습니다.');
   pending.push({source:child,parent,key});
  }
 };
 visit(value);
 let cursor=0;
 await Promise.all(Array.from({length:Math.min(16,pending.length)},async()=>{
  while(cursor<pending.length){
   const {source,parent,key}=pending[cursor++];
   const bytes=readBytes?.(source.blob)??new Uint8Array(await source.blob.arrayBuffer());
   if(hashBytes(bytes)!==source.hash)throw Error('보관된 경기 원본이 손상됐습니다.');
   parent[key]=lazyEvents({descriptor:source,bytes});
  }
 }));
 return value;
}

/** Clone mutable metadata while sharing only immutable archived event arrays. */
export function cloneWithEventArchives<T>(value:T):T{
 const copies=new WeakMap<object,object>();
 const copy=(node:unknown):unknown=>{
  if(!node||typeof node!=='object'||isEventArchive(node)||node instanceof Blob)return node;
  const existing=copies.get(node);
  if(existing)return existing;
  const result=Array.isArray(node)?new Array(node.length):{};
  copies.set(node,result);
  for(const [key,child] of Object.entries(node))
   Object.defineProperty(result,key,{value:copy(child),enumerable:true,configurable:true,writable:true});
  return result;
 };
 return copy(value) as T;
}

/** Feed hashing and JSON exports the same event fields without proxy reads. */
export function canonicalEventBytes(value:object):Uint8Array<ArrayBuffer>|undefined{
 const state=archives.get(value);
 return state?.descriptor.canonical?inflateEvents(state):undefined;
}
