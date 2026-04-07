// supabase/functions/score-api/index.ts
/**
 * score-api — Authenticated score endpoint
 *
 * Accepts: POST { symbols: string[] }
 * Returns: { results: Record<string, RemiScoreResult>, errors: Record<string, { code, message }> }
 *
 * Auth: Requires valid Supabase JWT in Authorization header.
 * Deploy: supabase functions deploy score-api
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getRemiScore } from "../_shared/remi-score/engine.ts";
import type { RemiScoreResult } from "../_shared/remi-score/engine.ts";

const MAX_BATCH_SIZE = 30;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
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

  // ── Check user plan for founder-only features ──
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();
  const isFounder = profile?.plan === "founder";

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

  // ── Fetch scores ──
  // Errors are structured: { code, message } so the frontend can distinguish
  // "invalid_symbol" (don't retry) from "fetch_failed" (transient, retry later).
  const results: Record<string, RemiScoreResult> = {};
  const errors: Record<string, { code: string; message: string }> = {};

  for (let i = 0; i < normalized.length; i++) {
    const sym = normalized[i];
    try {
      const result = await getRemiScore(sym);
      results[sym] = result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const isInvalid = message.includes("Binance API error 4") || message.includes("No data") || message.includes("invalid_symbol") || message.includes("not found");
      const code = isInvalid ? "invalid_symbol" : "fetch_failed";
      errors[sym] = { code, message };
    }

    // Rate-limit delay between symbols (same as existing engine.ts pattern)
    if (i < normalized.length - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // Strip engine detail for non-founders
  if (!isFounder) {
    for (const sym of Object.keys(results)) {
      delete (results[sym] as Record<string, unknown>).detail;
    }
  }

  return jsonResponse(200, { results, errors });
});
