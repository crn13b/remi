-- ═══════════════════════════════════════════════════════════
--  Alert Notifications: user_connections + schema updates
-- ═══════════════════════════════════════════════════════════

-- ─── New Table: user_connections ───

create table user_connections (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references profiles(id) on delete cascade,
    provider text not null check (provider in ('discord', 'telegram', 'email')),
    access_token text,
    refresh_token text,
    provider_user_id text,
    provider_username text,
    expires_at timestamptz,
    status text not null default 'active' check (status in ('active', 'needs_reauth')),
    connected_at timestamptz not null default now(),
    unique (user_id, provider)
);

create index idx_user_connections_user on user_connections (user_id);

alter table user_connections enable row level security;

create policy "Users manage own connections"
    on user_connections for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "Service role full access on connections"
    on user_connections for all
    using (auth.role() = 'service_role');

-- ─── Alter: notification_preferences ───

alter table notification_preferences
    add column discord_enabled boolean not null default false,
    add column telegram_enabled boolean not null default false;

-- ─── Alter: alerts ───

alter table alerts
    add column last_notified_at timestamptz;

-- ─── Service role policies for edge function access ───

create policy "Service role full access on alerts"
    on alerts for all
    using (auth.role() = 'service_role');

create policy "Service role full access on alert_events"
    on alert_events for all
    using (auth.role() = 'service_role');

create policy "Service role full access on notification_preferences"
    on notification_preferences for all
    using (auth.role() = 'service_role');
