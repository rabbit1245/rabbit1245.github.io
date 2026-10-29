/** The legacy canonical JSON bytes, buffered without one enormous recursive rope. */
export function canonicalBytes(value:unknown):Uint8Array<ArrayBuffer>{
 // Cache only encoded property names, never values or subtrees. Every field is
 // still visited and sorted, with the legacy undefined-array bytes preserved.
 const encoder=new TextEncoder(),chunks:Uint8Array<ArrayBuffer>[]=[],limit=32*1024,keyTokens=new Map<string,string>();let buffer='',size=0;
 const flush=()=>{if(!buffer)return;const bytes=encoder.encode(buffer);chunks.push(bytes);size+=bytes.length;buffer='';};
 const write=(token:string|undefined)=>{
  if(!token)return;
  if(buffer.length+token.length>limit)flush();
  if(token.length>=limit){const bytes=encoder.encode(token);chunks.push(bytes);size+=bytes.length;}else buffer+=token;
 };
 const visit=(node:unknown)=>{
  if(node===null||typeof node!=='object'){write(JSON.stringify(node));return;}
  if(Array.isArray(node)){write('[');for(let i=0;i<node.length;i++){if(i)write(',');visit(node[i]);}write(']');return;}
  const object=node as Record<string,unknown>,keys=Object.keys(object).filter(k=>object[k]!==undefined).sort();
  write('{');for(let i=0;i<keys.length;i++){if(i)write(',');const key=keys[i];let token=keyTokens.get(key);if(token===undefined){token=JSON.stringify(key);if(key.length<=256&&keyTokens.size<4096)keyTokens.set(key,token);}write(token);write(':');visit(object[key]);}write('}');
 };
 visit(value);flush();const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
