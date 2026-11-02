/** JSON.stringify-compatible JSON data, without a single enormous JS string.
 * No events, counters or historical fields are discarded. */
export function jsonBlob(value:unknown):Blob {
 const parts:BlobPart[]=[],encoder=new TextEncoder(),limit=256*1024,keyTokens=new Map<string,{first:string;next:string}>();let buffer='';
 // Encode as we flush: retaining concatenated strings until Blob construction
 // keeps millions of rope nodes alive in long careers and causes large GC pauses.
 const flush=()=>{if(!buffer)return;parts.push(encoder.encode(buffer));buffer='';};
 const write=(token:string)=>{if(buffer.length+token.length>limit)flush();if(token.length>=limit)parts.push(encoder.encode(token));else buffer+=token;};
 const visit=(node:unknown,array=false):void=>{
  if(node===null){write('null');return;}
  if(typeof node==='number'){write(Number.isFinite(node)?String(node):'null');return;}
  if(typeof node==='boolean'){write(node?'true':'false');return;}
  if(typeof node!=='object'){write(JSON.stringify(node)??(array?'null':''));return;}
  if(Array.isArray(node)){write('[');for(let i=0;i<node.length;i++){if(i)write(',');visit(node[i],true);}write(']');return;}
  write('{');let first=true;
  for(const key of Object.keys(node)){const item=(node as Record<string,unknown>)[key];if(item===undefined)continue;let token=keyTokens.get(key);if(token===undefined){const text=JSON.stringify(key)+':';token={first:text,next:','+text};if(key.length<=256&&keyTokens.size<4096)keyTokens.set(key,token);}write(first?token.first:token.next);first=false;visit(item);}
  write('}');
 };
 visit(value);flush();return new Blob(parts,{type:'application/json'});
}
