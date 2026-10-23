import type { Career, GameCommand } from './types';

type Pending = { resolve: (value: Career) => void; reject: (reason: Error) => void; timeout: ReturnType<typeof setTimeout> };
let worker: Worker | undefined;
let resident:Career|undefined;
const pending = new Map<string, Pending>();

function stopWorker(message: string) {
  worker?.terminate();
  worker = undefined;resident=undefined;
  for (const request of pending.values()) {
    clearTimeout(request.timeout);
    request.reject(new Error(message));
  }
  pending.clear();
}

export async function runGameCommand(career: Career, command: GameCommand): Promise<Career> {
  const id = crypto.randomUUID();
  if (typeof Worker === 'undefined'||['manualAging','attributeLock','training','cheatSettings','increaseAttribute'].includes(command.type)) {
    const { executeCommand } = await import('./commands');
    return executeCommand(career, command, id);
  }
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<{ id: string; career?: Career; error?: string }>) => {
      const request = pending.get(event.data.id);
      if (!request) return;
      clearTimeout(request.timeout);
      pending.delete(event.data.id);
      if (event.data.error || !event.data.career) request.reject(new Error(event.data.error || '경기 결과를 불러오지 못했습니다.'));
      else {resident=event.data.career;request.resolve(event.data.career);}
    });
    worker.addEventListener('error', () => stopWorker('경기 계산을 완료하지 못했습니다. 다시 진행해 주세요.'));
    worker.addEventListener('messageerror', () => stopWorker('경기 데이터를 읽지 못했습니다. 다시 진행해 주세요.'));
  }
  return new Promise<Career>((resolve, reject) => {
    const timeout = setTimeout(() => stopWorker('계산 시간이 초과되었습니다. 저장된 상태는 유지됩니다.'), 60_000);
    pending.set(id, { resolve, reject, timeout });
    try { worker!.postMessage({id,...(resident===career?{careerId:career.id,revision:career.revision}:{career}),command}); }
    catch { stopWorker('진행 요청을 전달하지 못했습니다.'); }
  });
}
