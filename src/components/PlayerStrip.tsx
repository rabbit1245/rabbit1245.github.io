import type { Career } from '../game/types';
import { getSeasonCompetitions } from '../game/season-competitions';
import { TALENT_PROFILES } from '../game/talent';
import { compactMoney, Delta, money, TeamBadge, teamName } from './Shared';

export default function PlayerStrip({career}: {career: Career}) {
  const p = career.player, economics = career.systems?.economics, role = career.systems?.leadership.clubRole;
  const rows = getSeasonCompetitions(career).filter(row => row.scope === 'national');
  const national = rows.find(row => row.status === 'called') ?? rows.find(row => row.competitionId) ?? rows[0];
  const status = national.status === 'called' ? '소집' : national.status === 'played' ? '이번 시즌 출전'
    : national.status === 'completed' ? '시즌 기록' : national.statusLabel;
  return <section className="player-strip" data-testid="player-strip" aria-label="선수 요약">
    <div className="strip-identity"><TeamBadge id={p.clubId}/><div>
      <strong>{p.name}{role && role !== 'none' && <span className="armband">{role === 'captain' ? 'C' : 'VC'}</span>}
        <span className="strip-talent" data-testid="summary-talent" title={TALENT_PROFILES[p.talent].reference}>재능 {p.talent}</span>
      </strong>
      <span>{p.age}세 · {p.position} · {p.squad === 'youth' ? 'U19' : '1군'} · {teamName(p.clubId)}</span>
    </div></div>
    <div className="strip-ovr"><span>OVR</span><strong>{p.ovr}</strong><Delta value={p.ovr - career.season.ovrStart}/></div>
    <div className="strip-economics"><span>몸값 <b>{economics ? compactMoney(economics.marketValue) : '미집계'}</b></span>
      <span>주급 <b>{compactMoney(p.wage)}</b></span><small>{economics?.contract.role || '계약 역할 미집계'}</small></div>
    <div className="strip-national"><span>국가대표 <b>{status}</b></span><small>{national.teamName}</small></div>
    <div className="strip-condition"><span>체력 <b>{Math.round(p.fitness)}%</b> · 신뢰 <b>{Math.round(career.managerTrust)}%</b></span>
      <small>{p.injuryWeeks > 0 ? `부상 회복 ${p.injuryWeeks}주` : '경기 출전 가능'}</small></div>
  </section>;
}
