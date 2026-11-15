import test from 'node:test';import assert from 'node:assert/strict';
import {packCareerTransfer,unpackCareerTransfer} from './career-transfer';
import type {Career} from './types';
test('compressed transport preserves complete JSON records, Unicode and chunk boundaries without a raw career Blob',async()=>{
 const input={name:'록 카발란 ⚽',long:'한글😀'.repeat(100000),rows:Array.from({length:12000},(_,i)=>({i,detail:'기록·득점·패스😀'.repeat(10),optional:i%2?undefined:null})),array:[undefined,null,NaN],history:Array(6).fill({year:2044})} as unknown as Career;
 const expected=JSON.parse(JSON.stringify(input)),packed=await packCareerTransfer(input);
 assert.equal(packed.rawBytes,new TextEncoder().encode(JSON.stringify(input)).length);assert.ok(packed.blob.size<packed.rawBytes/4);assert.deepEqual(await unpackCareerTransfer(packed),expected);
 await assert.rejects(unpackCareerTransfer({...packed,rawBytes:packed.rawBytes-1}));await assert.rejects(unpackCareerTransfer({...packed,blob:packed.blob.slice(0,packed.blob.size-10)}));
});
