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
    candleTimestamp: string;   // ISO timestamp of the candle being scored
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
 * neutral (or flips from the opposite tier). While the score stays in-tier
 * on the same side, emits peak_update when score improves and move_update
 * when the favorable price move improves. Neutral with no existing row
 * returns an empty list.
 */
export function decideLatchUpdates(
    state: CurrentState,
    row: LatchRow | null,
): RpcArgs[] {
    const updates: RpcArgs[] = [];
    const currSide = tierSide(state.score);
    const prevSide =
        state.previousScore === null ? null : tierSide(state.previousScore);

    // Fresh tier entry: currently in-tier, and either previously neutral
    // (or unknown) or previously in the opposite tier. A same-side repeat
    // entry (previously in-tier, exited, now re-entered) also counts — it
    // represents a distinct new call from the user's perspective.
    const isFreshEntry =
        currSide !== null &&
        (prevSide === null || prevSide !== currSide);

    if (isFreshEntry) {
        updates.push({
            mode: "new_call",
            symbol: state.symbol,
            score: state.score,
            side: currSide as LatchSide,
            price: state.currentPrice,
            callAt: state.candleTimestamp,
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
                peakScoreAt: state.candleTimestamp,
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
                peakMoveAt: state.candleTimestamp,
            });
        }
    }

    return updates;
}
