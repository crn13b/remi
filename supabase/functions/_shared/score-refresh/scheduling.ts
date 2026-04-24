/**
 * Pure scheduling math for the refresh cron. Kept separate from the
 * Edge Function body so it can be unit-tested in isolation without
 * touching Supabase or network.
 */

const JITTER_MAX_SECONDS = 60;
const BACKOFF_BASE_SECONDS = 60;
const BACKOFF_CAP_SECONDS = 900;

/**
 * Exponential backoff with a cap. `failureCount` is the number of
 * consecutive failures INCLUDING the one that just happened.
 *
 *   failureCount=1 → 120s  (60 * 2^1)
 *   failureCount=2 → 240s
 *   failureCount=3 → 480s
 *   failureCount=4+ → 900s  (capped)
 */
export function backoffSeconds(failureCount: number): number {
  const exp = BACKOFF_BASE_SECONDS * Math.pow(2, failureCount);
  return Math.min(BACKOFF_CAP_SECONDS, exp);
}

/**
 * When should a symbol next refresh after a successful compute?
 * Adds a 0-60 second jitter to prevent clustered refreshes.
 *
 * `rng` is injectable for tests; defaults to Math.random.
 */
export function nextSuccessfulRefreshAt(
  now: Date,
  intervalSec: number,
  rng: () => number = Math.random,
): Date {
  const jitterSec = Math.floor(rng() * JITTER_MAX_SECONDS);
  return new Date(now.getTime() + (intervalSec + jitterSec) * 1000);
}

/**
 * When should a symbol next refresh after a failed compute?
 * Uses exponential backoff based on `newFailureCount` (the count AFTER
 * incrementing for this failure).
 */
export function nextFailureBackoffAt(now: Date, newFailureCount: number): Date {
  return new Date(now.getTime() + backoffSeconds(newFailureCount) * 1000);
}
