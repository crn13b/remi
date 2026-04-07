import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { GateResult } from "./types.ts";
import { getEffectiveEntitlements } from "./effective.ts";

export async function isAlertTrialActive(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const eff = await getEffectiveEntitlements(supabase, userId);
  if (eff.isOwner) return true;
  if (eff.entitlements.alertTrialDays === null) return true; // paid
  const { data } = await supabase
    .from("profiles")
    .select("alert_trial_started_at")
    .eq("id", userId)
    .single();
  if (!data?.alert_trial_started_at) return true; // not started yet
  const startedAt = new Date(data.alert_trial_started_at).getTime();
  const expiresAt = startedAt + eff.entitlements.alertTrialDays * 86_400_000;
  return Date.now() < expiresAt;
}

export async function canCreateAlert(
  supabase: SupabaseClient,
  userId: string,
  symbol: string,
): Promise<GateResult> {
  const eff = await getEffectiveEntitlements(supabase, userId);
  if (!eff.entitlements.alertsEnabled) {
    return { allowed: false, reason: "Alerts are not enabled on your plan.", code: "ALERTS_DISABLED" };
  }
  // Trial check (free only)
  if (!(await isAlertTrialActive(supabase, userId))) {
    return { allowed: false, reason: "Your 3-day alert trial has expired. Upgrade to Core to reactivate.", code: "TRIAL_EXPIRED" };
  }
  // Distinct ticker count
  const { data: rows, error } = await supabase
    .from("alerts")
    .select("symbol")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error) return { allowed: false, reason: "Could not check alert quota.", code: "DB_ERROR" };
  const distinct = new Set((rows ?? []).map((r) => (r as { symbol: string }).symbol.toUpperCase()));
  distinct.add(symbol.toUpperCase());
  if (distinct.size > eff.entitlements.maxAlertTickers) {
    return {
      allowed: false,
      reason: `Your plan supports ${eff.entitlements.maxAlertTickers} alert ticker(s). Upgrade for more.`,
      code: "TICKER_LIMIT",
    };
  }
  return { allowed: true };
}

export async function canLookupScore(
  supabase: SupabaseClient,
  userId: string,
  symbol: string,
): Promise<GateResult> {
  const eff = await getEffectiveEntitlements(supabase, userId);
  // Owner and paid bypass everything
  if (eff.isOwner || eff.entitlements.dailyScoreLookupLimit === null) {
    return { allowed: true };
  }
  // Block on watchlisted symbols
  if (eff.entitlements.blockLookupsOnWatchlistedSymbols) {
    const { data: assets } = await supabase
      .from("watchlist_assets")
      .select("symbol, watchlists!inner(user_id, is_active)")
      .eq("watchlists.user_id", userId)
      .eq("watchlists.is_active", true)
      .eq("is_active", true)
      .eq("symbol", symbol.toUpperCase());
    if (assets && assets.length > 0) {
      return {
        allowed: false,
        reason: `Score for ${symbol.toUpperCase()} is in your watchlist. Free users see watchlist scores updated every 4 hours. Upgrade to Core for real-time scores and unlimited lookups.`,
        code: "WATCHLISTED",
      };
    }
  }
  // Quota is consumed via consume_score_lookup RPC at the call site
  // (Task 3.2). canLookupScore only validates the watchlist-block rule.
  return { allowed: true };
}

export async function canCreateWatchlist(
  supabase: SupabaseClient,
  userId: string,
): Promise<GateResult> {
  const eff = await getEffectiveEntitlements(supabase, userId);
  const { data: lists, error } = await supabase
    .from("watchlists")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error) return { allowed: false, reason: "Could not check watchlist quota.", code: "DB_ERROR" };
  const count = (lists ?? []).length + 1;
  if (count > eff.entitlements.maxWatchlists) {
    return {
      allowed: false,
      reason: `Your plan supports ${eff.entitlements.maxWatchlists} watchlist(s). Upgrade for more.`,
      code: "WATCHLIST_LIMIT",
    };
  }
  return { allowed: true };
}

export async function canAddWatchlistTicker(
  supabase: SupabaseClient,
  userId: string,
  watchlistId: string,
  symbol: string,
): Promise<GateResult> {
  const eff = await getEffectiveEntitlements(supabase, userId);
  const { data: assets, error } = await supabase
    .from("watchlist_assets")
    .select("symbol")
    .eq("watchlist_id", watchlistId)
    .eq("is_active", true);
  if (error) return { allowed: false, reason: "Could not check ticker quota.", code: "DB_ERROR" };
  const symbols = new Set((assets ?? []).map((a) => (a as { symbol: string }).symbol.toUpperCase()));
  symbols.add(symbol.toUpperCase());
  if (symbols.size > eff.entitlements.maxTickersPerWatchlist) {
    return {
      allowed: false,
      reason: `Your plan supports ${eff.entitlements.maxTickersPerWatchlist} ticker(s) per watchlist. Upgrade for more.`,
      code: "TICKER_LIMIT",
    };
  }
  return { allowed: true };
}
