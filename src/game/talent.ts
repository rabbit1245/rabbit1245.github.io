import type { Player,Talent } from './types';

/** Reference tiers describe potential, not guaranteed career achievements. */
export const TALENT_PROFILES:Record<Talent,{potential:[number,number];slowAge:number;declineAge:number;reference:string}>={
 D:{potential:[54,68],slowAge:26,declineAge:30,reference:'프로 도전'},
 C:{potential:[62,75],slowAge:27,declineAge:30,reference:'프로 선수'},
 B:{potential:[70,82],slowAge:27,declineAge:31,reference:'리그 주전'},
 A:{potential:[77,88],slowAge:28,declineAge:31,reference:'상위 리그 핵심'},
 S:{potential:[85,89],slowAge:29,declineAge:32,reference:'손흥민급 세계적인 선수'},
 SS:{potential:[94,99],slowAge:31,declineAge:34,reference:'살라·레반도프스키급 최상위 선수'},
 SSS:{potential:[98,100],slowAge:32,declineAge:35,reference:'호날두·메시급 역사적 재능 · 초과 숙련으로 100 이상 도전'},
};
export function growthAgeFactor(p:Pick<Player,'talent'|'age'|'position'>):number{
 const slow=TALENT_PROFILES[p.talent].slowAge+(p.position==='GK'?3:0);
 return p.age<=18?1.3:p.age<=22?1.15:p.age<=slow?1:p.age<=slow+2?.75:p.age<=slow+5?.4:.15;
}
export function declineAge(p:Pick<Player,'talent'|'position'>):number{return TALENT_PROFILES[p.talent].declineAge+(p.position==='GK'?3:0);}
