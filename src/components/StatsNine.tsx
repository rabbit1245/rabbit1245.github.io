import type { PlayerStats, Position } from '../game/types';
import { average } from './Shared';

type Definition = { id: string; label: string; value: keyof PlayerStats; attempts?: keyof PlayerStats; optional?: boolean };
const FIELD: Definition[] = [
  { id:'goals',label:'득점',value:'goals' },{ id:'assists',label:'도움',value:'assists' },{ id:'shots',label:'슈팅 정확도',value:'shotsOnTarget',attempts:'shots' },{ id:'passes',label:'패스 연결',value:'passesCompleted',attempts:'passes' },{ id:'keyPasses',label:'키패스',value:'keyPasses',optional:true },{ id:'dribbles',label:'드리블 돌파',value:'dribblesCompleted',attempts:'dribbleAttempts',optional:true },{ id:'tackles',label:'태클 성공',value:'tackles',attempts:'tackleAttempts' },{ id:'interceptions',label:'인터셉트',value:'interceptions' },{ id:'aerials',label:'공중볼 경합',value:'aerialWon',attempts:'aerialAttempts',optional:true },
];
const GK: Definition[] = [
  { id:'saves',label:'선방',value:'saves',attempts:'shotsFaced' },{ id:'conceded',label:'실점',value:'goalsConceded' },{ id:'cleanSheets',label:'클린시트',value:'cleanSheets' },{ id:'oneOnOnes',label:'일대일 선방',value:'oneOnOneSaves',attempts:'oneOnOneAttempts',optional:true },{ id:'penalties',label:'페널티 선방',value:'penaltiesSaved',attempts:'penaltiesFaced',optional:true },{ id:'crosses',label:'크로스 포구',value:'crossesCaught',attempts:'crossesFaced',optional:true },{ id:'sweeping',label:'스위핑',value:'sweepingSuccesses',attempts:'sweepingAttempts',optional:true },{ id:'buildUp',label:'빌드업 패스',value:'buildUpCompleted',attempts:'buildUpPasses',optional:true },{ id:'longKicks',label:'롱킥 연결',value:'longKicksCompleted',attempts:'longKicks',optional:true },
];
function ordered(position: Position) { if (position === 'GK') return GK; const priority = /CB|LB|RB|LWB|RWB|CDM/.test(position) ? ['tackles','interceptions','aerials','passes','keyPasses','dribbles','goals','assists','shots'] : /CM|CAM|LM|RM/.test(position) ? ['passes','keyPasses','assists','dribbles','goals','shots','tackles','interceptions','aerials'] : ['goals','shots','assists','dribbles','keyPasses','passes','aerials','tackles','interceptions']; return priority.map(id => FIELD.find(d => d.id === id)!); }
export default function StatsNine({ stats, detailedStats, position, compact = false }: { stats: PlayerStats; detailedStats?: PlayerStats; position: Position; compact?: boolean }) {
  const coverage = stats.detailedApps || 0, legacy = stats.apps > coverage;
  // Never divide legacy successes by new-only attempt counts or minutes.
  const separate = legacy && Boolean(detailedStats?.apps);
  const measured = separate ? detailedStats! : stats;
  return <><div className="shared-stats"><span>출전 <b>{stats.apps}</b></span><span>선발 <b>{stats.starts}</b></span><span>시간 <b>{stats.minutes.toLocaleString()}′</b></span><span>평점 <b>{average(stats)}</b></span><span>MOM <b>{legacy && !coverage ? '—' : stats.mom || 0}</b></span></div>{separate&&<p className="metric-coverage">아래 9개 지표는 상세 기록이 있는 {measured.apps}경기 · {measured.minutes}분 기준입니다. 위 요약은 이전 기록을 포함한 전체 합계입니다.</p>}<div className={`stats-nine ${compact ? 'compact' : ''}`} data-testid="role-metrics">{ordered(position).map(d => {
    const value = measured[d.value], attempts = d.attempts ? measured[d.attempts] : undefined;
    const unknown = Boolean(d.optional && legacy && !coverage);
    const denominatorUnknown = Boolean(d.attempts && legacy && !separate && ['tackleAttempts','shotsFaced'].includes(d.attempts));
    const minutesUnknown = legacy && !separate && Boolean(d.optional);
    const rate = !unknown && !denominatorUnknown && attempts !== undefined && attempts > 0 ? `${(Number(value || 0) / attempts * 100).toFixed(1)}%` : '—';
    return <div className="stat-detail" key={d.id}><span>{d.label}</span><strong>{unknown ? '—' : value ?? 0}{d.attempts && <small> / {unknown || denominatorUnknown ? '—' : attempts ?? 0}</small>}</strong><div>{d.attempts && <span>성공률 {rate}</span>}<span>90분당 {unknown || minutesUnknown || !measured.minutes ? '—' : ((value || 0) * 90 / measured.minutes).toFixed(2)}</span></div></div>;
  })}</div>{legacy && <p className="fine-print">세부 행동 기록: {coverage}/{stats.apps}경기. 이전 저장에 없는 지표·분모는 —로 표시합니다. 과거 출전 기록은 새 지표의 성공률과 90분당 계산에 섞지 않습니다.</p>}{position === 'GK' && <p className="fine-print">공격 가담 기록: {stats.goals}골 · {stats.assists}도움</p>}</>;
}
