import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import type {Career} from './types';
import type {BlobCareer,PreparedSave} from './save-codec';

test('save Worker cancellation preserves full requests and clears settled request timers',async t=>{
 if(!globalThis.crypto?.randomUUID)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
 const original=globalThis.Worker;
 class FakeWorker {
  static instances:FakeWorker[]=[];
  listeners=new Map<string,(event:any)=>void>();sent:any[]=[];terminated=false;
  constructor(){FakeWorker.instances.push(this);}
  addEventListener(kind:string,fn:(event:any)=>void){this.listeners.set(kind,fn);}
  postMessage(data:unknown){this.sent.push(data);}
  terminate(){this.terminated=true;}
  reply(index:number,result:unknown){this.listeners.get('message')?.({data:{id:this.sent[index].id,result}});}
 }
 globalThis.Worker=FakeWorker as unknown as typeof Worker;
 t.mock.timers.enable({apis:['setTimeout']});
 try{
  const api=await import('./save-preparation');
  const record={} as BlobCareer,career={} as Career,result={} as PreparedSave;
  const deferred=api.checkpointOffThread(record),rejected=assert.rejects(deferred,/변경 기록은 보존/);
  const full=api.prepareSaveOffThread(career);await rejected;
  assert.equal(FakeWorker.instances[0].terminated,true);
  const worker=FakeWorker.instances[1];
  const checkpoint=api.checkpointOffThread(record),verify=api.verifyFileOffThread('source');
  assert.equal(worker.terminated,false,'a queued checkpoint cannot cancel the pending full save');
  worker.reply(0,result);worker.reply(1,result);worker.reply(2,career);
  assert.equal(await full,result);assert.equal(await checkpoint,result);assert.equal(await verify,career);
  t.mock.timers.tick(60_001);assert.equal(worker.terminated,false,'completed requests leave no live timeout');
  const stalled=api.prepareSaveOffThread(career),timeout=assert.rejects(stalled,/초과/);
  t.mock.timers.tick(60_001);await timeout;assert.equal(worker.terminated,true);
 }finally{t.mock.timers.reset();globalThis.Worker=original;}
});
