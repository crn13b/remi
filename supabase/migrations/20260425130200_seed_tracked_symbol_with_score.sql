-- supabase/migrations/20260425130200_seed_tracked_symbol_with_score.sql
-- ════════════════════════════════════════════════════════════════════
-- Codex review follow-up #1: atomic cache-miss seeding.
--
-- score-api's cache-miss path needs to write two rows together
-- (tracked_symbols then global_symbol_scores) for a brand-new symbol.
-- The previous implementation called .upsert() twice in sequence and
-- ignored the error result on each — if the first succeeded but the
-- second failed (or vice versa), the user still got their fresh score
-- back as "success" while the cache row was missing, so the symbol
-- never entered the refresh cron's selection set.
--
-- This RPC bundles both writes into one transactional unit, returning
-- void on success and raising on failure so the calling Edge Function
-- can react. The PL/pgSQL function automatically rolls back if either
-- statement raises, so the FK chain (tracked_symbols → global_symbol_scores)
-- can never get half-applied.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.seed_tracked_symbol_with_score(
  p_symbol         text,
  p_score          integer,
  p_sentiment      text,
  p_price          text,
  p_price_raw      numeric,
  p_change         text,
  p_change_raw     numeric,
  p_name           text,
  p_interval_sec   integer,
  p_jitter_sec     integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  -- Parent row first (FK target). ON CONFLICT DO NOTHING so we don't
  -- clobber existing scheduling state for symbols already tracked
  -- (view_count, next_refresh_at, etc. — that's record_symbol_views'
  -- and the cron's job).
  insert into public.tracked_symbols (
    symbol,
    next_refresh_at,
    refresh_interval_sec,
    last_successful_refresh_at
  ) values (
    p_symbol,
    v_now + make_interval(secs => p_interval_sec + p_jitter_sec),
    p_interval_sec,
    v_now
  )
  on conflict (symbol) do nothing;

  -- Child row. ON CONFLICT we DO update because a fresh compute is
  -- always more authoritative than a stale cache entry.
  insert into public.global_symbol_scores (
    symbol, score, sentiment, price, price_raw, change, change_raw, name, computed_at
  ) values (
    p_symbol, p_score, p_sentiment, p_price, p_price_raw, p_change, p_change_raw, p_name, v_now
  )
  on conflict (symbol) do update set
    score       = excluded.score,
    sentiment   = excluded.sentiment,
    price       = excluded.price,
    price_raw   = excluded.price_raw,
    change      = excluded.change,
    change_raw  = excluded.change_raw,
    name        = excluded.name,
    computed_at = excluded.computed_at;
end;
$$;

revoke all on function public.seed_tracked_symbol_with_score(
  text, integer, text, text, numeric, text, numeric, text, integer, integer
) from public, authenticated, anon;

grant execute on function public.seed_tracked_symbol_with_score(
  text, integer, text, text, numeric, text, numeric, text, integer, integer
) to service_role;
