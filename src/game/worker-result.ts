import type {Career} from './types';
type Path=(string|number)[];
export interface GameResultWire {version:1;baseId:string;baseRevision:number;career:Career;reuse:{target:Path;source:Path}[]}
const forbidden=new Set(['__proto__','prototype','constructor']);
const at=(root:unknown,path:Path):any=>path.reduce((v:any,k)=>v?.[k],root);
const BASE_PATHS:Path[]=[['history'],['season','matches'],['systems','national','matches'],['systems','national','history'],['systems','national','teamResults'],['systems','clubCompetitions','history'],['systems','rankings'],['systems','growthReports']];
function paths(c:Career):Path[]{return [...BASE_PATHS,...(c.systems?.clubCompetitions?.current??[]).map((_,i)=>['systems','clubCompetitions','current',i,'matches'] as Path)];}
/** The engine already treats completed ledgers as immutable. Send new data and
 * references to unchanged ledgers instead of cloning decades of matches back. */
export function packGameResult(previous:Career,next:Career):GameResultWire{
 const index=new WeakMap<object,Path>();
 const register=(list:unknown,path:Path)=>{if(!Array.isArray(list))return;index.set(list,path);list.forEach((row,i)=>{if(row&&typeof row==='object'){index.set(row,[...path,i]);if(Array.isArray(row.matches)){index.set(row.matches,[...path,i,'matches']);row.matches.forEach((m:unknown,j:number)=>{if(m&&typeof m==='object')index.set(m,[...path,i,'matches',j]);});}}});};
 for(const path of paths(previous))register(at(previous,path),path);
 const reuse:GameResultWire['reuse']=[],encoded=new WeakMap<object,any>();
 const encode=(value:any,path:Path):any=>{
  if(value&&typeof value==='object'){const source=index.get(value);if(source){reuse.push({target:path,source});return null;}}
  if(value&&typeof value==='object'&&encoded.has(value))return encoded.get(value);
  if(Array.isArray(value)){const result:any[]=[];encoded.set(value,result);value.forEach((row,i)=>result.push(encode(row,[...path,i])));return result;}
  if(value&&typeof value==='object'&&Array.isArray(value.matches)){const result={...value};encoded.set(value,result);result.matches=encode(value.matches,[...path,'matches']);return result;}
  return value;
 };
 const career:Career={...next,season:{...next.season},...(next.systems?{systems:{...next.systems,national:{...next.systems.national},...(next.systems.clubCompetitions?{clubCompetitions:{...next.systems.clubCompetitions,current:next.systems.clubCompetitions.current.map(t=>({...t}))}}:{})}}:{})};
 for(const path of paths(next)){const value=at(next,path);if(!Array.isArray(value))continue;const parent=at(career,path.slice(0,-1));parent[path.at(-1)!]=encode(value,path);}
 return {version:1,baseId:previous.id,baseRevision:previous.revision,career,reuse};
}
/** Hydrate only an owned Worker message; never mutate the original career. */
export function unpackGameResult(previous:Career,wire:GameResultWire):Career{
 if(wire.version!==1||wire.baseId!==previous.id||wire.baseRevision!==previous.revision||wire.career.id!==previous.id||!Array.isArray(wire.reuse)||wire.reuse.length>1000000)throw Error('경기 결과의 기준 저장이 일치하지 않습니다.');
 const safe=(path:Path)=>Array.isArray(path)&&path.length>0&&path.length<16&&path.every(k=>typeof k==='string'?!forbidden.has(k):Number.isSafeInteger(k)&&k>=0&&k<100000);
 for(const ref of wire.reuse){if(!safe(ref.target)||!safe(ref.source))throw Error('경기 기록 재사용 경로가 올바르지 않습니다.');const value=at(previous,ref.source),parent=at(wire.career,ref.target.slice(0,-1));if(!value||typeof value!=='object'||!parent||typeof parent!=='object'||parent[ref.target.at(-1)!]!==null)throw Error('경기 기록 재사용 근거가 일치하지 않습니다.');parent[ref.target.at(-1)!]=value;}
 return wire.career;
}
