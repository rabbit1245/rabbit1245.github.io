import type { GameProgress } from './types';

export type GameSteps<Result> = Generator<GameProgress | undefined, Result, void>;
type ProgressListener = (progress: GameProgress) => void;

export function finishGameSteps<Result>(steps: GameSteps<Result>, onProgress?: ProgressListener): Result {
  let step = steps.next();
  while (!step.done) {
    if (step.value) onProgress?.(step.value);
    step = steps.next();
  }
  return step.value;
}

export const yieldToBrowser = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** Run the same isolated command a piece at a time so input and progress can paint. */
export async function finishGameStepsInBrowser<Result>(steps: GameSteps<Result>, onProgress?: ProgressListener): Promise<Result> {
  await yieldToBrowser();
  let sliceStart = performance.now();
  let step = steps.next();
  while (!step.done) {
    if (step.value) onProgress?.(step.value);
    if (step.value || performance.now() - sliceStart >= 50) {
      await yieldToBrowser();
      sliceStart = performance.now();
    }
    step = steps.next();
  }
  return step.value;
}
