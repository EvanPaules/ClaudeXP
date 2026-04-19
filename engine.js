import fs from 'node:fs';

const KEYWORDS = {
  fix:      /\b(fix(?:ed|ing|es)?|bug(?:s|fix|fixes|fixed)?)\b/i,
  feature:  /\b(feature|implement(?:ed|ing|ation|s)?)\b/i,
  refactor: /\brefactor(?:ed|ing|s)?\b/i,
  test:     /\btest(?:s|ing|ed)?\b/i,
};

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const TEST_FILE_RE = /(\.test\.|\.spec\.|_test\.|[\\/]tests?[\\/])/i;

export function parseTranscript(transcriptPath) {
  const empty = {
    toolUses: 0,
    uniqueFiles: 0,
    duration: 0,
    isBugFix: false,
    isFeature: false,
    isRefactor: false,
    hasTests: false,
    uniqueToolTypes: 0,
    usedBash: false,
    editedTestFile: false,
    crossedLocalMidnight: false,
  };

  if (!transcriptPath || !fs.existsSync(transcriptPath)) return empty;

  let raw;
  try { raw = fs.readFileSync(transcriptPath, 'utf8'); }
  catch { return empty; }

  const files = new Set();
  const toolNames = new Set();
  let toolUses = 0;
  let usedBash = false;
  let editedTestFile = false;
  let firstTs = null, lastTs = null;
  const found = { fix: false, feature: false, refactor: false, test: false };

  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }

    const tsStr = obj.timestamp || obj.ts || obj.time;
    if (tsStr) {
      const t = Date.parse(tsStr);
      if (!Number.isNaN(t)) {
        if (firstTs == null) firstTs = t;
        lastTs = t;
      }
    }

    const msg = obj.message || obj;
    const role = msg?.role;
    const rawContent = msg?.content;
    const blocks = Array.isArray(rawContent)
      ? rawContent
      : typeof rawContent === 'string'
        ? [{ type: 'text', text: rawContent }]
        : [];

    for (const block of blocks) {
      if (!block) continue;

      if (block.type === 'tool_use' && role === 'assistant') {
        toolUses++;
        if (block.name) toolNames.add(block.name);
        if (block.name === 'Bash') usedBash = true;
        const input = block.input || {};
        if (FILE_TOOLS.has(block.name)) {
          const paths = [];
          if (input.file_path) paths.push(String(input.file_path));
          if (input.notebook_path) paths.push(String(input.notebook_path));
          for (const p of paths) {
            files.add(p);
            if (!editedTestFile && TEST_FILE_RE.test(p)) editedTestFile = true;
          }
        }
      }

      if (block.type === 'text' && typeof block.text === 'string') {
        scanText(block.text, found);
      }
    }
  }

  const crossedLocalMidnight =
    firstTs != null && lastTs != null &&
    new Date(firstTs).toDateString() !== new Date(lastTs).toDateString();

  return {
    toolUses,
    uniqueFiles: files.size,
    duration: firstTs != null && lastTs != null ? Math.max(0, (lastTs - firstTs) / 1000) : 0,
    isBugFix: found.fix,
    isFeature: found.feature,
    isRefactor: found.refactor,
    hasTests: found.test,
    uniqueToolTypes: toolNames.size,
    usedBash,
    editedTestFile,
    crossedLocalMidnight,
  };
}

function scanText(text, found) {
  for (const [key, re] of Object.entries(KEYWORDS)) {
    if (!found[key] && re.test(text)) found[key] = true;
  }
}

export function scoreSession(signals, streakActive = false) {
  const breakdown = [];
  let xp = 0;

  xp += 25;
  breakdown.push({ xp: 25, reason: 'Session base' });

  const toolXP = Math.min((signals.toolUses || 0) * 5, 100);
  if (toolXP > 0) {
    xp += toolXP;
    breakdown.push({ xp: toolXP, reason: `Tool uses ×${signals.toolUses}` });
  }

  const fileXP = Math.min((signals.uniqueFiles || 0) * 10, 80);
  if (fileXP > 0) {
    xp += fileXP;
    breakdown.push({ xp: fileXP, reason: `Files edited ×${signals.uniqueFiles}` });
  }

  if (signals.isBugFix) {
    xp += 50;
    breakdown.push({ xp: 50, reason: 'Bug fix bonus' });
  }
  if (signals.isFeature) {
    xp += 75;
    breakdown.push({ xp: 75, reason: 'New feature bonus' });
  }
  if ((signals.toolUses || 0) >= 20) {
    xp += 30;
    breakdown.push({ xp: 30, reason: 'Deep work bonus' });
  }

  if (streakActive) {
    const bonus = Math.round(xp * 0.15);
    xp += bonus;
    breakdown.push({ xp: bonus, reason: 'Streak ×1.15' });
  }

  return { xp, breakdown };
}

export function descriptorFor(signals) {
  if (signals.isFeature)        return { text: 'Feature built',    emoji: '🚀' };
  if (signals.isBugFix)         return { text: 'Bug squashed',     emoji: '🐛' };
  if (signals.isRefactor)       return { text: 'Refactor shipped', emoji: '🧹' };
  if ((signals.toolUses || 0) >= 20) return { text: 'Deep work',   emoji: '🧠' };
  return { text: 'Session complete', emoji: '✨' };
}
