/**
 * Threshold crossing detection — Deno port of alertService.evaluateAlerts()
 */

import {
    type Aggressiveness,
    type UrgencyLevel,
    LONG_THRESHOLDS,
    SHORT_THRESHOLDS,
    isRepeatDue,
} from './intervals.ts';

type AlertDirection = 'long' | 'short' | 'both';
type AlertEventType = 'trigger' | 'escalation' | 'de_escalation' | 'all_clear' | 'patience_nudge';

export interface AlertRow {
    id: string;
    user_id: string;
    symbol: string;
    direction: AlertDirection;
    aggressiveness: Aggressiveness;
    is_active: boolean;
    last_score: number | null;
    last_notified_at: string | null;
}

export interface ThresholdCrossing {
    alert: AlertRow;
    score: number;
    previousScore: number;
    urgency: UrgencyLevel;
    eventType: AlertEventType;
    direction: 'long' | 'short';
    message: string;
}

export interface RepeatNotification {
    alert: AlertRow;
    score: number;
    urgency: UrgencyLevel;
    direction: 'long' | 'short';
    message: string;
}

const URGENCY_RANK: Record<UrgencyLevel, number> = { warning: 1, high: 2, critical: 3 };

function getUrgencyTier(score: number, thresholds: Record<UrgencyLevel, [number, number]>): UrgencyLevel | null {
    for (const [tier, [min, max]] of Object.entries(thresholds) as [UrgencyLevel, [number, number]][]) {
        if (score >= min && score <= max) return tier;
    }
    return null;
}

function generateMessage(
    symbol: string,
    score: number,
    urgency: UrgencyLevel,
    eventType: AlertEventType,
    direction: 'long' | 'short',
): string {
    const dirLabel = direction === 'long' ? 'bullish' : 'bearish';
    const tierLabel: Record<UrgencyLevel, string> = { warning: 'Nudge', high: 'Warning', critical: 'Urgent' };
    const label = tierLabel[urgency];

    switch (eventType) {
        case 'trigger':
            if (urgency === 'warning') return `${symbol} entered ${label} zone at ${score}. Conditions forming — start paying attention.`;
            if (urgency === 'high') return `${symbol} hit ${label} at ${score}. Strong ${dirLabel} setup developing.`;
            return `${symbol} reached ${label} at ${score}. Extreme ${dirLabel} conviction — don't miss this.`;
        case 'escalation':
            if (urgency === 'high') return `${symbol} escalated to ${label} at ${score}. ${dirLabel === 'bullish' ? 'Bullish' : 'Bearish'} momentum intensifying.`;
            return `${symbol} surged to ${label} at ${score}. Extreme ${dirLabel} conviction — rare event.`;
        case 'de_escalation':
            return `${symbol} de-escalated to ${label} at ${score}. Momentum cooling.`;
        case 'all_clear':
            return `${symbol} returned to the quiet zone at ${score}. No action needed — conditions normalized.`;
        case 'patience_nudge':
            return `${symbol} is at ${score} — sitting in the quiet zone. No strong pattern detected yet.`;
    }
}

/**
 * Detect new threshold crossings (state changes).
 */
export function detectCrossings(
    alerts: AlertRow[],
    scores: Map<string, number>,
): ThresholdCrossing[] {
    const crossings: ThresholdCrossing[] = [];

    for (const alert of alerts) {
        if (!alert.is_active) continue;

        const newScore = scores.get(alert.symbol);
        if (newScore === undefined) continue;

        const prevScore = alert.last_score ?? newScore;
        if (alert.last_score === null) continue;

        const directions: ('long' | 'short')[] =
            alert.direction === 'both' ? ['long', 'short'] : [alert.direction as 'long' | 'short'];

        for (const dir of directions) {
            const thresholds = dir === 'long' ? LONG_THRESHOLDS : SHORT_THRESHOLDS;
            const prevTier = getUrgencyTier(prevScore, thresholds);
            const currTier = getUrgencyTier(newScore, thresholds);

            let eventType: AlertEventType | null = null;
            let urgency: UrgencyLevel | null = null;

            if (prevTier === null && currTier !== null) {
                eventType = 'trigger';
                urgency = currTier;
            } else if (prevTier !== null && currTier === null) {
                eventType = 'all_clear';
                urgency = prevTier;
            } else if (prevTier !== null && currTier !== null && prevTier !== currTier) {
                const prevRank = URGENCY_RANK[prevTier];
                const currRank = URGENCY_RANK[currTier];
                eventType = currRank > prevRank ? 'escalation' : 'de_escalation';
                urgency = currTier;
            }

            if (eventType && urgency) {
                crossings.push({
                    alert,
                    score: newScore,
                    previousScore: prevScore,
                    urgency,
                    eventType,
                    direction: dir,
                    message: generateMessage(alert.symbol, newScore, urgency, eventType, dir),
                });
            }
        }
    }

    return crossings;
}

/**
 * Find alerts that are still in a zone (no state change) but due for a repeat notification.
 */
export function findRepeatsDue(
    alerts: AlertRow[],
    scores: Map<string, number>,
    globalAggressiveness: Aggressiveness,
): RepeatNotification[] {
    const repeats: RepeatNotification[] = [];

    for (const alert of alerts) {
        if (!alert.is_active) continue;

        const newScore = scores.get(alert.symbol);
        if (newScore === undefined || alert.last_score === null) continue;

        const directions: ('long' | 'short')[] =
            alert.direction === 'both' ? ['long', 'short'] : [alert.direction as 'long' | 'short'];

        for (const dir of directions) {
            const thresholds = dir === 'long' ? LONG_THRESHOLDS : SHORT_THRESHOLDS;
            const prevTier = getUrgencyTier(alert.last_score, thresholds);
            const currTier = getUrgencyTier(newScore, thresholds);

            if (currTier !== null && currTier === prevTier && isRepeatDue(alert.last_notified_at, globalAggressiveness)) {
                const dirLabel = dir === 'long' ? 'bullish' : 'bearish';
                const tierLabel: Record<UrgencyLevel, string> = { warning: 'Nudge', high: 'Warning', critical: 'Urgent' };
                repeats.push({
                    alert,
                    score: newScore,
                    urgency: currTier,
                    direction: dir,
                    message: `${alert.symbol} still at ${newScore} (${tierLabel[currTier]}). ${dirLabel === 'bullish' ? 'Bullish' : 'Bearish'} conditions persist.`,
                });
            }
        }
    }

    return repeats;
}
