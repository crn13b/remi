-- ═══════════════════════════════════════════════════════════
--  Security hardening — 2026-04-06 audit fixes
-- ═══════════════════════════════════════════════════════════

-- 1. Enable RLS on market_data_cache (was exposed to anon inserts)
alter table public.market_data_cache enable row level security;

-- Block anon/authenticated from all access — only service_role bypasses RLS
-- (No policies needed: RLS enabled + no permissive policies = deny all for non-service_role)

-- 2. Cap alerts per user at 50 via a trigger
create or replace function check_alert_limit()
returns trigger as $$
begin
    -- Lock existing rows for this user to prevent TOCTOU race under concurrent inserts
    perform 1 from alerts where user_id = NEW.user_id for update;
    if (select count(*) from alerts where user_id = NEW.user_id) >= 50 then
        raise exception 'Alert limit reached (max 50 per user)';
    end if;
    return NEW;
end;
$$ language plpgsql;

create trigger enforce_alert_limit
    before insert on alerts
    for each row
    execute function check_alert_limit();

-- 3. Cap watchlists per user at 10 via a trigger
create or replace function check_watchlist_limit()
returns trigger as $$
begin
    -- Lock existing rows for this user to prevent TOCTOU race under concurrent inserts
    perform 1 from watchlists where user_id = NEW.user_id for update;
    if (select count(*) from watchlists where user_id = NEW.user_id) >= 10 then
        raise exception 'Watchlist limit reached (max 10 per user)';
    end if;
    return NEW;
end;
$$ language plpgsql;

create trigger enforce_watchlist_limit
    before insert on watchlists
    for each row
    execute function check_watchlist_limit();

-- 4. Add oauth_states table for proper CSRF tokens
create table oauth_states (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references profiles(id) on delete cascade,
    state text not null unique,
    provider text not null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '10 minutes')
);

create index idx_oauth_states_state on oauth_states (state);
create index idx_oauth_states_cleanup on oauth_states (expires_at);

alter table oauth_states enable row level security;
-- No policies — only accessed by edge functions via service_role
