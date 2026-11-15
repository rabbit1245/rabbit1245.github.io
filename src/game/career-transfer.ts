import {readJSONBlob} from './json-reader';
import {MAX_SAVE_BYTES} from './save-limits';
import type {Career} from './types';
export interface CareerTransfer {blob:Blob;rawBytes:number;encoding:'gzip'}
/** Emit bounded UTF-8 chunks with backpressure; never retain an uncompressed
 * career-sized Blob alongside the game graph in Chromium's Blob registry. */
function* chunks(value:unknown):Generator<Uint8Array<ArrayBuffer>>{
 const encoder=new TextEncoder();let buffer='';
 function* visit(v:any,array=false):Generator<Uint8Array<ArrayBuffer>>{
  const token=v===null?'null':typeof v==='object'?undefined:JSON.stringify(v)??(array?'null':'');
  if(token!==undefined){buffer+=token;}
  else if(Array.isArray(v)){
   buffer+='[';for(let i=0;i<v.length;i++){if(i)buffer+=',';yield* visit(v[i],true);}buffer+=']';
  }else{
   buffer+='{';let first=true;for(const key of Object.keys(v)){if(v[key]===undefined)continue;if(!first)buffer+=',';first=false;buffer+=JSON.stringify(key)+':';yield* visit(v[key]);}buffer+='}';
  }
  if(buffer.length>=128*1024){yield encoder.encode(buffer);buffer='';}
 }
 yield* visit(value);if(buffer)yield encoder.encode(buffer);
}
export async function packJSONTransfer(career:unknown):Promise<CareerTransfer>{
 let rawBytes=0;const iterator=chunks(career);
 const stream=new ReadableStream<BufferSource>({pull(controller){const item=iterator.next();if(item.done){controller.close();return;}rawBytes+=item.value.byteLength;if(rawBytes>MAX_SAVE_BYTES){controller.error(new Error('저장 파일이 지원하는 2GiB 범위를 초과했습니다.'));return;}controller.enqueue(item.value);},cancel(){iterator.return(undefined);}});
 const blob=await new Response(stream.pipeThrough(new CompressionStream('gzip'))).blob();
 return {blob,rawBytes,encoding:'gzip'};
}
export const packCareerTransfer=(career:Career)=>packJSONTransfer(career);
export const unpackCareerTransfer=(p:CareerTransfer)=>readJSONBlob(p.blob,{encoding:p.encoding,rawBytes:p.rawBytes,maximum:MAX_SAVE_BYTES}) as Promise<Career>;
