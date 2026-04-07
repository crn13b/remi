import type { Entitlements, PlanType } from "./types.ts";

const INF = Number.POSITIVE_INFINITY;

export const TIERS: Record<PlanType, Entitlements> = {
  free: {
    maxWatchlists: 1,
    maxTickersPerWatchlist: 3,
    watchlistScoreFreshnessSeconds: 4 * 60 * 60,
    dailyScoreLookupLimit: 5,
    blockLookupsOnWatchlistedSymbols: true,
    alertsEnabled: true,
    maxAlertTickers: 1,
    alertTrialDays: 3,
    channels: { email: true, discord: false, telegram: false },
    foundingMemberBadge: false,
    priceLocked: false,
    roadmapVoting: false,
  },
  core: {
    maxWatchlists: 3,
    maxTickersPerWatchlist: INF,
    watchlistScoreFreshnessSeconds: 60,
    dailyScoreLookupLimit: null,
    blockLookupsOnWatchlistedSymbols: false,
    alertsEnabled: true,
    maxAlertTickers: 3,
    alertTrialDays: null,
    channels: { email: true, discord: true, telegram: true },
    foundingMemberBadge: false,
    priceLocked: false,
    roadmapVoting: false,
  },
  pro: {
    maxWatchlists: INF,
    maxTickersPerWatchlist: INF,
    watchlistScoreFreshnessSeconds: 60,
    dailyScoreLookupLimit: null,
    blockLookupsOnWatchlistedSymbols: false,
    alertsEnabled: true,
    maxAlertTickers: INF,
    alertTrialDays: null,
    channels: { email: true, discord: true, telegram: true },
    foundingMemberBadge: false,
    priceLocked: false,
    roadmapVoting: false,
  },
  founder: {
    maxWatchlists: INF,
    maxTickersPerWatchlist: INF,
    watchlistScoreFreshnessSeconds: 60,
    dailyScoreLookupLimit: null,
    blockLookupsOnWatchlistedSymbols: false,
    alertsEnabled: true,
    maxAlertTickers: INF,
    alertTrialDays: null,
    channels: { email: true, discord: true, telegram: true },
    foundingMemberBadge: true,
    priceLocked: true,
    roadmapVoting: true,
  },
};

export function getEntitlements(plan: PlanType): Entitlements {
  return TIERS[plan];
}
