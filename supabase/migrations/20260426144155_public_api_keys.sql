-- supabase/migrations/20260426144155_public_api_keys.sql
-- ════════════════════════════════════════════════════════════════════
-- Public API keys + rate-limit counters
-- ════════════════════════════════════════════════════════════════════
-- Backs the public-api-score edge function. Reads/writes only by service_role
-- (Edge Functions). Authenticated/anon clients have no direct access.

-- ─── api_keys ──────────────────────────────────────────────────────
create table if not exists public.api_keys (
  id                  uuid primary key default gen_random_uuid(),
  key_hash            text not null unique,
  label               text not null,
  rate_limit_per_min  integer not null default 60,
  created_at          timestamptz not null default now(),
  -- Updated out-of-band by the public-api-score Edge Function via a
  -- fire-and-forget UPDATE after a successful request. This migration
  -- only declares the column; it is intentionally not maintained here.
  last_used_at        timestamptz null,
  revoked_at          timestamptz null,

  constraint api_keys_rate_limit_range check (rate_limit_per_min between 1 and 6000),
  constraint api_keys_key_hash_format check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint api_keys_label_length check (char_length(label) between 1 and 200)
);

create index if not exists api_keys_key_hash_idx
  on public.api_keys (key_hash)
  where revoked_at is null;

-- ─── api_key_rate_limits ──────────────────────────────────────────
create table if not exists public.api_key_rate_limits (
  api_key_id    uuid primary key references public.api_keys(id) on delete cascade,
  window_start  timestamptz not null,
  request_count integer not null default 0
);

-- ─── RLS — server-only access ─────────────────────────────────────
alter table public.api_keys enable row level security;
alter table public.api_key_rate_limits enable row level security;

revoke all on public.api_keys from authenticated, anon;
revoke all on public.api_key_rate_limits from authenticated, anon;

-- ─── consume_api_request RPC ──────────────────────────────────────
-- Atomic per-minute counter. Returns true if the request is allowed,
-- false if it would exceed p_limit_per_min. Edge Function calls this
-- BEFORE doing the cache read; on false it returns 429 immediately.
--
-- Window semantics: this is a fixed window (not a sliding window). A
-- caller can therefore burst up to 2 * p_limit_per_min requests across
-- the boundary between two adjacent windows (limit at the end of one
-- window, limit again at the start of the next). Accepted as a v1
-- tradeoff for simplicity; revisit if abuse patterns emerge.
create or replace function public.consume_api_request(
  p_key_id uuid,
  p_limit_per_min int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now   timestamptz := now();
  v_count int;
begin
  insert into public.api_key_rate_limits (api_key_id, window_start, request_count)
  values (p_key_id, v_now, 1)
  on conflict (api_key_id) do update
    set
      window_start = case
        when public.api_key_rate_limits.window_start < v_now - interval '1 minute'
          then v_now
        else public.api_key_rate_limits.window_start
      end,
      request_count = case
        when public.api_key_rate_limits.window_start < v_now - interval '1 minute'
          then 1
        else public.api_key_rate_limits.request_count + 1
      end
  returning request_count into v_count;

  return v_count <= p_limit_per_min;
end;
$$;

-- Lock down execution: only service_role may call this. Without this revoke,
-- PostgREST exposes the RPC to authenticated users via the auto-generated
-- REST surface, letting an attacker burn another customer's rate budget.
revoke all on function public.consume_api_request(uuid, int) from public, anon, authenticated;
grant execute on function public.consume_api_request(uuid, int) to service_role;
