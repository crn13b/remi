// supabase/functions/_shared/public-api/__tests__/noise.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyScoreNoise } from "../noise.ts";

const KEY_A = "11111111-1111-1111-1111-111111111111";
const KEY_B = "22222222-2222-2222-2222-222222222222";
const COMPUTED_AT = new Date("2026-04-26T10:15:00Z").toISOString();

Deno.test("applyScoreNoise: offset stays within ±2", async () => {
  for (let raw = 0; raw <= 100; raw++) {
    for (const sym of ["BTC", "ETH", "AAPL", "BTC1", "1BTC", "X"]) {
      const out = await applyScoreNoise(raw, sym, KEY_A, COMPUTED_AT);
      const diff = out - raw;
      // -2..+2 OR clamped to [0,100] (so diff might be smaller at edges)
      assert(diff >= -2 && diff <= 2, `offset ${diff} out of range for raw=${raw} sym=${sym}`);
      assert(out >= 0 && out <= 100, `out=${out} out of [0,100]`);
    }
  }
});

Deno.test("applyScoreNoise: deterministic — same inputs give same output", async () => {
  const a = await applyScoreNoise(67, "BTC", KEY_A, COMPUTED_AT);
  const b = await applyScoreNoise(67, "BTC", KEY_A, COMPUTED_AT);
  assertEquals(a, b);
});

Deno.test("applyScoreNoise: different keys produce independent offsets", async () => {
  // Across many raw scores, KEY_A and KEY_B should disagree at least sometimes.
  let disagreements = 0;
  for (let raw = 30; raw <= 80; raw++) {
    const a = await applyScoreNoise(raw, "BTC", KEY_A, COMPUTED_AT);
    const b = await applyScoreNoise(raw, "BTC", KEY_B, COMPUTED_AT);
    if (a !== b) disagreements++;
  }
  // With 5 possible offsets and independent keys, expect ~80% disagreement.
  // A loose lower bound that catches "always identical" bugs.
  assert(disagreements > 20, `expected >20 disagreements across 51 raws, got ${disagreements}`);
});

Deno.test("applyScoreNoise: BTC+1 vs BTC1 produce independent offsets (length-prefix safety)", async () => {
  // Without length-prefixing, sha256("BTC" || "1") and sha256("BTC1" || "")
  // would collide. With it, the prefix bytes differ, so the seeds differ.
  let disagreements = 0;
  for (let raw = 30; raw <= 80; raw++) {
    const a = await applyScoreNoise(raw, "BTC", KEY_A, COMPUTED_AT);
    const b = await applyScoreNoise(raw, "BTC1", KEY_A, COMPUTED_AT);
    if (a !== b) disagreements++;
  }
  assert(disagreements > 20, `BTC and BTC1 collided more than expected: ${disagreements} disagreements`);
});

Deno.test("applyScoreNoise: clamps below 0 and above 100", async () => {
  // raw=0 with offset=-2 must clamp to 0, not -2.
  // raw=100 with offset=+2 must clamp to 100, not 102.
  for (const sym of ["BTC", "ETH", "SOL", "AAPL"]) {
    const low = await applyScoreNoise(0, sym, KEY_A, COMPUTED_AT);
    const high = await applyScoreNoise(100, sym, KEY_A, COMPUTED_AT);
    assert(low >= 0 && low <= 2, `low=${low} should be in [0,2]`);
    assert(high >= 98 && high <= 100, `high=${high} should be in [98,100]`);
  }
});

Deno.test("applyScoreNoise: 15-min window stability — same window same offset", async () => {
  // Within a single 15-min window, two timestamps yield the same offset for
  // the same (key, symbol, raw_score).
  const t1 = new Date("2026-04-26T10:15:00Z").toISOString();
  const t2 = new Date("2026-04-26T10:29:59Z").toISOString();
  const a = await applyScoreNoise(67, "BTC", KEY_A, t1);
  const b = await applyScoreNoise(67, "BTC", KEY_A, t2);
  assertEquals(a, b);
});

Deno.test("applyScoreNoise: rotates across 15-min boundary at least sometimes", async () => {
  // Two timestamps that fall in different 15-min windows MAY produce
  // different offsets. Across many symbols, at least some should differ.
  const t1 = new Date("2026-04-26T10:14:59Z").toISOString();
  const t2 = new Date("2026-04-26T10:15:00Z").toISOString();
  let disagreements = 0;
  for (const sym of ["BTC", "ETH", "SOL", "AAPL", "MSFT", "DOGE", "AVAX", "LINK"]) {
    const a = await applyScoreNoise(67, sym, KEY_A, t1);
    const b = await applyScoreNoise(67, sym, KEY_A, t2);
    if (a !== b) disagreements++;
  }
  assert(disagreements >= 1, `expected some windows to differ across 10:14:59 → 10:15:00, got ${disagreements}`);
});

Deno.test("applyScoreNoise: produces all 5 offset values across many inputs", async () => {
  // Catches a bug where the offset is always 0 (e.g. `% 1` typo) or stuck on
  // a subset. Sweeps many (symbol, key) pairs and confirms every offset
  // appears at least once.
  const seenOffsets = new Set<number>();
  const symbols = ["BTC", "ETH", "SOL", "AAPL", "MSFT", "DOGE", "AVAX", "LINK", "DOT", "ADA"];
  const keys = [
    "11111111-1111-1111-1111-111111111111",
    "22222222-2222-2222-2222-222222222222",
    "33333333-3333-3333-3333-333333333333",
    "44444444-4444-4444-4444-444444444444",
  ];
  for (const k of keys) {
    for (const s of symbols) {
      const out = await applyScoreNoise(50, s, k, COMPUTED_AT); // raw=50 → no clamping
      seenOffsets.add(out - 50);
    }
  }
  for (const expected of [-2, -1, 0, 1, 2]) {
    assert(seenOffsets.has(expected), `offset ${expected} never produced; saw ${[...seenOffsets].sort()}`);
  }
});

Deno.test("applyScoreNoise: rejects malformed UUID layout", async () => {
  const bad = [
    "not-a-uuid",
    "11111111111111111111111111111111",            // 32 hex chars, no dashes
    "1111-1111-1111-1111-1111-11111111111111111",  // wrong dash positions
    "11111111-1111-1111-1111-1111111111111",       // 11 chars in last group
    "11111111-1111-1111-1111-1111111111111z",      // non-hex
    "",
  ];
  for (const b of bad) {
    let threw = false;
    try {
      await applyScoreNoise(50, "BTC", b, COMPUTED_AT);
    } catch {
      threw = true;
    }
    assert(threw, `expected throw for invalid UUID: ${JSON.stringify(b)}`);
  }
});

Deno.test("applyScoreNoise: rejects invalid computedAt", async () => {
  let threw = false;
  try {
    await applyScoreNoise(50, "BTC", KEY_A, "not-a-date");
  } catch {
    threw = true;
  }
  assert(threw, "expected throw for invalid computedAt");
});
