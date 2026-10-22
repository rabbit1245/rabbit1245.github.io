import type { Career } from '../game/types';
import { scoutingReports } from '../game/scouting';
import { Panel,teamName } from './Shared';
export default function ScoutingSummary({career}:{career:Career}){
 const rows=scoutingReports(career).slice(0,5);
 return <Panel title="스카우트 관심" className="contract-history-panel"><div className="panel-body"><p className="muted">현재 실력·포지션 수요·나이·잠재력과 최근 최대 3시즌의 출전·성과·성장을 평가합니다. 관심과 실제 제안은 구분하며, 계약은 시즌 종료 후 예산과 조건이 맞을 때 제안합니다.</p>{rows.length?rows.map(row=><div className="scout-row" key={row.clubId}><strong>{teamName(row.clubId)}</strong><span className="pill">{row.offerEligible?'영입 검토':'관찰'}</span><p>{row.reason}</p></div>):<p className="muted">현재 새 관심 구단이 확인되지 않았습니다. 시즌 진행 후 실제 경기력을 다시 평가합니다.</p>}</div></Panel>;
}
