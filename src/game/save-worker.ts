import {packCareerTransfer,unpackCareerTransfer} from './career-transfer';
import {prepareEnvelope,verifySaveText,verifySaveBlob} from './storage';
import {decodeStored,isBlobCareer,packStored,replayJournal,type StoredCareer} from './save-codec';
import type {Career} from './types';
import {jsonBlob} from './json-blob';
import {ArchiveMetadataLimitError,encodeArchiveWire} from './archive-wire';
import {MAX_CAREER_CACHE_BYTES} from './fast-career-cache';
let resident:{career:Career;versionHash:string}|undefined;
let queue=Promise.resolve();
self.addEventListener('message',(event:MessageEvent<{id:string;operation:string;payload:any}>)=>{
 const {id,operation}=event.data;let payload=event.data.payload;
 queue=queue.catch(()=>undefined).then(async()=>{
  try{
   let result:any;
   if((operation==='prepare'||operation==='export')&&payload?.careerTransfer)payload=await unpackCareerTransfer(payload.careerTransfer);
   if(operation==='prepare'){
    resident=undefined;
    const envelope=await prepareEnvelope(payload as Career,true);resident={career:envelope.career,versionHash:envelope.hash};result=await packStored(envelope);
   }else if(operation==='export'){
    resident=undefined;
    result=jsonBlob(await prepareEnvelope(payload as Career,true));
   }else if(operation==='verifyFile'){
    resident=undefined;
    result=typeof payload==='string'?await verifySaveText(payload):await verifySaveBlob(payload as Blob);
   }else if(operation==='decodeCompact'){
    resident=undefined;
    let lastProgress='';
    const progress=(phase:string,percent?:number)=>{
     const key=phase+percent;
     if(key===lastProgress)return;
     lastProgress=key;
     self.postMessage({id,progress:{phase,percent}});
    };
    const {career,...decoded}=await decodeStored(payload as StoredCareer,true,progress);
    progress('검증한 저장 준비');
    try{
     const archive=await encodeArchiveWire(career,MAX_CAREER_CACHE_BYTES);
     if(archive.size<=MAX_CAREER_CACHE_BYTES)result={...decoded,archive};
    }catch(error){if(!(error instanceof ArchiveMetadataLimitError))throw error;}
    // Exceptionally wide saves can still use the bounded gzip transport.
    result??={...decoded,careerTransfer:await packCareerTransfer(career)};
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
    const envelope=await prepareEnvelope(state.career,true);resident={career:envelope.career,versionHash:targetHash};result=await packStored(envelope,targetHash);
   }else throw Error('지원하지 않는 저장 요청입니다.');
   if(result?.career?.history.length>=6){const {career,...rest}=result;result={...rest,careerTransfer:await packCareerTransfer(career)};}
   else if(operation==='verifyFile'&&result?.history.length>=6)result={careerTransfer:await packCareerTransfer(result),careerOnly:true};
   self.postMessage({id,result});
  }catch(e){self.postMessage({id,error:e instanceof Error?e.message:'저장 검사 실패'});}
 });
});
