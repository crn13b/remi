import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEffectiveEntitlements } from "../_shared/entitlements/index.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
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
  const {
    email_enabled,
    discord_enabled,
    telegram_enabled,
    nudge_enabled,
    nudge_frequency,
    nudge_time,
    global_aggressiveness,
  } = body ?? {};

  const eff = await getEffectiveEntitlements(supabase, userData.user.id);

  if (discord_enabled === true && !eff.entitlements.channels.discord) {
    return new Response(JSON.stringify({ error: "Discord notifications require Core or higher.", code: "CHANNEL_BLOCKED" }), { status: 403, headers: cors });
  }
  if (telegram_enabled === true && !eff.entitlements.channels.telegram) {
    return new Response(JSON.stringify({ error: "Telegram notifications require Core or higher.", code: "CHANNEL_BLOCKED" }), { status: 403, headers: cors });
  }

  const ALLOWED_NUDGE_FREQUENCIES = new Set(["daily", "every_12h", "every_6h", "off"]);
  const ALLOWED_AGGRESSIVENESS = new Set(["chill", "default", "aggressive", "relentless"]);

  if (nudge_frequency !== undefined && !ALLOWED_NUDGE_FREQUENCIES.has(nudge_frequency)) {
    return new Response(JSON.stringify({ error: "Invalid nudge_frequency", code: "INVALID_INPUT" }), { status: 400, headers: cors });
  }
  if (global_aggressiveness !== undefined && !ALLOWED_AGGRESSIVENESS.has(global_aggressiveness)) {
    return new Response(JSON.stringify({ error: "Invalid global_aggressiveness", code: "INVALID_INPUT" }), { status: 400, headers: cors });
  }
  if (nudge_time !== undefined && (typeof nudge_time !== "string" || !/^\d{2}:\d{2}(:\d{2})?$/.test(nudge_time))) {
    return new Response(JSON.stringify({ error: "Invalid nudge_time (expected HH:MM or HH:MM:SS)", code: "INVALID_INPUT" }), { status: 400, headers: cors });
  }

  const updates: Record<string, unknown> = {};
  if (email_enabled !== undefined) updates.email_enabled = email_enabled;
  if (discord_enabled !== undefined) updates.discord_enabled = discord_enabled;
  if (telegram_enabled !== undefined) updates.telegram_enabled = telegram_enabled;
  if (nudge_enabled !== undefined) updates.nudge_enabled = nudge_enabled;
  if (nudge_frequency !== undefined) updates.nudge_frequency = nudge_frequency;
  if (nudge_time !== undefined) updates.nudge_time = nudge_time;
  if (global_aggressiveness !== undefined) updates.global_aggressiveness = global_aggressiveness;

  const { error } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: userData.user.id, ...updates }, { onConflict: "user_id" });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
});
