// supabase/functions/refresh-global-scores/index.ts
/**
 * refresh-global-scores — 1-minute cron Edge Function
 *
 * Selects up to 20 tracked symbols whose next_refresh_at has elapsed,
 * partitioned as (8 stocks + 12 crypto) to respect Twelve Data rate limits
 * without starving crypto when many stocks are due. For each symbol:
 *   - On success: UPSERT global_symbol_scores, reset failure counter,
 *     schedule next_refresh_at = now + interval + jitter.
 *   - On failure: increment failure counter, push out next_refresh_at with
 *     exponential backoff.
 *
 * Triggered by: pg_cron (every 1 minute)
 * Auth: x-cron-secret header must match CRON_SECRET env var.
 * Env vars: CRON_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getRemiScore } from "../_shared/remi-score/engine.ts";
import { classifyProvider } from "../_shared/score-refresh/provider-routing.ts";
import {
  nextSuccessfulRefreshAt,
  nextFailureBackoffAt,
} from "../_shared/score-refresh/scheduling.ts";

const MAX_STOCKS_PER_TICK = 8;
const MAX_CRYPTO_PER_TICK = 12;
const STOCK_CALL_DELAY_MS = 500;

interface TrackedRow {
  symbol: string;
  refresh_interval_sec: number;
  consecutive_failure_count: number;
}

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
  // ── Auth ──
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (!expectedSecret) {
    console.error("refresh-global-scores: CRON_SECRET env var not set");
    return jsonResponse(500, { error: "server misconfigured" });
  }
  if (req.headers.get("x-cron-secret") !== expectedSecret) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  const startedAt = Date.now();
  let refreshed = 0;
  let failed = 0;

  try {
    // ── Select due symbols, one query per asset class so stocks can't
    //    starve crypto (and vice versa) during a catch-up burst. We pull
    //    a small buffer (×4) and classify on the server side, because the
    //    table doesn't store provider class — classification is derived
    //    from the symbol string.
    const nowIso = new Date().toISOString();
    const { data: candidateRows, error: candidateErr } = await supabase
      .from("tracked_symbols")
      .select("symbol, refresh_interval_sec, consecutive_failure_count")
      .lte("next_refresh_at", nowIso)
      .lt("consecutive_failure_count", 10)    // ← skip dead-letter rows
      .order("next_refresh_at", { ascending: true })
      .limit((MAX_STOCKS_PER_TICK + MAX_CRYPTO_PER_TICK) * 4);

    if (candidateErr) {
      console.error("refresh-global-scores: select due failed:", candidateErr);
      return jsonResponse(500, { error: "select failed" });
    }

    const stocks: TrackedRow[] = [];
    const crypto: TrackedRow[] = [];
    for (const row of (candidateRows ?? []) as TrackedRow[]) {
      const cls = classifyProvider(row.symbol);
      if (cls === "stock" && stocks.length < MAX_STOCKS_PER_TICK) {
        stocks.push(row);
      } else if (cls === "crypto" && crypto.length < MAX_CRYPTO_PER_TICK) {
        crypto.push(row);
      }
      if (stocks.length >= MAX_STOCKS_PER_TICK && crypto.length >= MAX_CRYPTO_PER_TICK) break;
    }

    // ── Process stocks sequentially with delay (Twelve Data rate limit) ──
    for (let i = 0; i < stocks.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, STOCK_CALL_DELAY_MS));
      const ok = await refreshOneSymbol(stocks[i]);
      if (ok) refreshed++; else failed++;
    }

    // ── Process crypto sequentially (no delay — cheap providers) ──
    for (const row of crypto) {
      const ok = await refreshOneSymbol(row);
      if (ok) refreshed++; else failed++;
    }

    const durationMs = Date.now() - startedAt;
    console.log(
      `refresh-global-scores: refreshed=${refreshed} failed=${failed} duration=${durationMs}ms`,
    );
    return jsonResponse(200, { refreshed, failed, durationMs });
  } catch (err) {
    console.error("refresh-global-scores: unexpected error:", err);
    return jsonResponse(500, { error: "internal" });
  }
});

/**
 * Refresh one symbol. Returns true on success, false on failure.
 * All state transitions (cache write + scheduling) happen here.
 */
async function refreshOneSymbol(row: TrackedRow): Promise<boolean> {
  const { symbol, refresh_interval_sec, consecutive_failure_count } = row;
  try {
    const result = await getRemiScore(symbol);
    const now = new Date();

    // UPSERT cache
    const { error: upsertErr } = await supabase
      .from("global_symbol_scores")
      .upsert({
        symbol,
        score: result.score,
        sentiment: result.sentiment,
        price: result.price,
        price_raw: result.priceRaw,
        change: result.change,
        change_raw: result.changeRaw,
        name: result.name,
        computed_at: now.toISOString(),
      }, { onConflict: "symbol" });
    if (upsertErr) {
      console.error(`refresh ${symbol} upsert failed:`, upsertErr);
      return markFailure(symbol, consecutive_failure_count, upsertErr.message);
    }

    // Advance clock + reset failure counter
    const { error: updErr } = await supabase
      .from("tracked_symbols")
      .update({
        next_refresh_at: nextSuccessfulRefreshAt(now, refresh_interval_sec).toISOString(),
        consecutive_failure_count: 0,
        last_refresh_error: null,
        last_successful_refresh_at: now.toISOString(),
      })
      .eq("symbol", symbol);
    if (updErr) {
      console.error(
        `refresh ${symbol}: cache upserted but schedule update failed — symbol will be re-selected on next tick:`,
        updErr,
      );
      return false;
    }

    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return markFailure(symbol, consecutive_failure_count, message);
  }
}

async function markFailure(
  symbol: string,
  prevFailureCount: number,
  message: string,
): Promise<false> {
  const newCount = prevFailureCount + 1;
  const now = new Date();
  const { error } = await supabase
    .from("tracked_symbols")
    .update({
      next_refresh_at: nextFailureBackoffAt(now, newCount).toISOString(),
      consecutive_failure_count: newCount,
      last_refresh_error: message.slice(0, 500),
    })
    .eq("symbol", symbol);
  if (error) {
    console.error(
      `mark-failure ${symbol} update failed (symbol will retry on next tick until DB recovers or failure_count reaches 10):`,
      error,
    );
  }
  return false;
}
