// supabase/functions/_shared/public-api/__tests__/auth.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  hashToken,
  isValidTokenFormat,
  parseBearerToken,
} from "../auth.ts";

const VALID_TOKEN = "remi_live_" + "a".repeat(64);
const VALID_HASH = "a50b471fbe441a3231898fbd07711f04deaa21571718418997df6987225a21ce";

Deno.test("parseBearerToken: extracts token from valid header", () => {
  assertEquals(parseBearerToken("Bearer " + VALID_TOKEN), VALID_TOKEN);
});

Deno.test("parseBearerToken: case-insensitive scheme", () => {
  assertEquals(parseBearerToken("bearer " + VALID_TOKEN), VALID_TOKEN);
  assertEquals(parseBearerToken("BEARER " + VALID_TOKEN), VALID_TOKEN);
  assertEquals(parseBearerToken("BeArEr " + VALID_TOKEN), VALID_TOKEN);
});

Deno.test("parseBearerToken: tolerates extra whitespace", () => {
  assertEquals(parseBearerToken("Bearer  " + VALID_TOKEN), VALID_TOKEN);
  assertEquals(parseBearerToken("Bearer\t" + VALID_TOKEN), VALID_TOKEN);
});

Deno.test("parseBearerToken: returns null for missing header", () => {
  assertEquals(parseBearerToken(null), null);
  assertEquals(parseBearerToken(""), null);
});

Deno.test("parseBearerToken: returns null for wrong scheme", () => {
  assertEquals(parseBearerToken("Basic foo"), null);
  assertEquals(parseBearerToken("Token " + VALID_TOKEN), null);
  assertEquals(parseBearerToken(VALID_TOKEN), null);
});

Deno.test("parseBearerToken: returns null for empty token", () => {
  assertEquals(parseBearerToken("Bearer "), null);
  assertEquals(parseBearerToken("Bearer"), null);
});

Deno.test("isValidTokenFormat: accepts correct shape", () => {
  assertEquals(isValidTokenFormat(VALID_TOKEN), true);
});

Deno.test("isValidTokenFormat: rejects wrong prefix", () => {
  assertEquals(isValidTokenFormat("remi_test_" + "a".repeat(64)), false);
  assertEquals(isValidTokenFormat("a".repeat(74)), false);
});

Deno.test("isValidTokenFormat: rejects wrong length", () => {
  assertEquals(isValidTokenFormat("remi_live_" + "a".repeat(63)), false);
  assertEquals(isValidTokenFormat("remi_live_" + "a".repeat(65)), false);
});

Deno.test("isValidTokenFormat: rejects non-hex chars", () => {
  assertEquals(isValidTokenFormat("remi_live_" + "g".repeat(64)), false);
  assertEquals(isValidTokenFormat("remi_live_" + "A".repeat(64)), false); // uppercase rejected
  assertEquals(isValidTokenFormat("remi_live_" + "z".repeat(64)), false);
});

Deno.test("hashToken: produces 64 lowercase hex chars", async () => {
  const out = await hashToken(VALID_TOKEN);
  assertEquals(out.length, 64);
  assertEquals(out, out.toLowerCase());
  assertEquals(/^[0-9a-f]{64}$/.test(out), true);
});

Deno.test("hashToken: deterministic", async () => {
  const a = await hashToken(VALID_TOKEN);
  const b = await hashToken(VALID_TOKEN);
  assertEquals(a, b);
});

Deno.test("hashToken: different tokens produce different hashes", async () => {
  const a = await hashToken(VALID_TOKEN);
  const b = await hashToken("remi_live_" + "b".repeat(64));
  assertEquals(a !== b, true);
});

Deno.test("hashToken: known answer test", async () => {
  // Pin the algorithm. VALID_HASH was computed via:
  // echo -n "remi_live_aaaaaaaa...64 a's" | shasum -a 256
  assertEquals(await hashToken(VALID_TOKEN), VALID_HASH);
});

Deno.test("hashToken: empty-string known answer test", async () => {
  // Pins SHA-256 algorithm choice. Canonical empty-string SHA-256:
  // https://en.wikipedia.org/wiki/SHA-2#Examples_of_SHA-2_variants
  assertEquals(
    await hashToken(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});
