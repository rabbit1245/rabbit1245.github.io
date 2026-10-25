import type {Career,GameCommand} from './types';

export type CareerPatch = {path:(string|number)[];op:'set';value:unknown}|{path:(string|number)[];op:'delete'}|{path:(string|number)[];op:'length';value:number};
export const LIGHT_COMMANDS=new Set<GameCommand['type']>(['playSkill','manualAging','attributeLock','attributeLockAll','training','cheatSettings','increaseAttribute']);
const forbidden=new Set(['__proto__','prototype','constructor']);
const receipts=new WeakMap<Career,{previous:WeakRef<Career>;patches:CareerPatch[];signature:string}>();
const MAX_PATCH_BYTES=512*1024;
function sameRows(a:readonly unknown[],b:readonly unknown[]){return a.length===b.length&&a.every((v,i)=>v===b[i]);}
function eligible(a:Career,b:Career){
 return a.id===b.id&&a.seed===b.seed&&Number.isSafeInteger(b.revision)&&b.revision<=100_000_000&&b.processedCommands.length<=100_000&&(b.systems?.economics.valueHistory.length??0)<=100_000&&(b.systems?.economics.contractHistory?.length??0)<=1000&&b.revision===a.revision+1&&a.season.year===b.season.year&&a.season.week===b.season.week&&a.stage===b.stage&&a.player.clubId===b.player.clubId&&!!a.systems&&!!b.systems&&a.systems.world===b.systems.world&&a.systems.national===b.systems.national&&a.systems.clubCompetitions===b.systems.clubCompetitions&&sameRows(a.systems.rankings,b.systems.rankings)&&sameRows(a.systems.growthReports,b.systems.growthReports)&&sameRows(a.history,b.history)&&sameRows(a.season.matches,b.season.matches);
}
function difference(a:unknown,b:unknown,path:(string|number)[],out:CareerPatch[]):void{
 if(a===b)return;
 if(b===undefined){out.push({path,op:'delete'});return;}
 if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
  if(Array.isArray(a)&&Array.isArray(b)){
   for(let i=0;i<b.length;i++)difference(a[i],b[i],[...path,i],out);
   if(b.length<a.length)out.push({path,op:'length',value:b.length});
  }else{
   for(const k of new Set([...Object.keys(a),...Object.keys(b)]))difference((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k],[...path,k],out);
  }
 }else out.push({path,op:'set',value:structuredClone(b)});
}
/** Receipt of a bounded, engine-produced change. It never keeps an old career alive. */
export function recordCommandChange(previous:Career,next:Career,command:GameCommand):void{
 if(!LIGHT_COMMANDS.has(command.type)||!eligible(previous,next))return;
 const patches:CareerPatch[]=[];difference(previous,next,[],patches);
 const signature=JSON.stringify(patches);
 if(new TextEncoder().encode(signature).length<=MAX_PATCH_BYTES)receipts.set(next,{previous:new WeakRef(previous),patches,signature});
}
export function commandChange(previous:Career,next:Career):CareerPatch[]|undefined{
 const receipt=receipts.get(next);if(!receipt||receipt.previous.deref()!==previous||!eligible(previous,next))return;
 const current:CareerPatch[]=[];difference(previous,next,[],current);
 if(JSON.stringify(current)!==receipt.signature)return;
 return structuredClone(receipt.patches);
}
export function validatePatches(value:unknown):asserts value is CareerPatch[]{
 if(!Array.isArray(value)||value.length>8192||new TextEncoder().encode(JSON.stringify(value)).length>MAX_PATCH_BYTES)throw Error('변경 기록 크기가 올바르지 않습니다.');
 for(const patch of value){
  if(!patch||!Array.isArray(patch.path)||!patch.path.length||patch.path.length>32||!['set','delete','length'].includes(patch.op))throw Error('변경 기록 형식이 올바르지 않습니다.');
  if(patch.path.some((key:unknown)=>typeof key==='string'?forbidden.has(key)||key==='length':!Number.isSafeInteger(key)||Number(key)<0||Number(key)>100_000))throw Error('변경 기록 경로가 올바르지 않습니다.');
  if(patch.op==='length'&&(!Number.isSafeInteger(patch.value)||patch.value<0||patch.value>100_000))throw Error('변경 기록 배열 길이가 올바르지 않습니다.');
 }
}
/** Copy only containers on changed paths; historical matches remain untouched. */
export function applyCareerPatches(career:Career,patches:CareerPatch[]):Career{
 validatePatches(patches);let root:unknown=career;
 for(const patch of patches){
  const change=(node:unknown,depth:number):unknown=>{
   if(depth===patch.path.length){if(patch.op==='set')return structuredClone(patch.value);if(patch.op==='length'){if(!Array.isArray(node))throw Error('변경 대상이 배열이 아닙니다.');return node.slice(0,patch.value);}return undefined;}
   const key=patch.path[depth];if(!node||typeof node!=='object')throw Error('변경 기록의 상위 경로가 없습니다.');
   const copy:any=Array.isArray(node)?[...node]:{...node};
   if(depth===patch.path.length-1&&patch.op==='delete')delete copy[key];else copy[key]=change(copy[key],depth+1);
   return copy;
  };
  root=change(root,0);
 }
 return root as Career;
}

/** Mutable control fields are fingerprinted; large immutable ledgers stay out of the click path. */
export function controlFingerprint(c:Career):string{
 const {history,systems,season,...root}=c;
 const {matches,...current}=season;
 if(!systems)return JSON.stringify([root,current]);
 const {world,national,clubCompetitions,rankings,growthReports,monthlyLeague,...control}=systems;
 return JSON.stringify([root,current,control]);
}
