/**
 * evict-stale-symbols — hourly cron Edge Function
 *
 * DELETEs tracked_symbols rows that have had no views for 3+ days AND
 * are not referenced by any active watchlist_assets row. ON DELETE CASCADE
 * removes the corresponding global_symbol_scores row automatically.
 *
 * Watchlist membership is a hard pin: if any user has the symbol on an
 * active watchlist, it never evicts regardless of view activity.
 *
 * Triggered by: pg_cron (every 1 hour)
 * Auth: x-cron-secret header must match CRON_SECRET env var.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function jsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (!expectedSecret) {
    console.error("evict-stale-symbols: CRON_SECRET env var not set");
    return jsonResponse(500, { error: "server misconfigured" });
  }
  if (req.headers.get("x-cron-secret") !== expectedSecret) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  const startedAt = Date.now();

  // Raw SQL via RPC is the cleanest way to express "not referenced by any
  // active watchlist asset". Supabase client's query builder doesn't handle
  // anti-joins elegantly. Use rpc on a SECURITY DEFINER function.
  const { data, error } = await supabase.rpc("evict_stale_tracked_symbols");

  if (error) {
    console.error("evict-stale-symbols: RPC failed:", error);
    return jsonResponse(500, { error: "rpc failed" });
  }

  const evicted = (data as number) ?? 0;
  const durationMs = Date.now() - startedAt;
  console.log(`evict-stale-symbols: evicted=${evicted} duration=${durationMs}ms`);
  return jsonResponse(200, { evicted, durationMs });
});
