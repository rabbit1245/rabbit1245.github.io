import {EXTENDED_COUNTERS} from './math';
import type {MatchEvent,MatchRecord,PlayerStats} from './types';

export const EXTENDED_LABELS={freeKickGoals:'프리킥 득점',freeKickAssists:'프리킥 도움',penaltyGoals:'페널티킥 득점',bigChancesCreated:'결정적 기회 창출',bigChanceAssists:'결정적 기회 도움',pressingAttempts:'압박 시도',pressingSuccesses:'집계 압박 성공',ballRecoveries:'볼 회수',pressureRecoveries:'압박 후 볼 회수'} as const;
export const extendedCoverage=(s:PlayerStats)=>({apps:s.extendedApps??0,minutes:s.extendedMinutes??0,known:(s.extendedApps??0)>0||s.apps===0,partial:(s.extendedApps??0)<s.apps});
type Totals=Record<typeof EXTENDED_COUNTERS[number],number>;
const zero=():Totals=>Object.fromEntries(EXTENDED_COUNTERS.map(k=>[k,0])) as Totals;
export function extendedEventTotals(events:readonly MatchEvent[]):Map<string,Totals>{
 const index=new Map(events.map(e=>[e.id,e])),out=new Map<string,Totals>(),big=new Map<string,string>();
 const row=(id:string)=>{let r=out.get(id);if(!r){r=zero();out.set(id,r);}return r;};
 for(const e of events){if(!e.playerId)continue;const a=e.action;
  if(a?.kind==='pressure')row(e.playerId).pressingAttempts++;
  if(a?.kind==='bigChance') {row(e.playerId).bigChancesCreated++;big.set(`${e.relatedId}|${e.playerId}`,e.id);}
  if(a?.kind==='recovery'){
   row(e.playerId).ballRecoveries++;const source=index.get(e.relatedId??'');
   if(source?.action?.kind==='pressure'){row(e.playerId).pressureRecoveries++;if(source.playerId)row(source.playerId).pressingSuccesses++;}
  }
 }
 for(const e of events){if(!e.playerId)continue;
  if(e.type==='goal'){const shot=index.get(e.relatedId??'');if(shot?.action?.kind==='shot'){if(shot.action.shotType==='freeKick')row(e.playerId).freeKickGoals++;if(shot.action.shotType==='penalty')row(e.playerId).penaltyGoals++;}}
  if(e.type==='assist'){
   const goal=index.get(e.relatedId??''),shot=index.get(goal?.relatedId??'');if(!shot)continue;
   if(big.has(`${shot.id}|${e.playerId}`))row(e.playerId).bigChanceAssists++;
   if(shot.action?.kind==='headerShot'){const cross=index.get(shot.relatedId??''),supply=index.get(cross?.relatedId??'');if(cross?.playerId===e.playerId&&supply?.action?.kind==='setPiece'&&supply.action.delivery==='freeKick')row(e.playerId).freeKickAssists++;}
  }
 }
 return out;
}
/** New-only counters never infer a denominator from incomplete historical logs. */
export function validateExtendedLedger(m:MatchRecord,playerId:string):void{
 if(m.extendedVersion===undefined)return;
 const check=(v:unknown,label:string)=>{if(!v)throw Error(`저장 데이터 오류: 확장 경기 원장 · ${label}`);};
 check(m.extendedVersion===1&&m.actionVersion===1,'원본 버전');
 const index=new Map(m.events.map(e=>[e.id,e])),chances=new Set<string>(),recoveries=new Map<string,MatchEvent>();
 for(const e of m.events){const a=e.action;
  if(a?.kind==='recovery'){check(!recoveries.has(a.possessionId),'소유권 회복 중복');recoveries.set(a.possessionId,e);}
  if(a?.kind==='shot')check(e.type==='shot'&&['open','oneOnOne','freeKick','penalty'].includes(a.shotType)&&typeof a.bigChance==='boolean','슈팅 분류');
  if(a?.kind==='bigChance'){
   const shot=index.get(e.relatedId??'');check(e.type==='bigChance'&&shot?.type==='shot'&&shot.playerId===a.receiverId&&e.playerId!==a.receiverId&&shot.minute===e.minute&&shot.teamId===e.teamId&&Number.isFinite(a.quality)&&a.quality>=0&&a.quality<=1,'실제 동료 슈팅으로 연결한 결정적 기회');
   check(!chances.has(shot!.id),'결정적 기회 중복');chances.add(shot!.id);
  }
  if(a?.kind==='ballDuel')check(['tackle','interception'].includes(e.type)&&e.type===a.method&&typeof a.success==='boolean'&&typeof a.holderId==='string'&&a.holderId!==e.playerId&&[m.homeId,m.awayId].includes(a.holderTeamId)&&e.teamId!==a.holderTeamId,'실제 수비 볼 경합');
 }
 for(const e of m.events){const a=e.action;if(a?.kind==='ballDuel')check(a.success===recoveries.has(a.possessionId),'수비 경합·소유권 회복 일치');}
 for(const e of m.events)if(e.action?.kind==='shot')check(e.action.bigChance===chances.has(e.id),'명확한 득점 기회와 실제 공급 일치');
 const totals=extendedEventTotals(m.events);
 for(const [id,s]of [[playerId,m.playerStats],...(m.performers??[]).map(p=>[p.id,p.stats])] as [string,PlayerStats][]){
  const t=totals.get(id)??zero();for(const key of EXTENDED_COUNTERS)check(s[key]===t[key],`${key}와 실제 이벤트 불일치`);
  check(s.extendedApps===s.apps&&s.extendedMinutes===s.minutes,'집계 출전 범위');check((s.freeKickGoals??0)+(s.penaltyGoals??0)<=s.goals,'득점 하위 기록');check((s.freeKickAssists??0)<=s.assists&&(s.bigChanceAssists??0)<=s.assists&&(s.bigChanceAssists??0)<=(s.bigChancesCreated??0),'도움·기회 하위 기록');
  check((s.pressingSuccesses??0)<=(s.pressingAttempts??0),'압박 성공률');check((s.bigChancesCreated??0)<=(s.keyPasses??0),'결정적 기회와 마지막 패스');check(s.ballRecoveries===s.tackles+s.interceptions+(s.pressureRecoveries??0),'볼 회수 중복·누락');
 }
}
