import {NEW_FIELD_ATTRIBUTES,LEGACY_FIELD_ATTRIBUTES,overall,expanded2121Overall,attributeWeights,overallParts} from './attributes';
import type {AttributeKey,Attributes,Career,Player} from './types';

export function derivedAttribute(a:Attributes,key:AttributeKey):number{
 const v=(k:AttributeKey)=>a[k]??50;
 const values:Partial<Record<AttributeKey,number>>={finishing:v('shooting')*.7+v('composure')*.3,offTheBall:v('positioning')*.55+v('anticipation')*.25+v('decisions')*.2,pressing:v('defending')*.4+v('stamina')*.2+v('teamwork')*.2+v('decisions')*.2,tackling:v('defending')*.7+v('strength')*.2+v('decisions')*.1,skillMoves:v('dribbling')*.55+v('ballControl')*.25+v('agility')*.2};
 return Math.round((values[key]??v(key))*100)/100;
}
export function expandedPlayer(p:Player):Player{
 if(p.abilityVersion===2&&p.ovrVersion===3)return p;
 const attributes={...p.attributes};if(p.position!=='GK')for(const key of NEW_FIELD_ATTRIBUTES)if(attributes[key]===undefined)attributes[key]=derivedAttribute(attributes,key);
 const skillMastery:Attributes=p.abilityVersion===2?{...p.skillMastery}:{};if(p.abilityVersion!==2)for(const k of p.playSkills??[])skillMastery[k]=Math.max(0,(attributes[k]??0)-100);
 for(const key of Object.keys(attributes) as AttributeKey[])if(!p.playSkills?.includes(key))attributes[key]=Math.min(100,attributes[key]!);
 const next={...p,attributes,skillMastery,abilityVersion:2 as const,ovrVersion:3 as const};next.ovr=overall(next);return next;
}
/** One-time rule conversion. Keep the entire previous active snapshot and never
 * rewrite archived seasons, match events, contracts or awards. */
export function upgradeAbilities(c:Career):void{
 if(!needsAbilityUpgrade(c.player))return;
 const old=c.player,added:Attributes={},next=expandedPlayer(old);
 for(const key of NEW_FIELD_ATTRIBUTES)if(old.attributes[key]===undefined&&next.attributes[key]!==undefined)added[key]=next.attributes[key];
 if(old.abilityVersion!==2&&next.talent==='SSS')next.potential=Math.max(next.potential,105+Math.max(0,Math.min(1,(old.potential-98)/2))*15);
 c.player=next;
 const intermediate={...old,attributes:{...old.attributes,...added},skillMastery:next.skillMastery},reweighted=expanded2121Overall(intermediate);
 if(c.systems){
  if(old.ovrVersion!==2)c.systems.ovrUpgrade={version:2,priorAbilityVersion:old.abilityVersion,year:c.season.year,round:c.season.week,ovrBefore:old.ovr,ovrAfter:reweighted};
  if(old.abilityVersion!==2)c.systems.abilityUpgrade={version:2,year:c.season.year,round:c.season.week,ovrBefore:old.ovr,ovrAfter:reweighted,added};
  const ledger=c.systems.growthLedger;
  c.systems.abilityRulesUpgrade={version:3,priorOvrVersion:old.ovrVersion===2?2:undefined,year:c.season.year,round:c.season.week,ovrBefore:reweighted,ovrAfter:next.ovr,playSkillsBefore:[...(old.playSkills??[])],skillMasteryBefore:{...intermediate.skillMastery},attributesBefore:{...old.attributes},attributeStartBefore:{...c.season.attributeStart},...(ledger?{baselineBefore:{...ledger.baselineAttributes}}:{})};
  if(ledger?.year===c.season.year){
   ledger.baselineAttributes={...ledger.baselineAttributes,...added};
   for(const key of Object.keys(old.attributes) as AttributeKey[]){
    const delta=(next.attributes[key]??0)-old.attributes[key]!;if(!delta)continue;
    const shifted=(ledger.baselineAttributes[key]??old.attributes[key]!)+delta;
    ledger.baselineAttributes[key]=Math.max(0,shifted);
    // A valid old career may have trained from zero. Preserve a nonnegative
    // baseline and record the remainder as an explicit cap/skill adjustment.
    if(shifted<0){const change=ledger.byCause.skillChange??={};change[key]=(change[key]??0)+shifted;}
   }
  }
 }
 c.season.attributeStart={...c.season.attributeStart,...added};
 for(const key of Object.keys(old.attributes) as AttributeKey[]){const delta=(next.attributes[key]??0)-old.attributes[key]!;if(delta)c.season.attributeStart[key]=Math.max(0,(c.season.attributeStart[key]??old.attributes[key]!)+delta);}
}
export const hasFieldBaseline=(p:Player)=>LEGACY_FIELD_ATTRIBUTES.every(k=>Number.isFinite(p.attributes[k]));
/** Earned specialty execution is match-only. Raw ability remains at most 120. */
export function specialtyAbility(p:{abilityVersion?:2;ovrVersion?:2|3;playSkills?:AttributeKey[];skillMastery?:Attributes},key:AttributeKey,raw:number):number{
 if(p.ovrVersion===3&&!p.playSkills?.includes(key))raw=Math.min(100,raw);
 return raw+(p.abilityVersion===2&&p.playSkills?.includes(key)?Math.min(20,Math.max(0,p.skillMastery?.[key]??0),Math.max(0,raw-100))*.1:0);
}
/** Calibrate actual action qualities to the same earned 0–130 comparison scale.
 * Relative skill strengths remain intact; no goals, stats or awards are added.
 * Computed once per match actor, not once per action. */
export function matchExecutionBonus(p:Pick<Player,'attributes'|'position'|'playSkills'|'skillMastery'|'abilityVersion'|'ovrVersion'>&{style?:string}):number{
 if(p.ovrVersion!==3||!p.playSkills?.some(k=>(p.attributes[k]??0)>100))return 0;
 const style=p.style??'',weights=attributeWeights(p.position,style);let raw=0,excellence=0;
 for(const [k,w]of Object.entries(weights)){
  const value=specialtyAbility(p,k as AttributeKey,Math.max(0,Math.min(120,p.attributes[k as AttributeKey]??0)));
  raw+=value*w!;excellence+=Math.max(0,value-80)*w!;
 }
 // Protect genuine weaknesses: an exceptional reader never acquires elite
 // dribbling or pace merely because other specialties raise the total OVR.
 return excellence>0?Math.max(0,overallParts({...p,style}).total-raw)/excellence:0;
}

export function comparableLegacyOVR(c:Career,value:number,attributes?:Attributes,position=c.player.position,playSkills=c.player.playSkills):number{
 if(c.player.abilityVersion!==2)return value;
 if(!attributes)return value>100?100+(value-100)*.5:value;
 return expandedPlayer({...c.player,abilityVersion:undefined,attributes,position,playSkills,skillMastery:undefined,ovr:value}).ovr;
}

export const needsAbilityUpgrade=(p:Player)=>p.abilityVersion!==2||p.ovrVersion!==3;
export function seasonOVRAdjustment(c:Career):number{return [c.systems?.ovrUpgrade,c.systems?.abilityRulesUpgrade].reduce((n,u)=>n+(u?.year===c.season.year?u.ovrAfter-u.ovrBefore:0),0);}
export function seasonOVRChange(c:Career):number{return c.player.ovr-c.season.ovrStart-seasonOVRAdjustment(c);}
