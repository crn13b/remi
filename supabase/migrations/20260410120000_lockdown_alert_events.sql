-- supabase/migrations/20260410120000_lockdown_alert_events.sql
-- ════════════════════════════════════════════════════════════
--  Lockdown RLS — alert_events
-- ════════════════════════════════════════════════════════════
-- After this migration, INSERTs and DELETEs to alert_events must go through
-- edge functions running as service_role.
-- Direct PostgREST inserts from authenticated clients will be rejected.
--
-- UPDATEs are restricted to only the `read` and `dismissed` columns via
-- column-level GRANT, so the frontend can still mark events as read/dismissed
-- without an edge function round-trip. Other columns (score, message, etc.)
-- are no longer client-mutable.

-- ─── alert_events ──────────────────────────────────────────

-- Block direct inserts and deletes from client
revoke insert, delete on public.alert_events from authenticated, anon;

-- Revoke blanket UPDATE, then grant only on read/dismissed columns
revoke update on public.alert_events from authenticated, anon;
grant update (read, dismissed) on public.alert_events to authenticated;

-- Drop the old permissive insert policy (no longer needed)
drop policy if exists "Users insert own alert events" on public.alert_events;

-- Replace the old broad update policy with one scoped to own rows
drop policy if exists "Users update own alert events" on public.alert_events;
create policy alert_events_update_own on public.alert_events
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- "Users read own alert events" (SELECT) — kept as-is
-- "Service role full access on alert_events" (ALL) — kept as-is
