import {attributeCap} from './play-skills';
import type { AttributeKey, Career } from './types';

export const DEFAULT_CHEAT_SETTINGS = {enabled:true,freezeAging:false,used:false} as const;

export function getCheatSettings(career: Career) {
  return career.systems?.cheats ?? DEFAULT_CHEAT_SETTINGS;
}

export function canIncreaseAttribute(career:Career,key:AttributeKey):boolean {
  const value=career.player.attributes[key];
  return value!==undefined&&value<attributeCap(career.player,key)&&!career.systems?.attributeLocks?.includes(key);
}
