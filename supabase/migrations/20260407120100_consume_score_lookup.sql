-- Atomic UTC-midnight reset + decrement + cap check in one statement.
-- Returns true when the lookup is allowed and the counter has been
-- consumed; false when the daily cap is reached.

create or replace function public.consume_score_lookup(uid uuid, cap int default 5)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count int;
  reset_at timestamptz;
  utc_today timestamptz := date_trunc('day', now() at time zone 'UTC');
begin
  select daily_score_lookups, daily_score_lookups_reset_at
    into current_count, reset_at
    from public.profiles
    where id = uid
    for update;

  if not found then
    return false;
  end if;

  if reset_at < utc_today then
    update public.profiles
      set daily_score_lookups = 1,
          daily_score_lookups_reset_at = utc_today
      where id = uid;
    return true;
  end if;

  if current_count >= cap then
    return false;
  end if;

  update public.profiles
    set daily_score_lookups = daily_score_lookups + 1
    where id = uid;
  return true;
end;
$$;

revoke all on function public.consume_score_lookup(uuid, int) from public;
grant execute on function public.consume_score_lookup(uuid, int) to authenticated, service_role;
