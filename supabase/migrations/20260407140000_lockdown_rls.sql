-- supabase/migrations/20260407140000_lockdown_rls.sql
-- ════════════════════════════════════════════════════════════
--  Lockdown RLS — make the DB the security boundary
-- ════════════════════════════════════════════════════════════
-- After this migration, all writes to alerts/watchlists/watchlist_assets/
-- notification_preferences/user_connections must go through edge functions
-- running as service_role.
-- Direct PostgREST writes from authenticated clients will be rejected.
--
-- The 50-alert and 10-watchlist DB triggers (from 20260406120000_security_hardening.sql)
-- still apply as absolute backstops because triggers fire regardless of RLS.

-- ─── alerts ─────────────────────────────────────────────────
revoke insert, update, delete on public.alerts from authenticated, anon;

drop policy if exists alerts_select_own on public.alerts;
create policy alerts_select_own on public.alerts
  for select to authenticated
  using (user_id = auth.uid());

-- ─── watchlists ─────────────────────────────────────────────
revoke insert, update, delete on public.watchlists from authenticated, anon;

drop policy if exists watchlists_select_own on public.watchlists;
create policy watchlists_select_own on public.watchlists
  for select to authenticated
  using (user_id = auth.uid());

-- ─── watchlist_assets ───────────────────────────────────────
revoke insert, update, delete on public.watchlist_assets from authenticated, anon;

drop policy if exists watchlist_assets_select_own on public.watchlist_assets;
create policy watchlist_assets_select_own on public.watchlist_assets
  for select to authenticated
  using (
    exists (
      select 1 from public.watchlists w
      where w.id = watchlist_assets.watchlist_id
        and w.user_id = auth.uid()
    )
  );

-- ─── notification_preferences ───────────────────────────────
revoke insert, update, delete on public.notification_preferences from authenticated, anon;

drop policy if exists notification_preferences_select_own on public.notification_preferences;
create policy notification_preferences_select_own on public.notification_preferences
  for select to authenticated
  using (user_id = auth.uid());

-- ─── user_connections ───────────────────────────────────────
revoke insert, update, delete on public.user_connections from authenticated, anon;

drop policy if exists user_connections_select_own on public.user_connections;
create policy user_connections_select_own on public.user_connections
  for select to authenticated
  using (user_id = auth.uid());
