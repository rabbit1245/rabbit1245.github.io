import type { Career } from './types';

export const CHEAT_INCREASE_AMOUNTS = [1, 3, 5, 10] as const;
export type CheatIncreaseAmount = typeof CHEAT_INCREASE_AMOUNTS[number];
export const DEFAULT_CHEAT_SETTINGS = {enabled:true,freezeAging:false,used:false} as const;

export function getCheatSettings(career: Career) {
  return career.systems?.cheats ?? DEFAULT_CHEAT_SETTINGS;
}
