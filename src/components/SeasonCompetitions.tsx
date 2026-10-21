import type { Career } from '../game/types';
import { getSeasonCompetitions } from '../game/season-competitions';
import './SeasonCompetitions.css';

export default function SeasonCompetitions({career}:{career:Career}){
  const rows=getSeasonCompetitions(career);
  return <section className="season-competitions" data-testid="season-competitions" aria-label="이번 시즌 참여 대회">
    {(['club','national'] as const).map(scope=><div key={scope} className="competition-scope"><span className="competition-scope-label">{scope==='club'?'클럽 대회':'국가대표 대회'}</span><div className="competition-items">{rows.filter(row=>row.scope===scope).map(row=><div key={row.id} className="competition-item" data-testid={scope==='club'?'club-competition':row.competitionId?'national-competition':'national-competition-status'} title={`${row.teamName} · ${row.reason}`}><strong>{row.name}</strong><span>{row.statusLabel}{row.apps>0?` · ${row.apps}경기`:''}</span></div>)}</div></div>)}
  </section>;
}
