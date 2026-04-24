import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canAddWatchlistTicker } from "../_shared/entitlements/index.ts";

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
  const { watchlist_id, symbol, name } = body ?? {};
  if (!watchlist_id || !symbol) {
    return new Response(JSON.stringify({ error: "missing fields" }), { status: 400, headers: cors });
  }

  const { data: list } = await supabase
    .from("watchlists").select("user_id").eq("id", watchlist_id).single();
  if (!list || (list as { user_id: string }).user_id !== userData.user.id) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
  }

  const gate = await canAddWatchlistTicker(supabase, userData.user.id, watchlist_id, symbol);
  if (!gate.allowed) {
    return new Response(JSON.stringify({ error: gate.reason, code: gate.code }), { status: 403, headers: cors });
  }

  const symbolUpper = String(symbol).toUpperCase();
  const { data, error } = await supabase
    .from("watchlist_assets")
    .insert({ watchlist_id, symbol: symbolUpper, name: name ?? symbolUpper })
    .select().single();
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });

  // ── Seed tracked_symbols so the symbol enters the refresh loop ──
  // Jitter 0-60s so a burst of adds doesn't sync up. Don't overwrite
  // existing rows — if the symbol is already tracked, let it keep its
  // current next_refresh_at.
  const seedRefreshAt = new Date(
    Date.now() + 60_000 + Math.floor(Math.random() * 60) * 1000,
  ).toISOString();

  // Provider-specific interval: stocks get 30 min, crypto 15 min.
  const cryptoSet = new Set([
    'BTC','ETH','SOL','XRP','ADA','DOGE','DOT','AVAX','LINK',
    'MATIC','ATOM','UNI','LTC','BCH','NEAR','APT','ARB','OP',
    'SUI','SEI','INJ','TIA','FET','RENDER','BNB','PEPE','SHIB',
    'WIF','BONK',
  ]);
  const isCrypto = symbolUpper.includes(':') || cryptoSet.has(symbolUpper);
  const refreshIntervalSec = isCrypto ? 900 : 1800;

  const { error: trackErr } = await supabase
    .from('tracked_symbols')
    .upsert(
      {
        symbol: symbolUpper,
        next_refresh_at: seedRefreshAt,
        refresh_interval_sec: refreshIntervalSec,
      },
      { onConflict: 'symbol', ignoreDuplicates: true },
    );
  if (trackErr) {
    // Non-fatal: the watchlist row is already inserted. Log for ops
    // and move on — the symbol will get tracked on first view via score-api.
    console.error(`add-watchlist-asset: tracked_symbols seed failed for ${symbolUpper}:`, trackErr);
  }

  return new Response(JSON.stringify(data), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
});
