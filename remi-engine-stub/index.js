/**
 * remi-engine stub — returns neutral placeholder values.
 * Replace with the real remi-engine package for live scoring.
 */

export function calculateRSI(_candles) {
  return Array.from({ length: _candles.length }, () => 50);
}

export function runBearishDivergence(_candles) {
  return { state: 'IDLE', anchor: null, divergence: null, isDiverging: false, score: 50 };
}

export function scoreBearishDivergence(_candles) {
  return { state: 'IDLE', anchor: null, divergence: null, isDiverging: false, score: 50 };
}

export function runBullishDivergence(_candles) {
  return { state: 'IDLE', anchor: null, divergence: null, isDiverging: false, score: 50 };
}

export function scoreBullishDivergence(_candles) {
  return { state: 'IDLE', anchor: null, divergence: null, isDiverging: false, score: 50 };
}

export function calculateMACD(_candles) {
  return { macd: 0, signal: 0, histogram: 0 };
}

export function getLatestMACD(_candles) {
  return { macd: 0, signal: 0, histogram: 0 };
}

export function calculateStochRSI(_candles) {
  return { k: 50, d: 50 };
}

export function getLatestStochRSI(_candles) {
  return { k: 50, d: 50 };
}

export function computeScore(_candles) {
  return {
    score: 50,
    signal: 'neutral',
    rsi: 50,
    bearish: { state: 'IDLE', isDiverging: false, score: 50 },
    bullish: { state: 'IDLE', isDiverging: false, score: 50 },
  };
}
