import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { decideLatchUpdates, LatchRow, CurrentState } from "./upsert.ts";

function emptyRow(symbol = "ETH"): LatchRow {
    return {
        symbol,
        last_call_score: null,
        last_call_side: null,
        last_call_price: null,
        last_call_at: null,
        last_call_peak_score: null,
        last_call_peak_score_at: null,
        last_call_peak_move: null,
        last_call_peak_move_at: null,
    };
}

function bullishRow(symbol = "ETH"): LatchRow {
    return {
        symbol,
        last_call_score: 75,
        last_call_side: "bullish",
        last_call_price: 2000,
        last_call_at: "2026-04-21T00:00:00Z",
        last_call_peak_score: 75,
        last_call_peak_score_at: "2026-04-21T00:00:00Z",
        last_call_peak_move: 0,
        last_call_peak_move_at: "2026-04-21T00:00:00Z",
    };
}

function bearishRow(symbol = "ETH"): LatchRow {
    return {
        symbol,
        last_call_score: 25,
        last_call_side: "bearish",
        last_call_price: 2000,
        last_call_at: "2026-04-20T00:00:00Z",
        last_call_peak_score: 20,
        last_call_peak_score_at: "2026-04-20T01:00:00Z",
        last_call_peak_move: -0.05,
        last_call_peak_move_at: "2026-04-20T02:00:00Z",
    };
}

// ─── Fresh tier entries ──────────────────────────────────────────

Deno.test("fresh bullish entry from neutral emits new_call", () => {
    const state: CurrentState = {
        symbol: "ETH",
        score: 75,
        currentPrice: 2000,
        observedAt: "2026-04-21T01:00:00Z",
        previousScore: 55,
    };
    const updates = decideLatchUpdates(state, null);
    assertEquals(updates.length, 1);
    assertEquals(updates[0].mode, "new_call");
    if (updates[0].mode === "new_call") {
        assertEquals(updates[0].side, "bullish");
        assertEquals(updates[0].score, 75);
        assertEquals(updates[0].price, 2000);
    }
});

Deno.test("fresh bearish entry from neutral emits new_call", () => {
    const state: CurrentState = {
        symbol: "ETH",
        score: 25,
        currentPrice: 2000,
        observedAt: "2026-04-21T01:00:00Z",
        previousScore: 55,
    };
    const updates = decideLatchUpdates(state, null);
    assertEquals(updates.length, 1);
    assertEquals(updates[0].mode, "new_call");
    if (updates[0].mode === "new_call") {
        assertEquals(updates[0].side, "bearish");
    }
});

Deno.test("bearish-latched + bullish tier entry emits new_call (side flip)", () => {
    const state: CurrentState = {
        symbol: "ETH",
        score: 75,
        currentPrice: 1900,
        observedAt: "2026-04-21T01:00:00Z",
        previousScore: 25,
    };
    const updates = decideLatchUpdates(state, bearishRow());
    assertEquals(updates.length, 1);
    assertEquals(updates[0].mode, "new_call");
    if (updates[0].mode === "new_call") {
        assertEquals(updates[0].side, "bullish");
    }
});

Deno.test("previously neutral, unknown previous score: current in-tier → new_call", () => {
    const state: CurrentState = {
        symbol: "ETH",
        score: 80,
        currentPrice: 2000,
        observedAt: "2026-04-21T01:00:00Z",
        previousScore: null,
    };
    const updates = decideLatchUpdates(state, null);
    assertEquals(updates.length, 1);
    assertEquals(updates[0].mode, "new_call");
});

// ─── Critical: same-side latch row protects against repeated rewrites ───

Deno.test(
    "same-side bullish latch + previousScore=null does NOT emit new_call",
    () => {
        // Regression guard: a lookup request (score-api) has no access to
        // the user's previous score, so it passes previousScore=null. If
        // the helper treated that as a fresh entry every time, every
        // dashboard render would rewrite the latch and wipe peak history.
        // The latch row itself is the source of truth.
        const state: CurrentState = {
            symbol: "ETH",
            score: 80,  // still in bullish tier
            currentPrice: 2100,
            observedAt: "2026-04-21T02:00:00Z",
            previousScore: null,
        };
        const updates = decideLatchUpdates(state, bullishRow());
        const newCall = updates.find((u) => u.mode === "new_call");
        assertEquals(
            newCall,
            undefined,
            "must not rewrite same-side latch when previousScore is unknown",
        );
    },
);

Deno.test(
    "same-side bearish latch + previousScore=null does NOT emit new_call",
    () => {
        const state: CurrentState = {
            symbol: "ETH",
            score: 20,
            currentPrice: 1900,
            observedAt: "2026-04-20T04:00:00Z",
            previousScore: null,
        };
        const updates = decideLatchUpdates(state, bearishRow());
        const newCall = updates.find((u) => u.mode === "new_call");
        assertEquals(newCall, undefined);
    },
);

Deno.test(
    "opposite-side latch + previousScore=null: side flip still fires new_call",
    () => {
        // Bearish latch exists; score flips to bullish tier. Even with
        // unknown previousScore, the row's opposite side is clear evidence
        // of a side flip → new_call must fire.
        const state: CurrentState = {
            symbol: "ETH",
            score: 75,
            currentPrice: 1850,
            observedAt: "2026-04-21T00:00:00Z",
            previousScore: null,
        };
        const updates = decideLatchUpdates(state, bearishRow());
        assertEquals(updates.length, 1);
        assertEquals(updates[0].mode, "new_call");
        if (updates[0].mode === "new_call") {
            assertEquals(updates[0].side, "bullish");
        }
    },
);

Deno.test(
    "no latch row but previousScore indicates same-side in-tier: no new_call",
    () => {
        // Cron-style path: previousScore is known from alerts.last_score
        // and was already in-tier. If the latch row was somehow cleared
        // (manual delete, migration rollback), previousScore still shows
        // we're not entering fresh — so don't emit new_call.
        const state: CurrentState = {
            symbol: "ETH",
            score: 80,
            currentPrice: 2100,
            observedAt: "2026-04-21T02:00:00Z",
            previousScore: 75,  // was already in bullish tier
        };
        const updates = decideLatchUpdates(state, null);
        const newCall = updates.find((u) => u.mode === "new_call");
        assertEquals(newCall, undefined);
    },
);

// ─── No-op cases ─────────────────────────────────────────────────

Deno.test("neutral score with no existing row emits no updates", () => {
    const state: CurrentState = {
        symbol: "ETH",
        score: 55,
        currentPrice: 2000,
        observedAt: "2026-04-21T01:00:00Z",
        previousScore: 50,
    };
    const updates = decideLatchUpdates(state, null);
    assertEquals(updates.length, 0);
});

Deno.test("score decays from tier to neutral: no new_call, no peak update", () => {
    const state: CurrentState = {
        symbol: "ETH",
        score: 55,  // back to neutral
        currentPrice: 2050,
        observedAt: "2026-04-21T01:00:00Z",
        previousScore: 75,
    };
    const updates = decideLatchUpdates(state, bullishRow());
    assertEquals(updates.length, 0);
});

// ─── Peak updates while in-tier ──────────────────────────────────

Deno.test("bullish in-tier with higher score emits peak_update", () => {
    const state: CurrentState = {
        symbol: "ETH",
        score: 85,
        currentPrice: 2000,
        observedAt: "2026-04-21T00:15:00Z",
        previousScore: 75,
    };
    const updates = decideLatchUpdates(state, bullishRow());
    const peak = updates.find((u) => u.mode === "peak_update");
    assertExists(peak);
    if (peak.mode === "peak_update") {
        assertEquals(peak.peakScore, 85);
    }
});

Deno.test("bullish in-tier with EQUAL score does NOT emit peak_update", () => {
    const state: CurrentState = {
        symbol: "ETH",
        score: 75,
        currentPrice: 2000,
        observedAt: "2026-04-21T00:15:00Z",
        previousScore: 75,
    };
    const updates = decideLatchUpdates(state, bullishRow());
    const peak = updates.find((u) => u.mode === "peak_update");
    assertEquals(peak, undefined);
});

Deno.test("bearish in-tier with LOWER score emits peak_update", () => {
    const state: CurrentState = {
        symbol: "ETH",
        score: 15,  // lower = stronger bearish
        currentPrice: 2000,
        observedAt: "2026-04-20T03:00:00Z",
        previousScore: 25,
    };
    const updates = decideLatchUpdates(state, bearishRow());
    const peak = updates.find((u) => u.mode === "peak_update");
    assertExists(peak);
    if (peak.mode === "peak_update") {
        assertEquals(peak.peakScore, 15);
    }
});

// ─── Peak-move updates ────────────────────────────────────────────

Deno.test("bullish in-tier with favorable price move emits move_update", () => {
    const state: CurrentState = {
        symbol: "ETH",
        score: 75,
        currentPrice: 2200,  // up from call price 2000 → +10%
        observedAt: "2026-04-21T00:15:00Z",
        previousScore: 75,
    };
    const updates = decideLatchUpdates(state, bullishRow());
    const move = updates.find((u) => u.mode === "move_update");
    assertExists(move);
    if (move.mode === "move_update") {
        assertEquals(Math.round(move.peakMove * 1000) / 1000, 0.1);
    }
});

Deno.test("bearish in-tier with favorable (negative) move emits move_update", () => {
    const state: CurrentState = {
        symbol: "ETH",
        score: 25,
        currentPrice: 1800,  // down from call price 2000 → -10%
        observedAt: "2026-04-20T03:00:00Z",
        previousScore: 25,
    };
    const updates = decideLatchUpdates(state, bearishRow());
    const move = updates.find((u) => u.mode === "move_update");
    assertExists(move);
    if (move.mode === "move_update") {
        assertEquals(Math.round(move.peakMove * 1000) / 1000, -0.1);
    }
});

Deno.test("bullish with smaller-than-stored peak move does NOT emit move_update", () => {
    // Row has peak_move = 0.15 already; current move is smaller.
    const row: LatchRow = {
        ...bullishRow(),
        last_call_peak_move: 0.15,
        last_call_peak_move_at: "2026-04-21T00:10:00Z",
    };
    const state: CurrentState = {
        symbol: "ETH",
        score: 75,
        currentPrice: 2050,  // only +2.5%, smaller than 0.15
        observedAt: "2026-04-21T00:20:00Z",
        previousScore: 75,
    };
    const updates = decideLatchUpdates(state, row);
    const move = updates.find((u) => u.mode === "move_update");
    assertEquals(move, undefined);
});

Deno.test("bullish with UNFAVORABLE move (current price below call) does NOT emit move_update when peak is 0", () => {
    // Row has peak_move = 0 (initial state). Current is -5%.
    const state: CurrentState = {
        symbol: "ETH",
        score: 75,
        currentPrice: 1900,  // -5% from call price 2000
        observedAt: "2026-04-21T00:15:00Z",
        previousScore: 75,
    };
    const updates = decideLatchUpdates(state, bullishRow());
    const move = updates.find((u) => u.mode === "move_update");
    assertEquals(move, undefined);
});
