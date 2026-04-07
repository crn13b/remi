import { supabase } from "./supabaseClient";
import { Asset } from "../types";
import { getBatchScores } from "./remiScore";

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
  const { data: lists, error: listsErr } = await supabase
    .from("watchlists")
    .select("*")
    .eq("user_id", userId)
    .order("position", { ascending: true });

  if (listsErr) throw listsErr;
  if (!lists || lists.length === 0) return [];

  const { data: assets, error: assetsErr } = await supabase
    .from("watchlist_assets")
    .select("*")
    .in("watchlist_id", lists.map((l: WatchlistRow) => l.id))
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
      return { ...a, score: r.score, price: r.price, change: r.change, sentiment: r.sentiment, color: r.color };
    }),
  }));

  onUpdate(updated);
}

// ─── Create watchlist ───

export async function createWatchlist(userId: string, name: string, position: number): Promise<string> {
  const { data, error } = await supabase
    .from("watchlists")
    .insert({ user_id: userId, name, position })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

// ─── Rename watchlist ───

export async function renameWatchlist(watchlistId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("watchlists")
    .update({ name })
    .eq("id", watchlistId);

  if (error) throw error;
}

// ─── Delete watchlist ───

export async function deleteWatchlist(watchlistId: string): Promise<void> {
  const { error } = await supabase
    .from("watchlists")
    .delete()
    .eq("id", watchlistId);

  if (error) throw error;
}

// ─── Add asset to watchlist ───

export async function addAsset(watchlistId: string, symbol: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("watchlist_assets")
    .insert({ watchlist_id: watchlistId, symbol, name });

  if (error && error.code !== "23505") throw error; // ignore duplicate
}

// ─── Remove asset from watchlist ───

export async function removeAsset(watchlistId: string, symbol: string): Promise<void> {
  const { error } = await supabase
    .from("watchlist_assets")
    .delete()
    .eq("watchlist_id", watchlistId)
    .eq("symbol", symbol);

  if (error) throw error;
}
