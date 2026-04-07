// Supabase Edge Function — Test Data Fetching (Auth Required)
// Deploy: supabase functions deploy test-data
//
// Internal debug endpoint — requires authentication.
//
// Usage:
//   curl -X POST https://<project>.supabase.co/functions/v1/test-data \
//     -H "Content-Type: application/json" \
//     -H "Authorization: Bearer <access_token>" \
//     -d '{"symbol":"BTC","timeframe":"1d","limit":50}'

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchCandles } from "../_shared/data-providers/index.ts";
import { Timeframe } from "../_shared/types.ts";

const VALID_TIMEFRAMES = new Set(["15m", "1h", "4h", "1d", "3d", "1w"]);

const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:5173";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": APP_URL,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  // Require authentication
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  try {
    const body = await req.json();
    const { symbol, timeframe, limit } = body as {
      symbol?: string;
      timeframe?: string;
      limit?: number;
    };

    // Validate inputs
    if (!symbol || typeof symbol !== "string") {
      return jsonResponse(400, { error: 'Missing or invalid "symbol" (e.g. "BTC", "AAPL")' });
    }

    if (!timeframe || !VALID_TIMEFRAMES.has(timeframe)) {
      return jsonResponse(400, {
        error: `Invalid "timeframe". Must be one of: ${[...VALID_TIMEFRAMES].join(", ")}`,
      });
    }

    const candleLimit = Math.min(Math.max(limit ?? 50, 1), 500);

    // Fetch candles via the unified router
    const startTime = Date.now();
    const result = await fetchCandles(symbol, timeframe as Timeframe, candleLimit);
    const elapsed = Date.now() - startTime;

    return jsonResponse(200, {
      symbol: symbol.toUpperCase(),
      timeframe,
      source: result.source,
      assetClass: result.assetClass,
      cached: result.cached,
      count: result.candles.length,
      elapsedMs: elapsed,
      // Show first and last candle as a quick sanity check
      firstCandle: result.candles[0] ?? null,
      lastCandle: result.candles[result.candles.length - 1] ?? null,
      candles: result.candles,
    });
  } catch (err) {
    console.error("test-data error:", err);
    return jsonResponse(500, {
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

function jsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
