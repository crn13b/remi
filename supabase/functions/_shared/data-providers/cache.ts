import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AssetClass, Candle, Timeframe } from "../types.ts";

/** How long cached data is considered fresh, per timeframe (in milliseconds). */
const FRESHNESS_MS: Record<Timeframe, number> = {
  "15m": 15 * 60 * 1000,        // 15 minutes
  "1h": 60 * 60 * 1000,         // 1 hour
  "4h": 4 * 60 * 60 * 1000,     // 4 hours
  "1d": 24 * 60 * 60 * 1000,    // 24 hours
  "3d": 3 * 24 * 60 * 60 * 1000, // 3 days
  "1w": 7 * 24 * 60 * 60 * 1000, // 1 week
};

/** Create a Supabase client using service_role key (for server-side cache access). */
export function getSupabaseClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/**
 * Check the cache for existing candle data.
 * Returns cached candles if the most recent one is still fresh, otherwise null.
 */
export async function getCachedCandles(
  db: SupabaseClient,
  symbol: string,
  timeframe: Timeframe,
  limit: number,
): Promise<Candle[] | null> {
  const { data, error } = await db
    .from("market_data_cache")
    .select("open_time, open, high, low, close, volume")
    .eq("symbol", symbol.toUpperCase())
    .eq("timeframe", timeframe)
    .order("open_time", { ascending: false })
    .limit(limit);

  if (error || !data || data.length === 0) {
    return null;
  }

  // Check if the most recent candle is still fresh
  const newestCandleTime = new Date(data[0].open_time).getTime();
  const age = Date.now() - newestCandleTime;
  if (age > FRESHNESS_MS[timeframe] * 2) {
    // Data is stale — need a fresh fetch
    return null;
  }

  // Reverse to chronological order (oldest first)
  return data.reverse().map((row) => ({
    openTime: new Date(row.open_time).getTime(),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
  }));
}

/**
 * Save fetched candles to the cache.
 * Uses upsert to avoid duplicates (unique constraint on symbol + timeframe + open_time).
 */
export async function cacheCandles(
  db: SupabaseClient,
  symbol: string,
  assetClass: AssetClass,
  timeframe: Timeframe,
  source: string,
  candles: Candle[],
): Promise<void> {
  if (candles.length === 0) return;

  const rows = candles.map((c) => ({
    symbol: symbol.toUpperCase(),
    asset_class: assetClass,
    timeframe,
    open_time: new Date(c.openTime).toISOString(),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
    source,
    fetched_at: new Date().toISOString(),
  }));

  // Upsert in batches of 200 to stay within Supabase limits
  const BATCH_SIZE = 200;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await db
      .from("market_data_cache")
      .upsert(batch, { onConflict: "symbol,timeframe,open_time" });

    if (error) {
      console.error("Cache upsert error:", error.message);
    }
  }
}
