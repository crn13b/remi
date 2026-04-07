/**
 * Unified asset catalog for search autocomplete.
 * Used by both the main search bar and watchlist search.
 */

export interface CatalogEntry {
  symbol: string;
  name: string;
  category: "crypto" | "stock" | "metal" | "index" | "dex";
  /** For DEX tokens: "network:poolAddress" used by GeckoTerminal */
  poolKey?: string;
}

export const ASSET_CATALOG: CatalogEntry[] = [
  // ─── Crypto (Binance-supported, live scoring available) ───
  { symbol: "BTC", name: "Bitcoin", category: "crypto" },
  { symbol: "ETH", name: "Ethereum", category: "crypto" },
  { symbol: "SOL", name: "Solana", category: "crypto" },
  { symbol: "XRP", name: "Ripple", category: "crypto" },
  { symbol: "ADA", name: "Cardano", category: "crypto" },
  { symbol: "DOGE", name: "Dogecoin", category: "crypto" },
  { symbol: "AVAX", name: "Avalanche", category: "crypto" },
  { symbol: "LINK", name: "Chainlink", category: "crypto" },
  { symbol: "DOT", name: "Polkadot", category: "crypto" },
  { symbol: "MATIC", name: "Polygon", category: "crypto" },
  { symbol: "UNI", name: "Uniswap", category: "crypto" },
  { symbol: "BNB", name: "BNB", category: "crypto" },
  { symbol: "PEPE", name: "Pepe", category: "crypto" },
  { symbol: "SHIB", name: "Shiba Inu", category: "crypto" },
  { symbol: "APT", name: "Aptos", category: "crypto" },
  { symbol: "ARB", name: "Arbitrum", category: "crypto" },
  { symbol: "OP", name: "Optimism", category: "crypto" },
  { symbol: "SUI", name: "Sui", category: "crypto" },
  { symbol: "LTC", name: "Litecoin", category: "crypto" },
  { symbol: "BCH", name: "Bitcoin Cash", category: "crypto" },
  { symbol: "NEAR", name: "NEAR Protocol", category: "crypto" },
  { symbol: "INJ", name: "Injective", category: "crypto" },
  { symbol: "TIA", name: "Celestia", category: "crypto" },
  { symbol: "FET", name: "Fetch.ai", category: "crypto" },
  { symbol: "RENDER", name: "Render", category: "crypto" },
  { symbol: "SEI", name: "Sei", category: "crypto" },
  { symbol: "WIF", name: "dogwifhat", category: "crypto" },
  { symbol: "BONK", name: "Bonk", category: "crypto" },
  { symbol: "ATOM", name: "Cosmos", category: "crypto" },

  // ─── Stocks ───
  { symbol: "AAPL", name: "Apple", category: "stock" },
  { symbol: "MSFT", name: "Microsoft", category: "stock" },
  { symbol: "GOOGL", name: "Alphabet", category: "stock" },
  { symbol: "AMZN", name: "Amazon", category: "stock" },
  { symbol: "NVDA", name: "NVIDIA", category: "stock" },
  { symbol: "TSLA", name: "Tesla", category: "stock" },
  { symbol: "META", name: "Meta Platforms", category: "stock" },
  { symbol: "AMD", name: "AMD", category: "stock" },
  { symbol: "NFLX", name: "Netflix", category: "stock" },
  { symbol: "DIS", name: "Disney", category: "stock" },
  { symbol: "JPM", name: "JPMorgan Chase", category: "stock" },
  { symbol: "V", name: "Visa", category: "stock" },
  { symbol: "MA", name: "Mastercard", category: "stock" },
  { symbol: "COIN", name: "Coinbase", category: "stock" },
  { symbol: "MSTR", name: "MicroStrategy", category: "stock" },
  { symbol: "PLTR", name: "Palantir", category: "stock" },
  { symbol: "CRM", name: "Salesforce", category: "stock" },
  { symbol: "INTC", name: "Intel", category: "stock" },
  { symbol: "BA", name: "Boeing", category: "stock" },
  { symbol: "UBER", name: "Uber", category: "stock" },

  // ─── Metals & Commodities ───
  { symbol: "GOLD", name: "Gold", category: "metal" },
  { symbol: "SILVER", name: "Silver", category: "metal" },
  { symbol: "PLATINUM", name: "Platinum", category: "metal" },

  // ─── Indices ───
  { symbol: "SPY", name: "S&P 500 ETF", category: "index" },
  { symbol: "QQQ", name: "Nasdaq 100 ETF", category: "index" },
  { symbol: "DIA", name: "Dow Jones ETF", category: "index" },
];

/**
 * Search the catalog by query string.
 * Matches against symbol and name, prioritizing symbol-starts-with matches.
 */
export function searchCatalog(query: string, limit = 6): CatalogEntry[] {
  if (!query.trim()) return [];
  const q = query.trim().toLowerCase();

  const results: { entry: CatalogEntry; rank: number }[] = [];

  for (const entry of ASSET_CATALOG) {
    const sym = entry.symbol.toLowerCase();
    const name = entry.name.toLowerCase();

    if (sym === q) {
      results.push({ entry, rank: 0 }); // exact symbol match
    } else if (sym.startsWith(q)) {
      results.push({ entry, rank: 1 }); // symbol prefix
    } else if (name.toLowerCase() === q) {
      results.push({ entry, rank: 2 }); // exact name match
    } else if (name.startsWith(q)) {
      results.push({ entry, rank: 3 }); // name prefix
    } else if (sym.includes(q) || name.includes(q)) {
      results.push({ entry, rank: 4 }); // substring
    }
  }

  results.sort((a, b) => a.rank - b.rank);
  return results.slice(0, limit).map((r) => r.entry);
}

// ─── Binance Dynamic Search ─────────────────────────────────────
// Fetches all USDT trading pairs from Binance and caches them.
// Allows search to find ANY Binance-listed crypto, not just our static list.

let binanceSymbolCache: CatalogEntry[] | null = null;
let binanceFetchPromise: Promise<CatalogEntry[]> | null = null;

async function loadBinanceSymbols(): Promise<CatalogEntry[]> {
  if (binanceSymbolCache) return binanceSymbolCache;
  if (binanceFetchPromise) return binanceFetchPromise;

  binanceFetchPromise = (async () => {
    try {
      const res = await fetch("https://api.binance.us/api/v3/exchangeInfo");
      if (!res.ok) return [];

      const data = await res.json();
      const staticSymbols = new Set(
        ASSET_CATALOG.filter((a) => a.category === "crypto").map((a) => a.symbol)
      );

      const entries: CatalogEntry[] = [];
      for (const s of data.symbols) {
        if (s.quoteAsset !== "USDT" || s.status !== "TRADING") continue;
        const base = s.baseAsset.toUpperCase();
        if (staticSymbols.has(base)) continue; // already in static catalog
        entries.push({
          symbol: base,
          name: base, // Binance doesn't provide friendly names in exchangeInfo
          category: "crypto",
        });
      }

      binanceSymbolCache = entries;
      return entries;
    } catch {
      return [];
    } finally {
      binanceFetchPromise = null;
    }
  })();

  return binanceFetchPromise;
}

/**
 * Search Binance exchange for USDT pairs not in the static catalog.
 * Loads the full symbol list once, then filters locally.
 */
export async function searchBinance(
  query: string,
  limit = 4,
): Promise<CatalogEntry[]> {
  if (query.trim().length < 1) return [];
  const q = query.trim().toUpperCase();

  const allSymbols = await loadBinanceSymbols();

  const results: { entry: CatalogEntry; rank: number }[] = [];
  for (const entry of allSymbols) {
    const sym = entry.symbol;
    if (sym === q) {
      results.push({ entry, rank: 0 });
    } else if (sym.startsWith(q)) {
      results.push({ entry, rank: 1 });
    } else if (sym.includes(q)) {
      results.push({ entry, rank: 2 });
    }
  }

  results.sort((a, b) => a.rank - b.rank);
  return results.slice(0, limit).map((r) => r.entry);
}

// ─── GeckoTerminal Quality Filters ──────────────────────────────
// Pools must meet ALL thresholds to appear in search results.
const GECKO_MIN_LIQUIDITY = 50_000;    // $50k reserve in USD
const GECKO_MIN_VOLUME_24H = 10_000;   // $10k 24h volume
const GECKO_MIN_TX_24H = 50;           // 50 total buys+sells in 24h

/**
 * Search GeckoTerminal for DEX tokens not in the static catalog.
 * Filters out low-liquidity / low-activity pools to avoid scam tokens.
 * Free API — no key required, 10 req/min.
 */
export async function searchGeckoTerminal(
  query: string,
  limit = 4
): Promise<CatalogEntry[]> {
  if (query.trim().length < 2) return [];

  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/search/pools?query=${encodeURIComponent(query.trim())}&page=1`
    );
    if (!res.ok) return [];

    const json = await res.json();
    const pools = json?.data ?? [];

    const seen = new Set<string>();
    const results: CatalogEntry[] = [];

    for (const pool of pools) {
      if (results.length >= limit) break;

      const attrs = pool.attributes;
      const name: string = attrs?.name ?? "";
      const network: string = pool.relationships?.network?.data?.id ?? "";
      const poolAddress: string = attrs?.address ?? "";

      // ── Quality filters ──
      const liquidity = parseFloat(attrs?.reserve_in_usd ?? "0");
      const volume24h = parseFloat(attrs?.volume_usd?.h24 ?? "0");
      const tx24h = (attrs?.transactions?.h24?.buys ?? 0) + (attrs?.transactions?.h24?.sells ?? 0);

      if (liquidity < GECKO_MIN_LIQUIDITY) continue;
      if (volume24h < GECKO_MIN_VOLUME_24H) continue;
      if (tx24h < GECKO_MIN_TX_24H) continue;

      // Extract the base token symbol from the pool name (e.g. "TIBBIR / SOL" → "TIBBIR")
      const baseSymbol = name.split("/")[0]?.trim().toUpperCase() ?? "";
      if (!baseSymbol || seen.has(baseSymbol)) continue;

      // Skip tokens already in our static catalog
      if (ASSET_CATALOG.some((a) => a.symbol === baseSymbol)) continue;

      seen.add(baseSymbol);

      const baseName: string =
        attrs?.tokens_info?.[0]?.token_name ??
        attrs?.base_token_name ??
        baseSymbol;

      results.push({
        symbol: baseSymbol,
        name: baseName,
        category: "dex",
        poolKey: `${network}:${poolAddress}`,
      });
    }

    return results;
  } catch {
    return [];
  }
}
