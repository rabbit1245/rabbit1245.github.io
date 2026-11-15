import test from 'node:test';import assert from 'node:assert/strict';
import {compactMatchEvents,archiveWire,restoreArchiveWire,cloneWithEventArchives} from './event-archive';
import {encodeArchiveWire,decodeArchiveWire} from './archive-wire';import {canonicalHash} from './canonical-bytes';import {sealCareer} from './game-delta';
const fixture=()=>({fixtureId:'fixture',events:Array.from({length:200},(_,i)=>({id:String(i),detail:'전체 원본 한글😀',action:{kind:'shot',value:i}})),performers:[]});
test('lazy immutable event arrays preserve all fields, array methods, canonical bytes, clones and binary exports',async()=>{
 const original=fixture(),json=JSON.stringify(original),hash=canonicalHash(original,1024*1024),compact=compactMatchEvents(fixture());
 assert.deepEqual(JSON.parse(JSON.stringify(compact)),original);assert.equal(canonicalHash(compact,1024*1024),hash);assert.ok(Array.isArray(compact.events));assert.equal(compact.events.filter(e=>e.action.value%2===0).length,100);assert.equal(compact.events.some(e=>e.id==='150'),true);assert.equal(Object.keys(compact.events).length,200);
 assert.throws(()=>{compact.events[0].detail='changed';});assert.throws(()=>compact.events.push(compact.events[0]));assert.throws(()=>Object.setPrototypeOf(compact.events,{}));sealCareer(compact as any);
 const copy=cloneWithEventArchives(compact);assert.notEqual(copy,compact);assert.equal(copy.events,compact.events);
 assert.deepEqual(JSON.parse(JSON.stringify(await restoreArchiveWire(structuredClone(archiveWire(compact))))),original);
 assert.deepEqual(JSON.parse(JSON.stringify(await decodeArchiveWire(await encodeArchiveWire(compact)))),original);
 const wire=structuredClone(archiveWire(compact));wire.events.blob=new Blob(['broken']);await assert.rejects(restoreArchiveWire(wire));
 const encoded=await encodeArchiveWire(compact);await assert.rejects(decodeArchiveWire(encoded.slice(0,-1)));
});
