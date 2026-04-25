-- supabase/migrations/20260425130100_evict_check_parent_watchlist.sql
-- ════════════════════════════════════════════════════════════════════
-- Codex review follow-up: eviction must respect parent watchlist state.
--
-- The original RPC (20260423120050) only checked watchlist_assets.is_active.
-- Tier reconciliation in supabase/functions/_shared/entitlements/reconcile.ts
-- soft-disables WHOLE watchlists (sets watchlists.is_active = false) but
-- leaves child watchlist_assets rows untouched (still is_active = true).
--
-- Without this fix, symbols on a downgraded user's now-inactive watchlist
-- would pin forever — defeating the cost-control goal of eviction.
--
-- Replace the RPC body to require BOTH the parent watchlist AND the
-- watchlist_asset to be active before considering a symbol "pinned".
-- ════════════════════════════════════════════════════════════════════

create or replace function public.evict_stale_tracked_symbols()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  evicted_count integer;
begin
  with deleted as (
    delete from public.tracked_symbols t
    where t.last_viewed_at < now() - interval '3 days'
      and not exists (
        select 1
        from public.watchlist_assets wa
        join public.watchlists w on w.id = wa.watchlist_id
        where wa.symbol = t.symbol
          and wa.is_active = true
          and w.is_active = true
      )
    returning 1
  )
  select count(*) into evicted_count from deleted;
  return evicted_count;
end;
$$;

-- Grants are unchanged from the original migration; CREATE OR REPLACE
-- preserves them. Re-stating defensively in case Postgres ever drops
-- ACLs on body changes (it doesn't, but cheap insurance).
revoke all on function public.evict_stale_tracked_symbols() from public, authenticated, anon;
grant execute on function public.evict_stale_tracked_symbols() to service_role;
