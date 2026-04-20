/**
 * REMi Scoring Service
 *
 * Fetches scores from the server-side score-api edge function.
 * The proprietary scoring engine runs only on the server.
 */

import { supabase } from "./supabaseClient";

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
  sentiment: "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell" | "High Probability Setup";
  color: string;
  bearish: { state: string; isDiverging: boolean; score: number };
  bullish: { state: string; isDiverging: boolean; score: number };
  detail?: FounderDetail;
}

export interface FounderDetail {
  bearish: {
    anchor: { price: number; rsi: number; index: number; timestamp: number } | null;
    divergence: { priceHighest: number; rsiAtHighest: number; priceRise: number; rsiDrop: number; strength: number; index: number; timestamp: number } | null;
  };
  bullish: {
    anchor: { price: number; rsi: number; index: number; timestamp: number } | null;
    divergence: { priceLowest: number; rsiAtLowest: number; priceDrop: number; rsiRise: number; strength: number; index: number; timestamp: number } | null;
  };
}

interface ScoreApiError {
  code: "invalid_symbol" | "fetch_failed" | "RATE_LIMITED" | "LOOKUP_DENIED" | string;
  message: string;
}

export class ScoreFetchError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ScoreFetchError";
  }
}

interface ScoreApiResponse {
  results: Record<string, RemiScoreResult>;
  errors?: Record<string, ScoreApiError>;
}

// ─── Cache removed ──────────────────────────────────────────────
// Client-side score cache was removed to prevent cross-namespace poisoning.
// Server enforces freshness via watchlist_assets.last_refreshed_at.

// ─── Display Names ──────────────────────────────────────────────

const DISPLAY_NAMES: Record<string, string> = {
  BTC: "Bitcoin",  ETH: "Ethereum",  SOL: "Solana",  XRP: "Ripple",
  ADA: "Cardano",  DOGE: "Dogecoin",  AVAX: "Avalanche",  LINK: "Chainlink",
  DOT: "Polkadot",  MATIC: "Polygon",  UNI: "Uniswap",  BNB: "BNB",
  PEPE: "Pepe",  SHIB: "Shiba Inu",  APT: "Aptos",  ARB: "Arbitrum",
  OP: "Optimism",  SUI: "Sui",  LTC: "Litecoin",  BCH: "Bitcoin Cash",
  NEAR: "NEAR Protocol",  INJ: "Injective",  TIA: "Celestia",  FET: "Fetch.ai",
  RENDER: "Render",  SEI: "Sei",  WIF: "dogwifhat",  BONK: "Bonk",  ATOM: "Cosmos",
};

// ─── Validation ──────────────────────────────────────────────────

const validatedSymbols = new Map<string, boolean>();

export function isSupported(symbol: string): boolean {
  const sym = symbol.toUpperCase();
  if (validatedSymbols.has(sym)) return validatedSymbols.get(sym)!;
  return true;
}

export function getDisplayName(symbol: string): string {
  return DISPLAY_NAMES[symbol.toUpperCase()] ?? symbol.toUpperCase();
}

// ─── Score Fetching ──────────────────────────────────────────────

async function fetchScoresFromApi(symbols: string[]): Promise<ScoreApiResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke("score-api", {
    body: { symbols },
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
  });

  if (error) {
    throw new Error(`score-api error: ${error.message}`);
  }

  return data as ScoreApiResponse;
}

export async function getRemiScore(symbol: string): Promise<RemiScoreResult> {
  const sym = symbol.toUpperCase();

  const response = await fetchScoresFromApi([sym]);

  const symError = response.errors?.[sym];
  if (symError) {
    if (symError.code === "invalid_symbol") validatedSymbols.set(sym, false);
    throw new ScoreFetchError(symError.code, symError.message);
  }

  const result = response.results[sym];
  if (!result) {
    throw new ScoreFetchError("no_result", `No score returned for ${sym}`);
  }

  validatedSymbols.set(sym, true);
  return result;
}

/**
 * Batch fetch scores for multiple symbols.
 */
export async function getBatchScores(
  symbols: string[],
  onResult?: (symbol: string, result: RemiScoreResult) => void,
): Promise<Map<string, RemiScoreResult>> {
  const results = new Map<string, RemiScoreResult>();
  const upper = symbols.map((s) => s.toUpperCase());
  if (upper.length === 0) return results;

  const response = await fetchScoresFromApi(upper);

  for (const sym of upper) {
    const result = response.results[sym];
    if (result) {
      results.set(sym, result);
      validatedSymbols.set(sym, true);
      onResult?.(sym, result);
    } else if (response.errors?.[sym]) {
      const err = response.errors[sym];
      console.warn(`Failed to fetch score for ${sym}: ${err.message}`);
      if (err.code === "invalid_symbol") validatedSymbols.set(sym, false);
    }
  }

  return results;
}
