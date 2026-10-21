import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCareer } from './engine';
import { executeCommand } from './commands';
import { CLUBS } from './data';
import { PLAY_STYLES } from './attributes';

test('같은 진행 명령을 재전송해도 경기와 기록이 중복되지 않는다', () => {
  const career = createCareer({ name: '김선수', nationality: '대한민국', age: 20, height: 180, weight: 74, foot: 'right', position: 'CAM', talent: 'A', style: PLAY_STYLES.CAM[0], clubId: CLUBS[0].id, squad: 'senior', difficulty: 'realistic', seed: 'idempotency-test' });
  const after = executeCommand(career, { type: 'advance', weeks: 1 }, 'command-1');
  assert.deepEqual(executeCommand(after, { type: 'advance', weeks: 1 }, 'command-1'), after);
  assert.equal(career.revision, 0);
  assert.equal(after.processedCommands.filter(id => id === 'command-1').length, 1);
});

test('잘못된 진행 요청은 상태를 바꾸지 않는다', () => {
  const career = createCareer({ name: '박선수', nationality: '대한민국', age: 18, height: 175, weight: 70, foot: 'left', position: 'ST', talent: 'B', style: PLAY_STYLES.ST[0], clubId: CLUBS[0].id, squad: 'senior', difficulty: 'realistic', seed: 'invalid-command' });
  for (const weeks of [0, -1, 0.5, 121, Infinity]) assert.throws(() => executeCommand(career, { type: 'advance', weeks }, 'invalid'));
  assert.equal(career.season.week, 0);
});
