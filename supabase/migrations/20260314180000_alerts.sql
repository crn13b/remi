-- ═══════════════════════════════════════════════════════════
--  REMi Alerts System
--  Tables: alerts, alert_events, notification_preferences
-- ═══════════════════════════════════════════════════════════

-- ─── Custom Enum Types ───

create type alert_direction as enum ('long', 'short', 'both');
create type aggressiveness_level as enum ('chill', 'default', 'aggressive', 'relentless');
create type urgency_level as enum ('warning', 'high', 'critical');
create type alert_event_type as enum ('trigger', 'escalation', 'de_escalation', 'all_clear');

-- ─── Alerts Table ───
-- Stores user-configured asset watch alerts

create table alerts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references profiles(id) on delete cascade,
    symbol text not null,
    direction alert_direction not null default 'both',
    aggressiveness aggressiveness_level not null default 'default',
    is_active boolean not null default true,
    last_triggered_at timestamptz,
    last_score int,
    created_at timestamptz not null default now()
);

create index idx_alerts_active on alerts (is_active, symbol) where is_active = true;
create index idx_alerts_user on alerts (user_id);

-- ─── Alert Events Table ───
-- Stores every fired alert notification (the feed)

create table alert_events (
    id uuid primary key default gen_random_uuid(),
    alert_id uuid not null references alerts(id) on delete cascade,
    user_id uuid not null references profiles(id) on delete cascade,
    symbol text not null,
    score int not null,
    previous_score int not null,
    urgency urgency_level not null,
    event_type alert_event_type not null,
    direction alert_direction not null,
    message text not null,
    read boolean not null default false,
    dismissed boolean not null default false,
    triggered_at timestamptz not null default now()
);

create index idx_alert_events_user_unread on alert_events (user_id, read) where read = false;
create index idx_alert_events_user_time on alert_events (user_id, triggered_at desc);

-- ─── Notification Preferences Table ───

create table notification_preferences (
    user_id uuid primary key references profiles(id) on delete cascade,
    global_aggressiveness aggressiveness_level not null default 'default',
    email_enabled boolean not null default true,
    digest_enabled boolean not null default false,
    digest_time time not null default '08:00',
    timezone text not null default 'America/New_York'
);

-- ─── Row Level Security ───

alter table alerts enable row level security;
alter table alert_events enable row level security;
alter table notification_preferences enable row level security;

create policy "Users manage own alerts"
    on alerts for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "Users read own alert events"
    on alert_events for select
    using (auth.uid() = user_id);

create policy "Users insert own alert events"
    on alert_events for insert
    with check (auth.uid() = user_id);

create policy "Users update own alert events"
    on alert_events for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "Users manage own notification prefs"
    on notification_preferences for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
