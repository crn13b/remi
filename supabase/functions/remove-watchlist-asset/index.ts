import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
  const watchlistId = body?.watchlist_id;
  const symbol = body?.symbol;
  if (!watchlistId || !symbol) {
    return new Response(JSON.stringify({ error: "missing watchlist_id or symbol" }), { status: 400, headers: cors });
  }

  // Verify the watchlist belongs to the user
  const { data: wl } = await supabase
    .from("watchlists")
    .select("id, user_id")
    .eq("id", watchlistId)
    .single();
  if (!wl || (wl as { user_id: string }).user_id !== userData.user.id) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
  }

  const { error } = await supabase
    .from("watchlist_assets")
    .delete()
    .eq("watchlist_id", watchlistId)
    .eq("symbol", symbol);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
});
