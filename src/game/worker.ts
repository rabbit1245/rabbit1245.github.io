import type { Career, GameCommand } from './types';
import { executeCommand } from './commands';

interface Request { id:string;career?:Career;careerId?:string;revision?:number;command:GameCommand }
let resident:Career|undefined;
self.addEventListener('message', (event: MessageEvent<Request>) => {
  const { id, command } = event.data;
  const career=event.data.career??(resident?.id===event.data.careerId&&resident?.revision===event.data.revision?resident:undefined);
  try {
    if(!career)throw new Error('진행할 커리어 상태를 다시 불러와 주세요.');
    const result = executeCommand(career, command, id,progress=>self.postMessage({id,progress}));resident=result;
    self.postMessage({ id, career: result });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : '진행 중 오류가 발생했습니다.' });
  }
});
