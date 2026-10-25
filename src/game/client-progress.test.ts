import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import type {Career} from './types';

test('worker progress keeps a long injury command alive; silence still times out and retains the save',async t=>{
 if(!globalThis.crypto?.randomUUID)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
 const oldWorker=globalThis.Worker;
 class FakeWorker {
  static instance:FakeWorker;
  listeners=new Map<string,(event:any)=>void>();sent:any[]=[];terminated=false;
  constructor(){FakeWorker.instance=this;}
  addEventListener(kind:string,callback:(event:any)=>void){this.listeners.set(kind,callback);}
  postMessage(value:unknown){this.sent.push(value);}
  terminate(){this.terminated=true;}
  emit(data:unknown){this.listeners.get('message')?.({data});}
 }
 globalThis.Worker=FakeWorker as unknown as typeof Worker;
 t.mock.timers.enable({apis:['setTimeout']});
 try{
  const {runGameCommand}=await import('./client');
  const career={id:'long-injury',revision:0} as Career,progress:unknown[]=[];
  const pending=runGameCommand(career,{type:'manualInjury',duration:'season'},p=>progress.push(p));
  const worker=FakeWorker.instance,id=worker.sent[0].id;
  for(let round=1;round<=3;round++){t.mock.timers.tick(59_000);worker.emit({id,progress:{year:2027,round,total:38}});assert.equal(worker.terminated,false);}
  const next={...career,revision:1};worker.emit({id,career:next});assert.equal(await pending,next);assert.equal(progress.length,3);
  const stalled=runGameCommand(next,{type:'advance',weeks:1});assert.equal(worker.sent[1].careerId,next.id);assert.equal(worker.sent[1].career,undefined);
  const rejected=assert.rejects(stalled,/저장된 상태는 유지/);t.mock.timers.tick(60_001);await rejected;assert.equal(worker.terminated,true);assert.equal(next.revision,1);
 }finally{t.mock.timers.reset();globalThis.Worker=oldWorker;}
});
