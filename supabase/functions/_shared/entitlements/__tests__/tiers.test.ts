import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getEntitlements, TIERS } from "../tiers.ts";

Deno.test("free tier matches locked matrix", () => {
  const e = getEntitlements("free");
  assertEquals(e.maxWatchlists, 1);
  assertEquals(e.maxTickersPerWatchlist, 3);
  assertEquals(e.watchlistScoreFreshnessSeconds, 4 * 60 * 60);
  assertEquals(e.dailyScoreLookupLimit, 5);
  assertEquals(e.blockLookupsOnWatchlistedSymbols, true);
  assertEquals(e.alertsEnabled, true);
  assertEquals(e.maxAlertTickers, 1);
  assertEquals(e.alertTrialDays, 3);
  assertEquals(e.channels, { email: true, discord: false, telegram: false });
  assertEquals(e.foundingMemberBadge, false);
});

Deno.test("core tier matches locked matrix", () => {
  const e = getEntitlements("core");
  assertEquals(e.maxWatchlists, 3);
  assertEquals(e.maxTickersPerWatchlist, Number.POSITIVE_INFINITY);
  assertEquals(e.watchlistScoreFreshnessSeconds, 60);
  assertEquals(e.dailyScoreLookupLimit, null);
  assertEquals(e.blockLookupsOnWatchlistedSymbols, false);
  assertEquals(e.maxAlertTickers, 3);
  assertEquals(e.alertTrialDays, null);
  assertEquals(e.channels, { email: true, discord: true, telegram: true });
});

Deno.test("pro tier matches locked matrix", () => {
  const e = getEntitlements("pro");
  assertEquals(e.maxWatchlists, Number.POSITIVE_INFINITY);
  assertEquals(e.maxTickersPerWatchlist, Number.POSITIVE_INFINITY);
  assertEquals(e.maxAlertTickers, Number.POSITIVE_INFINITY);
  assertEquals(e.dailyScoreLookupLimit, null);
});

Deno.test("founder tier matches locked matrix", () => {
  const e = getEntitlements("founder");
  assertEquals(e.maxWatchlists, Number.POSITIVE_INFINITY);
  assertEquals(e.maxTickersPerWatchlist, Number.POSITIVE_INFINITY);
  assertEquals(e.maxAlertTickers, Number.POSITIVE_INFINITY);
  assertEquals(e.foundingMemberBadge, true);
  assertEquals(e.priceLocked, true);
  assertEquals(e.roadmapVoting, true);
});

Deno.test("TIERS exhaustively covers all four plans", () => {
  assertEquals(Object.keys(TIERS).sort(), ["core", "founder", "free", "pro"]);
});
