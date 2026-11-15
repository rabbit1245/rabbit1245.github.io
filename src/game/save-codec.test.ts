import test from 'node:test';import assert from 'node:assert/strict';
import {packStored} from './save-codec';import {createCareer} from './engine';import {readJSONBlob} from './json-reader';
import type {SaveEnvelope} from './types';
test('streamed long snapshot encoding retains the complete envelope bytes and metadata token',async()=>{
 const career=createCareer({name:'압축 원장 검수',nationality:'대한민국',age:35,height:180,weight:77,foot:'right',position:'CDM',talent:'S',style:'앵커맨',clubId:'DE1_03',squad:'senior',difficulty:'realistic',seed:'codec-transport'});
 // This codec test examines bytes; schema validation belongs to prepareEnvelope.
 career.history=Array(6).fill({year:2026,matches:[]}) as typeof career.history;
 const envelope:SaveEnvelope={format:'kball-save',schemaVersion:1,hash:'a'.repeat(64),savedAt:new Date().toISOString(),career};
 const {record,metadata}=await packStored(envelope,'b'.repeat(64));
 assert.equal(record.encoding,'gzip');assert.equal(record.rawBytes,new TextEncoder().encode(JSON.stringify(envelope)).length);
 assert.deepEqual(await readJSONBlob(record.blob,{encoding:record.encoding,rawBytes:record.rawBytes,maximum:64*1024*1024}),JSON.parse(JSON.stringify(envelope)));
 assert.equal(metadata.hash,'b'.repeat(64));assert.equal(record.versionHash,metadata.hash);assert.deepEqual(record.journal,[]);
});
