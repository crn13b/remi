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
