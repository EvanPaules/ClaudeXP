-- ClaudeXP migration 002 — loot title decorations on leaderboard.
-- Run this in your Supabase SQL Editor after 001_rate_limit.sql.
-- Idempotent: re-running is safe.
--
-- Adds:
--   1. profiles.active_title       (text, nullable, length <= 64)
--   2. profiles.title_expires_at   (timestamptz, nullable)
--   3. Extends anon/authenticated grants so clients can read + update them.

-- =========================================================================
-- 1. Columns
-- =========================================================================

alter table profiles
  add column if not exists active_title     text,
  add column if not exists title_expires_at timestamptz;

alter table profiles
  drop constraint if exists profiles_active_title_length;
alter table profiles
  add  constraint profiles_active_title_length
  check (active_title is null or length(active_title) between 1 and 64);

-- =========================================================================
-- 2. Column-level grants — anon/authenticated can read and update titles.
-- =========================================================================
-- The original 001 grants did not include these columns; grant is additive.

grant select (active_title, title_expires_at)
  on profiles to anon, authenticated;

grant update (active_title, title_expires_at)
  on profiles to anon, authenticated;
