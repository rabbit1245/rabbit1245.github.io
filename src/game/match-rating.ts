import { clamp, round } from './math';
import type { PlayerStats, Position } from './types';

const centreBack = { duels: 1.06, cover: 1, buildUp: .62 };
const fullback = { duels: .88, cover: .82, buildUp: .76 };
const wide = { duels: .64, cover: .12, buildUp: .76 };
const striker = { duels: .58, cover: 0, buildUp: .48 };
const fieldRoles: Record<Exclude<Position, 'GK'>, typeof centreBack> = {
  CB: centreBack, LB: fullback, RB: fullback, LWB: fullback, RWB: fullback,
  CDM: { duels: 1.04, cover: .64, buildUp: .96 },
  CM: { duels: .83, cover: .30, buildUp: 1 },
  CAM: { duels: .68, cover: .10, buildUp: .85 },
  LM: wide, RM: wide, LW: wide, RW: wide,
  CF: striker, SS: striker, ST: striker,
};

function goalThreat(stats: PlayerStats): number {
  // Assists and goals already credit converted chances. Grade the other chances separately.
  const bigChances = Math.max(0, (stats.bigChancesCreated ?? 0) - (stats.bigChanceAssists ?? 0));
  const keyPasses = Math.max(0, (stats.keyPasses ?? 0) - stats.assists - bigChances);
  const creation = Math.min(.68, keyPasses * .07 + bigChances * .14);
  const otherShotsOnTarget = Math.max(0, stats.shotsOnTarget - stats.goals);
  return stats.goals * .92 + stats.assists * .65 + creation + Math.min(.24, otherShotsOnTarget * .045);
}

function fieldContribution(stats: PlayerStats, position: Exclude<Position, 'GK'>, goalsAgainst: number): number {
  const role = fieldRoles[position];
  const missedTackles = (stats.tackleAttempts ?? stats.tackles) - stats.tackles;
  const aerialsWon = stats.aerialWon ?? 0;
  const aerialsLost = (stats.aerialAttempts ?? aerialsWon) - aerialsWon;
  const duels = clamp(stats.tackles * .10 + stats.interceptions * .09 + aerialsWon * .052
    - missedTackles * .045 - aerialsLost * .022, -.30, 1.25);
  const coverage = stats.cleanSheets * .40 - Math.min(.66, goalsAgainst * .13);
  const pressing = Math.min(.30, (stats.pressingWins ?? 0) * .042 + (stats.pressureRecoveries ?? 0) * .044);

  const missedPasses = stats.passes - stats.passesCompleted;
  const passing = clamp(stats.passesCompleted * .009 - missedPasses * .052, -.28, .24);
  const progression = Math.min(.30, (stats.progressivePasses ?? 0) * .031);
  const dribbles = stats.dribblesCompleted ?? 0;
  const failedDribbles = (stats.dribbleAttempts ?? dribbles) - dribbles;
  const carrying = Math.min(.28, dribbles * .044) - failedDribbles * .048;

  return duels * role.duels + coverage * role.cover + pressing + (passing + progression) * role.buildUp + carrying;
}

function keeperContribution(stats: PlayerStats): number {
  // Judge how well the keeper handles the shots faced, with diminishing credit for sheer volume.
  const saves = Math.min(5, stats.saves) * .16 + clamp(stats.saves - 5, 0, 7) * .08;
  const faced = stats.shotsFaced ?? stats.saves + stats.goalsConceded;
  const efficiency = clamp((stats.saves - faced * .73) * .16, -.55, .36);
  const difficultSaves = (stats.oneOnOneSaves ?? 0) * .15 + (stats.penaltiesSaved ?? 0) * .60;
  const claims = (stats.crossesCaught ?? 0) + (stats.punches ?? 0);
  const command = Math.min(.34, claims * .055 + (stats.sweepingSuccesses ?? 0) * .045);
  const distribution = clamp((stats.passesCompleted - stats.passes * .72) * .028, -.20, .20);
  return saves + efficiency + difficultSaves + command + distribution + stats.cleanSheets * .48 - stats.goalsConceded * .32;
}

/** The score context covers only the player's own minutes. All contributions use recorded actions. */
export function matchRating(position: Position, stats: PlayerStats, goalsFor: number, goalsAgainst: number, noise: number): number {
  if (!stats.minutes) return 0;
  const roleContribution = position === 'GK' ? keeperContribution(stats) : fieldContribution(stats, position, goalsAgainst);
  const scoreContext = clamp((goalsFor - goalsAgainst) * .10, -.20, .22) * Math.min(1, stats.minutes / 60);
  const discipline = stats.yellowCards * .15 + stats.redCards * 1.7;
  return round(clamp(6.05 + goalThreat(stats) + roleContribution + scoreContext - discipline + noise, 3, 10), 1);
}
