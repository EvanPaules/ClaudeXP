import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashDate, getTodayQuest, checkQuest, QUESTS, QUEST_BONUS_XP,
} from '../quests.js';

test('hashDate is deterministic for the same UTC date', () => {
  const a = new Date('2026-04-18T03:00:00.000Z');
  const b = new Date('2026-04-18T22:59:59.000Z');
  assert.equal(hashDate(a), hashDate(b));
});

test('hashDate differs across consecutive UTC dates', () => {
  const a = new Date('2026-04-18T12:00:00.000Z');
  const b = new Date('2026-04-19T12:00:00.000Z');
  assert.notEqual(hashDate(a), hashDate(b));
});

test('getTodayQuest returns the same quest for the same day', () => {
  const d = new Date('2026-04-18T08:00:00.000Z');
  assert.equal(getTodayQuest(d).id, getTodayQuest(d).id);
});

test('getTodayQuest returns a valid quest from QUESTS list', () => {
  const d = new Date('2026-04-18T08:00:00.000Z');
  const q = getTodayQuest(d);
  assert.ok(QUESTS.find((x) => x.id === q.id), 'quest id should exist in QUESTS');
});

test('each quest check passes with its trigger signal', () => {
  const cases = {
    'tool-variety':  { uniqueToolTypes: 3 },
    'test-file':     { editedTestFile: true },
    'shell-runner':  { usedBash: true },
    'file-marathon': { uniqueFiles: 5 },
    'night-owl':     { crossedLocalMidnight: true },
  };
  for (const q of QUESTS) {
    assert.equal(q.check(cases[q.id]), true, `quest ${q.id} should pass`);
    assert.equal(q.check({}), false, `quest ${q.id} should fail on empty signals`);
  }
});

test('checkQuest awards bonus when completed', () => {
  // Find a date where quest is file-marathon so we can test deterministically.
  const signals = { uniqueFiles: 10, uniqueToolTypes: 10, usedBash: true, editedTestFile: true, crossedLocalMidnight: true };
  const result = checkQuest(signals, new Date('2026-04-18T08:00:00.000Z'));
  assert.equal(result.completed, true);
  assert.equal(result.bonus, QUEST_BONUS_XP);
  assert.ok(result.quest && result.quest.id);
});

test('checkQuest awards no bonus when not completed', () => {
  const result = checkQuest({}, new Date('2026-04-18T08:00:00.000Z'));
  assert.equal(result.completed, false);
  assert.equal(result.bonus, 0);
});

test('checkQuest handles null/undefined signals safely', () => {
  const result = checkQuest(undefined, new Date('2026-04-18T08:00:00.000Z'));
  assert.equal(result.completed, false);
  assert.equal(result.bonus, 0);
});
