import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { QUEST_BREAKDOWN_MARKER } from './quests.js';

const DB_DIR = path.join(os.homedir(), '.claudexp');
const DB_PATH = path.join(DB_DIR, 'data.db');
let _db = null;

export function initTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      xp_gained INTEGER NOT NULL,
      breakdown_json TEXT NOT NULL,
      total_xp_after INTEGER NOT NULL,
      level_after INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, key),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user_created ON sessions (user_id, created_at);
  `);

  const sessionCols = db.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
  if (!sessionCols.includes('transcript_path')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN transcript_path TEXT').run();
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user_transcript ON sessions (user_id, transcript_path)');
}

export function getDB() {
  if (_db) return _db;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  initTables(_db);
  return _db;
}

export const initDB = getDB;
export const DB_PATH_LOCATION = DB_PATH;

export function getDefaultUser(db = getDB()) {
  return db.prepare('SELECT * FROM users ORDER BY id ASC LIMIT 1').get();
}

export function getUserByName(db, name) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(name);
}

export function getOrCreateUser(db, username) {
  const u = getUserByName(db, username);
  if (u) return u;
  const info = db.prepare('INSERT INTO users (username) VALUES (?)').run(username);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
}

export function renameUser(db, userId, newName) {
  db.prepare('UPDATE users SET username = ? WHERE id = ?').run(newName, userId);
}

export function saveSession(db, userId, xpGained, breakdown, totalXP, level, transcriptPath = null) {
  const info = db.prepare(
    'INSERT INTO sessions (user_id, xp_gained, breakdown_json, total_xp_after, level_after, transcript_path) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, xpGained, JSON.stringify(breakdown), totalXP, level, transcriptPath);
  return info.lastInsertRowid;
}

export function updateSession(db, sessionId, xpGained, breakdown, totalXP, level) {
  db.prepare(
    'UPDATE sessions SET xp_gained = ?, breakdown_json = ?, total_xp_after = ?, level_after = ? WHERE id = ?'
  ).run(xpGained, JSON.stringify(breakdown), totalXP, level, sessionId);
}

export function getSessionByTranscript(db, userId, transcriptPath) {
  if (!transcriptPath) return null;
  return db.prepare(
    'SELECT * FROM sessions WHERE user_id = ? AND transcript_path = ?'
  ).get(userId, transcriptPath);
}

export function sumXpExcept(db, userId, excludeSessionId) {
  const row = db.prepare(
    'SELECT COALESCE(SUM(xp_gained), 0) AS total FROM sessions WHERE user_id = ? AND id != ?'
  ).get(userId, excludeSessionId);
  return row ? row.total : 0;
}

export function getTotalXP(db, userId) {
  const row = db.prepare(
    'SELECT COALESCE(SUM(xp_gained), 0) AS total FROM sessions WHERE user_id = ?'
  ).get(userId);
  return row ? row.total : 0;
}

export function hasSessionOnDate(db, userId, dateISO) {
  const row = db.prepare(
    "SELECT COUNT(*) AS c FROM sessions WHERE user_id = ? AND date(created_at) = ?"
  ).get(userId, dateISO);
  return row.c > 0;
}

export function hasQuestCompletionOnDate(db, userId, dateISO) {
  const row = db.prepare(
    "SELECT 1 FROM sessions WHERE user_id = ? AND date(created_at) = ? AND breakdown_json LIKE ? LIMIT 1"
  ).get(userId, dateISO, `%${QUEST_BREAKDOWN_MARKER}%`);
  return row !== undefined;
}

export function countSessions(db, userId) {
  return db.prepare('SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?').get(userId).c;
}

export function countSessionsWithBreakdown(db, userId, like) {
  return db.prepare(
    "SELECT COUNT(*) AS c FROM sessions WHERE user_id = ? AND breakdown_json LIKE ?"
  ).get(userId, `%${like}%`).c;
}

export function getRecentSessions(db, userId, limit = 10) {
  return db.prepare(
    'SELECT * FROM sessions WHERE user_id = ? ORDER BY id DESC LIMIT ?'
  ).all(userId, limit);
}

export function getUnlockedAchievements(db, userId) {
  return db.prepare(
    'SELECT * FROM achievements WHERE user_id = ? ORDER BY unlocked_at ASC'
  ).all(userId);
}

export function getUnlockedAchievementKeys(db, userId) {
  return new Set(getUnlockedAchievements(db, userId).map(a => a.key));
}

export function unlockAchievement(db, userId, key) {
  const info = db.prepare('INSERT OR IGNORE INTO achievements (user_id, key) VALUES (?, ?)').run(userId, key);
  return info.changes > 0;
}

export function getConsecutiveDays(db, userId) {
  const rows = db.prepare(
    "SELECT DISTINCT date(created_at) AS d FROM sessions WHERE user_id = ? ORDER BY d DESC"
  ).all(userId);
  if (rows.length === 0) return 0;

  const MS = 24 * 60 * 60 * 1000;
  const toMid = (s) => new Date(s + 'T00:00:00').getTime();

  const todayMid = new Date();
  todayMid.setHours(0, 0, 0, 0);

  const firstDay = toMid(rows[0].d);
  const gapFromToday = Math.round((todayMid.getTime() - firstDay) / MS);
  if (gapFromToday > 1) return 0;

  let count = 1;
  for (let i = 1; i < rows.length; i++) {
    const prev = toMid(rows[i - 1].d);
    const cur = toMid(rows[i].d);
    if (Math.round((prev - cur) / MS) === 1) count++;
    else break;
  }
  return count;
}

export function getAllUsersStats(db) {
  return db.prepare(`
    SELECT u.id, u.username,
           COALESCE(MAX(s.total_xp_after), 0) AS total_xp,
           COALESCE(MAX(s.level_after), 1) AS level,
           COUNT(s.id) AS sessions
      FROM users u
      LEFT JOIN sessions s ON s.user_id = u.id
     GROUP BY u.id
     ORDER BY total_xp DESC
  `).all();
}
