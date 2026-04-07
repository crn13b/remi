import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { reconcileEntitlements } from "../reconcile.ts";

Deno.test("reconcileEntitlements is callable and returns void", async () => {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  const fakeSupabase = {
    from(table: string) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        in() { return chain; },
        order() { return chain; },
        update(payload: unknown) { calls.push({ table, op: "update", payload }); return chain; },
        upsert(payload: unknown) { calls.push({ table, op: "upsert", payload }); return chain; },
        then(cb: (v: unknown) => void) { cb({ data: [], error: null }); },
      };
      return chain;
    },
  } as unknown as Parameters<typeof reconcileEntitlements>[0];
  const result = await reconcileEntitlements(fakeSupabase, "u1", "free");
  assertEquals(result, undefined);
});

Deno.test("reconcileEntitlements soft-disables overflow alert tickers when downgrading to free", async () => {
  // Free plan: maxAlertTickers = 1, maxWatchlists = 1, maxTickersPerWatchlist = 3
  // Seed 5 distinct active alert tickers — expect 4 to be disabled.
  const tableData: Record<string, unknown[]> = {
    alerts: [
      { id: "a1", symbol: "BTC", is_active: true, created_at: "2025-01-01" },
      { id: "a2", symbol: "ETH", is_active: true, created_at: "2025-01-02" },
      { id: "a3", symbol: "SOL", is_active: true, created_at: "2025-01-03" },
      { id: "a4", symbol: "DOGE", is_active: true, created_at: "2025-01-04" },
      { id: "a5", symbol: "ADA", is_active: true, created_at: "2025-01-05" },
    ],
    watchlists: [],
    watchlist_assets: [],
    notification_preferences: [],
  };

  const calls: Array<{ table: string; op: string; payload?: unknown; inIds?: unknown }> = [];

  const fakeSupabase = {
    from(table: string) {
      let lastInIds: unknown = undefined;
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        in(_col: string, ids: unknown) { lastInIds = ids; return chain; },
        order() { return chain; },
        update(payload: unknown) {
          calls.push({ table, op: "update", payload, inIds: undefined });
          // capture .in() call that follows
          const updateChain = {
            in(_col: string, ids: unknown) {
              calls[calls.length - 1].inIds = ids;
              return Promise.resolve({ data: null, error: null });
            },
          };
          return updateChain;
        },
        upsert(payload: unknown) {
          calls.push({ table, op: "upsert", payload });
          return Promise.resolve({ data: null, error: null });
        },
        then(cb: (v: unknown) => void) {
          cb({ data: tableData[table] ?? [], error: null });
        },
      };
      void lastInIds;
      return chain;
    },
  } as unknown as Parameters<typeof reconcileEntitlements>[0];

  await reconcileEntitlements(fakeSupabase, "u1", "free");

  const alertDisables = calls.filter(
    (c) => c.table === "alerts" && c.op === "update" &&
      (c.payload as { is_active: boolean }).is_active === false,
  );
  assertEquals(alertDisables.length, 1);
  const disabledIds = alertDisables[0].inIds as string[];
  assertEquals(disabledIds.sort(), ["a2", "a3", "a4", "a5"]);

  // No reactivations expected (all started active).
  const alertReactivates = calls.filter(
    (c) => c.table === "alerts" && c.op === "update" &&
      (c.payload as { is_active: boolean }).is_active === true,
  );
  assertEquals(alertReactivates.length, 0);
});
