// supabase/functions/score-api/index.ts
/**
 * score-api — Authenticated score endpoint
 *
 * Accepts: POST { symbols: string[] }
 * Returns: { results: Record<string, ScoreResult>, errors: Record<string, { code, message }> }
 *
 * Server determines source (watchlist vs lookup) — client-supplied source is ignored.
 *
 * Auth: Requires valid Supabase JWT in Authorization header.
 * Deploy: supabase functions deploy score-api
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getRemiScore } from "../_shared/remi-score/engine.ts";
import type { RemiScoreResult } from "../_shared/remi-score/engine.ts";
import { canLookupScore, getEffectiveEntitlements } from "../_shared/entitlements/index.ts";

const MAX_BATCH_SIZE = 30;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

type ScoreResult = RemiScoreResult & {
  source?: "watchlist" | "lookup";
  cached?: boolean;
};

function jsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed. Use POST." });
  }

  // ── Auth: verify JWT ──
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(401, { error: "Missing Authorization header" });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonResponse(401, { error: "Invalid or expired token" });
  }

  // ── Effective entitlements ──
  const eff = await getEffectiveEntitlements(supabase, user.id);

  // ── Parse & validate body ──
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const { symbols } = body as { symbols?: unknown };

  if (!Array.isArray(symbols) || symbols.length === 0) {
    return jsonResponse(400, { error: 'Required: { symbols: string[] }' });
  }

  if (symbols.length > MAX_BATCH_SIZE) {
    return jsonResponse(400, { error: `Max ${MAX_BATCH_SIZE} symbols per request` });
  }

  // Validate, normalize, and deduplicate symbols
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const s of symbols) {
    if (typeof s !== "string" || s.trim().length === 0) {
      return jsonResponse(400, { error: `Invalid symbol: ${JSON.stringify(s)}` });
    }
    const sym = s.trim().toUpperCase();
    if (!seen.has(sym)) {
      seen.add(sym);
      normalized.push(sym);
    }
  }

  // ── Server-side source detection: which symbols are on this user's active watchlists? ──
  // Query watchlist_assets joined to watchlists filtered to this user's active lists.
  const { data: wlRows, error: wlErr } = await supabase
    .from("watchlist_assets")
    .select("symbol, cached_score, last_refreshed_at, watchlist_id, watchlists!inner(user_id, is_active)")
    .eq("watchlists.user_id", user.id)
    .eq("watchlists.is_active", true)
    .eq("is_active", true)
    .in("symbol", normalized);

  if (wlErr) {
    return jsonResponse(500, { error: "Failed to resolve watchlist source" });
  }

  // Map symbol -> best watchlist row (prefer freshest cached_score)
  type WLRow = {
    symbol: string;
    cached_score: number | null;
    last_refreshed_at: string | null;
    watchlist_id: string;
  };
  const watchlistBySym = new Map<string, WLRow>();
  const activeWatchlistIds = new Set<string>();
  for (const row of (wlRows ?? []) as unknown as WLRow[]) {
    activeWatchlistIds.add(row.watchlist_id);
    const sym = row.symbol.toUpperCase();
    const existing = watchlistBySym.get(sym);
    if (!existing) {
      watchlistBySym.set(sym, row);
      continue;
    }
    const a = existing.last_refreshed_at ? new Date(existing.last_refreshed_at).getTime() : 0;
    const b = row.last_refreshed_at ? new Date(row.last_refreshed_at).getTime() : 0;
    if (b > a) watchlistBySym.set(sym, row);
  }

  const results: Record<string, ScoreResult> = {};
  const errors: Record<string, { code: string; message: string }> = {};

  const freshnessMs = eff.entitlements.watchlistScoreFreshnessSeconds * 1000;
  const isPaidOrOwner = eff.isOwner || eff.plan !== "free";

  let upstreamCalls = 0;

  for (let i = 0; i < normalized.length; i++) {
    const sym = normalized[i];
    const wlRow = watchlistBySym.get(sym);
    const source: "watchlist" | "lookup" = wlRow ? "watchlist" : "lookup";

    try {
      if (source === "watchlist") {
        // Free users: serve cached if fresh; else recompute and update row.
        if (!isPaidOrOwner) {
          const lastMs = wlRow!.last_refreshed_at
            ? new Date(wlRow!.last_refreshed_at).getTime()
            : 0;
          const isFresh =
            wlRow!.cached_score !== null &&
            lastMs > 0 &&
            Date.now() - lastMs < freshnessMs;

          if (isFresh) {
            // Cached path — return a minimal result shaped like RemiScoreResult.
            const cachedResult = {
              symbol: sym,
              score: wlRow!.cached_score as number,
              source: "watchlist" as const,
              cached: true,
            } as ScoreResult;
            results[sym] = cachedResult;
            continue;
          }

          // Stale or absent — recompute and persist.
          if (upstreamCalls > 0) await new Promise((r) => setTimeout(r, 300));
          upstreamCalls++;
          const fresh = await getRemiScore(sym);
          const nowIso = new Date().toISOString();

          // Scope update by symbol AND only watchlists owned by this user.
          const wlIds = [...activeWatchlistIds];
          if (wlIds.length > 0) {
            await supabase
              .from("watchlist_assets")
              .update({ cached_score: fresh.score, last_refreshed_at: nowIso })
              .eq("symbol", sym)
              .in("watchlist_id", wlIds);
          }

          const out = { ...fresh, source: "watchlist" as const } as ScoreResult;
          results[sym] = out;
        } else {
          // Paid/owner: always real-time.
          if (upstreamCalls > 0) await new Promise((r) => setTimeout(r, 300));
          upstreamCalls++;
          const fresh = await getRemiScore(sym);
          const out = { ...fresh, source: "watchlist" as const } as ScoreResult;
          results[sym] = out;
        }
      } else {
        // Source = lookup
        const gate = await canLookupScore(supabase, user.id, sym);
        if (!gate.allowed) {
          errors[sym] = {
            code: gate.code ?? "LOOKUP_DENIED",
            message: gate.reason ?? "Lookup denied",
          };
          continue;
        }

        // Atomic quota consumption for free users with a daily limit.
        if (!eff.isOwner && eff.entitlements.dailyScoreLookupLimit !== null) {
          const { data: ok, error: rpcErr } = await supabase.rpc("consume_score_lookup", {
            uid: user.id,
            cap: eff.entitlements.dailyScoreLookupLimit,
          });
          if (rpcErr || ok === false) {
            errors[sym] = {
              code: "RATE_LIMITED",
              message: "Daily score lookup limit reached. Upgrade for unlimited lookups.",
            };
            continue;
          }
        }

        if (upstreamCalls > 0) await new Promise((r) => setTimeout(r, 300));
        upstreamCalls++;
        const fresh = await getRemiScore(sym);
        const out = { ...fresh, source: "lookup" as const } as ScoreResult;
        results[sym] = out;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const isInvalid =
        message.includes("Binance API error 4") ||
        message.includes("No data") ||
        message.includes("invalid_symbol") ||
        message.includes("not found");
      const code = isInvalid ? "invalid_symbol" : "fetch_failed";
      errors[sym] = { code, message };
    }
  }

  // Strip engine detail for non-owners
  if (!eff.isOwner) {
    for (const sym of Object.keys(results)) {
      delete (results[sym] as unknown as Record<string, unknown>).detail;
    }
  }

  return jsonResponse(200, { results, errors });
});
