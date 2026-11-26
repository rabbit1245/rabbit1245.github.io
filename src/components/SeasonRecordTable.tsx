import { Fragment, useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { PlayerStats } from '../game/types';
import type { SeasonCompetitionRecord } from '../game/season-overview';
import { average } from './Shared';

type Props = {
  combined: PlayerStats;
  national: PlayerStats;
  club: PlayerStats;
  nationalCompetitions: SeasonCompetitionRecord[];
  clubCompetitions: SeasonCompetitionRecord[];
  keeper: boolean;
};

function RecordRow({ label, stats, keeper, className }: {
  label: ReactNode;
  stats: PlayerStats;
  keeper: boolean;
  className?: string;
}) {
  return <tr className={className}>
    <th scope="row">{label}</th>
    <td>{stats.apps}</td>
    <td>{stats.minutes}</td>
    <td>{keeper ? stats.saves : stats.goals}</td>
    <td>{keeper ? stats.cleanSheets : stats.assists}</td>
    <td>{stats.yellowCards}</td>
    <td>{stats.redCards}</td>
    <td>{average(stats)}</td>
  </tr>;
}

export default function SeasonRecordTable({ combined, national, club, nationalCompetitions, clubCompetitions, keeper }: Props) {
  const tableId = useId();
  const [expanded, setExpanded] = useState({ national: false, club: false });
  const groups = [
    { scope: 'national', label: '국대', total: national, competitions: nationalCompetitions },
    { scope: 'club', label: '클럽', total: club, competitions: clubCompetitions },
  ] as const;

  return <table className="season-summary" aria-label="이번 시즌 기록">
    <colgroup>
      <col className="season-summary-scope" />
      <col />
      <col className="season-summary-minutes" />
      <col span={4} />
      <col className="season-summary-rating" />
    </colgroup>
    <thead>
      <tr>
        <th scope="col">범위</th>
        <th scope="col">출전</th>
        <th scope="col">분</th>
        <th scope="col">{keeper ? '선방' : '골'}</th>
        <th scope="col">{keeper ? '무실점' : '도움'}</th>
        <th scope="col">경고</th>
        <th scope="col">퇴장</th>
        <th scope="col">평점</th>
      </tr>
    </thead>
    <tbody><RecordRow label="통합" stats={combined} keeper={keeper} className="season-summary-total" /></tbody>
    {groups.map(({ scope, label, total, competitions }) => {
      const id = `${tableId}-${scope}`;
      return <Fragment key={scope}>
        <tbody>
          <RecordRow stats={total} keeper={keeper} label={<span className="season-summary-group">
            <span>{label} 통합</span>
            <button
              type="button"
              className="text-button season-summary-toggle"
              aria-label={`${label} 대회별`}
              aria-controls={id}
              aria-expanded={expanded[scope]}
              onClick={() => setExpanded(previous => ({ ...previous, [scope]: !previous[scope] }))}
            >
              대회별 <ChevronDown size={14} aria-hidden="true" />
            </button>
          </span>} />
        </tbody>
        <tbody id={id} hidden={!expanded[scope]} data-testid={`season-${scope}-competitions`}>
          {expanded[scope] && (competitions.length
            ? competitions.map(row => <RecordRow key={row.id} label={row.name} stats={row.stats} keeper={keeper} className="season-competition-record" />)
            : <tr className="season-competition-empty"><td colSpan={8}>이번 시즌 {label} 출전 기록이 없습니다.</td></tr>)}
        </tbody>
      </Fragment>;
    })}
  </table>;
}
