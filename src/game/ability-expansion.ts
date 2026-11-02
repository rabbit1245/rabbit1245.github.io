import {NEW_FIELD_ATTRIBUTES,LEGACY_FIELD_ATTRIBUTES,overall} from './attributes';
import type {AttributeKey,Attributes,Career,Player} from './types';

export function derivedAttribute(a:Attributes,key:AttributeKey):number{
 const v=(k:AttributeKey)=>a[k]??50;
 const values:Partial<Record<AttributeKey,number>>={finishing:v('shooting')*.7+v('composure')*.3,offTheBall:v('positioning')*.55+v('anticipation')*.25+v('decisions')*.2,pressing:v('defending')*.4+v('stamina')*.2+v('teamwork')*.2+v('decisions')*.2,tackling:v('defending')*.7+v('strength')*.2+v('decisions')*.1,skillMoves:v('dribbling')*.55+v('ballControl')*.25+v('agility')*.2};
 return Math.round((values[key]??v(key))*100)/100;
}
export function expandedPlayer(p:Player):Player{
 if(p.abilityVersion===2)return p;
 const attributes={...p.attributes};if(p.position!=='GK')for(const key of NEW_FIELD_ATTRIBUTES)if(attributes[key]===undefined)attributes[key]=derivedAttribute(attributes,key);
 const skillMastery:Attributes={};for(const k of p.playSkills??[])skillMastery[k]=Math.max(0,(attributes[k]??0)-100);
 const next={...p,attributes,skillMastery,abilityVersion:2 as const};next.ovr=overall(next);return next;
}
/** Version upgrade, not growth: never rewrite old ability values or old seasons. */
export function upgradeAbilities(c:Career):void{
 if(c.player.abilityVersion===2)return;
 const old=c.player,added:Attributes={},next=expandedPlayer(old);
 for(const key of NEW_FIELD_ATTRIBUTES)if(old.attributes[key]===undefined&&next.attributes[key]!==undefined)added[key]=next.attributes[key];
 if(next.talent==='SSS')next.potential=Math.max(next.potential,105+Math.max(0,Math.min(1,(old.potential-98)/2))*15);
 c.player=next;
 if(c.systems){
  c.systems.abilityUpgrade={version:2,year:c.season.year,round:c.season.week,ovrBefore:old.ovr,ovrAfter:next.ovr,added};
  const ledger=c.systems.growthLedger;if(ledger?.year===c.season.year)ledger.baselineAttributes={...ledger.baselineAttributes,...added};
 }
 c.season.attributeStart={...c.season.attributeStart,...added};
}
export const hasFieldBaseline=(p:Player)=>LEGACY_FIELD_ATTRIBUTES.every(k=>Number.isFinite(p.attributes[k]));
/** Earned specialty execution is match-only. Raw ability remains at most 120. */
export function specialtyAbility(p:{abilityVersion?:2;playSkills?:AttributeKey[];skillMastery?:Attributes},key:AttributeKey,raw:number):number{
 return raw+(p.abilityVersion===2&&p.playSkills?.includes(key)?Math.min(20,Math.max(0,p.skillMastery?.[key]??0),Math.max(0,raw-100))*.1:0);
}

export function comparableLegacyOVR(c:Career,value:number,attributes?:Attributes,position=c.player.position,playSkills=c.player.playSkills):number{
 if(c.player.abilityVersion!==2)return value;
 if(!attributes)return value>100?100+(value-100)*.5:value;
 return expandedPlayer({...c.player,abilityVersion:undefined,attributes,position,playSkills,skillMastery:undefined,ovr:value}).ovr;
}
