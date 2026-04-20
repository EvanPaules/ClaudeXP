export const QUEST_BONUS_XP = 150;

export const QUEST_BREAKDOWN_MARKER = 'Daily quest:';

export function hashDate(date = new Date()) {
  const key = date.toISOString().slice(0, 10);
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h | 0);
}

export const QUESTS = [
  {
    id: 'tool-variety',
    label: 'Use 3+ different tool types',
    check: (s) => (s.uniqueToolTypes || 0) >= 3,
  },
  {
    id: 'test-file',
    label: 'Edit a test file',
    check: (s) => s.editedTestFile === true,
  },
  {
    id: 'shell-runner',
    label: 'Run a shell command',
    check: (s) => s.usedBash === true,
  },
  {
    id: 'file-marathon',
    label: 'Touch 5+ files in a single session',
    check: (s) => (s.uniqueFiles || 0) >= 5,
  },
  {
    id: 'night-owl',
    label: 'Work past local midnight',
    check: (s) => s.crossedLocalMidnight === true,
  },
];

export function getTodayQuest(date = new Date()) {
  return QUESTS[hashDate(date) % QUESTS.length];
}

export function checkQuest(signals, date = new Date()) {
  const quest = getTodayQuest(date);
  const completed = !!quest.check(signals || {});
  return { quest, completed, bonus: completed ? QUEST_BONUS_XP : 0 };
}
