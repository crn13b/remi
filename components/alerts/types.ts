// ─── Alert System Types ───

export type AlertDirection = 'long' | 'short' | 'both';
export type Aggressiveness = 'chill' | 'default' | 'aggressive' | 'relentless';
export type UrgencyLevel = 'warning' | 'high' | 'critical';
export type AlertEventType = 'trigger' | 'escalation' | 'de_escalation' | 'all_clear' | 'patience_nudge';
export type NudgeFrequency = 'daily' | 'every_12h' | 'every_6h' | 'off';
export type NotifyChannel = 'in_app' | 'email' | 'both' | 'none';

export interface Alert {
    id: string;
    user_id: string;
    symbol: string;
    direction: AlertDirection;
    aggressiveness: Aggressiveness;
    is_active: boolean;
    last_triggered_at: string | null;
    last_score: number | null;
    created_at: string;
}

export interface AlertEvent {
    id: string;
    alert_id: string | null;
    user_id: string;
    symbol: string;
    score: number;
    previous_score: number;
    urgency: UrgencyLevel;
    event_type: AlertEventType;
    direction: 'long' | 'short';
    message: string;
    read: boolean;
    dismissed: boolean;
    triggered_at: string;
}

export interface NotificationPreferences {
    user_id: string;
    global_aggressiveness: Aggressiveness;
    email_enabled: boolean;
    digest_enabled: boolean;
    digest_time: string; // HH:MM format
    timezone: string;
    discord_enabled: boolean;
    telegram_enabled: boolean;
    // Patience Nudge settings
    nudge_enabled: boolean;
    nudge_frequency: NudgeFrequency;
    nudge_time: string; // HH:MM format, default "10:00"
}

export interface UserConnection {
    id: string;
    user_id: string;
    provider: 'discord' | 'telegram' | 'email';
    provider_user_id: string | null;
    provider_username: string | null;
    status: 'active' | 'needs_reauth';
    connected_at: string;
}

// What each aggressiveness preset does at each urgency level
export interface UrgencyBehavior {
    channel: NotifyChannel;
    persistent: boolean;       // persistent banner until dismissed
    repeat: boolean;           // re-fire while score stays in range
    repeat_interval_min: number | null; // minutes between re-fires
    fullscreen_takeover: boolean;
}

export type AggressivenessConfig = Record<Aggressiveness, Record<UrgencyLevel, UrgencyBehavior>>;
