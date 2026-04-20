import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initTables } from '../db.js';
import { applyQuestBonus } from '../questBonus.js';
import { QUEST_BONUS_XP, QUEST_BREAKDOWN_MARKER, getTodayQuest } from '../quests.js';

function makeDB() {
  const db = new Database(':memory:');
  initTables(db);
  db.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(1, 'player');
  return db;
}

function saveSessionAt(db, userId, xp, breakdown, createdAt) {
  db.prepare(
    'INSERT INTO sessions (user_id, xp_gained, breakdown_json, total_xp_after, level_after, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(userId, xp, JSON.stringify(breakdown), xp, 1, createdAt);
}

// Signals tuned so every quest's `check` passes, regardless of which quest
// today's UTC date selects.
function completedSignals() {
  return {
    uniqueToolTypes: 10,
    usedBash: true,
    editedTestFile: true,
    uniqueFiles: 10,
    crossedLocalMidnight: true,
  };
}

const TODAY = new Date('2026-04-19T12:00:00Z');

test('applyQuestBonus: quest not completed → XP and breakdown unchanged', () => {
  const db = makeDB();
  const input = [{ xp: 100, reason: 'Base' }];
  const result = applyQuestBonus({
    db, userId: 1, signals: {}, baseXP: 100, breakdown: input, today: TODAY,
  });
  assert.equal(result.xp, 100);
  assert.deepEqual(result.breakdown, input);
});

test('applyQuestBonus: quest completed and not yet claimed today → bonus awarded', () => {
  const db = makeDB();
  const result = applyQuestBonus({
    db, userId: 1, signals: completedSignals(),
    baseXP: 100, breakdown: [{ xp: 100, reason: 'Base' }], today: TODAY,
  });
  assert.equal(result.xp, 100 + QUEST_BONUS_XP);
  assert.equal(result.breakdown.length, 2);
  const entry = result.breakdown[1];
  assert.equal(entry.xp, QUEST_BONUS_XP);
  assert.ok(entry.reason.startsWith(QUEST_BREAKDOWN_MARKER));
  assert.ok(entry.reason.includes(getTodayQuest(TODAY).label));
});

test('applyQuestBonus: does not mutate input breakdown array', () => {
  const db = makeDB();
  const inputBreakdown = [{ xp: 100, reason: 'Base' }];
  const result = applyQuestBonus({
    db, userId: 1, signals: completedSignals(),
    baseXP: 100, breakdown: inputBreakdown, today: TODAY,
  });
  assert.equal(inputBreakdown.length, 1, 'input length unchanged');
  assert.notStrictEqual(result.breakdown, inputBreakdown, 'returns a fresh array');
});

test('applyQuestBonus: second quest-completing session the same UTC day → no bonus', () => {
  const db = makeDB();

  // First session of the day: awarded, persisted with marker.
  const first = applyQuestBonus({
    db, userId: 1, signals: completedSignals(),
    baseXP: 50, breakdown: [{ xp: 50, reason: 'Base' }], today: TODAY,
  });
  assert.equal(first.xp, 50 + QUEST_BONUS_XP, 'first session awarded');
  saveSessionAt(db, 1, first.xp, first.breakdown, '2026-04-19 10:00:00');

  // Second session, same UTC day: bonus must be gated off.
  const second = applyQuestBonus({
    db, userId: 1, signals: completedSignals(),
    baseXP: 40, breakdown: [{ xp: 40, reason: 'Base' }], today: TODAY,
  });
  assert.equal(second.xp, 40, 'second session NOT awarded');
  assert.equal(second.breakdown.length, 1);
  assert.ok(!second.breakdown.some((b) => b.reason.includes(QUEST_BREAKDOWN_MARKER)));
});

test('applyQuestBonus: next UTC day re-awards the bonus even if yesterday was claimed', () => {
  const db = makeDB();
  // Yesterday: already claimed, persisted with marker.
  saveSessionAt(db, 1, 200, [
    { xp: 50, reason: 'Base' },
    { xp: QUEST_BONUS_XP, reason: `${QUEST_BREAKDOWN_MARKER} "X" ✓` },
  ], '2026-04-18 10:00:00');

  const result = applyQuestBonus({
    db, userId: 1, signals: completedSignals(),
    baseXP: 50, breakdown: [{ xp: 50, reason: 'Base' }], today: TODAY,
  });
  assert.equal(result.xp, 50 + QUEST_BONUS_XP, 'new UTC day awards again');
});

test('applyQuestBonus: quest completed but already claimed today → no bonus, no marker entry', () => {
  const db = makeDB();
  // Pre-seed a marked session for today.
  saveSessionAt(db, 1, 200, [
    { xp: 50, reason: 'Base' },
    { xp: QUEST_BONUS_XP, reason: `${QUEST_BREAKDOWN_MARKER} "X" ✓` },
  ], '2026-04-19 08:00:00');

  const result = applyQuestBonus({
    db, userId: 1, signals: completedSignals(),
    baseXP: 80, breakdown: [{ xp: 80, reason: 'Base' }], today: TODAY,
  });
  assert.equal(result.xp, 80);
  assert.equal(result.breakdown.length, 1);
});

test('applyQuestBonus: another user claiming today does not block this user', () => {
  const db = makeDB();
  db.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(2, 'other');
  // User 2 claimed today.
  saveSessionAt(db, 2, 200, [
    { xp: QUEST_BONUS_XP, reason: `${QUEST_BREAKDOWN_MARKER} "X" ✓` },
  ], '2026-04-19 08:00:00');

  // User 1's first session today should still award the bonus.
  const result = applyQuestBonus({
    db, userId: 1, signals: completedSignals(),
    baseXP: 50, breakdown: [{ xp: 50, reason: 'Base' }], today: TODAY,
  });
  assert.equal(result.xp, 50 + QUEST_BONUS_XP);
});

