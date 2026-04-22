import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  initTables,
  reconcileFromCloud,
  getCloudBaseline,
  getTotalXP,
  countSessions,
  saveSession,
  getAllUsersStats,
} from '../db.js';

function makeDB() {
  const db = new Database(':memory:');
  initTables(db);
  db.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(1, 'player');
  return db;
}

test('fresh DB has zero baseline', () => {
  const db = makeDB();
  const b = getCloudBaseline(db, 1);
  assert.deepEqual(b, { xp: 0, sessions: 0 });
  assert.equal(getTotalXP(db, 1), 0);
  assert.equal(countSessions(db, 1), 0);
});

test('reconcileFromCloud raises baseline to fill the gap when cloud is ahead', () => {
  const db = makeDB();
  saveSession(db, 1, 200, [], 200, 1, null);

  const raised = reconcileFromCloud(db, 1, { totalXP: 8000, sessionCount: 50 });
  assert.equal(raised, true);

  // local sessions: 200 XP, 1 session.
  // cloud says: 8000 XP, 50 sessions.
  // baseline must fill the gap: 7800 XP, 49 sessions.
  const b = getCloudBaseline(db, 1);
  assert.equal(b.xp, 7800);
  assert.equal(b.sessions, 49);

  // Effective totals now match cloud truth.
  assert.equal(getTotalXP(db, 1), 8000);
  assert.equal(countSessions(db, 1), 50);
});

test('reconcileFromCloud is idempotent — re-running with same cloud values is a no-op', () => {
  const db = makeDB();
  saveSession(db, 1, 200, [], 200, 1, null);
  reconcileFromCloud(db, 1, { totalXP: 8000, sessionCount: 50 });

  const raised = reconcileFromCloud(db, 1, { totalXP: 8000, sessionCount: 50 });
  assert.equal(raised, false);
  assert.equal(getTotalXP(db, 1), 8000);
});

test('reconcileFromCloud never lowers an existing baseline (cloud regressed)', () => {
  const db = makeDB();
  reconcileFromCloud(db, 1, { totalXP: 8000, sessionCount: 50 });
  // Cloud somehow returns a lower number (e.g., admin reset, race) — local
  // should hold the line, not regress.
  const raised = reconcileFromCloud(db, 1, { totalXP: 100, sessionCount: 5 });
  assert.equal(raised, false);
  assert.equal(getTotalXP(db, 1), 8000);
  assert.equal(countSessions(db, 1), 50);
});

test('reconcileFromCloud is a no-op when cloud is behind on both metrics', () => {
  const db = makeDB();
  // Local has 9000 XP across two sessions; cloud is behind on both.
  saveSession(db, 1, 5000, [], 5000, 3, null);
  saveSession(db, 1, 4000, [], 9000, 5, null);
  const raised = reconcileFromCloud(db, 1, { totalXP: 5000, sessionCount: 1 });
  assert.equal(raised, false);
  assert.equal(getTotalXP(db, 1), 9000);
  assert.equal(countSessions(db, 1), 2);
});

test('reconcileFromCloud raises only the dimension that is behind', () => {
  const db = makeDB();
  saveSession(db, 1, 9000, [], 9000, 5, null);
  // Cloud behind on XP but ahead on sessions (e.g., partial earlier sync).
  const raised = reconcileFromCloud(db, 1, { totalXP: 5000, sessionCount: 20 });
  assert.equal(raised, true);
  assert.equal(getTotalXP(db, 1), 9000); // XP unchanged
  assert.equal(countSessions(db, 1), 20); // sessions catches up
});

test('new sessions add on top of baseline', () => {
  const db = makeDB();
  reconcileFromCloud(db, 1, { totalXP: 8000, sessionCount: 50 });
  // Earn 75 XP this session.
  saveSession(db, 1, 75, [], 8075, 7, null);
  assert.equal(getTotalXP(db, 1), 8075);
  assert.equal(countSessions(db, 1), 51);
});

test('getAllUsersStats includes baseline in totals', () => {
  const db = makeDB();
  reconcileFromCloud(db, 1, { totalXP: 5000, sessionCount: 30 });
  saveSession(db, 1, 100, [], 5100, 4, null);

  const stats = getAllUsersStats(db);
  assert.equal(stats.length, 1);
  assert.equal(stats[0].total_xp, 5100);
  assert.equal(stats[0].sessions, 31);
});

test('reconcile defaults zero/null cloud values to no-op', () => {
  const db = makeDB();
  saveSession(db, 1, 500, [], 500, 1, null);
  // Cloud row missing fields shouldn't lower local.
  const raised = reconcileFromCloud(db, 1, {});
  assert.equal(raised, false);
  assert.equal(getTotalXP(db, 1), 500);
});
