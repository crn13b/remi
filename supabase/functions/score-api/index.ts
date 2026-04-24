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

  // Two clients:
  //   - `supabase`: anon + user JWT. Used for auth.getUser(), reads, and
  //     the consume_score_lookup RPC (which needs auth.uid() to resolve).
  //   - `admin`: pure service-role. Used ONLY for DB writes (cache refresh)
  //     that would otherwise be blocked by the Phase 2 RLS lockdown which
  //     revokes INSERT/UPDATE/DELETE on watchlist_assets from authenticated.
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const admin = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
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
  for (const row of (wlRows ?? []) as unknown as WLRow[]) {
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

  // ── Batch read global cache ──
  const { data: cacheRows, error: cacheErr } = await admin
    .from("global_symbol_scores")
    .select("symbol, score, sentiment, price, price_raw, change, change_raw, name, computed_at")
    .in("symbol", normalized);
  if (cacheErr) console.error("score-api: cache read failed:", cacheErr);

  type CacheRow = {
    symbol: string;
    score: number;
    sentiment: string;
    price: string;
    price_raw: number;
    change: string;
    change_raw: number;
    name: string;
    computed_at: string;
  };
  const cacheBySym = new Map<string, CacheRow>(
    (cacheRows ?? []).map((r) => [(r as CacheRow).symbol.toUpperCase(), r as CacheRow]),
  );

  // Also batch read tracked_symbols.consecutive_failure_count for staleness detection
  const { data: trackedRows } = await admin
    .from("tracked_symbols")
    .select("symbol, consecutive_failure_count")
    .in("symbol", normalized);
  const failuresBySym = new Map<string, number>(
    (trackedRows ?? []).map((r) => [
      (r as { symbol: string }).symbol.toUpperCase(),
      (r as { consecutive_failure_count: number }).consecutive_failure_count,
    ]),
  );

  const viewedSymbols: string[] = [];
  let upstreamCalls = 0;

  for (const sym of normalized) {
    const cached = cacheBySym.get(sym);
    const source: "watchlist" | "lookup" = watchlistBySym.has(sym) ? "watchlist" : "lookup";

    if (cached) {
      // ── Cache hit ──
      const computedAtMs = new Date(cached.computed_at).getTime();
      const ageMs = Date.now() - computedAtMs;
      const failureCount = failuresBySym.get(sym) ?? 0;
      // "Stale" only when we have evidence something is broken: 2h+ old AND failing
      const stale = ageMs > 2 * 60 * 60 * 1000 && failureCount > 0;

      results[sym] = {
        symbol: sym,
        score: cached.score,
        sentiment: cached.sentiment as ScoreResult["sentiment"],
        price: cached.price,
        priceRaw: cached.price_raw,
        change: cached.change,
        changeRaw: cached.change_raw,
        name: cached.name,
        rsi: 0,             // not cached; analyze-view still populates these on fresh compute
        signal: "neutral",
        color: "gray-500",
        bearish: { state: "IDLE", isDiverging: false, score: 0 },
        bullish: { state: "IDLE", isDiverging: false, score: 0 },
        source,
        cached: true,
        stale,
      } as ScoreResult & { stale: boolean };

      viewedSymbols.push(sym);
      continue;
    }

    // ── Cache miss ──
    // For lookup-source symbols (not on any watchlist) we still gate the user
    // with the daily-lookup quota before computing. Watchlist-source misses
    // bypass the quota (the symbol was added to a watchlist through add-watchlist-asset
    // which has its own tier gating).
    if (source === "lookup") {
      const gate = await canLookupScore(supabase, user.id, sym);
      if (!gate.allowed) {
        errors[sym] = {
          code: gate.code ?? "LOOKUP_DENIED",
          message: gate.reason ?? "Lookup denied",
        };
        continue;
      }
      if (!eff.isOwner && eff.entitlements.dailyScoreLookupLimit !== null) {
        const { data: ok, error: rpcErr } = await supabase.rpc("consume_score_lookup");
        if (rpcErr || ok === false) {
          errors[sym] = {
            code: "RATE_LIMITED",
            message: "Daily score lookup limit reached. Upgrade for unlimited lookups.",
          };
          continue;
        }
      }
    }

    try {
      if (upstreamCalls > 0) await new Promise((r) => setTimeout(r, 300));
      upstreamCalls++;
      const fresh = await getRemiScore(sym);
      const now = new Date();

      // Insert tracked_symbols row FIRST so global_symbol_scores' FK is satisfied.
      // Use ignoreDuplicates so we don't clobber view_count on existing rows —
      // the view gets recorded via record_symbol_views at the end, covering both
      // the genuinely-new insert case (view_count starts at 0 from the default
      // column, then the RPC bumps it to 1) and the "symbol was already tracked
      // but cache was empty" case (view_count just increments).
      await admin.from("tracked_symbols").upsert(
        {
          symbol: sym,
          next_refresh_at: new Date(
            now.getTime() + 900 * 1000 + Math.floor(Math.random() * 60) * 1000,
          ).toISOString(),
          refresh_interval_sec: 900,
          last_successful_refresh_at: now.toISOString(),
        },
        { onConflict: "symbol", ignoreDuplicates: true },
      );

      await admin.from("global_symbol_scores").upsert({
        symbol: sym,
        score: fresh.score,
        sentiment: fresh.sentiment,
        price: fresh.price,
        price_raw: fresh.priceRaw,
        change: fresh.change,
        change_raw: fresh.changeRaw,
        name: fresh.name,
        computed_at: now.toISOString(),
      }, { onConflict: "symbol" });

      viewedSymbols.push(sym);
      results[sym] = { ...fresh, source, cached: false } as ScoreResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const isInvalid =
        message.includes("Binance API error 4") ||
        message.includes("No data") ||
        message.includes("invalid_symbol") ||
        message.includes("not found");
      errors[sym] = { code: isInvalid ? "invalid_symbol" : "fetch_failed", message };
    }
  }

  // ── Batch record views for every successfully-returned symbol ──
  // This covers both cache hits and successful cache-miss computes. Cache-miss
  // failures are excluded (viewedSymbols is only pushed on success). For new
  // inserts, view_count starts at 0 (DB default) and the RPC bumps it to 1;
  // for existing rows it simply increments — no reset risk.
  if (viewedSymbols.length > 0) {
    // Single UPDATE … WHERE symbol IN (...) is atomic enough; view_count increments
    // are advisory so the `view_count + 1` race is acceptable (worst case: undercount
    // during concurrent reads, which is fine for eviction decisions).
    await admin.rpc("record_symbol_views", { p_symbols: viewedSymbols });
  }

  // Strip engine detail for non-owners
  if (!eff.isOwner) {
    for (const sym of Object.keys(results)) {
      delete (results[sym] as unknown as Record<string, unknown>).detail;
    }
  }

  return jsonResponse(200, { results, errors });
});
