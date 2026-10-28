import {ACTION_COUNTERS} from './math';
import type {MatchEvent,MatchRecord,PlayerStats} from './types';

export const ACTION_LABELS={headerGoals:'헤더 득점',pressingWins:'압박 성공',progressivePasses:'전진 패스 성공',punches:'펀칭 성공'} as const;
export type ActionCounter=keyof typeof ACTION_LABELS;
export function actionCoverage(s:PlayerStats){const apps=s.actionApps??0;return {apps,minutes:s.actionMinutes??0,known:apps>0||s.apps===0,partial:apps<s.apps};}
export type EventActionTotals=Record<ActionCounter|'crossesFaced'|'crossesCaught',number>;
const empty=():EventActionTotals=>({headerGoals:0,pressingWins:0,progressivePasses:0,punches:0,crossesFaced:0,crossesCaught:0});

/** One index and one pass per match; no per-player rescans of a career. */
export function actionEventTotals(events:readonly MatchEvent[]):Map<string,EventActionTotals>{
  const index=new Map(events.map(e=>[e.id,e])),totals=new Map<string,EventActionTotals>();
  const row=(id:string)=>{let r=totals.get(id);if(!r){r=empty();totals.set(id,r);}return r;};
  for(const e of events){
    const a=e.action;
    if(e.type==='goal'&&e.playerId&&index.get(e.relatedId??'')?.action?.kind==='headerShot')row(e.playerId).headerGoals++;
    if(e.type==='recovery'&&a?.kind==='recovery'){
      const pressure=index.get(e.relatedId??'');if(pressure?.type==='pressure'&&pressure.playerId&&pressure.action?.kind==='pressure'&&pressure.action.possessionId===a.possessionId)row(pressure.playerId).pressingWins++;
    }
    if(e.type==='pass'&&e.playerId&&a?.kind==='phasePass'&&a.completed&&a.toZone>a.fromZone)row(e.playerId).progressivePasses++;
    if(e.type==='cross'&&a?.kind==='cross')row(a.keeperId).crossesFaced++;
    if(e.playerId&&a?.kind==='airClaim'&&a.success){if(e.type==='punch'&&a.destination==='safe')row(e.playerId).punches++;if(e.type==='catch'&&a.destination==='held')row(e.playerId).crossesCaught++;}
  }
  return totals;
}

/** Validate ownership changes and exclusive actions before accepting their counters. */
export function validateActionLedger(m:MatchRecord,playerId:string):void{
  const fail=(v:unknown,message:string)=>{if(!v)throw new Error(`저장 데이터 오류: 신규 행동 원장 · ${message}`);};
  const events=m.events,index=new Map(events.map(e=>[e.id,e])),actors=new Map((m.performers??[]).map(p=>[p.id,p]));
  const entries=new Map(events.filter(e=>e.type==='substitution'&&e.playerId&&e.detail.includes('투입')).map(e=>[e.playerId!,e.minute]));
  const recoveries=new Map<string,MatchEvent>(),claims=new Set<string>(),headers=new Set<string>();
  const text=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=500;
  const opposite=(a:string,b:string)=>a!==b&&[m.homeId,m.awayId].includes(a)&&[m.homeId,m.awayId].includes(b);
  const active=(id:string,minute:number,team?:string)=>{
    if(!actors.size)return;
    const p=actors.get(id);fail(p,'행동 선수가 경기 명단에 없습니다.');
    if(!p)return;const start=p.started?0:entries.get(id);
    fail(start!==undefined&&minute>start&&minute<=start+p.minutes&&(!team||(p.teamId??p.clubId)===team),'행동 시점·출전 팀');
  };
  for(const e of events){
    const a=e.action;if(!a)continue;fail(text(e.playerId),'행동 선수 ID');active(e.playerId!,e.minute,e.teamId);
    fail(a&&typeof a==='object'&&!Array.isArray(a),'행동 형식');
    if(a.kind==='phasePass'){
      fail(e.type==='pass'&&[a.fromZone,a.toZone].every(z=>Number.isInteger(z)&&z>=0&&z<=3)&&typeof a.completed==='boolean'&&text(a.receiverId)&&a.receiverId!==e.playerId,'구역 전환 패스');active(a.receiverId,e.minute,e.teamId);
    }else if(a.kind==='pressure'){
      fail(e.type==='pressure'&&text(a.possessionId)&&text(a.holderId)&&opposite(a.holderTeamId,e.teamId)&&typeof a.recovered==='boolean','압박 전 상대 소유권');active(a.holderId,e.minute,a.holderTeamId);
    }else if(a.kind==='recovery'){
      const p=index.get(e.relatedId??'');fail(e.type==='recovery'&&p?.type==='pressure'&&p.action?.kind==='pressure','회복을 유도한 압박');
      if(p?.action?.kind==='pressure')fail(p.minute===e.minute&&p.teamId===e.teamId&&p.action.recovered&&p.action.possessionId===a.possessionId&&p.action.holderTeamId===a.fromTeamId&&opposite(a.fromTeamId,e.teamId),'확인된 팀 소유권 회복');
      fail(!recoveries.has(a.possessionId),'같은 소유권을 두 번 회복');recoveries.set(a.possessionId,e);
    }else if(a.kind==='cross'){
      fail(e.type==='cross'&&text(a.keeperId)&&typeof a.claimable==='boolean'&&['open','setPiece'].includes(a.phase),'크로스');
      const keeper=actors.get(a.keeperId);if(actors.size)fail(keeper?.position==='GK'&&opposite(keeper.teamId??keeper.clubId,e.teamId),'크로스 상대 골키퍼');active(a.keeperId,e.minute);
      if(a.phase==='setPiece'){const s=index.get(e.relatedId??'');fail(s?.type==='setPiece'&&s.action?.kind==='setPiece'&&s.minute===e.minute&&s.teamId===e.teamId,'실제 세트피스 공급');}
    }else if(a.kind==='airClaim'){
      const cross=index.get(e.relatedId??'');fail(['catch','punch'].includes(e.type)&&typeof a.success==='boolean'&&cross?.type==='cross'&&cross.action?.kind==='cross','공중볼 처리의 원본 크로스');
      if(cross?.action?.kind==='cross')fail(cross.action.claimable&&cross.action.keeperId===e.playerId&&cross.minute===e.minute&&opposite(cross.teamId,e.teamId),'포구·펀칭 대상');
      fail(!claims.has(e.relatedId??''),'동일 크로스 포구·펀칭 중복');claims.add(e.relatedId??'');
      fail(a.destination===(a.success?(e.type==='punch'?'safe':'held'):'danger'),'펀칭 안전 지역·포구 결과');
    }else if(a.kind==='setPiece')fail(e.type==='setPiece'&&['corner','freeKick'].includes(a.delivery),'세트피스 상황');
    else if(a.kind==='headerDuel'){
      const cross=index.get(e.relatedId??'');fail(e.type==='aerial'&&text(a.attackerId)&&text(a.defenderId)&&a.attackerId!==a.defenderId&&[a.attackerId,a.defenderId].includes(a.winnerId)&&e.playerId===a.winnerId&&cross?.type==='cross'&&cross.action?.kind==='cross','헤더 공중볼 경합');
      if(cross?.action?.kind==='cross'){fail(!cross.action.claimable&&cross.minute===e.minute,'이미 처리된 크로스 경합');active(a.attackerId,e.minute,cross.teamId);active(a.defenderId,e.minute,cross.teamId===m.homeId?m.awayId:m.homeId);fail(e.teamId===(a.winnerId===a.attackerId?cross.teamId:cross.teamId===m.homeId?m.awayId:m.homeId),'공중 경합 승리 팀');}
    }else if(a.kind==='headerShot'){
      const cross=index.get(e.relatedId??''),duel=index.get(a.duelId);fail(e.type==='shot'&&cross?.action?.kind==='cross'&&duel?.action?.kind==='headerDuel','헤더 슈팅의 공급·경합');
      if(cross?.action?.kind==='cross'&&duel?.action?.kind==='headerDuel')fail(cross.minute===e.minute&&cross.teamId===e.teamId&&cross.action.phase===a.phase&&duel.relatedId===cross.id&&duel.action.winnerId===e.playerId&&duel.action.attackerId===e.playerId&&!claims.has(cross.id),'실제 경합 승리 후 헤더');
      fail(!headers.has(e.relatedId??''),'한 크로스의 헤더 슈팅 중복');headers.add(e.relatedId??'');
    }else fail(false,'지원하지 않는 행동 종류');
  }
  for(const e of events){
    if(e.action?.kind==='pressure')fail(e.action.recovered===recoveries.has(e.action.possessionId),'압박 시도와 실제 회복 구분');
    if(['tackle','interception','save','sweep','handling'].includes(e.type)&&e.relatedId){const source=index.get(e.relatedId);fail(source?.type!=='pressure'&&source?.type!=='cross','같은 회복·공중볼의 중복 보상');}
    if(e.type==='assist'){const goal=index.get(e.relatedId??''),shot=index.get(goal?.relatedId??'');if(shot?.action?.kind==='headerShot')fail(e.playerId===index.get(shot.relatedId??'')?.playerId,'헤더 도움과 실제 크로스 공급자');}
  }
  const totals=actionEventTotals(events);
  const check=(id:string,s:PlayerStats)=>{
    const t=totals.get(id)??empty();for(const key of ACTION_COUNTERS)fail(s[key]===t[key],`${key} 집계와 원본 이벤트 불일치`);
    fail(s.actionApps===s.apps&&s.actionMinutes===s.minutes,'신규 집계 경기·시간');
    if(actors.get(id)?.position==='GK')fail(s.crossesFaced===t.crossesFaced&&s.crossesCaught===t.crossesCaught,'크로스 포구·펀칭 원장');
  };
  check(playerId,m.playerStats);for(const p of actors.values())check(p.id,p.stats);
}
