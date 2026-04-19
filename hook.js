#!/usr/bin/env node
import { checkQuest } from './quests.js';
import { parseTranscript, scoreSession, descriptorFor } from './engine.js';
import {
  getDB, getDefaultUser, getOrCreateUser, saveSession, getTotalXP, hasSessionOnDate, countSessions,
} from './db.js';
import { levelFor, nextLevelOf, progressToNext } from './levels.js';
import { checkAchievements } from './achievements.js';
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

  const signals = parseTranscript(payload.transcript_path);

  const yDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const streakActive = hasSessionOnDate(db, user.id, yDate);

  const { xp: xpGainedRaw, breakdown } = scoreSession(signals, streakActive);
  const { quest, completed, bonus } = checkQuest(signals);
  if (completed) breakdown.push({ xp: bonus, reason: `Daily quest: "${quest.label}" ✓` });
  const xpGained = xpGainedRaw + (completed ? bonus : 0);
  const prevXP = getTotalXP(db, user.id);
  const newXP = prevXP + xpGained;
  const prevLevel = levelFor(prevXP);
  const newLevel = levelFor(newXP);

  saveSession(db, user.id, xpGained, breakdown, newXP, newLevel.level);

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
