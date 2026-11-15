import {packCareerTransfer,unpackCareerTransfer} from './career-transfer';
import type {Career} from './types';
import type {StoredCareer,PreparedSave,DecodedSave,BlobCareer} from './save-codec';
type Operation='prepare'|'decode'|'checkpoint'|'verifyFile'|'export';
type Pending={resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>;operation:Operation;releaseOnIdle:boolean};
let worker:Worker|undefined;const pending=new Map<string,Pending>();
let releaseWhenIdle=false;
function stop(message:string){worker?.terminate();worker=undefined;releaseWhenIdle=false;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error(message));}pending.clear();}
export function cancelCheckpointPreparation(){if(pending.size&&[...pending.values()].every(p=>p.operation==='checkpoint'))stop('새 진행 요청을 위해 배경 스냅샷을 연기했습니다. 변경 기록은 보존됩니다.');}
function request<T>(operation:Operation,payload:unknown):Promise<T>{
 if(operation!=='checkpoint')cancelCheckpointPreparation();
 if(!worker){worker = new Worker(new URL('./save-worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message',async(event:MessageEvent<{id:string;result?:any;error?:string}>)=>{
   const p=pending.get(event.data.id);if(!p)return;
   clearTimeout(p.timer);pending.delete(event.data.id);
   const result=event.data.result,transfer=result?.careerTransfer;
   releaseWhenIdle ||= p.releaseOnIdle||!!transfer;
   // Release the verified source graph before allocating its receiving graph.
   if(releaseWhenIdle&&!pending.size){worker?.terminate();worker=undefined;releaseWhenIdle=false;}
   if(event.data.error){p.reject(new Error(event.data.error));return;}
   try{
    if(transfer){const {careerTransfer,careerOnly,...rest}=result;const career=await unpackCareerTransfer(transfer);p.resolve(careerOnly?career:{...rest,career});}
    else p.resolve(result);
   }catch(e){p.reject(e instanceof Error?e:new Error(String(e)));}
  });
  worker.addEventListener('error',()=>stop('저장 데이터를 검사하지 못했습니다. JSON으로 보관해 주세요.'));
  worker.addEventListener('messageerror',()=>stop('저장 검사 결과를 읽지 못했습니다.'));
 }
 const large=payload instanceof Blob?payload.size>32*1024*1024:typeof payload==='string'?payload.length>32*1024*1024:payload&&typeof payload==='object'&&('blob' in payload?((payload as BlobCareer).rawBytes??(payload as BlobCareer).blob?.size)>32*1024*1024:'history' in payload&&((payload as Career).history?.length??0)>=4);
 const releaseOnIdle=payload instanceof Blob?payload.size>128*1024*1024:typeof payload==='string'?payload.length>128*1024*1024:!!payload&&typeof payload==='object'&&('blob' in payload?((payload as BlobCareer).rawBytes??(payload as BlobCareer).blob?.size)>128*1024*1024:'history' in payload&&((payload as Career).history?.length??0)>=6);
 const id=crypto.randomUUID();return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>stop('저장 검사 시간이 초과되었습니다. 현재 진행과 변경 기록은 유지됩니다.'),large?180000:60000);
  pending.set(id,{resolve,reject,timer,operation,releaseOnIdle});const target=worker;
  void (async()=>{
   const encoded=payload&&typeof payload==='object'&&'history' in payload&&((payload as Career).history?.length??0)>=6?{careerTransfer:await packCareerTransfer(payload as Career)}:payload;
   if(worker!==target||!pending.has(id))return;
   target!.postMessage({id,operation,payload:encoded});
  })().catch(()=>{if(worker===target&&pending.has(id))stop('저장 검사 요청 실패');});
 });
}
export const prepareSaveOffThread=(career:Career)=>request<PreparedSave>('prepare',career);
export const exportJSONOffThread=(career:Career)=>request<Blob>('export',career);
export const decodeSaveOffThread=(record:StoredCareer)=>request<DecodedSave>('decode',record);
export const checkpointOffThread=(record:BlobCareer)=>request<PreparedSave>('checkpoint',record);

export const verifyFileOffThread=(source:string|Blob)=>request<Career>('verifyFile',source);
