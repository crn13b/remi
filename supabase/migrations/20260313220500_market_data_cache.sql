-- ─── market data cache ────────────────────────────────────────────────────────
-- Stores OHLCV candles fetched from external APIs (Binance, Twelve Data, GeckoTerminal).
-- Prevents redundant API calls when multiple users request the same symbol/timeframe.

create table public.market_data_cache (
    id          bigint generated always as identity primary key,
    symbol      text not null,          -- e.g. 'BTC', 'AAPL', 'GOLD'
    asset_class text not null,          -- 'crypto', 'stock', 'commodity', 'dex'
    timeframe   text not null,          -- '15m', '1h', '4h', '1d', '3d', '1w'
    open_time   timestamptz not null,
    open        numeric not null,
    high        numeric not null,
    low         numeric not null,
    close       numeric not null,
    volume      numeric not null,
    source      text not null,          -- 'binance', 'twelvedata', 'geckoterminal'
    fetched_at  timestamptz not null default now(),
    unique(symbol, timeframe, open_time)
);

create index idx_mdc_lookup on public.market_data_cache(symbol, timeframe, open_time desc);

-- No RLS — this table is only accessed by Edge Functions via service_role key.
-- End users never query this table directly.
