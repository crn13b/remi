import { Candle, Timeframe } from "../types.ts";

/**
 * Map our timeframe codes to GeckoTerminal OHLCV timeframe strings.
 * GeckoTerminal supports: day, hour, minute
 * With aggregate parameter for multiples (e.g., 4h = hour with aggregate=4).
 */
interface GeckoTimeframe {
  timeframe: "day" | "hour" | "minute";
  aggregate: number;
}

const TIMEFRAME_MAP: Record<Timeframe, GeckoTimeframe> = {
  "15m": { timeframe: "minute", aggregate: 15 },
  "1h": { timeframe: "hour", aggregate: 1 },
  "4h": { timeframe: "hour", aggregate: 4 },
  "1d": { timeframe: "day", aggregate: 1 },
  "3d": { timeframe: "day", aggregate: 1 }, // Fetch daily, aggregate ourselves
  "1w": { timeframe: "day", aggregate: 1 }, // Fetch daily, aggregate ourselves
};

/**
 * GeckoTerminal requires a network + pool address to fetch OHLCV data.
 * This maps token identifiers to their most liquid pool.
 *
 * Format: "network:pool_address"
 *
 * To find a token's pool address:
 * 1. Go to geckoterminal.com and search for the token
 * 2. The URL will show the network and pool address
 * 3. Add it to this map
 *
 * This is a starter set — expand as needed.
 */
const TOKEN_POOL_MAP: Record<string, string> = {
  // Solana meme coins
  "WIF:SOL": "solana:EP2ib6dYdEeqD8MfE2ezHCxX3kP3K2eLKkirfPm5eyMx",
  "BONK:SOL": "solana:BjZKz1z4UMjGPqnMBuQnCjjL7gBNi1ycCnKVyMEYfFMq",
  // Ethereum tokens
  "PEPE:ETH": "eth:0xa43fe16908251ee70ef74718545e4fe6c5ccec9f",
  // Add more as needed...
};

/**
 * Fetch OHLCV candles from GeckoTerminal API.
 * Covers DEX tokens across 1800+ DEXes and 260+ networks.
 *
 * No API key required — completely free (10 requests/min).
 *
 * @param tokenId - Either a key from TOKEN_POOL_MAP (e.g. "WIF:SOL")
 *                  or a raw "network:pool_address" string
 */
export async function fetchGeckoTerminalCandles(
  tokenId: string,
  timeframe: Timeframe,
  limit: number,
): Promise<Candle[]> {
  // Resolve token ID to network + pool address
  const poolKey = TOKEN_POOL_MAP[tokenId.toUpperCase()] ?? tokenId;
  const colonIdx = poolKey.indexOf(":");
  if (colonIdx === -1) {
    throw new Error(
      `Invalid GeckoTerminal token ID: "${tokenId}". ` +
        `Expected format "network:pool_address" (e.g. "solana:EP2ib6...") ` +
        `or a known alias from TOKEN_POOL_MAP.`,
    );
  }

  const network = poolKey.slice(0, colonIdx);
  const poolAddress = poolKey.slice(colonIdx + 1);

  const geckoTf = TIMEFRAME_MAP[timeframe];
  if (!geckoTf) {
    throw new Error(`Unsupported timeframe for GeckoTerminal: ${timeframe}`);
  }

  // For 3d/1w, fetch enough daily candles to aggregate
  const multiplier = timeframe === "3d" ? 3 : timeframe === "1w" ? 7 : 1;
  const fetchLimit = Math.min(limit * multiplier, 1000);

  const url =
    `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${poolAddress}/ohlcv/${geckoTf.timeframe}` +
    `?aggregate=${geckoTf.aggregate}&limit=${fetchLimit}&currency=usd`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GeckoTerminal API error (${res.status}): ${body}`);
  }

  const json = await res.json();
  const ohlcvList = json?.data?.attributes?.ohlcv_list;

  if (!Array.isArray(ohlcvList) || ohlcvList.length === 0) {
    throw new Error(
      `GeckoTerminal returned no OHLCV data for ${tokenId} on ${network}`,
    );
  }

  // GeckoTerminal OHLCV format: [timestamp_unix, open, high, low, close, volume]
  // Returned newest-first — reverse for chronological order
  let candles: Candle[] = ohlcvList
    .reverse()
    .map((k: number[]) => ({
      openTime: k[0] * 1000, // Convert seconds to milliseconds
      open: k[1],
      high: k[2],
      low: k[3],
      close: k[4],
      volume: k[5],
    }));

  // Aggregate daily candles into 3d or 1w if needed
  if (timeframe === "3d" || timeframe === "1w") {
    candles = aggregateCandles(candles, multiplier);
  }

  return candles.slice(-limit);
}

/** Aggregate N consecutive candles into one. */
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

/** Check if a token ID is a GeckoTerminal-style identifier. */
export function isGeckoTerminalToken(tokenId: string): boolean {
  // Known aliases or raw "network:address" format
  return (
    tokenId.toUpperCase() in TOKEN_POOL_MAP || /^[a-z]+:0x[a-fA-F0-9]+/.test(tokenId) ||
    /^[a-z]+:[A-Za-z0-9]+/.test(tokenId)
  );
}
