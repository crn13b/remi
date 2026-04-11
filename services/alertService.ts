/**
 * Alert Service — Supabase CRUD + Threshold Crossing Detection
 */

import { supabase } from './supabaseClient';
import { invoke } from './_invoke';
import type { Alert, AlertEvent, AlertDirection, UrgencyLevel, AlertEventType, NotificationPreferences, Aggressiveness, NudgeFrequency, UserConnection } from '../components/alerts/types';
import { LONG_THRESHOLDS, SHORT_THRESHOLDS, NUDGE_INTERVAL_MS, generateNudgeMessage } from '../components/alerts/constants';
import type { RemiScoreResult } from './remiScore';

// ─── Types ───────────────────────────────────────────────────────

type CreateAlertInput = {
    symbol: string;
    direction: AlertDirection;
    aggressiveness: Aggressiveness;
    is_active: boolean;
};

export interface ThresholdCrossing {
    alert: Alert;
    score: number;
    previousScore: number;
    urgency: UrgencyLevel;
    eventType: AlertEventType;
    direction: 'long' | 'short';
    message: string;
}

// ─── Alert CRUD ──────────────────────────────────────────────────

export async function loadAlerts(userId: string): Promise<Alert[]> {
    const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Failed to load alerts:', error);
        return [];
    }
    return data ?? [];
}

// Signature preserved for App.tsx call sites. `userId` is ignored here —
// the edge function derives it from the JWT. Errors (including tier-gate
// 402/403 rejections) are re-thrown so callers can surface them to the user
// and roll back any optimistic UI state.
export async function createAlert(_userId: string, input: CreateAlertInput): Promise<Alert> {
    const res = await invoke<{ alert: Alert }>('create-alert', input);
    return res.alert ?? (res as unknown as Alert);
}

export async function updateAlert(alert: Alert): Promise<void> {
    await invoke('update-alert', {
        id: alert.id,
        symbol: alert.symbol,
        direction: alert.direction,
        aggressiveness: alert.aggressiveness,
        is_active: alert.is_active,
    });
}

export async function toggleAlert(id: string, isActive: boolean): Promise<void> {
    await invoke('toggle-alert', { id, is_active: isActive });
}

export async function deleteAlert(id: string): Promise<void> {
    await invoke('delete-alert', { id });
}

// ─── Alert Events CRUD ──────────────────────────────────────────

export async function loadAlertEvents(userId: string, limit = 50): Promise<AlertEvent[]> {
    const { data, error } = await supabase
        .from('alert_events')
        .select('*')
        .eq('user_id', userId)
        .order('triggered_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Failed to load alert events:', error);
        return [];
    }
    return data ?? [];
}

export async function insertAlertEvent(event: Omit<AlertEvent, 'id'>): Promise<AlertEvent | null> {
    const { data, error } = await supabase
        .from('alert_events')
        .insert(event)
        .select()
        .single();

    if (error) {
        console.error('Failed to insert alert event:', error);
        return null;
    }
    return data;
}

export async function markEventRead(id: string): Promise<void> {
    const { error } = await supabase
        .from('alert_events')
        .update({ read: true })
        .eq('id', id);

    if (error) console.error('Failed to mark event read:', error);
}

export async function markAllEventsRead(userId: string): Promise<void> {
    const { error } = await supabase
        .from('alert_events')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false);

    if (error) console.error('Failed to mark all events read:', error);
}

export async function dismissEvent(id: string): Promise<void> {
    const { error } = await supabase
        .from('alert_events')
        .update({ dismissed: true })
        .eq('id', id);

    if (error) console.error('Failed to dismiss event:', error);
}

// ─── Notification Preferences ────────────────────────────────────

export async function loadNotificationPrefs(userId: string): Promise<NotificationPreferences | null> {
    const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        console.error('Failed to load notification prefs:', error);
        return null;
    }
    return data;
}

// ─── User Connections ───────────────────────────────────────────

export async function loadUserConnections(userId: string): Promise<UserConnection[]> {
    const { data, error } = await supabase
        .from('user_connections')
        .select('id, user_id, provider, provider_user_id, provider_username, status, connected_at')
        .eq('user_id', userId);

    if (error) {
        console.error('Failed to load user connections:', error);
        return [];
    }
    return data ?? [];
}

// Note: `access_token` is accepted as a write-only field (used for Telegram linking codes)
// but is NOT included in the returned UserConnection type or SELECT query, since tokens
// should never be sent to the browser outside of the initial write.
export async function upsertUserConnection(
    userId: string,
    provider: string,
    data: { access_token?: string; provider_user_id?: string | null; provider_username?: string | null; status?: string },
): Promise<UserConnection | null> {
    const { data: result, error } = await supabase
        .from('user_connections')
        .upsert(
            { user_id: userId, provider, ...data },
            { onConflict: 'user_id,provider' },
        )
        .select('id, user_id, provider, provider_user_id, provider_username, status, connected_at')
        .single();

    if (error) {
        console.error('Failed to upsert user connection:', error);
        return null;
    }
    return result;
}

// ─── Threshold Crossing Detection ────────────────────────────────

function getUrgencyTier(score: number, thresholds: Record<UrgencyLevel, [number, number]>): UrgencyLevel | null {
    for (const [tier, [min, max]] of Object.entries(thresholds) as [UrgencyLevel, [number, number]][]) {
        if (score >= min && score <= max) return tier;
    }
    return null;
}

const URGENCY_RANK: Record<UrgencyLevel, number> = { warning: 1, high: 2, critical: 3 };

function generateMessage(symbol: string, score: number, urgency: UrgencyLevel, eventType: AlertEventType, direction: 'long' | 'short'): string {
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
            return `${symbol} exited alert range at ${score}. All clear — conditions normalized.`;

        case 'patience_nudge':
            return `${symbol} is at ${score} — sitting in the neutral zone. No strong pattern detected yet.`;
    }
}

export function evaluateAlerts(
    alerts: Alert[],
    scores: Map<string, RemiScoreResult>,
): ThresholdCrossing[] {
    const crossings: ThresholdCrossing[] = [];

    for (const alert of alerts) {
        if (!alert.is_active) continue;

        const scoreResult = scores.get(alert.symbol);
        if (!scoreResult) continue;

        const newScore = scoreResult.score;
        const prevScore = alert.last_score ?? newScore; // first eval: treat as same (no crossing)

        // Skip first evaluation — just record the score, don't fire
        if (alert.last_score === null) continue;

        const directions: ('long' | 'short')[] =
            alert.direction === 'both' ? ['long', 'short'] :
            [alert.direction as 'long' | 'short'];

        for (const dir of directions) {
            const thresholds = dir === 'long' ? LONG_THRESHOLDS : SHORT_THRESHOLDS;
            const prevTier = getUrgencyTier(prevScore, thresholds);
            const currTier = getUrgencyTier(newScore, thresholds);

            let eventType: AlertEventType | null = null;
            let urgency: UrgencyLevel | null = null;

            if (prevTier === null && currTier !== null) {
                // Entered range
                eventType = 'trigger';
                urgency = currTier;
            } else if (prevTier !== null && currTier === null) {
                // Exited range
                eventType = 'all_clear';
                urgency = prevTier;
            } else if (prevTier !== null && currTier !== null && prevTier !== currTier) {
                const prevRank = URGENCY_RANK[prevTier];
                const currRank = URGENCY_RANK[currTier];
                if (currRank > prevRank) {
                    eventType = 'escalation';
                    urgency = currTier;
                } else {
                    eventType = 'de_escalation';
                    urgency = currTier;
                }
            }
            // Same tier or both null = no event

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

// ─── Batch: Update last_score for all evaluated alerts ───────────

export async function updateAlertScores(
    alerts: Alert[],
    scores: Map<string, RemiScoreResult>,
): Promise<Alert[]> {
    const updated: Alert[] = [];

    for (const alert of alerts) {
        if (!alert.is_active) {
            updated.push(alert);
            continue;
        }

        const scoreResult = scores.get(alert.symbol);
        if (!scoreResult) {
            updated.push(alert);
            continue;
        }

        const newAlert = { ...alert, last_score: scoreResult.score };
        updated.push(newAlert);

        // Persist to DB
        await supabase
            .from('alerts')
            .update({ last_score: scoreResult.score })
            .eq('id', alert.id);
    }

    return updated;
}

// ─── Patience Nudge ─────────────────────────────────────────────

export interface NudgeResult {
    neutralAssets: { symbol: string; score: number }[];
    message: string;
}

export async function loadLastNudgeTime(userId: string): Promise<string | null> {
    const { data, error } = await supabase
        .from('alert_events')
        .select('triggered_at')
        .eq('user_id', userId)
        .eq('event_type', 'patience_nudge')
        .order('triggered_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('Failed to load last nudge time:', error);
        return null;
    }
    return data?.triggered_at ?? null;
}

export function evaluateNudge(
    alerts: Alert[],
    scores: Map<string, RemiScoreResult>,
    prefs: NotificationPreferences,
    lastNudgeAt: string | null,
): NudgeResult | null {
    if (!prefs.nudge_enabled || prefs.nudge_frequency === 'off') return null;

    // Check if enough time has elapsed since last nudge
    const intervalMs = NUDGE_INTERVAL_MS[prefs.nudge_frequency as Exclude<NudgeFrequency, 'off'>];
    if (lastNudgeAt) {
        const elapsed = Date.now() - new Date(lastNudgeAt).getTime();
        if (elapsed < intervalMs) return null;
    }

    // Collect all active alerts with scores in the neutral zone (31-69)
    const neutralAssets: { symbol: string; score: number }[] = [];
    const seen = new Set<string>();

    for (const alert of alerts) {
        if (!alert.is_active || seen.has(alert.symbol)) continue;
        seen.add(alert.symbol);

        const scoreResult = scores.get(alert.symbol);
        if (!scoreResult) continue;

        const score = scoreResult.score;
        if (score >= 31 && score <= 69) {
            neutralAssets.push({ symbol: alert.symbol, score });
        }
    }

    if (neutralAssets.length === 0) return null;

    return {
        neutralAssets,
        message: generateNudgeMessage(neutralAssets),
    };
}

export async function insertNudgeEvent(userId: string, nudge: NudgeResult): Promise<AlertEvent | null> {
    const symbol = nudge.neutralAssets.length === 1
        ? nudge.neutralAssets[0].symbol
        : 'WATCHLIST';
    const score = nudge.neutralAssets.length === 1
        ? nudge.neutralAssets[0].score
        : Math.round(nudge.neutralAssets.reduce((sum, a) => sum + a.score, 0) / nudge.neutralAssets.length);

    return insertAlertEvent({
        alert_id: null,
        user_id: userId,
        symbol,
        score,
        previous_score: score,
        urgency: 'warning',
        event_type: 'patience_nudge',
        direction: 'long', // not meaningful for nudges, required by schema
        message: nudge.message,
        read: false,
        dismissed: false,
        triggered_at: new Date().toISOString(),
    });
}
