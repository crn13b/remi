import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEffectiveEntitlements } from "../_shared/entitlements/index.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization");
  if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }

  const eff = await getEffectiveEntitlements(supabase, userData.user.id);

  let dailyScoreLookupsRemaining: number | null = null;
  if (!eff.isOwner && eff.entitlements.dailyScoreLookupLimit !== null) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("daily_score_lookups, daily_score_lookups_reset_at")
      .eq("id", userData.user.id)
      .single();
    if (prof) {
      const utcToday = new Date();
      utcToday.setUTCHours(0, 0, 0, 0);
      const resetAt = new Date((prof as { daily_score_lookups_reset_at: string }).daily_score_lookups_reset_at);
      const used = resetAt < utcToday ? 0 : (prof as { daily_score_lookups: number }).daily_score_lookups;
      dailyScoreLookupsRemaining = Math.max(0, eff.entitlements.dailyScoreLookupLimit - used);
    }
  }

  const json = JSON.stringify({
    plan: eff.plan,
    isOwner: eff.isOwner,
    entitlements: eff.entitlements,
    dailyScoreLookupsRemaining,
  }, (_k, v) => (v === Number.POSITIVE_INFINITY ? null : v));

  return new Response(json, { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
});
