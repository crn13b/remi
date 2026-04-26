import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { projectScoreForPublic, type RemiScoreResult } from "../engine.ts";

const SAMPLE: RemiScoreResult = {
  symbol: "BTC",
  score: 67,
  price: "$65,432.10",
  priceRaw: 65432.10,
  change: "+2.3%",
  changeRaw: 2.3,
  name: "Bitcoin",
  sentiment: "Buy",
  rsi: 51.38,
  signal: "bullish",
  color: "amber-500",
  bearish: { state: "IDLE", isDiverging: false, score: 50 },
  bullish: { state: "TRACKING", isDiverging: true, score: 67 },
  detail: {
    bearish: { anchor: null, divergence: null },
    bullish: {
      anchor: { price: 2300, rsi: 23, index: 402, timestamp: 1761000000000 },
      divergence: null,
    },
  },
};

Deno.test("projectScoreForPublic: includes only safe-to-publish fields", () => {
  const projected = projectScoreForPublic(SAMPLE);
  assertEquals(Object.keys(projected).sort(), [
    "change",
    "changeRaw",
    "name",
    "price",
    "priceRaw",
    "score",
    "sentiment",
    "symbol",
  ]);
});

Deno.test("projectScoreForPublic: omits engine internals", () => {
  const projected = projectScoreForPublic(SAMPLE);
  // These fields must NEVER appear in the public projection. Adding a new
  // engine-internal field to RemiScoreResult should NOT cause it to leak —
  // the projection is a whitelist, not a blacklist.
  const forbidden = ["rsi", "signal", "color", "bullish", "bearish", "detail"];
  for (const field of forbidden) {
    assert(
      !(field in projected),
      `Public projection must not include "${field}". Found: ${
        JSON.stringify(projected)
      }`,
    );
  }
});

Deno.test("projectScoreForPublic: preserves user-facing values verbatim", () => {
  const projected = projectScoreForPublic(SAMPLE);
  assertEquals(projected.symbol, "BTC");
  assertEquals(projected.score, 67);
  assertEquals(projected.sentiment, "Buy");
  assertEquals(projected.price, "$65,432.10");
  assertEquals(projected.priceRaw, 65432.10);
  assertEquals(projected.change, "+2.3%");
  assertEquals(projected.changeRaw, 2.3);
  assertEquals(projected.name, "Bitcoin");
});
