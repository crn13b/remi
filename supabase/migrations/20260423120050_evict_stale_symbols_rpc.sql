-- supabase/migrations/20260423120050_evict_stale_symbols_rpc.sql
-- ════════════════════════════════════════════════════════════════════
-- RPC used by evict-stale-symbols Edge Function. Returns count of
-- rows deleted. SECURITY DEFINER so the service-role caller can execute
-- it; the function itself only touches server-controlled tables.
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
        where wa.symbol = t.symbol
          and wa.is_active = true
      )
    returning 1
  )
  select count(*) into evicted_count from deleted;
  return evicted_count;
end;
$$;

-- Only service_role can call this
revoke all on function public.evict_stale_tracked_symbols() from public, authenticated, anon;
grant execute on function public.evict_stale_tracked_symbols() to service_role;
