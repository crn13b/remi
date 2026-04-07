import { AggressivenessConfig, Aggressiveness, UrgencyLevel, NudgeFrequency } from './types';

// ─── Score Thresholds ───
// Long direction: high scores = bullish setups
// Short direction: low scores = bearish warnings

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

// ─── Aggressiveness Preset Config ───

export const AGGRESSIVENESS_CONFIG: AggressivenessConfig = {
    chill: {
        warning:  { channel: 'in_app', persistent: false, repeat: false, repeat_interval_min: null, fullscreen_takeover: false },
        high:     { channel: 'in_app', persistent: false, repeat: false, repeat_interval_min: null, fullscreen_takeover: false },
        critical: { channel: 'both',   persistent: false, repeat: false, repeat_interval_min: null, fullscreen_takeover: false },
    },
    default: {
        warning:  { channel: 'in_app', persistent: false, repeat: false, repeat_interval_min: null, fullscreen_takeover: false },
        high:     { channel: 'both',   persistent: false, repeat: false, repeat_interval_min: null, fullscreen_takeover: false },
        critical: { channel: 'both',   persistent: true,  repeat: false, repeat_interval_min: null, fullscreen_takeover: false },
    },
    aggressive: {
        warning:  { channel: 'both',   persistent: false, repeat: false, repeat_interval_min: null,  fullscreen_takeover: false },
        high:     { channel: 'both',   persistent: true,  repeat: false, repeat_interval_min: null,  fullscreen_takeover: false },
        critical: { channel: 'both',   persistent: true,  repeat: true,  repeat_interval_min: 30,    fullscreen_takeover: false },
    },
    relentless: {
        warning:  { channel: 'both',   persistent: false, repeat: false, repeat_interval_min: null,  fullscreen_takeover: false },
        high:     { channel: 'both',   persistent: true,  repeat: true,  repeat_interval_min: 15,    fullscreen_takeover: false },
        critical: { channel: 'both',   persistent: true,  repeat: true,  repeat_interval_min: 5,     fullscreen_takeover: true },
    },
};

// ─── Aggressiveness Slider Labels & Descriptions ───

export const AGGRESSIVENESS_PRESETS: {
    value: Aggressiveness;
    label: string;
    description: string;
}[] = [
    { value: 'chill',      label: 'Chill',      description: 'Minimal notifications. Only critical alerts reach your email.' },
    { value: 'default',    label: 'Default',     description: 'Balanced. You won\'t miss important moves, but won\'t be overwhelmed.' },
    { value: 'aggressive', label: 'Aggressive',  description: 'Persistent reminders. Critical alerts repeat every 30 min until dismissed.' },
    { value: 'relentless', label: 'Relentless',  description: 'Maximum urgency. Repeated alerts, persistent banners, full-screen takeovers.' },
];

// ─── Urgency Display Config ───

export const URGENCY_STYLES: Record<UrgencyLevel, {
    label: string;
    color: string;          // dark mode text
    lightColor: string;     // light mode text
    bg: string;             // dark mode bg
    lightBg: string;        // light mode bg
    border: string;         // dark mode border
    lightBorder: string;    // light mode border
    glow: string;           // dark mode glow
}> = {
    warning: {
        label: 'Nudge',
        color: 'text-amber-400',
        lightColor: 'text-amber-700',
        bg: 'bg-amber-400/10',
        lightBg: 'bg-amber-50',
        border: 'border-amber-400/30',
        lightBorder: 'border-amber-200',
        glow: 'shadow-[0_0_20px_rgba(251,191,36,0.15)]',
    },
    high: {
        label: 'Warning',
        color: 'text-orange-400',
        lightColor: 'text-orange-700',
        bg: 'bg-orange-400/10',
        lightBg: 'bg-orange-50',
        border: 'border-orange-400/30',
        lightBorder: 'border-orange-200',
        glow: 'shadow-[0_0_30px_rgba(251,146,60,0.2)]',
    },
    critical: {
        label: 'Urgent',
        color: 'text-red-400',
        lightColor: 'text-red-700',
        bg: 'bg-red-400/10',
        lightBg: 'bg-red-50',
        border: 'border-red-400/30',
        lightBorder: 'border-red-200',
        glow: 'shadow-[0_0_40px_rgba(239,68,68,0.25)]',
    },
};

// ─── Patience Nudge ───

export const NUDGE_STYLE = {
    label: 'Patience',
    color: 'text-blue-400',
    lightColor: 'text-blue-600',
    bg: 'bg-blue-400/10',
    lightBg: 'bg-blue-50',
    border: 'border-blue-400/20',
    lightBorder: 'border-blue-200',
};

export const NUDGE_FREQUENCY_OPTIONS: { value: NudgeFrequency; label: string; description: string }[] = [
    { value: 'daily',     label: 'Daily',      description: 'Once per day' },
    { value: 'every_12h', label: 'Every 12h',   description: 'Twice per day' },
    { value: 'every_6h',  label: 'Every 6h',    description: 'Four times per day' },
];

export const NUDGE_INTERVAL_MS: Record<Exclude<NudgeFrequency, 'off'>, number> = {
    daily:     24 * 60 * 60 * 1000,
    every_12h: 12 * 60 * 60 * 1000,
    every_6h:   6 * 60 * 60 * 1000,
};

export function generateNudgeMessage(neutralAssets: { symbol: string; score: number }[]): string {
    if (neutralAssets.length === 1) {
        const { symbol, score } = neutralAssets[0];
        return `${symbol} is at ${score} — sitting in the neutral zone. No strong pattern detected yet. Conditions are still forming.`;
    }
    return `${neutralAssets.length} of your watched assets are in the neutral zone (31-69). Nothing actionable right now — patience is part of the process.`;
}

// ─── Demo Data (for empty state) ───

export const DEMO_ALERT_EVENTS = [
    {
        id: 'demo-1',
        symbol: 'BTC',
        score: 93,
        previous_score: 84,
        urgency: 'critical' as UrgencyLevel,
        event_type: 'escalation' as const,
        direction: 'long' as const,
        message: 'BTC confidence surged to 93 — Urgent zone. Extreme bullish conviction.',
        triggered_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(), // 12 min ago
    },
    {
        id: 'demo-2',
        symbol: 'ETH',
        score: 78,
        previous_score: 64,
        urgency: 'warning' as UrgencyLevel,
        event_type: 'trigger' as const,
        direction: 'long' as const,
        message: 'ETH entered Nudge zone at 78. Conditions forming — start paying attention.',
        triggered_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(), // 45 min ago
    },
    {
        id: 'demo-3',
        symbol: 'SOL',
        score: 14,
        previous_score: 26,
        urgency: 'high' as UrgencyLevel,
        event_type: 'escalation' as const,
        direction: 'short' as const,
        message: 'SOL dropped to 14 — Warning zone bearish signal. Serious downside risk.',
        triggered_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(), // 2 hrs ago
    },
];
