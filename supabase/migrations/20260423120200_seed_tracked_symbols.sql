-- supabase/migrations/20260423120200_seed_tracked_symbols.sql
-- ════════════════════════════════════════════════════════════════════
-- One-shot seed: populate tracked_symbols from every symbol currently on
-- an active watchlist_asset. Idempotent via ON CONFLICT DO NOTHING — safe
-- to re-run.
--
-- Stock symbols get refresh_interval_sec=1800 (30 min) per spec cost control;
-- crypto gets the default 900 (15 min). The CRYPTO_SYMBOLS list mirrors
-- supabase/functions/_shared/score-refresh/provider-routing.ts — keep them
-- in sync if you add symbols there.
--
-- next_refresh_at is staggered: now() + random(0, 60s) so the post-deploy
-- burst is spread across the first minute instead of synchronous.
-- ════════════════════════════════════════════════════════════════════

insert into public.tracked_symbols (
  symbol, first_seen_at, last_viewed_at, next_refresh_at, refresh_interval_sec
)
select
  upper(wa.symbol) as symbol,
  now() as first_seen_at,
  now() as last_viewed_at,
  now() + (random() * interval '60 seconds') as next_refresh_at,
  case
    when upper(wa.symbol) in (
      'BTC','ETH','SOL','XRP','ADA','DOGE','DOT','AVAX','LINK',
      'MATIC','ATOM','UNI','LTC','BCH','NEAR','APT','ARB','OP',
      'SUI','SEI','INJ','TIA','FET','RENDER','BNB','PEPE','SHIB',
      'WIF','BONK'
    ) or upper(wa.symbol) like '%:%'
      then 900   -- 15 min (crypto)
    else 1800    -- 30 min (stock)
  end as refresh_interval_sec
from public.watchlist_assets wa
where wa.is_active = true
on conflict (symbol) do nothing;
