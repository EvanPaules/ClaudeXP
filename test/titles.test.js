import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TITLES,
  DROP_RATE,
  TITLE_DURATION_MS,
  rollTitle,
  isActiveTitle,
  formatExpiry,
  truncateTitle,
} from '../titles.js';

test('TITLES pool is non-empty and all entries are strings', () => {
  assert.ok(TITLES.length >= 1, 'at least one title');
  for (const t of TITLES) assert.equal(typeof t, 'string');
});

test('rollTitle returns null when rng is above drop rate', () => {
  const result = rollTitle({ rng: () => DROP_RATE + 0.0001, now: () => 0 });
  assert.equal(result, null);
});

test('rollTitle returns a valid title when rng is below drop rate', () => {
  const now = 1_700_000_000_000;
  const result = rollTitle({ rng: () => 0, now: () => now });
  assert.ok(result, 'should produce a drop');
  assert.ok(TITLES.includes(result.title), 'title from pool');
  const expiry = Date.parse(result.expiresAt);
  assert.equal(expiry, now + TITLE_DURATION_MS);
});

test('rollTitle indexes deterministically based on second rng call', () => {
  // First rng() is the drop check, second is the index pick.
  const calls = [0, 0]; // drop (< DROP_RATE) + index 0
  let i = 0;
  const result = rollTitle({ rng: () => calls[i++], now: () => 0 });
  assert.equal(result.title, TITLES[0]);
});

test('isActiveTitle returns false when either field is missing', () => {
  assert.equal(isActiveTitle(null, new Date().toISOString()), false);
  assert.equal(isActiveTitle('Test', null), false);
  assert.equal(isActiveTitle(null, null), false);
});

test('isActiveTitle returns false when expiry is in the past', () => {
  const past = new Date(Date.now() - 1000).toISOString();
  assert.equal(isActiveTitle('Coffee-Fueled', past), false);
});

test('isActiveTitle returns true when expiry is in the future', () => {
  const future = new Date(Date.now() + 10_000).toISOString();
  assert.equal(isActiveTitle('Coffee-Fueled', future), true);
});

test('isActiveTitle returns false for unparseable dates', () => {
  assert.equal(isActiveTitle('Coffee-Fueled', 'not-a-date'), false);
});

test('formatExpiry returns minutes when under an hour', () => {
  const now = Date.now();
  const in30m = new Date(now + 30 * 60 * 1000).toISOString();
  assert.equal(formatExpiry(in30m, now), '30m');
});

test('formatExpiry returns hours when an hour or more', () => {
  const now = Date.now();
  const in5h = new Date(now + 5 * 60 * 60 * 1000).toISOString();
  assert.equal(formatExpiry(in5h, now), '5h');
});

test('formatExpiry returns "expired" for past dates', () => {
  const now = Date.now();
  const past = new Date(now - 1000).toISOString();
  assert.equal(formatExpiry(past, now), 'expired');
});

test('formatExpiry returns "expired" for unparseable input', () => {
  assert.equal(formatExpiry('nonsense', Date.now()), 'expired');
});

test('truncateTitle leaves short titles untouched', () => {
  assert.equal(truncateTitle('Coffee-Fueled'), 'Coffee-Fueled');
});

test('truncateTitle truncates long titles with ellipsis', () => {
  const longTitle = 'Null Pointer Prevention Specialist';
  const result = truncateTitle(longTitle, 22);
  assert.equal(result.length, 22);
  assert.ok(result.endsWith('…'), 'should end with ellipsis');
});

test('truncateTitle handles empty input', () => {
  assert.equal(truncateTitle(''), '');
  assert.equal(truncateTitle(null), '');
  assert.equal(truncateTitle(undefined), '');
});
