import React from 'react';
import { Bell, Clock, TrendingUp, TrendingDown, ArrowUp, ArrowDown, Check } from 'lucide-react';
import { AlertEvent } from './types';
import { URGENCY_STYLES, NUDGE_STYLE } from './constants';

interface AlertCardProps {
    event: AlertEvent;
    theme: 'dark' | 'light';
    onMarkRead?: (id: string) => void;
    onDismiss?: (id: string) => void;
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

function formatUTC(dateStr: string): string {
    const d = new Date(dateStr);
    const date = d.toISOString().slice(0, 10);
    const time = d.toISOString().slice(11, 16);
    return `${date} ${time} UTC`;
}

const LED_PULSE_CLASS: Record<string, string> = {
    warning: 'led-pulse-yellow',
    high: 'led-pulse-red',
    critical: 'led-pulse-red',
};

const AlertCard: React.FC<AlertCardProps> = ({ event, theme, onMarkRead, onDismiss: _onDismiss }) => {
    const isDark = theme === 'dark';
    const isNudge = event.event_type === 'patience_nudge';

    // ── Patience Nudge card (calmer visual treatment) ──
    if (isNudge) {
        const ns = NUDGE_STYLE;
        return (
            <div className={`rounded-2xl border px-5 py-4 transition-all duration-300 hover:-translate-y-0.5 ${
                !event.read
                    ? isDark
                        ? `bg-white/[0.02] ${ns.border}`
                        : `bg-white ${ns.lightBorder} shadow-sm`
                    : isDark
                        ? 'bg-white/[0.01] border-[#1e1e2e]'
                        : 'bg-slate-50/50 border-slate-100'
            }`}>
                <div className="flex items-start gap-3.5">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isDark ? ns.bg : ns.lightBg
                    }`}>
                        <Clock size={18} className={isDark ? ns.color : ns.lightColor} />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`text-sm font-display font-bold ${
                                isDark ? 'text-white' : 'text-slate-900'
                            } ${event.read ? 'opacity-60' : ''}`}>
                                {event.symbol === 'WATCHLIST' ? 'Watchlist' : event.symbol}
                            </span>

                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase px-2 py-1 rounded-md ${
                                isDark ? `${ns.bg} ${ns.color}` : `${ns.lightBg} ${ns.lightColor}`
                            }`}>
                                {ns.label}
                            </span>

                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${
                                isDark ? 'bg-white/5 text-gray-500' : 'bg-slate-100 text-slate-900'
                            }`}>
                                Nudge
                            </span>

                            {event.symbol !== 'WATCHLIST' && (
                                <div className="ml-auto">
                                    <span className={`text-lg font-display font-bold ${
                                        isDark ? ns.color : ns.lightColor
                                    } ${event.read ? 'opacity-60' : ''}`}>
                                        {event.score}
                                    </span>
                                </div>
                            )}
                        </div>

                        <p className={`text-sm leading-relaxed mb-2 ${
                            isDark ? 'text-gray-500' : 'text-slate-900'
                        } ${event.read ? 'opacity-60' : ''}`}>
                            {event.message}
                        </p>

                        <div className="flex items-center justify-between">
                            <span className={`text-xs ${isDark ? 'text-gray-600' : 'text-slate-900'}`}>
                                {timeAgo(event.triggered_at)} · {formatUTC(event.triggered_at)}
                            </span>
                            {!event.read && onMarkRead && (
                                <button
                                    onClick={() => onMarkRead(event.id)}
                                    className={`flex items-center gap-1 text-xs font-medium transition-colors cursor-pointer ${
                                        isDark ? 'text-gray-500 hover:text-gray-300' : 'text-slate-900 hover:text-slate-900'
                                    }`}
                                >
                                    <Check size={12} />
                                    Read
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── Standard alert card ──
    const style = URGENCY_STYLES[event.urgency];

    const isLong = event.direction === 'long';
    const DirectionIcon = isLong ? TrendingUp : TrendingDown;
    const ScoreArrow = event.score > event.previous_score ? ArrowUp : ArrowDown;

    const eventTypeLabel = () => {
        switch (event.event_type) {
            case 'trigger': return 'Triggered';
            case 'escalation': return 'Escalated';
            case 'de_escalation': return 'De-escalated';
            case 'all_clear': return 'All Clear';
            case 'patience_nudge': return 'Nudge';
        }
    };

    return (
        <div className={`rounded-2xl border px-5 py-4 transition-all duration-300 hover:-translate-y-0.5 ${
            !event.read
                ? isDark
                    ? `bg-white/[0.03] border-[#27273a] ${style.glow}`
                    : `bg-white border-slate-200 shadow-md`
                : isDark
                    ? 'bg-white/[0.01] border-[#1e1e2e]'
                    : 'bg-slate-50/50 border-slate-100'
        }`}>
            <div className="flex items-start gap-3.5">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    isDark ? style.bg : style.lightBg
                }`}>
                    <Bell size={18} className={isDark ? style.color : style.lightColor} />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm font-display font-bold ${
                            isDark ? 'text-white' : 'text-slate-900'
                        } ${event.read ? 'opacity-60' : ''}`}>
                            {event.symbol}
                        </span>

                        <DirectionIcon size={14} className={isLong ? 'text-green-500' : 'text-red-500'} />

                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase px-2 py-1 rounded-md ${
                            isDark ? `${style.bg} ${style.color}` : `${style.lightBg} ${style.lightColor}`
                        }`}>
                            {!event.read && (
                                <span className={`w-2 h-2 rounded-full ${LED_PULSE_CLASS[event.urgency]} ${
                                    event.urgency === 'warning' ? 'bg-amber-400' :
                                    event.urgency === 'high' ? 'bg-orange-400' : 'bg-red-400'
                                }`} />
                            )}
                            {style.label}
                        </span>

                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${
                            isDark ? 'bg-white/5 text-gray-500' : 'bg-slate-100 text-slate-900'
                        }`}>
                            {eventTypeLabel()}
                        </span>

                        <div className="ml-auto flex items-center gap-1">
                            <ScoreArrow size={12} className={
                                event.score > event.previous_score ? 'text-green-500' : 'text-red-500'
                            } />
                            <span className={`text-xl font-display font-bold ${
                                isDark ? style.color : style.lightColor
                            } ${event.read ? 'opacity-60' : ''}`}>
                                {event.score}
                            </span>
                        </div>
                    </div>

                    <p className={`text-sm leading-relaxed mb-2 ${
                        isDark ? 'text-gray-500' : 'text-slate-900'
                    } ${event.read ? 'opacity-60' : ''}`}>
                        {event.message}
                    </p>

                    <div className="flex items-center justify-between">
                        <span className={`text-xs ${isDark ? 'text-gray-600' : 'text-slate-900'}`}>
                            {timeAgo(event.triggered_at)} · {formatUTC(event.triggered_at)}
                        </span>
                        {!event.read && onMarkRead && (
                            <button
                                onClick={() => onMarkRead(event.id)}
                                className={`flex items-center gap-1 text-xs font-medium transition-colors cursor-pointer ${
                                    isDark ? 'text-gray-500 hover:text-gray-300' : 'text-slate-900 hover:text-slate-900'
                                }`}
                            >
                                <Check size={12} />
                                Read
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AlertCard;
