import type {Career,Fixture,MatchRecord} from './types';
import {getClub} from './data';
import {simulateMatch} from './match-engine';
import {getClubWorldPower,getWorldClubPlayers} from './world';
import {resolveNationalShootout} from './national';
import {seasonHalfEndDate} from './calendar';
export interface KoreanLicenseEdition {year:number;approvedClubIds:string[];sourceUrl:string;verifiedAt:string;legs:1|2;}
export interface PromotionReview {year:number;boundary:string;clubId:string;status:'unverified'|'ineligible'|'played'|'unsupported';reason:string;matches:MatchRecord[];promoted?:boolean;}
/** No licensing guesses. Add an edition only with the governing body's dated approval list. */
export const VERIFIED_KOREAN_LICENSES:KoreanLicenseEdition[]=[];
export function reviewK3Promotion(c:Career,edition=VERIFIED_KOREAN_LICENSES.find(r=>r.year===c.season.year)):PromotionReview|undefined{
 const world=c.systems?.world,champion=world?.competitions.KR3?.table[0]?.clubId,bottom=world?.competitions.KR2?.table.at(-1)?.clubId;
 if(!world||!champion||!bottom)return;
 const base={year:c.season.year,boundary:'KR2/KR3',clubId:champion,matches:[] as MatchRecord[]};
 if(c.season.year<2026)return {...base,status:'ineligible',reason:'2026 연결 규정 적용 전 시즌 · K3 우승만으로 K2 승격하지 않습니다.'};
 if(!edition||edition.year!==c.season.year)return {...base,status:'unverified',reason:`${c.season.year} K3 우승 ${getClub(champion).name}. 해당 연도의 K리그2 라이선스 승인 명단·결정전 규정 원문 미확인으로 승강 판정 보류. 무자격 또는 승강전 패배로 간주하지 않습니다.`};
 if(!edition.approvedClubIds.includes(champion))return {...base,status:'ineligible',reason:`${c.season.year} 라이선스 승인 명단에 우승팀이 없습니다. 차순위 팀에 자동 양도하지 않습니다. 출처 ${edition.sourceUrl}`};
 const matches:MatchRecord[]=[],end=Date.parse(seasonHalfEndDate(c.season,'second'));
 for(let leg=1;leg<=edition.legs;leg++){
  const homeId=leg===1?champion:bottom,awayId=homeId===champion?bottom:champion,fixture:Fixture={id:`KR23:${c.season.year}:${leg}:${champion}:${bottom}`,round:c.season.totalWeeks+leg,homeId,awayId,played:false};
  const own=c.player.squad==='senior'&&[homeId,awayId].includes(c.player.clubId),match=simulateMatch(c,fixture,{home:{...getClub(homeId),power:getClubWorldPower(c,homeId)},away:{...getClub(awayId),power:getClubWorldPower(c,awayId)},homePlayers:getWorldClubPlayers(c,homeId),awayPlayers:getWorldClubPlayers(c,awayId),date:new Date(end-(edition.legs-leg)*4*86400000).toISOString(),scope:'club',competitionId:`PLAYOFF:KR23:${c.season.year}`,userParticipates:own,detailed:own});if(!own)match.playerClubId=homeId;matches.push(match);
 }
 const a=matches.reduce((n,m)=>n+(m.homeId===champion?m.homeGoals:m.awayGoals),0),b=matches.reduce((n,m)=>n+(m.homeId===bottom?m.homeGoals:m.awayGoals),0),last=matches.at(-1)!;
 let winner=a>b?champion:b>a?bottom:undefined;if(!winner){last.aggregate={home:last.homeId===champion?a:b,away:last.awayId===champion?a:b};resolveNationalShootout(c,last);winner=last.shootout!.winnerId;}
 return {...base,status:'played',matches,promoted:winner===champion,reason:`${edition.year} 승인 라이선스 · ${getClub(champion).name} ${a}:${b} ${getClub(bottom).name}${last.shootout?` · 승부차기 ${last.shootout.home}:${last.shootout.away}`:''} · ${winner===champion?'K3 우승팀 승격':'K2 팀 잔류'}. ${edition.sourceUrl}`};
}
