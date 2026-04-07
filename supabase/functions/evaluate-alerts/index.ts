/**
 * evaluate-alerts — 1-minute cron Edge Function
 *
 * Fetches scores for all active alert symbols, detects threshold crossings,
 * checks repeat intervals, and dispatches notifications.
 *
 * Triggered by: pg_cron (every 1 minute)
 * Env vars: RESEND_API_KEY, DISCORD_BOT_TOKEN (for sending DMs),
 *           DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET (for token refresh),
 *           TELEGRAM_BOT_TOKEN, APP_URL,
 *           SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getBatchScores } from "../_shared/remi-score/engine.ts";
import { detectCrossings, findRepeatsDue } from "../_shared/alert-evaluation/evaluate.ts";
import type { AlertRow, ThresholdCrossing, RepeatNotification } from "../_shared/alert-evaluation/evaluate.ts";
import type { Aggressiveness } from "../_shared/alert-evaluation/intervals.ts";
import { sendEmail } from "../_shared/notifications/resend.ts";
import { sendDiscordDM, sendDiscordChannelMessage, refreshDiscordToken } from "../_shared/notifications/discord.ts";
import { sendTelegramMessage } from "../_shared/notifications/telegram.ts";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:5173";

// ─── Notification Message Formatter ─────────────────────────

function formatNotificationText(
    symbol: string,
    score: number,
    previousScore: number | null,
    urgencyLabel: string,
    direction: string,
    isQuietZone: boolean,
): string {
    const now = new Date();
    const utcTimestamp = `${now.toISOString().slice(0, 10)} ${now.toISOString().slice(11, 16)} UTC`;

    if (isQuietZone) {
        return [
            `${symbol} — ${score}/100 (Quiet Zone)`,
            `Score returned to the quiet zone. No action needed.`,
            ``,
            `Time: ${utcTimestamp}`,
            `View your Dashboard → ${APP_URL}/alerts`,
        ].join('\n');
    }

    const lines = [
        `${symbol} — ${score}/100 (${urgencyLabel})`,
        `Direction: ${direction === 'long' ? 'Long' : 'Short'}`,
    ];
    if (previousScore !== null) {
        lines.push(`Previous: ${previousScore} → Now: ${score}`);
    }
    lines.push('', `Time: ${utcTimestamp}`, `View your Dashboard → ${APP_URL}/alerts`);
    return lines.join('\n');
}

// ─── Dispatch Notifications ─────────────────────────────────

interface UserChannels {
    email?: string;
    emailEnabled: boolean;
    discordUserId?: string;
    discordChannelId?: string;
    discordEnabled: boolean;
    discordRefreshToken?: string;
    discordExpiresAt?: string;
    discordConnectionId?: string;
    telegramChatId?: string;
    telegramEnabled: boolean;
}

async function dispatchToChannels(channels: UserChannels, subject: string, text: string): Promise<void> {
    const promises: Promise<void>[] = [];

    if (channels.emailEnabled && channels.email) {
        promises.push(
            sendEmail({ to: channels.email, subject, text }).then((ok) => {
                if (!ok) console.error(`Email failed for ${channels.email}`);
            })
        );
    }

    if (channels.discordEnabled) {
        // Prefer channel message if a channel ID is configured
        if (channels.discordChannelId) {
            promises.push(
                sendDiscordChannelMessage(channels.discordChannelId, text).then((ok) => {
                    if (!ok) console.error(`Discord channel message failed for ${channels.discordChannelId}`);
                })
            );
        } else if (channels.discordUserId) {
            // Fall back to DM
            let discordReady = true;

            // Check if token needs refresh
            if (channels.discordExpiresAt && channels.discordRefreshToken && channels.discordConnectionId) {
                const expiresAt = new Date(channels.discordExpiresAt).getTime();
                if (Date.now() > expiresAt) {
                    const refreshed = await refreshDiscordToken(channels.discordRefreshToken);
                    if (refreshed) {
                        await supabase.from('user_connections').update({
                            access_token: refreshed.access_token,
                            refresh_token: refreshed.refresh_token,
                            expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
                            status: 'active',
                        }).eq('id', channels.discordConnectionId);
                    } else {
                        await supabase.from('user_connections').update({
                            status: 'needs_reauth',
                        }).eq('id', channels.discordConnectionId);
                        console.error(`Discord token refresh failed for connection ${channels.discordConnectionId}`);
                        discordReady = false;
                    }
                }
            }

            if (discordReady) {
                promises.push(
                    sendDiscordDM(channels.discordUserId, text).then((ok) => {
                        if (!ok) console.error(`Discord DM failed for user ${channels.discordUserId}`);
                    })
                );
            }
        }
    }

    if (channels.telegramEnabled && channels.telegramChatId) {
        promises.push(
            sendTelegramMessage(channels.telegramChatId, text).then((ok) => {
                if (!ok) console.error(`Telegram failed for chat ${channels.telegramChatId}`);
            })
        );
    }

    await Promise.allSettled(promises);
}

// ─── Main Handler ───────────────────────────────────────────

Deno.serve(async (_req) => {
    try {
        // 1. Load all active alerts with user prefs and connections
        const { data: alerts, error: alertsErr } = await supabase
            .from('alerts')
            .select('id, user_id, symbol, direction, aggressiveness, is_active, last_score, last_notified_at')
            .eq('is_active', true);

        if (alertsErr || !alerts || alerts.length === 0) {
            if (alertsErr) console.error('Failed to load alerts:', alertsErr);
            return new Response(JSON.stringify({ processed: 0 }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // 2. Cap processing to prevent abuse (max 50 alerts per user, 5000 total)
        const MAX_ALERTS_PER_USER = 50;
        const MAX_TOTAL_ALERTS = 5000;
        const alertsByUser = new Map<string, AlertRow[]>();
        for (const alert of alerts as AlertRow[]) {
            const list = alertsByUser.get(alert.user_id) ?? [];
            if (list.length < MAX_ALERTS_PER_USER) {
                list.push(alert);
                alertsByUser.set(alert.user_id, list);
            }
        }
        const cappedAlerts = [...alertsByUser.values()].flat().slice(0, MAX_TOTAL_ALERTS);

        // Rebuild alertsByUser from cappedAlerts so repeats also respect the total cap
        alertsByUser.clear();
        for (const alert of cappedAlerts) {
            const list = alertsByUser.get(alert.user_id) ?? [];
            list.push(alert);
            alertsByUser.set(alert.user_id, list);
        }

        const userIds = [...alertsByUser.keys()];
        const symbols = [...new Set(cappedAlerts.map((a: AlertRow) => a.symbol))];

        // 3. Load notification preferences for all users
        const { data: prefsRows } = await supabase
            .from('notification_preferences')
            .select('*')
            .in('user_id', userIds);

        const prefsMap = new Map<string, {
            global_aggressiveness: Aggressiveness;
            email_enabled: boolean;
            discord_enabled: boolean;
            discord_channel_id: string | null;
            telegram_enabled: boolean;
        }>();
        for (const p of prefsRows ?? []) {
            prefsMap.set(p.user_id, p);
        }

        // 4. Load user connections
        const { data: connections } = await supabase
            .from('user_connections')
            .select('*')
            .in('user_id', userIds)
            .eq('status', 'active');

        const connectionsMap = new Map<string, Map<string, {
            id: string;
            provider_user_id: string;
            access_token: string | null;
            refresh_token: string | null;
            expires_at: string | null;
        }>>();
        for (const c of connections ?? []) {
            if (!connectionsMap.has(c.user_id)) connectionsMap.set(c.user_id, new Map());
            connectionsMap.get(c.user_id)!.set(c.provider, c);
        }

        // 5. Load user emails from auth (only for users with active alerts)
        const emailMap = new Map<string, string>();
        for (const uid of userIds) {
            const { data: { user } } = await supabase.auth.admin.getUserById(uid);
            if (user?.email) emailMap.set(uid, user.email);
        }

        // 6. Fetch scores for all symbols
        const scores = await getBatchScores(symbols);
        const scoreMap = new Map<string, number>();
        for (const [sym, result] of scores) {
            scoreMap.set(sym, result.score);
        }

        // 7. Detect crossings
        const crossings = detectCrossings(cappedAlerts, scoreMap);

        // 8. Find repeat notifications due (reuse alertsByUser from step 2)
        const userAlerts = alertsByUser;

        const allRepeats: RepeatNotification[] = [];
        for (const [userId, uAlerts] of userAlerts) {
            const prefs = prefsMap.get(userId);
            const aggr = prefs?.global_aggressiveness ?? 'default';
            const repeats = findRepeatsDue(uAlerts, scoreMap, aggr);
            allRepeats.push(...repeats);
        }

        // 9. Process crossings — insert events + send notifications
        const urgencyLabels: Record<string, string> = { warning: 'Nudge', high: 'Warning', critical: 'Urgent' };

        for (const crossing of crossings) {
            const { alert, score, previousScore, urgency, eventType, direction, message } = crossing;
            const prefs = prefsMap.get(alert.user_id);
            const userConns = connectionsMap.get(alert.user_id);
            const discordConn = userConns?.get('discord');
            const telegramConn = userConns?.get('telegram');

            // Insert alert event
            await supabase.from('alert_events').insert({
                alert_id: alert.id,
                user_id: alert.user_id,
                symbol: alert.symbol,
                score,
                previous_score: previousScore,
                urgency,
                event_type: eventType,
                direction,
                message,
                read: false,
                dismissed: false,
                triggered_at: new Date().toISOString(),
            });

            // Send external notifications if user has channels enabled
            if (prefs && (prefs.email_enabled || prefs.discord_enabled || prefs.telegram_enabled)) {
                const isQuietZone = eventType === 'all_clear';
                const text = formatNotificationText(
                    alert.symbol, score, previousScore,
                    urgencyLabels[urgency] ?? urgency, direction, isQuietZone,
                );
                const subject = `${alert.symbol} — ${score}/100 (${isQuietZone ? 'Quiet Zone' : urgencyLabels[urgency]})`;

                await dispatchToChannels({
                    email: emailMap.get(alert.user_id),
                    emailEnabled: prefs.email_enabled,
                    discordUserId: discordConn?.provider_user_id,
                    discordChannelId: prefs.discord_channel_id ?? undefined,
                    discordEnabled: prefs.discord_enabled,
                    discordRefreshToken: discordConn?.refresh_token ?? undefined,
                    discordExpiresAt: discordConn?.expires_at ?? undefined,
                    discordConnectionId: discordConn?.id,
                    telegramChatId: telegramConn?.provider_user_id,
                    telegramEnabled: prefs.telegram_enabled,
                }, subject, text);
            }

            // Update alert
            await supabase.from('alerts').update({
                last_score: score,
                last_notified_at: new Date().toISOString(),
                last_triggered_at: new Date().toISOString(),
            }).eq('id', alert.id);
        }

        // 10. Process repeats — send notifications only (no new event)
        for (const repeat of allRepeats) {
            const { alert, score, urgency, direction, message } = repeat;
            const prefs = prefsMap.get(alert.user_id);
            const userConns = connectionsMap.get(alert.user_id);
            const discordConn = userConns?.get('discord');
            const telegramConn = userConns?.get('telegram');

            if (prefs && (prefs.email_enabled || prefs.discord_enabled || prefs.telegram_enabled)) {
                const text = formatNotificationText(
                    alert.symbol, score, null,
                    urgencyLabels[urgency] ?? urgency, direction, false,
                );
                const subject = `${alert.symbol} — ${score}/100 (${urgencyLabels[urgency]}) [Reminder]`;

                await dispatchToChannels({
                    email: emailMap.get(alert.user_id),
                    emailEnabled: prefs.email_enabled,
                    discordUserId: discordConn?.provider_user_id,
                    discordChannelId: prefs.discord_channel_id ?? undefined,
                    discordEnabled: prefs.discord_enabled,
                    discordRefreshToken: discordConn?.refresh_token ?? undefined,
                    discordExpiresAt: discordConn?.expires_at ?? undefined,
                    discordConnectionId: discordConn?.id,
                    telegramChatId: telegramConn?.provider_user_id,
                    telegramEnabled: prefs.telegram_enabled,
                }, subject, text);
            }

            // Update last_notified_at and last_score
            await supabase.from('alerts').update({
                last_notified_at: new Date().toISOString(),
                last_score: score,
            }).eq('id', alert.id);
        }

        // 11. Update last_score for all alerts that had no crossing or repeat (score tracking)
        const processedAlertIds = new Set([
            ...crossings.map(c => c.alert.id),
            ...allRepeats.map(r => r.alert.id),
        ]);
        for (const alert of cappedAlerts) {
            if (processedAlertIds.has(alert.id)) continue;
            const newScore = scoreMap.get(alert.symbol);
            if (newScore !== undefined) {
                await supabase.from('alerts').update({ last_score: newScore }).eq('id', alert.id);
            }
        }

        return new Response(JSON.stringify({
            processed: cappedAlerts.length,
            crossings: crossings.length,
            repeats: allRepeats.length,
        }), {
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (err) {
        console.error('evaluate-alerts error:', err);
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});
