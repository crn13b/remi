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
  const { id, symbol, direction, aggressiveness, is_active } = body ?? {};
  if (!id) return new Response(JSON.stringify({ error: "missing id" }), { status: 400, headers: cors });

  const { data: existing } = await supabase
    .from("alerts").select("user_id, symbol, is_active").eq("id", id).single();
  if (!existing || (existing as { user_id: string }).user_id !== userData.user.id) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
  }

  const existingRow = existing as { user_id: string; symbol: string; is_active: boolean };

  // Any path that results in an active alert must pass the canCreateAlert gate:
  //   (a) changing the symbol (even if still active),
  //   (b) reactivating from inactive -> active (trial expiry, downgrade soft-disable).
  // Without this, a user could bypass tier caps and trial expiry by sending
  // update-alert with { id, is_active: true } on a previously-disabled alert.
  const changingSymbol =
    typeof symbol === "string" &&
    symbol.toUpperCase() !== existingRow.symbol.toUpperCase();
  const reactivating =
    is_active === true && existingRow.is_active === false;

  if (changingSymbol || reactivating) {
    const gateSymbol = changingSymbol ? symbol : existingRow.symbol;
    const gate = await canCreateAlert(supabase, userData.user.id, gateSymbol);
    if (!gate.allowed) {
      return new Response(JSON.stringify({ error: gate.reason, code: gate.code }), { status: 403, headers: cors });
    }
  }

  const updates: Record<string, unknown> = {};
  if (symbol) updates.symbol = String(symbol).toUpperCase();
  if (direction) updates.direction = direction;
  if (aggressiveness) updates.aggressiveness = aggressiveness;
  if (is_active !== undefined) updates.is_active = is_active;

  const { data, error } = await supabase
    .from("alerts").update(updates).eq("id", id).select().single();
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
  return new Response(JSON.stringify(data), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
});
