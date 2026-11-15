import test from 'node:test';import assert from 'node:assert/strict';
import {createCareer} from './engine';import {executeCommand} from './commands';import {packGameResult} from './worker-result';import {prepareGameDelta,replayGameDelta,sealCareer} from './game-delta';import {compactMatchEvents} from './event-archive';import {canonicalHash} from './canonical-bytes';import {validateEngineResult} from './storage';
test('compact change records authenticate and replay every event with bounded compressed metadata',async()=>{
 const c=sealCareer(createCareer({name:'압축 변경 검수',nationality:'대한민국',age:35,height:180,weight:77,foot:'right',position:'CDM',talent:'S',style:'앵커맨',clubId:'DE1_03',squad:'senior',difficulty:'realistic',seed:'archived-delta'}));
 const n=executeCommand(c,{type:'advance',weeks:1},'archived-step');validateEngineResult(c,n);const expected=canonicalHash(n,64*1024*1024);compactMatchEvents(n);
 const delta=await prepareGameDelta(packGameResult(c,n),true);assert.ok(delta);assert.equal(delta.format,'kball-game-delta-v2');assert.equal(delta.blob.size,delta.rawBytes);assert.ok(delta.blob.size<2*1024*1024);
 const replayed=await replayGameDelta(c,delta,true);assert.equal(canonicalHash(replayed,64*1024*1024),expected);validateEngineResult(c,replayed);
 const bytes=new Uint8Array(await delta.blob.arrayBuffer());bytes[bytes.length-2]^=1;await assert.rejects(replayGameDelta(c,{...delta,blob:new Blob([bytes])}),/손상/);
});
