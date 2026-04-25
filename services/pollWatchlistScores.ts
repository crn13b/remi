/**
 * Start a 60s poll that re-fetches scores for the active watchlist.
 * Pauses when the tab is hidden to save invocations; on visibility
 * restore, fires an immediate catch-up poll, then resumes cadence.
 *
 * Returns a cleanup function that tears down all timers and listeners.
 */

import { getBatchScores } from "./remiScore";
import type { WatchlistGroup } from "./watchlistService";

const POLL_INTERVAL_MS = 60_000;

type SetWatchlists = (
  updater: (prev: WatchlistGroup[]) => WatchlistGroup[],
) => void;
type GetWatchlists = () => WatchlistGroup[];
type GetActiveWatchlistId = () => string | null;

export function startWatchlistScorePolling(
  getWatchlists: GetWatchlists,
  getActiveWatchlistId: GetActiveWatchlistId,
  setWatchlists: SetWatchlists,
): () => void {
  let intervalId: number | null = null;
  let inFlight = false;

  const poll = async () => {
    if (inFlight) return;                                      // skip if prior poll still running
    if (document.visibilityState !== "visible") return;        // don't poll hidden tabs

    // Only poll the active watchlist. Polling every loaded watchlist would
    // burn invocations and quota for off-screen lists the user can't see.
    const activeId = getActiveWatchlistId();
    if (!activeId) return;
    const activeList = getWatchlists().find((wl) => wl.id === activeId);
    if (!activeList) return;

    const symbols = [...new Set(activeList.assets.map((a) => a.symbol))];
    if (symbols.length === 0) return;

    inFlight = true;
    try {
      const results = await getBatchScores(symbols);
      setWatchlists((prev) =>
        prev.map((wl) => {
          // Only patch the active watchlist; leave other lists untouched.
          if (wl.id !== activeId) return wl;
          return {
            ...wl,
            assets: wl.assets.map((a) => {
              const r = results.get(a.symbol.toUpperCase());
              if (!r) return a;
              // Only patch fields that actually changed, preserving referential
              // equality when the score hasn't moved (lets memoized rows skip re-render).
              if (
                a.score === r.score &&
                a.price === r.price &&
                a.change === r.change &&
                a.sentiment === r.sentiment &&
                (a.stale ?? false) === (r.stale ?? false)
              ) {
                return a;
              }
              return {
                ...a,
                score: r.score,
                price: r.price ?? a.price,
                change: r.change ?? a.change,
                sentiment: r.sentiment ?? a.sentiment,
                color: r.color ?? a.color,
                stale: r.stale ?? false,
              };
            }),
          };
        }),
      );
    } catch (err) {
      // Swallow: polling is best-effort. Next tick will retry.
      console.warn("pollWatchlistScores: fetch failed:", err);
    } finally {
      inFlight = false;
    }
  };

  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      // Fire a catch-up poll immediately, then the next regular tick
      // continues on schedule (no timer reset — we never cleared it).
      poll();
    }
  };

  intervalId = window.setInterval(poll, POLL_INTERVAL_MS);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    if (intervalId !== null) window.clearInterval(intervalId);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
