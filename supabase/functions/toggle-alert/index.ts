import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAlertTrialActive, getEffectiveEntitlements } from "../_shared/entitlements/index.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization");
  if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = await req.json();
  const { id, is_active } = body ?? {};
  if (!id || typeof is_active !== "boolean") {
    return new Response(JSON.stringify({ error: "missing fields" }), { status: 400, headers: cors });
  }

  if (is_active === true) {
    const { data: targetAlert, error: targetErr } = await supabase
      .from("alerts")
      .select("id, symbol, is_active")
      .eq("id", id)
      .eq("user_id", userData.user.id)
      .single();
    if (targetErr || !targetAlert) {
      return new Response(JSON.stringify({ error: "alert not found" }), { status: 404, headers: cors });
    }

    if (targetAlert.is_active === false) {
      const eff = await getEffectiveEntitlements(supabase, userData.user.id);

      if (
        !eff.isOwner &&
        eff.plan === "free" &&
        !(await isAlertTrialActive(supabase, userData.user.id))
      ) {
        return new Response(
          JSON.stringify({ error: "Trial expired. Upgrade to reactivate." }),
          { status: 403, headers: cors },
        );
      }

      if (!eff.isOwner && Number.isFinite(eff.entitlements.maxAlertTickers)) {
        const { data: activeRows, error: activeErr } = await supabase
          .from("alerts")
          .select("symbol")
          .eq("user_id", userData.user.id)
          .eq("is_active", true);
        if (activeErr) {
          return new Response(JSON.stringify({ error: activeErr.message }), { status: 500, headers: cors });
        }
        const activeTickers = new Set(
          (activeRows ?? []).map((r) => (r as { symbol: string }).symbol.toUpperCase()),
        );
        const targetSymbolUpper = (targetAlert.symbol as string).toUpperCase();
        const alreadyCounted = activeTickers.has(targetSymbolUpper);
        if (!alreadyCounted && activeTickers.size >= eff.entitlements.maxAlertTickers) {
          return new Response(
            JSON.stringify({
              error: `Reactivating this alert would exceed your plan's ticker limit (${eff.entitlements.maxAlertTickers}). Upgrade to enable more tickers.`,
              code: "ticker_cap_exceeded",
            }),
            { status: 403, headers: cors },
          );
        }
      }
    }
  }

  const { error } = await supabase
    .from("alerts").update({ is_active }).eq("id", id).eq("user_id", userData.user.id);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
});
