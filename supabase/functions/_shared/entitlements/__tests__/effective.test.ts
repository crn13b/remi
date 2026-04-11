import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getEffectiveEntitlements } from "../effective.ts";

function fakeSupabase(plan: string) {
  return {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        single: async () => ({ data: { plan }, error: null }),
      };
    },
  } as unknown as Parameters<typeof getEffectiveEntitlements>[0];
}

Deno.test("non-owner free user gets free entitlements", async () => {
  Deno.env.delete("OWNER_USER_ID");
  const eff = await getEffectiveEntitlements(fakeSupabase("free"), "user-123");
  assertEquals(eff.plan, "free");
  assertEquals(eff.isOwner, false);
  assertEquals(eff.entitlements.maxAlertTickers, 1);
});

Deno.test("owner on free plan gets pro-level unlimited entitlements", async () => {
  Deno.env.set("OWNER_USER_ID", "owner-uuid");
  const eff = await getEffectiveEntitlements(fakeSupabase("free"), "owner-uuid");
  assertEquals(eff.plan, "free");
  assertEquals(eff.isOwner, true);
  assertEquals(eff.entitlements.maxAlertTickers, Number.POSITIVE_INFINITY);
  assertEquals(eff.entitlements.dailyScoreLookupLimit, null);
  assertEquals(eff.entitlements.channels.discord, true);
});

Deno.test("paid user is not falsely marked owner", async () => {
  Deno.env.set("OWNER_USER_ID", "owner-uuid");
  const eff = await getEffectiveEntitlements(fakeSupabase("core"), "someone-else");
  assertEquals(eff.isOwner, false);
  assertEquals(eff.plan, "core");
  assertEquals(eff.entitlements.maxAlertTickers, 3);
});
