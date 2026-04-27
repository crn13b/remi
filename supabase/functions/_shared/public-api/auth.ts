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
 * Returns the trimmed token string (without scheme), or null if the header
 * is missing or malformed.
 *
 * Implementation notes:
 * - Splits on the first run of any whitespace character (`\s`), which
 *   includes SP, TAB, CR, LF, FF. HTTP/1.1 only uses SP/TAB inside header
 *   values, so the broader match is harmless and the format gate downstream
 *   (`isValidTokenFormat`) rejects anything that wouldn't be a valid token
 *   anyway.
 * - Trailing whitespace on the token is trimmed. A header like
 *   `"Bearer abc   "` yields token `"abc"`, not `"abc   "`. This is lenient
 *   by design.
 *
 * The HTTP runtime is expected to have already validated the header value
 * (Deno's Headers.get follows the Fetch spec, which forbids CR/LF in header
 * values and normalizes whitespace). The parser tolerates `\s` runs anyway
 * for safety in tests and unusual transports, but the format gate
 * (`isValidTokenFormat`) is what actually defends against attacker garbage.
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
 *
 * Callers MUST run `isValidTokenFormat(token)` first. This function will
 * happily hash anything (empty strings, megabytes of garbage, attacker-
 * controlled bytes) — the format gate is what prevents waste and timing
 * differences before the DB lookup.
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
