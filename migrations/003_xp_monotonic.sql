-- ClaudeXP migration 003 — total_xp monotonic guard.
-- Run this in your Supabase SQL Editor after 002_loot_titles.sql.
-- Idempotent: re-running is safe.
--
-- Why: clients PATCH `total_xp` from their local SQLite. A client with stale
-- or partial local state (reinstall, second machine, lost ~/.claudexp) can
-- otherwise PATCH a value LOWER than what the cloud already shows, wiping
-- progress. Clients now reconcile before pushing (see hook.js + cloud claim),
-- but this trigger is the server-side backstop in case a client misbehaves.
--
-- Effect: any UPDATE that sets total_xp below the existing value is rejected.
-- Inserts and deletes are unaffected. Session count is also guarded.
--
-- Bypass: the service_role key bypasses triggers, so admin tooling can still
-- reset values when needed.

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

drop trigger if exists profiles_total_xp_monotonic on profiles;
create trigger profiles_total_xp_monotonic
  before update on profiles
  for each row
  execute function profiles_total_xp_monotonic();
