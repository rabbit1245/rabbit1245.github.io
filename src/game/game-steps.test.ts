import assert from 'node:assert/strict';
import test from 'node:test';
import { commandSteps, executeCommand } from './commands';
import { createCareer } from './engine';
import { finishGameStepsInBrowser } from './game-steps';
import { sealCareer } from './game-delta';
import { validateEngineResult } from './storage';

test('cooperative progress yields between rounds and commits the same complete command', async () => {
  const career = sealCareer(createCareer({
    name: '진행 검수', nationality: '대한민국', age: 22, height: 179, weight: 75, foot: 'right',
    position: 'ST', style: '포처', talent: 'S', clubId: 'KR2_03', squad: 'senior', difficulty: 'realistic',
    seed: 'cooperative-command-regression',
  }));
  const command = { type: 'advance', weeks: 2 } as const;
  const expectedRounds: number[] = [];
  const expected = executeCommand(career, command, 'round-audit', p => expectedRounds.push(p.round));
  const rounds: number[] = [];
  let firstProgressHandled = false;
  const result = await finishGameStepsInBrowser(commandSteps(career, command, 'round-audit'), ({ round }) => {
    assert.equal(career.season.week, 0, 'the last saved revision is separate from the progressing command');
    rounds.push(round);
    if (rounds.length === 1) setTimeout(() => { firstProgressHandled = true; }, 0);
    else assert.equal(firstProgressHandled, true);
  });
  assert.deepEqual(rounds, expectedRounds);
  assert.deepEqual(result, expected);
  assert.equal(result.processedCommands.filter(id => id === 'round-audit').length, 1);
  validateEngineResult(career, result);
});
