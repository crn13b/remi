import { Candle, Timeframe } from "../types.ts";

/**
 * Map our timeframe codes to Twelve Data interval strings.
 * Twelve Data supports: 1min, 5min, 15min, 30min, 45min, 1h, 2h, 4h, 1day, 1week, 1month
 */
const TIMEFRAME_MAP: Record<Timeframe, string> = {
  "15m": "15min",
  "1h": "1h",
  "4h": "4h",
  "1d": "1day",
  "3d": "1day", // Twelve Data doesn't have 3d — we fetch daily and aggregate
  "1w": "1week",
};

/**
 * Fetch OHLCV candles from Twelve Data REST API.
 * Covers stocks, ETFs, forex, and commodities (gold, silver, oil, etc.).
 *
 * Requires TWELVE_DATA_API_KEY environment variable.
 */
export async function fetchTwelveDataCandles(
  symbol: string,
  timeframe: Timeframe,
  limit: number,
): Promise<Candle[]> {
  const apiKey = Deno.env.get("TWELVE_DATA_API_KEY");
  if (!apiKey) {
    throw new Error(
      "TWELVE_DATA_API_KEY environment variable is not set. " +
        "Sign up for a free key at https://twelvedata.com and set it in Supabase Edge Function env vars.",
    );
  }

  const interval = TIMEFRAME_MAP[timeframe];
  if (!interval) {
    throw new Error(`Unsupported timeframe for Twelve Data: ${timeframe}`);
  }

  // For 3d timeframe, fetch 3x the daily candles so we can aggregate them
  const fetchLimit = timeframe === "3d" ? limit * 3 : limit;

  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", symbol.toUpperCase());
  url.searchParams.set("interval", interval);
  url.searchParams.set("outputsize", String(Math.min(fetchLimit, 5000)));
  url.searchParams.set("apikey", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Twelve Data API error (${res.status}): ${body}`);
  }

  const data = await res.json();

  if (data.status === "error") {
    throw new Error(`Twelve Data error: ${data.message}`);
  }

  if (!data.values || !Array.isArray(data.values)) {
    throw new Error(`Twelve Data returned no data for symbol: ${symbol}`);
  }

  // Twelve Data returns newest first — reverse to get chronological order
  const values: TwelveDataValue[] = data.values.reverse();

  let candles: Candle[] = values.map((v) => ({
    openTime: new Date(v.datetime).getTime(),
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: parseFloat(v.volume),
  }));

  // Aggregate daily candles into 3-day candles if needed
  if (timeframe === "3d") {
    candles = aggregateCandles(candles, 3);
  }

  return candles.slice(-limit);
}

/** Aggregate N consecutive candles into one (for building 3d candles from daily). */
function aggregateCandles(candles: Candle[], period: number): Candle[] {
  const result: Candle[] = [];
  for (let i = 0; i <= candles.length - period; i += period) {
    const chunk = candles.slice(i, i + period);
    result.push({
      openTime: chunk[0].openTime,
      open: chunk[0].open,
      high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((sum, c) => sum + c.volume, 0),
    });
  }
  return result;
}

interface TwelveDataValue {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}
