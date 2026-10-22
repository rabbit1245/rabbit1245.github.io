import { useMemo, useState } from 'react';
import type { Career } from '../game/types';
import { leagueLeaders, type LeagueMetric } from '../game/league-leaders';
import { average, Modal, teamName } from './Shared';

const labels = {goals:'득점', assists:'도움', cleanSheets:'무실점'};
const units = {goals:'골', assists:'도움', cleanSheets:'경기'};
export default function LeagueLeaders({career}: {career: Career}) {
  const initialMetric: LeagueMetric = career.player.position === 'GK' ? 'cleanSheets' : 'goals';
  const [open, setOpen] = useState(false), [metric, setMetric] = useState<LeagueMetric>(initialMetric);
  const rows = useMemo(() => leagueLeaders(career, metric), [career, metric]);
  const preview = useMemo(() => (metric === initialMetric ? rows : leagueLeaders(career, initialMetric))
    .find(row => row.playerId === career.player.id), [career, rows, metric, initialMetric]);
  const own = rows.find(row => row.playerId === career.player.id), visible = rows.filter(row => row.stats[metric] > 0);
  const value = career.season.playerStats[initialMetric];
  return <>
    <button className="text-button" data-testid="league-leaders-more" onClick={() => setOpen(true)} aria-haspopup="dialog">
      {labels[initialMetric]} {preview && value > 0 ? `${preview.rank}위 · ` : ''}{value}{units[initialMetric]} · 더보기
    </button>
    {open && <Modal title={`${career.season.competitionName} 개인 순위`} wide onClose={() => setOpen(false)}>
      <div className="segmented">{(['goals','assists','cleanSheets'] as const).map(key => <button key={key}
        className={metric === key ? 'active' : ''} aria-pressed={metric === key} onClick={() => setMetric(key)}>{labels[key]}</button>)}</div>
      <div className="league-own-rank" data-testid="league-own-rank">
        <strong>{career.player.name}</strong><span>{own && own.stats[metric] > 0 ? `${labels[metric]} ${own.rank}위` : career.player.squad === 'youth' ? '전체 순위 미집계' : metric === 'cleanSheets' && career.player.position !== 'GK' ? '골키퍼 순위 · 해당 없음' : '아직 순위 없음'}</span>
        <b>{career.season.playerStats[metric]}{units[metric]}</b><small>클럽 리그 기록</small>
      </div>
      <p className="fine-print">해당 리그 실제 경기만 합산합니다. 국대 기록은 섞지 않습니다. 동률은 같은 순위를 표시하며, 리그에 보존된 동률 기준을 적용합니다.</p>
      {career.player.squad === 'youth' ? <p>유소년 대회는 타 팀의 전체 개인 원장이 보존되지 않아 전체 개인 순위를 집계하지 않습니다. 내 기록 {career.season.playerStats.goals}골은 보존됩니다.</p>
        : <div className="full-standings-scroll" role="region" aria-label="개인 전체 순위표" tabIndex={0}>
          <table className="league-table" data-testid="league-leaders"><thead><tr><th>순위</th><th>선수</th><th>구단</th><th>{labels[metric]}</th><th>경기</th><th>시간</th><th>평점</th></tr></thead>
            <tbody>{visible.map(row => <tr key={row.playerId} data-player-id={row.playerId} className={row.playerId === career.player.id ? 'my-team' : ''}>
              <td>{row.rank}</td><td>{row.name}</td><td>{teamName(row.clubId)}</td><td>{row.stats[metric]}</td><td>{row.stats.apps}</td><td>{row.stats.minutes}분</td><td>{average(row.stats)}</td>
            </tr>)}</tbody></table>{!visible.length && <p className="muted">아직 집계된 기록이 없습니다.</p>}
        </div>}
    </Modal>}
  </>;
}
