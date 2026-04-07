export interface Candle {
  close: number;
  timestamp: number;
}

export type EngineState = 'IDLE' | 'TRACKING';

export interface Anchor {
  price: number;
  rsi: number;
  index: number;
}

export interface BearishDivergenceReading {
  priceHighest: number;
  rsiAtHighest: number;
  priceRise: number;
  rsiDrop: number;
  strength: number;
}

export interface BullishDivergenceReading {
  priceLowest: number;
  rsiAtLowest: number;
  priceDrop: number;
  rsiRise: number;
  strength: number;
}

export interface EngineResult {
  state: EngineState;
  anchor: Anchor | null;
  divergence: (BearishDivergenceReading | BullishDivergenceReading) | null;
  isDiverging: boolean;
  score: number;
}

export interface BearishEngineResult extends EngineResult {
  divergence: BearishDivergenceReading | null;
}

export interface BullishEngineResult extends EngineResult {
  divergence: BullishDivergenceReading | null;
}

export interface CombinedScore {
  score: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  rsi: number;
  bearish: { state: string; isDiverging: boolean; score: number };
  bullish: { state: string; isDiverging: boolean; score: number };
}

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
}

export interface MACDConfig {
  fast?: number;
  slow?: number;
  signal?: number;
}

export interface StochRSIResult {
  k: number;
  d: number;
}

export interface StochRSIConfig {
  period?: number;
  kPeriod?: number;
  dPeriod?: number;
}

export function calculateRSI(candles: Candle[]): number[];
export function runBearishDivergence(candles: Candle[]): BearishEngineResult;
export function scoreBearishDivergence(candles: Candle[]): BearishEngineResult;
export function runBullishDivergence(candles: Candle[]): BullishEngineResult;
export function scoreBullishDivergence(candles: Candle[]): BullishEngineResult;
export function calculateMACD(candles: Candle[], config?: MACDConfig): MACDResult;
export function getLatestMACD(candles: Candle[], config?: MACDConfig): MACDResult;
export function calculateStochRSI(candles: Candle[], config?: StochRSIConfig): StochRSIResult;
export function getLatestStochRSI(candles: Candle[], config?: StochRSIConfig): StochRSIResult;
export function computeScore(candles: Candle[]): CombinedScore;
