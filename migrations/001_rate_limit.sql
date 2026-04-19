-- ClaudeXP migration 001 — anti-abuse hardening.
-- Run this in your Supabase SQL Editor once.
-- Idempotent: re-running is safe.
--
-- Adds:
--   1. Username format constraint (2-24 chars, [a-zA-Z0-9_-], must start alphanumeric)
--   2. Owner-token length bounds (16-128 chars)
--   3. Absolute total_xp ceiling (10M) + per-update delta cap (5000)
--   4. Per-IP insert rate limit (10 claims / hour / IP) via trigger

-- =========================================================================
-- 1. Username format + owner-token bounds
-- =========================================================================

alter table profiles
  drop constraint if exists profiles_username_format;
alter table profiles
  add  constraint profiles_username_format
  check (username ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{1,23}$');

alter table profiles
  drop constraint if exists profiles_owner_token_length;
alter table profiles
  add  constraint profiles_owner_token_length
  check (length(owner_token) between 16 and 128);

-- =========================================================================
-- 2. XP bounds (absolute + per-update delta)
-- =========================================================================

alter table profiles
  drop constraint if exists profiles_total_xp_ceiling;
alter table profiles
  add  constraint profiles_total_xp_ceiling
  check (total_xp between 0 and 10000000);

create or replace function enforce_xp_delta()
returns trigger
language plpgsql
as $$
declare
  v_max_session_xp integer := 5000;
begin
  if new.total_xp >= old.total_xp
     and new.total_xp - old.total_xp > v_max_session_xp then
    raise exception
      'XP increment exceeds per-session cap (got %, max %)',
      new.total_xp - old.total_xp, v_max_session_xp
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_xp_delta_cap on profiles;
create trigger profiles_xp_delta_cap
  before update on profiles
  for each row
  execute function enforce_xp_delta();

-- =========================================================================
-- 3. Per-IP insert rate limit
-- =========================================================================
--
-- Tracking table lives outside anon's grants. The trigger function is
-- SECURITY DEFINER so it can write to the tracker even though anon can't.

create table if not exists insert_rate_limit (
  ip            text primary key,
  count         integer     not null default 0,
  window_start  timestamptz not null default now()
);

revoke all on insert_rate_limit from anon, authenticated, public;

create or replace function enforce_insert_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_headers json;
  v_ip      text;
  v_row     insert_rate_limit%rowtype;
  v_max     integer  := 10;
  v_window  interval := interval '1 hour';
begin
  -- Read request headers if available. PostgREST exposes them via GUC.
  begin
    v_headers := current_setting('request.headers', true)::json;
  exception when others then
    v_headers := null;
  end;

  v_ip := coalesce(
    nullif(split_part(v_headers ->> 'x-forwarded-for', ',', 1), ''),
    v_headers ->> 'cf-connecting-ip',
    v_headers ->> 'x-real-ip',
    'unknown'
  );

  insert into insert_rate_limit as r (ip, count, window_start)
  values (v_ip, 1, now())
  on conflict (ip) do update
  set count        = case when r.window_start < now() - v_window then 1
                          else r.count + 1 end,
      window_start = case when r.window_start < now() - v_window then now()
                          else r.window_start end
  returning * into v_row;

  if v_row.count > v_max then
    raise exception
      'Rate limit: too many username claims from this network. Try again in about an hour.'
      using errcode = '53300';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_insert_rate_limit on profiles;
create trigger profiles_insert_rate_limit
  before insert on profiles
  for each row
  execute function enforce_insert_rate_limit();

-- =========================================================================
-- 4. (Optional) Sweep stale rate-limit rows. Safe to run ad-hoc.
-- =========================================================================
-- delete from insert_rate_limit where window_start < now() - interval '1 day';
