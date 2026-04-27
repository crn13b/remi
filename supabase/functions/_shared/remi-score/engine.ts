/**
 * REMi Score Engine — Deno port
 *
 * Stateless version of services/remiScore.ts for use by the evaluate-alerts cron.
 * No in-memory cache, no isSupported / validatedSymbols — all symbols passed in
 * already have active alerts and are presumed valid.
 */

import { computeScore } from "./engines/combine.ts";
import type { CombinedScore } from "./engines/types.ts";
import { fetchCandles as fetchCandlesUnified } from "../data-providers/index.ts";

// ─── Display Names ───────────────────────────────────────────────

const DISPLAY_NAMES: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  XRP: "Ripple",
  ADA: "Cardano",
  DOGE: "Dogecoin",
  AVAX: "Avalanche",
  LINK: "Chainlink",
  DOT: "Polkadot",
  MATIC: "Polygon",
  UNI: "Uniswap",
  BNB: "BNB",
  PEPE: "Pepe",
  SHIB: "Shiba Inu",
  APT: "Aptos",
  ARB: "Arbitrum",
  OP: "Optimism",
  SUI: "Sui",
  LTC: "Litecoin",
  BCH: "Bitcoin Cash",
  NEAR: "NEAR Protocol",
  INJ: "Injective",
  TIA: "Celestia",
  FET: "Fetch.ai",
  RENDER: "Render",
  SEI: "Sei",
  WIF: "dogwifhat",
  BONK: "Bonk",
  ATOM: "Cosmos",
  SPY: "S&P 500 ETF",
  QQQ: "Nasdaq 100 ETF",
  DIA: "Dow Jones ETF",
  IWM: "Russell 2000 ETF",
  AAPL: "Apple",
  MSFT: "Microsoft",
  GOOGL: "Alphabet",
  AMZN: "Amazon",
  NVDA: "NVIDIA",
  TSLA: "Tesla",
  META: "Meta Platforms",
  AMD: "AMD",
  COIN: "Coinbase",
  MSTR: "MicroStrategy",
  PLTR: "Palantir",
};

// ─── Types ───────────────────────────────────────────────────────

export interface RemiScoreResult {
  score: number;
  price: string;
  priceRaw: number;
  change: string;
  changeRaw: number;
  name: string;
  symbol: string;
  rsi: number;
  signal: "bullish" | "bearish" | "neutral";
  sentiment:
    | "Strong Buy"
    | "Buy"
    | "Hold"
    | "Sell"
    | "Strong Sell"
    | "High Probability Setup";
  color: string;
  bearish: { state: string; isDiverging: boolean; score: number };
  bullish: { state: string; isDiverging: boolean; score: number };
  detail?: {
    bearish: {
      anchor: { price: number; rsi: number; index: number; timestamp: number } | null;
      divergence: { priceHighest: number; rsiAtHighest: number; priceRise: number; rsiDrop: number; strength: number; index: number; timestamp: number } | null;
    };
    bullish: {
      anchor: { price: number; rsi: number; index: number; timestamp: number } | null;
      divergence: { priceLowest: number; rsiAtLowest: number; priceDrop: number; rsiRise: number; strength: number; index: number; timestamp: number } | null;
    };
  };
}

// Safe-to-publish subset of RemiScoreResult. Engine internals (rsi, signal,
// color, bullish, bearish, detail) are excluded. Used for any response served
// to non-owner users and as the basis for the public API surface.
export interface PublicRemiScoreResult {
  symbol: string;
  score: number;
  sentiment: RemiScoreResult["sentiment"];
  price: string;
  priceRaw: number;
  change: string;
  changeRaw: number;
  name: string;
}

export function projectScoreForPublic(result: RemiScoreResult): PublicRemiScoreResult {
  return {
    symbol: result.symbol,
    score: result.score,
    sentiment: result.sentiment,
    price: result.price,
    priceRaw: result.priceRaw,
    change: result.change,
    changeRaw: result.changeRaw,
    name: result.name,
  };
}

// ─── Candle Fetching (unified: Binance, Twelve Data, GeckoTerminal) ───

interface EngineCandle {
  close: number;
  timestamp: number;
}

async function fetchCandles(symbol: string): Promise<EngineCandle[]> {
  const result = await fetchCandlesUnified(symbol, "15m", 500);
  return result.candles.map((c) => ({
    close: c.close,
    timestamp: c.openTime,
  }));
}

// ─── Price Formatting ────────────────────────────────────────────

function formatPrice(price: number): string {
  if (price >= 1000) {
    return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (price >= 1) {
    return `$${price.toFixed(2)}`;
  }
  if (price >= 0.01) {
    return `$${price.toFixed(4)}`;
  }
  // Microcap prices
  return `$${price.toPrecision(4)}`;
}

// ─── Score → Sentiment / Color Mapping ──────────────────────────

export function scoreToSentiment(score: number): RemiScoreResult["sentiment"] {
  if (score >= 80) return "Strong Buy";
  if (score >= 70) return "Buy";
  if (score >= 56) return "Buy";
  if (score >= 46) return "Hold";
  if (score >= 31) return "Sell";
  return "Strong Sell";
}

function scoreToColor(score: number): string {
  if (score >= 70) return "emerald-500";
  if (score >= 56) return "amber-500";
  if (score >= 46) return "slate-400";
  if (score >= 31) return "amber-500";
  return "rose-500";
}

// ─── Main Scoring Function ───────────────────────────────────────

export async function getRemiScore(symbol: string): Promise<RemiScoreResult> {
  const sym = symbol.toUpperCase();

  const candles = await fetchCandles(sym);

  // Run scoring engine
  const engineResult: CombinedScore = computeScore(candles);

  // Current price & 24h change
  const currentPrice = candles[candles.length - 1].close;
  const h24Idx = Math.max(0, candles.length - 96);
  const h24Price = candles[h24Idx].close;
  const changeRaw = ((currentPrice - h24Price) / h24Price) * 100;

  // Resolve candle indices to timestamps in engine detail
  const resolveTimestamp = (idx: number) => candles[idx]?.timestamp ?? 0;
  const detail = engineResult.detail;
  const resolvedDetail = {
    bearish: {
      anchor: detail.bearish.anchor
        ? { ...detail.bearish.anchor, timestamp: resolveTimestamp(detail.bearish.anchor.index) }
        : null,
      divergence: detail.bearish.divergence
        ? { ...detail.bearish.divergence, timestamp: resolveTimestamp(detail.bearish.divergence.index) }
        : null,
    },
    bullish: {
      anchor: detail.bullish.anchor
        ? { ...detail.bullish.anchor, timestamp: resolveTimestamp(detail.bullish.anchor.index) }
        : null,
      divergence: detail.bullish.divergence
        ? { ...detail.bullish.divergence, timestamp: resolveTimestamp(detail.bullish.divergence.index) }
        : null,
    },
  };

  const result: RemiScoreResult = {
    score: engineResult.score,
    price: formatPrice(currentPrice),
    priceRaw: currentPrice,
    change: `${changeRaw >= 0 ? "+" : ""}${changeRaw.toFixed(1)}%`,
    changeRaw,
    name: DISPLAY_NAMES[sym] ?? sym,
    symbol: sym,
    rsi: engineResult.rsi,
    signal: engineResult.signal,
    sentiment: scoreToSentiment(engineResult.score),
    color: scoreToColor(engineResult.score),
    bearish: engineResult.bearish,
    bullish: engineResult.bullish,
    detail: resolvedDetail,
  };

  return result;
}

/**
 * Batch fetch scores for multiple symbols.
 * Fetches sequentially with a 300ms delay between requests to avoid rate limits.
 */
export async function getBatchScores(
  symbols: string[],
): Promise<Map<string, RemiScoreResult>> {
  const results = new Map<string, RemiScoreResult>();

  for (const symbol of symbols) {
    try {
      const result = await getRemiScore(symbol);
      results.set(symbol, result);
    } catch (err) {
      console.warn(`Failed to fetch score for ${symbol}:`, err);
    }

    // Small delay between requests
    if (symbols.indexOf(symbol) < symbols.length - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return results;
}
