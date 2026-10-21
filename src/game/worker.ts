import type { Career, GameCommand } from './types';
import { executeCommand } from './commands';

interface Request { id: string; career: Career; command: GameCommand }
self.addEventListener('message', (event: MessageEvent<Request>) => {
  const { id, career, command } = event.data;
  try {
    const result = executeCommand(career, command, id);
    self.postMessage({ id, career: result });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : '진행 중 오류가 발생했습니다.' });
  }
});
