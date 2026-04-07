import { FetchResult, Timeframe } from "../types.ts";
import { fetchBinanceCandles, isBinanceSymbol } from "./binance.ts";
import { fetchTwelveDataCandles } from "./twelvedata.ts";
import { fetchGeckoTerminalCandles, isGeckoTerminalToken } from "./geckoterminal.ts";
import { cacheCandles, getCachedCandles, getSupabaseClient } from "./cache.ts";

/**
 * Known major crypto symbols that exist on Binance.
 * Anything not in this list and not a DEX token goes to Twelve Data.
 */
const CRYPTO_SYMBOLS = new Set([
  "BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "DOT", "AVAX", "LINK",
  "MATIC", "ATOM", "UNI", "LTC", "BCH", "NEAR", "APT", "ARB", "OP",
  "SUI", "SEI", "INJ", "TIA", "FET", "RENDER", "BNB", "PEPE", "SHIB",
  "WIF", "BONK",
]);

/**
 * Unified entry point: fetch OHLCV candles for any asset type.
 *
 * Routing logic:
 * 1. If the symbol contains ":" (e.g. "WIF:SOL" or "solana:0x...") → GeckoTerminal
 * 2. If the symbol is a known crypto (BTC, ETH, etc.) → Binance
 * 3. Everything else (AAPL, GOLD, TSLA, etc.) → Twelve Data
 *
 * Checks cache first. Saves to cache after fetching.
 */
export async function fetchCandles(
  symbol: string,
  timeframe: Timeframe,
  limit: number,
): Promise<FetchResult> {
  const upperSymbol = symbol.toUpperCase();
  const db = getSupabaseClient();

  // --- Check cache first ---
  const cached = await getCachedCandles(db, upperSymbol, timeframe, limit);
  if (cached && cached.length >= limit * 0.8) {
    // Cache hit — determine source from asset classification
    const assetClass = classifyAsset(symbol);
    const source = assetClass === "crypto" ? "binance" : assetClass === "dex" ? "geckoterminal" : "twelvedata";
    return { candles: cached, source, assetClass, cached: true };
  }

  // --- Route to the right provider ---
  let result: FetchResult;

  if (isGeckoTerminalToken(symbol)) {
    // DEX token — use GeckoTerminal
    const candles = await fetchGeckoTerminalCandles(symbol, timeframe, limit);
    result = { candles, source: "geckoterminal", assetClass: "dex", cached: false };
  } else if (CRYPTO_SYMBOLS.has(upperSymbol) || isBinanceSymbol(upperSymbol)) {
    // Major crypto — use Binance
    const candles = await fetchBinanceCandles(upperSymbol, timeframe, limit);
    result = { candles, source: "binance", assetClass: "crypto", cached: false };
  } else {
    // Stocks, ETFs, commodities, forex — use Twelve Data
    const assetClass = isMetalOrCommodity(upperSymbol) ? "commodity" : "stock";
    const candles = await fetchTwelveDataCandles(upperSymbol, timeframe, limit);
    result = { candles, source: "twelvedata", assetClass, cached: false };
  }

  // --- Save to cache ---
  await cacheCandles(db, upperSymbol, result.assetClass, timeframe, result.source, result.candles);

  return result;
}

/** Classify what type of asset a symbol is. */
function classifyAsset(symbol: string): "crypto" | "dex" | "stock" | "commodity" {
  if (isGeckoTerminalToken(symbol)) return "dex";
  if (CRYPTO_SYMBOLS.has(symbol.toUpperCase())) return "crypto";
  if (isMetalOrCommodity(symbol.toUpperCase())) return "commodity";
  return "stock";
}

/** Simple check for common commodity symbols. */
function isMetalOrCommodity(symbol: string): boolean {
  const COMMODITIES = new Set([
    "GOLD", "XAU", "XAUUSD",
    "SILVER", "XAG", "XAGUSD",
    "PLATINUM", "XPT",
    "PALLADIUM", "XPD",
    "OIL", "CRUDE", "WTI", "BRENT",
    "NATGAS", "NG",
  ]);
  return COMMODITIES.has(symbol);
}

export { getSupabaseClient } from "./cache.ts";
