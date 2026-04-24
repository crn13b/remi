-- supabase/migrations/20260423120100_refresh_cron_schedule.sql
-- ════════════════════════════════════════════════════════════════════
-- Schedule pg_cron jobs for refresh-global-scores (1 min) and
-- evict-stale-symbols (1 hour).
--
-- Secrets and base URL are read from Supabase Vault. Two secrets must
-- exist in vault.decrypted_secrets before this migration runs:
--
--   * 'cron_secret'   — shared with CRON_SECRET env var on Edge Functions
--   * 'functions_url' — 'https://<project-ref>.supabase.co/functions/v1'
--
-- These are referenced via a lookup function so pg_cron's scheduled SQL
-- can fetch them without the scheduled job hard-coding secret values.
-- ════════════════════════════════════════════════════════════════════

-- Ensure required extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ─── Helper: read a secret from Vault, returning null if missing ─────
-- SECURITY DEFINER so the job runner can fetch secrets without a
-- direct grant on the vault schema. Scoped to service_role only.
create or replace function public.get_vault_secret(p_name text)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$$;

revoke all on function public.get_vault_secret(text) from public, authenticated, anon;
grant execute on function public.get_vault_secret(text) to service_role, postgres;

-- ─── Unschedule prior jobs (idempotent re-runs) ──────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'refresh-global-scores') then
    perform cron.unschedule('refresh-global-scores');
  end if;
  if exists (select 1 from cron.job where jobname = 'evict-stale-symbols') then
    perform cron.unschedule('evict-stale-symbols');
  end if;
end
$$;

-- ─── Refresh: every minute ───────────────────────────────────────────
select cron.schedule(
  'refresh-global-scores',
  '* * * * *',
  $job$
    select net.http_post(
      url := public.get_vault_secret('functions_url') || '/refresh-global-scores',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', public.get_vault_secret('cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 45000
    );
  $job$
);

-- ─── Eviction: hourly at :15 ─────────────────────────────────────────
select cron.schedule(
  'evict-stale-symbols',
  '15 * * * *',
  $job$
    select net.http_post(
      url := public.get_vault_secret('functions_url') || '/evict-stale-symbols',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', public.get_vault_secret('cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);
