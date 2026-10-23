import {prepareEnvelope} from './storage';
import type {Career} from './types';
self.addEventListener('message',async(event:MessageEvent<{id:string;career:Career}>)=>{const {id,career}=event.data;try{self.postMessage({id,envelope:await prepareEnvelope(career)});}catch(e){self.postMessage({id,error:e instanceof Error?e.message:'저장 검사 실패'});}});
