import { cupLedger, cupMatches } from './club-competitions';
import { INTERNATIONAL_LEAGUES, LEAGUES } from './data';
import { nationalCompetitionName, nationalMatchLedger } from './season-competitions';
import type { Career, MatchRecord, PlayerStats } from './types';
import { sumStats } from './math';

export { nationalMatchLedger } from './season-competitions';

type CompetitionLabel = { id: string; name: string };
export type SeasonCompetitionRecord = CompetitionLabel & { stats: PlayerStats };

const leagueNames = new Map([...LEAGUES, ...INTERNATIONAL_LEAGUES].map(league => [league.id, league.name]));
const nationalFinalStages = new Set(['group', 'round32', 'round16', 'quarterfinal', 'semifinal', 'final', 'thirdPlace']);

function competitionRecords(matches: MatchRecord[], identify: (match: MatchRecord) => CompetitionLabel): SeasonCompetitionRecord[] {
  const groups = new Map<string, { label: CompetitionLabel; stats: PlayerStats[] }>();
  for (const match of matches) {
    if (!match.playerStats.apps) continue;
    const label = identify(match);
    const group = groups.get(label.id);
    if (group) group.stats.push(match.playerStats);
    else groups.set(label.id, { label, stats: [match.playerStats] });
  }
  return [...groups.values()].map(({label, stats}) => ({...label, stats: sumStats(stats)}));
}

function nationalCompetitionRecords(career: Career, matches: MatchRecord[]): SeasonCompetitionRecord[] {
  const national = career.systems?.national;
  const savedNames = new Map(national?.history
    .filter(row => row.year === career.season.year)
    .map(row => [`${row.competitionId}:${row.squad}`, row.competitionName]));
  return competitionRecords(matches, match => {
    const competitionId = match.competitionId;
    const squad = match.playerClubId.endsWith(':U20') ? 'U20' : 'senior';
    const fixtureStage = match.fixtureId.split('|')[3];
    const stage = fixtureStage === 'qualifying' ? '예선' : nationalFinalStages.has(fixtureStage) ? '본선' : fixtureStage === 'friendly' ? '친선' : '';
    const friendly = competitionId?.startsWith('FRIENDLIES:');
    const recordedName = savedNames.get(`${competitionId}:${squad}`)
      ?? (competitionId && national?.competitionId === competitionId ? national.competitionName : undefined);
    const name = friendly ? nationalCompetitionName(competitionId) : recordedName ?? nationalCompetitionName(competitionId);
    const parts = [name];
    if (stage && !friendly) parts.push(stage);
    if (squad === 'U20' && !/U-?20/.test(name)) parts.push('U20');
    return { id: `${competitionId ?? 'unrecorded'}|${squad}|${friendly ? 'friendly' : stage}`, name: parts.join(' · ') };
  });
}

export function seasonClubId(career: Career): string {
  return career.history.find(row => row.year === career.season.year)?.clubId
    ?? career.season.matches[0]?.playerClubId ?? career.player.clubId;
}

export function newestMatchFirst(a: MatchRecord, b: MatchRecord): number {
  const date = (match: MatchRecord) => match.date && Number.isFinite(Date.parse(match.date)) ? Date.parse(match.date) : 0;
  return b.seasonYear - a.seasonYear || date(b) - date(a) || b.round - a.round;
}

/** Display projections only: no edits, backfilled history or second simulation. */
export function seasonOverview(career: Career) {
  const season = career.season;
  const nationalMatches = nationalMatchLedger(career).filter(match => match.seasonYear === season.year);
  const cups = cupMatches(career, season.year);
  const club = sumStats([season.playerStats, sumStats(cups.map(match => match.playerStats))]);
  const national = sumStats(nationalMatches.map(match => match.playerStats));
  const cupNames = new Map(cupLedger(career, season.year).map(cup => [cup.id, cup.name]));
  const clubCompetitions = [
    ...competitionRecords(season.matches, match => {
      const id = match.competitionId ?? season.leagueId;
      return { id: `league:${id}`, name: id === season.leagueId ? season.competitionName : leagueNames.get(id) ?? '리그 경기 · 대회 미집계' };
    }),
    ...competitionRecords(cups, match => {
      const id = match.competitionId ?? 'unrecorded';
      return { id: `cup:${id}`, name: cupNames.get(id) ?? '클럽 컵 경기 · 대회 미집계' };
    }),
  ];
  const matches = [...season.matches, ...cups, ...nationalMatches];
  return {
    club, national, combined: sumStats([club, national]), nationalMatches,
    nationalCompetitions: nationalCompetitionRecords(career, nationalMatches), clubCompetitions,
    detailed: sumStats(matches.filter(match => match.metricsVersion === 2).map(match => match.playerStats)),
    matches: matches.sort(newestMatchFirst), clubId: seasonClubId(career),
  };
}
