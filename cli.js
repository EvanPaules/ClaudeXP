#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import readline from 'node:readline/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  getDB, getDefaultUser, getOrCreateUser, renameUser,
  getRecentSessions, getUnlockedAchievements, countSessions,
  getTotalXP, getConsecutiveDays, getAllUsersStats, DB_PATH_LOCATION,
  getActiveTitle, clearActiveTitle,
} from './db.js';
import { levelFor, nextLevelOf, progressToNext } from './levels.js';
import { ACHIEVEMENTS } from './achievements.js';
import { getTodayQuest, QUEST_BONUS_XP } from './quests.js';
import { renderStatsCard, visualWidth } from './overlay.js';
import { isActiveTitle, truncateTitle, formatExpiry, DROP_RATE } from './titles.js';
import {
  checkUsernameAvailable, claimUsername, updateProfile, deleteProfile,
  fetchLeaderboard, testConnection, hasCloudConfig,
} from './sync.js';
import {
  loadConfig, updateConfig, clearCloudConfig, saveClaim, clearClaim,
  resolveCloudConfig, CONFIG_PATH_LOCATION, COMMUNITY_PATH_LOCATION,
} from './config.js';
import { installHook, uninstallHook, hookStatus, SETTINGS_PATH, HOOK_PATH } from './installer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try { return (await rl.question(question)).trim(); }
  finally { rl.close(); }
}

function pad(s, n) {
  const w = visualWidth(s);
  return w >= n ? s : s + ' '.repeat(n - w);
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

function validateUsername(name) {
  if (!name) return 'required';
  if (name.length < 2) return 'too short (min 2)';
  if (name.length > 24) return 'too long (max 24)';
  if (!/^[a-zA-Z0-9_.-]+$/.test(name)) return 'letters, numbers, _, -, . only';
  return null;
}

async function ensureUser() {
  const db = getDB();
  let user = getDefaultUser(db);
  if (!user) {
    console.log(chalk.dim('\nNo user yet. Run ') + chalk.cyan('claudexp setup') + chalk.dim(' to pick a username and join the leaderboard.\n'));
    user = getOrCreateUser(db, 'player');
  }
  return { db, user };
}

async function claimCloudFlow(desiredUsername) {
  const cloud = resolveCloudConfig();
  if (!cloud.url || !cloud.key) {
    return { ok: false, skipped: true, reason: 'cloud not configured' };
  }

  let username = desiredUsername;
  while (true) {
    const err = validateUsername(username);
    if (err) {
      username = await prompt(`  Invalid (${err}). Username: `);
      continue;
    }

    process.stdout.write(chalk.dim(`  checking "${username}"... `));
    const avail = await checkUsernameAvailable(username);
    if (!avail.ok) {
      console.log(chalk.yellow('⚠ ' + avail.reason));
      return { ok: false, reason: avail.reason };
    }
    if (!avail.available) {
      console.log(chalk.red('✗ taken'));
      username = await prompt('  Try another name: ');
      continue;
    }
    console.log(chalk.green('✓ available'));
    break;
  }

  const ownerToken = randomToken();
  const db = getDB();
  const user = getDefaultUser(db);
  const totalXP = user ? getTotalXP(db, user.id) : 0;
  const sessionCount = user ? countSessions(db, user.id) : 0;
  const levelInfo = levelFor(totalXP);

  process.stdout.write(chalk.bold(`  claiming "${username}"... `));
  const res = await claimUsername({
    username, ownerToken, totalXP, level: levelInfo.level, sessionCount,
  });
  if (!res.ok) {
    console.log(chalk.red('✗ ' + res.reason));
    return { ok: false, reason: res.reason };
  }
  saveClaim(username, ownerToken);
  console.log(chalk.green('✓'));
  return { ok: true, username };
}

const program = new Command();
program
  .name('claudexp')
  .description('XP leveling for Claude Code sessions')
  .version('1.0.0');

program
  .command('stats')
  .description('Show your profile and level progress')
  .action(async () => {
    const { db, user } = await ensureUser();
    const totalXP = getTotalXP(db, user.id);
    const levelInfo = levelFor(totalXP);
    const nextLevelInfo = nextLevelOf(levelInfo);
    const progressPercent = progressToNext(totalXP, levelInfo);
    const streak = getConsecutiveDays(db, user.id);
    const sessionCount = countSessions(db, user.id);
    const unlockedCount = getUnlockedAchievements(db, user.id).length;

    console.log('\n' + renderStatsCard({
      username: user.username,
      levelInfo,
      totalXP,
      nextLevelInfo,
      progressPercent,
      streak,
      sessionCount,
      unlockedCount,
      totalAchievements: ACHIEVEMENTS.length,
    }) + '\n');
  });

program
  .command('history')
  .description('Show recent sessions')
  .option('--limit <n>', 'Number of sessions', '10')
  .action(async (opts) => {
    const { db, user } = await ensureUser();
    const limit = Math.max(1, parseInt(opts.limit, 10) || 10);
    const rows = getRecentSessions(db, user.id, limit);

    console.log('');
    if (rows.length === 0) {
      console.log(chalk.dim('No sessions yet. Install the hook and start a Claude Code session to log XP.\n'));
      return;
    }

    console.log(chalk.bold(pad('Date', 20) + pad('XP', 8) + pad('Lvl', 5) + 'Highlights'));
    console.log(chalk.dim('─'.repeat(70)));

    for (const r of rows) {
      let breakdown = [];
      try { breakdown = JSON.parse(r.breakdown_json); } catch {}
      const tags = [];
      if (breakdown.some(b => b.reason === 'New feature bonus')) tags.push(chalk.green('feature'));
      if (breakdown.some(b => b.reason === 'Bug fix bonus'))     tags.push(chalk.red('bug fix'));
      if (breakdown.some(b => b.reason === 'Deep work bonus'))   tags.push(chalk.magenta('deep work'));
      if (breakdown.some(b => typeof b.reason === 'string' && b.reason.startsWith('Streak'))) tags.push(chalk.yellow('streak'));

      const date = r.created_at.replace('T', ' ').slice(0, 16);
      console.log(
        pad(date, 20) +
        chalk.yellow(pad('+' + r.xp_gained, 8)) +
        pad(String(r.level_after), 5) +
        (tags.join(chalk.dim(' · ')) || chalk.dim('—'))
      );
    }
    console.log('');
  });

program
  .command('achievements')
  .description('List all achievements (unlocked + locked)')
  .action(async () => {
    const { db, user } = await ensureUser();
    const unlocked = getUnlockedAchievements(db, user.id);
    const unlockedMap = new Map(unlocked.map(u => [u.key, u]));

    console.log('');
    console.log(chalk.bold(`🏆 Achievements — ${unlocked.length}/${ACHIEVEMENTS.length} unlocked`));
    console.log(chalk.dim('─'.repeat(60)));
    for (const a of ACHIEVEMENTS) {
      const u = unlockedMap.get(a.key);
      if (u) {
        const when = u.unlocked_at.replace('T', ' ').slice(0, 16);
        console.log(`  ${chalk.green('✓')} ${chalk.bold(a.title)} ${chalk.dim('— ' + a.desc)}  ${chalk.dim('(' + when + ')')}`);
      } else {
        console.log(`  ${chalk.gray('·')} ${chalk.gray(a.title)} ${chalk.gray('— ' + a.desc)}`);
      }
    }
    console.log('');
  });

program
  .command('quest')
  .description("Show today's daily quest")
  .action(() => {
    const q = getTodayQuest();
    const today = new Date().toISOString().slice(0, 10);
    console.log('');
    console.log(chalk.bold(`🎯 Daily Quest `) + chalk.dim(`(${today} UTC)`));
    console.log(chalk.dim('─'.repeat(60)));
    console.log(`  ${chalk.cyan(q.label)}`);
    console.log(chalk.dim(`  Reward: +${QUEST_BONUS_XP} XP if you finish it in a session today.`));
    console.log(chalk.dim('  Same quest for everyone worldwide. Resets at 00:00 UTC.'));
    console.log('');
  });

program
  .command('board')
  .description('Show leaderboard (cloud if configured, else local)')
  .option('--local', 'Force local-only leaderboard')
  .action(async (opts) => {
    const { db, user } = await ensureUser();
    const cloud = resolveCloudConfig();
    const myName = cloud.claimedUsername || user.username;

    let rows = null;
    let source = 'local';
    let cloudError = null;

    if (!opts.local && hasCloudConfig()) {
      const res = await fetchLeaderboard(50);
      if (res.ok) {
        rows = res.rows.map(r => ({
          username: r.username,
          total_xp: r.total_xp,
          level: r.level,
          sessions: r.session_count,
          active_title: r.active_title,
          title_expires_at: r.title_expires_at,
        }));
        source = 'cloud';
      } else {
        cloudError = res.reason;
      }
    }

    if (!rows) {
      rows = getAllUsersStats(db).map(r => ({
        username: r.username, total_xp: r.total_xp, level: r.level, sessions: r.sessions,
        active_title: r.active_title, title_expires_at: r.title_expires_at,
      }));
    }

    const header = source === 'cloud' ? '☁️  Community Leaderboard' : '🏁 Local Leaderboard';
    console.log('');
    console.log(chalk.bold(header));
    console.log(chalk.dim('─'.repeat(78)));
    console.log(chalk.bold(pad('Rank', 6) + pad('Player', 30) + pad('Level', 26) + pad('Total XP', 12) + 'Sessions'));
    console.log(chalk.dim('─'.repeat(78)));

    rows.forEach((r, i) => {
      const levelInfo = levelFor(r.total_xp || 0);
      const levelCell = `${levelInfo.level} ${chalk.dim(levelInfo.title)}`;
      const isMe = r.username === myName;
      const base = isMe ? chalk.bold.green(r.username + ' ←') : r.username;
      const titleSuffix = isActiveTitle(r.active_title, r.title_expires_at)
        ? chalk.magenta(' (' + truncateTitle(r.active_title) + ')')
        : '';
      const nameCell = base + titleSuffix;
      console.log(
        pad('#' + (i + 1), 6) +
        pad(nameCell, 30) +
        pad(levelCell, 26) +
        chalk.yellow(pad((r.total_xp || 0).toLocaleString(), 12)) +
        chalk.dim(String(r.sessions || 0))
      );
    });

    if (cloudError) {
      console.log(chalk.dim(`\n(cloud fetch failed: ${cloudError} — showing local)`));
    } else if (source === 'local' && !hasCloudConfig()) {
      console.log(chalk.dim('\n☁️  Cloud is off. Run ') + chalk.cyan('claudexp cloud status') + chalk.dim(' for details.'));
    }
    console.log('');
  });

program
  .command('setup')
  .description('Pick a username, install the hook, and join the community leaderboard')
  .option('--no-hook', 'Skip automatic hook installation')
  .option('--no-cloud', 'Skip the cloud claim')
  .action(async (opts) => {
    const db = getDB();
    const existing = getDefaultUser(db);
    const cloud = resolveCloudConfig();

    console.log(chalk.bold('\n🛠️  claudexp setup'));
    console.log(chalk.dim('─'.repeat(40)));

    const q = existing
      ? `Username (current: ${chalk.cyan(existing.username)}, enter to keep): `
      : 'Pick a username: ';
    let name = (await prompt(q)) || (existing ? existing.username : '');

    const vErr = validateUsername(name);
    if (vErr) { console.log(chalk.red(`\nInvalid username: ${vErr}\n`)); return; }

    let user;
    if (!existing) {
      user = getOrCreateUser(db, name);
      console.log(chalk.green(`✓ Created user ${chalk.bold(user.username)}.`));
    } else if (name !== existing.username) {
      renameUser(db, existing.id, name);
      user = getOrCreateUser(db, name);
      console.log(chalk.green(`✓ Renamed ${existing.username} → ${chalk.bold(name)}.`));
    } else {
      user = existing;
      console.log(chalk.dim(`· Keeping ${existing.username}.`));
    }

    if (opts.hook !== false) {
      console.log(chalk.bold('\n📎 Installing Claude Code hook...'));
      const res = installHook();
      if (!res.ok) {
        console.log(chalk.red('  ✗ ' + res.reason));
        console.log(chalk.dim('  Fallback: paste this into ' + SETTINGS_PATH + ':\n'));
        const cfg = { hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: `node "${HOOK_PATH}"` }] }] } };
        console.log(chalk.dim(JSON.stringify(cfg, null, 2)));
      } else if (res.alreadyInstalled) {
        console.log(chalk.dim('  · Already installed at ' + res.path));
      } else {
        console.log(chalk.green('  ✓ Installed at ' + res.path));
        if (res.backupPath) console.log(chalk.dim('  · Backup: ' + res.backupPath));
      }
    }

    if (opts.cloud !== false) {
      const localCfg = loadConfig();
      if (!cloud.url || !cloud.key) {
        console.log(chalk.dim('\n☁️  Cloud disabled — no community backend configured.'));
        console.log(chalk.dim('   If you maintain this repo: fill in ') + chalk.cyan(COMMUNITY_PATH_LOCATION));
        console.log(chalk.dim('   To use your own Supabase: ') + chalk.cyan('claudexp cloud configure'));
      } else if (localCfg.claimed_username === name && localCfg.owner_token) {
        console.log(chalk.dim('\n☁️  Already claimed on cloud as ') + chalk.cyan(name) + chalk.dim(' — pushing current stats...'));
        const totalXP = getTotalXP(db, user.id);
        const sessionCount = countSessions(db, user.id);
        const levelInfo = levelFor(totalXP);
        const r = await updateProfile({
          username: name, ownerToken: localCfg.owner_token,
          totalXP, level: levelInfo.level, sessionCount,
        }, { timeoutMs: 10000 });
        console.log('  ' + (r.ok ? chalk.green('✓ synced') : chalk.yellow('⚠ ' + r.reason)));
      } else if (localCfg.claimed_username && localCfg.claimed_username !== name && localCfg.owner_token) {
        console.log(chalk.yellow(`\n☁️  You already own ${chalk.cyan(localCfg.claimed_username)} on the cloud.`));
        const ans = (await prompt(`   Delete it and reclaim as ${chalk.cyan(name)}? (y/N): `)).toLowerCase();
        if (ans === 'y' || ans === 'yes') {
          process.stdout.write(chalk.dim(`   deleting ${localCfg.claimed_username}... `));
          const d = await deleteProfile({ username: localCfg.claimed_username, ownerToken: localCfg.owner_token });
          console.log(d.ok ? chalk.green('✓') : chalk.yellow('⚠ ' + d.reason));
          clearClaim();
          console.log(chalk.bold('\n☁️  Claiming new name on cloud...'));
          await claimCloudFlow(name);
        } else {
          console.log(chalk.dim('   Keeping old cloud claim; local name changed.'));
        }
      } else {
        console.log(chalk.bold('\n☁️  Joining community leaderboard...'));
        const r = await claimCloudFlow(name);
        if (!r.ok && !r.skipped) {
          console.log(chalk.dim('   (retry later with ') + chalk.cyan('claudexp cloud claim') + chalk.dim(')'));
        }
      }
    }

    console.log('\n' + chalk.green('All set. ') + chalk.dim('Try ') + chalk.cyan('claudexp stats') + chalk.dim(' or ') + chalk.cyan('claudexp board') + '\n');
  });

program
  .command('title')
  .description('Show your active loot title (if any)')
  .action(async () => {
    const { db, user } = await ensureUser();
    const row = getActiveTitle(db, user.id);
    console.log('');
    console.log(chalk.bold('🎁 Loot Title'));
    console.log(chalk.dim('─'.repeat(60)));
    if (row && isActiveTitle(row.title, row.expiresAt)) {
      console.log(`  ${chalk.magenta.bold('"' + row.title + '"')}`);
      console.log(chalk.dim(`  Expires in ${formatExpiry(row.expiresAt)}.`));
    } else {
      if (row && row.title) {
        clearActiveTitle(db, user.id);
      }
      console.log(chalk.dim('  No active title.'));
      const pct = (DROP_RATE * 100).toFixed(1);
      console.log(chalk.dim(`  Each session has a ${pct}% chance to drop one (24h duration).`));
    }
    console.log('');
  });

// --- hook subcommands ---
const hookCmd = program.command('hook').description('Manage the Claude Code Stop hook');

hookCmd.command('install').action(() => {
  const res = installHook();
  if (!res.ok) { console.log(chalk.red('\n✗ ' + res.reason + '\n')); process.exit(1); }
  if (res.alreadyInstalled) console.log(chalk.dim('\n· Already installed at ' + res.path + '\n'));
  else {
    console.log(chalk.green('\n✓ Installed at ' + res.path));
    if (res.backupPath) console.log(chalk.dim('  Backup: ' + res.backupPath));
    if (res.removedStale) console.log(chalk.dim(`  Cleaned up ${res.removedStale} stale entr${res.removedStale === 1 ? 'y' : 'ies'}`));
    console.log('');
  }
});

hookCmd.command('uninstall').action(() => {
  const res = uninstallHook();
  if (!res.ok) { console.log(chalk.red('\n✗ ' + res.reason + '\n')); process.exit(1); }
  if (res.removed === 0) console.log(chalk.dim('\n· Nothing to remove.\n'));
  else {
    console.log(chalk.green(`\n✓ Removed ${res.removed} claudexp hook entr${res.removed === 1 ? 'y' : 'ies'} from ${res.path}`));
    if (res.backupPath) console.log(chalk.dim('  Backup: ' + res.backupPath));
    console.log('');
  }
});

hookCmd.command('status').action(() => {
  const s = hookStatus();
  console.log(chalk.bold('\n📎 Hook status'));
  console.log(chalk.dim('─'.repeat(40)));
  console.log('Settings file: ' + chalk.cyan(s.path));
  if (s.installed && s.current) {
    console.log(chalk.green('Installed:     ✓ (current path)'));
    console.log(chalk.dim('Command:       ' + s.command));
  } else if (s.installed && !s.current) {
    console.log(chalk.yellow('Installed:     ⚠ points to a different path'));
    console.log(chalk.dim('Found:         ' + s.command));
    console.log(chalk.dim('Expected:      node ' + HOOK_PATH));
    console.log(chalk.dim('Fix:           ') + chalk.cyan('claudexp hook install'));
  } else {
    console.log(chalk.red('Installed:     ✗ ' + (s.reason || 'not installed')));
    console.log(chalk.dim('Fix:           ') + chalk.cyan('claudexp hook install'));
  }
  console.log('');
});

// --- cloud subcommands ---
const cloud = program.command('cloud').description('Community leaderboard');

cloud
  .command('claim')
  .description('Claim your username on the community leaderboard')
  .action(async () => {
    const { user } = await ensureUser();
    const c = loadConfig();
    if (c.claimed_username && c.owner_token) {
      console.log(chalk.dim(`\nAlready claimed as ${chalk.cyan(c.claimed_username)}.`));
      console.log(chalk.dim('To release and reclaim, run: ') + chalk.cyan('claudexp cloud delete') + chalk.dim(' then ') + chalk.cyan('claudexp cloud claim') + '\n');
      return;
    }
    console.log(chalk.bold('\n☁️  Claiming on community leaderboard...'));
    const r = await claimCloudFlow(user.username);
    if (r.ok) console.log(chalk.green('\n✓ You\'re on the board. See it: ') + chalk.cyan('claudexp board') + '\n');
    else console.log('');
  });

cloud
  .command('push')
  .description('Force-sync your current stats to the cloud')
  .action(async () => {
    const { db, user } = await ensureUser();
    const c = loadConfig();
    if (!hasCloudConfig()) { console.log(chalk.dim('\nCloud not configured.\n')); return; }
    if (!c.claimed_username || !c.owner_token) {
      console.log(chalk.yellow('\nNo claim yet. Run: ') + chalk.cyan('claudexp cloud claim') + '\n'); return;
    }
    const totalXP = getTotalXP(db, user.id);
    const sessionCount = countSessions(db, user.id);
    const levelInfo = levelFor(totalXP);
    process.stdout.write(chalk.bold(`\nPushing ${c.claimed_username} (${totalXP.toLocaleString()} XP, Lvl ${levelInfo.level})... `));
    const res = await updateProfile({
      username: c.claimed_username, ownerToken: c.owner_token,
      totalXP, level: levelInfo.level, sessionCount,
    }, { timeoutMs: 10000 });
    if (res.ok) console.log(chalk.green('✓\n'));
    else { console.log(chalk.red('✗')); console.log(chalk.red('  ' + res.reason) + '\n'); }
  });

cloud
  .command('status')
  .description('Show cloud config, claim, and test the connection')
  .action(async () => {
    const c = resolveCloudConfig();
    console.log(chalk.bold('\n☁️  Cloud status'));
    console.log(chalk.dim('─'.repeat(50)));
    if (!c.url || !c.key) {
      console.log(chalk.dim('Disabled — no community or local cloud config.'));
      console.log('Community file: ' + chalk.cyan(COMMUNITY_PATH_LOCATION));
      console.log('Local config:   ' + chalk.cyan(CONFIG_PATH_LOCATION) + '\n');
      return;
    }
    const src = c.overridden ? chalk.dim('(local override)') : chalk.dim('(community default)');
    console.log('URL:           ' + chalk.cyan(c.url) + '  ' + src);
    console.log('Anon key:      ' + chalk.cyan(c.key.slice(0, 6) + '…' + c.key.slice(-4)));
    if (c.claimedUsername) {
      console.log('Claimed as:    ' + chalk.green(c.claimedUsername));
      console.log('Owner token:   ' + chalk.dim(c.ownerToken.slice(0, 6) + '…' + c.ownerToken.slice(-4)));
    } else {
      console.log('Claimed as:    ' + chalk.yellow('(none — run: claudexp cloud claim)'));
    }
    process.stdout.write('\nConnection:    ');
    const t = await testConnection();
    if (t.ok) console.log(chalk.green('OK'));
    else { console.log(chalk.red('failed')); console.log(chalk.red('  ' + t.reason)); }
    console.log('');
  });

cloud
  .command('configure')
  .description('Override URL + anon key locally (for self-hosting or custom backend)')
  .action(async () => {
    const existing = loadConfig();
    const urlDefault = existing.supabase_url || '';
    const keyDefault = existing.supabase_anon_key || '';
    const url = (await prompt(`Supabase URL${urlDefault ? ` [${urlDefault}]` : ''}: `)) || urlDefault;
    const key = (await prompt(`Anon key${keyDefault ? ' [keep existing]' : ''}: `)) || keyDefault;
    if (!url || !key) { console.log(chalk.red('\nMissing values.\n')); return; }
    updateConfig({ supabase_url: url.replace(/\/+$/, ''), supabase_anon_key: key });
    process.stdout.write('\nTesting... ');
    const t = await testConnection();
    if (t.ok) console.log(chalk.green('✓\n'));
    else { console.log(chalk.red('✗')); console.log(chalk.red('  ' + t.reason) + '\n'); }
  });

cloud
  .command('reset')
  .description('Clear local URL/key override (revert to community default)')
  .action(() => {
    clearCloudConfig();
    console.log(chalk.dim('\nLocal override cleared.\n'));
  });

cloud
  .command('delete')
  .description('Delete your profile from the cloud leaderboard')
  .action(async () => {
    const c = loadConfig();
    if (!c.claimed_username || !c.owner_token) { console.log(chalk.dim('\nNo claim to delete.\n')); return; }
    const ans = (await prompt(`Delete cloud profile for ${chalk.cyan(c.claimed_username)}? (y/N): `)).toLowerCase();
    if (ans !== 'y' && ans !== 'yes') { console.log(chalk.dim('Cancelled.\n')); return; }
    const res = await deleteProfile({ username: c.claimed_username, ownerToken: c.owner_token });
    if (res.ok) { clearClaim(); console.log(chalk.green('\n✓ Deleted. Local claim cleared.\n')); }
    else console.log(chalk.red('\n✗ ' + res.reason + '\n'));
  });

// --- maintainer helper ---
program
  .command('set-community')
  .description('(Maintainer) Write Supabase URL + anon key into community.json for this repo')
  .action(async () => {
    const url = await prompt('Community Supabase URL: ');
    const key = await prompt('Community anon key:    ');
    if (!url || !key) { console.log(chalk.red('\nMissing values.\n')); return; }
    fs.writeFileSync(COMMUNITY_PATH_LOCATION, JSON.stringify({
      supabase_url: url.replace(/\/+$/, ''),
      supabase_anon_key: key,
    }, null, 2) + '\n');
    console.log(chalk.green('\n✓ Wrote ') + chalk.cyan(COMMUNITY_PATH_LOCATION));
    console.log(chalk.dim('Commit this file so anyone cloning the repo auto-joins your community.\n'));
  });

program.parseAsync(process.argv).catch(err => {
  console.error(chalk.red('claudexp error:'), err.message || err);
  process.exit(1);
});
