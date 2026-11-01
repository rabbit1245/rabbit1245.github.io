import {FIELD_ATTRIBUTES,GK_ATTRIBUTES,PLAY_STYLES,POSITION_LABELS,overall} from './attributes';
import type {Career,Position} from './types';

export interface PositionChange {year:number;round:number;date:string;from:Position;to:Position;fromStyle:string;toStyle:string;ovrBefore:number;ovrAfter:number;afterSeason:boolean;}
export function canChangePosition(c:Career,to:Position):boolean{
 if(!Object.hasOwn(POSITION_LABELS,to)||(to==='GK')!==(c.player.position==='GK'))return false;
 const allowed=to==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES;
 return allowed.every(key=>Number.isFinite(c.player.attributes[key]));
}
export function positionPreview(c:Career,to:Position,style:string):number{return overall({...c.player,position:to,style});}
export function positionChangeLines(c:Career,year?:number):string[]{
 return (c.systems?.positionChanges??[]).filter(r=>year===undefined||r.year===year).map(r=>`${r.date.slice(0,10)}${r.afterSeason?' · 시즌 종료 후':''} · ${r.from} ${POSITION_LABELS[r.from]} (${r.fromStyle}) → ${r.to} ${POSITION_LABELS[r.to]} (${r.toStyle}) · OVR ${r.ovrBefore} → ${r.ovrAfter}`);
}
export function validatePositionChoice(c:Career,to:Position,style:string):void{
 if(c.stage==='retired')throw Error('현역 선수만 포지션을 변경할 수 있습니다.');
 if(!Object.hasOwn(POSITION_LABELS,to)||!PLAY_STYLES[to].includes(style))throw Error('포지션에 맞는 선수 유형을 선택해 주세요.');
 if(!canChangePosition(c,to))throw Error('전용 능력치 체계가 맞는 포지션으로 변경해 주세요. 현재는 필드 선수는 필드 포지션끼리 변경할 수 있습니다.');
}
