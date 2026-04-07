import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { PlanType } from "./types.ts";
import { getEntitlements } from "./tiers.ts";

/**
 * Bidirectional reconciliation: enforces the target plan's caps on the
 * user's existing alerts, watchlists, watchlist_assets, and notification
 * channels. Soft-disables overflow rows and reactivates previously
 * soft-disabled rows up to the new caps. Never deletes user data.
 *
 * Called from stripe-webhook on every plan transition (free->paid,
 * paid->free, paid->paid). Throws on the first DB error so the webhook
 * can retry — partial failure would leave the user in an inconsistent
 * entitlement state.
 */
export async function reconcileEntitlements(
  supabase: SupabaseClient,
  userId: string,
  targetPlan: PlanType,
): Promise<void> {
  const target = getEntitlements(targetPlan);

  // ---- Alerts: cap distinct tickers ----
  const { data: allAlerts, error: alertsSelectError } = await supabase
    .from("alerts")
    .select("id, symbol, is_active, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (alertsSelectError) {
    throw new Error(`reconcileEntitlements: failed to load alerts for user ${userId}: ${alertsSelectError.message}`);
  }

  if (allAlerts) {
    const keepTickers = new Set<string>();
    const reactivateIds: string[] = [];
    const disableIds: string[] = [];
    for (const a of allAlerts as Array<{ id: string; symbol: string; is_active: boolean }>) {
      const sym = a.symbol.toUpperCase();
      if (keepTickers.has(sym)) {
        if (!a.is_active) reactivateIds.push(a.id);
        continue;
      }
      if (keepTickers.size < target.maxAlertTickers) {
        keepTickers.add(sym);
        if (!a.is_active) reactivateIds.push(a.id);
      } else {
        if (a.is_active) disableIds.push(a.id);
      }
    }
    if (disableIds.length) {
      const { error } = await supabase.from("alerts").update({ is_active: false }).in("id", disableIds);
      if (error) {
        throw new Error(`reconcileEntitlements: failed to disable overflow alerts for user ${userId}: ${error.message}`);
      }
    }
    if (reactivateIds.length) {
      const { error } = await supabase.from("alerts").update({ is_active: true }).in("id", reactivateIds);
      if (error) {
        throw new Error(`reconcileEntitlements: failed to reactivate alerts for user ${userId}: ${error.message}`);
      }
    }
  }

  // ---- Watchlists: cap number of lists ----
  const { data: allLists, error: listsSelectError } = await supabase
    .from("watchlists")
    .select("id, is_active, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (listsSelectError) {
    throw new Error(`reconcileEntitlements: failed to load watchlists for user ${userId}: ${listsSelectError.message}`);
  }

  const keepListIds: string[] = [];
  if (allLists) {
    let kept = 0;
    const disable: string[] = [];
    const reactivate: string[] = [];
    for (const l of allLists as Array<{ id: string; is_active: boolean }>) {
      if (kept < target.maxWatchlists) {
        keepListIds.push(l.id);
        kept++;
        if (!l.is_active) reactivate.push(l.id);
      } else {
        if (l.is_active) disable.push(l.id);
      }
    }
    if (disable.length) {
      const { error } = await supabase.from("watchlists").update({ is_active: false }).in("id", disable);
      if (error) {
        throw new Error(`reconcileEntitlements: failed to disable overflow watchlists for user ${userId}: ${error.message}`);
      }
    }
    if (reactivate.length) {
      const { error } = await supabase.from("watchlists").update({ is_active: true }).in("id", reactivate);
      if (error) {
        throw new Error(`reconcileEntitlements: failed to reactivate watchlists for user ${userId}: ${error.message}`);
      }
    }
  }

  // ---- Watchlist assets: cap tickers per kept list ----
  for (const listId of keepListIds) {
    const { data: assets, error: assetsSelectError } = await supabase
      .from("watchlist_assets")
      .select("id, is_active, added_at")
      .eq("watchlist_id", listId)
      .order("added_at", { ascending: true });
    if (assetsSelectError) {
      throw new Error(`reconcileEntitlements: failed to load watchlist_assets for list ${listId}: ${assetsSelectError.message}`);
    }
    if (!assets) continue;
    const disable: string[] = [];
    const reactivate: string[] = [];
    let kept = 0;
    for (const a of assets as Array<{ id: string; is_active: boolean }>) {
      if (kept < target.maxTickersPerWatchlist) {
        kept++;
        if (!a.is_active) reactivate.push(a.id);
      } else {
        if (a.is_active) disable.push(a.id);
      }
    }
    if (disable.length) {
      const { error } = await supabase.from("watchlist_assets").update({ is_active: false }).in("id", disable);
      if (error) {
        throw new Error(`reconcileEntitlements: failed to disable overflow watchlist_assets for list ${listId}: ${error.message}`);
      }
    }
    if (reactivate.length) {
      const { error } = await supabase.from("watchlist_assets").update({ is_active: true }).in("id", reactivate);
      if (error) {
        throw new Error(`reconcileEntitlements: failed to reactivate watchlist_assets for list ${listId}: ${error.message}`);
      }
    }
  }

  // ---- Notification channels: clear disallowed channels (fix #7a) ----
  // Per-channel toggles live on `notification_preferences` (columns
  // `discord_enabled` / `telegram_enabled`), NOT on `user_connections`
  // (which only stores OAuth identity: access_token, provider_user_id, etc.).
  // notification_preferences rows are NOT auto-created on profile insert,
  // so we UPSERT (with the schema defaults) to guarantee a row exists
  // before clearing the disallowed channels.
  const channelUpdates: Record<string, unknown> = {};
  if (!target.channels.discord) channelUpdates["discord_enabled"] = false;
  if (!target.channels.telegram) channelUpdates["telegram_enabled"] = false;
  if (Object.keys(channelUpdates).length > 0) {
    const { error } = await supabase
      .from("notification_preferences")
      .upsert({ user_id: userId, ...channelUpdates }, { onConflict: "user_id" });
    if (error) {
      throw new Error(`reconcileEntitlements: failed to upsert notification_preferences for user ${userId}: ${error.message}`);
    }
  }
}
