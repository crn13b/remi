-- supabase/migrations/20260423120300_record_symbol_views_rpc.sql
-- ════════════════════════════════════════════════════════════════════
-- RPC for score-api to bump last_viewed_at + view_count in one round-trip.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.record_symbol_views(p_symbols text[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.tracked_symbols
  set
    last_viewed_at = now(),
    view_count = view_count + 1
  where symbol = any(p_symbols);
$$;

revoke all on function public.record_symbol_views(text[]) from public, authenticated, anon;
grant execute on function public.record_symbol_views(text[]) to service_role;
