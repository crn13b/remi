/**
 * Classify a symbol by which upstream provider will serve it. Used by the
 * refresh cron to partition the per-tick budget (8 stocks + 12 crypto).
 *
 * Keep the CRYPTO_SYMBOLS list in sync with
 * supabase/functions/_shared/data-providers/index.ts. We deliberately
 * duplicate to avoid importing the full router (and its side-effects)
 * into a pure classifier.
 */

export type ProviderClass = "stock" | "crypto";

const CRYPTO_SYMBOLS = new Set([
  "BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "DOT", "AVAX", "LINK",
  "MATIC", "ATOM", "UNI", "LTC", "BCH", "NEAR", "APT", "ARB", "OP",
  "SUI", "SEI", "INJ", "TIA", "FET", "RENDER", "BNB", "PEPE", "SHIB",
  "WIF", "BONK",
]);

export function classifyProvider(symbol: string): ProviderClass {
  if (symbol.includes(":")) return "crypto";        // DEX token
  if (CRYPTO_SYMBOLS.has(symbol.toUpperCase())) return "crypto";
  return "stock";
}
