// supabase/functions/_shared/public-api/auth.ts
// Bearer token parsing, format validation, SHA-256 hashing.
//
// Token format: "remi_live_" + 64 lowercase hex chars (32 bytes of entropy).
// We hash with SHA-256 and look up by hash; the index lookup time dominates
// any timing leakage from the comparison itself, so we don't need a JS-side
// constant-time compare.

const TOKEN_PREFIX = "remi_live_";
const TOKEN_HEX_LEN = 64;
const TOKEN_FULL_LEN = TOKEN_PREFIX.length + TOKEN_HEX_LEN;

/**
 * Parse a Bearer token from an Authorization header value.
 * Returns the raw token string (without scheme), or null if the header is
 * missing or malformed.
 */
export function parseBearerToken(header: string | null): string | null {
  if (!header) return null;
  // Split on first whitespace run.
  const match = header.match(/^(\S+)\s+(\S.*)$/);
  if (!match) return null;
  const [, scheme, rest] = match;
  if (scheme.toLowerCase() !== "bearer") return null;
  const token = rest.trim();
  return token.length > 0 ? token : null;
}

/**
 * Check that a token has the expected shape before hashing. Avoids hashing
 * arbitrary attacker-controlled byte sequences.
 */
export function isValidTokenFormat(token: string): boolean {
  if (token.length !== TOKEN_FULL_LEN) return false;
  if (!token.startsWith(TOKEN_PREFIX)) return false;
  const hex = token.slice(TOKEN_PREFIX.length);
  return /^[0-9a-f]{64}$/.test(hex);
}

/**
 * SHA-256 hash a token, return lowercase hex (64 chars).
 */
export async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  // Copy into a fresh ArrayBuffer to satisfy strict BufferSource typing in Deno.
  const buf = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const arr = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < arr.length; i++) {
    hex += arr[i].toString(16).padStart(2, "0");
  }
  return hex;
}
