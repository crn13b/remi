import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;

async function getToken(email: string, password: string): Promise<string> {
  const client = createClient(supabaseUrl, anonKey);
  const { data } = await client.auth.signInWithPassword({ email, password });
  return data.session!.access_token;
}

test.describe("Anti-bypass: direct API calls", () => {
  test("free user cannot insert second distinct ticker via direct PostgREST", async () => {
    const token = await getToken("free-fresh@test.remi", "TestPass123!");
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    // After Task 2.6 (RLS lockdown), BOTH inserts fail with
    // "permission denied for table alerts" because the revoke fires before
    // any RLS policy is even evaluated. We assert that the second insert
    // errors — but in practice the first one already errors too. The test
    // is intentionally lenient (truthy) so it survives either ordering.
    await client.from("alerts").insert({ symbol: "BTC", direction: "long", aggressiveness: "default" });
    const { error } = await client.from("alerts").insert({ symbol: "ETH", direction: "long", aggressiveness: "default" });
    expect(error).toBeTruthy();
    // Expected error message: /permission denied for table alerts/
  });

  test("free user cannot bypass score-api by setting source=watchlist in body", async () => {
    const token = await getToken("free-fresh@test.remi", "TestPass123!");
    for (let i = 0; i < 5; i++) {
      await fetch(`${supabaseUrl}/functions/v1/score-api`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: [{ symbol: `TEST${i}` }] }),
      });
    }
    const res = await fetch(`${supabaseUrl}/functions/v1/score-api`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: [{ symbol: "BYPASS" }], source: "watchlist" }),
    });
    const json = await res.json();
    expect(JSON.stringify(json)).toMatch(/limit|reached|quota/i);
  });

  test("free user cannot enable Discord via update-notification-prefs", async () => {
    const token = await getToken("free-fresh@test.remi", "TestPass123!");
    const res = await fetch(`${supabaseUrl}/functions/v1/update-notification-prefs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ discord_enabled: true }),
    });
    expect(res.status).toBe(403);
  });
});

test.describe("Anti-bypass: paid-to-paid downgrade", () => {
  test("pro -> core soft-disables excess ticker alerts; blocks creation and re-enable over cap", async () => {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const admin = createClient(supabaseUrl, serviceKey);

    // 1. Sign in as the pro test user and capture user id + JWT.
    const userClient = createClient(supabaseUrl, anonKey);
    const { data: signInData } = await userClient.auth.signInWithPassword({
      email: "pro-downgrade@test.remi",
      password: "TestPass123!",
    });
    const userId = signInData.user!.id;
    const userToken = signInData.session!.access_token;

    // 2. Clean slate: remove any existing alerts.
    await admin.from("alerts").delete().eq("user_id", userId);

    // 3. Seed 5 active alerts on 5 distinct tickers.
    const seedSymbols = ["BTC", "ETH", "SOL", "ADA", "DOT"];
    for (const symbol of seedSymbols) {
      await admin.from("alerts").insert({
        user_id: userId,
        symbol,
        direction: "long",
        aggressiveness: "default",
        is_active: true,
      });
    }

    // 4. Simulate pro -> core downgrade via the test-only edge function
    //    `test-reconcile` (see Task 6.0). It is GUARDED by the
    //    ALLOW_TEST_RECONCILE env var and must be FALSE/unset in production.
    const { data: reconcileData, error: reconcileErr } = await admin.functions.invoke(
      "test-reconcile",
      { body: { userId, targetPlan: "core" } },
    );
    expect(reconcileErr).toBeNull();
    expect((reconcileData as { ok?: boolean })?.ok).toBe(true);

    // 5a. Assertion: exactly 2 rows soft-disabled, 3 still active, 5 total
    //     (rows preserved, not deleted).
    const { data: allRows } = await admin
      .from("alerts")
      .select("id, symbol, is_active")
      .eq("user_id", userId);
    expect(allRows!.length).toBe(5);
    const activeRows = allRows!.filter((r) => r.is_active === true);
    const inactiveRows = allRows!.filter((r) => r.is_active === false);
    expect(activeRows.length).toBe(3);
    expect(inactiveRows.length).toBe(2);
    expect(new Set(activeRows.map((r) => (r as { symbol: string }).symbol)).size).toBe(3);

    // 5b. Attempt to create a 4th-distinct-ticker alert — create-alert must 403.
    const createRes = await fetch(`${supabaseUrl}/functions/v1/create-alert`, {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: "AVAX", direction: "long", aggressiveness: "default" }),
    });
    expect(createRes.status).toBe(403);

    // 5c. Attempt to toggle-reactivate one of the soft-disabled excess-ticker
    //     alerts — toggle-alert must also 403 (exercises ticker-cap re-check).
    const target = inactiveRows[0] as { id: string };
    const toggleRes = await fetch(`${supabaseUrl}/functions/v1/toggle-alert`, {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: target.id, is_active: true }),
    });
    expect(toggleRes.status).toBe(403);
    const toggleJson = await toggleRes.json();
    expect(JSON.stringify(toggleJson)).toMatch(/ticker|limit|exceed/i);
  });
});

test.describe("Anti-bypass: owner on free plan", () => {
  test("owner gets unlimited lookups even when plan=free", async () => {
    const token = await getToken("owner@test.remi", "TestPass123!");
    for (let i = 0; i < 20; i++) {
      const res = await fetch(`${supabaseUrl}/functions/v1/score-api`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: [{ symbol: `OWNER${i}` }] }),
      });
      expect(res.ok).toBe(true);
    }
  });
});
