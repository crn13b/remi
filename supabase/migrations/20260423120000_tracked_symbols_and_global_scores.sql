-- supabase/migrations/20260423120000_tracked_symbols_and_global_scores.sql
-- ════════════════════════════════════════════════════════════════════
-- Global Symbol Score Cache — tables, indexes, and RLS lockdown
-- ════════════════════════════════════════════════════════════════════
-- Shared across all users. Reads/writes only via Edge Functions running
-- as service_role. Authenticated/anon clients have NO direct access.

-- ─── tracked_symbols ────────────────────────────────────────────────
create table if not exists public.tracked_symbols (
  symbol                     text primary key,
  first_seen_at              timestamptz not null default now(),
  last_viewed_at             timestamptz not null default now(),
  view_count                 integer not null default 0,
  next_refresh_at            timestamptz not null,
  refresh_interval_sec       integer not null default 900,
  consecutive_failure_count  integer not null default 0,
  last_refresh_error         text null,
  last_successful_refresh_at timestamptz null
);

-- Only index "healthy" rows. Rows that have failed 10+ times in a row
-- don't need fast lookup; the cron still scans them but via seq scan
-- which is fine at that low cardinality.
create index if not exists tracked_symbols_next_refresh_idx
  on public.tracked_symbols (next_refresh_at)
  where consecutive_failure_count < 10;

-- ─── global_symbol_scores ───────────────────────────────────────────
create table if not exists public.global_symbol_scores (
  symbol       text primary key references public.tracked_symbols(symbol) on delete cascade,
  score        integer not null,
  sentiment    text not null,
  price        text not null,
  price_raw    numeric not null,
  change       text not null,
  change_raw   numeric not null,
  name         text not null,
  computed_at  timestamptz not null default now()
);

create index if not exists global_symbol_scores_computed_at_idx
  on public.global_symbol_scores (computed_at);

-- ─── RLS — locked down, server-only access ──────────────────────────
alter table public.tracked_symbols enable row level security;
alter table public.global_symbol_scores enable row level security;

-- Revoke all direct client access. Edge Functions use service_role, which
-- bypasses RLS. No SELECT policies means authenticated/anon see nothing.
revoke all on public.tracked_symbols from authenticated, anon;
revoke all on public.global_symbol_scores from authenticated, anon;
