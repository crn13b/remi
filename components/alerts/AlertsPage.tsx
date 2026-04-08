import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, Settings, Clock, X, Mail } from 'lucide-react';
import { Alert, AlertEvent, Aggressiveness, NudgeFrequency, UserConnection } from './types';
import { NUDGE_FREQUENCY_OPTIONS } from './constants';
import AlertHero from './AlertEmptyState';
import AlertForm from './AlertForm';
import AlertFeed from './AlertFeed';
import AlertManageList from './AlertManageList';
import AggressivenessSlider from './AggressivenessSlider';
import AlertTutorial, { TutorialRestartButton } from './AlertTutorial';
import * as alertService from '../../services/alertService';
import { supabase } from '../../services/supabaseClient';
import { useEntitlements } from '../../hooks/useEntitlements';

interface AlertsPageProps {
    theme: 'dark' | 'light';
    alerts: Alert[];
    alertEvents: AlertEvent[];
    globalAggressiveness: Aggressiveness;
    onCreateAlert: (alert: Omit<Alert, 'id' | 'user_id' | 'last_triggered_at' | 'last_score' | 'created_at'>) => void;
    onUpdateAlert: (alert: Alert) => void;
    onToggleAlert: (id: string, active: boolean) => void;
    onDeleteAlert: (id: string) => void;
    onMarkEventRead: (id: string) => void;
    onMarkAllEventsRead: () => void;
    onDismissEvent: (id: string) => void;
    onChangeGlobalAggressiveness: (value: Aggressiveness) => void;
    nudgeEnabled?: boolean;
    nudgeFrequency?: NudgeFrequency;
    nudgeTime?: string;
    onNudgeEnabledChange?: (enabled: boolean) => void;
    onNudgeFrequencyChange?: (freq: NudgeFrequency) => void;
    onNudgeTimeChange?: (time: string) => void;
    prefillSymbol?: string | null;
    // Notification channel props
    emailEnabled?: boolean;
    discordEnabled?: boolean;
    telegramEnabled?: boolean;
    onEmailEnabledChange?: (enabled: boolean) => void;
    onDiscordEnabledChange?: (enabled: boolean) => void;
    onTelegramEnabledChange?: (enabled: boolean) => void;
    userConnections?: UserConnection[];
    onConnectionComplete?: (provider: string) => void;
    userId?: string | null;
}

/* Drum-roll column for a single time unit */
const DrumColumn: React.FC<{
    items: string[];
    selected: number;
    onSelect: (idx: number) => void;
    isDark: boolean;
}> = ({ items, selected, onSelect, isDark }) => {
    const ITEM_H = 32;
    const VISIBLE = 3;
    const containerH = ITEM_H * VISIBLE;

    const dragRef = useRef<{ startY: number; startIdx: number; dragging: boolean }>({ startY: 0, startIdx: 0, dragging: false });
    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const colRef = useRef<HTMLDivElement>(null);

    const clamp = (v: number) => Math.max(0, Math.min(items.length - 1, v));
    const currentIdx = dragIdx !== null ? dragIdx : selected;
    const offset = currentIdx - 1;

    const handlePointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        colRef.current?.setPointerCapture(e.pointerId);
        dragRef.current = { startY: e.clientY, startIdx: selected, dragging: true };
        setDragIdx(selected);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!dragRef.current.dragging) return;
        const delta = Math.round((e.clientY - dragRef.current.startY) / ITEM_H);
        const next = clamp(dragRef.current.startIdx - delta);
        setDragIdx(next);
    };

    const handlePointerUp = () => {
        if (!dragRef.current.dragging) return;
        dragRef.current.dragging = false;
        if (dragIdx !== null) onSelect(dragIdx);
        setDragIdx(null);
    };

    return (
        <div
            ref={colRef}
            className="relative flex flex-col items-center cursor-ns-resize touch-none select-none"
            style={{ height: containerH, width: 40, overflow: 'hidden' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
        >
            {/* Fade top */}
            <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none"
                style={{ height: ITEM_H, background: isDark
                    ? 'linear-gradient(to bottom, #0d0d1a 0%, transparent 100%)'
                    : 'linear-gradient(to bottom, #ffffff 0%, transparent 100%)' }} />
            {/* Fade bottom */}
            <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none"
                style={{ height: ITEM_H, background: isDark
                    ? 'linear-gradient(to top, #0d0d1a 0%, transparent 100%)'
                    : 'linear-gradient(to top, #ffffff 0%, transparent 100%)' }} />
            {/* Selected highlight */}
            <div className={`absolute left-0 right-0 z-0 rounded-lg ${isDark ? 'bg-white/[0.07]' : 'bg-slate-100'}`}
                style={{ top: ITEM_H, height: ITEM_H }} />
            {/* Items */}
            <div style={{ transform: `translateY(${-offset * ITEM_H}px)`, transition: dragRef.current.dragging ? 'none' : 'transform 150ms ease-out' }}>
                {items.map((label, i) => {
                    const dist = Math.abs(i - currentIdx);
                    const opacity = dist === 0 ? 1 : dist === 1 ? 0.35 : 0.1;
                    return (
                        <div
                            key={i}
                            onClick={() => { if (!dragRef.current.dragging) onSelect(i); }}
                            className={`flex items-center justify-center tabular-nums font-bold ${
                                dist === 0
                                    ? isDark ? 'text-white text-base' : 'text-slate-900 text-base'
                                    : isDark ? 'text-gray-400 text-xs' : 'text-slate-400 text-xs'
                            }`}
                            style={{ height: ITEM_H, width: 40, opacity, transition: 'opacity 100ms' }}
                        >
                            {label}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const TIME_PRESETS = [
    { label: '9 am', h24: '09:00' },
    { label: '12 pm', h24: '12:00' },
    { label: '6 pm', h24: '18:00' },
];

const TimePickerInput: React.FC<{
    value: string;
    onChange: (value: string) => void;
    isDark: boolean;
}> = ({ value, onChange, isDark }) => {
    const [open, setOpen] = useState(false);
    const [h, m] = (value || '10:00').split(':').map(Number);
    const pad = (n: number) => String(n).padStart(2, '0');

    const isPM = h >= 12;
    const h12 = h % 12 === 0 ? 12 : h % 12;

    const hours12 = Array.from({ length: 12 }, (_, i) => pad(i + 1));
    const minutes15 = ['00', '15', '30', '45'];
    const ampm = ['AM', 'PM'];

    const hourIdx = h12 - 1;
    // snap current minutes to nearest 15-min slot index
    const minIdx = Math.round(m / 15) % 4;
    const ampmIdx = isPM ? 1 : 0;

    const commit = (newH12: number, newMinIdx: number, newPM: boolean) => {
        let h24 = newH12 % 12;
        if (newPM) h24 += 12;
        onChange(`${pad(h24)}:${minutes15[newMinIdx]}`);
    };

    return (
        <div className="relative">
            {/* Trigger */}
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-bold tabular-nums transition-colors cursor-pointer ${
                    open
                        ? isDark ? 'bg-white/10 border-white/20 text-white' : 'bg-slate-100 border-slate-300 text-slate-900'
                        : isDark ? 'bg-white/[0.03] border-[#27273a] text-white hover:bg-white/[0.06]' : 'bg-slate-50 border-slate-200 text-slate-900 hover:bg-slate-100'
                }`}
            >
                <Clock size={13} className={isDark ? 'text-blue-400' : 'text-blue-500'} />
                {pad(h12)}:{minutes15[minIdx]} {isPM ? 'pm' : 'am'}
            </button>

            {/* Full overlay — sits on top of settings panel (z-[80]) */}
            {open && (
                <>
                    {/* Backdrop — closes on click-outside */}
                    <div className="fixed inset-0 z-[75]" onClick={() => setOpen(false)} />
                    <div
                        className={`absolute right-0 bottom-10 z-[80] rounded-2xl border shadow-2xl p-3 w-36 ${
                            isDark ? 'bg-[#0d0d1a] border-[#27273a] shadow-black/70' : 'bg-white border-slate-200 shadow-slate-300/60'
                        }`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <p className={`text-xs font-bold text-center mb-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            Time
                        </p>

                        {/* Drum columns */}
                        <div className="flex items-center justify-center gap-1 mb-4">
                            <DrumColumn
                                items={hours12}
                                selected={hourIdx}
                                onSelect={(i) => commit(i + 1, minIdx, ampmIdx === 1)}
                                isDark={isDark}
                            />
                            <span className={`text-lg font-bold ${isDark ? 'text-gray-500' : 'text-slate-300'}`}>:</span>
                            <DrumColumn
                                items={minutes15}
                                selected={minIdx}
                                onSelect={(i) => commit(h12, i, ampmIdx === 1)}
                                isDark={isDark}
                            />
                            <DrumColumn
                                items={ampm}
                                selected={ampmIdx}
                                onSelect={(i) => commit(h12, minIdx, i === 1)}
                                isDark={isDark}
                            />
                        </div>

                        {/* Divider */}
                        <div className={`border-t mb-3 ${isDark ? 'border-[#27273a]' : 'border-slate-100'}`} />

                        {/* Presets */}
                        <p className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-600' : 'text-slate-400'}`}>
                            Presets
                        </p>
                        <div className="flex gap-1 mb-4">
                            {TIME_PRESETS.map((preset) => {
                                const isActive = value === preset.h24;
                                return (
                                    <button
                                        key={preset.h24}
                                        type="button"
                                        onClick={() => onChange(preset.h24)}
                                        className={`flex-1 py-1 rounded-lg text-[10px] font-semibold border transition-colors cursor-pointer ${
                                            isActive
                                                ? 'bg-blue-500 border-blue-500 text-white'
                                                : isDark
                                                    ? 'bg-white/[0.03] border-[#27273a] text-gray-400 hover:text-white hover:bg-white/[0.06]'
                                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                        }`}
                                    >
                                        {preset.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Done */}
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="w-full py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-sm font-bold transition-colors cursor-pointer"
                        >
                            Done
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

/* Reusable premium card wrapper */
const PremiumCard: React.FC<{
    id?: string;
    isDark: boolean;
    className?: string;
    style?: React.CSSProperties;
    children: React.ReactNode;
}> = ({ id, isDark, className = '', style, children }) => {
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const edgeGradient = `linear-gradient(135deg, ${borderColor}, rgba(255,255,255,0.03) 50%, ${borderColor})`;
    const edgeGradientLight = `linear-gradient(135deg, rgba(0,0,0,0.04), rgba(0,0,0,0.01) 50%, rgba(0,0,0,0.04))`;

    return (
        <div id={id} className={`relative ${className}`} style={style}>
            {/* Edge border */}
            <div
                className="absolute -inset-[1px] rounded-2xl pointer-events-none"
                style={{ background: isDark ? edgeGradient : edgeGradientLight }}
            />
            {/* Card */}
            <div className={`relative rounded-2xl ${
                isDark ? 'bg-[#0a0a14]/80' : 'bg-white'
            }`}>
                {/* Noise */}
                {isDark && (
                    <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
                        backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")',
                    }} />
                )}
                <div className="relative z-10 p-6">
                    {children}
                </div>
            </div>
        </div>
    );
};

const AlertsPage: React.FC<AlertsPageProps> = ({
    theme,
    alerts,
    alertEvents,
    globalAggressiveness,
    onCreateAlert,
    onUpdateAlert,
    onToggleAlert,
    onDeleteAlert,
    onMarkEventRead,
    onMarkAllEventsRead,
    onDismissEvent,
    onChangeGlobalAggressiveness,
    nudgeEnabled,
    nudgeFrequency,
    nudgeTime,
    onNudgeEnabledChange,
    onNudgeFrequencyChange,
    onNudgeTimeChange,
    prefillSymbol,
    emailEnabled = true,
    discordEnabled = false,
    telegramEnabled = false,
    onEmailEnabledChange,
    onDiscordEnabledChange,
    onTelegramEnabledChange,
    userConnections = [],
    onConnectionComplete,
    userId,
}) => {
    const isDark = theme === 'dark';
    const { data: ent } = useEntitlements();
    const entitlements = ent?.entitlements;
    const distinctTickers = new Set(alerts.filter((a) => a.is_active).map((a) => a.symbol.toUpperCase()));
    const atTickerCap = !!(entitlements && distinctTickers.size >= entitlements.maxAlertTickers);

    const [showForm, setShowForm] = useState(false);
    const [editingAlert, setEditingAlert] = useState<Alert | null>(null);
    const [formPrefill, setFormPrefill] = useState<string | null>(prefillSymbol ?? null);
    const [showSettings, setShowSettings] = useState(false);
    const [settingsPos, setSettingsPos] = useState<{ top: number; right: number } | null>(null);
    const gearBtnRef = useRef<HTMLButtonElement>(null);
    // Tutorial state — auto-show on first visit
    const [tutorialActive, setTutorialActive] = useState(() => {
        return localStorage.getItem('remi-alerts-tutorial-done') !== 'true';
    });

    const handleCompleteTutorial = () => {
        setTutorialActive(false);
        localStorage.setItem('remi-alerts-tutorial-done', 'true');
    };

    const handleRestartTutorial = () => {
        setTutorialActive(true);
    };

    // A connection is "usable" only if active AND has a provider_user_id.
    // Pending Telegram rows (linking in progress) have provider_user_id=null
    // and should not count as connected.
    const getConnection = (provider: string) =>
        userConnections.find(c => c.provider === provider && c.status === 'active' && c.provider_user_id !== null);

    const discordConnection = getConnection('discord');
    const telegramConnection = getConnection('telegram');

    const [discordOAuthPending, setDiscordOAuthPending] = useState(false);
    const [discordPopupBlocked, setDiscordPopupBlocked] = useState(false);
    const discordPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [telegramLinkingCode, setTelegramLinkingCode] = useState<string | null>(null);
    const [telegramLinkingPending, setTelegramLinkingPending] = useState(false);
    const telegramPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const telegramTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (discordPollRef.current) clearInterval(discordPollRef.current);
            if (telegramPollRef.current) clearInterval(telegramPollRef.current);
            if (telegramTimeoutRef.current) clearTimeout(telegramTimeoutRef.current);
        };
    }, []);

    const startDiscordOAuth = async () => {
        if (!userId) return;
        setDiscordPopupBlocked(false);
        setDiscordOAuthPending(true);

        // Generate a CSRF-safe state token via edge function
        const { data, error } = await supabase.functions.invoke('oauth-state', {
            body: { provider: 'discord' },
        });
        if (error || !data?.state) {
            console.error('Failed to generate OAuth state:', error);
            setDiscordOAuthPending(false);
            return;
        }

        const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
        const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/discord-oauth-callback`;
        const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify&state=${data.state}`;

        const popup = window.open(url, 'discord-oauth', 'width=500,height=700');
        if (!popup) {
            setDiscordPopupBlocked(true);
            setDiscordOAuthPending(false);
            return;
        }
        // Poll for popup closed, then check DB for successful connection
        discordPollRef.current = setInterval(async () => {
            if (popup.closed) {
                if (discordPollRef.current) clearInterval(discordPollRef.current);
                // Popup closed — check if the OAuth flow actually completed
                const connections = await alertService.loadUserConnections(userId);
                const discord = connections.find(
                    c => c.provider === 'discord' && c.status === 'active' && c.provider_user_id
                );
                if (discord) {
                    onConnectionComplete?.('discord');
                }
                setDiscordOAuthPending(false);
            }
        }, 1000);
    };

    const startTelegramLinking = async () => {
        if (!userId) return;
        if (telegramPollRef.current) clearInterval(telegramPollRef.current);
        if (telegramTimeoutRef.current) clearTimeout(telegramTimeoutRef.current);
        setTelegramLinkingPending(true);

        const linkingCode = crypto.randomUUID();
        setTelegramLinkingCode(linkingCode);

        // Create pending connection row
        await alertService.upsertUserConnection(userId, 'telegram', {
            access_token: linkingCode,
            provider_user_id: null,
            provider_username: null,
            status: 'active',
        });

        // Poll every 3s to check if the bot has activated the connection
        telegramPollRef.current = setInterval(async () => {
            const connections = await alertService.loadUserConnections(userId);
            const tg = connections.find(c => c.provider === 'telegram' && c.provider_user_id);
            if (tg) {
                if (telegramPollRef.current) clearInterval(telegramPollRef.current);
                if (telegramTimeoutRef.current) clearTimeout(telegramTimeoutRef.current);
                setTelegramLinkingPending(false);
                setTelegramLinkingCode(null);
                onConnectionComplete?.('telegram');
            }
        }, 3000);

        // Timeout after 5 minutes
        telegramTimeoutRef.current = setTimeout(() => {
            if (telegramPollRef.current) clearInterval(telegramPollRef.current);
            setTelegramLinkingPending(false);
            // Keep the linking code visible so user can try again
        }, 5 * 60 * 1000);
    };

    // Slider demo animation — runs when tutorial lands on the intensity step
    const demoTimersRef = useRef<number[]>([]);
    const savedAggressivenessRef = useRef<Aggressiveness>(globalAggressiveness);

    const handleTutorialStepEnter = useCallback((_stepIndex: number, targetId: string) => {
        // Clear any previous demo timers
        demoTimersRef.current.forEach(t => clearTimeout(t));
        demoTimersRef.current = [];

        if (targetId !== 'alert-intensity') return;

        // Save current value so we can restore it
        savedAggressivenessRef.current = globalAggressiveness;

        const sequence: Aggressiveness[] = [
            'aggressive', 'default',
        ];
        const delay = 400; // ms between each step

        sequence.forEach((val, i) => {
            const t = window.setTimeout(() => {
                onChangeGlobalAggressiveness(val);
            }, (i + 1) * delay);
            demoTimersRef.current.push(t);
        });

        // Restore original value after the sequence
        const restoreT = window.setTimeout(() => {
            onChangeGlobalAggressiveness(savedAggressivenessRef.current);
        }, (sequence.length + 1) * delay);
        demoTimersRef.current.push(restoreT);
    }, [globalAggressiveness, onChangeGlobalAggressiveness]);

    const handleOpenCreate = (symbol?: string) => {
        setEditingAlert(null);
        setFormPrefill(symbol ?? null);
        setShowForm(true);
    };

    const handleOpenEdit = (alert: Alert) => {
        setEditingAlert(alert);
        setFormPrefill(null);
        setShowForm(true);
    };

    const handleSave = (data: Omit<Alert, 'id' | 'user_id' | 'last_triggered_at' | 'last_score' | 'created_at'>) => {
        if (editingAlert) {
            onUpdateAlert({ ...editingAlert, ...data });
        } else {
            onCreateAlert(data);
        }
        setShowForm(false);
        setEditingAlert(null);
    };

    return (
        <div className="flex-1 p-6 md:p-8 overflow-y-auto animate-in fade-in duration-500 no-scrollbar">
            {/* Header */}
            <header className="mb-8 flex justify-between items-center">
                <h1 className={`text-3xl md:text-4xl font-display font-bold flex flex-col md:flex-row md:items-center gap-1 md:gap-2 transition-colors duration-500 ${
                    isDark ? 'text-white' : 'text-slate-900'
                }`}>
                    <span className={`${isDark ? 'text-gray-500' : 'text-slate-900'} font-light`}>
                        Dashboard /
                    </span>{' '}
                    Alerts
                </h1>
                <div className="relative group">
                    {/* Button glow */}
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-xl opacity-0 group-hover:opacity-30 blur-md transition duration-500" />
                    <button
                        id="alert-new-btn"
                        onClick={() => handleOpenCreate()}
                        disabled={atTickerCap}
                        title={atTickerCap ? 'Upgrade to add more tickers' : ''}
                        className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors ${atTickerCap ? 'bg-slate-500 cursor-not-allowed opacity-60' : 'bg-blue-600 hover:bg-blue-500 cursor-pointer'}`}
                    >
                        <Plus size={16} />
                        New Alert
                    </button>
                </div>
            </header>

            {/* Hero Section — always visible */}
            <div className="mb-5">
                <AlertHero theme={theme} />
            </div>

            {/* Two-column layout: desktop side-by-side, mobile stacked */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
                {/* LEFT COLUMN: Combined "Your Alerts" card */}
                <div className="flex flex-col gap-6">
                    <PremiumCard
                        id="alert-intensity"
                        isDark={isDark}
                        className="animate-fade-in-up"
                        style={{ animationDelay: '200ms', opacity: 0, animationFillMode: 'forwards' }}
                    >
                        {/* Card Header */}
                        <div className="relative flex items-center justify-between mb-4">
                            <span className={`text-base font-display font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                Your Alerts
                            </span>
                            <button
                                ref={gearBtnRef}
                                onClick={() => {
                                    if (gearBtnRef.current) {
                                        const rect = gearBtnRef.current.getBoundingClientRect();
                                        const right = Math.max(8, window.innerWidth - rect.right);
                                        setSettingsPos({ top: rect.bottom + 8, right });
                                    }
                                    setShowSettings(prev => !prev);
                                }}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                                    showSettings
                                        ? isDark ? 'bg-white/10 text-white' : 'bg-slate-200 text-slate-900'
                                        : isDark ? 'hover:bg-white/5 text-gray-500' : 'hover:bg-slate-100 text-slate-900'
                                }`}
                                title="Settings"
                            >
                                <Settings size={16} />
                            </button>

                        </div>

                        {/* Intensity Slider — always visible */}
                        <div className="mb-4">
                            <AggressivenessSlider
                                value={globalAggressiveness}
                                onChange={onChangeGlobalAggressiveness}
                                theme={theme}
                                showPreview={false}
                            />
                        </div>

                        {/* Alert List */}
                        <div id="alert-manage-list">
                            {alerts.length > 0 ? (
                                <AlertManageList
                                    alerts={alerts}
                                    theme={theme}
                                    onToggle={onToggleAlert}
                                    onEdit={handleOpenEdit}
                                    onDelete={onDeleteAlert}
                                    onCreate={() => handleOpenCreate()}
                                />
                            ) : (
                                <div className={`text-center py-8 ${
                                    isDark ? 'text-gray-600' : 'text-slate-900'
                                }`}>
                                    <p className={`text-sm font-display font-medium mb-2 ${
                                        isDark ? 'text-gray-500' : 'text-slate-900'
                                    }`}>No alerts yet</p>
                                    <button
                                        onClick={() => handleOpenCreate()}
                                        className="text-sm font-semibold text-blue-500 hover:text-blue-400 transition-colors cursor-pointer"
                                    >
                                        Create your first alert
                                    </button>
                                </div>
                            )}
                        </div>
                    </PremiumCard>
                </div>

                {/* RIGHT COLUMN: Alert Feed */}
                <PremiumCard
                    id="alert-feed"
                    isDark={isDark}
                    className="lg:sticky lg:top-8 lg:self-start animate-fade-in-up"
                    style={{ animationDelay: '300ms', opacity: 0, animationFillMode: 'forwards' }}
                >
                    <AlertFeed
                        events={alertEvents}
                        theme={theme}
                        onMarkRead={onMarkEventRead}
                        onMarkAllRead={onMarkAllEventsRead}
                        onDismiss={onDismissEvent}
                    />
                </PremiumCard>
            </div>

            {/* Create/Edit Modal */}
            {showForm && (
                <AlertForm
                    theme={theme}
                    onSave={handleSave}
                    onClose={() => { setShowForm(false); setEditingAlert(null); }}
                    editingAlert={editingAlert}
                    prefillSymbol={formPrefill}
                />
            )}

            {/* Tutorial Spotlight Overlay */}
            <AlertTutorial
                theme={theme}
                isActive={tutorialActive}
                onComplete={handleCompleteTutorial}
                onSkip={handleCompleteTutorial}
                onStepEnter={handleTutorialStepEnter}
            />

            {/* Restart Tutorial Button — bottom-right corner */}
            {!tutorialActive && (
                <TutorialRestartButton
                    theme={theme}
                    onClick={handleRestartTutorial}
                />
            )}

            {/* Settings Overlay — rendered at page root to escape scroll container */}
            {showSettings && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowSettings(false)} />
                    <div
                        className={`fixed z-50 w-64 rounded-2xl border shadow-2xl p-4 ${
                            isDark
                                ? 'bg-[#0d0d1a] border-[#27273a] shadow-black/60'
                                : 'bg-white border-slate-200 shadow-slate-200/80'
                        }`}
                        style={{
                            top: settingsPos?.top ?? 0,
                            right: settingsPos?.right ?? 8,
                            maxWidth: 'calc(100vw - 16px)',
                        }}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-slate-900'}`}>
                                Settings
                            </span>
                            <button
                                onClick={() => setShowSettings(false)}
                                className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer ${isDark ? 'hover:bg-white/5 text-gray-500' : 'hover:bg-slate-200 text-slate-900'}`}
                            >
                                <X size={14} />
                            </button>
                        </div>

                        {/* Notification Channels */}
                        <div className="mb-4">
                            <p className={`text-[10px] font-semibold uppercase tracking-wider mb-2.5 ${isDark ? 'text-gray-600' : 'text-slate-400'}`}>
                                Notify via
                            </p>
                            <div className="flex flex-col gap-2">
                                {/* Email */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Mail size={14} className={emailEnabled ? (isDark ? 'text-blue-400' : 'text-blue-600') : (isDark ? 'text-gray-600' : 'text-slate-400')} />
                                        <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-slate-700'}`}>Email</span>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={emailEnabled}
                                        onClick={() => onEmailEnabledChange?.(!emailEnabled)}
                                        className={`relative w-8 h-[18px] rounded-full transition-colors duration-200 cursor-pointer ${emailEnabled ? 'bg-blue-500' : isDark ? 'bg-white/10' : 'bg-slate-300'}`}
                                    >
                                        <span className={`absolute top-[2px] left-[2px] w-3.5 h-3.5 rounded-full bg-white shadow transition-transform duration-200 ${emailEnabled ? 'translate-x-3.5' : 'translate-x-0'}`} />
                                    </button>
                                </div>

                                {/* Discord */}
                                {entitlements?.channels.discord && (<>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className={discordEnabled ? (isDark ? 'text-indigo-400' : 'text-indigo-600') : (isDark ? 'text-gray-600' : 'text-slate-400')}>
                                            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.04.03.05a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                                        </svg>
                                        <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-slate-700'}`}>Discord{discordConnection ? ` · @${discordConnection.provider_username}` : ''}</span>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={discordEnabled}
                                        onClick={() => {
                                            if (discordEnabled) {
                                                onDiscordEnabledChange?.(false);
                                            } else if (discordConnection) {
                                                onDiscordEnabledChange?.(true);
                                            } else {
                                                startDiscordOAuth();
                                            }
                                        }}
                                        className={`relative w-8 h-[18px] rounded-full transition-colors duration-200 cursor-pointer ${discordEnabled ? 'bg-indigo-500' : isDark ? 'bg-white/10' : 'bg-slate-300'}`}
                                    >
                                        <span className={`absolute top-[2px] left-[2px] w-3.5 h-3.5 rounded-full bg-white shadow transition-transform duration-200 ${discordEnabled ? 'translate-x-3.5' : 'translate-x-0'}`} />
                                    </button>
                                </div>
                                {discordPopupBlocked && (
                                    <p className={`text-[10px] mt-1 ${isDark ? 'text-red-400' : 'text-red-500'}`}>
                                        Please allow popups for this site to connect Discord.
                                    </p>
                                )}
                                {discordOAuthPending && (
                                    <p className={`text-[10px] mt-1 ${isDark ? 'text-blue-400' : 'text-blue-500'}`}>
                                        Waiting for Discord authorization...
                                    </p>
                                )}
                                </>
                                )}

                                {/* Telegram */}
                                {entitlements?.channels.telegram && (<>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className={telegramEnabled ? (isDark ? 'text-sky-400' : 'text-sky-600') : (isDark ? 'text-gray-600' : 'text-slate-400')}>
                                            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                                        </svg>
                                        <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-slate-700'}`}>Telegram{telegramConnection ? ` · @${telegramConnection.provider_username}` : ''}</span>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={telegramEnabled}
                                        onClick={() => {
                                            if (telegramEnabled) {
                                                onTelegramEnabledChange?.(false);
                                            } else if (telegramConnection) {
                                                onTelegramEnabledChange?.(true);
                                            } else {
                                                startTelegramLinking();
                                            }
                                        }}
                                        className={`relative w-8 h-[18px] rounded-full transition-colors duration-200 cursor-pointer ${telegramEnabled ? 'bg-sky-500' : isDark ? 'bg-white/10' : 'bg-slate-300'}`}
                                    >
                                        <span className={`absolute top-[2px] left-[2px] w-3.5 h-3.5 rounded-full bg-white shadow transition-transform duration-200 ${telegramEnabled ? 'translate-x-3.5' : 'translate-x-0'}`} />
                                    </button>
                                </div>
                                {telegramLinkingPending && telegramLinkingCode && (
                                    <div className={`mt-2 p-2 rounded-lg text-[11px] ${isDark ? 'bg-white/5' : 'bg-slate-50'}`}>
                                        <p className={`mb-1.5 ${isDark ? 'text-gray-300' : 'text-slate-600'}`}>
                                            Open this link in Telegram:
                                        </p>
                                        <div className="flex items-center gap-1.5">
                                            <a
                                                href={`https://t.me/${import.meta.env.VITE_TELEGRAM_BOT_USERNAME}?start=${telegramLinkingCode}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-sky-400 hover:text-sky-300 underline break-all"
                                            >
                                                t.me/{import.meta.env.VITE_TELEGRAM_BOT_USERNAME}
                                            </a>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(
                                                        `https://t.me/${import.meta.env.VITE_TELEGRAM_BOT_USERNAME}?start=${telegramLinkingCode}`
                                                    );
                                                }}
                                                className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                                                    isDark ? 'bg-white/10 hover:bg-white/15 text-gray-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-600'
                                                }`}
                                            >
                                                Copy
                                            </button>
                                        </div>
                                        <p className={`mt-1.5 ${isDark ? 'text-gray-500' : 'text-slate-400'}`}>
                                            Waiting for connection...
                                        </p>
                                    </div>
                                )}
                                {telegramLinkingCode && !telegramLinkingPending && (
                                    <div className={`mt-2 ${isDark ? 'text-gray-500' : 'text-slate-400'}`}>
                                        <p className="text-[10px]">
                                            Connection timed out.{' '}
                                            <button
                                                type="button"
                                                onClick={startTelegramLinking}
                                                className="text-sky-400 hover:text-sky-300 underline cursor-pointer"
                                            >
                                                Try again
                                            </button>
                                        </p>
                                    </div>
                                )}
                                </>
                                )}
                            </div>
                        </div>

                        <div className={`border-t mb-4 ${isDark ? 'border-[#27273a]' : 'border-slate-200'}`} />

                        {/* Patience Nudge */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <div className="relative flex items-center gap-2 group/nudge">
                                    <span className={`text-xs font-display font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                        Patience Nudge
                                    </span>
                                    {/* Tooltip */}
                                    <div className={`absolute left-0 bottom-full mb-2 w-52 rounded-xl px-3 py-2 text-[11px] leading-snug pointer-events-none opacity-0 group-hover/nudge:opacity-100 transition-opacity duration-150 z-10 shadow-lg ${
                                        isDark ? 'bg-[#1a1a2e] border border-[#27273a] text-gray-300' : 'bg-white border border-slate-200 text-slate-600 shadow-slate-200/60'
                                    }`}>
                                        REMi will send a reminder when the market looks quiet and no strong signal is present.
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={nudgeEnabled}
                                    onClick={() => onNudgeEnabledChange?.(!nudgeEnabled)}
                                    className={`relative w-8 h-[18px] rounded-full transition-colors duration-200 cursor-pointer ${nudgeEnabled ? 'bg-blue-500' : isDark ? 'bg-white/10' : 'bg-slate-300'}`}
                                >
                                    <span className={`absolute top-[2px] left-[2px] w-3.5 h-3.5 rounded-full bg-white shadow transition-transform duration-200 ${nudgeEnabled ? 'translate-x-3.5' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            {nudgeEnabled && (
                                <div className="flex flex-col gap-2">
                                    <div className={`flex w-full rounded-lg border overflow-hidden ${isDark ? 'border-[#27273a]' : 'border-slate-200'}`}>
                                        {NUDGE_FREQUENCY_OPTIONS.map((opt) => (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => onNudgeFrequencyChange?.(opt.value)}
                                                className={`flex-1 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                                                    nudgeFrequency === opt.value
                                                        ? isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-50 text-blue-600'
                                                        : isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-white/5' : 'text-slate-900 hover:bg-slate-50'
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                    <TimePickerInput
                                        value={nudgeTime ?? '10:00'}
                                        onChange={(v) => onNudgeTimeChange?.(v)}
                                        isDark={isDark}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default AlertsPage;
