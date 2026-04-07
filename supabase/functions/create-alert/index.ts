import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canCreateAlert } from "../_shared/entitlements/index.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: cors });

  const auth = req.headers.get("Authorization");
  if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });

  const body = await req.json();
  const { symbol, direction, aggressiveness, is_active } = body ?? {};
  if (!symbol) {
    return new Response(JSON.stringify({ error: "missing symbol" }), { status: 400, headers: cors });
  }

  const gate = await canCreateAlert(supabase, userData.user.id, symbol);
  if (!gate.allowed) {
    return new Response(JSON.stringify({ error: gate.reason, code: gate.code }), { status: 403, headers: cors });
  }

  const { data, error } = await supabase
    .from("alerts")
    .insert({
      user_id: userData.user.id,
      symbol: String(symbol).toUpperCase(),
      direction: direction ?? "both",
      aggressiveness: aggressiveness ?? "default",
      is_active: is_active ?? true,
    })
    .select()
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
  return new Response(JSON.stringify(data), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
});
