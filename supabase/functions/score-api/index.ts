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
import {
  decideLatchUpdates,
  type CurrentState,
  type LatchRow,
} from "../_shared/last-call/upsert.ts";

const MAX_BATCH_SIZE = 30;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

interface LastCallResponse {
  score: number;
  side: "bullish" | "bearish";
  price: number;
  at: string;
  peakScore: number;
  peakScoreAt: string;
  peakMove: number;
  peakMoveAt: string;
  currentMove: number; // (currentPrice - callPrice) / callPrice, computed per request
}

type ScoreResult = RemiScoreResult & {
  source?: "watchlist" | "lookup";
  cached?: boolean;
  lastCall?: LastCallResponse | null;
};

function jsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Admin client is typed loosely here: the concrete return type of
// `createClient<Database>` is awkward to reference without a generated
// Database type, and we only need the generic query/rpc surface.
// deno-lint-ignore no-explicit-any
type AdminClient = any;

const LATCH_COLUMNS =
  "symbol, last_call_score, last_call_side, last_call_price, last_call_at, last_call_peak_score, last_call_peak_score_at, last_call_peak_move, last_call_peak_move_at";

/** Build the response-shape lastCall from a LatchRow. Returns null if no latch. */
function buildLastCallResponse(
  row: LatchRow | null,
  currentPrice: number,
): LastCallResponse | null {
  if (
    !row ||
    row.last_call_score === null ||
    row.last_call_side === null ||
    row.last_call_price === null ||
    row.last_call_at === null
  ) {
    return null;
  }
  return {
    score: row.last_call_score,
    side: row.last_call_side,
    price: row.last_call_price,
    at: row.last_call_at,
    peakScore: row.last_call_peak_score ?? row.last_call_score,
    peakScoreAt: row.last_call_peak_score_at ?? row.last_call_at,
    peakMove: row.last_call_peak_move ?? 0,
    peakMoveAt: row.last_call_peak_move_at ?? row.last_call_at,
    currentMove: (currentPrice - row.last_call_price) / row.last_call_price,
  };
}

/** True when the runtime kill switch is engaged; latch reads/writes are skipped. */
function latchDisabled(): boolean {
  return Deno.env.get("REMI_LATCH_DISABLED") === "1";
}

/** Read-only fetch of the latch row. Returns null on error (best-effort). */
async function fetchLatchRow(
  admin: AdminClient,
  symbol: string,
): Promise<LatchRow | null> {
  if (latchDisabled()) return null;
  try {
    const { data } = await admin
      .from("asset_last_call")
      .select(LATCH_COLUMNS)
      .eq("symbol", symbol)
      .maybeSingle();
    return (data ?? null) as LatchRow | null;
  } catch (e) {
    console.error(`latch read failed for ${symbol}:`, e);
    return null;
  }
}

/** For a fresh-computed score, run the latch decision + any required RPC
 *  writes, then return the latest latch row for building the response.
 *  Best-effort — errors are logged but don't fail the response. Uses the
 *  admin client (service-role) because asset_last_call is RLS-locked.
 */
async function runLatchAndFetch(
  admin: AdminClient,
  symbol: string,
  score: number,
  currentPrice: number,
  previousScore: number | null,
): Promise<LatchRow | null> {
  if (latchDisabled()) return null;
  const candleTs = new Date().toISOString();

  try {
    const { data: rowData } = await admin
      .from("asset_last_call")
      .select(LATCH_COLUMNS)
      .eq("symbol", symbol)
      .maybeSingle();
    const row = (rowData ?? null) as LatchRow | null;

    const state: CurrentState = {
      symbol,
      score,
      currentPrice,
      candleTimestamp: candleTs,
      previousScore,
    };
    const updates = decideLatchUpdates(state, row);

    for (const u of updates) {
      const rpcParams: Record<string, unknown> = {
        p_symbol: u.symbol,
        p_mode: u.mode,
        p_score: null,
        p_side: null,
        p_price: null,
        p_call_at: null,
        p_peak_score: null,
        p_peak_score_at: null,
        p_peak_move: null,
        p_peak_move_at: null,
      };
      if (u.mode === "new_call") {
        rpcParams.p_score = u.score;
        rpcParams.p_side = u.side;
        rpcParams.p_price = u.price;
        rpcParams.p_call_at = u.callAt;
      } else if (u.mode === "peak_update") {
        rpcParams.p_peak_score = u.peakScore;
        rpcParams.p_peak_score_at = u.peakScoreAt;
      } else if (u.mode === "move_update") {
        rpcParams.p_peak_move = u.peakMove;
        rpcParams.p_peak_move_at = u.peakMoveAt;
      }
      const { error: rpcErr } = await admin.rpc(
        "upsert_asset_last_call",
        rpcParams,
      );
      if (rpcErr) {
        console.error(`latch RPC failed for ${symbol}:`, rpcErr);
      }
    }

    // If any update fired, re-read so the response reflects the latest
    // state. Otherwise the original row is still current.
    if (updates.length > 0) {
      const { data: latestData } = await admin
        .from("asset_last_call")
        .select(LATCH_COLUMNS)
        .eq("symbol", symbol)
        .maybeSingle();
      return (latestData ?? null) as LatchRow | null;
    }
    return row;
  } catch (e) {
    console.error(`latch block threw for ${symbol}:`, e);
    return null;
  }
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
            // We don't have a fresh price on the cached path, so currentMove
            // is computed against the latch call price itself (i.e. 0). The
            // historical peakMove is still surfaced, which is the main
            // display value. A future follow-up could store cached_price
            // alongside cached_score for a non-zero currentMove here.
            const latch = await fetchLatchRow(admin, sym);
            const lastCall = latch && latch.last_call_price !== null
              ? buildLastCallResponse(latch, latch.last_call_price)
              : null;
            const cachedResult = {
              symbol: sym,
              score: wlRow!.cached_score as number,
              source: "watchlist" as const,
              cached: true,
              lastCall,
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
          // Uses `admin` (service-role) because Phase 2 RLS lockdown revokes
          // UPDATE on watchlist_assets from authenticated. Without this, the
          // write silently fails and the 4h cache is effectively bypassed.
          const wlIds = [...activeWatchlistIds];
          if (wlIds.length > 0) {
            const { error: cacheErr } = await admin
              .from("watchlist_assets")
              .update({ cached_score: fresh.score, last_refreshed_at: nowIso })
              .eq("symbol", sym)
              .in("watchlist_id", wlIds);
            if (cacheErr) {
              console.error(`score-api cache refresh failed for ${sym}:`, cacheErr);
            }
          }

          // Previous score: use the cached_score if we had one (it's what
          // was last observed for this user's watchlist). Null if absent.
          const prevScore = wlRow!.cached_score ?? null;
          const latch = await runLatchAndFetch(admin, sym, fresh.score, fresh.priceRaw, prevScore);
          const lastCall = buildLastCallResponse(latch, fresh.priceRaw);
          const out = { ...fresh, source: "watchlist" as const, lastCall } as ScoreResult;
          results[sym] = out;
        } else {
          // Paid/owner: always real-time.
          if (upstreamCalls > 0) await new Promise((r) => setTimeout(r, 300));
          upstreamCalls++;
          const fresh = await getRemiScore(sym);
          const prevScore = wlRow!.cached_score ?? null;
          const latch = await runLatchAndFetch(admin, sym, fresh.score, fresh.priceRaw, prevScore);
          const lastCall = buildLastCallResponse(latch, fresh.priceRaw);
          const out = { ...fresh, source: "watchlist" as const, lastCall } as ScoreResult;
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
        // The RPC derives uid via auth.uid() and cap via profiles.plan, so
        // we pass no arguments — see 20260408120000_harden_consume_score_lookup.sql.
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

        if (upstreamCalls > 0) await new Promise((r) => setTimeout(r, 300));
        upstreamCalls++;
        const fresh = await getRemiScore(sym);
        // Lookup path has no per-user prior score; previousScore = null.
        const latch = await runLatchAndFetch(admin, sym, fresh.score, fresh.priceRaw, null);
        const lastCall = buildLastCallResponse(latch, fresh.priceRaw);
        const out = { ...fresh, source: "lookup" as const, lastCall } as ScoreResult;
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
