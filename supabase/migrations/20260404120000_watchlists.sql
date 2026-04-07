-- ═══════════════════════════════════════════════════════════
--  Watchlists — persisted user watchlists with assets
-- ═══════════════════════════════════════════════════════════

create table watchlists (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references profiles(id) on delete cascade,
    name text not null default 'My Watchlist',
    position int not null default 0,
    created_at timestamptz not null default now()
);

create index idx_watchlists_user on watchlists (user_id);

create table watchlist_assets (
    id uuid primary key default gen_random_uuid(),
    watchlist_id uuid not null references watchlists(id) on delete cascade,
    symbol text not null,
    name text not null,
    added_at timestamptz not null default now(),
    unique (watchlist_id, symbol)
);

create index idx_watchlist_assets_wl on watchlist_assets (watchlist_id);

-- ─── RLS ───

alter table watchlists enable row level security;
alter table watchlist_assets enable row level security;

create policy "Users can manage their own watchlists"
    on watchlists for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create policy "Users can manage assets in their own watchlists"
    on watchlist_assets for all
    using (watchlist_id in (select id from watchlists where user_id = auth.uid()))
    with check (watchlist_id in (select id from watchlists where user_id = auth.uid()));
