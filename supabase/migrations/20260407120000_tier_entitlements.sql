-- NOTE: The per-tier application-level gating added in this migration and in
-- the edge entitlements module (supabase/functions/_shared/entitlements/)
-- operates WITHIN the absolute-limit DB triggers defined in
-- 20260406120000_security_hardening.sql:
--   * enforce_alert_limit      — hard ceiling of 50 alerts per user
--   * enforce_watchlist_limit  — hard ceiling of 10 watchlists per user
-- These triggers MUST remain in place as a sanity backstop and are
-- intentionally NOT dropped or modified here.

-- Tier entitlements: trial clock, watchlist freshness, lookup counter,
-- soft-disable columns. Idempotent via IF NOT EXISTS where possible.

-- 1. profiles: alert trial start timestamp
alter table public.profiles
  add column if not exists alert_trial_started_at timestamptz null;

-- 2. profiles: daily score lookup counter (fix #6 storage)
alter table public.profiles
  add column if not exists daily_score_lookups integer not null default 0;
alter table public.profiles
  add column if not exists daily_score_lookups_reset_at timestamptz
    not null default date_trunc('day', now() at time zone 'UTC');

-- 3. watchlist_assets: cached score + freshness + soft-disable (fix #3)
alter table public.watchlist_assets
  add column if not exists last_refreshed_at timestamptz null;
alter table public.watchlist_assets
  add column if not exists cached_score integer null;
alter table public.watchlist_assets
  add column if not exists is_active boolean not null default true;

create index if not exists watchlist_assets_active_idx
  on public.watchlist_assets (watchlist_id) where is_active = true;

-- 4. Trigger: set alert_trial_started_at on first alert insert per user
create or replace function public.set_alert_trial_started_at()
returns trigger
language plpgsql
as $$
begin
  update public.profiles
    set alert_trial_started_at = now()
    where id = new.user_id
      and alert_trial_started_at is null;
  return new;
end;
$$;

drop trigger if exists trg_set_alert_trial_started_at on public.alerts;
create trigger trg_set_alert_trial_started_at
  before insert on public.alerts
  for each row
  execute function public.set_alert_trial_started_at();
