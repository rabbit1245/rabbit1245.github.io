import test from 'node:test';
import assert from 'node:assert/strict';
import {CheckpointScheduler} from './checkpoint-scheduler';

test('large snapshots wait for quiet input while journal pressure and small snapshots flush promptly',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let now=0;const calls:string[]=[],s=new CheckpointScheduler(async id=>{calls.push(id);s.fullSaved(id);},()=>now),large={bytes:200*1024*1024,entries:1,journalBytes:300};
 const tick=async(ms:number)=>{now+=ms;t.mock.timers.tick(ms);await Promise.resolve();await Promise.resolve();await Promise.resolve();};
 try{
  s.fullSaved('career');s.schedule('career',large);await tick(1500);assert.deepEqual(calls,[]);
  await tick(50_000);s.activity('career');await tick(14_999);assert.deepEqual(calls,[]);await tick(1);assert.deepEqual(calls,['career']);
  s.schedule('career',{...large,entries:64});await tick(0);assert.deepEqual(calls,['career','career'],'a growing journal flushes before hitting its safety limits');
  s.schedule('small',{bytes:100,entries:1,journalBytes:100});await tick(1499);assert.equal(calls.length,2);await tick(1);assert.equal(calls.at(-1),'small');
 }finally{t.mock.timers.reset();}
});

test('foreground tasks pause pending checkpoints across slots and resume once without starving canceled jobs',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const calls:string[]=[],hint={bytes:200,entries:1,journalBytes:200};let finish!:()=>void;
 const s=new CheckpointScheduler(async id=>{calls.push(id);if(id==='running')await new Promise<void>(r=>finish=r);else s.fullSaved(id);});
 const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
 try{
  s.schedule('a',hint);const resume=s.pause();s.schedule('b',hint);t.mock.timers.tick(20_000);await flush();assert.deepEqual(calls,[]);resume();resume();t.mock.timers.tick(1500);await flush();assert.deepEqual(calls,['a','b']);
  s.schedule('running',hint);t.mock.timers.tick(1500);await flush();const release=s.pause();s.schedule('running',{...hint,entries:2});release();finish();await flush();t.mock.timers.tick(1500);await flush();assert.equal(calls.filter(x=>x==='running').length,2);
  s.forget('running');finish();await flush();s.schedule('deleted',hint);s.forget('deleted');t.mock.timers.tick(30_000);await flush();assert.ok(!calls.some(id=>id==='deleted'));
 }finally{t.mock.timers.reset();}
});
