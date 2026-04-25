/**
 * Provider classification + refresh-interval policy for the global score
 * cache. Single source of truth — every code path that classifies a symbol
 * or picks a refresh cadence imports from here.
 *
 * Why pure-and-self-contained: data-providers/index.ts is the runtime
 * router (with network side-effects). Importing it here would pull
 * fetchBinanceCandles / fetchTwelveDataCandles into anything that just
 * wants to know "is this symbol stock or crypto?" Keep the classifier
 * pure so it stays testable and free of side-effects.
 *
 * The KNOWN_CRYPTO_SYMBOLS list MUST stay in sync with
 * supabase/functions/_shared/data-providers/binance.ts SYMBOL_MAP.
 * If you add a symbol there, add it here too. The Deno test suite
 * could enforce this with a parity check in the future.
 */

export type ProviderClass = "stock" | "crypto";

// Keep in lock-step with binance.ts SYMBOL_MAP keys.
export const KNOWN_CRYPTO_SYMBOLS: ReadonlySet<string> = new Set([
  "BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "DOT", "AVAX", "LINK",
  "MATIC", "ATOM", "UNI", "LTC", "BCH", "NEAR", "APT", "ARB", "OP",
  "SUI", "SEI", "INJ", "TIA", "FET", "RENDER", "BNB", "PEPE", "SHIB",
  "WIF", "BONK",
]);

const CRYPTO_REFRESH_SEC = 900;   // 15 min  — free providers, can poll often
const STOCK_REFRESH_SEC = 1800;   // 30 min  — Twelve Data quota cap

export function classifyProvider(symbol: string): ProviderClass {
  if (symbol.includes(":")) return "crypto";        // DEX token (GeckoTerminal)
  if (KNOWN_CRYPTO_SYMBOLS.has(symbol.toUpperCase())) return "crypto";
  return "stock";
}

/**
 * Default refresh cadence for a symbol's tracked_symbols row when seeded.
 * Crypto = 15 min (free providers, real-time feel).
 * Stock  = 30 min (Twelve Data Grow plan budget).
 */
export function defaultRefreshIntervalSec(symbol: string): number {
  return classifyProvider(symbol) === "crypto" ? CRYPTO_REFRESH_SEC : STOCK_REFRESH_SEC;
}
