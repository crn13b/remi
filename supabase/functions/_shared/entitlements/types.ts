// supabase/functions/_shared/entitlements/types.ts
export type PlanType = "free" | "core" | "pro" | "founder";

export interface NotificationChannels {
  email: boolean;
  discord: boolean;
  telegram: boolean;
}

export interface Entitlements {
  // Watchlists
  maxWatchlists: number;                  // Number.POSITIVE_INFINITY = unlimited
  maxTickersPerWatchlist: number;         // Number.POSITIVE_INFINITY = unlimited
  watchlistScoreFreshnessSeconds: number;

  // Score lookups (dashboard, not watchlist)
  dailyScoreLookupLimit: number | null;   // null = unlimited
  blockLookupsOnWatchlistedSymbols: boolean;

  // Alerts
  alertsEnabled: boolean;
  maxAlertTickers: number;                // distinct tickers, not rows
  alertTrialDays: number | null;          // null = no trial limit

  // Notifications
  channels: NotificationChannels;

  // Founding-member display perks
  foundingMemberBadge: boolean;
  priceLocked: boolean;
  roadmapVoting: boolean;
}

export interface EffectiveEntitlements {
  plan: PlanType;
  isOwner: boolean;
  entitlements: Entitlements;
}

export interface GateResult {
  allowed: boolean;
  reason?: string;
  code?: string;
}
