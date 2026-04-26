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
  if (text.length > MAX_BODY_BYTES) return null;
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

  return jsonResponse(501, { error: "not_implemented", keyId: keyRow.id, bodyText });
});
