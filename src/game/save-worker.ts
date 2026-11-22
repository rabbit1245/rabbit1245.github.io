import {packCareerTransfer,unpackCareerTransfer} from './career-transfer';
import {prepareEnvelope,prepareImportedSnapshot,verifySaveText,verifySaveBlob} from './storage';
import {decodeStored,isBlobCareer,packStored,replayJournal,recordFingerprint,type StoredCareer} from './save-codec';
import type {Career} from './types';
import {jsonBlob} from './json-blob';
import {ArchiveMetadataLimitError,encodeArchiveWire} from './archive-wire';
import {MAX_CAREER_CACHE_BYTES} from './fast-career-cache';
type SnapshotProof={key:string;blobHash:string};
let resident:{career:Career;versionHash:string;snapshot?:SnapshotProof}|undefined;
let queue=Promise.resolve();

/** An unchanged medium-sized snapshot can reuse this worker's verified graph.
 * Compare the compressed bytes as well as metadata before reusing it. */
async function snapshotProof(record:StoredCareer):Promise<SnapshotProof|undefined>{
 if(!isBlobCareer(record)||!(record.blob instanceof Blob)||record.blob.size>128*1024*1024||
  !Array.isArray(record.journal)||record.journal.length||(record.rawBytes??record.blob.size)<64*1024*1024)return;
 const hash=await crypto.subtle.digest('SHA-256',await record.blob.arrayBuffer());
 const blobHash=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
 return {key:recordFingerprint(record),blobHash};
}

async function compactTransport(career:Career):Promise<{archive:Blob}|{careerTransfer:Awaited<ReturnType<typeof packCareerTransfer>>}>{
 try{
  const archive=await encodeArchiveWire(career,MAX_CAREER_CACHE_BYTES);
  if(archive.size<=MAX_CAREER_CACHE_BYTES)return {archive};
 }catch(error){if(!(error instanceof ArchiveMetadataLimitError))throw error;}
 return {careerTransfer:await packCareerTransfer(career)};
}

self.addEventListener('message',(event:MessageEvent<{id:string;operation:string;payload:any}>)=>{
 const {id,operation}=event.data;let payload=event.data.payload;
 queue=queue.catch(()=>undefined).then(async()=>{
  try{
   let result:any,lastProgress='';
   const progress=(phase:string,percent?:number)=>{
    const key=phase+percent;
    if(key===lastProgress)return;
    lastProgress=key;
    self.postMessage({id,progress:{phase,percent}});
   };
   if((operation==='prepare'||operation==='export')&&payload?.careerTransfer)payload=await unpackCareerTransfer(payload.careerTransfer);
   if(operation==='prepare'){
    resident=undefined;
    const envelope=await prepareEnvelope(payload as Career,true),prepared=await packStored(envelope);
    resident={career:envelope.career,versionHash:envelope.hash,snapshot:await snapshotProof(prepared.record)};result=prepared;
   }else if(operation==='prepareImport'){
    resident=undefined;
    const {career,prepared,compact}=await prepareImportedSnapshot(payload,progress);
    if(compact){
     progress('검증한 저장 준비');
     result={prepared,compact,...await compactTransport(career)};
    }else{
     resident={career,versionHash:prepared.record.versionHash,snapshot:await snapshotProof(prepared.record)};
     result={career,prepared,compact};
    }
   }else if(operation==='export'){
    resident=undefined;
    result=jsonBlob(await prepareEnvelope(payload as Career,true));
   }else if(operation==='verifyFile'){
    resident=undefined;
    result=typeof payload==='string'?await verifySaveText(payload):await verifySaveBlob(payload as Blob,progress);
   }else if(operation==='decodeCompact'){
    resident=undefined;
    const {career,...decoded}=await decodeStored(payload as StoredCareer,true,progress);
    progress('검증한 저장 준비');
    result={...decoded,...await compactTransport(career)};
   }else if(operation==='decode'){
    const snapshot=await snapshotProof(payload as StoredCareer);
    if(snapshot&&resident?.snapshot?.key===snapshot.key&&resident.snapshot.blobHash===snapshot.blobHash){
     progress('검증된 저장 사용');
     result={career:resident.career,versionHash:resident.versionHash};
    }else{
     resident=undefined;
     progress('저장 스냅샷 검사');
     const decoded=await decodeStored(payload as StoredCareer,false,progress);
     resident={career:decoded.career,versionHash:decoded.versionHash,snapshot};result=decoded;
    }
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
    const envelope=await prepareEnvelope(state.career,true),prepared=await packStored(envelope,targetHash);
    resident={career:envelope.career,versionHash:targetHash,snapshot:await snapshotProof(prepared.record)};result=prepared;
   }else throw Error('지원하지 않는 저장 요청입니다.');
   if(result?.career?.history.length>=6){const {career,...rest}=result;result={...rest,careerTransfer:await packCareerTransfer(career)};}
   else if(operation==='verifyFile'&&result?.history.length>=6)result={careerTransfer:await packCareerTransfer(result),careerOnly:true};
   self.postMessage({id,result});
  }catch(e){self.postMessage({id,error:e instanceof Error?e.message:'저장 검사 실패'});}
 });
});
