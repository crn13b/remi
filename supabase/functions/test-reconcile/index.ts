// supabase/functions/test-reconcile/index.ts
// ════════════════════════════════════════════════════════════
//  TEST-ONLY harness — wraps reconcileEntitlements for E2E.
// ════════════════════════════════════════════════════════════
// SECURITY: This function is hard-guarded by ALLOW_TEST_RECONCILE.
// It MUST be unset (or set to a value other than "true") in production.
// When the guard is not satisfied, the function returns 404 so it is
// indistinguishable from a non-deployed function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reconcileEntitlements } from "../_shared/entitlements/index.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Hard guard. Production: leave ALLOW_TEST_RECONCILE unset.
  if (Deno.env.get("ALLOW_TEST_RECONCILE") !== "true") {
    return new Response("not found", { status: 404, headers: cors });
  }

  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: cors });
  }

  const body = await req.json().catch(() => ({}));
  const { userId, targetPlan } = body ?? {};
  if (!userId || !targetPlan) {
    return new Response(
      JSON.stringify({ error: "missing userId or targetPlan" }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  // Use service_role because reconcileEntitlements mutates locked-down tables
  // (alerts, watchlists, watchlist_assets, notification_preferences,
  // user_connections — see Task 2.6).
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const result = await reconcileEntitlements(supabase, userId, targetPlan);
    return new Response(
      JSON.stringify({ ok: true, result }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
