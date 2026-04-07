/** A single OHLCV candlestick. */
export interface Candle {
  openTime: number; // Unix milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type AssetClass = "crypto" | "stock" | "commodity" | "dex";

export type Timeframe = "15m" | "1h" | "4h" | "1d" | "3d" | "1w";

/** Result returned by fetchCandles — includes metadata about the fetch. */
export interface FetchResult {
  candles: Candle[];
  source: string; // 'binance' | 'twelvedata' | 'geckoterminal'
  assetClass: AssetClass;
  cached: boolean;
}
