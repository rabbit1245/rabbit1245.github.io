import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalBytes} from './canonical-bytes';
const original=(value:any):string=>{if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(original).join(',')}]`;const fields=Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0);return `{${fields.map(([k,v])=>`${JSON.stringify(k)}:${original(v)}`).join(',')}}`;};
test('buffered canonical bytes preserve every legacy byte across key order and Unicode chunk boundaries',()=>{
 const values:unknown[]=[null,true,0,-0,1e-10,'김하늘 ⚽ \ud800',[1,undefined,null,'😀'],{z:1,'10':3,'2':4,a:undefined,b:{str:'한글 "\\\n'}}];
 for(const length of [32760,32767,32768,32769,65536])values.push({a:'x'.repeat(length)+'😀',b:'한글⚽'.repeat(20000),c:['surrogate\udfff',1.23e22]});
 for(const value of values)assert.deepEqual(canonicalBytes(value),new TextEncoder().encode(original(value)));
});
test('canonical key order is stable for arbitrary schema extension keys',()=>{
 let seed=1234;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 for(let i=0;i<200;i++){const value:Record<string,unknown>={};for(let j=0;j<35;j++)value['키'+random()%1000]=[random()/1000,{zz:random()%2?'😀':'',a:null}];assert.deepEqual(canonicalBytes(value),new TextEncoder().encode(original(value)));}
});
