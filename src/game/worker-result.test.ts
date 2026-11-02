import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,advanceCareer,retireCareer} from './engine';
import {packGameResult,unpackGameResult} from './worker-result';
import {validateCareer} from './storage';
const fresh=()=>createCareer({name:'Worker 기록 재사용',nationality:'대한민국',age:25,height:180,weight:78,foot:'right',position:'ST',talent:'S',style:'포처',clubId:'KR2_03',squad:'senior',difficulty:'realistic',seed:'worker-result-2121',training:[]});
function roundtrip(previous:ReturnType<typeof fresh>,next:ReturnType<typeof fresh>){const packet=packGameResult(previous,next),restored=unpackGameResult(previous,structuredClone(packet));assert.deepEqual(restored,next);validateCareer(restored);return {packet,restored};}
test('actual games preserve all results, actions, statistics and unchanged match identities through Worker transport',()=>{
 const before=advanceCareer(fresh(),1),untouched=JSON.stringify(before),next=advanceCareer(before,1),{restored,packet}=roundtrip(before,next);assert.equal(restored.season.matches[0],before.season.matches[0]);assert.ok(packet.reuse.length>0);assert.equal(JSON.stringify(before),untouched);assert.ok(JSON.stringify(packet).length<JSON.stringify(next).length);
});
test('retirement reuses archived match sources while retaining the complete new annual record',()=>{
 const before=advanceCareer(fresh(),2),next=retireCareer(before),{restored}=roundtrip(before,next);assert.equal(restored.history.at(-1)!.matches[0],before.season.matches[0]);assert.equal(restored.stage,'retired');
});
test('opaque long histories and duplicate source aliases survive without copying their event graphs',()=>{
 const before=fresh(),match={id:'immutable-match',events:Array.from({length:500},(_,i)=>({id:String(i),text:'보존할 실제 원본 구조'}))};
 before.systems!.national.teamResults=[match] as any;before.history=Array.from({length:20},(_,i)=>({year:2026+i,matches:[match]})) as any;
 const next={...before,revision:before.revision+1,history:[...before.history],season:{...before.season,matches:[match] as any}},packet=packGameResult(before,next),restored=unpackGameResult(before,structuredClone(packet));assert.deepEqual(restored,next);assert.equal(restored.history[0],before.history[0]);assert.equal(restored.season.matches[0],match);assert.equal(restored.systems!.national.teamResults![0],match);assert.doesNotMatch(JSON.stringify(packet),/보존할 실제 원본 구조/);
});
test('mismatched bases and unsafe reference paths are rejected without modifying the original save',()=>{
 const c=fresh(),next={...c,revision:c.revision+1},packet=packGameResult(c,next),before=JSON.stringify(c);assert.throws(()=>unpackGameResult({...c,revision:4},structuredClone(packet)),/기준/);
 const bad=structuredClone(packet);bad.reuse.push({target:['__proto__','corrupt'],source:['history']});assert.throws(()=>unpackGameResult(c,bad),/경로/);assert.equal(JSON.stringify(c),before);
});
