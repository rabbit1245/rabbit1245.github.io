import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,setPersonalityValues} from './engine';
import {executeCommand} from './commands';
import {commandChange} from './command-patches';
import {personality,DEFAULT_PERSONALITY,type Personality} from './personality';
import {saveCareer,saveCareerChange,loadCareer,exportCareer,verifySaveText} from './storage';

const fresh=()=>createCareer({name:'성향 일괄 저장',nationality:'대한민국',age:26,height:180,weight:75,foot:'right',position:'ST',talent:'S',style:'프레싱 포워드',clubId:'EN1_12',squad:'senior',difficulty:'realistic',seed:'personality-batch-296',training:[]});
test('five edited values commit atomically in one revision and use the small change journal',async()=>{
  const c=fresh(),snapshot=JSON.stringify(c);await saveCareer(c);
  const values={leadership:10,stardom:8,fairPlay:7,clutch:9,winning:10};
  const next=executeCommand(c,{type:'personalitySet',values},'batch-personality');
  assert.equal(next.revision,c.revision+1);assert.equal(next.systems!.world,c.systems!.world);assert.equal(next.systems!.national,c.systems!.national);assert.equal(next.systems!.clubCompetitions,c.systems!.clubCompetitions);assert.ok(commandChange(c,next));
  assert.deepEqual(next.player,c.player);assert.deepEqual(next.history,c.history);assert.deepEqual(next.training,c.training);assert.equal(JSON.stringify(c),snapshot);
  values.leadership=1;assert.equal(personality(next).leadership,10,'the command copies its edit buffer');
  await saveCareerChange(c,next);assert.deepEqual(personality((await loadCareer(c.id))!),personality(next));assert.deepEqual(personality(await verifySaveText(await exportCareer(next))),personality(next));
  assert.equal(executeCommand(next,{type:'personalitySet',values},'batch-personality'),next,'duplicate command receipt cannot apply again');
});
test('invalid or partial edit buffers cannot apply any values, and retirement remains read-only',()=>{
  const c=fresh(),before=JSON.stringify(c);
  for(const values of [{...DEFAULT_PERSONALITY,leadership:11},{...DEFAULT_PERSONALITY,clutch:1.2},{...DEFAULT_PERSONALITY,extra:5},{leadership:8},null,[],Object.assign(Object.create({leadership:5}),{stardom:5,fairPlay:5,clutch:5,winning:5,extra:5})])assert.throws(()=>setPersonalityValues(c,values as Personality),/성향/);
  assert.equal(JSON.stringify(c),before);assert.throws(()=>setPersonalityValues({...c,stage:'retired'},{...DEFAULT_PERSONALITY}),/성향/);
});
test('batch and legacy personality commands bypass the game Worker and retain incremental saving',async()=>{
  const original=globalThis.Worker;let workers=0;
  globalThis.Worker=class{constructor(){workers++;throw Error('Personality must not serialize the full career to a Worker');}} as unknown as typeof Worker;
  try{
    const {runGameCommand}=await import('./client'),c=fresh();
    const next=await runGameCommand(c,{type:'personalitySet',values:{...DEFAULT_PERSONALITY,leadership:10,winning:10}});assert.equal(workers,0);assert.ok(commandChange(c,next));assert.equal(next.revision,c.revision+1);
    const legacy=await runGameCommand(next,{type:'personality',key:'clutch',value:10});assert.equal(workers,0);assert.ok(commandChange(next,legacy));
  }finally{globalThis.Worker=original;}
});
