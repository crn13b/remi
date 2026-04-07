/**
 * Aggressiveness interval constants and repeat-check logic.
 */

export type Aggressiveness = 'chill' | 'default' | 'aggressive' | 'relentless';
export type UrgencyLevel = 'warning' | 'high' | 'critical';

export const AGGRESSIVENESS_INTERVALS_MIN: Record<Aggressiveness, number> = {
    chill: 1440,
    default: 360,
    aggressive: 120,
    relentless: 30,
};

export const LONG_THRESHOLDS: Record<UrgencyLevel, [number, number]> = {
    warning:  [70, 79],
    high:     [80, 89],
    critical: [90, 100],
};

export const SHORT_THRESHOLDS: Record<UrgencyLevel, [number, number]> = {
    warning:  [21, 30],
    high:     [11, 20],
    critical: [0, 10],
};

/**
 * Check if enough time has elapsed for a repeat notification.
 */
export function isRepeatDue(
    lastNotifiedAt: string | null,
    aggressiveness: Aggressiveness,
): boolean {
    if (!lastNotifiedAt) return true;
    const elapsed = Date.now() - new Date(lastNotifiedAt).getTime();
    const intervalMs = AGGRESSIVENESS_INTERVALS_MIN[aggressiveness] * 60 * 1000;
    return elapsed >= intervalMs;
}
