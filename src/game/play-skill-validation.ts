import {attributeCap,playSkillDefinitions} from './play-skills';
import {overall,legacyOverall,POSITION_LABELS} from './attributes';
import type {AttributeKey,Career,Position} from './types';

export function validatePlaySkills(c:Career):void{
 const check=(ok:unknown,message:string)=>{if(!ok)throw Error(`저장 데이터 오류: 플레이스킬 ${message} 원본을 보존한 뒤 선택을 복구해 주세요.`);};
 const keys=(value:unknown,position:Position):AttributeKey[]=>{
  check(Array.isArray(value)&&value.length<=5,'선택은 최대 5개입니다. 자동으로 삭제하지 않습니다.');
  const rows=value as AttributeKey[],allowed=playSkillDefinitions(position).map(s=>s.key);
  check(new Set(rows).size===rows.length&&rows.every(k=>allowed.includes(k)),'중복 또는 포지션이 맞지 않는 선택입니다.');return rows;
 };
 const selected=c.player.playSkills===undefined?[]:keys(c.player.playSkills,c.player.position);
 check(c.player.ovr<=(c.player.abilityVersion===2?130:100+4*selected.length),'종합 능력치 상한을 초과합니다.');
 if(c.player.abilityVersion!==undefined)check(c.player.abilityVersion===2,'능력치 체계 버전입니다.');
 if(c.player.skillMastery!==undefined){check(c.player.abilityVersion===2&&c.player.skillMastery&&typeof c.player.skillMastery==='object'&&!Array.isArray(c.player.skillMastery),'숙련 형식입니다.');for(const [key,value]of Object.entries(c.player.skillMastery))check(selected.includes(key as AttributeKey)&&Number.isFinite(value)&&value>=0&&value<=20,'선택한 능력치의 실제 숙련 범위입니다.');}
 for(const [key,value]of Object.entries(c.player.attributes))check(value<=attributeCap(c.player,key as AttributeKey),c.player.abilityVersion===2?'개별 능력치의 120 상한을 초과합니다.':'구버전 미선택 능력치의 100 또는 선택 능력치의 110 상한을 초과합니다.');
 if(c.player.playSkills!==undefined||c.player.abilityVersion===2)check(c.player.ovr===(c.player.abilityVersion===2?overall(c.player):legacyOverall(c.player)),'종합 능력치와 실제 숙련이 다릅니다.');
 const events=c.systems?.playSkillChanges;
 if(events!==undefined){
  check(Array.isArray(events)&&events.length<=10000,'변경 이력이 올바르지 않습니다.');
  const replay=new Set<AttributeKey>();let year=1900;
  for(const e of events){
   check(Number.isInteger(e.year)&&e.year>=year&&e.year<=c.season.year+1&&Number.isInteger(e.round)&&e.round>=0&&e.round<=150,'변경 연도가 올바르지 않습니다.');year=e.year;
   check(e.position in POSITION_LABELS&&playSkillDefinitions(e.position).some(s=>s.key===e.key)&&typeof e.selected==='boolean','변경 대상이 올바르지 않습니다.');
   check(Number.isFinite(e.before)&&e.before>=0&&e.before<=(e.abilityVersion===2?120:110)&&Number.isFinite(e.after)&&e.after>=0&&e.after<=(e.abilityVersion===2?120:110),'변경 전후 수치가 올바르지 않습니다.');
   check(e.selected||e.abilityVersion===2?e.before===e.after:e.after===Math.min(100,e.before),'선택 즉시 능력이 증가하거나 삭제 시 수치가 일치하지 않습니다.');
   check(replay.has(e.key)!==e.selected,'변경 이력이 중복됩니다.');if(e.selected)replay.add(e.key);else replay.delete(e.key);
   check(replay.size<=5,'변경 이력에 6개 이상 선택이 있습니다.');
  }
  check(selected.length===replay.size&&selected.every(k=>replay.has(k)),'현재 선택과 변경 이력이 다릅니다.');
 }
 for(const h of c.history)if(h.details){const d=h.details;
  if(d.abilityVersion!==undefined)check(d.abilityVersion===2,'연도별 능력치 체계 버전입니다.');
  const list=d.playSkills===undefined?[]:keys(d.playSkills,h.position);
  if(d.skillMastery!==undefined){check(d.abilityVersion===2&&d.skillMastery&&typeof d.skillMastery==='object'&&!Array.isArray(d.skillMastery),'연도별 숙련 형식입니다.');for(const [key,value]of Object.entries(d.skillMastery))check(list.includes(key as AttributeKey)&&Number.isFinite(value)&&value>=0&&value<=20,'연도별 선택한 능력치의 실제 숙련 범위입니다.');}
  if(d.playSkills!==undefined||d.abilityVersion===2)for(const [key,value]of Object.entries(d.attributes))check(value<=(d.abilityVersion===2?120:list.includes(key as AttributeKey)?110:100),'연도별 능력치와 당시 선택이 다릅니다.');
 }
}
