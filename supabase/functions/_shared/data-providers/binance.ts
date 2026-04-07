import { Candle, Timeframe } from "../types.ts";

/**
 * Map our timeframe codes to Binance interval strings.
 * Binance supports: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M
 */
const TIMEFRAME_MAP: Record<Timeframe, string> = {
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
  "3d": "3d",
  "1w": "1w",
};

/**
 * Map simple crypto symbols to Binance trading pairs.
 * Binance requires the full pair (e.g. "BTCUSDT"), not just "BTC".
 */
const SYMBOL_MAP: Record<string, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  SOL: "SOLUSDT",
  XRP: "XRPUSDT",
  ADA: "ADAUSDT",
  DOGE: "DOGEUSDT",
  DOT: "DOTUSDT",
  AVAX: "AVAXUSDT",
  LINK: "LINKUSDT",
  MATIC: "MATICUSDT",
  ATOM: "ATOMUSDT",
  UNI: "UNIUSDT",
  LTC: "LTCUSDT",
  BCH: "BCHUSDT",
  NEAR: "NEARUSDT",
  APT: "APTUSDT",
  ARB: "ARBUSDT",
  OP: "OPUSDT",
  SUI: "SUIUSDT",
  SEI: "SEIUSDT",
  INJ: "INJUSDT",
  TIA: "TIAUSDT",
  FET: "FETUSDT",
  RENDER: "RENDERUSDT",
  BNB: "BNBUSDT",
  PEPE: "PEPEUSDT",
  SHIB: "SHIBUSDT",
  WIF: "WIFUSDT",
  BONK: "BONKUSDT",
};

/** Check if a symbol is available on Binance. */
export function isBinanceSymbol(symbol: string): boolean {
  return symbol.toUpperCase() in SYMBOL_MAP;
}

/**
 * Fetch OHLCV candles from Binance REST API.
 * No API key required — this endpoint is completely free.
 *
 * Binance klines response format (each element is an array):
 * [0] Open time (ms), [1] Open, [2] High, [3] Low, [4] Close, [5] Volume,
 * [6] Close time, [7] Quote asset volume, [8] Number of trades, ...
 */
export async function fetchBinanceCandles(
  symbol: string,
  timeframe: Timeframe,
  limit: number,
): Promise<Candle[]> {
  const pair = SYMBOL_MAP[symbol.toUpperCase()];
  if (!pair) {
    throw new Error(
      `Unknown Binance symbol: ${symbol}. Add it to SYMBOL_MAP or use a different provider.`,
    );
  }

  const interval = TIMEFRAME_MAP[timeframe];
  if (!interval) {
    throw new Error(`Unsupported timeframe for Binance: ${timeframe}`);
  }

  // Use Binance US — global Binance blocks requests from US cloud servers
  const url = new URL("https://api.binance.us/api/v3/klines");
  url.searchParams.set("symbol", pair);
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", String(Math.min(limit, 1000))); // Binance max is 1000

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Binance API error (${res.status}): ${body}`);
  }

  const data: unknown[][] = await res.json();

  return data.map((k) => ({
    openTime: Number(k[0]),
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
  }));
}
