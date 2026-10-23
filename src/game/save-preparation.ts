import type {Career,SaveEnvelope} from './types';
type Pending={resolve:(v:SaveEnvelope)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>};
let worker:Worker|undefined;const pending=new Map<string,Pending>();
function stop(message:string){worker?.terminate();worker=undefined;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error(message));}pending.clear();}
/** Validation and canonical hashing stay identical, but no longer block menu/scroll events. */
export function prepareSaveOffThread(career:Career):Promise<SaveEnvelope>{
 if(!worker){worker = new Worker(new URL('./save-worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message',(event:MessageEvent<{id:string;envelope?:SaveEnvelope;error?:string}>)=>{const p=pending.get(event.data.id);if(!p)return;clearTimeout(p.timer);pending.delete(event.data.id);if(event.data.envelope)p.resolve(event.data.envelope);else p.reject(new Error(event.data.error||'저장 검증 실패'));});
  worker.addEventListener('error',()=>stop('저장 데이터를 검사하지 못했습니다. JSON으로 보관해 주세요.'));
  worker.addEventListener('messageerror',()=>stop('저장 검사 결과를 읽지 못했습니다.'));
 }
 const id=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>stop('저장 검사 시간이 초과되었습니다. 현재 진행은 화면에 유지됩니다.'),60000);pending.set(id,{resolve,reject,timer});try{worker!.postMessage({id,career});}catch{stop('저장 검사 요청 실패');}});
}
