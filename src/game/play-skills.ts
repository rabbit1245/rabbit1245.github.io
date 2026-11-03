import type {AttributeKey,Career,Player,Position} from './types';
import {ATTRIBUTE_LABELS} from './attributes';

export interface PlaySkill {key:AttributeKey;name:string;english:string}
export const FIELD_PLAY_SKILLS:PlaySkill[]=[
 ['strength','비스트','Beast'],['stamina','엔진','Engine'],['speed','블리츠','Blitz'],['agility','바이퍼','Viper'],['jumping','스카이워커','Skywalker'],
 ['ballControl','벨벳','Velvet'],['dribbling','팬텀','Phantom'],['passing','아키텍트','Architect'],['crossing','휘프','Whip'],['shooting','스나이퍼','Sniper'],
 ['heading','에어리얼','Aerial'],['defending','락다운','Lockdown'],['setPieces','데드아이','Deadeye'],['decisions','오라클','Oracle'],['vision','니들','Needle'],
 ['anticipation','인터셉터','Interceptor'],['positioning','섀도우','Shadow'],['composure','아이스맨','Iceman'],['concentration','포커스','Focus'],['teamwork','커맨더','Commander'],
 ['finishing','클리니컬','Clinical'],['offTheBall','고스트런','Ghost Run'],['pressing','프레셔','Pressure'],['tackling','볼헌터','Ball Hunter'],['skillMoves','매지션','Magician'],
].map(([key,name,english])=>({key:key as AttributeKey,name,english}));
export const GK_PLAY_SKILLS:PlaySkill[]=[
 ['gkShotStopping','아이언월','Iron Wall'],['gkReflexes','리플렉스','Reflex'],['gkHandling','세이프핸즈','Safe Hands'],['gkAerialCommand','에어커맨드','Air Command'],
 ['gkOneOnOnes','듀얼리스트','Duelist'],['gkPositioning','가디언','Guardian'],['gkDistribution','디스트리뷰터','Distributor'],['decisions','체스마스터','Chessmaster'],
 ['concentration','스틸마인드','Steel Mind'],['gkDefensiveOrganization','필드마셜','Field Marshal'],
].map(([key,name,english])=>({key:key as AttributeKey,name,english}));
export const playSkillDefinitions=(position:Position)=>position==='GK'?GK_PLAY_SKILLS:FIELD_PLAY_SKILLS;
export const attributeCap=(p:Pick<Player,'playSkills'|'abilityVersion'|'ovrVersion'>,key:AttributeKey)=>p.ovrVersion===3?(p.playSkills?.includes(key)?120:100):p.abilityVersion===2?120:p.playSkills?.includes(key)?110:100;
export interface PlaySkillChange {abilityVersion?:2;ovrVersion?:3;year:number;round:number;key:AttributeKey;selected:boolean;before:number;after:number;position:Position}
/** Replay the actual acquisition/removal year, never copy today's skills into old seasons. */
export function playSkillsForYear(c:Career,year:number):AttributeKey[]{
 const changes=c.systems?.playSkillChanges;
 if(changes){const selected=new Set<AttributeKey>();for(const e of changes)if(e.year<=year){if(e.selected)selected.add(e.key);else selected.delete(e.key);}return [...selected];}
 return c.history.find(h=>h.year===year)?.details?.playSkills??(year===c.season.year?c.player.playSkills??[]:[]);
}
export function playSkillNames(position:Position,keys:readonly AttributeKey[]):string[]{return keys.map(key=>playSkillDefinitions(position).find(s=>s.key===key)?.name).filter((s):s is string=>!!s);}
/** Annual retirement labels explain the specialty without changing saved skill IDs. */
export function retirementPlaySkillNames(position:Position,keys:readonly AttributeKey[]):string[]{
 return keys.flatMap(key=>{const skill=playSkillDefinitions(position).find(s=>s.key===key);return skill?[`${skill.name}(${ATTRIBUTE_LABELS[key]} 스페셜리스트)`]:[];});
}
