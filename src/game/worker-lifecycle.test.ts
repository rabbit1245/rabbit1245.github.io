import test from 'node:test';
import assert from 'node:assert/strict';
import type {Career} from './types';

test('game workers keep short-career caching and release long-career copies after complete results',async()=>{
 const original=globalThis.Worker;
 class FakeWorker {
  static instances:FakeWorker[]=[];listeners=new Map<string,(event:any)=>void>();sent:any[]=[];terminated=false;
  constructor(){FakeWorker.instances.push(this);}
  addEventListener(name:string,listener:(event:any)=>void){this.listeners.set(name,listener);}
  postMessage(value:any){this.sent.push(value);}
  terminate(){this.terminated=true;}
  reply(index:number,career:Career){this.listeners.get('message')!({data:{id:this.sent[index].id,career}});}
 }
 globalThis.Worker=FakeWorker as unknown as typeof Worker;
 const api=await import('./client');
 try{
  const short={id:'short',revision:0,history:[]} as unknown as Career;
  const first=api.runGameCommand(short,{type:'advanceHalf'}),worker=FakeWorker.instances.at(-1)!;api.releaseIdleGameWorker();assert.equal(worker.terminated,false,'an in-flight command must survive');worker.reply(0,short);assert.equal(await first,short);assert.equal(worker.terminated,false);
  const second=api.runGameCommand(short,{type:'advanceHalf'});assert.equal(worker.sent[1].career,undefined);assert.equal(worker.sent[1].careerId,'short');worker.reply(1,short);await second;api.releaseIdleGameWorker();assert.ok(worker.terminated);
  const large={id:'large',revision:3,history:Array(6).fill({})} as unknown as Career;
  const third=api.runGameCommand(large,{type:'advanceHalf'}),largeWorker=FakeWorker.instances.at(-1)!;largeWorker.reply(0,large);assert.equal(await third,large);assert.ok(largeWorker.terminated);
  const fourth=api.runGameCommand(large,{type:'advanceHalf'}),freshWorker=FakeWorker.instances.at(-1)!;assert.notEqual(freshWorker,largeWorker);assert.equal(freshWorker.sent[0].career,large);freshWorker.reply(0,large);assert.equal(await fourth,large);assert.ok(freshWorker.terminated);
 }finally{api.releaseIdleGameWorker();globalThis.Worker=original;}
});
