-- ClaudeXP community leaderboard schema (v3 — owner-token + anti-abuse).
-- Paste into your Supabase project's SQL Editor and run.
--
-- Design:
--   - Anyone (anon) can read the leaderboard.
--   - Anyone can claim an unused username and write their owner_token.
--   - Updates/deletes require the caller to send the stored owner_token as
--     the `x-claudexp-owner-token` request header. Only the owner's client has it.
--   - The owner_token column is not readable by anon (column-level grant),
--     so friends/strangers can't scrape tokens to hijack profiles.
--   - Per-IP insert rate limit (10 claims / hour) stops mass-squatting.
--   - Username/owner-token format constraints + XP caps stop garbage writes.

drop trigger if exists profiles_insert_rate_limit on profiles;
drop trigger if exists profiles_xp_delta_cap      on profiles;
drop table   if exists profiles           cascade;
drop table   if exists insert_rate_limit  cascade;

create table profiles (
  username         text primary key,
  owner_token      text        not null,
  total_xp         integer     not null default 0,
  level            integer     not null default 1,
  session_count    integer     not null default 0,
  active_title     text,
  title_expires_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint profiles_username_format
    check (username ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{1,23}$'),
  constraint profiles_owner_token_length
    check (length(owner_token) between 16 and 128),
  constraint profiles_total_xp_ceiling
    check (total_xp between 0 and 10000000),
  constraint profiles_active_title_length
    check (active_title is null or length(active_title) between 1 and 64)
);

create index profiles_total_xp_idx on profiles (total_xp desc);

alter table profiles enable row level security;

-- Column-level grants: anon CANNOT read owner_token, CANNOT change username
-- or owner_token after insert.
revoke all on profiles from anon;
grant select (username, total_xp, level, session_count, created_at, updated_at, active_title, title_expires_at)
  on profiles to anon;
grant insert (username, owner_token, total_xp, level, session_count)
  on profiles to anon;
grant update (total_xp, level, session_count, updated_at, active_title, title_expires_at)
  on profiles to anon;
grant delete on profiles to anon;

-- Same for authenticated (in case Supabase adds auth later).
grant select (username, total_xp, level, session_count, created_at, updated_at, active_title, title_expires_at)
  on profiles to authenticated;
grant insert (username, owner_token, total_xp, level, session_count)
  on profiles to authenticated;
grant update (total_xp, level, session_count, updated_at, active_title, title_expires_at)
  on profiles to authenticated;
grant delete on profiles to authenticated;

-- Everyone can read.
create policy profiles_read_all on profiles
  for select
  using (true);

-- Everyone can insert a new row (PK conflict prevents stealing a taken name).
create policy profiles_insert_all on profiles
  for insert
  with check (true);

-- Updates require x-claudexp-owner-token header to match stored owner_token.
create policy profiles_update_own on profiles
  for update
  using (
    owner_token = (current_setting('request.headers', true)::json ->> 'x-claudexp-owner-token')
  );

-- Deletes likewise require the owner token.
create policy profiles_delete_own on profiles
  for delete
  using (
    owner_token = (current_setting('request.headers', true)::json ->> 'x-claudexp-owner-token')
  );

-- =========================================================================
-- Anti-abuse: XP delta cap on updates.
-- =========================================================================
-- No single PATCH may increase total_xp by more than 5000. Real sessions
-- cap out well under 1000 XP, so this leaves comfortable headroom while
-- stopping anyone with their own owner token from inflating to the ceiling
-- in one shot.

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

create trigger profiles_xp_delta_cap
  before update on profiles
  for each row
  execute function enforce_xp_delta();

-- =========================================================================
-- Anti-clobber: total_xp / session_count are monotonic.
-- =========================================================================
-- A PATCH that lowers total_xp or session_count is rejected. Backstop for
-- the multi-machine / reinstall case where a stale local DB tries to
-- overwrite the cloud truth. service_role bypasses this for admin resets.

create or replace function profiles_total_xp_monotonic()
returns trigger
language plpgsql
as $$
begin
  if new.total_xp < old.total_xp then
    raise exception 'total_xp cannot decrease (was %, attempted %)',
      old.total_xp, new.total_xp
      using errcode = 'check_violation';
  end if;
  if new.session_count < old.session_count then
    raise exception 'session_count cannot decrease (was %, attempted %)',
      old.session_count, new.session_count
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger profiles_total_xp_monotonic
  before update on profiles
  for each row
  execute function profiles_total_xp_monotonic();

-- =========================================================================
-- Anti-abuse: per-IP insert rate limit.
-- =========================================================================
-- Tracks username claims per IP in a private table that anon cannot touch.
-- Trigger runs SECURITY DEFINER so the function can write to the tracker
-- even though the caller has no grants on it.

create table insert_rate_limit (
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

create trigger profiles_insert_rate_limit
  before insert on profiles
  for each row
  execute function enforce_insert_rate_limit();
