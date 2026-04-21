#!/usr/bin/env node
import { parseTranscript, scoreSession, descriptorFor } from './engine.js';
import {
  getDB, getDefaultUser, getOrCreateUser, saveSession, updateSession,
  getSessionByTranscript, sumXpExcept, getTotalXP, hasSessionOnDate, countSessions,
} from './db.js';
import { levelFor, nextLevelOf, progressToNext } from './levels.js';
import { checkAchievements } from './achievements.js';
import { applyQuestBonus } from './questBonus.js';
import { renderOverlay } from './overlay.js';
import { updateProfile, hasCloudConfig } from './sync.js';
import { loadConfig } from './config.js';

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

async function main() {
  const raw = await readStdin();
  let payload = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = {}; }

  const db = getDB();
  let user = getDefaultUser(db);
  if (!user) user = getOrCreateUser(db, 'player');

  const transcriptPath = payload.transcript_path || null;
  const signals = parseTranscript(transcriptPath);

  const yDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const streakActive = hasSessionOnDate(db, user.id, yDate);

  const base = scoreSession(signals, streakActive);
  const { xp: sessionScore, breakdown } = applyQuestBonus({
    db,
    userId: user.id,
    signals,
    baseXP: base.xp,
    breakdown: base.breakdown,
  });

  const existing = getSessionByTranscript(db, user.id, transcriptPath);
  let xpGained, newXP;
  if (existing) {
    xpGained = Math.max(0, sessionScore - existing.xp_gained);
    newXP = sumXpExcept(db, user.id, existing.id) + sessionScore;
  } else {
    xpGained = sessionScore;
    newXP = getTotalXP(db, user.id) + sessionScore;
  }

  const prevXP = newXP - xpGained;
  const prevLevel = levelFor(prevXP);
  const newLevel = levelFor(newXP);

  if (existing) {
    updateSession(db, existing.id, sessionScore, breakdown, newXP, newLevel.level);
  } else {
    saveSession(db, user.id, sessionScore, breakdown, newXP, newLevel.level, transcriptPath);
  }

  const newAchievements = checkAchievements(db, user.id, signals, newXP, newLevel);

  const overlay = renderOverlay({
    xpGained,
    breakdown,
    descriptor: descriptorFor(signals),
    level: newLevel.level,
    levelInfo: newLevel,
    progressPercent: progressToNext(newXP, newLevel),
    nextLevelInfo: nextLevelOf(newLevel),
    newAchievements,
    levelUp: newLevel.level > prevLevel.level,
  });

  process.stderr.write('\n' + overlay + '\n\n');

  if (hasCloudConfig()) {
    const cfg = loadConfig();
    const claimedUsername = cfg.claimed_username;
    const ownerToken = cfg.owner_token;
    if (claimedUsername && ownerToken) {
      const res = await updateProfile({
        username: claimedUsername,
        ownerToken,
        totalXP: newXP,
        level: newLevel.level,
        sessionCount: countSessions(db, user.id),
      });
      if (!res.ok) process.stderr.write(`[claudexp] cloud sync failed: ${res.reason}\n`);
    }
  }
}

main().catch((err) => {
  try { process.stderr.write(`[claudexp] hook error: ${err?.message || err}\n`); } catch {}
  process.exit(0);
});
