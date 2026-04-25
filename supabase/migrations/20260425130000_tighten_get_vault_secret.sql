-- supabase/migrations/20260425130000_tighten_get_vault_secret.sql
-- ════════════════════════════════════════════════════════════════════
-- Codex review follow-up: narrow get_vault_secret grants.
--
-- The original migration (20260423120100) granted EXECUTE on
-- public.get_vault_secret to service_role to make it usable from any
-- service-role-backed Edge Function. That's broader than necessary —
-- the only legitimate caller is pg_cron (running as `postgres`), and
-- the function is a generic "read any Vault secret by name" primitive.
-- Allowing arbitrary service-role contexts to read any Vault secret is
-- an unnecessary blast-radius expansion.
--
-- Fix: revoke from service_role, keep postgres-only.
-- ════════════════════════════════════════════════════════════════════

revoke execute on function public.get_vault_secret(text) from service_role;

-- Make sure postgres still has it (idempotent — was already granted).
grant execute on function public.get_vault_secret(text) to postgres;
