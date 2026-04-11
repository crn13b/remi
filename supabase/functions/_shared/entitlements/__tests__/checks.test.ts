import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canCreateAlert } from "../checks.ts";

function buildSupabase(opts: { plan: string; alerts: Array<{ symbol: string }>; trialStarted?: string | null }) {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {
        select() { return chain; },
        eq() { return chain; },
        order() { return chain; },
      };
      if (table === "profiles") {
        chain.single = async () => ({ data: { plan: opts.plan, alert_trial_started_at: opts.trialStarted ?? null }, error: null });
      }
      if (table === "alerts") {
        // Resolve via thenable on the chain
        (chain as { then?: (cb: (v: unknown) => void) => void }).then = (cb) => cb({ data: opts.alerts, error: null });
      }
      return chain;
    },
  } as unknown as Parameters<typeof canCreateAlert>[0];
}

Deno.test("free user can create first alert on first ticker", async () => {
  Deno.env.delete("OWNER_USER_ID");
  const sb = buildSupabase({ plan: "free", alerts: [] });
  const r = await canCreateAlert(sb, "u1", "BTC");
  assertEquals(r.allowed, true);
});

Deno.test("free user blocked on second distinct ticker", async () => {
  Deno.env.delete("OWNER_USER_ID");
  const sb = buildSupabase({ plan: "free", alerts: [{ symbol: "BTC" }] });
  const r = await canCreateAlert(sb, "u1", "ETH");
  assertEquals(r.allowed, false);
  assertEquals(r.code, "TICKER_LIMIT");
});
