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
  -- Updated by consume_api_request() in the same transaction as the
  -- rate-limit decision (single round-trip from the Edge Function).
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
-- Atomic rate-limit decision. Returns a row with:
--   allowed              — true if the request fits inside the budget
--   rate_limit_per_min   — the key's configured limit (for response headers)
--   retry_after_seconds  — approximate seconds remaining in the current window
--
-- The RPC owns key lookup (so callers cannot pass a stale or wrong limit)
-- and updates `last_used_at` in the same round-trip. The Edge Function
-- calls this BEFORE the cache read; on allowed=false it returns 429.
--
-- Window semantics: 60s rolling window keyed off the first request's
-- timestamp (window_start). Once 60s elapse since window_start, the next
-- request resets the window and counts as 1. This is NOT a sliding
-- window — bursts at a window boundary are possible.
--
-- KNOWN LIMITATION (boundary race): each transaction sees its own now()
-- (transaction start time). At the boundary between two windows, two
-- concurrent transactions can each carry their own now() — one started
-- just before the boundary, the other just after. The earlier transaction
-- may resume after the later one has already reset window_start, and
-- increment the new window's count by 1. This admits at most one
-- over-limit request per concurrent transaction at the boundary, bounded
-- by parallelism. For MVP usage with a small number of customer keys
-- this is acceptable. A stricter limiter (sliding window or token bucket)
-- is a future change.
drop function if exists public.consume_api_request(uuid, int);

create or replace function public.consume_api_request(p_key_id uuid)
  returns table (allowed boolean, rate_limit_per_min int, retry_after_seconds int)
  language plpgsql
  security definer
  set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_key     record;
  v_count   int;
  v_window  timestamptz;
begin
  -- Look up the key. Avoids trusting caller-supplied limit.
  select id, rate_limit_per_min into v_key
    from public.api_keys
    where id = p_key_id and revoked_at is null;

  if v_key.id is null then
    allowed := false;
    rate_limit_per_min := 0;
    retry_after_seconds := 0;
    return next;
    return;
  end if;

  -- Update last_used_at in-band with the limiter (saves a separate
  -- UPDATE round-trip from the Edge Function).
  update public.api_keys set last_used_at = now() where id = v_key.id;

  -- Atomic counter upsert. now() returns transaction start time and is
  -- the same value throughout this statement, so the case branches see
  -- a consistent timestamp for the window comparison.
  insert into public.api_key_rate_limits (api_key_id, window_start, request_count)
  values (v_key.id, now(), 1)
  on conflict (api_key_id) do update
    set
      window_start = case
        when public.api_key_rate_limits.window_start < now() - interval '1 minute'
          then now()
        else public.api_key_rate_limits.window_start
      end,
      request_count = case
        when public.api_key_rate_limits.window_start < now() - interval '1 minute'
          then 1
        else public.api_key_rate_limits.request_count + 1
      end
  returning request_count, window_start into v_count, v_window;

  allowed := v_count <= v_key.rate_limit_per_min;
  rate_limit_per_min := v_key.rate_limit_per_min;
  -- Approximate Retry-After: time remaining in the current 60s window.
  -- 60s ceiling is a safe overestimate; clients can retry sooner if
  -- they track the window themselves.
  retry_after_seconds := greatest(0, 60 - extract(epoch from (now() - v_window))::int);
  return next;
end;
$$;

-- Lock down execution: only service_role may call this. Without this revoke,
-- PostgREST exposes the RPC to authenticated users via the auto-generated
-- REST surface, letting an attacker burn another customer's rate budget.
revoke all on function public.consume_api_request(uuid) from public, anon, authenticated;
grant execute on function public.consume_api_request(uuid) to service_role;
