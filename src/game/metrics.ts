import {actionCoverage} from './action-metrics';
import type { AttributeKey, PlayerStats } from './types';

/** These descriptions name the actual action checks used by match-engine.ts. */
export const ATTRIBUTE_EFFECTS: Record<AttributeKey, {action:string;metrics:(keyof PlayerStats)[];description:string}> = {
  strength:{action:'몸싸움·태클·공중볼',metrics:['tackles','aerialWon'],description:'경합에서 공을 지키고 태클과 공중볼을 이길 확률이 높아집니다.'},
  stamina:{action:'후반 활동과 성공',metrics:['lateActions','lateSuccesses','pressingWins'],description:'경기 후반 활동량과 행동 성공률을 유지하고 경기 후 체력 소모를 줄입니다.'},
  speed:{action:'돌파·침투',metrics:['dribbleAttempts','dribblesCompleted','shots','pressingWins'],description:'돌파와 침투로 슈팅 기회를 얻는 횟수가 늘어납니다.'},
  agility:{action:'방향 전환',metrics:['dribblesCompleted'],description:'방향을 바꾸는 드리블의 성공률이 높아집니다.'},
  jumping:{action:'공중 경합',metrics:['aerialWon'],description:'공중볼 경합에서 먼저 공에 도달할 확률이 높아집니다.'},
  ballControl:{action:'첫 터치',metrics:['passesCompleted','dribblesCompleted','progressivePasses'],description:'첫 터치를 안정시켜 패스와 드리블 성공률을 높입니다.'},
  dribbling:{action:'일대일 돌파',metrics:['dribblesCompleted'],description:'상대 수비수를 제치는 확률이 높아집니다.'},
  passing:{action:'패스 연결',metrics:['passesCompleted','keyPasses','progressivePasses'],description:'동료에게 패스를 연결하고 슈팅 기회를 만드는 확률이 높아집니다.'},
  crossing:{action:'크로스 기회 창출',metrics:['keyPasses','assists'],description:'측면에서 크로스를 슈팅과 득점 기회로 연결합니다.'},
  shooting:{action:'슈팅 정확도',metrics:['shotsOnTarget','goals'],description:'슈팅이 골문으로 향하고 골키퍼를 넘을 확률이 높아집니다.'},
  heading:{action:'헤더',metrics:['aerialWon','shotsOnTarget','goals','headerGoals'],description:'공중볼을 확보하고 헤더를 골문으로 보낼 확률이 높아집니다.'},
  defending:{action:'태클·압박',metrics:['tackles','pressingWins'],description:'상대의 공격을 태클로 끊는 확률이 높아집니다.'},
  setPieces:{action:'프리킥·페널티·세트피스',metrics:['shotsOnTarget','keyPasses','goals'],description:'세트피스 슈팅 정확도와 세트피스에서 기회를 만드는 능력을 높입니다.'},
  decisions:{action:'패스·돌파 판단',metrics:['passesCompleted','keyPasses','sweepingSuccesses','progressivePasses','pressingWins','punches'],description:'안전한 패스와 효과적인 공격, 골키퍼의 전진 시점을 선택합니다.'},
  vision:{action:'찬스 탐색·전진 패스',metrics:['keyPasses','assists','progressivePasses'],description:'슈팅할 수 있는 동료를 발견하는 횟수가 늘어납니다.'},
  anticipation:{action:'패스 예측·압박·침투',metrics:['interceptions','pressingWins','shots'],description:'상대의 패스 경로를 미리 읽어 차단하는 횟수가 늘어납니다.'},
  positioning:{action:'침투 위치·수비 위치',metrics:['shots','interceptions'],description:'공격에서 슈팅 위치를 선점하고 수비에서 패스 길을 막습니다.'},
  composure:{action:'마무리',metrics:['goals','shotsOnTarget'],description:'압박을 받는 슈팅과 결정적 기회에서 침착하게 마무리합니다.'},
  concentration:{action:'실수 억제',metrics:['passesCompleted','lateSuccesses','saves','handlingSuccesses'],description:'패스와 후반 행동의 실수를 줄이고 골키퍼의 선방과 공 처리 집중력을 높입니다.'},
  teamwork:{action:'연계 플레이',metrics:['passes','keyPasses','assists','pressingWins'],description:'동료와 패스를 주고받고 슈팅 기회를 연결하는 횟수가 늘어납니다.'},
  gkShotStopping:{action:'슈팅 선방',metrics:['saves'],description:'골문 안으로 향하는 슈팅을 막을 확률이 높아집니다.'},
  gkReflexes:{action:'근거리 반응',metrics:['saves'],description:'빠른 반응이 필요한 근거리 슈팅 선방률이 높아집니다.'},
  gkHandling:{action:'공 처리',metrics:['handlingSuccesses','crossesCaught','saves'],description:'슈팅과 크로스를 놓치지 않고 확보할 확률이 높아집니다.'},
  gkAerialCommand:{action:'공중볼 확보·펀칭',metrics:['crossesCaught','punches'],description:'크로스를 포구하거나 안전하게 펀칭할 가능성을 높입니다. 상황과 핸들링에 따라 처리 방식을 선택합니다.'},
  gkOneOnOnes:{action:'일대일·페널티 선방',metrics:['oneOnOneSaves','penaltiesSaved'],description:'공격수와 마주한 일대일과 페널티 상황의 선방률이 높아집니다.'},
  gkPositioning:{action:'슈팅 각도 차단',metrics:['saves','sweepingSuccesses'],description:'적절한 위치에서 슈팅 각도를 줄이고 뒷공간을 처리합니다.'},
  gkDistribution:{action:'빌드업·롱킥',metrics:['buildUpCompleted','longKicksCompleted'],description:'짧은 빌드업 패스와 긴 킥을 동료에게 전달할 확률이 높아집니다.'},
  gkDefensiveOrganization:{action:'수비 라인 지휘',metrics:['shotsFaced','goalsConceded','cleanSheets'],description:'수비 라인을 조율해 상대의 슈팅 기회 자체를 줄입니다.'},
};

export const successRate=(success:number|undefined,attempts:number|undefined):number|null => (attempts??0)>0?(success??0)*100/(attempts??1):null;
export const per90=(value:number|undefined,minutes:number):number => minutes>0?(value??0)*90/minutes:0;
export const averageRating=(stats:PlayerStats):number => stats.ratingCount?stats.ratingSum/stats.ratingCount:0;
export interface MetricLine { key:string; label:string; value:number|null; attempts?:number; rate?:number|null }
export function fieldMetrics(s:PlayerStats):MetricLine[] {
  return [
    {key:'goals',label:'득점',value:s.goals},{key:'assists',label:'도움',value:s.assists},
    {key:'shots',label:'슈팅 / 유효 슈팅',value:s.shotsOnTarget,attempts:s.shots,rate:successRate(s.shotsOnTarget,s.shots)},
    {key:'passes',label:'패스',value:s.passesCompleted,attempts:s.passes,rate:successRate(s.passesCompleted,s.passes)},
    {key:'keyPasses',label:'키패스',value:s.keyPasses??0},
    {key:'dribbles',label:'드리블',value:s.dribblesCompleted??0,attempts:s.dribbleAttempts??0,rate:successRate(s.dribblesCompleted,s.dribbleAttempts)},
    {key:'tackles',label:'태클',value:s.tackles,attempts:s.tackleAttempts??0,rate:successRate(s.tackles,s.tackleAttempts)},
    {key:'interceptions',label:'인터셉트',value:s.interceptions},
    {key:'aerials',label:'공중볼 경합',value:s.aerialWon??0,attempts:s.aerialAttempts??0,rate:successRate(s.aerialWon,s.aerialAttempts)},
    {key:'headerGoals',label:'헤더 득점',value:actionCoverage(s).known?s.headerGoals??0:null},{key:'pressingWins',label:'압박 성공',value:actionCoverage(s).known?s.pressingWins??0:null},{key:'progressivePasses',label:'전진 패스 성공',value:actionCoverage(s).known?s.progressivePasses??0:null},
  ];
}
export function goalkeeperMetrics(s:PlayerStats):MetricLine[] {
  return [
    {key:'saves',label:'선방',value:s.saves,attempts:s.shotsFaced??0,rate:successRate(s.saves,s.shotsFaced)},
    {key:'goalsConceded',label:'실점',value:s.goalsConceded},{key:'cleanSheets',label:'클린시트',value:s.cleanSheets},
    {key:'oneOnOnes',label:'일대일 선방',value:s.oneOnOneSaves??0,attempts:s.oneOnOneAttempts??0,rate:successRate(s.oneOnOneSaves,s.oneOnOneAttempts)},
    {key:'penalties',label:'페널티 선방',value:s.penaltiesSaved??0,attempts:s.penaltiesFaced??0,rate:successRate(s.penaltiesSaved,s.penaltiesFaced)},
    {key:'crosses',label:'크로스 포구',value:s.crossesCaught??0,attempts:s.crossesFaced??0,rate:successRate(s.crossesCaught,s.crossesFaced)},
    {key:'sweeping',label:'스위핑',value:s.sweepingSuccesses??0,attempts:s.sweepingAttempts??0,rate:successRate(s.sweepingSuccesses,s.sweepingAttempts)},
    {key:'buildUp',label:'빌드업 패스',value:s.buildUpCompleted??0,attempts:s.buildUpPasses??0,rate:successRate(s.buildUpCompleted,s.buildUpPasses)},
    {key:'longKicks',label:'롱킥',value:s.longKicksCompleted??0,attempts:s.longKicks??0,rate:successRate(s.longKicksCompleted,s.longKicks)},
    {key:'punches',label:'펀칭 성공',value:actionCoverage(s).known?s.punches??0:null},
  ];
}
