import chalk from 'chalk';
import { formatExpiry } from './titles.js';

const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(s) { return String(s).replace(ANSI_RE, ''); }

export function visualWidth(s) {
  s = stripAnsi(s);
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c >= 0xFE00 && c <= 0xFE0F) continue; // variation selectors render as 0
    if (c >= 0x200D && c <= 0x200F) continue; // ZWJ and directional marks
    if (c >= 0x1F000) w += 2;
    else if (c >= 0x2600 && c <= 0x27BF) w += 2;
    else if (c >= 0x1100 && c <= 0x115F) w += 2;
    else w += 1;
  }
  return w;
}

function padRight(s, width) {
  const w = visualWidth(s);
  return s + ' '.repeat(Math.max(0, width - w));
}

function bar(percent, width = 20) {
  const clamped = Math.min(100, Math.max(0, percent));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
}

function frame(lines) {
  const innerMax = Math.max(
    30,
    ...lines.filter(l => !l.sep).map(l => visualWidth(l.text))
  );
  const totalInner = innerMax + 4;
  const out = ['╭' + '─'.repeat(totalInner) + '╮'];
  for (const l of lines) {
    if (l.sep) out.push('├' + '─'.repeat(totalInner) + '┤');
    else out.push('│  ' + padRight(l.text, innerMax) + '  │');
  }
  out.push('╰' + '─'.repeat(totalInner) + '╯');
  return out.join('\n');
}

export function renderOverlay({
  xpGained, breakdown, descriptor,
  level, levelInfo, progressPercent, nextLevelInfo,
  newAchievements = [], levelUp = false, loot = null,
}) {
  const lines = [];
  const sep = () => lines.push({ sep: true });
  const row = (text) => lines.push({ text });

  row(`⚡ ${chalk.bold('Claude Code XP')}  ${chalk.dim('·')}  ${chalk.dim('Session done')}`);
  sep();

  const headEmoji = descriptor?.emoji ?? '✨';
  const headText  = descriptor?.text  ?? 'Session complete';
  const totalStr  = ('+' + xpGained).padEnd(4);
  row(`${chalk.yellow.bold(totalStr + ' XP')}   ${chalk.white(headText)}  ${headEmoji}`);

  for (const item of breakdown) {
    const xpStr = ('+' + item.xp).padEnd(4);
    row(`${chalk.yellow(xpStr + ' XP')}   ${chalk.dim(item.reason)}`);
  }

  sep();

  if (levelUp) {
    row(`${chalk.magenta.bold('🎉 LEVEL UP!')}  ${chalk.magenta('Now ' + levelInfo.title)}`);
  }

  for (const ach of newAchievements) {
    row(`${chalk.cyan.bold('🏆 Achievement:')} ${chalk.cyan(ach.title)} ${chalk.dim('— ' + ach.desc)}`);
  }

  if (loot && loot.title) {
    const label = loot.isNew ? '🎁 Loot drop:' : '🎁 Loot:';
    row(`${chalk.magenta.bold(label)} ${chalk.magenta('"' + loot.title + '"')} ${chalk.dim('— expires in ' + formatExpiry(loot.expiresAt))}`);
  }

  row(`${chalk.magenta.bold('Level ' + level)} ${chalk.dim('·')} ${chalk.magenta(levelInfo.title)}`);

  const pctLabel = nextLevelInfo
    ? `${progressPercent}% to Lvl ${level + 1}`
    : 'MAX LEVEL';
  row(`${bar(progressPercent)}  ${chalk.dim(pctLabel)}`);

  return frame(lines);
}

export function renderStatsCard({
  username, levelInfo, totalXP, nextLevelInfo, progressPercent,
  streak, sessionCount, unlockedCount, totalAchievements,
}) {
  const lines = [];
  const sep = () => lines.push({ sep: true });
  const row = (t) => lines.push({ text: t });

  row(`👤 ${chalk.bold(username)}  ${chalk.dim('· Claude Code XP')}`);
  sep();
  row(`${chalk.magenta.bold('Level ' + levelInfo.level)} ${chalk.dim('·')} ${chalk.magenta(levelInfo.title)}`);
  row(`${chalk.yellow.bold(totalXP.toLocaleString())} ${chalk.yellow('XP')} ${chalk.dim('total')}`);
  const pctLabel = nextLevelInfo
    ? `${progressPercent}% to ${nextLevelInfo.title} (${(nextLevelInfo.xpRequired - totalXP).toLocaleString()} XP to go)`
    : 'MAX LEVEL — unstoppable';
  row(`${bar(progressPercent)}  ${chalk.dim(pctLabel)}`);
  sep();
  row(`${chalk.bold('Streak:')}       ${streak} day${streak === 1 ? '' : 's'}`);
  row(`${chalk.bold('Sessions:')}     ${sessionCount}`);
  row(`${chalk.bold('Achievements:')} ${unlockedCount} / ${totalAchievements}`);

  return frame(lines);
}
