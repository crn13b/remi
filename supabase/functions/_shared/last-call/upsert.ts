/**
 * last-call latch helper — pure functions, no DB access.
 *
 * Callers pass the current score state + the existing latch row (or null).
 * The helper returns a list of RPC argument objects describing which
 * upsert_asset_last_call calls should be made (possibly empty).
 *
 * Tier thresholds mirror the alert-evaluation thresholds. Latch entry
 * happens when score enters the bullish or bearish alert tier.
 */

export const BULLISH_TIER_FLOOR = 70;
export const BEARISH_TIER_CEILING = 30;

export type LatchSide = "bullish" | "bearish";

export interface LatchRow {
    symbol: string;
    last_call_score: number | null;
    last_call_side: LatchSide | null;
    last_call_price: number | null;
    last_call_at: string | null;
    last_call_peak_score: number | null;
    last_call_peak_score_at: string | null;
    last_call_peak_move: number | null;
    last_call_peak_move_at: string | null;
}

export interface CurrentState {
    symbol: string;
    score: number;
    currentPrice: number;
    observedAt: string;   // ISO timestamp when this state was observed (ideally the last closed candle's ts; falls back to wall clock)
    previousScore: number | null;  // last observed score (null = unknown)
}

export type RpcArgs =
    | {
          mode: "new_call";
          symbol: string;
          score: number;
          side: LatchSide;
          price: number;
          callAt: string;
      }
    | {
          mode: "peak_update";
          symbol: string;
          peakScore: number;
          peakScoreAt: string;
      }
    | {
          mode: "move_update";
          symbol: string;
          peakMove: number;
          peakMoveAt: string;
      };

function tierSide(score: number): LatchSide | null {
    if (score >= BULLISH_TIER_FLOOR) return "bullish";
    if (score <= BEARISH_TIER_CEILING) return "bearish";
    return null;
}

/**
 * Decide which latch updates (if any) should be written for this tick.
 *
 * Fires a new_call when the score enters the bullish or bearish tier from
 * an out-of-tier state (neutral or opposite side). Uses the existing latch
 * row as the primary source of truth for "previously in-tier on this side" —
 * so a caller that doesn't know `previousScore` (e.g. a lookup request)
 * can still avoid stomping a same-side latch that was already recorded.
 *
 * While the score stays in-tier on the same side, emits peak_update when
 * score improves and move_update when the favorable price move improves.
 * Neutral with no existing row returns an empty list.
 */
export function decideLatchUpdates(
    state: CurrentState,
    row: LatchRow | null,
): RpcArgs[] {
    const updates: RpcArgs[] = [];
    const currSide = tierSide(state.score);
    const prevSide =
        state.previousScore === null ? null : tierSide(state.previousScore);
    const latchSide = row?.last_call_side ?? null;

    // Fresh tier entry rules:
    //   - Must be currently in-tier.
    //   - A new call is "not fresh" only when we have proof of BOTH an
    //     existing same-side latch row AND a previous score also in the
    //     same tier (= continuously in-tier since the last call).
    //   - Same-side latch alone is not enough, because a score can go
    //     bullish → neutral → bullish and the second entry is a distinct
    //     call. The latch row persists from the first call; we need the
    //     previousScore to disambiguate.
    //   - Previous score same-side alone is also not enough: if the latch
    //     row is empty (e.g. first time seeing this symbol), we should
    //     record the entry even though the alert-evaluation layer may show
    //     in-tier history.
    //
    // Known limitation: score-api lookup callers pass previousScore=null
    // and so cannot disambiguate "continuously in-tier" from "re-entry
    // after a neutral dip". They will over-collapse re-entries into the
    // prior call. The cron (evaluate-alerts) catches up within 60s with
    // correct disambiguation via alerts.last_score.
    const sameSideLatch = latchSide !== null && latchSide === currSide;
    const sameSidePrevScore = prevSide !== null && prevSide === currSide;
    const continuouslyInTier = sameSideLatch && sameSidePrevScore;
    // Lookup path (previousScore=null) + same-side latch: treat as
    // continuous to avoid repeated rewrites on every dashboard render.
    const lookupSameSideFallback =
        sameSideLatch && state.previousScore === null;
    const isFreshEntry =
        currSide !== null && !continuouslyInTier && !lookupSameSideFallback;

    if (isFreshEntry) {
        updates.push({
            mode: "new_call",
            symbol: state.symbol,
            score: state.score,
            side: currSide as LatchSide,
            price: state.currentPrice,
            callAt: state.observedAt,
        });
        // After a new_call, peak fields reset server-side; don't emit
        // peak updates in the same tick — the next tick refines them.
        return updates;
    }

    // In-tier on the same side as the latch row: maybe refine peaks.
    if (
        currSide !== null &&
        row !== null &&
        row.last_call_side === currSide &&
        row.last_call_price !== null
    ) {
        // Peak score: bullish ratchets UP, bearish ratchets DOWN.
        const prevPeakScore = row.last_call_peak_score;
        const beatsPeakScore =
            currSide === "bullish"
                ? prevPeakScore === null || state.score > prevPeakScore
                : prevPeakScore === null || state.score < prevPeakScore;
        if (beatsPeakScore) {
            updates.push({
                mode: "peak_update",
                symbol: state.symbol,
                peakScore: state.score,
                peakScoreAt: state.observedAt,
            });
        }

        // Peak favorable move: signed decimal from the call price.
        // Bullish: ratchet to the most-positive. Bearish: ratchet to the
        // most-negative. The RPC enforces the ratchet in SQL too.
        const move =
            (state.currentPrice - row.last_call_price) / row.last_call_price;
        const prevPeakMove = row.last_call_peak_move;
        const beatsPeakMove =
            currSide === "bullish"
                ? prevPeakMove === null || move > prevPeakMove
                : prevPeakMove === null || move < prevPeakMove;
        if (beatsPeakMove) {
            updates.push({
                mode: "move_update",
                symbol: state.symbol,
                peakMove: move,
                peakMoveAt: state.observedAt,
            });
        }
    }

    return updates;
}
