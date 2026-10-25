import type {Career} from './types';
import type {StoredCareer,PreparedSave,DecodedSave,BlobCareer} from './save-codec';
type Operation='prepare'|'decode'|'checkpoint'|'verifyFile';
type Pending={resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>;operation:Operation};
let worker:Worker|undefined;const pending=new Map<string,Pending>();
function stop(message:string){worker?.terminate();worker=undefined;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error(message));}pending.clear();}
export function cancelCheckpointPreparation(){if(pending.size&&[...pending.values()].every(p=>p.operation==='checkpoint'))stop('새 진행 요청을 위해 배경 스냅샷을 연기했습니다. 변경 기록은 보존됩니다.');}
function request<T>(operation:Operation,payload:unknown):Promise<T>{
 if(operation!=='checkpoint')cancelCheckpointPreparation();
 if(!worker){worker = new Worker(new URL('./save-worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message',(event:MessageEvent<{id:string;result?:unknown;error?:string}>)=>{const p=pending.get(event.data.id);if(!p)return;clearTimeout(p.timer);pending.delete(event.data.id);if(event.data.error)p.reject(new Error(event.data.error));else p.resolve(event.data.result);});
  worker.addEventListener('error',()=>stop('저장 데이터를 검사하지 못했습니다. JSON으로 보관해 주세요.'));
  worker.addEventListener('messageerror',()=>stop('저장 검사 결과를 읽지 못했습니다.'));
 }
 const id=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>stop('저장 검사 시간이 초과되었습니다. 현재 진행과 변경 기록은 유지됩니다.'),60000);pending.set(id,{resolve,reject,timer,operation});try{worker!.postMessage({id,operation,payload});}catch{stop('저장 검사 요청 실패');}});
}
export const prepareSaveOffThread=(career:Career)=>request<PreparedSave>('prepare',career);
export const decodeSaveOffThread=(record:StoredCareer)=>request<DecodedSave>('decode',record);
export const checkpointOffThread=(record:BlobCareer)=>request<PreparedSave>('checkpoint',record);

export const verifyFileOffThread=(source:string)=>request<Career>('verifyFile',source);
