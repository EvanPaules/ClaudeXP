#!/usr/bin/env node
import { parseTranscript, scoreSession, descriptorFor } from './engine.js';
import {
  getDB, getDefaultUser, getOrCreateUser, saveSession, getTotalXP, hasSessionOnDate, countSessions,
  getActiveTitle, saveActiveTitle, clearActiveTitle,
} from './db.js';
import { levelFor, nextLevelOf, progressToNext } from './levels.js';
import { checkAchievements } from './achievements.js';
import { renderOverlay } from './overlay.js';
import { updateProfile, hasCloudConfig } from './sync.js';
import { loadConfig } from './config.js';
import { rollTitle, isActiveTitle } from './titles.js';

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

  const signals = parseTranscript(payload.transcript_path);

  const yDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const streakActive = hasSessionOnDate(db, user.id, yDate);

  const { xp: xpGained, breakdown } = scoreSession(signals, streakActive);

  const prevXP = getTotalXP(db, user.id);
  const newXP = prevXP + xpGained;
  const prevLevel = levelFor(prevXP);
  const newLevel = levelFor(newXP);

  saveSession(db, user.id, xpGained, breakdown, newXP, newLevel.level);

  const newAchievements = checkAchievements(db, user.id, signals, newXP, newLevel);

  let loot = null;
  const existing = getActiveTitle(db, user.id);
  if (existing && !isActiveTitle(existing.title, existing.expiresAt)) {
    clearActiveTitle(db, user.id);
  }
  const drop = rollTitle();
  if (drop) {
    saveActiveTitle(db, user.id, drop.title, drop.expiresAt);
    loot = { title: drop.title, expiresAt: drop.expiresAt, isNew: true };
  } else {
    const current = getActiveTitle(db, user.id);
    if (current && isActiveTitle(current.title, current.expiresAt)) {
      loot = { title: current.title, expiresAt: current.expiresAt, isNew: false };
    }
  }

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
    loot,
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
        activeTitle: loot ? loot.title : null,
        titleExpiresAt: loot ? loot.expiresAt : null,
      });
      if (!res.ok) process.stderr.write(`[claudexp] cloud sync failed: ${res.reason}\n`);
    }
  }
}

main().catch((err) => {
  try { process.stderr.write(`[claudexp] hook error: ${err?.message || err}\n`); } catch {}
  process.exit(0);
});
