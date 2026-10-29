/** JSON.stringify-compatible JSON data, without a single enormous JS string.
 * No events, counters or historical fields are discarded. */
export function jsonBlob(value:unknown):Blob {
 const parts:BlobPart[]=[];let buffer='';
 const write=(token:string)=>{if(buffer.length+token.length>32768){parts.push(buffer);buffer='';}if(token.length>32768)parts.push(token);else buffer+=token;};
 const visit=(node:unknown,array=false):void=>{
  if(node===null||typeof node!=='object'){write(JSON.stringify(node)??(array?'null':''));return;}
  if(Array.isArray(node)){write('[');for(let i=0;i<node.length;i++){if(i)write(',');visit(node[i],true);}write(']');return;}
  write('{');let first=true;
  for(const key of Object.keys(node)){const item=(node as Record<string,unknown>)[key];if(item===undefined)continue;if(!first)write(',');first=false;write(JSON.stringify(key));write(':');visit(item);}
  write('}');
 };
 visit(value);if(buffer)parts.push(buffer);return new Blob(parts,{type:'application/json'});
}
