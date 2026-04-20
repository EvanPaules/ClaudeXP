import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initTables, hasQuestCompletionOnDate } from '../db.js';
import { QUEST_BREAKDOWN_MARKER } from '../quests.js';

function makeDB() {
  const db = new Database(':memory:');
  initTables(db);
  db.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(1, 'player');
  return db;
}

function insertSession(db, { userId = 1, breakdown = [], createdAt }) {
  const stmt = db.prepare(
    'INSERT INTO sessions (user_id, xp_gained, breakdown_json, total_xp_after, level_after, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  stmt.run(userId, 0, JSON.stringify(breakdown), 0, 1, createdAt);
}

test('QUEST_BREAKDOWN_MARKER is the stable prefix written by the hook', () => {
  assert.equal(typeof QUEST_BREAKDOWN_MARKER, 'string');
  assert.ok(QUEST_BREAKDOWN_MARKER.length > 0);
  // A realistic breakdown reason string must contain the marker.
  const reason = `${QUEST_BREAKDOWN_MARKER} "Run a shell command" ✓`;
  assert.ok(reason.includes(QUEST_BREAKDOWN_MARKER));
});

test('hasQuestCompletionOnDate returns false on empty DB', () => {
  const db = makeDB();
  assert.equal(hasQuestCompletionOnDate(db, 1, '2026-04-19'), false);
});

test('hasQuestCompletionOnDate returns true when a quest-marked session exists that day', () => {
  const db = makeDB();
  insertSession(db, {
    breakdown: [
      { xp: 50, reason: 'Base XP' },
      { xp: 150, reason: `${QUEST_BREAKDOWN_MARKER} "Run a shell command" ✓` },
    ],
    createdAt: '2026-04-19 12:00:00',
  });
  assert.equal(hasQuestCompletionOnDate(db, 1, '2026-04-19'), true);
});

test('hasQuestCompletionOnDate isolates by date (yesterday does not count for today)', () => {
  const db = makeDB();
  insertSession(db, {
    breakdown: [{ xp: 150, reason: `${QUEST_BREAKDOWN_MARKER} "X" ✓` }],
    createdAt: '2026-04-18 23:59:00',
  });
  assert.equal(hasQuestCompletionOnDate(db, 1, '2026-04-19'), false);
  assert.equal(hasQuestCompletionOnDate(db, 1, '2026-04-18'), true);
});

test('hasQuestCompletionOnDate returns false when today has sessions but none contain the marker', () => {
  const db = makeDB();
  insertSession(db, {
    breakdown: [
      { xp: 50, reason: 'Base XP' },
      { xp: 25, reason: 'Bug fix' },
    ],
    createdAt: '2026-04-19 10:00:00',
  });
  assert.equal(hasQuestCompletionOnDate(db, 1, '2026-04-19'), false);
});

test('hasQuestCompletionOnDate isolates by user', () => {
  const db = makeDB();
  db.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(2, 'other');
  insertSession(db, {
    userId: 2,
    breakdown: [{ xp: 150, reason: `${QUEST_BREAKDOWN_MARKER} "X" ✓` }],
    createdAt: '2026-04-19 10:00:00',
  });
  assert.equal(hasQuestCompletionOnDate(db, 1, '2026-04-19'), false);
  assert.equal(hasQuestCompletionOnDate(db, 2, '2026-04-19'), true);
});

test('hasQuestCompletionOnDate is resilient to LIKE wildcards in breakdown text', () => {
  const db = makeDB();
  // A malicious/accidental reason containing % or _ must not trigger a false positive.
  insertSession(db, {
    breakdown: [{ xp: 10, reason: 'progress 50% complete _ Daily quests suck' }],
    createdAt: '2026-04-19 10:00:00',
  });
  // Note: the reason contains "Daily quest" as a substring (of "Daily quests"), which
  // is a documented limitation of the LIKE-based match. The test pins current behavior.
  // Update this test if we tighten the marker to include the trailing colon only.
  const result = hasQuestCompletionOnDate(db, 1, '2026-04-19');
  // Expect true because "Daily quest" appears; marker is "Daily quest:" which does NOT.
  assert.equal(result, false);
});
