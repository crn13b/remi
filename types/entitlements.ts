export type PlanType = "free" | "core" | "pro" | "founder";

export interface NotificationChannels {
  email: boolean;
  discord: boolean;
  telegram: boolean;
}

export interface Entitlements {
  maxWatchlists: number;            // Infinity wire-encoded as null
  maxTickersPerWatchlist: number;
  watchlistScoreFreshnessSeconds: number;
  dailyScoreLookupLimit: number | null;
  blockLookupsOnWatchlistedSymbols: boolean;
  alertsEnabled: boolean;
  maxAlertTickers: number;
  alertTrialDays: number | null;
  channels: NotificationChannels;
  foundingMemberBadge: boolean;
  priceLocked: boolean;
  roadmapVoting: boolean;
}

export interface EffectiveEntitlements {
  plan: PlanType;
  isOwner: boolean;
  entitlements: Entitlements;
  dailyScoreLookupsRemaining: number | null;
}

// The /me endpoint sends Infinity as null on the wire. Convert back here.
export function rehydrateEntitlements(raw: Entitlements): Entitlements {
  return {
    ...raw,
    maxWatchlists: raw.maxWatchlists ?? Number.POSITIVE_INFINITY,
    maxTickersPerWatchlist: raw.maxTickersPerWatchlist ?? Number.POSITIVE_INFINITY,
    maxAlertTickers: raw.maxAlertTickers ?? Number.POSITIVE_INFINITY,
  };
}
