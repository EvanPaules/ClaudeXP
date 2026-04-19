// Cloud sync against Supabase PostgREST.
// Ownership model: each client owns a username by knowing its owner_token.
// The hook sends the token as `x-claudexp-owner-token` on updates; RLS checks it.

import { resolveCloudConfig, hasCloudConfig as _hasCloudConfig } from './config.js';

const DEFAULT_TIMEOUT_MS = 3000;
export const hasCloudConfig = _hasCloudConfig;

function authHeaders(cfg) {
  return {
    'apikey': cfg.key,
    'Authorization': `Bearer ${cfg.key}`,
  };
}

async function withTimeout(fn, ms = DEFAULT_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await fn(ctrl.signal); }
  finally { clearTimeout(timer); }
}

function disabled() { return { ok: false, reason: 'cloud not configured' }; }

async function errFromRes(res) {
  const text = await res.text().catch(() => '');
  return `HTTP ${res.status}${text ? ': ' + text.slice(0, 240) : ''}`;
}

function abortReason(err) {
  return err?.name === 'AbortError' ? 'timeout' : (err?.message || String(err));
}

export async function checkUsernameAvailable(username, { timeoutMs = 5000 } = {}) {
  const cfg = resolveCloudConfig();
  if (!cfg.url || !cfg.key) return disabled();

  const url = `${cfg.url}/rest/v1/profiles?select=username&username=eq.${encodeURIComponent(username)}`;
  try {
    const res = await withTimeout((signal) => fetch(url, { headers: authHeaders(cfg), signal }), timeoutMs);
    if (!res.ok) return { ok: false, reason: await errFromRes(res) };
    const rows = await res.json();
    return { ok: true, available: rows.length === 0 };
  } catch (err) {
    return { ok: false, reason: abortReason(err) };
  }
}

export async function claimUsername({ username, ownerToken, totalXP = 0, level = 1, sessionCount = 0 }, { timeoutMs = 10000 } = {}) {
  const cfg = resolveCloudConfig();
  if (!cfg.url || !cfg.key) return disabled();

  const url = `${cfg.url}/rest/v1/profiles`;
  const body = JSON.stringify([{
    username,
    owner_token: ownerToken,
    total_xp: totalXP,
    level,
    session_count: sessionCount,
  }]);

  try {
    const res = await withTimeout((signal) => fetch(url, {
      method: 'POST',
      headers: {
        ...authHeaders(cfg),
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body,
      signal,
    }), timeoutMs);
    if (res.status === 409) return { ok: false, reason: 'username already claimed', taken: true };
    if (!res.ok) return { ok: false, reason: await errFromRes(res) };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: abortReason(err) };
  }
}

export async function updateProfile(
  { username, ownerToken, totalXP, level, sessionCount, activeTitle = null, titleExpiresAt = null },
  { timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) {
  const cfg = resolveCloudConfig();
  if (!cfg.url || !cfg.key) return disabled();
  if (!ownerToken) return { ok: false, reason: 'no owner token — run: claudexp cloud claim' };

  const url = `${cfg.url}/rest/v1/profiles?username=eq.${encodeURIComponent(username)}`;
  const body = JSON.stringify({
    total_xp: totalXP,
    level,
    session_count: sessionCount,
    active_title: activeTitle,
    title_expires_at: titleExpiresAt,
    updated_at: new Date().toISOString(),
  });

  try {
    const res = await withTimeout((signal) => fetch(url, {
      method: 'PATCH',
      headers: {
        ...authHeaders(cfg),
        'Content-Type': 'application/json',
        'x-claudexp-owner-token': ownerToken,
        'Prefer': 'return=minimal',
      },
      body,
      signal,
    }), timeoutMs);
    if (!res.ok) return { ok: false, reason: await errFromRes(res) };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: abortReason(err) };
  }
}

export async function deleteProfile({ username, ownerToken }, { timeoutMs = 10000 } = {}) {
  const cfg = resolveCloudConfig();
  if (!cfg.url || !cfg.key) return disabled();
  if (!ownerToken) return { ok: false, reason: 'no owner token' };

  const url = `${cfg.url}/rest/v1/profiles?username=eq.${encodeURIComponent(username)}`;
  try {
    const res = await withTimeout((signal) => fetch(url, {
      method: 'DELETE',
      headers: {
        ...authHeaders(cfg),
        'x-claudexp-owner-token': ownerToken,
        'Prefer': 'return=minimal',
      },
      signal,
    }), timeoutMs);
    if (!res.ok) return { ok: false, reason: await errFromRes(res) };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: abortReason(err) };
  }
}

export async function fetchLeaderboard(limit = 50, { timeoutMs = 5000 } = {}) {
  const cfg = resolveCloudConfig();
  if (!cfg.url || !cfg.key) return { ok: false, reason: 'cloud not configured', rows: [] };

  const url = `${cfg.url}/rest/v1/profiles?select=username,total_xp,level,session_count,updated_at,active_title,title_expires_at&order=total_xp.desc&limit=${limit}`;
  try {
    const res = await withTimeout((signal) => fetch(url, { headers: authHeaders(cfg), signal }), timeoutMs);
    if (!res.ok) return { ok: false, reason: await errFromRes(res), rows: [] };
    return { ok: true, rows: await res.json() };
  } catch (err) {
    return { ok: false, reason: abortReason(err), rows: [] };
  }
}

export async function testConnection({ timeoutMs = 5000 } = {}) {
  const cfg = resolveCloudConfig();
  if (!cfg.url || !cfg.key) return { ok: false, reason: 'not configured' };

  const url = `${cfg.url}/rest/v1/profiles?select=username&limit=1`;
  try {
    const res = await withTimeout((signal) => fetch(url, { headers: authHeaders(cfg), signal }), timeoutMs);
    if (!res.ok) return { ok: false, reason: await errFromRes(res) };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: abortReason(err) };
  }
}
