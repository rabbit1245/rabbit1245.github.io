import {prepareEnvelope,verifySaveText} from './storage';
import {decodeStored,isBlobCareer,packEnvelope,replayJournal,type StoredCareer} from './save-codec';
import type {Career} from './types';
let resident:{career:Career;versionHash:string}|undefined;
let queue=Promise.resolve();
self.addEventListener('message',(event:MessageEvent<{id:string;operation:string;payload:any}>)=>{
 const {id,operation,payload}=event.data;
 queue=queue.catch(()=>undefined).then(async()=>{
  try{
   let result:unknown;
   if(operation==='prepare'){
    resident=undefined;
    const envelope=await prepareEnvelope(payload as Career,true);resident={career:envelope.career,versionHash:envelope.hash};result=packEnvelope(envelope);
   }else if(operation==='verifyFile'){
    resident=undefined;
    result=await verifySaveText(payload);
   }else if(operation==='decode'){
    resident=undefined;
    const decoded=await decodeStored(payload as StoredCareer);resident={career:decoded.career,versionHash:decoded.versionHash};result=decoded;
   }else if(operation==='checkpoint'){
    if(!isBlobCareer(payload))throw Error('배경 스냅샷 형식이 올바르지 않습니다.');
    const entries=payload.journal??[],head=entries.at(-1),targetRevision=head?.revision??payload.revision,targetHash=head?.hash??payload.versionHash;
    let state:typeof resident;
    if(resident?.career.id===payload.id){
     const token=resident.career.revision===payload.revision?payload.versionHash:entries.find((e:any)=>e.revision===resident!.career.revision)?.hash;
     if(token===resident.versionHash&&resident.career.revision<=targetRevision)state=await replayJournal(resident.career,resident.versionHash,entries.filter((e:any)=>e.revision>resident!.career.revision));
    }
    state??=await decodeStored(payload);
    if(state.career.revision!==targetRevision||state.versionHash!==targetHash)throw Error('배경 스냅샷의 변경 기록이 일치하지 않습니다.');
    const envelope=await prepareEnvelope(state.career,true);resident={career:envelope.career,versionHash:targetHash};result=packEnvelope(envelope,targetHash);
   }else throw Error('지원하지 않는 저장 요청입니다.');
   self.postMessage({id,result});
  }catch(e){self.postMessage({id,error:e instanceof Error?e.message:'저장 검사 실패'});}
 });
});
