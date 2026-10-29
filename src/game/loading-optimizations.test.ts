import test from 'node:test';
import assert from 'node:assert/strict';
import {jsonBlob} from './json-blob';
import {canonicalBytes} from './canonical-bytes';
import {createCareer,refreshContractOffers} from './engine';
import {commandChange} from './command-patches';
import {runGameCommand,releaseIdleGameWorker} from './client';

test('encoded JSON chunks preserve long tokens, chunk boundaries, Unicode and every byte',async()=>{
 const values={long:'한글😀\ud800'.repeat(60000),rows:Array.from({length:9000},(_,i)=>({id:i,text:'축구⚽😀',absent:undefined,values:[undefined,-0,1e30,null,true]}))};
 const expected=new TextEncoder().encode(JSON.stringify(values)),blob=jsonBlob(values);
 assert.equal(blob.type,'application/json');assert.equal(blob.size,expected.length);assert.deepEqual(new Uint8Array(await blob.arrayBuffer()),expected);
});

test('canonical property token reuse preserves legacy ordering, undefined arrays and escaped keys',()=>{
 const input={z:[undefined,1,,null],a:{'한글😀':'\ud800','quote"':-0,'10':1,'2':2,absent:undefined}};
 assert.equal(new TextDecoder().decode(canonicalBytes(input)),'{"a":{"10":1,"2":2,"quote\\\"":0,"한글😀":"\\ud800"},"z":[,1,,null]}');
 const distinct=Object.fromEntries(Array.from({length:4500},(_,i)=>[`k${String(i).padStart(4,'0')}`,i]));
 assert.equal(new TextDecoder().decode(canonicalBytes(distinct)),JSON.stringify(distinct),'unusual property names beyond the bounded token cache remain intact');
});

test('refreshing transfer proposals preserves incremental persistence instead of copying a full career into a worker',async()=>{
 const original=globalThis.Worker;let constructed=0;
 globalThis.Worker=class {constructor(){constructed++;throw Error('Unexpected full-career worker');}} as unknown as typeof Worker;
 try{
  const c=createCareer({name:'가벼운 이적 확인',nationality:'대한민국',age:24,height:180,weight:75,foot:'right',position:'ST',talent:'S',style:'포처',clubId:'EN1_18',squad:'senior',difficulty:'realistic',seed:'light-offers-loading',training:[]});c.stage='offseason';c.offers=[];
  const snapshot=JSON.stringify(c),expected=refreshContractOffers(c),next=await runGameCommand(c,{type:'refreshOffers'});
  assert.equal(constructed,0);assert.equal(JSON.stringify(c),snapshot);assert.deepEqual(next.offers,expected.offers);
  assert.equal(next.systems!.world,c.systems!.world);assert.ok(commandChange(c,next),'the engine receipt must reach saveCareerChange without a structured clone');
 }finally{releaseIdleGameWorker();globalThis.Worker=original;}
});
