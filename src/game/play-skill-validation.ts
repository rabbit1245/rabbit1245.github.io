import {attributeCap,playSkillDefinitions} from './play-skills';
import {overall,POSITION_LABELS} from './attributes';
import type {AttributeKey,Career,Position} from './types';

export function validatePlaySkills(c:Career):void{
 const check=(ok:unknown,message:string)=>{if(!ok)throw Error(`저장 데이터 오류: 플레이스킬 ${message} 원본을 보존한 뒤 선택을 복구해 주세요.`);};
 const keys=(value:unknown,position:Position):AttributeKey[]=>{
  check(Array.isArray(value)&&value.length<=5,'선택은 최대 5개입니다. 자동으로 삭제하지 않습니다.');
  const rows=value as AttributeKey[],allowed=playSkillDefinitions(position).map(s=>s.key);
  check(new Set(rows).size===rows.length&&rows.every(k=>allowed.includes(k)),'중복 또는 포지션이 맞지 않는 선택입니다.');return rows;
 };
 const selected=c.player.playSkills===undefined?[]:keys(c.player.playSkills,c.player.position);
 check(c.player.ovr<=100+4*selected.length,'선택 개수에 따른 종합 능력치 상한을 초과합니다.');
 for(const [key,value]of Object.entries(c.player.attributes))check(value<=attributeCap(c.player,key as AttributeKey),'미선택 능력치의 100 초과 또는 선택 능력치의 110 초과입니다.');
 if(c.player.playSkills!==undefined)check(c.player.ovr===overall(c.player),'종합 능력치와 실제 숙련이 다릅니다.');
 const events=c.systems?.playSkillChanges;
 if(events!==undefined){
  check(Array.isArray(events)&&events.length<=10000,'변경 이력이 올바르지 않습니다.');
  const replay=new Set<AttributeKey>();let year=1900;
  for(const e of events){
   check(Number.isInteger(e.year)&&e.year>=year&&e.year<=c.season.year+1&&Number.isInteger(e.round)&&e.round>=0&&e.round<=150,'변경 연도가 올바르지 않습니다.');year=e.year;
   check(e.position in POSITION_LABELS&&playSkillDefinitions(e.position).some(s=>s.key===e.key)&&typeof e.selected==='boolean','변경 대상이 올바르지 않습니다.');
   check(Number.isFinite(e.before)&&e.before>=0&&e.before<=110&&Number.isFinite(e.after)&&e.after>=0&&e.after<=110,'변경 전후 수치가 올바르지 않습니다.');
   check(e.selected?e.before===e.after:e.after===Math.min(100,e.before),'선택 즉시 능력이 증가하거나 삭제 시 수치가 일치하지 않습니다.');
   check(replay.has(e.key)!==e.selected,'변경 이력이 중복됩니다.');if(e.selected)replay.add(e.key);else replay.delete(e.key);
   check(replay.size<=5,'변경 이력에 6개 이상 선택이 있습니다.');
  }
  check(selected.length===replay.size&&selected.every(k=>replay.has(k)),'현재 선택과 변경 이력이 다릅니다.');
 }
 for(const h of c.history)if(h.details?.playSkills!==undefined){const list=keys(h.details.playSkills,h.position);for(const [key,value]of Object.entries(h.details.attributes))check(value<=(list.includes(key as AttributeKey)?110:100),'연도별 능력치와 당시 선택이 다릅니다.');}
}
