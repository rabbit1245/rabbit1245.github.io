import type { PlayerStats, Position } from '../game/types';
import { average } from './Shared';
import {actionCoverage} from '../game/action-metrics';
import './StatsNine.css';

type Definition = { id: string; label: string; value: keyof PlayerStats; attempts?: keyof PlayerStats; optional?: boolean; action?:boolean };
const FIELD: Definition[] = [
  { id:'goals',label:'득점',value:'goals' },{ id:'assists',label:'도움',value:'assists' },{ id:'shots',label:'슈팅 정확도',value:'shotsOnTarget',attempts:'shots' },{ id:'passes',label:'패스 연결',value:'passesCompleted',attempts:'passes' },{ id:'keyPasses',label:'키패스',value:'keyPasses',optional:true },{ id:'dribbles',label:'드리블 돌파',value:'dribblesCompleted',attempts:'dribbleAttempts',optional:true },{ id:'tackles',label:'태클 성공',value:'tackles',attempts:'tackleAttempts' },{ id:'interceptions',label:'인터셉트',value:'interceptions' },{ id:'aerials',label:'공중볼 경합',value:'aerialWon',attempts:'aerialAttempts',optional:true },
];
const GK: Definition[] = [
  { id:'saves',label:'선방',value:'saves',attempts:'shotsFaced' },{ id:'conceded',label:'실점',value:'goalsConceded' },{ id:'cleanSheets',label:'클린시트',value:'cleanSheets' },{ id:'oneOnOnes',label:'일대일 선방',value:'oneOnOneSaves',attempts:'oneOnOneAttempts',optional:true },{ id:'penalties',label:'페널티 선방',value:'penaltiesSaved',attempts:'penaltiesFaced',optional:true },{ id:'crosses',label:'크로스 포구',value:'crossesCaught',attempts:'crossesFaced',optional:true },{ id:'sweeping',label:'스위핑',value:'sweepingSuccesses',attempts:'sweepingAttempts',optional:true },{ id:'buildUp',label:'빌드업 패스',value:'buildUpCompleted',attempts:'buildUpPasses',optional:true },{ id:'longKicks',label:'롱킥 연결',value:'longKicksCompleted',attempts:'longKicks',optional:true },
];
const FIELD_ACTIONS:Definition[]=[{id:'headerGoals',label:'헤더 득점',value:'headerGoals',action:true},{id:'pressingWins',label:'압박 성공',value:'pressingWins',action:true},{id:'progressivePasses',label:'전진 패스 성공',value:'progressivePasses',action:true}];
const PUNCH:Definition={id:'punches',label:'펀칭 성공',value:'punches',action:true};
function ordered(position: Position) { if (position === 'GK') return GK; const priority = /CB|LB|RB|LWB|RWB|CDM/.test(position) ? ['tackles','interceptions','aerials','passes','keyPasses','dribbles','goals','assists','shots'] : /CM|CAM|LM|RM/.test(position) ? ['passes','keyPasses','assists','dribbles','goals','shots','tackles','interceptions','aerials'] : ['goals','shots','assists','dribbles','keyPasses','passes','aerials','tackles','interceptions']; return priority.map(id => FIELD.find(d => d.id === id)!); }
export default function StatsNine({ stats, detailedStats, position, compact = false }: { stats: PlayerStats; detailedStats?: PlayerStats; position: Position; compact?: boolean }) {
  const coverage = stats.detailedApps || 0, legacy = stats.apps > coverage;
  // Never divide legacy successes by new-only attempt counts or minutes.
  const separate = legacy && Boolean(detailedStats?.apps);
  const measured = separate ? detailedStats! : stats;
  const actions=actionCoverage(stats),definitions=position==='GK'?[...GK,PUNCH]:[...ordered(position),...FIELD_ACTIONS];
  return <><div className="shared-stats"><span>출전 <b>{stats.apps}</b></span><span>선발 <b>{stats.starts}</b></span><span>시간 <b>{stats.minutes.toLocaleString()}′</b></span><span>평점 <b>{average(stats)}</b></span><span>MOM <b>{legacy && !coverage ? '—' : stats.mom || 0}</b></span></div>{separate&&<p className="metric-coverage">기존 세부 지표는 상세 기록이 있는 {measured.apps}경기 · {measured.minutes}분 기준입니다. 위 요약은 이전 기록을 포함한 전체 합계입니다.</p>}<div className={`stats-nine ${position==='GK'?'stats-keeper':'stats-field'} ${compact ? 'compact' : ''}`} data-testid="role-metrics">{definitions.map(d => {
    if(d.action){const value=stats[d.value]??0;return <div className={`stat-detail stat-${d.id}`} data-testid={`metric-${d.id}`} key={d.id} title={actions.partial?`신규 집계 ${actions.apps}/${stats.apps}경기 · 과거 원본 이벤트가 없는 경기는 미집계`:d.label}><span>{d.label}</span><strong className={!actions.known?'metric-untracked':undefined}>{actions.known?<>{value}{actions.partial&&<sup>*</sup>}</>:'미집계'}</strong><div><span>{actions.partial?`집계 ${actions.apps}/${stats.apps}경기`:`90분당 ${actions.minutes?(value*90/actions.minutes).toFixed(2):'—'}`}</span></div></div>;}
    const value = measured[d.value], attempts = d.attempts ? measured[d.attempts] : undefined;
    const unknown = Boolean(d.optional && legacy && !coverage);
    const denominatorUnknown = Boolean(d.attempts && legacy && !separate && ['tackleAttempts','shotsFaced'].includes(d.attempts));
    const minutesUnknown = legacy && !separate && Boolean(d.optional);
    const rate = !unknown && !denominatorUnknown && attempts !== undefined && attempts > 0 ? `${(Number(value || 0) / attempts * 100).toFixed(1)}%` : '—';
    return <div className="stat-detail" key={d.id}><span>{d.label}</span><strong>{unknown ? '—' : value ?? 0}{d.attempts && <small> / {unknown || denominatorUnknown ? '—' : attempts ?? 0}</small>}</strong><div>{d.attempts && <span>성공률 {rate}</span>}<span>90분당 {unknown || minutesUnknown || !measured.minutes ? '—' : ((value || 0) * 90 / measured.minutes).toFixed(2)}</span></div></div>;
  })}</div>{(legacy||actions.partial) && <p className="fine-print">{legacy&&<>기존 세부 행동 기록: {coverage}/{stats.apps}경기. 이전 저장에 없는 지표·분모는 —로 표시합니다. </>}{actions.partial&&<>신규 행동 집계: {actions.apps}/{stats.apps}경기. *는 집계된 경기만의 기록이며, 과거 원본 이벤트가 없는 경기는 미집계입니다. </>}과거 미집계 경기는 새 지표의 성공률과 90분당 계산에 섞지 않습니다.</p>}{position === 'GK' && <p className="fine-print">공격 가담 기록: {stats.goals}골 · {stats.assists}도움</p>}</>;
}
