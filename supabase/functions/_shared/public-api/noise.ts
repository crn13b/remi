// supabase/functions/_shared/public-api/noise.ts
// Deterministic ±2 score perturbation. See spec § "Score noise injection"
// for rationale. This is defense-in-depth against casual scraping, NOT
// cryptographic IP protection — a determined adversary can average it out.
//
// Seed derivation uses length-prefixed SHA-256 to prevent symbol/window
// collisions. Uses api_keys.id (UUID) instead of key_hash so the secret
// hash never enters the seed-derivation path.

const WINDOW_SEC = 15 * 60; // 15-minute windows aligned to cache refresh cadence

function uuidToBytes(uuid: string): Uint8Array {
  // Strip dashes, parse as 32 hex chars → 16 bytes.
  const hex = uuid.replace(/-/g, "");
  if (hex.length !== 32 || !/^[0-9a-f]{32}$/i.test(hex)) {
    throw new Error(`invalid UUID: ${uuid}`);
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function u64BeBytes(n: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0, n, false); // big-endian
  return bytes;
}

function lengthPrefixed(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += 1 + p.length; // 1 byte length prefix per part
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    if (p.length > 255) {
      throw new Error(`part too long for u8 length prefix: ${p.length}`);
    }
    out[offset++] = p.length;
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function readU32Be(bytes: Uint8Array): number {
  return ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
}

/**
 * Apply deterministic ±2 noise to a raw score. Output is clamped to [0, 100].
 *
 * @param rawScore  Integer 0-100 from global_symbol_scores.
 * @param symbol    Uppercase ticker.
 * @param keyId     api_keys.id UUID (string with dashes).
 * @param computedAt ISO 8601 UTC string from global_symbol_scores.computed_at.
 */
export async function applyScoreNoise(
  rawScore: number,
  symbol: string,
  keyId: string,
  computedAt: string,
): Promise<number> {
  const keyBytes = uuidToBytes(keyId);
  const symBytes = new TextEncoder().encode(symbol);
  const computedAtSec = Math.floor(new Date(computedAt).getTime() / 1000);
  const windowIndex = BigInt(Math.floor(computedAtSec / WINDOW_SEC));
  const winBytes = u64BeBytes(windowIndex);

  const seedInput = lengthPrefixed([keyBytes, symBytes, winBytes]);
  // Copy into a fresh ArrayBuffer to satisfy strict BufferSource typing in Deno.
  const seedInputBuf = seedInput.buffer.slice(
    seedInput.byteOffset,
    seedInput.byteOffset + seedInput.byteLength,
  ) as ArrayBuffer;
  const seedBuf = await crypto.subtle.digest("SHA-256", seedInputBuf);
  const seed = new Uint8Array(seedBuf);

  const offset = (readU32Be(seed.subarray(0, 4)) % 5) - 2; // {-2,-1,0,1,2}

  let displayed = rawScore + offset;
  if (displayed < 0) displayed = 0;
  if (displayed > 100) displayed = 100;
  return displayed;
}
