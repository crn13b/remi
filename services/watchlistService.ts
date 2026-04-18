import { supabase } from "./supabaseClient";
import { Asset } from "../types";
import { getBatchScores } from "./remiScore";
import { invoke } from "./_invoke";

// ─── DB row types ───

interface WatchlistRow {
  id: string;
  user_id: string;
  name: string;
  position: number;
}

interface WatchlistAssetRow {
  id: string;
  watchlist_id: string;
  symbol: string;
  name: string;
  added_at: string;
}

export interface WatchlistGroup {
  id: string;
  name: string;
  assets: Asset[];
}

// ─── Load ───

export async function loadWatchlists(userId: string): Promise<WatchlistGroup[]> {
  // Only load active watchlists/assets. Soft-disabled rows (from plan
  // downgrades via reconcileEntitlements) must not appear in the UI and
  // must not count against cap math.
  const { data: lists, error: listsErr } = await supabase
    .from("watchlists")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("position", { ascending: true });

  if (listsErr) throw listsErr;
  if (!lists || lists.length === 0) return [];

  const { data: assets, error: assetsErr } = await supabase
    .from("watchlist_assets")
    .select("*")
    .in("watchlist_id", lists.map((l: WatchlistRow) => l.id))
    .eq("is_active", true)
    .order("added_at", { ascending: true });

  if (assetsErr) throw assetsErr;

  return lists.map((wl: WatchlistRow) => ({
    id: wl.id,
    name: wl.name,
    assets: (assets || [])
      .filter((a: WatchlistAssetRow) => a.watchlist_id === wl.id)
      .map((a: WatchlistAssetRow): Asset => ({
        symbol: a.symbol,
        name: a.name,
        price: "—",
        change: "—",
        sentiment: "Hold",
        color: "gray-500",
      })),
  }));
}

// ─── Hydrate scores ───

export async function hydrateWatchlistScores(
  watchlists: WatchlistGroup[],
  onUpdate: (updated: WatchlistGroup[]) => void,
): Promise<void> {
  const allSymbols = [...new Set(watchlists.flatMap(wl => wl.assets.map(a => a.symbol)))];
  if (allSymbols.length === 0) return;

  const results = await getBatchScores(allSymbols);

  const updated = watchlists.map(wl => ({
    ...wl,
    assets: wl.assets.map(a => {
      const r = results.get(a.symbol.toUpperCase());
      if (!r) return a;
      // Only overwrite fields the server actually returned. The cached-score
      // path (free tier, fresh cache) returns a minimal { symbol, score } shape,
      // so spreading r.price/r.change unconditionally would wipe the default
      // "—" placeholder with undefined.
      return {
        ...a,
        score: r.score,
        price: r.price ?? a.price,
        change: r.change ?? a.change,
        sentiment: r.sentiment ?? a.sentiment,
        color: r.color ?? a.color,
      };
    }),
  }));

  onUpdate(updated);
}

// ─── Create watchlist ───
// Signature preserved for App.tsx call sites. `userId`/`position` are ignored —
// the edge function derives the user from the JWT and does not track position.

export async function createWatchlist(_userId: string, name: string, _position: number): Promise<string> {
  const data = await invoke<{ id: string }>("create-watchlist", { name });
  return data.id;
}

// ─── Rename watchlist ───

export async function renameWatchlist(watchlistId: string, name: string): Promise<void> {
  await invoke("rename-watchlist", { id: watchlistId, name });
}

// ─── Delete watchlist ───

export async function deleteWatchlist(watchlistId: string): Promise<void> {
  await invoke("delete-watchlist", { id: watchlistId });
}

// ─── Add asset to watchlist ───

export async function addAsset(watchlistId: string, symbol: string, name: string): Promise<void> {
  try {
    await invoke("add-watchlist-asset", { watchlist_id: watchlistId, symbol, name });
  } catch (err) {
    // Ignore duplicate-insert errors surfaced as a 409/500 from the edge function
    const msg = (err as Error).message ?? "";
    if (!/duplicate|23505|already/i.test(msg)) throw err;
  }
}

// ─── Remove asset from watchlist ───

export async function removeAsset(watchlistId: string, symbol: string): Promise<void> {
  await invoke("remove-watchlist-asset", { watchlist_id: watchlistId, symbol });
}
