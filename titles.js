export const TITLES = [
  'Coffee-Fueled',
  'Tab Master',
  'Regex Wizard',
  'One-Shot',
  'Merge Monster',
  'Stack Overflow Survivor',
  'Git Whisperer',
  'Null Pointer Prevention Specialist',
  'Rubber Duck Debugger',
  'Semicolon Enjoyer',
];

export const DROP_RATE = 0.02;
export const TITLE_DURATION_MS = 24 * 60 * 60 * 1000;

export function rollTitle({ rng = Math.random, now = Date.now } = {}) {
  if (rng() >= DROP_RATE) return null;
  const idx = Math.floor(rng() * TITLES.length) % TITLES.length;
  const title = TITLES[idx];
  const expiresAt = new Date(now() + TITLE_DURATION_MS).toISOString();
  return { title, expiresAt };
}

export function isActiveTitle(title, expiresAt, now = Date.now()) {
  if (!title || !expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return false;
  return t > now;
}

export function formatExpiry(expiresAt, now = Date.now()) {
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t) || t <= now) return 'expired';
  const mins = Math.round((t - now) / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h`;
}

export function truncateTitle(title, max = 22) {
  if (!title) return '';
  return title.length > max ? title.slice(0, max - 1) + '…' : title;
}
