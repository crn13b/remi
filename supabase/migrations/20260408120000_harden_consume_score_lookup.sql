-- Harden consume_score_lookup against cross-user quota DoS and cap bypass.
--
-- The previous version accepted caller-supplied `uid` and `cap` and was
-- granted to `authenticated`, which allowed any authenticated user to:
--   1. Increment another user's daily counter (quota DoS).
--   2. Pass an arbitrary large `cap` to bypass their own daily limit.
--
-- Replacement:
--   * Drops both parameters.
--   * Derives the caller's uid from auth.uid().
--   * Derives the cap from profiles.plan via a hardcoded tier map that
--     matches the edge entitlements module (free: 5, core/pro/founder: NULL).
--   * Returns false for owners/NULL-cap users (unlimited) — the caller
--     should skip the RPC entirely when limit is NULL. Owners must not
--     consume at all.
--   * Grants execute only to service_role (called via edge function).
--
-- Callers must update to the new signature: `consume_score_lookup()`.

drop function if exists public.consume_score_lookup(uuid, int);

create or replace function public.consume_score_lookup()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  current_count int;
  reset_at timestamptz;
  caller_plan text;
  caller_cap int;
  utc_today timestamptz := date_trunc('day', now() at time zone 'UTC');
begin
  if caller_id is null then
    return false;
  end if;

  select plan, daily_score_lookups, daily_score_lookups_reset_at
    into caller_plan, current_count, reset_at
    from public.profiles
    where id = caller_id
    for update;

  if not found then
    return false;
  end if;

  -- Derive cap from plan. NULL means unlimited; callers should skip the
  -- RPC in that case, but if they do call it we allow it without
  -- incrementing (unlimited users do not consume the counter).
  caller_cap := case caller_plan
    when 'free' then 5
    when 'core' then null
    when 'pro' then null
    when 'founder' then null
    else 5
  end;

  if caller_cap is null then
    return true;
  end if;

  if reset_at < utc_today then
    update public.profiles
      set daily_score_lookups = 1,
          daily_score_lookups_reset_at = utc_today
      where id = caller_id;
    return true;
  end if;

  if current_count >= caller_cap then
    return false;
  end if;

  update public.profiles
    set daily_score_lookups = current_count + 1
    where id = caller_id;
  return true;
end;
$$;

-- Grant execute to `authenticated`: score-api calls this via the anon client
-- with the user's JWT forwarded, so PostgREST runs it as the `authenticated`
-- role and auth.uid() resolves correctly. SECURITY DEFINER ensures the
-- function body can still write to profiles despite the Phase 2 lockdown.
revoke all on function public.consume_score_lookup() from public;
grant execute on function public.consume_score_lookup() to authenticated, service_role;
