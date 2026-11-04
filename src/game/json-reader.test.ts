import test from 'node:test';import assert from 'node:assert/strict';
import {readJSONBlob,SaveReadError} from './json-reader';
import {jsonBlob} from './json-blob';
const read=(blob:Blob)=>readJSONBlob(blob,{maximum:64*1024*1024,stream:true});
test('bounded parsing matches native JSON for large nested objects, Unicode, escaped strings, arrays and primitive roots',async()=>{
 const values=[null,true,false,123,-1.3e-20,'문자열😀\\\"\n',[],{},[1,null,'x'],{a:[1,2],b:{c:true}},Object.fromEntries([['__proto__',{x:1}],['constructor',7]])];
 for(const value of values)assert.deepEqual(await read(jsonBlob(value)),JSON.parse(JSON.stringify(value)));
 const large={header:'한글⚽',rows:Array.from({length:70000},(_,i)=>({id:i,label:'공격·수비·패스😀'.repeat(8),nested:[i,i+1,{text:'"\\\n'}]})),tail:{ended:true}};
 assert.deepEqual(await read(jsonBlob(large)),large);
 const giantString='한글'.repeat(400000);assert.deepEqual(await read(jsonBlob({giantString,after:42})),{giantString,after:42});
});
test('bounded parser rejects malformed syntax at capture boundaries, trailing content, invalid strings, truncated JSON and sizes',async()=>{
 const padding=' '.repeat(4*1024*1024+100);
 for(const text of ['',' ','undefined','NaN','01','1e','[1,]','{"a":1,}','{"a" 1}','{"a":}','[1 2]','{"a":1} false','"bad\\x"','"broken','[{]',`{${padding}"a":[1,]}`,`[${padding}{"x":1},]`,`{${padding}"a":1`])await assert.rejects(read(new Blob([text])),SaveReadError,text.slice(0,40));
 await assert.rejects(readJSONBlob(new Blob(['{}']),{maximum:1,stream:true}),SaveReadError);
});
test('compressed parsing validates original bytes, truncation and expanded size for both native and streaming paths',async()=>{
 const value={name:'스이쿤',rows:Array.from({length:30000},(_,i)=>({id:i,text:'기록·클럽·국대 ⚽'.repeat(6)}))},raw=jsonBlob(value),blob=await new Response(raw.stream().pipeThrough(new CompressionStream('gzip'))).blob();
 for(const stream of [false,true]){
  const opts={maximum:64*1024*1024,encoding:'gzip' as const,rawBytes:raw.size,stream};assert.deepEqual(await readJSONBlob(blob,opts),value);
  await assert.rejects(readJSONBlob(blob,{...opts,rawBytes:raw.size+1}),SaveReadError);
  await assert.rejects(readJSONBlob(blob.slice(0,blob.size-10),opts),SaveReadError);
 }
});
