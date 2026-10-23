import {cupMatches,cupStats} from './club-competitions';
import type { Career, MatchRecord } from './types';
import { sumStats } from './math';

/** A match can be retained in both the current national window and its archive. */
export function nationalMatchLedger(career: Career): MatchRecord[] {
  const national = career.systems?.national;
  const seen = new Set<string>();
  return [...(national?.history.flatMap(row => row.matches) ?? []), ...(national?.matches ?? [])].filter(match => {
    const key = match.fixtureId || match.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
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
  const nationalMatches = nationalMatchLedger(career).filter(match => match.seasonYear === career.season.year);
  const club = sumStats([career.season.playerStats,cupStats(career,career.season.year)]);
  const national = sumStats(nationalMatches.map(match => match.playerStats));
  const matches = [...career.season.matches, ...cupMatches(career,career.season.year), ...nationalMatches];
  return {
    club, national, combined: sumStats([club, national]), nationalMatches,
    detailed: sumStats(matches.filter(match => match.metricsVersion === 2).map(match => match.playerStats)),
    matches: matches.sort(newestMatchFirst), clubId: seasonClubId(career),
  };
}
