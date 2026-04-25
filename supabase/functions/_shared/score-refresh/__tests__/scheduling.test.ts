import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  nextSuccessfulRefreshAt,
  nextFailureBackoffAt,
  backoffSeconds,
} from "../scheduling.ts";

Deno.test("backoffSeconds produces exponential series capped at 900", () => {
  assertEquals(backoffSeconds(1), 120);   // 60 * 2^1
  assertEquals(backoffSeconds(2), 240);
  assertEquals(backoffSeconds(3), 480);
  assertEquals(backoffSeconds(4), 900);   // 60 * 2^4 = 960 → capped
  assertEquals(backoffSeconds(10), 900);
});

Deno.test("nextSuccessfulRefreshAt adds interval plus 0-60s jitter", () => {
  const now = new Date("2026-04-23T00:00:00Z");
  const interval = 900; // 15 min
  const result = nextSuccessfulRefreshAt(now, interval, () => 0.5);
  // 900 base + 30s (jitter at 0.5) = 930s
  assertEquals(result.toISOString(), "2026-04-23T00:15:30.000Z");
});

Deno.test("nextSuccessfulRefreshAt jitter lower bound is 0s", () => {
  const now = new Date("2026-04-23T00:00:00Z");
  const result = nextSuccessfulRefreshAt(now, 900, () => 0);
  assertEquals(result.toISOString(), "2026-04-23T00:15:00.000Z");
});

Deno.test("nextSuccessfulRefreshAt jitter upper bound is under 60s", () => {
  const now = new Date("2026-04-23T00:00:00Z");
  const result = nextSuccessfulRefreshAt(now, 900, () => 0.999);
  const diff = (result.getTime() - now.getTime()) / 1000;
  // 900 + (60 * 0.999) ≈ 959.94
  assert(diff >= 900 && diff < 960);
});

Deno.test("nextFailureBackoffAt applies correct backoff for failure count", () => {
  const now = new Date("2026-04-23T00:00:00Z");
  assertEquals(
    nextFailureBackoffAt(now, 1).toISOString(),
    "2026-04-23T00:02:00.000Z",  // +120s
  );
  assertEquals(
    nextFailureBackoffAt(now, 10).toISOString(),
    "2026-04-23T00:15:00.000Z",  // +900s (capped)
  );
});
