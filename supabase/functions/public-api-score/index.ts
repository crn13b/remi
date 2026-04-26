// supabase/functions/public-api-score/index.ts
// Public score API. API-key authenticated, reads from global_symbol_scores,
// returns scores with deterministic ±2 noise. See spec at
// docs/superpowers/specs/2026-04-25-public-score-api-mvp-design.md.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  hashToken,
  isValidTokenFormat,
  parseBearerToken,
} from "../_shared/public-api/auth.ts";
import { applyScoreNoise } from "../_shared/public-api/noise.ts";
import { scoreToSentiment } from "../_shared/remi-score/engine.ts";
import type {
  PublicScoreResponse,
  PublicScoreResult,
  PublicSymbolError,
} from "../_shared/public-api/types.ts";

const MAX_BODY_BYTES = 8 * 1024;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

const JSON_HEADERS: Record<string, string> = {
  ...CORS_HEADERS,
  "Content-Type": "application/json; charset=utf-8",
};

function jsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function readBodyText(req: Request): Promise<string | null> {
  const lenHeader = req.headers.get("content-length");
  if (lenHeader) {
    const len = parseInt(lenHeader, 10);
    if (!Number.isFinite(len) || len < 0) return null;
    if (len > MAX_BODY_BYTES) return null;
  }
  const text = await req.text();
  // Measure byte length, not UTF-16 code unit length. A request without a
  // Content-Length header (chunked transfer) could otherwise sneak past the
  // cap with multi-byte UTF-8 chars where 1 code unit = up to 4 bytes.
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return null;
  return text;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  // ── Auth: parse and validate bearer token ──
  const rawHeader = req.headers.get("authorization");
  const token = parseBearerToken(rawHeader);
  if (!token || !isValidTokenFormat(token)) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  const tokenHash = await hashToken(token);

  const { data: keyRow, error: keyErr } = await supabase
    .from("api_keys")
    .select("id")
    .eq("key_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (keyErr) {
    console.error("public-api-score: api_keys lookup error", keyErr);
    return jsonResponse(500, { error: "internal_error" });
  }
  if (!keyRow) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  // ── Rate limit ──
  // RPC signature is `consume_api_request(p_key_id uuid)` returning a single
  // row `(allowed boolean, rate_limit_per_min int, retry_after_seconds int)`.
  // The RPC owns the rate-limit decision — it looks up the key's
  // rate_limit_per_min itself rather than trusting a caller-supplied value.
  // It also bumps last_used_at on the api_keys row in the same transaction.
  const { data: rateRows, error: rateErr } = await supabase.rpc(
    "consume_api_request",
    { p_key_id: keyRow.id },
  );
  if (rateErr) {
    console.error("public-api-score: consume_api_request error", rateErr);
    return jsonResponse(500, { error: "internal_error" });
  }
  // RPC returns a setof; pick the first (and only) row.
  const rateRow = Array.isArray(rateRows) ? rateRows[0] : rateRows;
  if (!rateRow || rateRow.allowed !== true) {
    const retryAfter = Number(rateRow?.retry_after_seconds ?? 60);
    return jsonResponse(
      429,
      { error: "rate_limited", retry_after_seconds: retryAfter },
      { "Retry-After": String(retryAfter) },
    );
  }

  // ── Body cap ──
  const bodyText = await readBodyText(req);
  if (bodyText === null) {
    return jsonResponse(413, { error: "payload_too_large" });
  }

  // ── Parse body ──
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return jsonResponse(400, {
      error: "invalid_request",
      message: "Body is not valid JSON.",
    });
  }
  if (typeof body !== "object" || body === null) {
    return jsonResponse(400, {
      error: "invalid_request",
      message: "Body must be a JSON object.",
    });
  }

  const symbols = (body as { symbols?: unknown }).symbols;
  if (!Array.isArray(symbols)) {
    return jsonResponse(400, {
      error: "invalid_request",
      message: "Field 'symbols' must be an array.",
    });
  }
  if (symbols.length === 0) {
    return jsonResponse(400, {
      error: "invalid_request",
      message: "At least one symbol is required.",
    });
  }
  if (symbols.length > 30) {
    return jsonResponse(400, {
      error: "invalid_request",
      message: "Maximum 30 symbols per request.",
    });
  }

  // Normalize: trim, uppercase, dedup. Track per-symbol invalid format errors.
  const normalized: string[] = [];
  const errors: Record<string, { code: string; message: string }> = {};
  const seen = new Set<string>();
  const SYMBOL_RE = /^[A-Z0-9._-]{1,12}$/;
  for (const raw of symbols) {
    if (typeof raw !== "string") {
      return jsonResponse(400, {
        error: "invalid_request",
        message: "All entries in 'symbols' must be strings.",
      });
    }
    const sym = raw.trim().toUpperCase();
    if (!SYMBOL_RE.test(sym)) {
      errors[sym || "(empty)"] = {
        code: "invalid_symbol",
        message: "Symbol must match ^[A-Z0-9._-]{1,12}$ after uppercasing.",
      };
      continue;
    }
    if (!seen.has(sym)) {
      seen.add(sym);
      normalized.push(sym);
    }
  }

  // Skip the cache read entirely if every submitted symbol failed regex
  // validation. Without this, supabase-js issues `symbol=in.()` against
  // PostgREST, which returns a Postgres syntax error and we'd 500 the user
  // for what is actually a clean all-errors response.
  if (normalized.length === 0) {
    const responseBody: PublicScoreResponse = {
      results: {},
      errors: errors as Record<string, PublicSymbolError>,
    };
    return jsonResponse(200, responseBody);
  }

  // ── Cache read ──
  type CacheRow = {
    symbol: string;
    score: number;
    price: string;
    price_raw: number;
    change: string;
    change_raw: number;
    name: string;
    computed_at: string;
  };
  const { data: cacheRows, error: cacheErr } = await supabase
    .from("global_symbol_scores")
    .select("symbol, score, price, price_raw, change, change_raw, name, computed_at")
    .in("symbol", normalized);

  if (cacheErr) {
    console.error("public-api-score: cache read error", cacheErr);
    return jsonResponse(500, { error: "internal_error" });
  }

  const rowsBySymbol = new Map<string, CacheRow>();
  for (const r of (cacheRows ?? []) as CacheRow[]) {
    rowsBySymbol.set(r.symbol.toUpperCase(), r);
  }

  // ── Build response ──
  const results: Record<string, PublicScoreResult> = {};
  const finalErrors: Record<string, PublicSymbolError> = {};
  for (const sym of Object.keys(errors)) {
    finalErrors[sym] = errors[sym] as PublicSymbolError;
  }

  for (const sym of normalized) {
    const row = rowsBySymbol.get(sym);
    if (!row) {
      finalErrors[sym] = {
        code: "not_tracked",
        message:
          "Symbol not in cache. Add it to a watchlist or trigger a lookup via the REMi UI to begin tracking.",
      };
      continue;
    }
    // Apply ±2 noise, then re-derive sentiment from the perturbed score so
    // displayed score and displayed sentiment never disagree (which would
    // leak the raw score at band boundaries).
    const noisyScore = await applyScoreNoise(row.score, sym, keyRow.id, row.computed_at);
    results[sym] = {
      symbol: sym,
      score: noisyScore,
      sentiment: scoreToSentiment(noisyScore),
      price: row.price,
      price_raw: row.price_raw,
      change: row.change,
      change_raw: row.change_raw,
      name: row.name,
      computed_at: row.computed_at,
    };
  }

  // last_used_at was already bumped inside consume_api_request, so no
  // additional UPDATE is needed here.

  const responseBody: PublicScoreResponse = { results, errors: finalErrors };
  return jsonResponse(200, responseBody);
});
