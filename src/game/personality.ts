import type {Career} from './types';
export const PERSONALITY_KEYS=['leadership','stardom','fairPlay','clutch','winning'] as const;
export type PersonalityKey=typeof PERSONALITY_KEYS[number];
export type Personality=Record<PersonalityKey,number>;
export const DEFAULT_PERSONALITY:Readonly<Personality>={leadership:5,stardom:5,fairPlay:5,clutch:5,winning:5};
export const PERSONALITY_LABELS:Record<PersonalityKey,string>={leadership:'리더십',stardom:'스타성',fairPlay:'페어 능력',clutch:'승부사',winning:'유관력'};
export function personality(c:Career):Readonly<Personality>{return c.systems?.personality??DEFAULT_PERSONALITY;}
export function personalityEdge(c:Career,key:PersonalityKey):number{return personality(c)[key]-5;}
