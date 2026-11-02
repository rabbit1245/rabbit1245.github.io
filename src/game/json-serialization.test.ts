import test from 'node:test';import assert from 'node:assert/strict';import {jsonBlob} from './json-blob';import {canonicalBytes} from './canonical-bytes';
const canonical=(v:any):string=>{if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return `[${v.map(canonical).join(',')}]`;return `{${Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')}}`;};
test('fast scalar/key tokens retain exact JSON text and legacy checksum bytes across numbers, missing values and Unicode',async()=>{
 const values:any[]=[0,-0,true,false,null,NaN,Infinity,-Infinity,Number.MIN_VALUE,Number.MAX_VALUE,Number.MAX_SAFE_INTEGER,1e-7,1e21,'한국어 ⚽ \ud800',undefined,[undefined,,null,0],Object.fromEntries([['__proto__',1],['quoted"key\n',false],['없음',undefined]])];
 let seed=2121;for(let i=0;i<300;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;values.push({z:seed/Math.PI,a:[seed,-seed/17,undefined],b:{flag:i%2===0,text:'기록 보존 '+i}});}
 for(const v of values){assert.equal(await jsonBlob(v).text(),JSON.stringify(v)??'');assert.deepEqual(canonicalBytes(v),new TextEncoder().encode(canonical(v)));}
 assert.throws(()=>jsonBlob(1n));assert.throws(()=>canonicalBytes(1n));
});
test('chunked UTF-8 output preserves long values, unusual extension keys and all event records',async()=>{
 const v={['키'.repeat(300)]:Array.from({length:500},(_,i)=>({id:String(i),goals:i%7,detail:'헤더 득점·압박·전진 패스·한글 ⚽'.repeat(50),optional:i%2?undefined:false})),long:'한글😀\udfff'.repeat(50000)};
 assert.equal(await jsonBlob(v).text(),JSON.stringify(v));assert.deepEqual(canonicalBytes(v),new TextEncoder().encode(canonical(v)));
});
