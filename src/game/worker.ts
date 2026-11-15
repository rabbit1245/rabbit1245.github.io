import {unpackCareerTransfer,type CareerTransfer} from './career-transfer';
import {validateEngineResult} from './storage';
import {prepareGameDelta,sealCareer} from './game-delta';
import {packGameResult} from './worker-result';
import type { Career, GameCommand } from './types';
import { executeCommand } from './commands';

interface Request { id:string;career?:Career;careerTransfer?:CareerTransfer;careerId?:string;revision?:number;command:GameCommand }
let resident:Career|undefined;
let queue=Promise.resolve();
self.addEventListener('message', (event: MessageEvent<Request>) => {
 queue=queue.catch(()=>undefined).then(async()=>{
  const { id, command } = event.data;
  try {
  const career=event.data.careerTransfer?await unpackCareerTransfer(event.data.careerTransfer):event.data.career??(resident?.id===event.data.careerId&&resident?.revision===event.data.revision?resident:undefined);
    if(!career)throw new Error('진행할 커리어 상태를 다시 불러와 주세요.');
    sealCareer(career);
    const result = executeCommand(career, command, id,progress=>self.postMessage({id,progress}));
    validateEngineResult(career,result);resident=result;
    const wire=packGameResult(career,result),preparedDelta=await prepareGameDelta(wire);
    self.postMessage({ id, wire,preparedDelta });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : '진행 중 오류가 발생했습니다.' });
  }
 });
});
