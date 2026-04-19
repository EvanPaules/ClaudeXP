// quests.js — Daily quest engine for ClaudeXP
// One quest per day, same for all users (seeded from UTC date, no server needed)

const QUESTS = [
  { id: 'three_tools',    label: 'Use 3+ different tool types today',        check: (s) => (s.toolUses || 0) >= 3 },
  { id: 'edit_test',      label: 'Edit a test file (.test. / .spec. / _test)', check: (s) => s.hasTests },
  { id: 'five_files',     label: 'Touch 5+ files in a single session',       check: (s) => (s.uniqueFiles || 0) >= 5 },
  { id: 'bug_hunter',     label: 'Fix a bug today',                          check: (s) => s.isBugFix },
  { id: 'feature_ship',   label: 'Implement a new feature',                  check: (s) => s.isFeature },
  { id: 'deep_worker',    label: 'Use 20+ tools in a single session',        check: (s) => (s.toolUses || 0) >= 20 },
  { id: 'refactor_day',   label: 'Ship a refactor today',                    check: (s) => s.isRefactor },
  { id: 'ten_tools',      label: 'Use 10+ tools in a session',               check: (s) => (s.toolUses || 0) >= 10 },
];

function hashDate(date) {
  const str = date.toISOString().slice(0, 10); // e.g. "2025-04-19"
  let hash = 0;
  for (const ch of str) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash;
}

export function getTodaysQuest() {
  const idx = hashDate(new Date()) % QUESTS.length;
  return QUESTS[idx];
}

export function checkQuest(signals) {
  const quest = getTodaysQuest();
  const completed = quest.check(signals);
  return { quest, completed, bonus: completed ? 150 : 0 };
}
