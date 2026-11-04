/** Native JSON parsing for ordinary saves, bounded subtrees for large saves.
 * The streaming path never creates a career-sized JavaScript string. */
export class SaveReadError extends Error {
 constructor(public phase:'read'|'gzip'|'size'|'json',cause?:unknown){super(phase,{cause});}
}
const whitespace=(c:number)=>c===32||c===9||c===10||c===13;
const CHUNK_VALUE=4*1024*1024;
class Source {
 text='';pos=0;hold=false;done=false;bytes=0;
 private decoder=new TextDecoder();
 constructor(private reader:ReadableStreamDefaultReader<Uint8Array>,private maximum:number,private expected:number|undefined,private compressed:boolean){}
 async more(){
  if(this.done)return false;
  if(!this.hold&&this.pos){this.text=this.text.slice(this.pos);this.pos=0;}
  let r:ReadableStreamReadResult<Uint8Array>;
  try{r=await this.reader.read();}catch(e){throw new SaveReadError(this.compressed?'gzip':'read',e);}
  if(r.done){this.done=true;if(this.expected!==undefined&&this.bytes!==this.expected)throw new SaveReadError('size');this.text+=this.decoder.decode();return this.pos<this.text.length;}
  this.bytes+=r.value.byteLength;if(this.bytes>this.maximum||this.expected!==undefined&&this.bytes>this.expected){await this.reader.cancel();throw new SaveReadError('size');}
  this.text+=this.decoder.decode(r.value,{stream:true});return true;
 }
 async space(){while(true){while(this.pos<this.text.length&&whitespace(this.text.charCodeAt(this.pos)))this.pos++;if(this.pos<this.text.length||this.done)return;await this.more();}}
 async close(){try{await this.reader.cancel();}catch{/* Preserve the first decoding error. */}this.reader.releaseLock();}
}
function native(text:string):unknown{try{return JSON.parse(text);}catch(e){throw new SaveReadError('json',e);}}
/** Capture small values for native parsing. Expand only containers exceeding the
 * bounded capture, then parse their children through the same native fast path. */
async function value(s:Source,depth=0):Promise<unknown>{
 if(depth>64)throw new SaveReadError('json');await s.space();if(s.pos===s.text.length&&s.done)throw new SaveReadError('json');
 if(s.pos>256*1024){s.text=s.text.slice(s.pos);s.pos=0;}
 const start=s.pos,first=s.text.charCodeAt(start),container=first===123||first===91,string=first===34;
 let quoted=false,escaped=false,nesting=0; s.hold=true;
 while(true){
  while(s.pos<s.text.length){
   const c=s.text.charCodeAt(s.pos);
   if(!container&&!string&&(whitespace(c)||c===44||c===93||c===125)){
    const text=s.text.slice(start,s.pos);s.hold=false;return native(text);
   }
   s.pos++;
   if(quoted){if(escaped)escaped=false;else if(c===92)escaped=true;else if(c===34){quoted=false;if(string){const text=s.text.slice(start,s.pos);s.hold=false;return native(text);}}}
   else if(c===34)quoted=true;
   else if(container){if(c===123||c===91)nesting++;else if(c===125||c===93){nesting--;if(!nesting){const text=s.text.slice(start,s.pos);s.hold=false;return native(text);}}}
   if(s.pos-start>CHUNK_VALUE){
    s.hold=false;s.pos=start;if(!container)throw new SaveReadError('json');return expanded(s,first,depth);
   }
  }
  if(s.done){const text=s.text.slice(start,s.pos);s.hold=false;return native(text);}
  await s.more();
 }
}
async function expanded(s:Source,first:number,depth:number):Promise<unknown>{
 s.pos++;const array=first===91,end=array?93:125,out:unknown[]|Record<string,unknown>=array?[]:{};
 await s.space();if(s.text.charCodeAt(s.pos)===end){s.pos++;return out;}
 while(true){
  let key:string|undefined;
  if(!array){await s.space();if(s.text.charCodeAt(s.pos)!==34)throw new SaveReadError('json');key=await value(s,depth+1) as string;await s.space();if(s.text.charCodeAt(s.pos++)!==58)throw new SaveReadError('json');}
  const child=await value(s,depth+1);
  if(array)(out as unknown[]).push(child);else Object.defineProperty(out,key!,{value:child,enumerable:true,writable:true,configurable:true});
  await s.space();const c=s.text.charCodeAt(s.pos++);if(c===end)return out;if(c!==44)throw new SaveReadError('json');
  await s.space();if(s.text.charCodeAt(s.pos)===end)throw new SaveReadError('json');
 }
}
export async function readJSONBlob(blob:Blob,options:{encoding?:'gzip';rawBytes?:number;maximum:number;stream?:boolean}):Promise<unknown>{
 const {encoding,rawBytes,maximum}=options,expected=encoding?rawBytes:blob.size;
 if(!Number.isSafeInteger(expected)||expected!<0||expected!>maximum)throw new SaveReadError('size');
 if(!encoding&&!options.stream&&expected!<384*1024*1024){try{return native(await blob.text());}catch(e){if(e instanceof SaveReadError)throw e;throw new SaveReadError('read',e);}}
 let input=blob.stream();
 if(encoding){if(typeof DecompressionStream==='undefined')throw new SaveReadError('gzip');input=input.pipeThrough(new DecompressionStream('gzip'));}
 const reader=input.getReader();
 if(options.stream||expected!>=384*1024*1024){
  const source=new Source(reader,maximum,expected,!!encoding);
  try{const result=await value(source);await source.space();if(source.pos!==source.text.length||!source.done)throw new SaveReadError('json');return result;}finally{await source.close();}
 }
 const parts:BlobPart[]=[];let size=0;
 try{
  while(true){let r:ReadableStreamReadResult<Uint8Array>;try{r=await reader.read();}catch(e){throw new SaveReadError(encoding?'gzip':'read',e);}if(r.done)break;size+=r.value.byteLength;if(size>expected!||size>maximum)throw new SaveReadError('size');parts.push(r.value as Uint8Array<ArrayBuffer>);}
  if(size!==expected)throw new SaveReadError('size');return native(await new Blob(parts).text());
 }finally{try{await reader.cancel();}catch{/* Preserve the original error. */}reader.releaseLock();}
}
