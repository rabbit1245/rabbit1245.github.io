import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyStats } from './math';
import { matchRating } from './match-rating';

test('defensive work and a clean spell can earn a strong match rating without a goal or assist', () => {
  const defending = {
    ...emptyStats(), minutes: 90, tackles: 5, tackleAttempts: 6, interceptions: 3, aerialWon: 4,
    aerialAttempts: 6, passes: 43, passesCompleted: 38, progressivePasses: 4, cleanSheets: 1,
  };
  const clean = matchRating('CB', defending, 1, 0, 0);
  const conceded = matchRating('CB', { ...defending, cleanSheets: 0 }, 1, 3, 0);
  const lostDuels = matchRating('CB', { ...defending, tackleAttempts: 11, aerialAttempts: 10 }, 1, 0, 0);
  assert.ok(clean >= 7.4 && clean < 8.5);
  assert.ok(conceded < clean - .7);
  assert.ok(lostDuels < clean);
  assert.ok(matchRating('ST', defending, 1, 0, 0) < clean);
  assert.ok(matchRating('CB', { ...defending, redCards: 1 }, 1, 0, 0) < clean - 1.5);
});

test('midfield progression, dangerous chances and decisive goals contribute separately', () => {
  const stats = { ...emptyStats(), minutes: 90, passes: 52, passesCompleted: 46, keyPasses: 2 };
  const previous = matchRating('CM', stats, 1, 1, 0);
  assert.ok(matchRating('CM', { ...stats, progressivePasses: 7 }, 1, 1, 0) > previous);
  assert.ok(matchRating('CAM', { ...stats, bigChancesCreated: 2 }, 1, 1, 0) > matchRating('CAM', stats, 1, 1, 0));
  const stint = { ...emptyStats(), minutes: 12 };
  assert.ok(matchRating('ST', { ...stint, goals: 1, shotsOnTarget: 1 }, 1, 0, 0) >= 7);
  assert.equal(matchRating('ST', emptyStats(), 4, 0, 0), 0);
});

test('keeper ratings account for shot-stopping quality as well as save volume', () => {
  const quiet = { ...emptyStats(), minutes: 90, cleanSheets: 1 };
  const good = { ...quiet, saves: 5, shotsFaced: 5, oneOnOneSaves: 1 };
  const busy = { ...quiet, cleanSheets: 0, saves: 9, shotsFaced: 12, goalsConceded: 3 };
  const rated = matchRating('GK', good, 1, 0, 0);
  assert.ok(rated > matchRating('GK', quiet, 1, 0, 0));
  assert.ok(rated > matchRating('GK', busy, 1, 3, 0));
  assert.ok(matchRating('GK', { ...good, penaltiesSaved: 1 }, 1, 0, 0) > rated);
});
