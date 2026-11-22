import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {createCareer} from './engine';
import {decodeStored,packEnvelope,prepareStored,recordFingerprint,type BlobCareer} from './save-codec';
import {deleteSlot,exportCareer,importCareer,loadCareer,prepareEnvelope,prepareImportedSnapshot,saveCareer} from './storage';
import type {Career} from './types';

const fresh=()=>createCareer({name:'저장 가져오기 검수',nationality:'대한민국',age:22,height:180,weight:76,
 foot:'right',position:'ST',talent:'S',style:'포처',clubId:'EN1_01',squad:'senior',difficulty:'realistic',seed:'save-import-worker'});

test('the exact verified import commits without repacking, but replacement objects receive full validation',async()=>{
 const original=globalThis.Worker,operations:string[]=[];
 class TestWorker {
  private message?: (event:{data:unknown})=>void;
  addEventListener(kind:string,listener:(event:{data:unknown})=>void){if(kind==='message')this.message=listener;}
  terminate(){}
  postMessage({id,operation,payload}:{id:string;operation:string;payload:Blob|Career|BlobCareer}){
   operations.push(operation);
   void (async()=>{
    if(operation==='prepareImport')return prepareImportedSnapshot(payload as Blob);
    if(operation==='prepare')return prepareStored(payload as Career);
    if(operation==='decode')return decodeStored(payload as BlobCareer);
    throw Error('Unexpected Worker operation');
   })().then(result=>this.message?.({data:{id,result}}),error=>this.message?.({data:{id,error:error.message}}));
  }
 }
 const source=fresh(),input=new Blob([await exportCareer(source)]),originalBytes=await input.arrayBuffer();
 globalThis.Worker=TestWorker as unknown as typeof Worker;
 try{
  const imported=await importCareer(input);
  assert.notEqual(imported.id,source.id);
  assert.ok(Object.isFrozen(imported)&&Object.isFrozen(imported.player.attributes));
  const bad={...imported,player:{...imported.player,attributes:{...imported.player.attributes,shooting:-1}}};
  await assert.rejects(saveCareer(bad),/범위|능력/);
  assert.deepEqual(operations,['prepareImport','prepare']);
  await saveCareer(imported);
  assert.deepEqual(operations,['prepareImport','prepare']);
  assert.deepEqual((await loadCareer(imported.id)).player,source.player);
  assert.deepEqual(await input.arrayBuffer(),originalBytes);
  await deleteSlot(imported.id);
 }finally{globalThis.Worker=original;}
});

test('same-tab verified snapshot reuse rejects same-size corruption even with identical metadata',async()=>{
 const oldSelf=Object.getOwnPropertyDescriptor(globalThis,'self');
 type Request={id:string;operation:string;payload:BlobCareer};
 type Response={result?:{career:Career};error?:string;progress?:{phase:string}};
 let request: (event:{data:Request})=>void;
 let accept: (value:Response)=>void;
 Object.defineProperty(globalThis,'self',{configurable:true,value:{
  addEventListener(_key:string,listener:typeof request){request=listener;},
  postMessage(value:Response){accept(value);}
 }});
 try{
  await import('./save-worker');
  const source=fresh();
  const record={...packEnvelope(await prepareEnvelope(source,true)).record,rawBytes:64*1024*1024};
  let seq=0;
  const send=(payload:BlobCareer)=>new Promise<{result:Response;phases:string[]}>(resolve=>{
   const phases:string[]=[];
   accept=value=>{if(value.progress)phases.push(value.progress.phase);else resolve({result:value,phases});};
   request({data:{id:String(++seq),operation:'decode',payload}});
  });
  assert.equal((await send(record)).result.result?.career.id,source.id);
  const warmed=await send(record);
  assert.equal(warmed.result.result?.career.id,source.id);
  assert.ok(warmed.phases.includes('검증된 저장 사용'));
  const content=await record.blob.text();
  const changed=new Blob([content.replace(source.player.name,'저장 가져오기 변조')],{type:record.blob.type});
  assert.equal(changed.size,record.blob.size);
  const corrupted={...record,blob:changed};
  assert.equal(recordFingerprint(corrupted),recordFingerprint(record));
  const rejected=await send(corrupted);
  assert.match(rejected.result.error??'',/손상/);
 }finally{
  if(oldSelf)Object.defineProperty(globalThis,'self',oldSelf);else Reflect.deleteProperty(globalThis,'self');
 }
});
