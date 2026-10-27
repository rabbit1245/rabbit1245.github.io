import type { Career } from './types';
import { createWorld, repairLegacyRosterScale,repairClubBalance } from './world';
import { createNational } from './national';
import { createEconomics, createLeadership } from './career-systems';
import { TALENT_PROFILES } from './talent';

/** Called only on a new career or an editable copy, after an old save's hash was checked. */
export function initializeSystems(career: Career, legacyMetrics = true): void {
  if (career.systems) {
    repairLegacyRosterScale(career);
    repairClubBalance(career);
    if(career.systems.growthModelVersion!==2){career.player.potential=Math.max(career.player.potential,TALENT_PROFILES[career.player.talent].potential[0]);career.systems.growthModelVersion=2;}
    return;
  }
  const halfRound = Math.ceil(career.season.totalWeeks / 2);
  career.systems = {
    version: 2, growthModelVersion:2, world: createWorld(career), national: createNational(career),
    economics: createEconomics(career,legacyMetrics), leadership: createLeadership(career),
    phase: career.stage === 'retired' ? 'retired' : career.stage === 'offseason' ? 'review'
      : career.season.week === 0 ? 'preseason' : career.season.week < halfRound ? 'first'
        : career.season.week === halfRound ? 'midseason' : 'second',
    halfRound, trainingLocked: career.season.week > 0, growthReports: [], rankings: [], events: [], legacyMetrics,
  };
  career.systems.firstHalfSnapshot = {
    attributes: { ...career.season.attributeStart }, stats: { ...career.season.playerStats },
    ovr: career.season.ovrStart, value: career.systems.economics.marketValue, round: career.season.week,
  };
}
